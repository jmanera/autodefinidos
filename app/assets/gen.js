// Generador de autodefinidos. Sin DOM: se usa igual en el navegador y en Node (tools/test.js).
// El tablero tiene un marco de casillas de definición en la fila 0 y la columna 0; en el
// interior se decide casilla a casilla (por filas) si va letra o definición, comprobando
// con un trie que cada tramo horizontal y vertical sea prefijo de alguna palabra.
(function (root) {
  'use strict';

  // Quita tildes y diéresis pero conserva la Ñ.
  function norm(s) {
    return s.toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'Ñ');
  }

  function parseDict(chunks) {
    const map = new Map();
    for (const chunk of chunks) {
      for (const raw of chunk.split('\n')) {
        const line = raw.trim();
        const i = line.indexOf(':');
        if (i < 1) continue;
        const word = norm(line.slice(0, i).trim());
        if (!/^[A-ZÑ]{2,}$/.test(word)) continue;
        const clues = line.slice(i + 1).split('|').map(s => s.trim()).filter(Boolean);
        if (!clues.length) continue;
        const list = map.get(word) || [];
        for (const c of clues) if (!list.includes(c)) list.push(c);
        map.set(word, list);
      }
    }
    return map;
  }

  function buildTrie(words, maxLen) {
    const rootNode = { k: {}, w: false, n: 0, m: Infinity };
    for (const w of words) {
      if (w.length > maxLen) continue;
      let node = rootNode;
      for (const ch of w) node = node.k[ch] || (node.k[ch] = { k: {}, w: false, n: 0, m: Infinity });
      node.w = true;
    }
    // n: palabras por debajo; m: letras que faltan hasta la palabra más corta.
    (function fill(node) {
      let n = node.w ? 1 : 0, m = node.w ? 0 : Infinity;
      for (const ch in node.k) {
        const c = node.k[ch];
        fill(c);
        n += c.n;
        if (c.m + 1 < m) m = c.m + 1;
      }
      node.n = n; node.m = m;
      node.keys = Object.keys(node.k);
    })(rootNode);
    return rootNode;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Generator(dict) {
    this.dict = dict;
    this.trie = buildTrie(dict.keys(), 16);
  }

  // Intenta rellenar una cuadrícula W x H (marco incluido). Devuelve el puzle o null.
  Generator.prototype.fill = function (W, H, rand, opts) {
    const trie = this.trie;
    const maxClue = Math.round((W - 1) * (H - 1) * opts.density);
    const g = new Array(W * H).fill(null);
    for (let c = 0; c < W; c++) g[c] = '#';
    for (let r = 0; r < H; r++) g[r * W] = '#';
    const used = new Set();
    const dNode = new Array(W).fill(trie), dLen = new Array(W).fill(0), dWord = new Array(W).fill('');
    let aNode = trie, aLen = 0, aWord = '';
    let clues = 0, steps = 0, singles = 0;
    const maxSingles = Math.round((W - 1) * (H - 1) * opts.singles);
    const budget = opts.steps;
    const target = () => 2 + Math.floor(rand() * opts.maxRun);
    let want = target();

    // Un tramo se puede cerrar si está vacío, si es de una letra o si es palabra no usada.
    const ok = (node, len, word) => len <= 1 || (node.w && !used.has(word));
    // Letra suelta: tramo de una letra en horizontal y en vertical.
    const alone = i => g[i - 1] === '#' && ((i % W) === W - 1 || g[i + 1] === '#');

    const self = this;
    function cell(i) {
      if (++steps > budget) return false;
      if (i === W * H) return true;
      const r = (i / W) | 0, c = i % W;
      if (c === 0) { // casilla del marco: empieza un tramo horizontal nuevo
        const sv = [aNode, aLen, aWord];
        aNode = trie; aLen = 0; aWord = ''; want = target();
        if (cell(i + 1)) return true;
        [aNode, aLen, aWord] = sv;
        return false;
      }
      const restA = W - 1 - c, restD = H - 1 - r;
      const opts2 = [];
      // Opción letra
      const dn = dNode[c];
      const letters = [];
      for (const ch of aNode.keys) {
        const na = aNode.k[ch], nd = dn.k[ch];
        if (!nd) continue;
        // el tramo tiene que poder acabar en palabra antes del borde (o quedarse en una letra)
        if ((na.m > restA && aLen > 0) || (nd.m > restD && dLen[c] > 0)) continue;
        letters.push([ch, na, nd, Math.sqrt(na.n * nd.n) * (0.35 + rand())]);
      }
      letters.sort((x, y) => y[3] - x[3]);
      // Opción definición
      let clueOk = clues < maxClue && ok(aNode, aLen, aWord) && ok(dn, dLen[c], dWord[c]) &&
        !(aWord && aWord === dWord[c]) &&
        (c === 1 || g[i - 1] !== '#') && (r === 1 || g[i - W] !== '#') && !(r === H - 1 && c === W - 1);
      if (clueOk && c === W - 1 && restD < 2) clueOk = false; // no podría definir nada
      if (clueOk && r === H - 1 && restA < 2) clueOk = false;
      if (clueOk && dLen[c] === 1 && alone(i - W)) clueOk = false;
      if (clueOk && (singles >= maxSingles && (aLen === 1 || dLen[c] === 1))) clueOk = false;
      const clueFirst = clueOk && (aLen >= want || dLen[c] >= opts.maxRun + 1 || rand() < opts.clueBias);
      const order = [];
      if (clueFirst) order.push('#');
      for (const l of letters) order.push(l);
      if (clueOk && !clueFirst) order.push('#');

      for (const opt of order) {
        const sA = [aNode, aLen, aWord], sD = [dNode[c], dLen[c], dWord[c]], sW = want;
        if (opt === '#') {
          const wa = aLen ? aWord : null, wd = dLen[c] ? dWord[c] : null;
          if (wa) used.add(wa);
          if (wd) used.add(wd);
          const sg = (aLen === 1) + (dLen[c] === 1);
          g[i] = '#'; clues++; singles += sg;
          aNode = trie; aLen = 0; aWord = ''; want = target();
          dNode[c] = trie; dLen[c] = 0; dWord[c] = '';
          if (cell(i + 1)) return true;
          clues--; g[i] = null; singles -= sg;
          if (wa) used.delete(wa);
          if (wd) used.delete(wd);
        } else {
          const [ch, na, nd] = opt;
          g[i] = ch;
          aNode = na; aLen++; aWord += ch;
          dNode[c] = nd; dLen[c]++; dWord[c] += ch;
          // al llegar al borde, el tramo tiene que ser una palabra no repetida
          let good = true, addA = null, addD = null;
          let sg = 0;
          if (c === W - 1) {
            if (aLen === 1) sg++;
            else if (!na.w || used.has(aWord)) good = false; else addA = aWord;
          }
          if (good && r === H - 1) {
            if (dLen[c] === 1) { sg++; if (alone(i)) good = false; }
            else if (!nd.w || used.has(dWord[c]) || dWord[c] === addA) good = false; else addD = dWord[c];
          }
          if (singles + sg > maxSingles) good = false;
          if (good) {
            if (addA) used.add(addA);
            if (addD) used.add(addD);
            singles += sg;
            if (cell(i + 1)) return true;
            singles -= sg;
            if (addA) used.delete(addA);
            if (addD) used.delete(addD);
          }
          g[i] = null;
        }
        [aNode, aLen, aWord] = sA; [dNode[c], dLen[c], dWord[c]] = sD; want = sW;
        if (steps > budget) return false;
      }
      return false;
    }

    if (!cell(W)) return null; // la fila 0 es marco
    return self.build(W, H, g, rand);
  };

  Generator.prototype.build = function (W, H, g, rand) {
    const words = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (g[r * W + c] !== '#') continue;
      for (const dir of ['a', 'd']) {
        const cells = [];
        let rr = r + (dir === 'd' ? 1 : 0), cc = c + (dir === 'a' ? 1 : 0);
        while (rr < H && cc < W && g[rr * W + cc] !== '#') {
          cells.push(rr * W + cc);
          if (dir === 'a') cc++; else rr++;
        }
        if (cells.length < 2) continue;
        const word = cells.map(i => g[i]).join('');
        const opts = this.dict.get(word);
        words.push({ at: r * W + c, dir, cells, word, clue: opts[Math.floor(rand() * opts.length)] });
      }
    }
    // Letras que no pertenecen a ninguna palabra (no debería pasar)
    const covered = new Set();
    for (const w of words) for (const i of w.cells) covered.add(i);
    if (g.some((v, i) => v !== '#' && !covered.has(i))) return null;
    // casillas de definición interiores sin ninguna definición: quedan feas
    const defs = new Set(words.map(w => w.at));
    for (let i = W + 1; i < W * H; i++) if (g[i] === '#' && i % W && !defs.has(i)) return null;
    return { w: W, h: H, grid: g.slice(), words };
  };

  const SIZES = {
    s: { w: 9, h: 7, name: 'Pequeño' },
    m: { w: 11, h: 8, name: 'Mediano' },
    l: { w: 13, h: 9, name: 'Grande' },
  };

  // Prueba muchos rellenos cortos; si no sale, permite algo más de casillas de definición.
  Generator.prototype.generate = function (size, seed) {
    const S = SIZES[size] || SIZES.m;
    const base = rng(seed);
    const plan = [[0.32, 0.10, 600], [0.36, 0.12, 1200], [0.40, 0.15, 3000]];
    let attempt = 0;
    for (const [density, singles, upTo] of plan) {
      for (; attempt < upTo; attempt++) {
        const rand = rng(Math.floor(base() * 4294967296));
        const p = this.fill(S.w, S.h, rand, { density, singles, steps: 3000, maxRun: 5, clueBias: 0.04 });
        if (p) { p.seed = seed; p.size = size; p.attempts = attempt + 1; return p; }
      }
    }
    return null;
  };

  const API = { norm, parseDict, buildTrie, rng, Generator, SIZES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ADGen = API;
})(typeof window !== 'undefined' ? window : globalThis);
