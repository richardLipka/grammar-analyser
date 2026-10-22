import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, SkipForward, SkipBack, RotateCcw, ChevronsRight, LocateFixed } from 'lucide-react';
import { Language, TRANSLATIONS } from '../../i18n/translations';

/** Id of the bar at the bottom of the analysis pane that holds the step controls (App.tsx). */
export const SIM_DOCK_ID = 'sim-dock';

interface SimulatorControlsProps {
  stepIdx: number;
  total: number;
  isPlaying: boolean;
  speed: number;
  lang: Language;
  onStep: (idx: number) => void;
  onTogglePlay: () => void;
  onSpeed: (ms: number) => void;
  /** Which simulator the controls drive, shown in the bar at the bottom (e.g. "LL(1)", "CYK"). */
  label?: string;
  /** false: keep the controls where they are written instead of the bar at the bottom. */
  docked?: boolean;
}

/**
 * VCR controls shared by all step simulators (also bound to ← / → keys). They float in the
 * bar at the bottom of the analysis pane, so they stay at hand however far the step, the
 * table or the tree are scrolled; a button scrolls back to the simulator they belong to.
 */
export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  stepIdx, total, isPlaying, speed, lang, onStep, onTogglePlay, onSpeed, label, docked = true
}) => {
  const t = TRANSLATIONS[lang];
  const cz = lang === 'cz';
  const last = Math.max(0, total - 1);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (docked) setDock(document.getElementById(SIM_DOCK_ID));
  }, [docked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.key === 'ArrowRight') onStep(Math.min(last, stepIdx + 1));
      if (e.key === 'ArrowLeft') onStep(Math.max(0, stepIdx - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepIdx, last, onStep]);

  const inDock = docked && dock !== null;
  const controls = (
    <div className={`simulator-controls ${inDock ? 'in-dock' : ''}`} style={{ flexWrap: 'wrap' }} role="toolbar" aria-label={cz ? 'Krokování' : 'Step controls'}>
      {inDock && (
        <button
          type="button"
          className="btn btn-secondary sim-dock-locate"
          onClick={() => anchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          title={cz ? 'Přejít na simulaci' : 'Go to the simulation'}
        >
          <LocateFixed size={15} />
          {label && <span>{label}</span>}
        </button>
      )}
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
      {total > 1 && (
        <input
          type="range"
          className="sim-progress"
          min={0}
          max={last}
          value={Math.min(stepIdx, last)}
          onChange={e => onStep(Number(e.target.value))}
          aria-label={cz ? 'Krok' : 'Step'}
          title={cz ? 'Přejít na krok' : 'Go to step'}
        />
      )}

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

  return (
    <>
      <span ref={anchorRef} className="sim-dock-anchor" aria-hidden="true" />
      {inDock ? createPortal(controls, dock!) : controls}
    </>
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
