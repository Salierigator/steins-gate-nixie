import { colsIn } from './atlas.js';
import { layout } from './layout.js';

const CHUNK_PX = 1024; // device px of rows per canvas

/** Rows go into chunk canvases kept around the viewport, each redrawn only when its rows change. */
export function renderer(view, flicker) {
  const { sheet, caret, ta, opts } = view;
  const chunks = new Map();
  let pitch = 0;
  let per = 1;
  let frame = 0;

  const cellCount = (r) => (opts.fill ? opts.cols : view.cur.rows[r].length);
  const gridH = (g, n) => (n - 1) * pitch + g.ch + 2 * g.pad;

  function blitCell(ctx, r, i, x, y) {
    const { atlas } = view;
    const c = view.cur.rows[r][i]?.c ?? ' ';
    const k = flicker.level(r, i);
    if (k !== 1) {
      ctx.drawImage(atlas.cell(c, k), x, y);
      return;
    }
    const [sx, sy] = atlas.index.get(c);
    ctx.drawImage(atlas.base, sx, sy, atlas.tw, atlas.th, x, y, atlas.tw, atlas.th);
  }

  function render() {
    if (!view.atlas) return;
    const { g } = view.atlas;
    const gap = Math.round(opts.gap * g.dpr);
    pitch = g.ch + gap;
    const minW = Math.round((opts.width ?? 0) * g.dpr);
    const minH = Math.round((opts.height ?? 0) * g.dpr);
    const fitRows = Math.max(1, Math.floor((minH - gridH(g, 1)) / pitch) + 1);
    if (view.dirty) {
      flicker.end();
      if (opts.width) opts.cols = colsIn(minW, g);
      view.cur = layout(view.G, ta.value, opts);
      while (view.cur.rows.length < fitRows) {
        view.cur.rows.push([]);
        view.cur.ends.push(ta.value.length);
      }
      view.dirty = false;
    }

    const { rows } = view.cur;
    const W = opts.cols * g.cw + 2 * g.pad;
    view.x0 = Math.max(0, Math.floor((minW - W) / 2));
    view.y0 = Math.max(0, Math.floor((minH - gridH(g, fitRows)) / 2)); // from the frame, so the grid stays put as text grows
    sheet.style.width = `${Math.max(minW, W) / g.dpr}px`;
    sheet.style.height = `${Math.max(minH, 2 * view.y0 + gridH(g, rows.length)) / g.dpr}px`;

    const top = sheet.getBoundingClientRect().top;
    const vh = window.innerHeight;
    const rowAt = (y) => Math.floor((y * g.dpr - g.pad - view.y0) / pitch);
    const clamp = (r) => Math.min(Math.max(r, 0), rows.length - 1);
    const r0 = clamp(rowAt(-top - vh) - 1);
    const r1 = clamp(rowAt(-top + 2 * vh) + 1);
    per = Math.max(1, Math.floor(CHUNK_PX / pitch));
    const c0 = Math.floor(r0 / per);
    const c1 = Math.floor(r1 / per);

    for (const [k, c] of chunks) {
      if (k >= c0 && k <= c1) continue;
      c.cv.remove();
      chunks.delete(k);
    }

    for (let k = c0; k <= c1; k++) {
      const slice = rows.slice(k * per, (k + 1) * per);
      if (slice.length === 0) break;
      const sig = `${opts.cols}|${opts.fill}|${gap}|${slice.map((row) => row.map((x) => x.c).join('')).join('\n')}`;
      let c = chunks.get(k);
      if (!c) {
        const cv = document.createElement('canvas');
        c = { cv, ctx: cv.getContext('2d') };
        chunks.set(k, c);
        sheet.prepend(cv);
      }
      c.cv.style.left = `${view.x0 / g.dpr}px`;
      c.cv.style.top = `${(view.y0 + k * per * pitch) / g.dpr}px`;
      if (c.sig === sig) continue;
      const h = gridH(g, slice.length);
      if (c.cv.width !== W || c.cv.height !== h) {
        c.cv.width = W;
        c.cv.height = h;
        c.cv.style.width = `${W / g.dpr}px`;
        c.cv.style.height = `${h / g.dpr}px`;
      } else {
        c.ctx.clearRect(0, 0, W, h);
      }
      c.ctx.globalCompositeOperation = 'screen';
      slice.forEach((_, lr) => {
        const r = k * per + lr;
        for (let i = 0; i < cellCount(r); i++) blitCell(c.ctx, r, i, i * g.cw, lr * pitch);
      });
      c.sig = sig;
    }

    flicker.rows(clamp(rowAt(-top)), clamp(rowAt(-top + vh)));
    drawCaret(g, r0, r1);
  }

  function drawCaret(g, r0, r1) {
    const { cur } = view;
    const at = (r, k) => [(view.x0 + g.pad + k * g.cw) / g.dpr, (view.y0 + g.pad + r * pitch) / g.dpr];
    for (const sel of sheet.querySelectorAll('.nixie-text-sel')) sel.remove();

    const a = cur.pos[ta.selectionStart];
    const b = cur.pos[ta.selectionEnd];
    const [x, y] = at(...(ta.selectionDirection === 'backward' ? a : b));
    Object.assign(caret.style, { left: `${x - 1}px`, top: `${y}px`, height: `${g.ch / g.dpr}px` });
    Object.assign(ta.style, { left: `${x}px`, top: `${y}px` }); // IME candidate window follows the caret
    for (const animation of caret.getAnimations()) animation.currentTime = 0; // solid while typing
    if (ta.selectionStart === ta.selectionEnd) return;

    for (let r = Math.max(a[0], r0); r <= Math.min(b[0], r1); r++) {
      const k0 = r === a[0] ? a[1] : 0;
      const k1 = r === b[0] ? b[1] : Math.max(cur.rows[r].length, 1);
      if (k1 <= k0) continue;
      const [sx, sy] = at(r, k0);
      const sel = document.createElement('div');
      sel.className = 'nixie-text-sel';
      Object.assign(sel.style, {
        left: `${sx}px`,
        top: `${sy}px`,
        width: `${((k1 - k0) * g.cw) / g.dpr}px`,
        height: `${g.ch / g.dpr}px`,
      });
      sheet.append(sel);
    }
  }

  /** Repaints one cell's tile rect from every cell overlapping it. */
  function redrawCell(r, i) {
    const k = Math.floor(r / per);
    const c = chunks.get(k);
    if (!c) return;
    const { g, tw, th } = view.atlas;
    const lr = r - k * per;
    const count = Math.min(per, view.cur.rows.length - k * per);
    const x = i * g.cw;
    const y = lr * pitch;
    const dc = Math.ceil(tw / g.cw) - 1;
    const dr = Math.ceil(th / pitch) - 1;

    c.ctx.save();
    c.ctx.beginPath();
    c.ctx.rect(x, y, tw, th);
    c.ctx.clip();
    c.ctx.clearRect(x, y, tw, th);
    c.ctx.globalCompositeOperation = 'screen';
    for (let l2 = Math.max(0, lr - dr); l2 <= Math.min(count - 1, lr + dr); l2++) {
      const r2 = r - lr + l2;
      for (let i2 = Math.max(0, i - dc); i2 <= Math.min(cellCount(r2) - 1, i + dc); i2++) {
        blitCell(c.ctx, r2, i2, i2 * g.cw, l2 * pitch);
      }
    }
    c.ctx.restore();
  }

  function schedule() {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function reset() {
    for (const c of chunks.values()) c.cv.remove();
    chunks.clear();
  }

  return { render, schedule, redrawCell, reset };
}
