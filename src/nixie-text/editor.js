/**
 * Nixie text editor on canvas: the full BONX set, with caret, selection and flicker.
 *
 *   const editor = textEditor(host, { cellH: 60, cols: 16 });
 *   editor.value = 'El Psy Kongroo.';
 *   await editor.set({ cols: 24 }); // layout options re-blit, anything else rebuilds the atlas
 *   editor.set({ width: 800, height: 400 }); // frame in px: columns follow, rows fill it, the grid is centered
 *   editor.set();             // rebuild after changing --nixie-* tokens
 *   editor.over();            // does the text make the frame taller than `height`?
 *   editor.fit(8);            // largest cellH >= 8, no larger than now, whose text still fits
 *   editor.options;           // a copy of the current options
 *   editor.png(2);            // Promise<Blob> of the whole frame at 2×
 *   editor.el.addEventListener('input', ...);
 *
 * Colors and opacities are the --nixie-* tokens as seen from the editor element.
 */

import { glyphs } from '../nixie/glyphs.js';
import { buildAtlas, readStyle } from './atlas.js';
import { layout } from './layout.js';
import { flicker } from './flicker.js';
import { bindInput } from './input.js';
import { png, pngSize } from './png.js';
import { renderer } from './render.js';

const DEFAULTS = {
  cellH: 60, // px
  cols: 16, // ignored when `width` is set
  width: null, // px
  height: null, // px, grows with the text
  gap: 0, // px between rows
  wrap: 'word', // 'word' | 'char'
  fill: true, // pad each row with unlit tubes up to `cols`
  sigma: 54.6, // halo, as #nxg in nixie-sprite.svg
  gain: 3.43,
  gridW: 0, // grid stroke, font units
  silMode: 'char', // cathode shadow: 'char' | 'digit'
  flicker: true,
  flickerRate: 1, // blinks per minute per lit character
  flickerMs: 350, // longest blink
  flickerDepth: 0.9,
};
const LAYOUT = new Set(['cols', 'width', 'height', 'gap', 'wrap', 'fill']);
const FLICKER = new Set(['flicker', 'flickerRate', 'flickerMs', 'flickerDepth']);

export function textEditor(host, options) {
  const el = document.createElement('div');
  el.className = 'nixie-text';
  const sheet = document.createElement('div');
  sheet.className = 'nixie-text-sheet';
  const caret = document.createElement('div');
  caret.className = 'nixie-text-caret';
  const ta = document.createElement('textarea');
  ta.className = 'nixie-text-input';
  ta.spellcheck = false;
  ta.setAttribute('aria-label', 'Nixie text');
  for (const name of ['autocapitalize', 'autocomplete', 'autocorrect']) ta.setAttribute(name, 'off');
  sheet.append(caret, ta);
  el.append(sheet);
  host.append(el);

  const view = { el, sheet, caret, ta, opts: { ...DEFAULTS, ...options }, G: null, atlas: null, cur: null, dirty: true };
  const fx = flicker(view, (r, i) => draw.redrawCell(r, i));
  const draw = renderer(view, fx);
  bindInput(view, draw);

  let job = null;
  let stale = false;

  function build() {
    if (job) {
      stale = true; // finish this build, then run once more
      return job;
    }
    job = (async () => {
      do {
        stale = false;
        view.atlas = await buildAtlas(view.G, view.opts, readStyle(el));
        view.dirty = true;
        draw.reset();
        draw.render();
      } while (stale);
      job = null;
    })();
    return job;
  }

  const dp = () => window.devicePixelRatio || 1;
  const frameH = () => Math.round(view.opts.height * dp());

  /** Height the rows need in device px, without building an atlas; null when there is no frame yet. */
  function measure(cellH = view.opts.cellH) {
    const { G, opts } = view;
    if (!G || !opts.width || !opts.height) return null;
    const cw = Math.max(1, Math.round((cellH * dp() * G.cw) / G.ch));
    const s = cw / G.cw;
    const ch = Math.round(G.ch * s);
    const pad = Math.ceil((3 * opts.sigma + opts.gridW) * s) + 1;
    const cols = Math.max(1, Math.floor((Math.round(opts.width * dp()) - 2 * pad) / cw));
    const rows = layout(G, ta.value, { ...opts, cols }).rows.length;
    return (rows - 1) * (ch + Math.round(opts.gap * dp())) + ch + 2 * pad;
  }

  document.addEventListener('scroll', draw.schedule, { capture: true, passive: true }); // any scroller, not just the page

  let dpr = window.devicePixelRatio;
  window.addEventListener('resize', () => {
    if (window.devicePixelRatio === dpr) {
      draw.schedule();
      return;
    }
    dpr = window.devicePixelRatio;
    build();
  });

  glyphs().then((G) => {
    view.G = G;
    build();
  });

  return {
    el,
    get value() {
      return ta.value;
    },
    get options() {
      return { ...view.opts };
    },
    set value(text) {
      ta.value = text;
      view.dirty = true;
      draw.schedule();
    },
    /** Resolves once the change is on screen, so a caller can pace a drag by what it really costs. */
    set(patch = {}) {
      Object.assign(view.opts, patch);
      const keys = Object.keys(patch);
      if (keys.some((key) => FLICKER.has(key))) fx.restart();
      if (keys.length > 0 && keys.every((key) => LAYOUT.has(key) || FLICKER.has(key))) {
        view.dirty = true;
        draw.schedule();
        return new Promise((done) => requestAnimationFrame(() => done()));
      }
      return view.G ? build() : Promise.resolve();
    },
    /** Is the text taller than the frame? */
    over() {
      const h = measure();
      return h !== null && h > frameH();
    },

    /** Largest cell height, no larger than now, whose text still fits the frame; null if none does. */
    fit(min = 1) {
      if (measure() === null) return null;
      const limit = frameH();
      for (let cellH = view.opts.cellH; cellH >= min; cellH -= 0.5) {
        if (measure(cellH) <= limit) return cellH;
      }
      return null;
    },

    pngSize: (scale) => pngSize(view, scale),
    png: (scale) => png(view, scale),
  };
}
