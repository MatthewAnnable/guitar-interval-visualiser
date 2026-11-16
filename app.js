import * as T from './theory.js';
import { serializeHash, parseHash } from './hash.js';

const SCALE_ROWS = [['major','Major'],['minor','Minor'],['majpent','Maj pent'],['minpent','Min pent'],['modes','Modes ▾']];
const LABEL_OPTS = [['degrees','Degrees'],['notes','Notes'],['none','Nothing']];
const NECK_OPTS = [['only','Shape only'],['faded','Faded'],['whole','Whole neck']];
const STORE = 'fretboard-visualiser-v2';

// ---- state ----------------------------------------------------------------
const state = { tonicPc: 2, scale: 'major', shape: 'E', labels: 'degrees', neck: 'faded', modeView: 'notes' };
let list = [], index = 0;
try {
  const s = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (s && T.SCALES[s.scale] && ['notes','root'].includes(s.modeView || 'notes')) Object.assign(state, s);
} catch {}
const save = () => {
  state.fret = list[index].minFret;
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  try { history.replaceState(null, '', serializeHash(state, list[index])); } catch {}
};

function rebuildList(useFret = false) {
  list = T.scaleInstances(state.tonicPc, state.scale);
  const exact = useFret ? list.findIndex(x => x.shape === state.shape && x.minFret === state.fret) : -1;
  index = exact >= 0 ? exact : T.pickInstance(list, state.shape);
  state.shape = list[index].shape;
}
// Links: the hash wins over localStorage; bad fields are ignored.
function applyHash() { Object.assign(state, parseHash(location.hash)); }

// ---- key picker (self-contained; onPick is the only way out) --------------
function keyPicker(el, onPick) {
  return {
    render(scaleKey, tonicPc) {
      el.innerHTML = '';
      for (let pc = 0; pc < 12; pc++) {
        const b = document.createElement('button');
        b.className = 'pill' + (pc === tonicPc ? ' on' : '');
        b.textContent = T.tonicName(pc, scaleKey);
        b.addEventListener('click', () => onPick(pc));
        el.appendChild(b);
      }
    },
  };
}
const picker = keyPicker(document.getElementById('keys'), pc => {
  state.tonicPc = pc; rebuildList(); render(true);
});

function makeSwitch(id, opts, key) {
  const el = document.getElementById(id);
  opts.forEach(([v, label]) => {
    const b = document.createElement('button');
    b.className = 'pill'; b.textContent = label; b.dataset.v = v;
    b.addEventListener('click', () => { state[key] = v; if (key === 'labels') buildDots(); render(false); });
    el.appendChild(b);
  });
}
makeSwitch('labels', LABEL_OPTS, 'labels');
makeSwitch('neck', NECK_OPTS, 'neck');

const scalesEl = document.getElementById('scales');

// Move to a new scale/tonic. how: 'same' keeps the current shape copy (same dots),
// 'nearest' keeps the copy whose lowest fret is closest, 'first' starts at the default shape.
function setScale(scale, tonicPc, how) {
  const minFret = list[index].minFret;
  state.scale = scale; state.tonicPc = tonicPc;
  const oldIndex = index;
  list = T.scaleInstances(state.tonicPc, state.scale);
  if (how === 'same') index = Math.min(oldIndex, list.length - 1);
  else if (how === 'nearest') index = T.nearestInstance(list, minFret);
  else { state.shape = T.firstShape(scale); index = T.pickInstance(list, state.shape); }
  state.shape = list[index].shape;
  render(true);
}
function pickMode(i) {
  if (state.modeView === 'notes') {
    const t = T.sameNotesTarget(state.tonicPc, state.scale, i);
    setScale(t.scale, t.tonicPc, 'same');
  } else {
    const t = T.sameRootTarget(state.tonicPc, i);
    setScale(t.scale, t.tonicPc, 'nearest');
  }
}
SCALE_ROWS.forEach(([v, label]) => {
  const b = document.createElement('button');
  b.className = 'pill'; b.textContent = label; b.dataset.v = v;
  b.addEventListener('click', () => {
    const inMode = T.isDiatonic(state.scale) && !['major', 'minor'].includes(state.scale);
    if (v === 'modes') {
      if (!T.isDiatonic(state.scale)) setScale(state.scale === 'minpent' ? 'minor' : 'major', state.tonicPc, 'first');
      else if (!inMode) pickMode(1);                      // show Dorian to start with
    } else if ((v === 'major' || v === 'minor') && inMode) {
      pickMode(v === 'major' ? 0 : 5);                    // same as tapping Ionian / Aeolian
    } else setScale(v, state.tonicPc, 'first');
  });
  scalesEl.appendChild(b);
});

