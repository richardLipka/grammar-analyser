/**
 * Shared Toolbar for SVG Graph & Tree Visualizers.
 *
 * Provides zoom-in, zoom-out, fit-to-view, vector SVG download,
 * and high-resolution PNG download controls with consistent styling.
 */

import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download, Image as ImageIcon } from 'lucide-react';
import { Language } from '../../i18n/translations';

export interface GraphToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onExportSvg?: () => void;
  onExportPng?: () => void;
  isExportingPng?: boolean;
  extraButtons?: React.ReactNode;
  titleFit?: string;
  titleSvg?: string;
  titlePng?: string;
  lang?: Language;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
  onZoomIn,
  onZoomOut,
  onFit,
  onExportSvg,
  onExportPng,
  isExportingPng = false,
  extraButtons,
  titleFit,
  titleSvg,
  titlePng,
  lang = 'en'
}) => {
  const isCz = lang === 'cz';

  const defaultFitTitle = titleFit ?? (isCz ? 'Zobrazit celý diagram' : 'Fit whole diagram');
  const defaultSvgTitle = titleSvg ?? (isCz ? 'Exportovat diagram jako vektorový SVG' : 'Export diagram as vector SVG');
  const defaultPngTitle = titlePng ?? (isCz ? 'Exportovat diagram jako PNG (vysoké rozlišení)' : 'Export diagram as high-res PNG');

  return (
    <div className="graph-toolbar">
      <button
        type="button"
        className="btn-icon"
        title={isCz ? 'Přiblížit' : 'Zoom in'}
        onClick={onZoomIn}
        aria-label={isCz ? 'Přiblížit' : 'Zoom in'}
      >
        <ZoomIn size={16} />
      </button>

      <button
        type="button"
        className="btn-icon"
        title={isCz ? 'Oddálit' : 'Zoom out'}
        onClick={onZoomOut}
        aria-label={isCz ? 'Oddálit' : 'Zoom out'}
      >
        <ZoomOut size={16} />
      </button>

      <button
        type="button"
        className="btn-icon"
        title={defaultFitTitle}
        onClick={onFit}
        aria-label={defaultFitTitle}
      >
        <Maximize2 size={16} />
      </button>

      {extraButtons}

      {(onExportSvg || onExportPng) && (
        <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--color-border)', margin: '0 2px' }} />
      )}

      {onExportSvg && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 7px', fontSize: '11px', height: '26px', gap: '4px' }}
          title={defaultSvgTitle}
          onClick={onExportSvg}
        >
          <Download size={12} />
          <span>SVG</span>
        </button>
      )}

      {onExportPng && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 7px', fontSize: '11px', height: '26px', gap: '4px' }}
          title={defaultPngTitle}
          onClick={onExportPng}
          disabled={isExportingPng}
        >
          <ImageIcon size={12} />
          <span>{isExportingPng ? '...' : 'PNG'}</span>
        </button>
      )}
    </div>
  );
};
