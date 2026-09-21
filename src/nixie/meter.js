/**
 * Nixie characters and divergence meters as DOM builders. `mount()` once per document first.
 * `char(c)` takes '0'-'9', '.' or null for an unlit tube.
 */

import { blink, delay } from './blink.js';

const SPRITE_URL = new URL('../../assets/nixie-sprite.svg', import.meta.url);
const NS = 'http://www.w3.org/2000/svg';

/** Font units, read from the sprite rather than retyped. */
let cw = 0;
let ch = 0;

/** Inject the sprite inline, once, so CSS variables reach its filter. */
export async function mount(root = document.body) {
  if (cw) return;

  const raw = await fetch(SPRITE_URL).then((r) => r.text());
  cw = Number(/data-cw="(\d+)"/.exec(raw)?.[1]);
  ch = Number(/data-ch="(\d+)"/.exec(raw)?.[1]);
  if (!cw || !ch) throw new Error('nixie-sprite.svg: missing data-cw / data-ch');

  const host = document.createElement('div');
  host.innerHTML = raw;
  root.prepend(host.firstElementChild);
}

function use(className, id) {
  const node = document.createElementNS(NS, 'use');
  node.setAttribute('class', className);
  node.setAttribute('href', `#${id}`);
  return node;
}

/** Grid and cathode shadow always draw; `c === null` leaves the digit unlit. */
export function char(c, label) {
  if (!cw) throw new Error('nixie: await mount() before char()/meter()');
  if (c !== null && !/^[0-9.]$/.test(c)) {
    throw new Error(`nixie: char must be '0'-'9', '.' or null, got ${JSON.stringify(c)}`);
  }

  const glyph = c === '.' ? 'dot' : c;
  const frame = c === null ? 'off' : glyph; // Frame has a per-character variant

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'nixie');
  svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  svg.style.setProperty('--nixie-ratio', `${cw} / ${ch}`);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  /* Four layers, bottom to top. Only the halo is filtered. */
  svg.append(use('sil', 'nx-s'));
  if (c !== null) {
    const glow = document.createElementNS(NS, 'g');
    glow.setAttribute('class', 'glow');
    glow.setAttribute('filter', 'url(#nxg)');
    glow.append(use('flick', `nx-${glyph}`));
    svg.append(glow, use('flick lit', `nx-${glyph}`));
  }
  svg.append(use('grid', `nx-f${frame}`));

  register(svg);
  return svg;
}

/**
 * The 8 characters a meter shows: 7 digits (1 + 6) and no minus glyph, so a negative value
 * leaves the first tube unlit.
 */
export function chars(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 10) {
    throw new Error(`nixie: meter needs a finite number with |value| < 10, got ${value}`);
  }

  const digits = Math.abs(value).toFixed(6);
  return [value < 0 ? null : digits[0], '.', ...digits.slice(2)];
}

export function meter(value, size = 'sm') {
  const el = document.createElement('div');
  el.className = `meter ${size}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', value.toFixed(6)); // keeps the sign the tubes cannot show
  el.append(...chars(value).map((c) => char(c)));
  return el;
}

/** Per lit cell: [stroke, halo source]. Both must dim together. */
const cells = [];
let running = false;

function register(svg) {
  const parts = [...svg.querySelectorAll('.flick')];
  if (parts.length === 0) return; // an unlit tube has nothing to blink
  cells.push(parts);

  /* Wait out the render pass: a delay drawn from one lone cell would be ~60s. */
  if (!running) {
    running = true;
    queueMicrotask(schedule);
  }
}

/** Cells whose meter was replaced are dropped lazily, when they come up. */
function pick() {
  while (cells.length > 0) {
    const i = Math.floor(Math.random() * cells.length);
    if (cells[i][0].isConnected) return cells[i];
    cells.splice(i, 1);
  }
  return null;
}

function schedule() {
  /* Drop swapped-out cells first: the rate scales with cells.length. */
  for (let i = cells.length - 1; i >= 0; i--) {
    if (!cells[i][0].isConnected) cells.splice(i, 1);
  }

  setTimeout(() => {
    const parts = pick();
    const { keyframes, duration } = blink();
    parts?.forEach((part) => part.animate(keyframes, duration)); // same tick -> in step
    schedule();
  }, delay(cells.length));
}
