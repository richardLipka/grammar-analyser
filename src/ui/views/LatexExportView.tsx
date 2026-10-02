import React, { useState } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { LRTable, LRLayout } from '../../core/lr/lrTable';
import {
  exportGrammarToLatex,
  exportSetsToLatex,
  exportLLTableToLatex,
  exportLRTableToLatex
} from '../../core/export/latexExport';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { FileText, Copy, Check, Download } from 'lucide-react';

type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

interface LatexExportViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  /** LR(1) is missing when the computation was stopped */
  lrTables: Record<Exclude<LRVariantName, 'LR(1)'>, LRTable> & { 'LR(1)'?: LRTable };
  lang: Language;
  lrLayout: LRLayout;
  onLrLayoutChange: (layout: LRLayout) => void;
}

type LatexSection = 'all' | 'grammar' | 'sets' | 'llTable' | 'lrTable';

export const LatexExportView: React.FC<LatexExportViewProps> = ({ grammar, analysis, llTable, lrTables, lang, lrLayout, onLrLayoutChange }) => {
  const t = TRANSLATIONS[lang];
  const [section, setSection] = useState<LatexSection>('all');
  const [lrVariant, setLrVariant] = useState<LRVariantName>('SLR(1)');
  const [copied, setCopied] = useState(false);
  const lrTable = lrTables[lrVariant] ?? lrTables['LALR(1)'];

  const getLatex = (): string => {
    switch (section) {
      case 'grammar':
        return exportGrammarToLatex(grammar);
      case 'sets':
        return exportSetsToLatex(grammar, analysis, lang);
      case 'llTable':
        return exportLLTableToLatex(llTable, lang, grammar);
      case 'lrTable':
        return exportLRTableToLatex(lrTable, lang, lrLayout);
      case 'all':
        return [
          '% ==========================================',
          '% GrammarAnalyser LaTeX Document Export',
          '% Ready to compile with pdflatex / xelatex',
          '% ==========================================\n',
          '\\documentclass{article}',
          '\\usepackage[utf8]{inputenc}',
          '\\usepackage[T1]{fontenc}',
          '\\usepackage{amsmath, amssymb}',
          '\\usepackage{multirow}',
          '\\usepackage{forest}',
          '\\begin{document}\n',
          `\\section*{${lang === 'cz' ? 'Analýza formální gramatiky' : 'Formal Grammar Analysis'}}\n`,
          exportGrammarToLatex(grammar),
          '\n\\vspace{1em}\n',
          exportSetsToLatex(grammar, analysis, lang),
          '\n\\vspace{1em}\n',
          exportLLTableToLatex(llTable, lang, grammar),
          '\n\\vspace{1em}\n',
          exportLRTableToLatex(lrTable, lang, lrLayout),
          '\n\\end{document}'
        ].join('\n');
    }
  };

  const latexCode = getLatex();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latexCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([latexCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grammar_analysis_${section}.tex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sections: { id: LatexSection; label: string }[] = [
    { id: 'all', label: t.completeArticle },
    { id: 'grammar', label: t.grammarAlign },
    { id: 'sets', label: t.firstFollowTable },
    { id: 'llTable', label: t.llTableTab },
    { id: 'lrTable', label: t.lrTableTab }
  ];

  return (
    <div>
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--color-primary)" />
            <span>{t.tabLatex}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={handleDownload}>
              <Download size={15} />
              {t.downloadTex}
            </button>
            <button className="btn btn-primary" onClick={handleCopy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? t.copied : t.copyClipboard}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {sections.map(s => (
            <button
              key={s.id}
              className={`btn ${section === s.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px' }}
              aria-pressed={section === s.id}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {(section === 'all' || section === 'lrTable') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span className="hint-text">{t.lrTableVariant}</span>
            {(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)'] as const).map(v => (
              <button
                key={v}
                className={`btn ${lrVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '11px', padding: '3px 8px' }}
                aria-pressed={lrVariant === v}
                onClick={() => setLrVariant(v)}
                disabled={!lrTables[v]}
                title={lrTables[v] ? undefined : (lang === 'cz' ? 'Nespočteno – výpočet byl zastaven' : 'Not computed – the computation was stopped')}
              >
                {v}
              </button>
            ))}
            <span style={{ width: '1px', height: '18px', backgroundColor: 'var(--color-border)', margin: '0 4px' }} />
            {(['lecture', 'dragon'] as const).map(l => (
              <button
                key={l}
                className={`btn ${lrLayout === l ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '11px', padding: '3px 8px' }}
                aria-pressed={lrLayout === l}
                onClick={() => onLrLayoutChange(l)}
              >
                {l === 'lecture' ? t.lrLayoutLecture : t.lrLayoutDragon}
              </button>
            ))}
          </div>
        )}

        <pre style={{
          backgroundColor: 'var(--color-bg-base)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
          lineHeight: '1.6',
          overflow: 'auto',
          border: '1px solid var(--color-border)',
          maxHeight: '480px'
        }}>
          {latexCode}
        </pre>
      </div>
    </div>
  );
};
