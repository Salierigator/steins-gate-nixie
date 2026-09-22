import { buildAtlas, readStyle } from './atlas.js';

const MAX_SIDE = 32767;
const FRAME_PAD = 64; // ground around an exported frame, wide enough for its glow to finish

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

const margin = (scale, frame) => (frame ? Math.round(FRAME_PAD * scale) : 0);

export function pngSize(view, scale, frame) {
  const m = margin(scale, frame);
  return [
    Math.round(view.sheet.offsetWidth * scale) + 2 * m,
    Math.round(view.sheet.offsetHeight * scale) + 2 * m,
  ];
}

/** The frame as CSS draws it, read off the element; under destination-over each part lands behind the last. */
function drawFrame(ctx, css, m, iw, ih, scale) {
  const line = parseFloat(css.outlineWidth) * scale;
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = css.outlineColor;
    ctx.strokeRect(m - line / 2, m - line / 2, iw + line, ih + line);
  }

  const shadow = /^(.*?)((?:\s+-?[\d.]+px){3,4})$/.exec(css.boxShadow);
  if (shadow) {
    const [dx, dy, blur] = shadow[2].trim().split(/\s+/).map(parseFloat);
    ctx.shadowColor = shadow[1];
    ctx.shadowBlur = blur * scale;
    ctx.shadowOffsetX = dx * scale;
    ctx.shadowOffsetY = dy * scale;
    ctx.fillRect(m, m, iw, ih); // only the shadow shows, the sheet already covers this rect
    ctx.shadowColor = 'transparent';
  }
}

/** The whole sheet redrawn at `scale` from a fresh atlas of the glyphs in use, steady (no flicker) on the editor backdrop. */
export async function png(view, scale, frame) {
  const { G, opts, cur, el } = view;
  const [w, h] = pngSize(view, scale, frame);
  const m = margin(scale, frame);
  const [iw, ih] = [w - 2 * m, h - 2 * m];
  const chars = [...new Set([' ', ...cur.rows.flat().map((cell) => cell.c)])];
  const { g, tw, th, index, base } = await buildAtlas(G, opts, readStyle(el), scale, chars);
  const pitch = g.ch + Math.round(opts.gap * scale);
  const x0 = m + Math.round((iw - opts.cols * g.cw - 2 * g.pad) / 2);
  const y0 = m + Math.round((ih - (cur.rows.length - 1) * pitch - g.ch - 2 * g.pad) / 2);

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
  const css = getComputedStyle(el);
  ctx.fillStyle = css.getPropertyValue('--nixie-text-bg');
  ctx.fillRect(m, m, iw, ih);
  if (frame) {
    drawFrame(ctx, css, m, iw, ih, scale);
    ctx.fillRect(0, 0, w, h);
  }

  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  cv.width = cv.height = 0;
  if (!blob) throw new Error(`Could not encode a ${w}×${h} PNG`);
  return blob;
}
