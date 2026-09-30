/**
 * Graph Exporter: Exports SVG graph elements to standalone SVG files or high-resolution PNG images.
 */

export interface GraphBounds {
  width: number;
  height: number;
}

/**
 * Creates a standalone, self-contained SVG clone with resolved colors,
 * embedded styles, and normalized viewBox capturing the complete graph layout.
 */
export function createStandaloneSvg(
  svgElement: SVGSVGElement,
  bounds: GraphBounds
): SVGSVGElement {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', bounds.width.toString());
  clone.setAttribute('height', bounds.height.toString());
  clone.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);

  // Reset inner pan/zoom transform so the full graph is framed with margin
  const innerG = clone.querySelector('g[transform]');
  if (innerG) {
    innerG.setAttribute('transform', 'translate(30, 30)');
  }

  // Get current computed theme colors from document
  const computed = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const bgColor = computed?.getPropertyValue('--color-bg-surface').trim() || '#ffffff';

  // Add background rect so the image is not transparent in dark/light photo viewers
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill', bgColor);
  clone.insertBefore(bgRect, clone.firstChild);

  // Embed computed CSS custom properties into a <style> block
  if (computed) {
    const varNames = [
      '--color-primary',
      '--color-primary-subtle',
      '--color-bg-surface',
      '--color-bg-card',
      '--color-bg-elevated',
      '--color-bg-base',
      '--color-border',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-text-muted',
      '--color-success',
      '--color-success-subtle'
    ];

    let cssVars = ':root { ';
    for (const name of varNames) {
      const val = computed.getPropertyValue(name).trim();
      if (val) cssVars += `${name}: ${val}; `;
    }
    cssVars += '} text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }';

    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = cssVars;
    clone.insertBefore(styleEl, clone.children[1] || null);

    // Also replace var(--...) in attributes directly for maximum standalone compatibility
    const allElements = clone.querySelectorAll('*');
    allElements.forEach(el => {
      ['fill', 'stroke'].forEach(attr => {
        const val = el.getAttribute(attr);
        if (val && val.includes('var(')) {
          const varMatch = val.match(/var\((--[^,\)]+)/);
          if (varMatch) {
            const resolved = computed.getPropertyValue(varMatch[1]).trim();
            if (resolved) {
              el.setAttribute(attr, resolved);
            }
          }
        }
      });
    });
  }

  return clone;
}

/**
 * Downloads the graph as a standalone .svg vector file.
 */
export function exportSvgFile(
  svgElement: SVGSVGElement,
  filename: string,
  bounds: GraphBounds
): void {
  const standalone = createStandaloneSvg(svgElement, bounds);
  const serializer = new XMLSerializer();
  const source = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\r\n' + serializer.serializeToString(standalone);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Renders the graph to high-resolution PNG (default 2x scale for sharp retina/print) and downloads it.
 */
export function exportPngFile(
  svgElement: SVGSVGElement,
  filename: string,
  bounds: GraphBounds,
  scale: number = 2
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const standalone = createStandaloneSvg(svgElement, bounds);
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
              const a = document.createElement('a');
              a.href = pngUrl;
              a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
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
