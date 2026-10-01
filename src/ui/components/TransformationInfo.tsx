import React, { useEffect, useRef } from 'react';
import { Info, X, ExternalLink } from 'lucide-react';
import { InfoKey, REFERENCES, TRANSFORMATION_INFO } from '../../core/processor/transformationInfo';
import { Language, TRANSLATIONS } from '../../i18n/translations';

/** Small ⓘ button that opens the description and literature of a transformation. */
export const InfoButton: React.FC<{ onClick: () => void; lang: Language }> = ({ onClick, lang }) => {
  const t = TRANSLATIONS[lang];
  return (
    <button
      type="button"
      className="info-button"
      title={t.infoButtonTitle}
      aria-label={t.infoButtonTitle}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Info size={14} />
    </button>
  );
};

interface DialogProps {
  infoKey: InfoKey | 'all' | null;
  onClose: () => void;
  onShowAll: () => void;
  lang: Language;
}

/** Description of one transformation (or of all of them) with the publications that describe it. */
export const TransformationInfoDialog: React.FC<DialogProps> = ({ infoKey, onClose, onShowAll, lang }) => {
  const t = TRANSLATIONS[lang];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!infoKey) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [infoKey]);

  if (!infoKey) return null;
  const keys = infoKey === 'all' ? (Object.keys(TRANSFORMATION_INFO) as InfoKey[]) : [infoKey];
  const pick = (b: { en: string; cz: string }) => (lang === 'cz' ? b.cz : b.en);
  const title = infoKey === 'all' ? t.infoAllTitle : pick(TRANSFORMATION_INFO[infoKey].title);

  return (
    <div className="info-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title">
        <div className="info-dialog-head">
          <h2 id="info-dialog-title">{title}</h2>
          <button ref={closeRef} type="button" className="btn-icon" onClick={onClose} title={t.close} aria-label={t.close}>
            <X size={16} />
          </button>
        </div>
        <div className="info-dialog-body">
          {keys.map(key => {
            const info = TRANSFORMATION_INFO[key];
            return (
              <section key={key} className="info-entry">
                {infoKey === 'all' && <h3>{pick(info.title)}</h3>}
                <div className="info-scheme">{typeof info.scheme === 'string' ? info.scheme : pick(info.scheme)}</div>
                <dl>
                  <dt>{t.infoWhat}</dt>
                  <dd>{pick(info.what)}</dd>
                  <dt>{t.infoWhy}</dt>
                  <dd>{pick(info.why)}</dd>
                  <dt>{t.infoUse}</dt>
                  <dd>{pick(info.use)}</dd>
                  <dt>{t.infoRefs}</dt>
                  <dd>
                    <ul className="info-refs">
                      {info.refs.map((r, i) => {
                        const ref = REFERENCES[r.ref];
                        return (
                          <li key={i}>
                            {ref.citation} <em>— {pick(r.where)}</em>
                            {ref.url && (
                              <>
                                {' '}
                                <a href={ref.url} target="_blank" rel="noopener noreferrer">
                                  {t.infoOpenSource} <ExternalLink size={11} />
                                </a>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                </dl>
              </section>
            );
          })}
          {infoKey === 'all' && (
            <section className="info-entry">
              <h3>{t.infoBibliography}</h3>
              <ul className="info-refs">
                {Object.values(REFERENCES).map((ref, i) => (
                  <li key={i}>
                    {ref.citation}
                    {ref.url && (
                      <>
                        {' '}
                        <a href={ref.url} target="_blank" rel="noopener noreferrer">
                          {t.infoOpenSource} <ExternalLink size={11} />
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {infoKey !== 'all' && (
          <div className="info-dialog-foot">
            <button type="button" className="link-button" onClick={onShowAll}>{t.infoAllButton}</button>
          </div>
        )}
      </div>
    </div>
  );
};
