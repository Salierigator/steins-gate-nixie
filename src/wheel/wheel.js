/**
 * Lock-wheel value picker — seven digit drums, drag / scroll / arrow keys.
 * The first drum carries an extra '−' notch for negative values.
 */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MINUS = '−';
const HEAD = [MINUS, ...DIGITS];

const mod = (a, n) => ((a % n) + n) % n;

function drum(items, label, onSettle) {
  const el = document.createElement('div');
  el.className = 'wheel';
  el.tabIndex = 0;
  el.setAttribute('role', 'spinbutton');
  el.setAttribute('aria-label', label);
  el.style.setProperty('--n', items.length);

  const cylinder = document.createElement('div');
  cylinder.className = 'wheel-drum';
  cylinder.append(
    ...items.map((glyph, i) => {
      const item = document.createElement('div');
      item.className = 'wheel-item';
      item.style.setProperty('--i', i);
      item.textContent = glyph;
      return item;
    }),
  );
  el.append(cylinder);

  /* A float index, deliberately unbounded: the cylinder is periodic, so it can keep turning one way forever. */
  let pos = 0;
  const index = () => mod(Math.round(pos), items.length);

  function render() {
    el.style.setProperty('--pos', pos);
    el.setAttribute('aria-valuenow', index());
    el.setAttribute('aria-valuetext', items[index()]);
  }

  function settle() {
    pos = Math.round(pos);
    render();
    onSettle();
  }

  /* Notch height, read on each drag. offsetHeight ignores the 3D rotation */
  let unit = 0;
  let fromY = 0;
  let fromPos = 0;

  el.addEventListener('pointerdown', (event) => {
    el.setPointerCapture(event.pointerId);
    el.classList.add('is-dragging');
    unit = cylinder.firstElementChild.offsetHeight;
    fromY = event.clientY;
    fromPos = pos;
  });

  el.addEventListener('pointermove', (event) => {
    if (!el.classList.contains('is-dragging')) return;
    pos = fromPos + (event.clientY - fromY) / unit;
    render();
  });

  for (const type of ['pointerup', 'pointercancel']) {
    el.addEventListener(type, () => {
      if (!el.classList.contains('is-dragging')) return;
      el.classList.remove('is-dragging');
      settle();
    });
  }

  el.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      pos -= Math.sign(event.deltaY);
      settle();
    },
    { passive: false },
  );

  el.addEventListener('keydown', (event) => {
    const step = { ArrowUp: 1, ArrowDown: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    pos += step;
    settle();
  });

  return {
    el,
    glyph: () => items[index()],
    set(i) {
      pos = i;
      render();
    },
    /* Free-spin for `ms`, reporting each notch that passes, then glide into a random one. */
    spin(ms) {
      const speed = 0.028 + Math.random() * 0.014; // notches per ms, a little different per drum
      const from = pos;
      const start = performance.now();
      el.classList.add('is-spinning');

      return new Promise((resolve) => {
        requestAnimationFrame(function frame(now) {
          const shown = index();
          pos = from + Math.min(now - start, ms) * speed;
          if (now - start < ms) {
            render();
            if (index() !== shown) onSettle();
            requestAnimationFrame(frame);
            return;
          }
          const base = Math.ceil(pos);
          const target = Math.floor(Math.random() * items.length);
          pos = base + mod(target - base, items.length);
          el.classList.remove('is-spinning');
          render();
          resolve();
        });
      });
    },
  };
}

function dot() {
  const el = document.createElement('div');
  el.className = 'wheel-dot';
  el.textContent = '.';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function picker(initial, onChange) {
  const el = document.createElement('div');
  el.className = 'picker crt-text';

  const emit = () => onChange(value());
  const drums = [
    drum(HEAD, 'integer digit, or minus for a negative worldline', emit),
    ...Array.from({ length: 6 }, (_, i) => drum(DIGITS, `decimal digit ${i + 1}`, emit)),
  ];

  el.append(drums[0].el, dot(), ...drums.slice(1).map((d) => d.el));

  function value() {
    const head = drums[0].glyph();
    const fraction = drums
      .slice(1)
      .map((d) => d.glyph())
      .join('');
    const magnitude = Number(`${head === MINUS ? '0' : head}.${fraction}`);
    return head === MINUS ? -magnitude : magnitude;
  }

  const digits = Math.abs(initial).toFixed(6);
  drums[0].set(initial < 0 ? 0 : Number(digits[0]) + 1);
  digits
    .slice(2)
    .split('')
    .forEach((d, i) => drums[i + 1].set(Number(d)));

  /* Extra calls while spinning are ignored. */
  let spinning = false;
  async function spin(ms) {
    if (spinning) return;
    spinning = true;
    await Promise.all(drums.map((d) => d.spin(ms)));
    spinning = false;
    emit();
  }

  return { el, value, spin };
}
