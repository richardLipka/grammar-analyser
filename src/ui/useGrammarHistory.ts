import { useRef, useState } from 'react';
import { TransformationStep } from '../core/processor/grammarProcessor';

/** One state of the grammar text and how it was reached. */
export interface HistoryEntry {
  text: string;
  kind: 'initial' | 'edit' | 'preset' | 'transform';
  /** The transformation, or the name of the loaded example */
  titleEn?: string;
  titleCz?: string;
  /** Explanation of a transformation */
  steps?: TransformationStep[];
}

interface HistoryState {
  entries: HistoryEntry[];
  index: number;
}

/**
 * Undo/redo history of the grammar text. Kept in a ref so that several
 * commits in one event handler see each other; a counter re-renders.
 */
export function useGrammarHistory(initialText: string) {
  const ref = useRef<HistoryState>({ entries: [{ text: initialText, kind: 'initial' }], index: 0 });
  const [, setVersion] = useState(0);
  const update = (next: HistoryState) => {
    ref.current = next;
    setVersion(v => v + 1);
  };

  /** Adds a state after the current one; the states that could be redone are dropped. */
  const commit = (entry: HistoryEntry) => {
    const { entries, index } = ref.current;
    if (entry.kind === 'edit' && entries[index].text === entry.text) return;
    update({ entries: [...entries.slice(0, index + 1), entry], index: index + 1 });
  };

  /** Moves to a state (undo, redo, or a jump in the protocol) and returns it. */
  const goTo = (i: number): HistoryEntry | undefined => {
    const { entries } = ref.current;
    if (i < 0 || i >= entries.length) return undefined;
    update({ entries, index: i });
    return entries[i];
  };

  return {
    entries: ref.current.entries,
    index: ref.current.index,
    get: () => ref.current,
    commit,
    goTo
  };
}
