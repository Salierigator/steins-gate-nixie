/**
 * Nixie text frame and its control panel.
 *
 *   studio(host, panel); // host gets the editor, panel holds .panel-toggle and the controls form
 *
 * Form fields named after editor options go straight to editor.set(), fields named --nixie-* set that
 * token on the editor; `scale` only sets the PNG export size.
 */

import { textEditor } from '../nixie-text/editor.js';
import { fits } from '../nixie-text/png.js';

const RATIOS = { '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, '3:4': 3 / 4, '1:1': 1 };
const LOCAL = new Set(['scale', 'ratio']); // panel-only fields, never editor options

export function studio(host, panel) {
  const form = panel.querySelector('form');
  const toggle = panel.querySelector('.panel-toggle');
  const size = form.querySelector('output');
  const save = form.querySelector('.panel-save');
  const reset = form.querySelector('.panel-reset');
  const phone = matchMedia('(max-width: 40rem)').matches;

  const opts = {
    cellH: phone ? 40 : 60,
    width: Math.min(864, document.documentElement.clientWidth - 32),
    height: phone ? 240 : 360,
    fill: true,
  };
  let scale = 2;
  const frame = document.createElement('div');
  frame.className = 'studio-frame';
  host.append(frame);
  const editor = textEditor(frame, opts);
  editor.value = 'El Psy Kongroo.';

  const note = document.createElement('div');
  note.className = 'studio-note';
  const dims = document.createElement('span');
  dims.className = 'studio-dims';
  const warn = document.createElement('span');
  warn.className = 'studio-warn';
  warn.hidden = true;
  const fit = document.createElement('button');
  fit.type = 'button';
  fit.className = 'studio-fit';
  fit.hidden = true;
  note.append(dims, warn, fit);
  frame.append(note);

  const tokens = getComputedStyle(editor.el);
  const options = editor.options;
  const inputs = form.querySelectorAll('input');
  const ranges = form.querySelectorAll('[type="range"]');
  for (const input of inputs) {
    const { name } = input;
    if (name.startsWith('--')) input.value = tokens.getPropertyValue(name).trim();
    else if (input.type === 'radio') {
      if (name in options) input.checked = input.value === String(options[name]);
    }
    else if (name in options) input.value = options[name];
  }
  form.elements.scale.value = scale;
  for (const input of inputs) {
    if (input.type === 'radio') input.defaultChecked = input.checked;
    else input.defaultValue = input.value;
  }

  const paint = (range) => {
    const p = String((range.value - range.min) / (range.max - range.min));
    if (range.style.getPropertyValue('--p') !== p) range.style.setProperty('--p', p);
  };
  ranges.forEach(paint);

  let target = null; // the text size Fit would pick, null while Fit has nothing to offer
  let stuck = false; // the smallest text size still does not fit

  function showSize() {
    const [w, h] = editor.pngSize(scale);
    size.value = `${scale}× : ${w}×${h}`;
    const [fw, fh] = editor.pngSize(1);
    dims.textContent = `${fw} × ${fh} px`;

    const ratio = form.elements.ratio.value;
    const over = Boolean(ratio) && editor.over();
    warn.hidden = !over;
    if (over) {
      warn.textContent = `[ Over ${ratio} ! ]`;
      warn.title = `The text makes the frame taller than ${ratio}, so the PNG will not keep that shape.`;
    }

    const cell = form.elements.cellH[0];
    const now = editor.options.cellH; // what is drawn, not what a half-typed box says
    const best = editor.fit(Number(cell.min), Number(cell.max));
    stuck = over && best === null;
    // a free frame only grows the text to fill it; a locked one also shrinks it back into shape
    target = best !== null && best !== now && (over || best > now) ? best : null;
    fit.hidden = target === null && !stuck;
    if (fit.hidden) return;
    fit.textContent = stuck ? "can't fit" : '[ Fit ? ]';
    fit.title = stuck
      ? 'Even the smallest text size does not fit this text; make the frame bigger.'
      : target > now
        ? 'Raise the text size until the text fills the frame.'
        : 'Lower the text size until the text fits the frame again.';
    fit.classList.toggle('is-stuck', stuck);
    fit.setAttribute('aria-disabled', stuck);
  }
  new ResizeObserver(showSize).observe(editor.el.firstElementChild);
  editor.el.addEventListener('input', showSize); // typing can change what Fit has to offer

  const parse = (value) => (value === 'true' || value === 'false' ? value === 'true' : value);

  function setField(name, value) {
    for (const twin of form.querySelectorAll(`[name="${name}"]`)) {
      if (twin.value !== String(value)) twin.value = value;
      if (twin.type === 'range') paint(twin);
    }
  }

  /** With a ratio locked, the other side follows; the edited side only moves if the other one hit a limit. */
  function pair(from, value) {
    const r = RATIOS[form.elements.ratio.value];
    if (!r || (from !== 'width' && from !== 'height')) return {};
    const [w, h] = [form.elements.width[0], form.elements.height[0]];
    const clamp = (input, v) => Math.min(Math.max(Math.round(v), Number(input.min)), Number(input.max));
    const other = from === 'width' ? clamp(h, value / r) : clamp(w, value * r);
    const want = from === 'width' ? value / r : value * r;
    const size = Math.abs(other - want) > 0.5 ? clamp(from === 'width' ? w : h, from === 'width' ? other * r : other / r) : value;
    const [width, height] = from === 'width' ? [size, other] : [other, size];
    setField('width', width);
    setField('height', height);
    return { width, height };
  }

  /* A drag repaints the fields at once, but the editor only gets the newest value once it is free
     again, then rests for half of what that update cost so the browser can keep drawing the slider. */
  let queued = null;
  let pumping = false;

  /** Land what a drag still owes before changing the same fields from somewhere else. */
  function flush() {
    if (!queued) return;
    const run = queued;
    queued = null;
    run();
  }

  async function pump() {
    pumping = true;
    while (queued) {
      const run = queued;
      queued = null;
      const t = performance.now();
      await run();
      showSize();
      const rest = Math.min(200, Math.max(16, (performance.now() - t) / 2));
      await new Promise((done) => setTimeout(done, rest));
    }
    pumping = false;
  }

  function push(name, value, live) {
    if (!live) flush();
    setField(name, value);
    if (name === 'scale') {
      scale = Number(value);
      showSize();
      return;
    }
    let run;
    if (name.startsWith('--')) {
      editor.el.style.setProperty(name, value);
      run = () => editor.set();
    } else {
      const patch = { [name]: Number(value), ...pair(name, Number(value)) };
      run = () => editor.set(patch);
    }
    if (!live) {
      run();
      showSize();
      return;
    }
    queued = run;
    if (!pumping) pump();
  }

  /** Enter or leaving a typed box: a stray decimal snaps to the step, anything unusable goes back. */
  function commit(input) {
    const twin = [...form.elements[input.name]].find((other) => other !== input);
    if (input.type === 'number' && input.value) {
      const step = Number(input.step) || 1;
      const base = Number(input.min) || 0;
      input.value = Number((Math.round((Number(input.value) - base) / step) * step + base).toFixed(6));
    }
    if (!input.validity.valid) input.value = twin.value;
    else if (input.value !== twin.value) {
      drop();
      push(input.name, input.value, false);
    }
  }

  const typed = (input) => input.type === 'number' || input.type === 'text';

  form.addEventListener('input', ({ target }) => {
    const { name, value } = target;
    if (typed(target)) return; // waits for Enter or for the box to lose focus
    drop();
    if (name === 'ratio') {
      flush(); // a width still in flight would fight the new pairing
      const locked = pair('width', Number(form.elements.width[0].value));
      if (locked.width) editor.set(locked); // Free changes nothing on its own
      showSize();
      return;
    }
    if (target.type === 'radio') {
      editor.set({ [name]: parse(value) });
      showSize(); // wrap and empty tubes change how many rows the text needs
      return;
    }
    push(name, value, true);
  });

  form.addEventListener('change', ({ target }) => {
    if (typed(target)) commit(target);
  });

  /* Every changed field onto the editor at once, after the form itself was reset or put back. */
  function sync() {
    flush();
    const was = editor.el.getAttribute('style') ?? '';
    const now = editor.options;
    const patch = {};
    editor.el.removeAttribute('style');
    for (const input of inputs) {
      const { name } = input;
      if (!name || LOCAL.has(name)) continue;
      if (name.startsWith('--')) {
        if (input.value !== input.defaultValue) editor.el.style.setProperty(name, input.value);
        continue;
      }
      const value = input.type === 'radio' ? (input.checked ? parse(input.value) : now[name]) : Number(input.value);
      if (value !== now[name]) patch[name] = value;
    }
    scale = Number(form.elements.scale.value);
    ranges.forEach(paint);
    if (Object.keys(patch).length > 0 || (editor.el.getAttribute('style') ?? '') !== was) editor.set(patch);
    showSize();
  }

  /* One button: Reset, then Undo until the next edit. */
  let undone = null;
  function drop() {
    if (!undone) return;
    undone = null;
    reset.textContent = 'Reset';
  }

  reset.addEventListener('click', () => {
    const keep = { scale: form.elements.scale.value }; // export size is a download setting, not a frame setting
    const ratio = form.elements.ratio.value;
    if (ratio) {
      keep.width = form.elements.width[0].value; // a locked frame is a choice, not a default
      keep.height = form.elements.height[0].value;
    }
    const back = undone;
    undone = back ? null : [...inputs].map((input) => (input.type === 'radio' ? input.checked : input.value));
    if (back) {
      inputs.forEach((input, i) => {
        if (input.type === 'radio') input.checked = back[i];
        else if (input.value !== back[i]) input.value = back[i];
      });
    }
    else form.reset();
    for (const [name, value] of Object.entries(keep)) setField(name, value);
    form.querySelector(`[name="ratio"][value="${ratio}"]`).checked = true;
    sync();
    reset.textContent = undone ? 'Undo' : 'Reset';
  });

  fit.addEventListener('click', () => {
    if (target === null) return;
    flush();
    drop();
    setField('cellH', target);
    editor.set({ cellH: target });
    showSize();
  });

  form.addEventListener('submit', (event) => event.preventDefault());

  save.addEventListener('click', async () => {
    const [w, h] = editor.pngSize(scale);
    let s = scale;
    while (s > 0.1 && !fits(...editor.pngSize(s))) s = Math.floor(s * 90) / 100;
    if (s !== scale) {
      const [w2, h2] = editor.pngSize(s);
      if (s <= 0.1) return alert(`${w}×${h} px is too large for this browser to save.`);
      if (!confirm(`${w}×${h} px is larger than this browser can save.\nSave at ${s}× (${w2}×${h2} px) instead?`)) return;
    }

    save.disabled = true;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await editor.png(s));
      a.download = 'nixie.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (error) {
      alert(error.message);
    } finally {
      save.disabled = false;
    }
  });

  function open(on) {
    panel.classList.toggle('is-open', on);
    toggle.setAttribute('aria-expanded', on);
    form.inert = !on;
  }
  open(!phone);
  toggle.addEventListener('click', () => open(!panel.classList.contains('is-open')));

  return editor;
}
