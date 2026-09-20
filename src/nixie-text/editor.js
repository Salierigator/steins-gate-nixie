/**
 * Nixie text editor on canvas: the full BONX set, with caret, selection and flicker.
 *
 *   const editor = textEditor(host, { cellH: 60, cols: 16 });
 *   editor.value = 'El Psy Kongroo.';
 *   editor.set({ cols: 24 }); // layout options re-blit, anything else rebuilds the atlas
 *   editor.set({ width: 800, height: 400 }); // frame in px: columns follow, rows fill it, the grid is centered
 *   editor.set();             // rebuild after changing --nixie-* tokens
 *   editor.options;           // a copy of the current options
 *   editor.png(2);            // Promise<Blob> of the whole frame at 2×
 *   editor.el.addEventListener('input', ...);
 *
 * Colors and opacities are the --nixie-* tokens as seen from the editor element.
 */

import { glyphs } from '../nixie/glyphs.js';
import { buildAtlas, readStyle } from './atlas.js';
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

  let building = false;
  let stale = false;

  async function build() {
    if (building) {
      stale = true; // finish this build, then run once more
      return;
    }
    building = true;
    do {
      stale = false;
      view.atlas = await buildAtlas(view.G, view.opts, readStyle(el));
      view.dirty = true;
      draw.reset();
      draw.render();
    } while (stale);
    building = false;
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
    set(patch = {}) {
      Object.assign(view.opts, patch);
      const keys = Object.keys(patch);
      if (keys.some((key) => FLICKER.has(key))) fx.restart();
      if (keys.length > 0 && keys.every((key) => LAYOUT.has(key) || FLICKER.has(key))) {
        view.dirty = true;
        draw.schedule();
      } else if (view.G) {
        build();
      }
    },
    pngSize: (scale) => pngSize(view, scale),
    png: (scale) => png(view, scale),
  };
}
