/**
 * The splitter between the grammar panel and the analysis: drag it to make the grammar
 * panel wider or narrower; dragging it far to the left, a double-click, Enter or the button
 * collapses the panel, and the same expands it again. Arrow keys move it.
 */
import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Language } from '../../i18n/translations';

export const LEFT_PANE_MIN = 240;
/** Narrower than this when dragged: the panel collapses. */
export const LEFT_PANE_SNAP = 140;
export const leftPaneMax = () => Math.max(LEFT_PANE_MIN, Math.round(window.innerWidth * 0.7));
export const clampLeftPane = (w: number) => Math.min(leftPaneMax(), Math.max(LEFT_PANE_MIN, Math.round(w)));

interface PaneSplitterProps {
  width: number;
  collapsed: boolean;
  /** The width while dragging (the panel is expanded if it was collapsed). */
  onWidth: (width: number) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Called when a drag ends, to remember the width. */
  onCommit?: () => void;
  lang: Language;
}

export const PaneSplitter: React.FC<PaneSplitterProps> = ({ width, collapsed, onWidth, onCollapsedChange, onCommit, lang }) => {
  const cz = lang === 'cz';
  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const layout = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragging.current = false;
    const startX = e.clientX;
    document.body.classList.add('pane-resizing');
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current && Math.abs(ev.clientX - startX) < 3) return;
      dragging.current = true;
      const w = ev.clientX - layout.left;
      if (w < LEFT_PANE_SNAP) {
        onCollapsedChange(true);
      } else {
        if (collapsedRef.current) onCollapsedChange(false);
        onWidth(clampLeftPane(w));
      }
    };
    const onUp = () => {
      document.body.classList.remove('pane-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging.current) onCommit?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  // The latest collapsed state inside the drag handlers
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 80 : 24;
      if (collapsed) {
        if (e.key === 'ArrowRight') onCollapsedChange(false);
      } else {
        const w = width + (e.key === 'ArrowRight' ? step : -step);
        if (w < LEFT_PANE_MIN) onCollapsedChange(true);
        else onWidth(clampLeftPane(w));
      }
      onCommit?.();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCollapsedChange(!collapsed);
      onCommit?.();
    }
  };

  const title = collapsed
    ? (cz ? 'Rozbalit panel gramatiky (tažením nastavíte šířku)' : 'Expand the grammar panel (drag to set its width)')
    : (cz ? 'Tažením změníte šířku panelu gramatiky; dvojklik nebo tlačítko jej sbalí' : 'Drag to change the width of the grammar panel; double-click or the button collapses it');

  return (
    <div
      className={`pane-splitter ${collapsed ? 'collapsed' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={cz ? 'Šířka panelu gramatiky' : 'Width of the grammar panel'}
      aria-valuemin={0}
      aria-valuemax={leftPaneMax()}
      aria-valuenow={collapsed ? 0 : width}
      tabIndex={0}
      title={title}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        onCollapsedChange(!collapsed);
        onCommit?.();
      }}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="pane-splitter-btn"
        onClick={() => {
          onCollapsedChange(!collapsed);
          onCommit?.();
        }}
        title={collapsed ? (cz ? 'Rozbalit panel gramatiky' : 'Expand the grammar panel') : (cz ? 'Sbalit panel gramatiky' : 'Collapse the grammar panel')}
        aria-label={collapsed ? (cz ? 'Rozbalit panel gramatiky' : 'Expand the grammar panel') : (cz ? 'Sbalit panel gramatiky' : 'Collapse the grammar panel')}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      {collapsed && <span className="pane-splitter-label">{cz ? 'Gramatika' : 'Grammar'}</span>}
    </div>
  );
};
