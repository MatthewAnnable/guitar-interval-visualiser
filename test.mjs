import assert from 'node:assert/strict';
import * as T from './theory.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const mod12 = x => ((x % 12) + 12) % 12;

const ladder = (pcs) => { // absolute pitches of scale notes across the guitar range
  const out = [];
  for (let p = 30; p < 100; p++) if (pcs.includes(mod12(p))) out.push(p);
  return out;
};
const fretsOf = (inst, s) => inst.notes.filter(x => x.string === s).map(x => x.fret).sort((a, b) => a - b);

for (const [key, sc] of [['major', 0], ['majpent', 0], ['minor', 0], ['minpent', 0]]) {
  test(`1. shapes are consecutive scale runs (${key}, all keys)`, () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const pcs = T.scalePcs(tonic, key);
      const lad = ladder(pcs);
      for (const inst of T.scaleInstances(tonic, key)) {
        const pitches = inst.notes.map(x => T.OPEN_MIDI[x.string] + x.fret).sort((a, b) => a - b);
        assert.equal(new Set(pitches).size, pitches.length, 'repeat');
        const idx = pitches.map(p => lad.indexOf(p));
        assert.ok(idx.every(i => i >= 0), 'note not in scale');
        for (let i = 1; i < idx.length; i++) assert.equal(idx[i], idx[i - 1] + 1, `skip in ${key} ${tonic} ${inst.shape}`);
      }
    }
  });
  test(`2. notes per string (${key})`, () => {
    for (let tonic = 0; tonic < 12; tonic++)
      for (const inst of T.scaleInstances(tonic, key))
        for (let s = 0; s < 6; s++) {
          const c = fretsOf(inst, s).length;
          if (T.SCALES[key].family === 'pentatonic') assert.equal(c, 2);
          else assert.ok(c === 2 || c === 3, `${c} notes`);
        }
  });
  test(`3. every scale note is in some shape (unclipped copies) (${key})`, () => {
    for (let parent = 0; parent < 12; parent++) {
      const fam = T.SCALES[key].family;
      const drop = fam === 'pentatonic' ? [mod12(parent + 5), mod12(parent + 11)] : [];
      const covered = new Set();
      for (const sh of T.SHAPES) for (let k = -2; k <= 2; k++)
        sh.strings.forEach((fr, s) => fr.forEach(f => {
          const fret = f + parent + 12 * k;
          if (!drop.includes(T.pcAt(s, fret))) covered.add(s + ':' + fret);
        }));
      const pcs = T.scalePcs(parent, 'major').filter(p => !drop.includes(p));
      for (let s = 0; s < 6; s++) for (let f = 0; f <= 21; f++)
        if (pcs.includes(T.pcAt(s, f))) assert.ok(covered.has(s + ':' + f), `gap parent ${parent} string ${s} fret ${f}`);
    }
  });
}

test('4. D major instances in order', () => {
  const got = T.scaleInstances(2, 'major').map(i => `${i.shape} ${i.minFret}-${i.maxFret}`);
  assert.deepEqual(got, ['C 2-5', 'A 4-8', 'G 6-10', 'E 9-12', 'D 11-15']);
});

test('5. A minor pentatonic Shape 1', () => {
  const inst = T.scaleInstances(9, 'minpent').find(i => i.shape === 'G' && i.minFret === 5);
  assert.deepEqual([0,1,2,3,4,5].map(s => fretsOf(inst, s)),
    [[5,8],[5,7],[5,7],[5,7],[5,8],[5,8]]);
});

test('6. A minor Em shape', () => {
  const inst = T.scaleInstances(9, 'minor').find(i => i.shape === 'G' && i.minFret === 4);
  assert.deepEqual([0,1,2,3,4,5].map(s => fretsOf(inst, s)),
    [[5,7,8],[5,7,8],[5,7],[4,5,7],[5,6,8],[5,7,8]]);
});

