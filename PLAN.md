# Fretboard Visualiser rebuild: build plan

Written 16/11/2026 for whichever Claude model builds this. Read all of it before writing code.

## 1. What this is and who it is for

Matthew is a guitar teacher. He uses this page in lessons, and students use it at home on their phones, to learn scale shapes and how they connect. It is live at https://matthewannable.github.io/guitar-interval-visualiser/ and the code is the single `index.html` in this folder (its own git repo; pushing `main` deploys to GitHub Pages).

The current version is being replaced, not extended. It shows a lot of information that nobody uses: four "views", an interval list, a five-colour legend, a 4-fret/5-fret window that cuts notes out of shapes, and tapping the neck moves the root. All of that goes.

The new version does one job: **pick a key and a scale, see it as one of the five CAGED shapes on the neck, and drag along the neck to move to the next shape.** Everything else supports that.

### Decisions Matthew has already made

| Question | Decision |
|---|---|
| Shape system | The 5 CAGED shapes. No 3-notes-per-string for now. |
| Rest of the neck | Current shape in full colour, the rest of the scale faded, with a switch to hide the faded notes. |
| Modes | Both ways, "same notes" first: pick D major and step through its modes with the dots staying put. A switch flips to "same root" (D major vs D Dorian vs D Mixolydian). |
| Kept from the old version | Only the Degrees / Note names / Nothing switch for the dots. |
| Dropped from the old version | Sound, single-string view, one-octave view, interval list, tap-to-move-root, 4/5-fret window, the "two octaves" checker, the major/minor/both colour legend. |

### Rules that must hold

1. **A shape is never cut off.** Every shape shows every scale note in its area, on all six strings, even when that needs a 5-fret stretch. Shapes come from the fixed table in section 3, never from "all notes inside a fret window".
2. **Tapping or dragging the neck never changes the key or the scale.** Only the key picker and scale picker do that.
3. **One idea on screen at a time.** No legends longer than one line, no explanatory paragraphs under the neck.

## 2. The idea that makes the whole thing simple

Every scale in scope is the same set of dots as some major scale (the "parent"), with a different note treated as the root:

- Natural minor is the parent major's 6th mode.
- The seven modes are the parent major starting from each of its seven notes.
- Major pentatonic is the parent major without its 4th and 7th.
- Minor pentatonic is the same five notes with the parent's 6th as the root.

So the app needs **one table of five major-scale shapes**. Everything else is that table transposed, relabelled from a different root, or with two notes removed. This is also the teaching point: students should see that E Dorian is the D major shape they already know.

Scales outside this family (harmonic minor, melodic minor, blues) are out of scope. Do not add them.

## 3. Theory engine (`theory.js`, pure functions, no DOM)

### 3.1 The shape table

Frets for **C major**, strings listed low E to high E. This is the only hand-written shape data in the app.

| Shape | Low E | A | D | G | B | High E | Frets |
|---|---|---|---|---|---|---|---|
| C | 0 1 3 | 0 2 3 | 0 2 3 | 0 2 | 0 1 3 | 0 1 3 | 0 to 3 |
| A | 3 5 | 2 3 5 | 2 3 5 | 2 4 5 | 3 5 6 | 3 5 | 2 to 6 |
| G | 5 7 8 | 5 7 8 | 5 7 | 4 5 7 | 5 6 8 | 5 7 8 | 4 to 8 |
| E | 7 8 10 | 7 8 10 | 7 9 10 | 7 9 10 | 8 10 | 7 8 10 | 7 to 10 |
| D | 10 12 13 | 10 12 | 9 10 12 | 9 10 12 | 10 12 13 | 10 12 13 | 9 to 13 |

Going up the neck the order is always C, A, G, E, D, then C again an octave up.

### 3.2 Placing shapes on the neck

The neck shows frets 0 to 15.

```
instances(parentPc) -> [{ shape, notes:[{string, fret}], minFret, maxFret }]
```

For each shape, add `parentPc` (0 to 11, C = 0) to every fret, then also try that minus 12. Keep every copy whose frets all lie in 0 to 15. Sort by `minFret`. Every key gets every shape at least once, and some shapes twice (an octave apart). This sorted list is what the drag steps through.

### 3.3 Scale definitions

```js
const SCALES = {
  major:      { family:'diatonic',   mode:0, label:'Major' },
  minor:      { family:'diatonic',   mode:5, label:'Minor' },
  dorian:     { family:'diatonic',   mode:1, label:'Dorian' },
  phrygian:   { family:'diatonic',   mode:2, label:'Phrygian' },
  lydian:     { family:'diatonic',   mode:3, label:'Lydian' },
  mixolydian: { family:'diatonic',   mode:4, label:'Mixolydian' },
  locrian:    { family:'diatonic',   mode:6, label:'Locrian' },
  majpent:    { family:'pentatonic', mode:0, label:'Major pentatonic' },
  minpent:    { family:'pentatonic', mode:5, label:'Minor pentatonic' },
};
```

