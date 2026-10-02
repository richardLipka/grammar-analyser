import React from 'react';
import { TokenizedInput } from '../../core/parser/inputTokenizer';
import { Language } from '../../i18n/translations';

/** Shows how the simulator input was split into terminals, and what is no terminal. */
export const TokenizedInputNote: React.FC<{ tokenized: TokenizedInput; lang: Language }> = ({ tokenized, lang }) => {
  const cz = lang === 'cz';
  if (!tokenized.split && tokenized.unknown.length === 0) return null;
  return (
    <div className="tokenized-note" role="status">
      {tokenized.split && (
        <div>
          <span>{cz ? 'Vstup rozdělen na terminály (nejdelší shoda): ' : 'Input split into terminals (longest match): '}</span>
          {tokenized.tokens.map((tok, i) => (
            <span key={i} className={`token-chip ${tokenized.unknown.includes(tok) ? 'unknown' : ''}`}>{tok}</span>
          ))}
        </div>
      )}
      {tokenized.unknown.length > 0 && (
        <div className="tokenized-unknown">
          {cz
            ? `Není terminálem gramatiky a nelze rozdělit: ${tokenized.unknown.join(', ')}`
            : `Not a terminal of the grammar and cannot be split: ${tokenized.unknown.join(', ')}`}
        </div>
      )}
    </div>
  );
};
