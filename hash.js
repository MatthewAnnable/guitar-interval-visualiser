// URL-hash links (PLAN 5.5). Pure functions, no DOM.
import { SCALES, tonicName } from './theory.js';
import { KEYS as PROG_KEYS } from './progression.js';

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const LABEL_VALUES = ['degrees', 'notes', 'none'];
export const NECK_VALUES = ['only', 'faded', 'whole'];
export const VIEW_VALUES = ['notes', 'root'];

// "F#" -> "Fs", "B♭" -> "Bb": no raw # in the link.
export function encodeKey(name) {
  return name.replace('#', 's').replace('♭', 'b');
}
// Accepts Fs / F# / F%23 / Bb / B♭ / bb / f. Returns pitch class or null.
export function decodeKey(text) {
  if (typeof text !== 'string') return null;
  const m = /^([A-Ga-g])(s|S|#|b|♭|♯)?$/.exec(text.trim());
  if (!m) return null;
  const base = LETTER_PC[m[1].toUpperCase()];
  const acc = m[2] === undefined ? 0 : /^(s|S|#|♯)$/.test(m[2]) ? 1 : -1;
  return (base + acc + 12) % 12;
}

// state: {tonicPc, scale, modeView, labels, neck}; inst: {shape, minFret}
export function serializeHash(state, inst) {
  const parts = [
    ['key', encodeKey(tonicName(state.tonicPc, state.scale))],
    ['scale', state.scale],
    ['modes', state.modeView],
    ['shape', inst.shape],
    ['fret', inst.minFret],
    ['dots', state.labels],
    ['neck', state.neck],
  ];
  // "Play over chords": the progression made in the Progression Builder.
  // pk = its key, prog = the chord numbers bar by bar (0 = empty), lv = the builder's level.
  if (state.jam) {
    parts.push(['pk', state.jam.key], ['prog', state.jam.prog.join(',')], ['bpm', state.jam.bpm]);
    if (state.jam.level) parts.push(['lv', state.jam.level]);
  }
  return '#' + parts.map(([k, v]) => `${k}=${String(v).split(',').map(encodeURIComponent).join(',')}`).join('&');
}

// Returns only the fields that were present AND valid. Never throws.
export function parseHash(hash) {
  const out = {};
  try {
    const raw = String(hash || '').replace(/^#/, '');
    if (!raw) return out;
    const get = {};
    for (const piece of raw.split('&')) {
      const i = piece.indexOf('=');
      if (i < 1) continue;
      let k = piece.slice(0, i), v = piece.slice(i + 1);
      try { v = decodeURIComponent(v); } catch { /* keep raw */ }
      get[k.toLowerCase()] = v;
    }
    const pc = decodeKey(get.key);
    if (pc !== null) out.tonicPc = pc;
    if (typeof get.scale === 'string' && Object.prototype.hasOwnProperty.call(SCALES, get.scale)) out.scale = get.scale;
    if (VIEW_VALUES.includes(get.modes)) out.modeView = get.modes;
    if (typeof get.shape === 'string' && /^[CAGED]$/i.test(get.shape)) out.shape = get.shape.toUpperCase();
    if (/^\d{1,2}$/.test(get.fret || '')) { const f = +get.fret; if (f >= 0 && f <= 15) out.fret = f; }
    if (LABEL_VALUES.includes(get.dots)) out.labels = get.dots;
    if (NECK_VALUES.includes(get.neck)) out.neck = get.neck;
    const pk = String(get.pk || '').toUpperCase(), prog = String(get.prog || '');
    if (PROG_KEYS.includes(pk) && /^[0-6](,[0-6]){0,7}$/.test(prog) && /[1-6]/.test(prog)) {
      const bpm = /^\d{2,3}$/.test(get.bpm || '') && +get.bpm >= 50 && +get.bpm <= 160 ? +get.bpm : 80;
      out.jam = { key: pk, prog: prog.split(',').map(Number), bpm };
      if (/^[1-3]$/.test(get.lv || '')) out.jam.level = +get.lv;
    }
  } catch { return {}; }
  return out;
}