// ---- mode strip (7-note scales only) ---------------------------------------
const modesEl = document.getElementById('modes');
function renderModes() {
  modesEl.hidden = !T.isDiatonic(state.scale);
  if (modesEl.hidden) return;
  const chips = document.getElementById('modeChips');
  chips.innerHTML = '';
  const cur = T.modeIndex(state.scale);
  for (let i = 0; i < 7; i++) {
    const t = state.modeView === 'notes' ? T.sameNotesTarget(state.tonicPc, state.scale, i)
                                         : T.sameRootTarget(state.tonicPc, i);
    const b = document.createElement('button');
    b.className = 'chip' + (i === cur ? ' on' : '');
    b.textContent = `${T.tonicName(t.tonicPc, t.scale)} ${T.MODE_NAMES[i]}`;
    b.addEventListener('click', () => pickMode(i));
    chips.appendChild(b);
  }
  document.querySelectorAll('#viewSwitch .pill').forEach(b => b.classList.toggle('on', b.dataset.v === state.modeView));
}
[['notes', 'Same notes'], ['root', 'Same root']].forEach(([v, label]) => {
  const b = document.createElement('button');
  b.className = 'pill'; b.textContent = label; b.dataset.v = v;
  b.addEventListener('click', () => { state.modeView = v; render(true); });
  document.getElementById('viewSwitch').appendChild(b);
});

// ---- fretboard geometry ---------------------------------------------------
const svg = document.getElementById('board');
const NS = 'http://www.w3.org/2000/svg';
const W = 60, X0 = 44, SG = 38, TOP = 20, BOT = TOP + SG * 5;
const FULL_W = X0 + 15 * W + 14, H = BOT + 48;
const xFret = f => f === 0 ? X0 - 26 : X0 + (f - 0.5) * W;
const yStr = s => BOT - s * SG;               // low E at the bottom
const el = (name, attrs = {}, parent) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
let dotEls = new Map(), bandEl, view = { x: 0, w: FULL_W }, narrow = false;

function buildBoard() {
  svg.innerHTML = '';
  el('rect', { class: 'board', x: 0, y: TOP - 18, width: FULL_W, height: BOT - TOP + 36, rx: 6 }, svg);
  bandEl = el('rect', { class: 'band', x: 0, y: TOP - 18, width: 10, height: BOT - TOP + 36 }, svg);
  for (const f of [3,5,7,9,15]) el('circle', { class: 'inlay', cx: xFret(f), cy: (TOP + BOT) / 2, r: 7 }, svg);
  for (const y of [TOP + SG * 1.5, TOP + SG * 3.5]) el('circle', { class: 'inlay', cx: xFret(12), cy: y, r: 7 }, svg);
  el('line', { class: 'nut', x1: X0, x2: X0, y1: TOP - 18, y2: BOT + 18 }, svg);
  for (let f = 1; f <= 15; f++) el('line', { class: 'wire', x1: X0 + f * W, x2: X0 + f * W, y1: TOP - 18, y2: BOT + 18 }, svg);
  for (let s = 0; s < 6; s++) el('line', { class: 'str', x1: X0 - 40, x2: FULL_W - 6, y1: yStr(s), y2: yStr(s), 'stroke-width': 1 + (5 - s) * 0.45 }, svg);
  for (let f = 1; f <= 15; f++) { const t = el('text', { class: 'num', x: xFret(f), y: BOT + 42 }, svg); t.textContent = f; }
  const t0 = el('text', { class: 'num', x: xFret(0), y: BOT + 42 }, svg); t0.textContent = '0';
  buildDots();
}

