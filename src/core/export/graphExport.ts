/**
 * Graph Exporter: Exports SVG graph elements to standalone SVG files or high-resolution PNG images.
 */

export interface GraphBounds {
  width: number;
  height: number;
}

/** Presentation properties copied from the rendered elements into the export. */
const INLINED_PROPERTIES = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration'
];

/**
 * Creates a standalone, self-contained SVG clone. The computed style of every
 * rendered element (theme colours, outline widths, fonts) is inlined, so the
 * file looks exactly like the screen in any viewer, without the app's CSS.
 */
export function createStandaloneSvg(
  svgElement: SVGSVGElement,
  bounds: GraphBounds,
  contentTransform: string = 'translate(30, 30)'
): SVGSVGElement {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', bounds.width.toString());
  clone.setAttribute('height', bounds.height.toString());
  clone.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  clone.removeAttribute('style');
  clone.removeAttribute('class');

  if (typeof window !== 'undefined') {
    const originals = [svgElement, ...Array.from(svgElement.querySelectorAll('*'))];
    const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
    originals.forEach((orig, idx) => {
      const copy = copies[idx];
      if (!copy || idx === 0) return;
      const cs = getComputedStyle(orig);
      for (const prop of INLINED_PROPERTIES) {
        const val = cs.getPropertyValue(prop);
        if (val) copy.setAttribute(prop, val.trim());
      }
      copy.removeAttribute('class');
    });
  }

  // Reset inner pan/zoom transform so the full graph is framed with margin
  const innerG = clone.querySelector('g[data-viewport]') || clone.querySelector('g[transform]');
  if (innerG) {
    innerG.setAttribute('transform', contentTransform);
  }

  // Background rect so the image is not transparent in dark/light photo viewers
  const computed = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const bgColor = computed?.getPropertyValue('--graph-bg').trim() || computed?.getPropertyValue('--color-bg-surface').trim() || '#ffffff';
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill', bgColor);
  clone.insertBefore(bgRect, clone.firstChild);

  return clone;
}

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Downloads the graph as a standalone .svg vector file.
 */
export function exportSvgFile(
  svgElement: SVGSVGElement,
  filename: string,
  bounds: GraphBounds,
  contentTransform?: string
): void {
  const standalone = createStandaloneSvg(svgElement, bounds, contentTransform);
  const serializer = new XMLSerializer();
  const source = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\r\n' + serializer.serializeToString(standalone);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  download(url, filename.endsWith('.svg') ? filename : `${filename}.svg`);
  URL.revokeObjectURL(url);
}

/**
 * Renders the graph to high-resolution PNG (default 2x scale for sharp retina/print) and downloads it.
 */
export function exportPngFile(
  svgElement: SVGSVGElement,
  filename: string,
  bounds: GraphBounds,
  scale: number = 2,
  contentTransform?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const standalone = createStandaloneSvg(svgElement, bounds, contentTransform);
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(standalone);
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(bounds.width * scale);
          canvas.height = Math.round(bounds.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Canvas 2D context unavailable'));
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((pngBlob) => {
            if (pngBlob) {
              const pngUrl = URL.createObjectURL(pngBlob);
              download(pngUrl, filename.endsWith('.png') ? filename : `${filename}.png`);
              URL.revokeObjectURL(pngUrl);
            }
            URL.revokeObjectURL(url);
            resolve();
          }, 'image/png');
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };

      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG into Image for PNG export: ' + String(e)));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}
