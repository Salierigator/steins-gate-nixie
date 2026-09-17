/** Pointer and ↑↓ mapped onto the grid; the hidden textarea keeps native editing. */
export function bindInput(view, { render, schedule }) {
  const { el, sheet, caret, ta, opts } = view;
  let anchor = null;

  function hit(event) {
    const { cur } = view;
    const { g } = view.atlas;
    const pitch = g.ch + Math.round(opts.gap * g.dpr);
    const rect = sheet.getBoundingClientRect();
    const px = (event.clientX - rect.left) * g.dpr - g.pad - view.x0;
    const py = (event.clientY - rect.top) * g.dpr - g.pad - view.y0;
    const r = Math.min(Math.max(Math.floor(py / pitch), 0), cur.rows.length - 1);
    const k = Math.max(Math.round(px / g.cw), 0);
    return k < cur.rows[r].length ? cur.rows[r][k].i : cur.ends[r];
  }

  function select(from, to) {
    ta.setSelectionRange(Math.min(from, to), Math.max(from, to), to < from ? 'backward' : 'forward');
  }

  el.addEventListener('pointerdown', (event) => {
    if (!view.cur) return;
    event.preventDefault();
    ta.focus({ preventScroll: true });
    if (event.shiftKey) anchor = ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart;
    else anchor = hit(event);
    select(anchor, hit(event));
    el.setPointerCapture(event.pointerId);
    schedule();
  });

  el.addEventListener('pointermove', (event) => {
    if (anchor === null) return;
    select(anchor, hit(event));
    schedule();
  });

  el.addEventListener('pointerup', () => {
    anchor = null;
  });

  ta.addEventListener('keydown', (event) => {
    const { cur } = view;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.altKey || event.metaKey || event.ctrlKey || !cur) return;
    event.preventDefault();
    const back = ta.selectionDirection === 'backward';
    const focus = back ? ta.selectionStart : ta.selectionEnd;
    const fixed = back ? ta.selectionEnd : ta.selectionStart;
    const [r, k] = cur.pos[focus];
    const nr = r + (event.key === 'ArrowUp' ? -1 : 1);
    let idx;
    if (nr < 0) idx = 0;
    else if (nr >= cur.rows.length) idx = ta.value.length;
    else idx = k < cur.rows[nr].length ? cur.rows[nr][k].i : cur.ends[nr];
    if (event.shiftKey) select(fixed, idx);
    else ta.setSelectionRange(idx, idx);
    schedule();
  });

  ta.addEventListener('input', () => {
    view.dirty = true;
    render(); // synchronously, so the caret is in place before scrolling to it
    caret.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  for (const type of ['keyup', 'select']) ta.addEventListener(type, schedule);
  document.addEventListener('selectionchange', schedule);
}
