import React from 'react';
import { LRLayout } from '../../core/lr/lrTable';
import { Language, TRANSLATIONS } from '../../i18n/translations';

interface LRLayoutSwitchProps {
  layout: LRLayout;
  onChange: (layout: LRLayout) => void;
  lang: Language;
}

/** Lecture tables f/g with named states, or the Dragon Book ACTION/GOTO with numbered states. */
export const LRLayoutSwitch: React.FC<LRLayoutSwitchProps> = ({ layout, onChange, lang }) => {
  const t = TRANSLATIONS[lang];
  return (
    <div className="lr-layout-switch">
      <div className="lr-layout-row">
        <span className="lr-layout-label">{t.lrLayoutLabel}:</span>
        <div role="group" aria-label={t.lrLayoutLabel} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['lecture', 'dragon'] as const).map(l => (
            <button
              key={l}
              type="button"
              className={`btn ${layout === l ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '3px 10px', fontSize: '11.5px' }}
              aria-pressed={layout === l}
              onClick={() => onChange(l)}
            >
              {l === 'lecture' ? t.lrLayoutLecture : t.lrLayoutDragon}
            </button>
          ))}
        </div>
      </div>
      <p className="hint-text">{layout === 'lecture' ? t.lrLayoutHintLecture : t.lrLayoutHintDragon}</p>
    </div>
  );
};
