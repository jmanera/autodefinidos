// Autodefinidos: interfaz, dibujo del tablero, teclado, ayudas, estadísticas y guardado.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const dict = ADGen.parseDict(window.ADDict);
  const gen = new ADGen.Generator(dict);
  const SIZES = ADGen.SIZES;

  // ---------- Ajustes y estadísticas ----------
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const cfg = Object.assign({
    size: 'm', theme: 'claro', autoAdv: true, skipFilled: true, autoCheck: false,
    sound: true, kbd: true, clueScale: 1,
  }, load('ad.cfg', {}));
  const stats = Object.assign({ s: {}, m: {}, l: {}, daily: { last: '', streak: 0, best: 0 } }, load('ad.stats', {}));

  // ---------- Estado de la partida ----------
  let P = null;   // puzle: {w,h,grid,words,seed,size,daily}
  let S = null;   // estado: {entries, marks, time, checks, reveals, done, counted, sel:{i,dir}}
  let at = null;  // por casilla: {a: índice palabra, d: índice palabra}
  let defsAt = null; // por casilla de definición: lista de palabras
  let order = []; // palabras en orden de recorrido
  let paused = false, modalOpen = false;
  let flash = null; // {cells:Set, until, color}

  // marks: 0 nada, 1 error, 2 revelada, 3 comprobada correcta
  function index() {
    at = P.grid.map(() => ({ a: -1, d: -1 }));
    defsAt = {};
    P.words.forEach((w, k) => {
      w.cells.forEach(i => { at[i][w.dir] = k; });
      (defsAt[w.at] = defsAt[w.at] || []).push(k);
    });
    // horizontales arriba-abajo, luego verticales izquierda-derecha
    const pos = w => w.cells[0];
    order = P.words.map((w, k) => k).sort((x, y) => {
      const a = P.words[x], b = P.words[y];
      if (a.dir !== b.dir) return a.dir === 'a' ? -1 : 1;
      if (a.dir === 'a') return pos(a) - pos(b);
      const ca = pos(a) % P.w, cb = pos(b) % P.w;
      return ca - cb || pos(a) - pos(b);
    });
  }

  function newState() {
    return {
      entries: P.grid.map(() => ''), marks: P.grid.map(() => 0),
      time: 0, checks: 0, reveals: 0, done: false, counted: false,
      sel: { i: P.words[order[0]].cells[0], dir: P.words[order[0]].dir },
    };
  }

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function startGame(size, seed, daily) {
    showBusy(true);
    setTimeout(() => {
      const p = gen.generate(size, seed);
      showBusy(false);
      if (!p) { toast('No se pudo preparar ese autodefinido. Prueba otro.'); return; }
      if (S && !S.done && !S.counted && P && progress() > 0) countLoss();
      P = p; P.daily = daily || '';
      index();
      S = newState();
      cfg.size = size; save('ad.cfg', cfg);
      paused = false; $('pauseCover').classList.remove('show');
      layout(); persist(); refresh();
    }, 40);
  }

  function countLoss() {
    const st = stats[P.size] = stats[P.size] || {};
    st.played = (st.played || 0) + 1;
    S.counted = true;
    save('ad.stats', stats);
  }

  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save('ad.game', { v: 1, P, S }), 250);
  }

  // ---------- Selección y movimiento ----------
  const word = () => P.words[at[S.sel.i][S.sel.dir]];
  const isLetter = i => P.grid[i] !== '#';

  function select(i, dir) {
    if (!isLetter(i)) return;
    if (dir && at[i][dir] < 0) dir = null;
    if (!dir) dir = at[i][S.sel.dir] >= 0 ? S.sel.dir : (at[i].a >= 0 ? 'a' : 'd');
    S.sel = { i, dir };
    refresh();
  }

  function selectWord(k, preferEmpty) {
    const w = P.words[k];
    let i = w.cells[0];
    if (preferEmpty) { const e = w.cells.find(c => !S.entries[c]); if (e != null) i = e; }
    S.sel = { i, dir: w.dir };
    refresh();
  }

  function tapCell(i) {
    if (S.done && !isLetter(i)) return;
    if (isLetter(i)) {
      if (i === S.sel.i) {
        const other = S.sel.dir === 'a' ? 'd' : 'a';
        if (at[i][other] >= 0) S.sel.dir = other;
        refresh();
      } else select(i);
      return;
    }
    const list = defsAt[i];
    if (!list) return;
    const cur = at[S.sel.i][S.sel.dir];
    const k = list.length > 1 && list[0] === cur ? list[1] : list[0];
    selectWord(k, true);
  }

  function stepWord(delta) {
    const cur = at[S.sel.i][S.sel.dir];
    let pos = order.indexOf(cur);
    pos = (pos + delta + order.length) % order.length;
    selectWord(order[pos], true);
  }

  // Siguiente palabra con huecos (en el orden de recorrido)
  function nextOpenWord() {
    const cur = at[S.sel.i][S.sel.dir];
    const start = order.indexOf(cur);
    for (let n = 1; n <= order.length; n++) {
      const k = order[(start + n) % order.length];
      if (P.words[k].cells.some(c => !S.entries[c])) return k;
    }
    return -1;
  }

  function advance() {
    const w = word();
    const p = w.cells.indexOf(S.sel.i);
    if (cfg.skipFilled) {
      for (let q = p + 1; q < w.cells.length; q++) if (!S.entries[w.cells[q]]) { S.sel.i = w.cells[q]; return; }
      // huecos anteriores en la misma palabra
      if (w.cells.some(c => !S.entries[c]) && !cfg.autoAdv) { S.sel.i = w.cells.find(c => !S.entries[c]); return; }
    } else if (p + 1 < w.cells.length) { S.sel.i = w.cells[p + 1]; return; }
    if (cfg.autoAdv) {
      const k = nextOpenWord();
      if (k >= 0) {
        const nw = P.words[k];
        S.sel = { i: nw.cells.find(c => !S.entries[c]), dir: nw.dir };
      }
    }
  }

  function type(L) {
    if (!S || S.done || paused || modalOpen) return;
    const i = S.sel.i;
    if (S.marks[i] === 2) { advance(); refresh(); return; } // revelada: no se cambia
    S.entries[i] = L;
    S.marks[i] = cfg.autoCheck && L !== P.grid[i] ? 1 : 0;
    if (cfg.autoCheck) completedFlash(i);
    advance();
    afterChange();
  }

  function erase() {
    if (!S || S.done || paused || modalOpen) return;
    const i = S.sel.i;
    if (S.entries[i] && S.marks[i] !== 2) {
      S.entries[i] = ''; S.marks[i] = 0;
    } else {
      const w = word();
      const p = w.cells.indexOf(i);
      if (p > 0) {
        const j = w.cells[p - 1];
        S.sel.i = j;
        if (S.marks[j] !== 2) { S.entries[j] = ''; S.marks[j] = 0; }
      }
    }
    afterChange();
  }

  function moveArrow(dr, dc) {
    let r = Math.floor(S.sel.i / P.w), c = S.sel.i % P.w;
    const dir = dc ? 'a' : 'd';
    for (;;) {
      r += dr; c += dc;
      if (r < 0 || c < 0 || r >= P.h || c >= P.w) return;
      const i = r * P.w + c;
      if (isLetter(i)) { select(i, at[i][dir] >= 0 ? dir : null); return; }
    }
  }

  function afterChange() {
    persist();
    if (P.grid.every((v, i) => v === '#' || S.entries[i] === v)) return win();
    refresh();
  }

  // Con comprobación automática: destello verde al completar bien una palabra.
  function completedFlash(i) {
    for (const dir of ['a', 'd']) {
      const k = at[i][dir];
      if (k < 0) continue;
      const w = P.words[k];
      if (w.cells.every(c => S.entries[c] === P.grid[c])) {
        flash = { cells: new Set(w.cells), until: performance.now() + 600, color: 'good' };
        beep(660, 0.06);
      }
    }
  }

  function progress() {
    let n = 0, f = 0;
    P.grid.forEach((v, i) => { if (v !== '#') { n++; if (S.entries[i]) f++; } });
    return n ? f / n : 0;
  }

  // ---------- Ayudas ----------
  function check(cells) {
    let bad = 0, empty = 0;
    for (const i of cells) {
      if (!S.entries[i]) { empty++; continue; }
      if (S.entries[i] !== P.grid[i]) { S.marks[i] = 1; bad++; } else if (S.marks[i] !== 2) S.marks[i] = 3;
    }
    S.checks++;
    toast(bad ? `${bad} ${bad === 1 ? 'letra mal' : 'letras mal'}` : (empty ? 'De momento, todo bien' : '¡Todo correcto!'));
    persist(); refresh();
  }

  function reveal(cells) {
    let n = 0;
    for (const i of cells) {
      if (S.entries[i] === P.grid[i] && S.marks[i] !== 1) continue;
      S.entries[i] = P.grid[i]; S.marks[i] = 2; n++;
    }
    if (n) S.reveals += n;
    afterChange();
  }

  const letterCells = () => P.grid.map((v, i) => i).filter(isLetter);

  // ---------- Final ----------
  function win() {
    S.done = true;
    const st = stats[P.size] = stats[P.size] || {};
    if (!S.counted) {
      S.counted = true;
      st.played = (st.played || 0) + 1;
      st.won = (st.won || 0) + 1;
      st.total = (st.total || 0) + S.time;
      const clean = !S.reveals && !S.checks;
      let rec = false;
      if (!st.best || S.time < st.best) { st.best = S.time; rec = true; }
      if (clean) { st.clean = (st.clean || 0) + 1; }
      S.record = rec;
      if (P.daily) {
        const d = stats.daily;
        const y = new Date(); y.setDate(y.getDate() - 1);
        if (d.last !== P.daily) {
          d.streak = d.last === todayKey(y) && P.daily === todayKey() ? d.streak + 1 : 1;
          d.last = P.daily;
          d.best = Math.max(d.best || 0, d.streak);
        }
      }
      save('ad.stats', stats);
    }
    persist();
    flash = { cells: new Set(letterCells()), until: performance.now() + 900, color: 'good' };
    refresh();
    chime();
    setTimeout(winSheet, 700);
  }

  function winSheet() {
    const st = stats[P.size];
    const helps = S.reveals || S.checks;
    sheet(`
      <h2>¡Completado!</h2>
      <p>${P.daily ? 'Autodefinido del día terminado.' : `Autodefinido ${SIZES[P.size].name.toLowerCase()} nº ${P.seed} terminado.`}
      ${helps ? '' : ' Sin ninguna ayuda.'}</p>
      <div class="res">
        <div><b>${fmt(S.time)}</b><small>Tiempo</small>${S.record ? '<em>¡Récord!</em>' : ''}</div>
        <div><b>${P.words.length}</b><small>Palabras</small></div>
        <div><b>${S.reveals}</b><small>Letras reveladas</small></div>
        <div><b>${S.checks}</b><small>Comprobaciones</small></div>
      </div>
      <p style="opacity:.75">Completados en este tamaño: ${st.won || 0}. Mejor tiempo: ${st.best ? fmt(st.best) : '—'}.
      ${P.daily ? ` Racha diaria: ${stats.daily.streak} ${stats.daily.streak === 1 ? 'día' : 'días'}.` : ''}</p>
      <div class="row-btns">
        <button class="btn" data-a="close">Ver tablero</button>
        <button class="btn primary" data-a="newSame">Otro igual</button>
      </div>`);
  }

  // ---------- Dibujo ----------
  const cv = $('board'), ctx = cv.getContext('2d');
  let geo = null; // {x0,y0,cs,dpr}
  let colors = {};
  const fitCache = new Map();

  function readColors() {
    const cs = getComputedStyle(document.body);
    for (const k of ['bg', 'paper', 'ink', 'clue', 'clue-ink', 'line', 'word', 'cur', 'clue-sel', 'bad', 'reveal', 'good'])
      colors[k] = cs.getPropertyValue('--' + k).trim();
    fitCache.clear();
  }

  function layout() {
    const r = $('stage').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    if (!P) return;
    const pad = 10;
    const cs = Math.floor(Math.min((r.width - pad * 2) / P.w, (r.height - pad * 2) / P.h));
    geo = { cs, dpr, x0: Math.round((r.width - cs * P.w) / 2), y0: Math.round((r.height - cs * P.h) / 2) };
  }

  // Ajusta el texto de una definición a un rectángulo: busca el mayor tamaño de letra que quepa.
  function fit(text, w, h) {
    const key = text + '|' + w + '|' + h;
    if (fitCache.has(key)) return fitCache.get(key);
    const maxPx = Math.min(h * 0.42, w * 0.26) * cfg.clueScale;
    let best = null;
    for (let px = Math.max(6, Math.floor(maxPx)); px >= 6; px -= 0.5) {
      ctx.font = `600 ${px}px system-ui, Roboto, sans-serif`;
      const lines = wrap(text, w, px >= 7);
      if (lines && lines.length * px * 1.08 <= h) { best = { px, lines }; break; }
    }
    if (!best) {
      ctx.font = '600 6px system-ui, Roboto, sans-serif';
      best = { px: 6, lines: wrap(text, w, false) };
    }
    fitCache.set(key, best);
    return best;
  }

  function wrap(text, w, strict) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (ctx.measureText(t).width <= w) { line = t; continue; }
      if (line) lines.push(line);
      if (ctx.measureText(wd).width <= w) { line = wd; continue; }
      if (strict) return null; // palabra demasiado larga: probar con letra más pequeña
      // partir la palabra con guion
      let part = '';
      for (const ch of wd) {
        if (ctx.measureText(part + ch + '-').width > w && part) { lines.push(part + '-'); part = ''; }
        part += ch;
      }
      line = part;
    }
    if (line) lines.push(line);
    return lines;
  }

  function draw() {
    if (!P || !geo) return;
    const { cs, dpr, x0, y0 } = geo;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (paused) return;
    const W = P.w;
    const curW = at[S.sel.i] ? word() : null;
    const inWord = new Set(curW && !S.done ? curW.cells : []);
    const now = performance.now();
    const fl = flash && flash.until > now ? flash : null;

    ctx.fillStyle = colors.line;
    ctx.fillRect(x0 - 2, y0 - 2, cs * W + 4, cs * P.h + 4);

    for (let i = 0; i < P.grid.length; i++) {
      const r = Math.floor(i / W), c = i % W;
      const x = x0 + c * cs, y = y0 + r * cs;
      if (P.grid[i] === '#') { drawClueCell(i, x, y, cs, curW); continue; }
      let bg = colors.paper;
      if (inWord.has(i)) bg = colors.word;
      if (i === S.sel.i && !S.done) bg = colors.cur;
      if (fl && fl.cells.has(i)) bg = mix(bg, colors[fl.color], 0.35);
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, cs, cs);
      const L = S.entries[i];
      if (L) {
        const m = S.marks[i];
        ctx.fillStyle = m === 1 ? colors.bad : m === 2 ? colors.reveal : colors.ink;
        ctx.font = `700 ${Math.round(cs * 0.56)}px system-ui, Roboto, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(L, x + cs / 2, y + cs * 0.54);
        if (m === 1) { // tachado en diagonal
          ctx.strokeStyle = colors.bad; ctx.lineWidth = Math.max(1.5, cs * 0.03);
          ctx.beginPath(); ctx.moveTo(x + cs * 0.18, y + cs * 0.82); ctx.lineTo(x + cs * 0.82, y + cs * 0.18); ctx.stroke();
        }
        if (m === 2) { // esquina de letra revelada
          ctx.fillStyle = colors.reveal;
          ctx.beginPath(); ctx.moveTo(x + cs, y); ctx.lineTo(x + cs, y + cs * 0.2); ctx.lineTo(x + cs - cs * 0.2, y); ctx.fill();
        }
      }
    }
    // rejilla
    ctx.strokeStyle = colors.line; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < W; c++) { ctx.moveTo(x0 + c * cs + 0.5, y0); ctx.lineTo(x0 + c * cs + 0.5, y0 + P.h * cs); }
    for (let r = 1; r < P.h; r++) { ctx.moveTo(x0, y0 + r * cs + 0.5); ctx.lineTo(x0 + W * cs, y0 + r * cs + 0.5); }
    ctx.stroke();
    if (fl) requestAnimationFrame(draw);
  }

  function drawClueCell(i, x, y, cs, curW) {
    ctx.fillStyle = colors.clue;
    ctx.fillRect(x, y, cs, cs);
    const list = defsAt[i];
    if (!list) { // casilla de esquina o sin definición
      if (i === 0) {
        ctx.fillStyle = colors['clue-ink']; ctx.globalAlpha = 0.25;
        ctx.font = `700 ${Math.round(cs * 0.34)}px Georgia, serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('A·D', x + cs / 2, y + cs / 2);
        ctx.globalAlpha = 1;
      }
      return;
    }
    const n = list.length;
    const sorted = list.slice().sort((a, b) => (P.words[a].dir === 'a' ? -1 : 1));
    sorted.forEach((k, j) => {
      const w = P.words[k];
      const hy = y + (cs / n) * j, hh = cs / n;
      if (curW === w && !S.done) { ctx.fillStyle = colors['clue-sel']; ctx.fillRect(x, hy, cs, hh); }
      const padX = cs * 0.06, padY = cs * 0.04;
      const f = fit(w.clue, cs - padX * 2 - cs * 0.06, hh - padY * 2);
      ctx.fillStyle = colors['clue-ink'];
      ctx.font = `600 ${f.px}px system-ui, Roboto, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lh = f.px * 1.08;
      const top = hy + hh / 2 - (f.lines.length * lh) / 2 + lh / 2;
      f.lines.forEach((ln, q) => ctx.fillText(ln, x + cs / 2 - cs * 0.02, top + q * lh));
      // flecha
      const a = Math.max(3, cs * 0.07);
      ctx.beginPath();
      if (w.dir === 'a') {
        const my = hy + hh / 2;
        ctx.moveTo(x + cs - 1, my); ctx.lineTo(x + cs - 1 - a, my - a * 0.8); ctx.lineTo(x + cs - 1 - a, my + a * 0.8);
      } else {
        const mx = x + cs / 2, by = hy + hh - 1;
        ctx.moveTo(mx, by); ctx.lineTo(mx - a * 0.8, by - a); ctx.lineTo(mx + a * 0.8, by - a);
      }
      ctx.fill();
      if (j > 0) {
        ctx.strokeStyle = colors['clue-ink']; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + cs * 0.1, hy + 0.5); ctx.lineTo(x + cs * 0.9, hy + 0.5); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
  }

  function mix(a, b, t) {
    const p = s => { const m = s.replace('#', ''); return [0, 2, 4].map(k => parseInt(m.substr(k, 2), 16)); };
    try {
      const A = p(a), B = p(b);
      return 'rgb(' + A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(',') + ')';
    } catch (e) { return a; }
  }

  // ---------- Panel de definición ----------
  function refreshClue() {
    if (!P) return;
    const w = word();
    const arrow = w.dir === 'a' ? 'Horizontal →' : 'Vertical ↓';
    $('cDir').textContent = `${arrow} · ${w.cells.length} letras`;
    $('cText').textContent = w.clue;
    const other = at[S.sel.i][w.dir === 'a' ? 'd' : 'a'];
    const ow = other >= 0 ? P.words[other] : null;
    $('cCross').textContent = ow ? `${ow.dir === 'a' ? '→' : '↓'} ${ow.clue} (${ow.cells.length})` : '';
    $('cCross').style.visibility = ow ? 'visible' : 'hidden';
  }

  function refresh() {
    if (!P) return;
    $('hSub').textContent = P.daily ? `Del día · ${P.daily.split('-').reverse().join('/')}` :
      `${SIZES[P.size].name} · nº ${P.seed}`;
    $('sProg').textContent = Math.floor(progress() * 100) + '%';
    $('sTime').textContent = fmt(S.time);
    $('bCheck').disabled = $('bHelp').disabled = S.done;
    refreshClue();
    draw();
  }

  // ---------- Teclado en pantalla ----------
  function buildKbd() {
    const rows = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
    const k = $('kbd');
    k.innerHTML = '';
    rows.forEach((row, n) => {
      const d = document.createElement('div');
      d.className = 'row';
      for (const ch of row) {
        const b = document.createElement('button');
        b.textContent = ch; b.dataset.k = ch;
        d.appendChild(b);
      }
      if (n === 2) {
        const sw = document.createElement('button');
        sw.className = 'wide'; sw.dataset.k = 'dir'; sw.setAttribute('aria-label', 'Cambiar dirección');
        sw.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 4v13m0 0-3-3m3 3 3-3M13 7h7m0 0-3-3m3 3-3 3"/></svg>';
        d.insertBefore(sw, d.firstChild);
        const bs = document.createElement('button');
        bs.className = 'wide'; bs.dataset.k = 'del'; bs.setAttribute('aria-label', 'Borrar');
        bs.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12z"/><path d="m12 9 6 6m0-6-6 6"/></svg>';
        d.appendChild(bs);
      }
      k.appendChild(d);
    });
    k.addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      const v = b.dataset.k;
      if (v === 'del') erase();
      else if (v === 'dir') tapCell(S.sel.i);
      else type(v);
    });
  }

  // ---------- Ventanas ----------
  function sheet(html, wide) {
    $('sheet').innerHTML = html;
    $('modal').classList.add('show');
    modalOpen = true;
  }
  function closeSheet() {
    $('modal').classList.remove('show');
    modalOpen = false;
  }
  $('modal').addEventListener('click', e => {
    if (e.target === $('modal')) { closeSheet(); return; }
    const b = e.target.closest('[data-a]');
    if (b) action(b.dataset.a, b);
  });

  function menuSheet() {
    sheet(`<h2>Menú</h2><div class="menu-list">
      <button class="btn" data-a="new">${ico('M12 5v14M5 12h14')}Nuevo autodefinido</button>
      <button class="btn" data-a="daily">${ico('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z')}Autodefinido del día</button>
      <button class="btn" data-a="byNum">${ico('M4 9h16M4 15h16M10 3 8 21M16 3l-2 18')}Partida por número</button>
      <button class="btn" data-a="restart">${ico('M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5')}Empezar de nuevo este</button>
      <button class="btn" data-a="stats">${ico('M4 20V10M10 20V4M16 20v-7M22 20H2')}Estadísticas</button>
      <button class="btn" data-a="settings">${ico('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')}Ajustes</button>
      <button class="btn" data-a="howto">${ico('M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z')}Cómo se juega</button>
    </div><div class="row-btns"><button class="btn" data-a="close">Cerrar</button></div>`);
  }
  const ico = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

  function miniGrid(size) {
    const S2 = SIZES[size];
    let h = `<div class="mini" style="grid-template-columns:repeat(${S2.w},8px)">`;
    for (let r = 0; r < S2.h; r++) for (let c = 0; c < S2.w; c++) {
      const clue = !r || !c || ((r * 7 + c * 3) % 5 === 0 && r > 1 && c > 1);
      h += `<i class="${clue ? 'c' : ''}"></i>`;
    }
    return h + '</div>';
  }

  function newSheet() {
    sheet(`<h2>Nuevo autodefinido</h2>
      <p>Elige el tamaño. Cada partida se genera al momento y tiene un número para poder repetirla.</p>
      <div class="sizes">${['s', 'm', 'l'].map(k => `
        <button class="size ${k === cfg.size ? 'cur' : ''}" data-a="go" data-size="${k}">
          ${miniGrid(k)}<b>${SIZES[k].name}</b><small>${SIZES[k].w}×${SIZES[k].h}</small></button>`).join('')}
      </div>
      <div class="row-btns"><button class="btn" data-a="daily">Autodefinido del día</button><button class="btn" data-a="close">Cancelar</button></div>`);
  }

  function helpSheet() {
    sheet(`<h2>Ayudas</h2>
      <p>Comprobar marca en rojo las letras equivocadas. Revelar escribe la letra correcta en azul.</p>
      <div class="grid2">
        <button class="btn" data-a="chkL">Comprobar letra</button>
        <button class="btn" data-a="revL">Revelar letra</button>
        <button class="btn" data-a="chkW">Comprobar palabra</button>
        <button class="btn" data-a="revW">Revelar palabra</button>
        <button class="btn" data-a="chkA">Comprobar todo</button>
        <button class="btn danger" data-a="revA">Resolver todo</button>
      </div>
      <div class="row-btns"><button class="btn" data-a="clearBad">Borrar errores</button><button class="btn" data-a="close">Cerrar</button></div>`);
  }

  function statsSheet() {
    let rows = '', T = { played: 0, won: 0, clean: 0 };
    for (const k of ['s', 'm', 'l']) {
      const st = stats[k] || {};
      T.played += st.played || 0; T.won += st.won || 0; T.clean += st.clean || 0;
      rows += `<tr><td>${SIZES[k].name}</td><td>${st.played || 0}</td><td>${st.won || 0}</td><td>${st.clean || 0}</td>
        <td>${st.best ? fmt(st.best) : '—'}</td><td>${st.won ? fmt(Math.round(st.total / st.won)) : '—'}</td></tr>`;
    }
    sheet(`<h2>Estadísticas</h2>
      <table class="st"><tr><th>Tamaño</th><th>Jugados</th><th>Hechos</th><th>Sin ayuda</th><th>Mejor</th><th>Media</th></tr>
      ${rows}<tr><td><b>Total</b></td><td><b>${T.played}</b></td><td><b>${T.won}</b></td><td><b>${T.clean}</b></td><td></td><td></td></tr></table>
      <h3>Autodefinido del día</h3>
      <p>Racha actual: <b>${stats.daily.streak || 0}</b> · Mejor racha: <b>${stats.daily.best || 0}</b>${stats.daily.last ? ` · Último: ${stats.daily.last.split('-').reverse().join('/')}` : ''}</p>
      <div class="row-btns"><button class="btn danger" data-a="resetStats">Borrar estadísticas</button><button class="btn" data-a="close">Cerrar</button></div>`);
  }

  function settingsSheet() {
    const sw = (k, label, hint) => `<label class="set"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
      <input type="checkbox" class="switch" data-a="cfg" data-k="${k}" ${cfg[k] ? 'checked' : ''}></label>`;
    const seg = (k, label, opts) => `<div class="set"><span>${label}</span><div class="seg">${opts.map(([v, t]) =>
      `<button data-a="seg" data-k="${k}" data-v="${v}" class="${String(cfg[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
    sheet(`<h2>Ajustes</h2>
      ${seg('theme', 'Aspecto', [['claro', 'Claro'], ['sepia', 'Sepia'], ['oscuro', 'Oscuro']])}
      ${seg('clueScale', 'Letra de las definiciones', [[0.85, 'Pequeña'], [1, 'Normal'], [1.2, 'Grande']])}
      ${sw('autoCheck', 'Comprobar al escribir', 'Marca en rojo cada letra equivocada (cuenta como ayuda)')}
      ${sw('autoAdv', 'Saltar a la siguiente palabra', 'Al acabar una palabra, pasa a la siguiente con huecos')}
      ${sw('skipFilled', 'Saltar casillas rellenas')}
      ${sw('kbd', 'Teclado en pantalla', 'Desactívalo si usas un teclado físico')}
      ${sw('sound', 'Sonido')}
      <div class="row-btns"><button class="btn primary" data-a="close">Hecho</button></div>`);
  }

  function howtoSheet() {
    sheet(`<h2>Cómo se juega</h2>
      <p>Cada casilla de color tiene una o dos <b>definiciones</b>. La flechita indica hacia dónde va la respuesta:
      <b>→</b> hacia la derecha o <b>↓</b> hacia abajo, empezando en la casilla de al lado.</p>
      <h3>Escribir</h3>
      <ul>
        <li>Toca una casilla blanca para seleccionarla. Tócala otra vez para cambiar entre horizontal y vertical.</li>
        <li>Toca una definición para ir a su palabra. Si la casilla tiene dos, vuelve a tocar para cambiar.</li>
        <li>Arriba a la derecha (o abajo, en vertical) ves la definición completa y la de la palabra que se cruza.</li>
        <li>Con <b>‹ ›</b> pasas de una definición a otra.</li>
      </ul>
      <h3>Reglas</h3>
      <ul>
        <li>Las palabras van sin tildes. La Ñ cuenta como letra.</li>
        <li>Como en los pasatiempos de siempre, hay símbolos químicos, números romanos, notas musicales y alguna abreviatura.</li>
        <li>Alguna letra suelta pertenece a una sola palabra.</li>
      </ul>
      <h3>Ayudas</h3>
      <ul>
        <li><b>Comprobar</b> marca en rojo las letras equivocadas de la palabra actual (desde Ayudas, también la letra o todo el tablero).</li>
        <li><b>Revelar</b> escribe la letra correcta en azul.</li>
        <li>Las partidas sin ninguna ayuda cuentan aparte en las estadísticas.</li>
      </ul>
      <p>Hay un <b>autodefinido del día</b>, igual para todo el día, que lleva la cuenta de tu racha.</p>
      <div class="row-btns"><button class="btn primary" data-a="close">Entendido</button></div>`);
  }

  function byNumSheet() {
    sheet(`<h2>Partida por número</h2>
      <p>El mismo número y tamaño dan siempre el mismo autodefinido.</p>
      <input class="num" id="numIn" type="number" inputmode="numeric" min="1" max="999999" value="${P ? P.seed : 1}">
      <div class="sizes" style="margin-top:12px">${['s', 'm', 'l'].map(k => `
        <button class="size ${k === (P ? P.size : cfg.size) ? 'cur' : ''}" data-a="pickSize" data-size="${k}"><b>${SIZES[k].name}</b><small>${SIZES[k].w}×${SIZES[k].h}</small></button>`).join('')}</div>
      <div class="row-btns"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="goNum">Jugar</button></div>`);
  }

  function confirmSheet(text, yes, label) {
    sheet(`<h2>¿Seguro?</h2><p>${text}</p><div class="row-btns">
      <button class="btn" data-a="close">Cancelar</button><button class="btn danger" data-a="${yes}">${label}</button></div>`);
  }

  const randSeed = () => 1 + Math.floor(Math.random() * 999999);
  const dailySeed = d => { const [y, m, dd] = d.split('-').map(Number); return (y * 372 + m * 31 + dd) % 999983 + 1; };

  function action(a, el) {
    const w = S && word();
    switch (a) {
      case 'close': closeSheet(); break;
      case 'new': newSheet(); break;
      case 'go': closeSheet(); startGame(el.dataset.size, randSeed()); break;
      case 'newSame': closeSheet(); startGame(P.size, randSeed()); break;
      case 'daily': {
        closeSheet();
        const d = todayKey();
        if (P && P.daily === d) { toast('Ya estás en el autodefinido de hoy'); break; }
        startGame('m', dailySeed(d), d); break;
      }
      case 'byNum': byNumSheet(); break;
      case 'pickSize':
        document.querySelectorAll('#sheet .size').forEach(b => b.classList.toggle('cur', b === el)); break;
      case 'goNum': {
        const n = parseInt($('numIn').value, 10);
        if (!(n >= 1 && n <= 999999)) { toast('Escribe un número entre 1 y 999999'); break; }
        const cur = document.querySelector('#sheet .size.cur');
        closeSheet(); startGame(cur ? cur.dataset.size : 'm', n); break;
      }
      case 'restart': confirmSheet('Se borrarán todas las letras de este autodefinido.', 'doRestart', 'Empezar de nuevo'); break;
      case 'doRestart': closeSheet(); S = newState(); persist(); refresh(); break;
      case 'stats': statsSheet(); break;
      case 'resetStats': confirmSheet('Se borrarán todas las estadísticas.', 'doResetStats', 'Borrar'); break;
      case 'doResetStats':
        for (const k of ['s', 'm', 'l']) stats[k] = {};
        stats.daily = { last: '', streak: 0, best: 0 };
        save('ad.stats', stats); statsSheet(); break;
      case 'settings': settingsSheet(); break;
      case 'howto': howtoSheet(); save('ad.seenHelp', 1); break;
      case 'cfg':
        cfg[el.dataset.k] = el.checked; save('ad.cfg', cfg); applyCfg();
        if (el.dataset.k === 'autoCheck' && el.checked && S && !S.done) {
          S.checks++;
          P.grid.forEach((v, i) => { if (v !== '#' && S.entries[i] && S.entries[i] !== v) S.marks[i] = 1; });
          persist();
        }
        refresh(); break;
      case 'seg':
        cfg[el.dataset.k] = el.dataset.k === 'clueScale' ? parseFloat(el.dataset.v) : el.dataset.v;
        save('ad.cfg', cfg); applyCfg(); settingsSheet(); break;
      case 'chkL': closeSheet(); check([S.sel.i]); break;
      case 'chkW': closeSheet(); check(w.cells); break;
      case 'chkA': closeSheet(); check(letterCells()); break;
      case 'revL': closeSheet(); reveal([S.sel.i]); break;
      case 'revW': closeSheet(); reveal(w.cells); break;
      case 'revA': confirmSheet('Se escribirán todas las respuestas y la partida no contará como hecha sin ayuda.', 'doRevA', 'Resolver'); break;
      case 'doRevA': closeSheet(); reveal(letterCells()); break;
      case 'clearBad': {
        closeSheet();
        let n = 0;
        P.grid.forEach((v, i) => { if (S.marks[i] === 1) { S.entries[i] = ''; S.marks[i] = 0; n++; } });
        toast(n ? `Borradas ${n} letras` : 'No hay letras marcadas como error');
        persist(); refresh(); break;
      }
    }
  }

  function applyCfg() {
    document.body.dataset.theme = cfg.theme;
    document.body.classList.toggle('nokbd', !cfg.kbd);
    readColors();
    requestAnimationFrame(() => { layout(); draw(); });
  }

  // ---------- Pausa, tiempo, sonido ----------
  function setPause(v) {
    if (!P || S.done) v = false;
    paused = v;
    $('pauseCover').classList.toggle('show', v);
    draw();
  }

  setInterval(() => {
    if (!P || !S || S.done || paused || modalOpen || document.hidden) return;
    if (!S.entries.some(Boolean)) return; // el reloj empieza con la primera letra
    S.time++;
    $('sTime').textContent = fmt(S.time);
    if (S.time % 10 === 0) persist();
  }, 1000);

  let audio = null;
  function beep(freq, dur, delay) {
    if (!cfg.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + (delay || 0);
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + dur + 0.2);
    } catch (e) { /* sin audio */ }
  }
  function chime() { [523, 659, 784, 1047].forEach((f, k) => beep(f, 0.12, k * 0.11)); }

  const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  let toastTimer = 0;
  function toast(t) {
    const el = $('toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function showBusy(v) { $('busy').classList.toggle('show', v); }

  // ---------- Eventos ----------
  cv.addEventListener('pointerdown', e => {
    if (!P || !geo || paused) return;
    const r = cv.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left - geo.x0) / geo.cs), rr = Math.floor((e.clientY - r.top - geo.y0) / geo.cs);
    if (c < 0 || rr < 0 || c >= P.w || rr >= P.h) return;
    e.preventDefault();
    tapCell(rr * P.w + c);
  });

  $('bMenu').onclick = menuSheet;
  $('bNew').onclick = newSheet;
  $('bHelp').onclick = () => S && !S.done && helpSheet();
  $('bCheck').onclick = () => S && !S.done && check(word().cells);
  $('bPause').onclick = () => setPause(!paused);
  $('bResume').onclick = () => setPause(false);
  $('bPrev').onclick = () => P && stepWord(-1);
  $('bNext').onclick = () => P && stepWord(1);

  document.addEventListener('keydown', e => {
    if (modalOpen) { if (e.key === 'Escape') closeSheet(); return; }
    if (!P || e.ctrlKey || e.metaKey || e.altKey) return;
    if (paused) { if (e.key === ' ' || e.key === 'Escape') setPause(false); return; }
    const k = e.key;
    if (/^[a-zñA-ZÑ]$/.test(k)) { type(k.toUpperCase()); e.preventDefault(); return; }
    switch (k) {
      case 'Backspace': case 'Delete': erase(); break;
      case 'ArrowLeft': moveArrow(0, -1); break;
      case 'ArrowRight': moveArrow(0, 1); break;
      case 'ArrowUp': moveArrow(-1, 0); break;
      case 'ArrowDown': moveArrow(1, 0); break;
      case ' ': tapCell(S.sel.i); break;
      case 'Tab': stepWord(e.shiftKey ? -1 : 1); break;
      case 'Enter': stepWord(1); break;
      case 'Escape': setPause(true); break;
      default: return;
    }
    e.preventDefault();
  });

  window.addEventListener('resize', () => { layout(); draw(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && P && !S.done) { setPause(true); persist(); } });

  // Llamadas desde la app Android
  window.appBack = function () {
    if (modalOpen) { closeSheet(); return true; }
    if (paused) { setPause(false); return true; }
    return false;
  };
  window.appPause = function () { if (P && !S.done) setPause(true); if (P) save('ad.game', { v: 1, P, S }); };

  // ---------- Arranque ----------
  buildKbd();
  applyCfg();
  const saved = load('ad.game', null);
  if (saved && saved.v === 1 && saved.P && saved.S) {
    P = saved.P; S = saved.S;
    index();
    layout();
    if (!S.done && S.entries.some(Boolean)) setPause(true);
    refresh();
  } else {
    startGame(cfg.size, randSeed());
  }
  requestAnimationFrame(() => { layout(); draw(); });
  if (!load('ad.seenHelp', 0)) { save('ad.seenHelp', 1); setTimeout(howtoSheet, 300); }

  window.ADDebug = { get P() { return P; }, get S() { return S; }, gen, type, tapCell, startGame, action, word: () => word() };
})();
