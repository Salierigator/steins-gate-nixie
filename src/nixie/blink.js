const RATE = 1; // blinks per minute per lit character
const LOW = 0.1; // opacity floor
const DUR = 350; // ms, longest blink

/** Poisson process: ms until the next blink among `count` lit characters. */
export function delay(count) {
  return (-Math.log(1 - Math.random()) / ((RATE / 60) * Math.max(count, 1))) * 1000;
}

/** Fresh keyframes each blink, so no pattern emerges. */
export function blink() {
  const dips = 2 + Math.floor(Math.random() * 3);
  const points = Array.from({ length: dips * 2 }, () => Math.random()).sort((a, b) => a - b);

  return {
    keyframes: [
      { opacity: 1, offset: 0, easing: 'steps(1,end)' },
      ...points.map((point, i) => ({
        opacity: i % 2 ? 0.82 + Math.random() * 0.18 : LOW + Math.random() * (1 - LOW) * 0.3,
        offset: point * 0.95,
        easing: 'steps(1,end)',
      })),
      { opacity: 1, offset: 1 },
    ],
    duration: 60 + Math.random() * (DUR - 60),
  };
}
