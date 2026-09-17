import * as Nixie from './nixie/meter.js';
import { studio } from './studio/studio.js';
import { picker } from './wheel/wheel.js';
import { WORLDLINES } from './values.js';

await Nixie.mount();

/* Each page renders whatever containers it has. */
const pickerHost = document.getElementById('picker');
const readout = document.getElementById('readout');

/* Swap only the tubes whose digit changed instead of rebuilding the whole meter. */
function readoutView(host) {
  let shown = null;

  return (value) => {
    const next = Nixie.chars(value);
    const tubes = host.firstElementChild;

    if (!shown) {
      host.append(Nixie.meter(value));
    } else {
      next.forEach((c, i) => {
        if (c !== shown[i]) tubes.children[i].replaceWith(Nixie.char(c));
      });
      tubes.setAttribute('aria-label', value.toFixed(6));
    }

    shown = next;
  };
}

if (pickerHost && readout) {
  const show = readoutView(readout);
  const wheels = picker(WORLDLINES[0], show);
  pickerHost.append(wheels.el);
  show(wheels.value());
  const upa = pickerHost.querySelector('.upa');
  upa?.addEventListener('click', () => {
    wheels.spin(1200);
    upa.classList.remove('flash');
    void upa.offsetWidth; // restart the animation on rapid clicks
    upa.classList.add('flash');
  });
}

const studioHost = document.getElementById('studio');
const panel = document.getElementById('panel');
if (studioHost && panel) studio(studioHost, panel);
