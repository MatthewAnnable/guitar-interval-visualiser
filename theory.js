// Fretboard theory engine. Pure functions, no DOM. See PLAN.md section 3.

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
export const NECK_FRETS = 15;                 // neck shows frets 0..15
export const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // low E ... high E

// Frets for C major, strings low E to high E. The only hand-written shape data.
export const SHAPES = [
  { shape: 'C', strings: [[0,1,3],[0,2,3],[0,2,3],[0,2],[0,1,3],[0,1,3]] },
  { shape: 'A', strings: [[3,5],[2,3,5],[2,3,5],[2,4,5],[3,5,6],[3,5]] },
  { shape: 'G', strings: [[5,7,8],[5,7,8],[5,7],[4,5,7],[5,6,8],[5,7,8]] },
  { shape: 'E', strings: [[7,8,10],[7,8,10],[7,9,10],[7,9,10],[8,10],[7,8,10]] },
  { shape: 'D', strings: [[10,12,13],[10,12],[9,10,12],[9,10,12],[10,12,13],[10,12,13]] },
];

export const SCALES = {
  major:      { family: 'diatonic',   mode: 0, label: 'Major' },
  minor:      { family: 'diatonic',   mode: 5, label: 'Minor' },
  dorian:     { family: 'diatonic',   mode: 1, label: 'Dorian' },
  phrygian:   { family: 'diatonic',   mode: 2, label: 'Phrygian' },
  lydian:     { family: 'diatonic',   mode: 3, label: 'Lydian' },
  mixolydian: { family: 'diatonic',   mode: 4, label: 'Mixolydian' },
  locrian:    { family: 'diatonic',   mode: 6, label: 'Locrian' },
  majpent:    { family: 'pentatonic', mode: 0, label: 'Major pentatonic' },
  minpent:    { family: 'pentatonic', mode: 5, label: 'Minor pentatonic' },
};

const mod12 = n => ((n % 12) + 12) % 12;

