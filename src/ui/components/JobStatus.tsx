import React from 'react';
import { Loader2, PauseCircle, Play, Square } from 'lucide-react';
import { Language } from '../../i18n/translations';
import { JOB_BUDGET_MS, SteppedJobState } from '../useSteppedJob';

/** Shown only for computations that take noticeably long. */
const SHOW_AFTER_MS = 700;

interface JobStatusProps {
  state: SteppedJobState;
  title: { en: string; cz: string };
  lang: Language;
  onResume: () => void;
  onStop: () => void;
  /** What stopping keeps, e.g. "the parts computed so far" */
  stopHint: { en: string; cz: string };
}

/**
 * Progress of a long computation and, after every JOB_BUDGET_MS of it, the
 * question whether to go on (the computation waits for the answer).
 */
export const JobStatus: React.FC<JobStatusProps> = ({ state, title, lang, onResume, onStop, stopHint }) => {
  const cz = lang === 'cz';
  if (!state.running || (!state.paused && state.elapsedMs < SHOW_AFTER_MS)) return null;
  const seconds = Math.round(state.elapsedMs / 1000);
  const progress = state.progress ? (cz ? state.progress.cz : state.progress.en) : '';
  const budget = Math.round(JOB_BUDGET_MS / 1000);

  if (state.paused) {
    return (
      <div className="job-status paused" role="alertdialog" aria-labelledby="job-status-title" aria-describedby="job-status-text">
        <div className="job-status-head">
          <PauseCircle size={16} />
          <strong id="job-status-title">{cz ? title.cz : title.en}</strong>
        </div>
        <p id="job-status-text">
          {cz
            ? `Výpočet běží už ${seconds} s a je pozastaven${progress ? ` (${progress})` : ''}. Pokračovat dalších ${budget} s?`
            : `The computation has run for ${seconds} s and is paused${progress ? ` (${progress})` : ''}. Continue for another ${budget} s?`}
        </p>
        <p className="job-status-hint">{cz ? stopHint.cz : stopHint.en}</p>
        <div className="job-status-actions">
          <button type="button" className="btn btn-primary" onClick={onResume} autoFocus>
            <Play size={13} />
            <span>{cz ? 'Pokračovat' : 'Continue'}</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={onStop}>
            <Square size={13} />
            <span>{cz ? 'Zastavit' : 'Stop'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="job-status" role="status">
      <div className="job-status-head">
        <Loader2 size={15} className="spin-icon" />
        <strong>{cz ? title.cz : title.en}</strong>
        <span className="job-status-time">{seconds} s</span>
      </div>
      {progress && <p>{progress}</p>}
      <div className="job-status-actions">
        <button type="button" className="btn btn-secondary" onClick={onStop}>
          <Square size={13} />
          <span>{cz ? 'Zastavit' : 'Stop'}</span>
        </button>
      </div>
    </div>
  );
};