`mode` is which degree of the parent major is the root (0 = 1st, 5 = 6th). Major is Ionian and minor is Aeolian; show those names only in the mode strip.

- `parentPc = (tonicPc - MAJOR_STEPS[mode] + 12) % 12` where `MAJOR_STEPS = [0,2,4,5,7,9,11]`.
- Pentatonic: take the parent's shape and drop the notes that are the parent's 4th and 7th (pitch classes `parentPc+5` and `parentPc+11`).

### 3.4 Labels on the dots

- **Degrees** are counted from the current root, not the parent: Dorian reads R 2 ♭3 4 5 6 ♭7. Minor pentatonic reads R ♭3 4 5 ♭7.
- **Note names** are spelled from the parent major key, one letter each, so F# major has E# and never F. Parent key names: C, D♭, D, E♭, E, F, F#, G, A♭, A, B♭, B. The root's displayed name comes from this spelling too (so the relative minor of B major is G# minor, not A♭ minor). The old `spell()` function flattens E# to F; do not carry that over.

### 3.5 Shape names

The dots are the same but the name depends on what the student is learning. Keep this as one lookup table so Matthew can change it.

| Parent shape | Major, major pentatonic | Minor | Minor pentatonic | Other modes |
|---|---|---|---|---|
| G | G shape | Em shape | Shape 1 (Em shape) | "D major, G shape" |
| E | E shape | Dm shape | Shape 2 (Dm shape) | "D major, E shape" |
| D | D shape | Cm shape | Shape 3 (Cm shape) | "D major, D shape" |
| C | C shape | Am shape | Shape 4 (Am shape) | "D major, C shape" |
| A | A shape | Gm shape | Shape 5 (Gm shape) | "D major, A shape" |

Check: A minor pentatonic shape 1 is frets 5 to 8, the box everyone learns first.

### 3.6 Which shape to show first

- Major, major pentatonic: E shape (root on the low E string).
- Minor, minor pentatonic: parent's G shape (Em shape / Shape 1, root on the low E string).
- Switching to another mode in "same notes": do not move. Same instance, same dots.
- Changing key: keep the same shape letter; pick its lowest copy with `minFret >= 1` if there is one.
- Switching mode in "same root" (section 5.3): the parent changes, so the dots move. Pick the new instance whose `minFret` is closest to the current one.

### 3.7 Tests (`test.mjs`, run with `node test.mjs`)

Write these before the UI. All 12 parent keys unless stated.

1. Each shape's notes, sorted by pitch, are a run of consecutive scale notes with none skipped and none repeated.
2. Every string in every shape has 2 or 3 notes (diatonic) or exactly 2 (pentatonic).
3. Ignoring the ends of the neck (place the five shapes and their copies 12 frets up and down without clipping), every scale note on every string belongs to at least one shape. On the real 0 to 15 neck a few notes at fret 0 and frets 14 to 15 belong only to shapes that run off the end; that is expected, and those notes simply stay faded.
4. D major instances in order: C 2 to 5, A 4 to 8, G 6 to 10, E 9 to 12, D 11 to 15.
5. A minor pentatonic Shape 1 is exactly: low E 5 8, A 5 7, D 5 7, G 5 7, B 5 8, high E 5 8.
6. A minor (natural) Em shape is exactly: low E 5 7 8, A 5 7 8, D 5 7, G 4 5 7, B 5 6 8, high E 5 7 8.
7. E Dorian and D major produce identical dots; only the root and degree labels differ.
8. F# major note names are F# G# A# B C# D# E#.

## 4. Files

No build step, no framework, no dependencies. GitHub Pages serves the folder as is.

```
index.html   markup + CSS
theory.js    section 3, ES module, no DOM access
app.js       state, rendering, gestures (imports theory.js)
test.mjs     section 3.7 (imports theory.js)
PLAN.md      this file
```

Keep the existing light/dark colour tokens and the warm paper look in `index.html`.

## 5. Screen design

Top to bottom. On a phone in portrait everything above the neck must fit without scrolling.

```
D major · E shape                          <- title line, the only heading
[Key picker]                               <- 12 buttons
[Major] [Minor] [Maj pent] [Min pent] [Modes ▾]
[mode strip, only for 7-note scales]
┌───────────────── fretboard ─────────────────┐
│   drag left/right to move between shapes    │
└─────────────────────────────────────────────┘
        ◀   C · A · G · [E] · D   ▶          <- shape strip
Dots: [Degrees] [Notes] [Nothing]   Neck: [Shape only] [Faded] [Whole neck]
```

### 5.1 Key picker

Twelve buttons in a row that wraps. Labels follow the scale type: major-type scales show C D♭ D E♭ E F F# G A♭ A B♭ B; minor-type show the minor spellings from 3.4.

Build it as a self-contained component with one callback, `onPick(tonicPc)`, because a circle-of-fifths wheel will replace it later (section 8).

### 5.2 Fretboard

