const canvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

/** One cell in whole device px, so blits never resample. `s` scales font units to those px. */
export function cellGeom(G, opts, dpr, cellH = opts.cellH) {
  const cw = Math.max(1, Math.round((cellH * dpr * G.cw) / G.ch));
  const s = cw / G.cw;
  return { cw, ch: Math.round(G.ch * s), pad: Math.ceil((3 * opts.sigma + opts.gridW) * s) + 1, s };
}

export const colsIn = (width, { cw, pad }) => Math.max(1, Math.floor((width - 2 * pad) / cw));

export function readStyle(el) {
  const css = getComputedStyle(el);
  const v = (name) => css.getPropertyValue(`--nixie-${name}`).trim();
  return {
    sil: v('silhouette'),
    glow: v('glow'),
    lit: v('lit'),
    grid: v('grid'),
    opSil: v('op-silhouette'),
    opGlow: v('op-glow'),
    opGrid: v('op-grid') * v('grid-level'),
  };
}

async function rasterize(svg, w, h) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(w, h);
    img.src = url;
    await img.decode();
    const out = canvas(w, h);
    out.getContext('2d').drawImage(img, 0, 0);
    return await createImageBitmap(out); // forces the deferred SVG raster now, without a GPU readback
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Every glyph as the four meter layers, plus a base tile; `cell(c, k)` recomposites one at brightness k. */
export async function buildAtlas(G, opts, style, dpr = window.devicePixelRatio || 1, chars = G.chars) {
  const { cw, ch, pad, s } = cellGeom(G, opts, dpr);
  const padU = pad / s;
  const g = { dpr, cw, ch, pad };
  const tw = cw + 2 * pad;
  const th = ch + 2 * pad;
  const per = Math.ceil(Math.sqrt((chars.length * th) / tw));
  const W = per * (tw + 2);
  const H = Math.ceil(chars.length / per) * (th + 2);
  const index = new Map(chars.map((c, k) => [c, [(k % per) * (tw + 2), Math.floor(k / per) * (th + 2)]]));
  const band = (l) => [(l % 2) * W, Math.floor(l / 2) * H]; // four layers in a 2×2 grid, one decode

  const layer = (l, c) => {
    if (l === 0) {
      return `<use href="#S${G.S.map[opts.silMode === 'digit' ? '0' : c]}" fill="${style.sil}" opacity="${style.opSil}"/>`;
    }
    if (l === 3) {
      const stroke = opts.gridW ? ` stroke="${style.grid}" stroke-width="${opts.gridW}"` : '';
      return `<use href="#F${G.F.map[c]}" fill="${style.grid}" opacity="${style.opGrid}"${stroke}/>`;
    }
    if (!G.lit.has(c)) return '';
    const m = G.M.map[c];
    return l === 1
      ? `<g filter="url(#nxg)" fill="${style.glow}" fill-opacity="${style.opGlow}"><use href="#M${m}"/></g>`
      : `<use href="#M${m}" fill="${style.lit}"/>`;
  };

  let body = '';
  for (let l = 0; l < 4; l++) {
    const [bx, by] = band(l);
    for (const [c, [x, y]] of index) {
      const markup = layer(l, c);
      if (!markup) continue;
      body += `<svg x="${bx + x + pad}" y="${by + y + pad}" width="${cw}" height="${ch}" viewBox="0 0 ${G.cw} ${G.ch}" preserveAspectRatio="none" overflow="visible">${markup}</svg>`;
    }
  }
  const filter =
    `<filter id="nxg" filterUnits="userSpaceOnUse" x="${-padU}" y="${-padU}" width="${G.cw + 2 * padU}" height="${G.ch + 2 * padU}" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur stdDeviation="${opts.sigma}"/><feComponentTransfer><feFuncA type="linear" slope="${opts.gain}"/></feComponentTransfer></filter>`;
  const layers = await rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * W}" height="${2 * H}" viewBox="0 0 ${2 * W} ${2 * H}"><defs>${G.defs}${filter}</defs>${body}</svg>`,
    2 * W,
    2 * H,
  );

  const work = canvas(tw, th).getContext('2d');

  /* Meter order: silhouette, halo screened, lit stroke, grid. */
  function cell(c, k) {
    const [sx, sy] = index.get(c);
    const draw = (l, alpha, op) => {
      const [bx, by] = band(l);
      work.globalAlpha = alpha;
      work.globalCompositeOperation = op;
      work.drawImage(layers, bx + sx, by + sy, tw, th, 0, 0, tw, th);
    };
    work.clearRect(0, 0, tw, th);
    draw(0, 1, 'source-over');
    if (G.lit.has(c)) {
      draw(1, k, 'screen');
      draw(2, k, 'source-over');
    }
    draw(3, 1, 'source-over');
    work.globalAlpha = 1;
    work.globalCompositeOperation = 'source-over';
    return work.canvas;
  }

  const base = canvas(W, H);
  const ctx = base.getContext('2d');
  for (const [c, [x, y]] of index) ctx.drawImage(cell(c, 1), x, y);

  return { g, tw, th, index, cell, base: await createImageBitmap(base) };
}
