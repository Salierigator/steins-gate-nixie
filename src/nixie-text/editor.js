/**
 * Nixie text editor on canvas: the full BONX set, with caret, selection and flicker.
 *
 * `set(patch)` re-blits for layout options and rebuilds the atlas for anything else; bare
 * `set()` picks up changed --nixie-* tokens, which it reads from the editor element.
 */

import { glyphs } from '../nixie/glyphs.js';
import { atlasDpr, buildAtlas, cellGeom, colsIn, readStyle } from './atlas.js';
import { layout } from './layout.js';
import { flicker } from './flicker.js';
import { bindInput } from './input.js';
import { png, pngSize } from './png.js';
import { renderer } from './render.js';

const DEFAULTS = {
  cellH: 60,
  cols: 16, // ignored when `width` is set
  width: null,
  height: null, // the frame only grows past this
  gap: 0,
  wrap: 'word', // 'word' | 'char'
  fill: true, // pad each row with unlit tubes up to `cols`
  sigma: 54.6, // halo, as #nxg in nixie-sprite.svg
  gain: 3.43,
  gridW: 0, // font units
  silMode: 'char', // 'char' | 'digit'
  flicker: true,
  flickerRate: 1, // per minute per lit character
  flickerMs: 350,
  flickerDepth: 0.9,
};
const STEP = 0.5; // cell heights `fit` may pick, counted from its `min`
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
  let drafting = false;
  let settle = 0;

  const glyphsOf = (text) => [...new Set([' ', ...text])].filter((c) => c in view.G.M.map);

  function build(quick = false) {
    drafting = quick;
    clearTimeout(settle);
    if (quick) settle = setTimeout(() => build(), 1000);
    if (job) {
      stale = true;
      return job;
    }
    job = (async () => {
      do {
        stale = false;
        try {
          const chars = glyphsOf(ta.value);
          const dpr = atlasDpr(view.G, view.opts, chars.length, drafting);
          view.atlas = await buildAtlas(view.G, view.opts, readStyle(el), dpr, chars);
          view.dirty = true;
          draw.reset();
          draw.render();
        } catch (error) {
          console.error(error);
        }
      } while (stale);
      job = null;
    })();
    return job;
  }

  /** A glyph the atlas lacks shows as a blank tube until this rebuild lands. */
  function ensure() {
    if (view.atlas && glyphsOf(ta.value).some((c) => !view.atlas.index.has(c))) build();
  }
  ta.addEventListener('input', ensure);

  function measure(cellH = view.opts.cellH) {
    const { G, opts } = view;
    if (!G || !opts.width || !opts.height) return null;
    const dpr = atlasDpr(G, { ...opts, cellH }, glyphsOf(ta.value).length);
    const geom = cellGeom(G, opts, dpr, cellH);
    const cols = colsIn(Math.round(opts.width * dpr), geom);
    const rows = layout(G, ta.value, { ...opts, cols }).rows.length;
    return (rows - 1) * (geom.ch + Math.round(opts.gap * dpr)) + geom.ch + 2 * geom.pad - Math.round(opts.height * dpr);
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
      ensure();
    },
    /** Resolves once the change is on screen. */
    set(patch = {}, draft = false) {
      Object.assign(view.opts, patch);
      const keys = Object.keys(patch);
      if (keys.some((key) => FLICKER.has(key))) fx.restart();
      if (keys.length > 0 && keys.every((key) => LAYOUT.has(key) || FLICKER.has(key))) {
        view.dirty = true;
        draw.schedule();
        return new Promise((done) => requestAnimationFrame(() => done()));
      }
      return view.G ? build(draft) : Promise.resolve();
    },
    over() {
      const h = measure();
      return h !== null && h > 0;
    },

    /** Largest cell height on the `min` grid, no larger than `max`, whose text still fits the frame; null if none does. */
    fit(min = 1, max = view.opts.cellH) {
      if (measure() === null) return null;
      let lo = -1; // steps above `min`, all of which fit; -1 once `min` itself is too tall
      let hi = Math.floor((max - min) / STEP) + 1;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (measure(min + mid * STEP) <= 0) lo = mid;
        else hi = mid;
      }
      return lo < 0 ? null : min + lo * STEP;
    },

    pngSize: (scale, frame) => pngSize(view, scale, frame),
    png: (scale, frame) => png(view, scale, frame),
  };
}
