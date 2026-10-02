/**
 * Long computations as resumable jobs.
 *
 * A job is a generator that yields now and then (a progress note or nothing)
 * and returns its result. Run synchronously it is an ordinary function
 * (`runJob`); the UI runs it in short slices so the page stays responsive, and
 * after a time budget asks the user whether to go on (see useSteppedJob).
 * A job stops early when `control.stop` is set: at its next yield it returns
 * what it has (a partial result or null), so nothing is thrown away silently.
 */

export interface JobProgress {
  en: string;
  cz: string;
}

export interface JobControl {
  /** Set by the runner; the job returns at its next yield. */
  stop: boolean;
}

export type Job<T> = Generator<JobProgress | undefined, T, void>;

/** A control that never stops (synchronous use, tests). */
export const runToEnd = (): JobControl => ({ stop: false });

/** Runs a job to its end synchronously. */
export function runJob<T>(job: Job<T>): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/**
 * Yields (with an optional progress note) only every `every` calls, so tight
 * loops can call it on each iteration without slowing down.
 */
export function ticker(every: number) {
  let n = 0;
  return () => ++n % every === 0;
}