function buildDots() {
  svg.querySelectorAll('.dot').forEach(d => d.remove());
  dotEls = new Map();
  const accentPcs = state.modeView === 'root' ? T.differingPcs(state.tonicPc, state.scale) : [];
  for (const n of T.neckNotes(state.tonicPc, state.scale)) {
    const g = el('g', { class: 'dot' }, svg);
    g.dataset.s = n.string; g.dataset.f = n.fret;
    el('circle', { cx: xFret(n.fret), cy: yStr(n.string), r: 17 }, g);
    const t = el('text', { x: xFret(n.fret), y: yStr(n.string) + 1 }, g);
    t.textContent = state.labels === 'degrees' ? n.degree : state.labels === 'notes' ? n.name : '';
    if (n.isRoot) g.classList.add('root');
    else if (accentPcs.includes(n.pc)) g.classList.add('accent');
    dotEls.set(n.string + ':' + n.fret, g);
  }
  paintDots();
}

function paintDots() {
  const cur = new Set(list[index].notes.map(n => n.string + ':' + n.fret));
  const rest = { only: 'hidden', faded: 'faded', whole: 'full' }[state.neck];
  for (const [k, g] of dotEls) {
    g.classList.remove('faded', 'full', 'hidden');
    if (!cur.has(k)) g.classList.add(rest);
  }
  const inst = list[index];
  const x = X0 + (inst.minFret - 1) * W, w = (inst.maxFret - inst.minFret + 1) * W;
  bandEl.setAttribute('x', Math.max(x, 0)); bandEl.setAttribute('width', w - (x < 0 ? -x : 0));
}

