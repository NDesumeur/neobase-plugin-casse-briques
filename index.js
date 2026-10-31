// Casse-briques : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Casse-briques</span><span class=\"hint\" id=\"bkInfo\"></span><div class=\"agNav\"><select class=\"f gSel\" id=\"bkLevel\" title=\"Niveau de départ\"></select></div></div>\n      <div class=\"gameBox g43\"><canvas id=\"bkCanvas\" width=\"320\" height=\"240\"></canvas></div>\n      <div class=\"hint\">Souris ou flèches : raquette · clic ou espace : lancer la balle (et tirer avec les lasers) · P ou Échap : pause · écran titre, ← → : niveau de départ. Capsules : E large, M multi-balle, L lasers, S lente, C colle, F feu, V vie, R courte (piège).</div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.gameBox{display:grid;place-items:center;padding:10px;background:#05010b;box-shadow:0 0 0 3px var(--line2)}
.gameBox canvas{width:min(100%,1152px);aspect-ratio:384/144;image-rendering:pixelated;cursor:var(--cp,pointer)}
.gameBox.tall canvas{width:auto;height:min(720px,72vh);aspect-ratio:240/320}
.gSel{width:auto;font-size:14px;padding:6px 10px;margin-right:8px}
.gameBox.g43 canvas{aspect-ratio:320/240;width:min(100%,calc((100vh - 240px) * 4 / 3))}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "breakoutApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const LEGACY_GAMES = {"top":[],"best":"^breakout"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await folder.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; folder.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pxFont = (g, text, x, y, color, size = 8, align = 'left') => { g.font = size + 'px "Press Start 2P", monospace'; g.textAlign = align; g.fillStyle = '#05010b'; g.fillText(text, x + 1, y + 1); g.fillStyle = color; g.fillText(text, x, y); g.textAlign = 'left'; };

