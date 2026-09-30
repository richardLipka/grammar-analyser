import React, { useState } from 'react';
import { FileText, Copy, Check, Download } from 'lucide-react';
import { Language } from '../../i18n/translations';

export interface LatexExportButtonProps {
  getLatex: () => string;
  filename: string;
  lang?: Language;
  label?: string;
  title?: string;
}

export const LatexExportButton: React.FC<LatexExportButtonProps> = ({
  getLatex,
  filename,
  lang = 'en',
  label = 'LaTeX',
  title
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const code = getLatex();
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy LaTeX code:', err);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const code = getLatex();
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.tex') ? filename : `${filename}.tex`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download LaTeX file:', err);
    }
  };

  const isCz = lang === 'cz';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        verticalAlign: 'middle'
      }}
    >
      <button
        type="button"
        className="btn btn-secondary"
        style={{
          padding: '2px 7px',
          fontSize: '11px',
          height: '24px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: 600
        }}
        title={title || (isCz ? 'Zkopírovat LaTeX do schránky' : 'Copy LaTeX to clipboard')}
        onClick={handleCopy}
      >
        {copied ? (
          <Check size={12} color="var(--color-success)" />
        ) : (
          <FileText size={12} color="var(--color-primary)" />
        )}
        <span>{copied ? (isCz ? 'Zkopírováno!' : 'Copied!') : label}</span>
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        style={{
          padding: '2px 5px',
          fontSize: '11px',
          height: '24px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title={isCz ? 'Stáhnout jako .tex' : 'Download as .tex'}
        onClick={handleDownload}
      >
        <Download size={11} />
      </button>
    </div>
  );
};
