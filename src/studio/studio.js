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
  const editor = textEditor(host, opts);
  editor.value = 'El Psy Kongroo.';

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

  function showSize() {
    const [w, h] = editor.pngSize(scale);
    size.value = `${scale}× · ${w}×${h}`;
  }
  new ResizeObserver(showSize).observe(editor.el.firstElementChild);

  const parse = (value) => (value === 'true' || value === 'false' ? value === 'true' : value);

  function setField(name, value) {
    for (const twin of form.querySelectorAll(`[name="${name}"]`)) {
      twin.value = value;
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

  form.addEventListener('input', ({ target }) => {
    const { name, value } = target;
    drop();
    if (!target.validity.valid) return; // a half-typed number or hex
    if (name === 'ratio') {
      const locked = pair('width', Number(form.elements.width[0].value));
      if (locked.width) editor.set(locked); // Free changes nothing on its own
      return;
    }
    if (target.type === 'radio') {
      editor.set({ [name]: parse(value) });
      return;
    }
    setField(name, value);
    if (name === 'scale') {
      scale = Number(value);
      showSize();
    } else if (name.startsWith('--')) {
      editor.el.style.setProperty(name, value);
      editor.set();
    } else {
      editor.set({ [name]: Number(value), ...pair(name, Number(value)) });
    }
  });

  form.addEventListener('change', ({ target }) => {
    if (!target.validity.valid) target.value = [...form.elements[target.name]].find((twin) => twin !== target).value;
  });

  /* Every changed field onto the editor at once, after the form itself was reset or put back. */
  function sync() {
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
    const png = form.elements.scale.value; // export size is a download setting, not a frame setting
    const back = undone;
    undone = back ? null : [...inputs].map((input) => (input.type === 'radio' ? input.checked : input.value));
    if (back) {
      inputs.forEach((input, i) => {
        if (input.type === 'radio') input.checked = back[i];
        else if (input.value !== back[i]) input.value = back[i];
      });
    }
    else form.reset();
    form.elements.scale.value = png;
    sync();
    reset.textContent = undone ? 'Undo' : 'Reset';
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
