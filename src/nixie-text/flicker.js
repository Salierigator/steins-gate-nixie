import { blink, delay } from '../nixie/blink.js';

/** Meter blinks over the lit cells on screen, each step redrawing only the blinking cell. */
export function flicker(view, redrawCell) {
  const blinks = new Map(); // r * 65536 + i -> { r, i, keyframes, duration, t0, k }
  let lit = [];
  let timer = 0;
  let ticking = 0;

  function schedule() {
    clearTimeout(timer);
    if (lit.length === 0 || !view.opts.flicker) return;
    timer = setTimeout(() => {
      if (!view.el.isConnected) {
        lit = []; // resumes on the next render
        return;
      }
      start();
      schedule();
    }, delay(lit.length, view.opts.flickerRate));
  }

  function start() {
    const key = lit[Math.floor(Math.random() * lit.length)];
    if (blinks.has(key)) return;
    const { flickerMs, flickerDepth } = view.opts;
    blinks.set(key, { r: key >> 16, i: key & 65535, ...blink(flickerMs, 1 - flickerDepth), t0: performance.now(), k: 1 });
    ticking ||= requestAnimationFrame(tick);
  }

  function tick(now) {
    ticking = 0;
    for (const [key, b] of blinks) {
      const p = (now - b.t0) / b.duration;
      let k = 1;
      if (p >= 1) blinks.delete(key);
      else {
        for (const f of b.keyframes) {
          if (f.offset > p) break;
          k = f.opacity;
        }
      }
      if (k !== b.k) {
        b.k = k;
        redrawCell(b.r, b.i);
      }
    }
    if (blinks.size) ticking = requestAnimationFrame(tick);
  }

  function end() {
    const done = [...blinks.values()];
    blinks.clear();
    if (view.cur) for (const b of done) redrawCell(b.r, b.i);
  }

  return {
    level: (r, i) => blinks.get(r * 65536 + i)?.k ?? 1,

    rows(v0, v1) {
      const next = [];
      for (let r = v0; r <= v1; r++) {
        view.cur.rows[r].forEach((cell, i) => {
          if (view.G.lit.has(cell.c)) next.push(r * 65536 + i);
        });
      }
      const changed = next.length !== lit.length;
      lit = next;
      if (changed) schedule(); // memoryless, so rescheduling at the new rate is exact
    },

    /** Before a relayout, while the old layout still says where the cells are. */
    end,

    restart() {
      end();
      schedule();
    },
  };
}