// ---- Spelling -------------------------------------------------------------
export const PARENT_NAMES = ['C','D♭','D','E♭','E','F','F#','G','A♭','A','B♭','B'];
const LETTERS = ['C','D','E','F','G','A','B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

// Seven note names of the parent major key, one letter each (F# major has E#).
export function parentSpelling(parentPc) {
  const root = PARENT_NAMES[mod12(parentPc)];
  const start = LETTERS.indexOf(root[0]);
  return MAJOR_STEPS.map((step, i) => {
    const li = (start + i) % 7;
    const diff = ((mod12(parentPc + step) - LETTER_PC[li] + 18) % 12) - 6; // -6..5
    const acc = diff === 0 ? '' : diff === 1 ? '#' : diff === -1 ? '♭' : diff === 2 ? '##' : '♭♭';
    return LETTERS[li] + acc;
  });
}

// ---- Scales ---------------------------------------------------------------
export function parentPcOf(tonicPc, scaleKey) {
  return mod12(tonicPc - MAJOR_STEPS[SCALES[scaleKey].mode]);
}

// Pitch classes of the scale's notes (root first for diatonic; sorted by degree).
export function scalePcs(tonicPc, scaleKey) {
  const { family, mode } = SCALES[scaleKey];
  const parent = parentPcOf(tonicPc, scaleKey);
  let pcs = MAJOR_STEPS.map(s => mod12(parent + s));
  if (family === 'pentatonic') {
    const drop = [mod12(parent + 5), mod12(parent + 11)];
    pcs = pcs.filter(p => !drop.includes(p));
  }
  return pcs;
}

// Display name of any scale note (or the root). Spelled from the parent key.
export function noteName(pc, tonicPc, scaleKey) {
  const parent = parentPcOf(tonicPc, scaleKey);
  const sp = parentSpelling(parent);
  const i = MAJOR_STEPS.findIndex(s => mod12(parent + s) === mod12(pc));
  return i < 0 ? PARENT_NAMES[mod12(pc)] : sp[i];
}
export const tonicName = (tonicPc, scaleKey) => noteName(tonicPc, tonicPc, scaleKey);

// Degree label counted from the current root: R 2 ♭3 4 5 6 ♭7 etc.
export function degreeLabel(pc, tonicPc, scaleKey) {
  const { mode } = SCALES[scaleKey];
  const parent = parentPcOf(tonicPc, scaleKey);
  const semis = mod12(pc - tonicPc);
  if (semis === 0) return 'R';
  const idx = MAJOR_STEPS.findIndex(s => mod12(parent + s) === mod12(pc));
  const degree = (idx - mode + 7) % 7;          // 0..6 counted from the root
  const diff = semis - MAJOR_STEPS[degree];     // vs. major scale of the same root
  const acc = diff === 0 ? '' : diff < 0 ? '♭' : '♯';
  return acc + (degree + 1);
}

// ---- Shapes ---------------------------------------------------------------
export function pcAt(string, fret) { return mod12(OPEN_MIDI[string] + fret); }

function buildNotes(shape, offset, dropPcs) {
  const notes = [];
  shape.strings.forEach((frets, string) => {
    frets.forEach(f => {
      const fret = f + offset;
      if (dropPcs.includes(pcAt(string, fret))) return;
      notes.push({ string, fret });
    });
  });
  return notes;
}

// Every placement of every shape fully inside frets 0..15, sorted up the neck.
export function instances(parentPc, family = 'diatonic') {
  const parent = mod12(parentPc);
  const dropPcs = family === 'pentatonic' ? [mod12(parent + 5), mod12(parent + 11)] : [];
  const out = [];
  for (const sh of SHAPES) {
    for (const k of [-1, 0, 1]) {
      const offset = parent + 12 * k;
      const notes = buildNotes(sh, offset, dropPcs);
      if (!notes.length) continue;
      const frets = notes.map(n => n.fret);
      const minFret = Math.min(...frets), maxFret = Math.max(...frets);
      if (minFret < 0 || maxFret > NECK_FRETS) continue;
      out.push({ shape: sh.shape, notes, minFret, maxFret });
    }
  }
  return out.sort((a, b) => a.minFret - b.minFret || a.maxFret - b.maxFret);
}

export function scaleInstances(tonicPc, scaleKey) {
  return instances(parentPcOf(tonicPc, scaleKey), SCALES[scaleKey].family);
}

// All scale notes on the neck (for the faded layer), with labels.
export function neckNotes(tonicPc, scaleKey) {
  const pcs = scalePcs(tonicPc, scaleKey);
  const out = [];
  for (let string = 0; string < 6; string++) {
    for (let fret = 0; fret <= NECK_FRETS; fret++) {
      const pc = pcAt(string, fret);
      if (!pcs.includes(pc)) continue;
      out.push({
        string, fret, pc,
        isRoot: pc === mod12(tonicPc),
        degree: degreeLabel(pc, tonicPc, scaleKey),
        name: noteName(pc, tonicPc, scaleKey),
      });
    }
  }
  return out;
}

// ---- Names ----------------------------------------------------------------
// Rows: parent shape. Columns: [major / major pentatonic, minor, minor pentatonic, short strip label for minor, for minpent]
export const SHAPE_NAMES = {
  G: { major: 'G shape', minor: 'Em shape', minpent: 'Shape 1 (Em shape)', minorShort: 'Em', minpentShort: '1' },
  E: { major: 'E shape', minor: 'Dm shape', minpent: 'Shape 2 (Dm shape)', minorShort: 'Dm', minpentShort: '2' },
  D: { major: 'D shape', minor: 'Cm shape', minpent: 'Shape 3 (Cm shape)', minorShort: 'Cm', minpentShort: '3' },
  C: { major: 'C shape', minor: 'Am shape', minpent: 'Shape 4 (Am shape)', minorShort: 'Am', minpentShort: '4' },
  A: { major: 'A shape', minor: 'Gm shape', minpent: 'Shape 5 (Gm shape)', minorShort: 'Gm', minpentShort: '5' },
};

export function shapeName(shape, scaleKey, tonicPc) {
  const n = SHAPE_NAMES[shape];
  if (scaleKey === 'major' || scaleKey === 'majpent') return n.major;
  if (scaleKey === 'minor') return n.minor;
  if (scaleKey === 'minpent') return n.minpent;
  return `${tonicName(mod12(parentPcOf(tonicPc, scaleKey)), 'major')} major, ${shape} shape`;
}
export function shapeShort(shape, scaleKey) {
  const n = SHAPE_NAMES[shape];
  if (scaleKey === 'minor') return n.minorShort;
  if (scaleKey === 'minpent') return n.minpentShort;
  return shape;
}

// ---- Which instance to show -----------------------------------------------
export function firstShape(scaleKey) {
  return (scaleKey === 'minor' || scaleKey === 'minpent') ? 'G' : 'E';
}
// Lowest copy of this shape letter with minFret >= 1 if any, else lowest copy.
export function pickInstance(list, shape) {
  const copies = list.map((x, i) => ({ x, i })).filter(c => c.x.shape === shape);
  const good = copies.find(c => c.x.minFret >= 1) || copies[0];
  return good ? good.i : 0;
}
