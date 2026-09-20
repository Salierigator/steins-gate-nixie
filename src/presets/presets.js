/**
 * Character preset strip: a row of faces over the text frame.
 *
 *   host.append(presetStrip(apply)); // apply(char) gets the CHARS entry that was clicked
 *
 * The lit chip is the strip's own state: only a click moves it, so editing colors by hand
 * leaves the character picked.
 */

import { CHARS } from './chars.js';

/** A chip glows in its own color: a tight near-white core over a wide halo, as .upa does. */
const core = (hex) => '#' + [1, 3, 5].map((i) => {
  const v = parseInt(hex.slice(i, i + 2), 16) / 255;
  return Math.round(255 * (v + (1 - v) * 0.72)).toString(16).padStart(2, '0');
}).join('');

export function presetStrip(apply) {
  const strip = document.createElement('div');
  strip.className = 'preset-strip';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Character colors');

  for (const char of CHARS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset';
    chip.title = char.key;
    chip.setAttribute('aria-pressed', char === CHARS[0]);
    chip.style.cssText = `--chip-core:${core(char.lit)};--chip-halo:${char.glow}`;

    const img = document.createElement('img');
    img.src = new URL(`../../assets/chars/${char.key}.png`, import.meta.url);
    img.alt = char.key;
    img.width = 54;
    img.height = 54;
    chip.append(img);

    chip.addEventListener('click', () => {
      for (const other of strip.children) other.setAttribute('aria-pressed', other === chip);
      apply(char);
    });
    strip.append(chip);
  }

  return strip;
}
