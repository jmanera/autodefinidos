// Comprobaciones del diccionario y del generador: node tools/test.js
const { G, dict, gen } = require('./load.js');
let fails = 0;
const bad = (msg) => { fails++; console.log('FALLO:', msg); };

// Diccionario
for (const [w, clues] of dict) {
  if (!/^[A-ZÑ]+$/.test(w)) bad('palabra rara ' + w);
  for (const c of clues) {
    if (c.length > 40) bad(`pista larga ${w}: ${c}`);
    if (G.norm(c).split(/[^A-ZÑ]+/).includes(w)) bad(`la pista contiene la palabra ${w}: ${c}`);
  }
}
const byLen = {};
for (const w of dict.keys()) byLen[w.length] = (byLen[w.length] || 0) + 1;
console.log('Diccionario:', dict.size, 'palabras', JSON.stringify(byLen));

// Generador
for (const size of ['s', 'm', 'l']) {
  const N = 40;
  let ok = 0, ms = 0, max = 0, dens = 0;
  for (let seed = 1; seed <= N; seed++) {
    const t = Date.now();
    const p = gen.generate(size, seed);
    const dt = Date.now() - t; ms += dt; if (dt > max) max = dt;
    if (!p) { bad(`sin puzle ${size} ${seed}`); continue; }
    ok++;
    const { w: W, h: H, grid, words } = p;
    const seen = new Set(), covered = new Set(), perCell = {};
    for (const wd of words) {
      if (!dict.has(wd.word)) bad('palabra fuera del diccionario ' + wd.word);
      if (seen.has(wd.word)) bad('palabra repetida ' + wd.word);
      seen.add(wd.word);
      if (wd.cells.map(i => grid[i]).join('') !== wd.word) bad('celdas no cuadran ' + wd.word);
      if (grid[wd.at] !== '#') bad('definición fuera de casilla de definición');
      const first = wd.cells[0];
      if (first !== wd.at + (wd.dir === 'a' ? 1 : W)) bad('la palabra no empieza junto a su definición');
      const end = wd.cells[wd.cells.length - 1] + (wd.dir === 'a' ? 1 : W);
      const atEdge = wd.dir === 'a' ? end % W === 0 : end >= W * H;
      if (!atEdge && grid[end] !== '#') bad('la palabra no termina en definición o borde ' + wd.word);
      if (!dict.get(wd.word).includes(wd.clue)) bad('pista que no es de la palabra');
      wd.cells.forEach(i => covered.add(i));
      perCell[wd.at] = (perCell[wd.at] || 0) + 1;
    }
    grid.forEach((v, i) => {
      if (v !== '#' && !covered.has(i)) bad('letra sin palabra');
      if (v === '#' && perCell[i] > 2) bad('más de dos definiciones en una casilla');
    });
    for (let c = 0; c < W; c++) if (grid[c] !== '#') bad('marco superior');
    for (let r = 0; r < H; r++) if (grid[r * W] !== '#') bad('marco izquierdo');
    let inner = 0;
    for (let i = W; i < W * H; i++) if (i % W && grid[i] === '#') inner++;
    dens += inner / ((W - 1) * (H - 1));
  }
  // determinismo
  const a = gen.generate(size, 777), b = gen.generate(size, 777);
  if (a.grid.join('') !== b.grid.join('') || a.words.map(x => x.clue).join() !== b.words.map(x => x.clue).join()) bad('no determinista ' + size);
  console.log(`Tamaño ${size}: ${ok}/${N}, media ${Math.round(ms / N)} ms, máx ${max} ms, definiciones interiores ${(dens / ok * 100).toFixed(0)}%`);
}

if (fails) { console.log(fails, 'fallos'); process.exit(1); }
console.log('Todo correcto');
