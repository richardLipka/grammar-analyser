import { useCallback, useEffect, useRef, useState } from 'react';
import { Job, JobControl, JobProgress } from '../core/jobs/job';

/** Computation time after which the user is asked whether to go on. */
export const JOB_BUDGET_MS = 30000;
/** Length of one slice; the page stays responsive between slices. */
const SLICE_MS = 40;
/** How often the progress shown is updated. */
const PROGRESS_MS = 250;

export interface SteppedJobState {
  running: boolean;
  /** The time budget is used up and the job waits for the user */
  paused: boolean;
  progress?: JobProgress;
  /** Computation time so far (without the pauses) */
  elapsedMs: number;
}

interface Running<T> {
  job: Job<T>;
  control: JobControl;
  onDone: (value: T, info: { elapsedMs: number; stopped: boolean }) => void;
  budgetUsed: number;
  total: number;
  progress?: JobProgress;
  lastReport: number;
  timer?: number;
}

/**
 * Runs a job (a generator, see core/jobs/job.ts) in slices of a few
 * milliseconds. After JOB_BUDGET_MS of computation it pauses and waits:
 * resume() gives it another budget, stop() lets it return what it has.
 * Starting another job drops the running one without a result.
 */
export function useSteppedJob() {
  const [state, setState] = useState<SteppedJobState>({ running: false, paused: false, elapsedMs: 0 });
  const current = useRef<Running<unknown> | null>(null);

  const finish = (run: Running<unknown>, value: unknown, stopped: boolean) => {
    if (run.timer !== undefined) window.clearTimeout(run.timer);
    if (current.current === run) current.current = null;
    setState({ running: false, paused: false, elapsedMs: run.total });
    run.onDone(value, { elapsedMs: run.total, stopped });
  };

  const step = useCallback((run: Running<unknown>) => {
    if (current.current !== run) return;
    run.timer = undefined;
    const start = performance.now();
    try {
      while (performance.now() - start < SLICE_MS) {
        const r = run.job.next();
        if (r.done) {
          run.total += performance.now() - start;
          finish(run, r.value, run.control.stop);
          return;
        }
        if (r.value) run.progress = r.value;
      }
    } catch (err) {
      console.error('Computation failed:', err);
      run.total += performance.now() - start;
      finish(run, null, true);
      return;
    }
    const spent = performance.now() - start;
    run.budgetUsed += spent;
    run.total += spent;
    if (run.budgetUsed >= JOB_BUDGET_MS) {
      setState({ running: true, paused: true, progress: run.progress, elapsedMs: run.total });
      return;
    }
    if (run.total - run.lastReport >= PROGRESS_MS) {
      run.lastReport = run.total;
      setState({ running: true, paused: false, progress: run.progress, elapsedMs: run.total });
    }
    run.timer = window.setTimeout(() => step(run), 0);
  }, []);

  /** Starts a job (possibly already advanced, see runForAWhile); the first slice runs at once. */
  const start = useCallback(<T,>(
    job: Job<T>,
    control: JobControl,
    onDone: (value: T, info: { elapsedMs: number; stopped: boolean }) => void,
    elapsedMs = 0
  ) => {
    const previous = current.current;
    if (previous) {
      previous.control.stop = true;
      if (previous.timer !== undefined) window.clearTimeout(previous.timer);
    }
    const run: Running<T> = { job, control, onDone, budgetUsed: elapsedMs, total: elapsedMs, lastReport: 0 };
    current.current = run as Running<unknown>;
    setState({ running: true, paused: false, elapsedMs });
    step(run as Running<unknown>);
  }, [step]);

  /** Another time budget for a paused job. */
  const resume = useCallback(() => {
    const run = current.current;
    if (!run) return;
    run.budgetUsed = 0;
    setState({ running: true, paused: false, progress: run.progress, elapsedMs: run.total });
    step(run);
  }, [step]);

  /** Stops the job: it returns what it has at its next yield. */
  const stop = useCallback(() => {
    const run = current.current;
    if (!run) return;
    run.control.stop = true;
    if (run.timer !== undefined) window.clearTimeout(run.timer);
    let value: unknown = null;
    try {
      for (;;) {
        const r = run.job.next();
        if (r.done) {
          value = r.value;
          break;
        }
      }
    } catch (err) {
      console.error('Computation failed:', err);
    }
    finish(run, value, true);
  }, []);

  useEffect(() => () => {
    const run = current.current;
    if (run?.timer !== undefined) window.clearTimeout(run.timer);
  }, []);

  return { state, start, resume, stop };
}

/**
 * Runs a job synchronously for at most `ms` milliseconds (e.g. the first
 * analysis before the page is shown). Returns the result, or the job to be
 * continued with its computation time so far.
 */
export function runForAWhile<T>(job: Job<T>, ms: number): { done: true; value: T; elapsedMs: number } | { done: false; elapsedMs: number } {
  const start = performance.now();
  while (performance.now() - start < ms) {
    const r = job.next();
    if (r.done) return { done: true, value: r.value, elapsedMs: performance.now() - start };
  }
  return { done: false, elapsedMs: performance.now() - start };
}