/* ---------- Casse-briques: 12 designed levels then generated ones, bricks with 1 to 3 hits, metal, explosive and bonus bricks, 8 capsules ---------- */
const BK = {W: 320, H: 240, BW: 22, BH: 8, X0: 5, Y0: 26, PY: 224,
  LEVELS: [
    ['.............', '1111111111111', '1111111111111', '2222222222222', '1111111111111'],
    ['......3......', '.....222.....', '....11111....', '...2222*22...', '..111111111..', '.22222222222.'],
    ['1.2.1.2.1.2.1', '.2.1.2.1.2.1.', '1.2.1*2.1.2.1', '.2.1.2.1.2.1.', '1.2.1.2.1.2.1'],
    ['3333333333333', '3#.........#3', '3#.*11111*.#3', '3#.1x222x1.#3', '3#.1122211.#3', '3#.........#3', '3###.....###3'],
    ['....33333....', '..331111133..', '.31111*11113.', '#1111x1x1111#', '.31111111113.', '..331111133..', '....33333....'],
    ['1............', '21...........', '321..........', '#321.........', '.#321...x....', '..#321.......', '...#321......', '....#3211111*'],
    ['3333333333333', '.............', '#22222222222#', '.............', 'x11111*11111x', '.............', '3333333333333'],
    ['..333...333..', '.32223.32223.', '3221123211223', '3211111111123', '.32111x11123.', '..321111123..', '...3211123...', '....32123....', '.....323.....', '......3......'],
    ['#############', '1....1#1....1', '1.##.1#1.##.1', '1.#*.1x1.*#.1', '1.#..222..#.1', '1.#.......#.1', '111###.###111'],
    ['x2x2x2x2x2x2x', '2x2x2x2x2x2x2', '.............', '3333333333333', '33333*3333333'],
    ['3.3.3.3.3.3.3', '2.2.2.2.2.2.2', '2.2.2.*.2.2.2', '1.1.1.1.1.1.1', '#.#.#.#.#.#.#', '1.1.1.1.1.1.1'],
    ['3333333333333', '3###########3', '3#222222222#3', '3#2x22*22x2#3', '3#222222222#3', '3#####.#####3', '3333333333333'],
    ['..1.......1..', '...1.....1...', '..222222222..', '.22.22222.22.', '2222222222222', '2.222222222.2', '2.2.......2.2', '...33...33...'],
    ['....33333....', '..331111133..', '.31133333113.', '3111111111113', '3333*333*3333', '....22222....', '....2x2x2....', '....22222....'],
    ['......3......', '.....333.....', '.....2*2.....', '....22222....', '....2.x.2....', '....22222....', '...#22222#...', '..##.1.1.##..', '......1......'],
    ['3.3.3.3.3.3.3', '.2.2.2.2.2.2.', '3.3.3x3.3.3.3', '.2.2.2.2.2.2.', '3.3.3.3.3x3.3', '.2.2.2*2.2.2.', '3.3.3.3.3.3.3'],
    ['...3333333...', '..333333333..', '.33..333..33.', '.33..3x3..33.', '..333333333..', '...3.3.3.3...', '...3333333...', '....#...#....'],
    ['......3......', '.....323.....', '....32123....', '...321*123...', '..321x1x123..', '...3211123...', '....32123....', '.....323.....', '......3......'],
    ['1.....1.....1', '.1...1.1...1.', '..1.1...1.1..', '...2.....2...', '2.....2.....2', '.2...2x2...2.', '..2.2...2.2..', '...3.....3...'],
    ['#.#.#.#.#.#.#', '2222222222222', '#.#.#*#.#.#.#', '3333333333333', '#.#.#.#.#.#.#', '2222x2222x222', '#.#.#.#.#.#.#'],
    ['.3.........3.', '.33.......33.', '.3333333333..', '.33.333.333..', '.33333x33333.', '..3.33333.3..', '...3333333...', '....2...2....'],
    ['3333333333333', '.33333333333.', '..222222222..', '...2*222*2...', '....11111....', '.....1x1.....', '....11111....', '...2222222...', '..333333333..', '3333333333333'],
    ['....22222....', '..222222222..', '.22..222..22.', '.22..2x2..22.', '.22222222222.', '.22222*22222.', '.22.222.2.22.', '.2...2...2.2.'],
    ['..333333333..', '.33222222233.', '332211111223.', '3221.....1223', '321.......123', '32.........23', '3*.........*3'],
    ['3333333333333', '............3', '.22222222..x3', '.2......2..23', '.2.1111.2..23', '.2.1*.1.2..23', '.2.1..1.2..23', '.2....1....23', '.2222222222.3'],
    ['..33.....33..', '..33.....33..', '..22..#..22..', '..2*..#..*2..', '..22..#..22..', '..22..x..22..', '..11.....11..', '#####...#####'],
    ['......3......', '.....333.....', '3333322233333', '.33322*22333.', '..332222233..', '..3322x2233..', '.333.....333.', '33.........33'],
    ['...3333333...', '...3.*.*.3...', '...3333333...', '.....222.....', '.22222222222.', '.2.2222222.2.', '.2.22x2x22.2.', '...22...22...', '...33...33...'],
    ['3.....3.....3', '33...333...33', '333.33333.333', '3333333333333', '3x33*333*33x3', '2222222222222', '1111111111111'],
    ['..111...111..', '.1...1.1...1.', '.1.x.1.1.*.1.', '..111...111..', '.....222.....', '....2...2....', '....2.x.2....', '.....222.....'],
    ['#############', '#3333333333.#', '#3.........3#', '#3.22222.2.3#', '#3.2*x*2.2.3#', '#3.22222.2.3#', '#3.......2.3#', '#33333333.33#', '####.....####'],
    ['3...3...3...3', '.2...2...2...', '..x...x...x..', '...2...2...2.', '3...3...3...3', '.2...*...2...', '..1...1...1..', '...1...1...1.'],
    ['..333333333..', '.32222222223.', '3211111111123', '3211.....1123', '3211..x..1123', '3211.....1123', '3211111111123', '.32222222223.', '..333333333..'],
    ['#############', '3...#.....#.3', '3.#.#.###.#.3', '3.#...#*#...3', '3.#####.###.3', '3.....x.....3', '###.#####.###', '..2.......2..'],
    ['......33.....', '.....3333....', '....33*33..3.', '...333333.33.', '..3333.33333.', '.33x3...333..', '.33.3...33...', '..2..2..2.2..', '.2..2..2...2.'],
    ['x3x3x3x3x3x3x', '3333333333333', '2222222222222', '3333333333333', '2222*222*2222', '3333333333333', '#.#.#.#.#.#.#'],
    ['....33333....', '..33.....33..', '.3..22222..3.', '3..2.....2..3', '3.2..1x1..2.3', '3..2..*..2..3', '.3..22222..3.', '..33.....33..', '....33333....'],
    ['3#3#3#3#3#3#3', '3333333333333', '#22222222222#', '#2##2x2##222#', '#22222222222#', '#22##2*2##22#', '#22222222222#', '#####...#####'],
    ['1.1.1.1.1.1.1', '2222222222222', '3x3x3x3x3x3x3', '3333333333333', '#3333*3333*3#', '3333333333333', '2222222222222', '##..##.##..##'],
    ['3333333333333', '3###########3', '3#333333333#3', '3#3#######3#3', '3#3#x*x*x#3#3', '3#3#######3#3', '3#333333333#3', '3#####.#####3', '3333333333333'],
  ],
  NAMES: ['Premier contact', 'Pyramide', 'Damier', 'Forteresse', 'Planète', 'Escalier', 'Bandes', 'Cœur', 'Labyrinthe', 'Mèches courtes', 'Colonnes', 'Bastion',
    'Envahisseur', 'Champignon', 'Fusée', 'Damier fou', 'Crâne', 'Diamant', 'Vagues', 'Grille', 'Chat', 'Sablier', 'Fantôme', 'Arc-en-ciel', 'Spirale', 'Tours jumelles', 'Étoile', 'Robot', 'Couronne', 'Bulles', 'Pont-levis', 'Pluie de météores', 'Cible', 'Labyrinthe II', 'Dragon', 'Mur de feu', 'Galaxie', 'Forteresse II', 'Invasion finale', 'Cœur de l\'étoile'],
  DROPS: [['E', 18, '#7fe0ee', 'Raquette large'], ['M', 15, '#ff5ad9', 'Multi-balle'], ['L', 12, '#ff4f6d', 'Lasers'], ['S', 14, '#8ee8a0', 'Balle lente'], ['C', 11, '#ffd07a', 'Colle'], ['F', 8, '#ff9a3c', 'Boule de feu'], ['V', 5, '#ffffff', 'Vie en plus'], ['R', 10, '#8f7bb8', 'Raquette courte']],
  HP: {1: ['#7fe0ee', '#1f8098'], 2: ['#b46aee', '#4a2296'], 3: ['#ff5ad9', '#8a1a7a']},
};
let bk = null;
function bkMap(n) {  // designed levels, then symmetric generated ones that get harder
  if (n <= BK.LEVELS.length) return BK.LEVELS[n - 1];
  const r = seeded(n * 7919), rows = 6 + Math.min(4, Math.floor((n - BK.LEVELS.length) / 3)), out = [];
  for (let y = 0; y < rows; y++) {
    let half = '';
    for (let x = 0; x < 7; x++) { const v = r(); half += v < .12 ? '.' : v < .17 + n * .002 ? '#' : v < .22 ? 'x' : v < .25 ? '*' : String(1 + Math.min(2, Math.floor(r() * (1.4 + n / 10)))); }
    out.push(half + [...half.slice(0, 6)].reverse().join(''));
  }
  return out;
}
function bkLoad() {
  bk.bricks = [];
  bkMap(bk.level).forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') bk.bricks.push({x: BK.X0 + x * (BK.BW + 2), y: BK.Y0 + y * (BK.BH + 2), type: ch, hp: ch === '#' ? Infinity : ch === 'x' || ch === '*' ? 1 : +ch, max: +ch || 1, flash: 0}); }));
  bk.balls = [{x: bk.px, y: BK.PY - 3, vx: 0, vy: 0, stuck: 0}];
  bk.drops = []; bk.bolts = []; bk.lt = 0; bk.lastHit = 0; bk.fx = {wide: 0, narrow: 0, laser: 0, slow: 0, glue: 0, fire: 0};
  bk.banner = {text: 'NIVEAU ' + bk.level, sub: BK.NAMES[bk.level - 1] || 'Secteur ' + bk.level, t: 120};
}
// the level picker: every designed level, the ones not reached yet locked (then « ← → » on the title screen still go further)
function bkLevels() {
  const max = Math.max(1, games?.best.breakoutLvl || 1), n = Math.max(BK.LEVELS.length, max);
  $('bkLevel').replaceChildren(...Array.from({length: n}, (_, i) => { const o = el('option', '', (i + 1) + '. ' + (BK.NAMES[i] || 'Secteur ' + (i + 1)) + (i + 1 > max ? ' 🔒' : '')); o.value = i + 1; o.disabled = i + 1 > max; return o; }));
  if (bk) $('bkLevel').value = String(bk.level);
}
function bkStart(level = 1) {
  bk = bk || {raf: 0};
  Object.assign(bk, {g: $('bkCanvas').getContext('2d'), mode: 'ready', tick: 0, level, lives: 3, score: 0, px: BK.W / 2, target: null, keys: {}, parts: [], shake: 0, cool: 0, overAt: 0,
    stars: Array.from({length: 60}, () => [Math.random() * BK.W, Math.random() * BK.H, Math.random()])});
  bkLoad(); bkLevels();
  gameLoop(bk, 'neodyme:breakout', bkUpdate, bkDraw);
}
const bkPW = () => bk.fx.wide ? 66 : bk.fx.narrow ? 28 : 44;
const bkSpeed = () => (Math.min(3.9, 2.3 + (bk.level - 1) * .12) + Math.min(.6, bk.lt * .00025)) * (bk.fx.slow ? .7 : 1);
function bkBurst(x, y, color, n = 10) { for (let i = 0; i < n; i++) bk.parts.push({x, y, vx: (Math.random() - .5) * 3, vy: (Math.random() - .8) * 2.5, life: 20 + Math.random() * 20, color}); }
function bkHit(k, power) {
  if (k.type === '#') { k.flash = 6; return; }
  k.hp -= power ? 99 : 1; k.flash = 6; bk.score += 10; bk.lastHit = bk.lt;
  if (k.hp > 0) return;
  bk.bricks.splice(bk.bricks.indexOf(k), 1);
  bk.score += 40 + bk.level * 5;
  bkBurst(k.x + BK.BW / 2, k.y + BK.BH / 2, k.type === 'x' ? '#ff9a3c' : (BK.HP[k.max] || BK.HP[1])[0], k.type === 'x' ? 22 : 10);
  if (k.type === '*' || Math.random() < .11) {
    let r = Math.random() * BK.DROPS.reduce((a, d) => a + d[1], 0); const d = BK.DROPS.find(d => (r -= d[1]) < 0);
    bk.drops.push({x: k.x + BK.BW / 2, y: k.y + BK.BH / 2, type: d[0]});
  }
  if (k.type === 'x') { bk.shake = 8; for (const o of bk.bricks.filter(o => Math.abs(o.x - k.x) <= BK.BW + 2 && Math.abs(o.y - k.y) <= BK.BH + 2)) bkHit(o, true); }  // chain reactions
}
function bkCatch(t) {
  const fx = bk.fx;
  if (t === 'E') { fx.wide = 1200; fx.narrow = 0; } if (t === 'R') { fx.narrow = 720; fx.wide = 0; }
  if (t === 'L') fx.laser = 600; if (t === 'S') fx.slow = 720; if (t === 'C') fx.glue = 900; if (t === 'F') fx.fire = 480;
  if (t === 'V') bk.lives = Math.min(6, bk.lives + 1);
  if (t === 'M') bk.balls = bk.balls.flatMap(b => b.stuck != null ? [b] : [b, ...[-.5, .5].map(a => { const c = Math.cos(a), s = Math.sin(a); return {x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c}; })]).slice(0, 12);
  bk.score += 25;
  bk.tip = {text: BK.DROPS.find(d => d[0] === t)[3], t: 70};
}
function bkLaunch() {
  for (const b of bk.balls) if (b.stuck != null) { const a = (b.stuck / (bkPW() / 2)) * .7 || -.25, sp = bkSpeed(); b.vx = sp * Math.sin(a); b.vy = -sp * Math.cos(a); b.stuck = null; }
  if (bk.fx.laser && bk.cool <= 0) { const w = bkPW(); bk.bolts.push({x: bk.px - w / 2 + 3, y: BK.PY - 2}, {x: bk.px + w / 2 - 3, y: BK.PY - 2}); bk.cool = 18; }
}
function bkPress() {  // true when the press started, resumed or restarted the game
  if (!bk) return true;
  if (bk.mode === 'ready' || bk.mode === 'pause') { bk.mode = 'play'; return true; }
  if (bk.mode === 'over') { if (Date.now() - bk.overAt > 700) { bkStart(); bk.mode = 'play'; } return true; }
  bkLaunch(); return false;
}
function bkUpdate() {
  bk.lt++;
  for (const k in bk.fx) if (bk.fx[k] > 0) bk.fx[k]--;
  if (bk.cool > 0) bk.cool--;
  const w = bkPW(), dir = (bk.keys.ArrowRight || bk.keys.d ? 1 : 0) - (bk.keys.ArrowLeft || bk.keys.q || bk.keys.a ? 1 : 0);
  if (dir) { bk.px += dir * 4.5; bk.target = null; } else if (bk.target != null) bk.px += Math.max(-7, Math.min(7, bk.target - bk.px));
  bk.px = Math.max(w / 2 + 2, Math.min(BK.W - w / 2 - 2, bk.px));
  if (bk.fx.laser && bk.keys[' '] && bk.cool <= 0) bkLaunch();
  if (bk.banner) { bk.banner.t--; if (bk.banner.t <= 0) bk.banner = null; }
  if (bk.tip && --bk.tip.t <= 0) bk.tip = null;
  if (bk.clear) { if (--bk.clear <= 0) { bk.clear = 0; bk.level++; best('breakoutLvl', bk.level); saveGames(); bkLoad(); bkLevels(); } return; }
  const sp = bkSpeed();
  for (const b of bk.balls) {
    if (b.stuck != null) { b.x = bk.px + b.stuck; b.y = BK.PY - 3; continue; }
    const cur = Math.hypot(b.vx, b.vy) || 1; b.vx *= sp / cur; b.vy *= sp / cur;
    if (Math.abs(b.vy) < sp * .3) { b.vy = Math.sign(b.vy || -1) * sp * .3; b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy); }  // never stuck going sideways
    const n = Math.ceil(sp / 1.2);
    for (let i = 0; i < n && !b.dead; i++) {
      const ox = b.x, oy = b.y; b.x += b.vx / n; b.y += b.vy / n;
      if (b.x < 3) { b.x = 3; b.vx = Math.abs(b.vx); } if (b.x > BK.W - 3) { b.x = BK.W - 3; b.vx = -Math.abs(b.vx); }
      if (b.y < 16) { b.y = 16; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && b.y + 2 >= BK.PY && oy + 2 <= BK.PY + 2 && b.x >= bk.px - w / 2 - 2 && b.x <= bk.px + w / 2 + 2) {  // the paddle: where it hits sets the angle
        const rel = Math.max(-1, Math.min(1, (b.x - bk.px) / (w / 2))), stuck = bk.lt - (bk.lastHit || 0) > 1200 && bk.bricks.find(k => k.type !== '#');
        const a = stuck ? Math.max(-1.05, Math.min(1.05, Math.atan2(stuck.x + BK.BW / 2 - b.x, BK.PY - stuck.y))) : rel * 1.05;  // 20 s without hitting a brick: this bounce heads for one
        b.vx = sp * Math.sin(a); b.vy = -sp * Math.cos(a); b.y = BK.PY - 2;
        if (bk.fx.glue) b.stuck = b.x - bk.px;
        sfx('click'); break;
      }
      const k = bk.bricks.find(k => b.x + 2 > k.x && b.x - 2 < k.x + BK.BW && b.y + 2 > k.y && b.y - 2 < k.y + BK.BH);
      if (k) {
        if (!(bk.fx.fire && k.type !== '#')) { if (ox + 2 <= k.x || ox - 2 >= k.x + BK.BW) b.vx = -b.vx; else b.vy = -b.vy; b.x = ox; b.y = oy; }
        bkHit(k, bk.fx.fire); break;
      }
      if (b.y > BK.H + 6) b.dead = true;
    }
  }
  bk.balls = bk.balls.filter(b => !b.dead);
  for (const d of bk.drops) { d.y += .9; if (d.y >= BK.PY - 3 && d.y <= BK.PY + 6 && Math.abs(d.x - bk.px) < w / 2 + 6) { d.got = true; bkCatch(d.type); sfx('notify'); } }
  bk.drops = bk.drops.filter(d => !d.got && d.y < BK.H + 8);
  for (const s of bk.bolts) { s.y -= 4; const k = bk.bricks.find(k => s.x > k.x && s.x < k.x + BK.BW && s.y > k.y && s.y < k.y + BK.BH); if (k) { s.dead = true; bkHit(k, false); } }
  bk.bolts = bk.bolts.filter(s => !s.dead && s.y > 14);
  for (const p of bk.parts) { p.x += p.vx; p.y += p.vy; p.vy += .08; p.life--; }
  bk.parts = bk.parts.filter(p => p.life > 0);
  if (bk.shake > 0) bk.shake--;
  if (!bk.balls.length) {
    bk.lives--; bk.shake = 10; sfx('error');
    if (bk.lives <= 0) { bk.mode = 'over'; bk.overAt = Date.now(); const rec = best('breakout', bk.score); bk.record = rec; saveGames(); return; }
    bk.fx = {wide: 0, narrow: 0, laser: 0, slow: 0, glue: 0, fire: 0}; bk.drops = []; bk.lt = 0; bk.lastHit = 0;
    bk.balls = [{x: bk.px, y: BK.PY - 3, vx: 0, vy: 0, stuck: 0}];
  }
  if (!bk.bricks.some(k => k.type !== '#')) { bk.score += 500 + bk.lives * 100; bk.clear = 110; bk.banner = {text: 'NIVEAU ' + bk.level + ' RÉUSSI', sub: '+' + (500 + bk.lives * 100) + ' points', t: 110}; sfx('launch'); }
}
function bkDraw() {
  const g = bk.g, {W, H} = BK;
  g.save(); if (bk.shake) g.translate(Math.round((Math.random() - .5) * bk.shake / 2), Math.round((Math.random() - .5) * bk.shake / 2));
  g.fillStyle = '#07021a'; g.fillRect(-4, -4, W + 8, H + 8);
  for (const [x, y, z] of bk.stars) px(g, z > .7 ? '#8f7bb8' : '#3a2a6e', x, (y + bk.tick * z * .15) % H);
  g.fillStyle = 'rgba(138,92,240,.05)'; for (let x = 0; x < W; x += 16) g.fillRect(x, 14, 1, H); for (let y = 14; y < H; y += 16) g.fillRect(0, y, W, 1);
  px(g, '#2a1d52', 0, 13, W, 1);
  for (const k of bk.bricks) {
    const [hi, lo] = k.type === '#' ? ['#c9bdf0', '#5e4d85'] : k.type === 'x' ? ['#ff9a3c', '#8a3c10'] : k.type === '*' ? ['#ffd07a', '#b8641c'] : BK.HP[Math.min(3, k.hp)];
    const c = k.flash-- > 0 ? '#ffffff' : hi;
    px(g, lo, k.x, k.y, BK.BW, BK.BH); px(g, c, k.x, k.y, BK.BW, BK.BH - 2); px(g, 'rgba(255,255,255,.45)', k.x + 1, k.y + 1, BK.BW - 2, 1);
    if (k.type === '#') { px(g, lo, k.x + 2, k.y + 2, 2, 2); px(g, lo, k.x + BK.BW - 4, k.y + 2, 2, 2); }
    if (k.type === 'x') { px(g, '#3e0f4a', k.x + 9, k.y + 2, 4, 3); px(g, '#ffd07a', k.x + 12, k.y + 1, 1, 1); }
    if (k.type === '*') { px(g, '#fff0c8', k.x + 10, k.y + 1, 2, 4); px(g, '#fff0c8', k.x + 8, k.y + 2, 6, 2); }
    if (k.max > 1 && k.type !== '#' && k.hp < k.max) px(g, 'rgba(5,1,11,.5)', k.x + 5, k.y + 3, 6, 1);  // a crack
  }
  for (const d of bk.drops) { const def = BK.DROPS.find(x => x[0] === d.type); px(g, '#05010b', d.x - 10, d.y - 5, 20, 11); px(g, def[2], d.x - 9, d.y - 4, 18, 9); px(g, 'rgba(255,255,255,.55)', d.x - 8, d.y - 4, 16, 1); px(g, 'rgba(5,1,11,.35)', d.x - 9, d.y + 3, 18, 2); g.font = '8px "Press Start 2P", monospace'; g.textAlign = 'center'; g.fillStyle = '#130a20'; g.fillText(d.type, d.x + .5, d.y + 4); g.textAlign = 'left'; }
  for (const s of bk.bolts) { px(g, '#ff4f6d', s.x - 1, s.y - 4, 2, 6); px(g, '#ffd0f4', s.x - 1, s.y - 4, 2, 2); }
  const w = bkPW(), x0 = Math.round(bk.px - w / 2);
  px(g, '#05010b', x0 - 1, BK.PY - 1, w + 2, 8); px(g, '#8a1a7a', x0, BK.PY, w, 6); px(g, bk.fx.glue ? '#ffd07a' : '#ff5ad9', x0, BK.PY, w, 4); px(g, '#ffd0f4', x0 + 3, BK.PY + 1, w - 6, 1);
  px(g, '#7fe0ee', x0, BK.PY, 4, 6); px(g, '#7fe0ee', x0 + w - 4, BK.PY, 4, 6);
  if (bk.fx.laser) { px(g, '#ff4f6d', x0 + 2, BK.PY - 4, 2, 4); px(g, '#ff4f6d', x0 + w - 4, BK.PY - 4, 2, 4); }
  for (const b of bk.balls) {
    const fire = bk.fx.fire;
    if (fire) for (let i = 1; i < 5; i++) px(g, i < 3 ? '#ff9a3c' : '#8a3c10', b.x - b.vx * i * .8 - 1, b.y - b.vy * i * .8 - 1, 3, 3);
    px(g, fire ? '#ffd07a' : '#ffffff', b.x - 2, b.y - 2, 4, 4); px(g, fire ? '#ff4f6d' : '#c9bdf0', b.x, b.y, 2, 2);
  }
  for (const p of bk.parts) px(g, p.color, p.x, p.y, 2, 2);
  px(g, 'rgba(11,3,28,.9)', 0, 0, W, 13);
  pxFont(g, String(bk.score).padStart(6, '0'), 4, 10, '#ffffff', 8);
  pxFont(g, 'NIV ' + bk.level, W / 2, 10, '#d9c6ff', 8, 'center');
  for (let i = 0; i < bk.lives; i++) { px(g, '#ff4f6d', W - 10 - i * 9, 4, 6, 4); px(g, '#ff4f6d', W - 9 - i * 9, 8, 4, 1); }
  const timers = [['wide', '#7fe0ee', 1200], ['narrow', '#8f7bb8', 720], ['laser', '#ff4f6d', 600], ['slow', '#8ee8a0', 720], ['glue', '#ffd07a', 900], ['fire', '#ff9a3c', 480]].filter(([k]) => bk.fx[k]);
  timers.forEach(([k, c, max], i) => { px(g, '#2a1d52', 4 + i * 26, H - 5, 22, 3); px(g, c, 4 + i * 26, H - 5, Math.ceil(22 * bk.fx[k] / max), 3); });
  if (bk.banner) gameText(g, W, [[bk.banner.text, '#ff5ad9', 10], [bk.banner.sub, '#d9c6ff']], H / 2);
  else if (bk.tip) pxFont(g, bk.tip.text, W / 2, H - 30, '#ffd07a', 6, 'center');
  if (bk.balls.some(b => b.stuck != null) && bk.mode === 'play' && !bk.banner) pxFont(g, 'Clic ou espace : lancer', W / 2, H - 30, '#8f7bb8', 6, 'center');
  const maxLvl = Math.max(1, games?.best.breakoutLvl || 1);
  if (bk.mode === 'ready') gameText(g, W, [['CASSE-BRIQUES', '#ff5ad9', 12], ['Clic ou espace : jouer', '#d9c6ff'], maxLvl > 1 ? ['< Départ : niveau ' + bk.level + ' >', '#7fe0ee'] : ['Souris ou flèches : raquette', '#8f7bb8'], ['Record : ' + (games?.best.breakout ?? 0), '#ffd07a']], H / 2 - 20);
  if (bk.mode === 'pause') gameText(g, W, [['PAUSE', '#ffffff', 12], ['Clic ou espace : reprendre', '#d9c6ff']], H / 2);
  if (bk.mode === 'over') gameText(g, W, [['PARTIE TERMINÉE', '#ff4f6d', 10], ['Score : ' + bk.score + ' · niveau ' + bk.level, '#ffffff'], [bk.record ? 'NOUVEAU RECORD !' : 'Record : ' + (games?.best.breakout ?? 0), '#ffd07a'], ['Clic ou espace : rejouer', '#d9c6ff']], H / 2 - 14);
  g.restore();
  $('bkInfo').textContent = 'Record : ' + (games?.best.breakout ?? 0) + ' points · meilleur niveau atteint : ' + maxLvl;
}
$('bkCanvas').onpointermove = e => { if (!bk) return; const r = e.currentTarget.getBoundingClientRect(); bk.target = (e.clientX - r.left) / r.width * BK.W; };
$('bkCanvas').onpointerdown = () => bkPress();

document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (view.classList.contains('on') && bk) {
    if ([' ', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (bk.mode === 'ready' && (k === 'ArrowLeft' || k === 'ArrowRight')) { const max = Math.max(1, games.best.breakoutLvl || 1); bk.level = Math.max(1, Math.min(max, bk.level + (k === 'ArrowRight' ? 1 : -1))); bkLoad(); bkLevels(); return; }
    if (k === ' ' && !e.repeat && bkPress()) return;
    if ((k === 'p' || k === 'Escape') && bk.mode === 'play') bk.mode = 'pause';
    bk.keys[k] = true;
  }
});

document.addEventListener('keyup', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (bk) bk.keys[k] = false;
});

$('bkLevel').onchange = () => bkStart(+$('bkLevel').value);  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { bk ? gameLoop(bk, 'neodyme:breakout', bkUpdate, bkDraw) : bkStart(); });
}
