/**
 * Shared ReferenceBar Component.
 *
 * Renders primary literature citations and DOI links across views
 * with unified academic styling.
 */

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Language } from '../../i18n/translations';

export interface ReferenceItem {
  authorYear: string;
  citation: string;
  url?: string;
  sections?: string;
  topicCz?: string;
  topicEn?: string;
}

export interface ReferenceBarProps {
  references: ReferenceItem[];
  lang?: Language;
  extraRight?: React.ReactNode;
  label?: string;
}

export const ReferenceBar: React.FC<ReferenceBarProps> = ({
  references,
  lang = 'en',
  extraRight,
  label
}) => {
  const isCz = lang === 'cz';
  const displayLabel = label ?? (isCz ? 'Primární literatura:' : 'Primary literature:');

  return (
    <div
      style={{
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px solid var(--color-border)',
        fontSize: '12px',
        color: 'var(--color-text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px'
      }}
    >
      <div>
        <span style={{ fontWeight: 600, marginRight: '6px' }}>{displayLabel}</span>
        {references.map((ref, i) => (
          <span key={i} style={{ marginRight: '14px', display: 'inline-block' }}>
            {ref.url ? (
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                title={ref.sections ? `${ref.citation}\nRelevant sections: ${ref.sections}` : ref.citation}
                style={{
                  color: 'var(--color-primary)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <strong>{ref.authorYear}</strong>
                {(ref.topicCz || ref.topicEn) && (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginLeft: '2px' }}>
                    ({isCz ? (ref.topicCz ?? ref.topicEn) : (ref.topicEn ?? ref.topicCz)})
                  </span>
                )}
                <ExternalLink size={10} />
              </a>
            ) : (
              <span title={ref.citation}>
                <strong>{ref.authorYear}</strong>
                {(ref.topicCz || ref.topicEn) && (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginLeft: '2px' }}>
                    ({isCz ? (ref.topicCz ?? ref.topicEn) : (ref.topicEn ?? ref.topicCz)})
                  </span>
                )}
              </span>
            )}
          </span>
        ))}
      </div>

      {extraRight && <div>{extraRight}</div>}
    </div>
  );
};
