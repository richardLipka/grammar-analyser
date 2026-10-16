/**
 * Shared Graph & SVG Visualization Utilities.
 */

/**
 * Smooths a Dagre polyline into an SVG path with quadratic Bezier curves through midpoints.
 */
export function edgePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x},${pts[i].y} ${i === pts.length - 2 ? pts[i + 1].x : mx},${i === pts.length - 2 ? pts[i + 1].y : my}`;
  }
  return d;
}
