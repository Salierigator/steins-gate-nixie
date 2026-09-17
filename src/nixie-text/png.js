import { buildAtlas, readStyle } from './atlas.js';

const MAX_SIDE = 32767;

/** Whether the browser really allocates a w×h canvas: past its limit a canvas fails silently, so draw into the last pixel. */
export function fits(w, h) {
  if (w > MAX_SIDE || h > MAX_SIDE) return false;
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx?.fillRect(w - 1, h - 1, 1, 1);
  const ok = ctx?.getImageData(w - 1, h - 1, 1, 1).data[3] === 255;
  cv.width = cv.height = 0;
  return ok;
}

export const pngSize = (view, scale) => [
  Math.round(view.sheet.offsetWidth * scale),
  Math.round(view.sheet.offsetHeight * scale),
];

/** The whole sheet redrawn at `scale` from a fresh atlas of the glyphs in use, steady (no flicker) on the editor backdrop. */
export async function png(view, scale) {
  const { G, opts, cur, el } = view;
  const [w, h] = pngSize(view, scale);
  const chars = [...new Set([' ', ...cur.rows.flat().map((cell) => cell.c)])];
  const { g, tw, th, index, base } = await buildAtlas(G, opts, readStyle(el), scale, chars);
  const pitch = g.ch + Math.round(opts.gap * scale);
  const x0 = Math.round((w - opts.cols * g.cw - 2 * g.pad) / 2);
  const y0 = Math.round((h - (cur.rows.length - 1) * pitch - g.ch - 2 * g.pad) / 2);

  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d');
  ctx.globalCompositeOperation = 'screen';
  cur.rows.forEach((row, r) => {
    for (let i = 0; i < (opts.fill ? opts.cols : row.length); i++) {
      const [sx, sy] = index.get(row[i]?.c ?? ' ');
      ctx.drawImage(base, sx, sy, tw, th, x0 + i * g.cw, y0 + r * pitch, tw, th);
    }
  });
  ctx.globalCompositeOperation = 'destination-over'; // same as the CSS screen onto a black backdrop
  ctx.fillStyle = getComputedStyle(el).getPropertyValue('--nixie-text-bg');
  ctx.fillRect(0, 0, w, h);

  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  cv.width = cv.height = 0;
  if (!blob) throw new Error(`Could not encode a ${w}×${h} PNG`);
  return blob;
}
