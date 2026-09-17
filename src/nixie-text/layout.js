/** Monospace rows of { c, i } cells, each row's end index, and [row, col] for every text index. */
export function layout(G, text, { cols, wrap }) {
  const word = wrap === 'word';
  const rows = [];
  const ends = [];
  const pos = new Array(text.length + 1);
  let row = [];
  const brk = (end) => {
    rows.push(row);
    ends.push(end);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      pos[i] = [rows.length, row.length];
      brk(i);
      continue;
    }
    if (row.length === cols && word && ch === ' ') {
      pos[i] = [rows.length, cols]; // hangs past the edge
      continue;
    }
    if (row.length === cols) brk(i);
    else if (word && ch !== ' ' && row.length && text[i - 1] === ' ') {
      let j = i;
      while (j < text.length && text[j] !== ' ' && text[j] !== '\n') j++;
      if (row.length + (j - i) > cols && j - i <= cols) brk(i);
    }
    pos[i] = [rows.length, row.length];
    row.push({ c: ch in G.M.map ? ch : ' ', i });
  }
  pos[text.length] = [rows.length, row.length];
  brk(text.length);
  return { rows, ends, pos };
}
