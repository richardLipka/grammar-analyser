import React, { useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, RotateCcw, ChevronsRight } from 'lucide-react';
import { Language, TRANSLATIONS } from '../../i18n/translations';

interface SimulatorControlsProps {
  stepIdx: number;
  total: number;
  isPlaying: boolean;
  speed: number;
  lang: Language;
  onStep: (idx: number) => void;
  onTogglePlay: () => void;
  onSpeed: (ms: number) => void;
}

/** VCR controls shared by the LL and LR simulators (also bound to ← / → keys). */
export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  stepIdx, total, isPlaying, speed, lang, onStep, onTogglePlay, onSpeed
}) => {
  const t = TRANSLATIONS[lang];
  const last = Math.max(0, total - 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.key === 'ArrowRight') onStep(Math.min(last, stepIdx + 1));
      if (e.key === 'ArrowLeft') onStep(Math.max(0, stepIdx - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepIdx, last, onStep]);

  return (
    <div className="simulator-controls" style={{ flexWrap: 'wrap' }}>
      <button className="btn btn-secondary" onClick={() => onStep(0)} title={t.reset}>
        <RotateCcw size={15} />
      </button>
      <button className="btn btn-secondary" onClick={() => onStep(Math.max(0, stepIdx - 1))} disabled={stepIdx === 0} title={`${t.stepBackward} (←)`}>
        <SkipBack size={15} />
      </button>
      <button className="btn btn-primary" onClick={onTogglePlay} title={isPlaying ? t.pause : t.play} disabled={total === 0}>
        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button className="btn btn-secondary" onClick={() => onStep(Math.min(last, stepIdx + 1))} disabled={stepIdx >= last} title={`${t.stepForward} (→)`}>
        <SkipForward size={15} />
      </button>
      <button className="btn btn-secondary" onClick={() => onStep(last)} disabled={stepIdx >= last} title={t.jumpToEnd}>
        <ChevronsRight size={15} />
      </button>

      <span style={{ fontSize: '12px', fontWeight: 600, margin: '0 8px', color: 'var(--color-text-secondary)' }}>
        {t.stepCountLabel.replace('{current}', (Math.min(stepIdx, last) + 1).toString()).replace('{total}', total.toString())}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{t.speed}</span>
        <input
          type="range"
          min="150"
          max="1500"
          step="50"
          value={1650 - speed}
          onChange={(e) => onSpeed(1650 - Number(e.target.value))}
          style={{ width: '90px' }}
          aria-label={t.speed}
        />
      </div>
    </div>
  );
};

/** Auto-play timer shared by the simulators. */
export function useAutoPlay(isPlaying: boolean, stepIdx: number, total: number, speed: number, setStep: (i: number) => void, stop: () => void) {
  useEffect(() => {
    if (!isPlaying) return;
    if (stepIdx >= total - 1) {
      stop();
      return;
    }
    const timer = setTimeout(() => setStep(stepIdx + 1), speed);
    return () => clearTimeout(timer);
  }, [isPlaying, stepIdx, total, speed]);
}