- SVG, horizontal, low E string at the bottom, frets 0 to 15, fret numbers underneath, inlay dots at 3 5 7 9 12 15.
- **Current shape:** full-size dots. Root dots are dark and filled; all other dots are one single colour. No other colours in the default state.
- **Rest of the scale:** smaller dots at about 25% opacity, with labels. The "Neck" switch sets this to hidden, faded (default) or full strength.
- A soft tinted band behind the current shape's fret range.
- Dots fade between shapes over about 150 ms so the move is visible.
- **Narrow screens (under about 700 px):** show a 9-fret window of the neck, centred on the current shape, sliding as the shape changes. Wide screens show all 16 frets.

### 5.3 Moving between shapes

Three ways, all doing the same thing (step through the sorted instance list from 3.2):

1. **Drag** horizontally on the neck. While dragging, the highlighted shape is whichever instance's centre is nearest to where the finger has pulled it; it snaps on release. Use pointer events and `touch-action: pan-y` so the page still scrolls vertically.
2. **Tap a faded note** to jump to the nearest shape that contains it.
3. **Shape strip** under the neck: the instances in neck order with the current one highlighted, plus ◀ ▶. Left/right arrow keys do the same.

None of these change key or scale.

### 5.4 Mode strip (7-note scales only)

A row of seven chips plus a two-way switch.

- **Same notes** (default): chips are the parent's modes, for D major: D Ionian, E Dorian, F# Phrygian, G Lydian, A Mixolydian, B Aeolian, C# Locrian. Tapping one keeps every dot where it is and moves only the root marking and the degree labels. The title becomes "E Dorian · same notes as D major".
- **Same root**: chips are D Ionian, D Dorian, D Phrygian and so on. Tapping one changes the notes. Dots that differ from plain major (for Lydian, Mixolydian) or plain minor (for Dorian, Phrygian, Locrian) get an accent colour, so the student sees that Dorian is minor with a raised 6th. One line under the neck says it: "Dorian = minor with a major 6th".

Picking Major or Minor from the scale row is the same as tapping Ionian or Aeolian.

### 5.5 State and links

```js
state = { tonicPc, scale, modeView:'notes'|'root', instanceIndex, labels, neck }
```

Save to `localStorage` and mirror into the URL hash (for example `#key=D&scale=major&shape=E`) so Matthew can send a student a link that opens on a specific shape. On load the hash wins over `localStorage`.

## 6. Build order

Each phase ends with something Matthew can open and judge. Stop and show him after each.

1. **Engine.** `theory.js` and `test.mjs`, all tests passing.
2. **Shapes.** New page with key picker, Major / Minor / both pentatonics, the neck, faded neighbours, drag, shape strip, label switch. No modes yet. This phase replaces the live page.
3. **Modes.** Mode strip, "same notes" then "same root" with the accent on changed notes.
4. **Links.** URL hash.

## 7. How to check it is right

- Run `node test.mjs`.
- Open the page with the preview tools at phone width (375) and desktop width, light and dark.
- D major: drag from the A shape (frets 4 to 8) up to the E shape (frets 9 to 12, root on low E fret 10). This is the example Matthew gave.
- A minor pentatonic: step through Shapes 1 to 5 and compare each with any standard pentatonic chart.
- Tap around the neck and confirm the key never changes.
- After pushing, fetch the live page and its `app.js` and confirm the new code is there before saying it is deployed.

## 8. Later, not now

Do not build these, but do not block them either.

- **Circle-of-fifths wheel** as the key picker (hence the component boundary in 5.1). The relative minor sits on the inner ring.
- **Chord shape inside the scale:** highlight R 3 5 so the C/A/G/E/D chord is visible inside each shape. Likely the first addition.
- **Pentatonic inside the full scale:** pentatonic notes solid, the two extra notes hollow.
- **Chord progressions.**
- 3-notes-per-string shapes, harmonic/melodic minor, blues scale, sound.

## 9. Settled naming

Matthew confirmed on 16/11/2026 that major pentatonic shapes are named by CAGED letter, not numbered. Only the minor pentatonic uses Shape 1 to 5. The table in 3.5 is final.

## "Play over chords" mode (built 17/11/2026)

A link from the Progression Builder (`../progression-builder/`) can carry a
chord progression: `pk=` (its key), `prog=` (chord numbers bar by bar), `bpm=`
and `lv=`. Only then does this page show a chord strip and a Play button above
the neck, loop the chords over a drum beat, and ring the notes of the chord
being played. The key and scale pickers are hidden in this mode and replaced by
three scales that share one set of notes. Close returns to the plain view.

How it keeps to the rules in section 1:

- **No sound in the plain view.** Sound exists only in this mode.
- **Tapping or dragging the neck never changes the key or scale.** Unchanged.
- **One idea on screen.** The pickers are hidden while the chords are shown,
  and the mode has a single one-line note.
- The progression is never saved on the device, so the next visit is plain.

`progression.js` and `audio.js` are copies of the builder's `theory.js` and
`audio.js`. The builder is the master: never edit them here. The full write-up
is in `../progression-builder/PLAN.md`.
