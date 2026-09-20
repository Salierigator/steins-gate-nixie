/**
 * Nixie colors per character, in the order they sit over the frame. Edit a row to retune one.
 *
 * `lit` is the character's main color, `glow` the halo around the stroke, `sil` the cathode
 * shadow behind it: same hue as `lit`, saturation at most 65%, lightness 38%. Okabe repeats
 * the --nixie-* defaults of tokens.css, so picking Okabe leaves the frame with no inline color.
 * Keep the hex lowercase: color inputs normalize to it and studio compares the two.
 */

export const CHARS = [
  { key: 'Okabe', lit: '#ffab00', glow: '#ff300b', sil: '#cd2228' },
  { key: 'Mayuri', lit: '#279be7', glow: '#5dade2', sil: '#226ea0' },
  { key: 'Daru', lit: '#f1b41d', glow: '#b8860b', sil: '#a07b22' },
  { key: 'Kurisu', lit: '#e72727', glow: '#b71c1c', sil: '#a02222' },
  { key: 'Moeka', lit: '#7727e7', glow: '#6e5a8a', sil: '#5e4d75' },
  { key: 'Lukako', lit: '#f2e9dc', glow: '#c62828', sil: '#5a2626' },
  { key: 'Faris', lit: '#ea2467', glow: '#f06292', sil: '#a0224c' },
  { key: 'Suzuha', lit: '#f5ec00', glow: '#f5a623', sil: '#a07022' },
  { key: 'Maho', lit: '#27e72f', glow: '#4caf50', sil: '#3b873e' },
];