// ---- view window (narrow screens show 9 frets) ---------------------------
function targetView() {
  narrow = window.innerWidth < 700;
  if (!narrow) return { x: 0, w: FULL_W };
  const inst = list[index];
  const c = X0 + ((inst.minFret + inst.maxFret) / 2 - 0.5) * W, w = 9 * W + 20;
  return { x: Math.min(Math.max(c - w / 2, 0), FULL_W - w), w };
}
let anim = 0;
function setView(animate) {
  const to = targetView();
  cancelAnimationFrame(anim);
  const from = { ...view };
  const apply = v => { view = v; svg.setAttribute('viewBox', `${v.x} 0 ${v.w} ${H}`); };
  if (!animate || (from.x === to.x && from.w === to.w)) return apply(to);
  const t0 = performance.now();
  const step = now => {
    const p = Math.min((now - t0) / 220, 1), e = 1 - Math.pow(1 - p, 3);
    apply({ x: from.x + (to.x - from.x) * e, w: from.w + (to.w - from.w) * e });
    if (p < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

// ---- rendering ------------------------------------------------------------
function renderChrome() {
  const inst = list[index];
  const tn = T.tonicName(state.tonicPc, state.scale);
  const sc = T.SCALES[state.scale].label.toLowerCase();
  const plain = ['major', 'minor', 'majpent', 'minpent'].includes(state.scale);
  const sn = T.shapeName(inst.shape, state.scale, state.tonicPc);
  const name = plain || !T.isDiatonic(state.scale) ? `${tn} ${sc}` : `${tn} ${T.SCALES[state.scale].label}`;
  document.getElementById('title').textContent = plain ? `${name} · ${sn}`
    : state.modeView === 'notes' ? `${name} · same notes as ${sn}` : `${name} · ${sn}`;
  const line = state.modeView === 'root' && T.MODE_LINES[state.scale] ? T.MODE_LINES[state.scale] : '';
  const ml = document.getElementById('modeline'); ml.textContent = line; ml.hidden = !line;
  renderModes();
  document.title = document.getElementById('title').textContent + ' – Fretboard Visualiser';
  document.querySelectorAll('#scales .pill').forEach(b => b.classList.toggle('on',
    b.dataset.v === 'modes' ? (T.isDiatonic(state.scale) && !['major', 'minor'].includes(state.scale)) : b.dataset.v === state.scale));
  document.querySelectorAll('#labels .pill').forEach(b => b.classList.toggle('on', b.dataset.v === state.labels));
  document.querySelectorAll('#neck .pill').forEach(b => b.classList.toggle('on', b.dataset.v === state.neck));
  const strip = document.getElementById('strip');
  strip.innerHTML = '';
  const arrow = (txt, d, label) => {
    const b = document.createElement('button');
    b.className = 'arrow'; b.textContent = txt; b.setAttribute('aria-label', label);
    b.addEventListener('click', () => step(d)); return b;
  };
  strip.appendChild(arrow('◀', -1, 'Previous shape'));
  list.forEach((x, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i === index ? ' on' : '');
    b.textContent = T.shapeShort(x.shape, state.scale);
    b.title = `frets ${x.minFret} to ${x.maxFret}`;
    b.addEventListener('click', () => go(i));
    strip.appendChild(b);
  });
  strip.appendChild(arrow('▶', 1, 'Next shape'));
}

function render(rebuild) {
  if (rebuild) { picker.render(state.scale, state.tonicPc); buildBoard(); }
  paintDots(); renderChrome(); setView(!rebuild); save();
}

function go(i, deferView) {
  index = Math.max(0, Math.min(list.length - 1, i));
  state.shape = list[index].shape;
  if (deferView) { paintDots(); renderChrome(); save(); } else render(false);
}
const step = d => go(index + d);

// ---- gestures -------------------------------------------------------------
const centre = i => X0 + ((list[i].minFret + list[i].maxFret) / 2 - 0.5) * W;
let down = null;
svg.addEventListener('pointerdown', e => {
  down = { x: e.clientX, c0: centre(index), dragging: false, target: e.target.closest('.dot'), id: e.pointerId };
});
svg.addEventListener('pointermove', e => {
  if (!down) return;
  const dx = e.clientX - down.x;
  if (!down.dragging && Math.abs(dx) > 6) {
    down.dragging = true; svg.classList.add('drag'); svg.setPointerCapture(down.id);
  }
  if (!down.dragging) return;
  const unitsPerPx = view.w / svg.getBoundingClientRect().width;
  const want = down.c0 + dx * unitsPerPx;               // highlight follows the finger (PLAN 5.3)
  let best = 0;
  list.forEach((_, i) => { if (Math.abs(centre(i) - want) < Math.abs(centre(best) - want)) best = i; });
  if (best !== index) go(best, true);
});
const finish = e => {
  if (!down) return;
  const d = down; down = null; svg.classList.remove('drag');
  if (d.dragging) { render(false); return; }          // snap: refresh view
  if (e.type === 'pointerup' && d.target && !d.target.classList.contains('hidden')) tapDot(d.target);
};
svg.addEventListener('pointerup', finish);
svg.addEventListener('pointercancel', finish);

function tapDot(g) {                                    // jumps shape only; never touches key or scale
  const key = g.dataset.s + ':' + g.dataset.f;
  const has = i => list[i].notes.some(n => n.string + ':' + n.fret === key);
  if (has(index)) return;
  let best = -1;
  list.forEach((_, i) => { if (has(i) && (best < 0 || Math.abs(centre(i) - centre(index)) < Math.abs(centre(best) - centre(index)))) best = i; });
  if (best >= 0) go(best);
}

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
});
window.addEventListener('resize', () => setView(false));
window.addEventListener('hashchange', () => {
  const h = parseHash(location.hash);
  if (!Object.keys(h).length) return;
  Object.assign(state, h); rebuildList(true); render(true);
});

// ---- go -------------------------------------------------------------------
applyHash();
rebuildList(true);
render(true);
