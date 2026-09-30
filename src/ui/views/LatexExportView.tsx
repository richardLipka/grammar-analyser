import React, { useState } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { LRTable } from '../../core/lr/lrTable';
import {
  exportGrammarToLatex,
  exportSetsToLatex,
  exportLLTableToLatex,
  exportLRTableToLatex
} from '../../core/export/latexExport';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { FileText, Copy, Check, Download } from 'lucide-react';

interface LatexExportViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  slr1Table: LRTable;
  lang: Language;
}

type LatexSection = 'all' | 'grammar' | 'sets' | 'llTable' | 'lrTable';

export const LatexExportView: React.FC<LatexExportViewProps> = ({
  grammar,
  analysis,
  llTable,
  slr1Table,
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [section, setSection] = useState<LatexSection>('all');
  const [copied, setCopied] = useState(false);

  const getLatex = (): string => {
    switch (section) {
      case 'grammar':
        return exportGrammarToLatex(grammar);
      case 'sets':
        return exportSetsToLatex(grammar, analysis, lang);
      case 'llTable':
        return exportLLTableToLatex(llTable, lang);
      case 'lrTable':
        return exportLRTableToLatex(slr1Table, lang);
      case 'all':
        return [
          '% ==========================================',
          '% GrammarAnalyser LaTeX Document Export',
          '% Ready to compile with pdflatex / xelatex',
          '% ==========================================\n',
          '\\documentclass{article}',
          '\\usepackage[utf8]{inputenc}',
          '\\usepackage{amsmath, amssymb}',
          '\\usepackage{multirow}',
          '\\usepackage{forest}',
          '\\begin{document}\n',
          `\\section*{${lang === 'cz' ? 'Analýza formální gramatiky' : 'Formal Grammar Analysis'}}\n`,
          exportGrammarToLatex(grammar),
          '\n\\vspace{1em}\n',
          exportSetsToLatex(grammar, analysis, lang),
          '\n\\vspace{1em}\n',
          exportLLTableToLatex(llTable, lang),
          '\n\\vspace{1em}\n',
          exportLRTableToLatex(slr1Table, lang),
          '\n\\end{document}'
        ].join('\n');
    }
  };

  const latexCode = getLatex();

  const handleCopy = () => {
    navigator.clipboard.writeText(latexCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([latexCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grammar_analysis_${section}.tex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">
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

        {/* Section Selectors */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
          <button
            className={`btn ${section === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px' }}
            onClick={() => setSection('all')}
          >
            {t.completeArticle}
          </button>
          <button
            className={`btn ${section === 'grammar' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px' }}
            onClick={() => setSection('grammar')}
          >
            {t.grammarAlign}
          </button>
          <button
            className={`btn ${section === 'sets' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px' }}
            onClick={() => setSection('sets')}
          >
            {t.firstFollowTable}
          </button>
          <button
            className={`btn ${section === 'llTable' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px' }}
            onClick={() => setSection('llTable')}
          >
            {t.llTableTab}
          </button>
          <button
            className={`btn ${section === 'lrTable' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px' }}
            onClick={() => setSection('lrTable')}
          >
            {t.slrTableTab}
          </button>
        </div>

        {/* LaTeX Code Display */}
        <pre style={{
          backgroundColor: 'var(--color-bg-base)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
          lineHeight: '1.6',
          overflowX: 'auto',
          border: '1px solid var(--color-border)',
          maxHeight: '480px'
        }}>
          {latexCode}
        </pre>
      </div>
    </div>
  );
};
