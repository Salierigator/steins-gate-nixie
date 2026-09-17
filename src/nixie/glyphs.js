const GLYPHS_URL = new URL('../../assets/nixie-glyphs.json', import.meta.url);

let loading = null;

/** BONX glyphs (M lit stroke, S cathode shadow, F grid) and their SVG defs, fetched once. */
export function glyphs() {
  loading ??= fetch(GLYPHS_URL)
    .then((r) => r.json())
    .then((g) => {
      const chars = Object.keys(g.M.map);
      const flip = `matrix(1 0 0 -1 0 ${g.base})`;
      const defs = ['M', 'S', 'F']
        .map((k) => g[k].paths.map((d, i) => `<path id="${k}${i}" transform="${flip}" d="${d}"/>`).join(''))
        .join('');
      return { ...g, chars, defs, lit: new Set(chars.filter((c) => g.M.paths[g.M.map[c]] !== '')) };
    });
  return loading;
}
