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

export function studio(host, panel) {
  const form = panel.querySelector('form');
  const toggle = panel.querySelector('.panel-toggle');
  const size = form.querySelector('output');
  const save = form.querySelector('.panel-save');
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
  for (const input of form.elements) {
    const { name } = input;
    if (name.startsWith('--')) input.value = tokens.getPropertyValue(name).trim();
    else if (input.type === 'checkbox') input.checked = options[name];
    else if (name in options) input.value = options[name];
  }
  form.elements.scale.value = scale;

  function showSize() {
    const [w, h] = editor.pngSize(scale);
    size.value = `${scale}× · ${w}×${h}`;
  }
  new ResizeObserver(showSize).observe(editor.el.firstElementChild);

  form.addEventListener('input', ({ target }) => {
    const { name } = target;
    if (!target.validity.valid) return; // a half-typed number
    if (name === 'scale') {
      scale = Number(target.value);
      showSize();
      return;
    }
    if (target.type === 'checkbox') {
      editor.set({ [name]: target.checked });
      return;
    }
    for (const twin of form.querySelectorAll(`[name="${name}"]`)) twin.value = target.value;
    if (name.startsWith('--')) {
      editor.el.style.setProperty(name, target.value);
      editor.set();
    } else {
      editor.set({ [name]: target.tagName === 'SELECT' ? target.value : Number(target.value) });
    }
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