test('7. E Dorian and D major have identical dots, different labels', () => {
  const a = JSON.stringify(T.scaleInstances(2, 'major'));
  assert.equal(T.parentPcOf(4, 'dorian'), 2);
  assert.equal(JSON.stringify(T.scaleInstances(4, 'dorian')), a);
  const dm = T.neckNotes(2, 'major'), ed = T.neckNotes(4, 'dorian');
  assert.deepEqual(dm.map(x => [x.string, x.fret]), ed.map(x => [x.string, x.fret]));
  const labels = [4,6,7,9,11,1,2].map(pc => T.degreeLabel(pc, 4, 'dorian')); // E F# G A B C# D
  assert.deepEqual(labels, ['R','2','♭3','4','5','6','♭7']);
  assert.notDeepEqual(dm.map(x => x.degree), ed.map(x => x.degree));
});

test('8. F# major note names', () => {
  assert.deepEqual(T.parentSpelling(6), ['F#','G#','A#','B','C#','D#','E#']);
  assert.equal(T.tonicName(9, 'minor'), 'A');
  assert.equal(T.tonicName(8, 'minor'), 'G#');
  assert.deepEqual([0,2,3,5,7].map(pc => T.degreeLabel(pc, 0, 'minpent')).slice(0,1), ['R']);
});


// ---- modes ----
test('9. parallel-mode parents for D', () => {
  const want = { major: 2, dorian: 0, phrygian: 10, lydian: 9, mixolydian: 7, minor: 5, locrian: 3 };
  for (const k in want) assert.equal(T.parentPcOf(2, k), want[k], k);
});
test('10. same-notes target keeps the parent; 7 chips cover all 7 modes', () => {
  for (const [tonic, scale] of [[2, 'major'], [4, 'dorian'], [11, 'minor']]) {
    const parent = T.parentPcOf(tonic, scale);
    const names = [];
    for (let i = 0; i < 7; i++) {
      const t = T.sameNotesTarget(tonic, scale, i);
      assert.equal(T.parentPcOf(t.tonicPc, t.scale), parent);
      assert.equal(JSON.stringify(T.scaleInstances(t.tonicPc, t.scale)), JSON.stringify(T.scaleInstances(tonic, scale)));
      names.push(T.tonicName(t.tonicPc, t.scale) + ' ' + T.MODE_NAMES[i]);
    }
    if (tonic === 2) assert.deepEqual(names, ['D Ionian','E Dorian','F# Phrygian','G Lydian','A Mixolydian','B Aeolian','C# Locrian']);
  }
});
test('11. differing notes vs plain major / minor', () => {
  const d = (scale) => T.differingPcs(2, scale).sort((a, b) => a - b);
  assert.deepEqual(d('dorian'), [11]);          // B, the major 6th
  assert.deepEqual(d('lydian'), [8]);           // G#, the sharp 4th
  assert.deepEqual(d('mixolydian'), [0]);       // C natural
  assert.deepEqual(d('phrygian'), [3]);         // Eb
  assert.deepEqual(d('locrian'), [3, 8]);       // Eb, Ab
  assert.deepEqual(d('major'), []);
  assert.deepEqual(d('minor'), []);
  assert.deepEqual(d('majpent'), []);
});
test('12. mode names spelled from the parent key; same-root parent moves the dots', () => {
  const dm = [4,6,7,9,11,1,2].map(pc => T.noteName(pc, 4, 'dorian'));
  assert.deepEqual(dm, ['E','F#','G','A','B','C#','D']);
  assert.deepEqual(T.scaleInstances(2, 'dorian').map(i => i.shape + i.minFret),
                   T.scaleInstances(0, 'major').map(i => i.shape + i.minFret));
  const list = T.scaleInstances(2, 'major');
  assert.equal(T.nearestInstance(list, 9), 3);
  assert.equal(T.nearestInstance(list, 5), 1);
});
console.log(`
All ${n} tests passed`);
