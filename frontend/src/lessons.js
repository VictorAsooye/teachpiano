/**
 * The curriculum, beginner to playing with feel.
 *
 * Kept deliberately short. Every line a kid has to read before they touch the
 * piano is a line that delays them touching the piano, so each level is a few
 * sentences, a picture, and a thing to go and do. The slant is church band:
 * numbers and 1-5-6-4 arrive early, because that is what gets used on a Sunday.
 *
 * Every level carries a `visual`. Piano is a spatial instrument — "skip every
 * other note" is one sentence and one glance, and the glance is the half that
 * sticks. See components/LessonVisual.jsx for the four shapes a visual can
 * take; the data here stays declarative.
 *
 * Middle C is MIDI 60 throughout.
 */

// The notes of C major, an octave and the landing C on top.
const C_SCALE = [60, 62, 64, 65, 67, 69, 71, 72]

/** Number every note of a scale 1..7, with the octave on top as 8. */
const numbered = (midis, tone = 'soft') =>
  midis.map((midi, i) => ({
    midi,
    text: i === 7 ? '8' : String(i + 1),
    tone: i === 0 || i === 7 ? 'root' : tone,
  }))

/** Letter-name a handful of notes — the three or four in a chord. */
const named = (pairs, tone = 'root') =>
  pairs.map(([midi, text]) => ({ midi, text, tone }))

export const LESSONS = [
  {
    level: 1,
    title: 'Find your way around',
    blurb: 'The black keys are a map.',
    minutes: 5,
    learn: [
      'Black keys come in groups of **2** and **3**, over and over.',
      '**C is the white key just left of any group of 2.** That is the whole trick.',
      'White keys go A B C D E F G, then start again. 88 keys, only 12 notes.',
    ],
    visual: {
      span: [60, 83],
      letters: true,
      clusters: true,
      marks: [
        { midi: 60, text: 'C', tone: 'root' },
        { midi: 72, text: 'C', tone: 'root' },
      ],
      caption: 'Press any key to hear it. Count the brackets: 2, 3, 2, 3 — and C sits just left of every 2.',
    },
    tryIt: { tab: 'keys', what: 'Find every C on the keyboard.' },
  },
  {
    level: 2,
    title: 'What a key is',
    blurb: 'Seven notes that belong together.',
    minutes: 5,
    learn: [
      'Songs use **7** of the 12 notes, not all of them. Those 7 are a **key**.',
      '**C major** is the easy one: all white keys.',
      'The first note is **home**. Play C D E F G A B and stop — it feels unfinished. Play the next C and it lands.',
    ],
    visual: {
      span: [60, 72],
      marks: numbered(C_SCALE),
      play: C_SCALE,
      playLabel: 'Hear the key',
      caption: 'Blue is home at both ends. Press them in order, then stop on 7 and hear how badly it wants the 8.',
    },
    tryIt: { tab: 'keys', what: 'Press "Hear it" on C major, then play it yourself.' },
  },
  {
    level: 3,
    title: 'Count, do not spell',
    blurb: 'Why bands say "the 4" and not "F".',
    minutes: 5,
    learn: [
      'Number your 7 notes. In C: C=**1**, D=2, E=3, F=**4**, G=**5**, A=**6**, B=7.',
      'Bands call numbers, not letters. "1 5 6 4" works in every key.',
      'Learn a song by numbers and you know it in all 12 keys. By letters, just one.',
    ],
    visual: {
      span: [60, 72],
      marks: [
        { midi: 60, text: '1', tone: 'root' },
        { midi: 62, text: '2', tone: 'soft' },
        { midi: 64, text: '3', tone: 'soft' },
        { midi: 65, text: '4', tone: 'accent' },
        { midi: 67, text: '5', tone: 'accent' },
        { midi: 69, text: '6', tone: 'soft' },
        { midi: 71, text: '7', tone: 'soft' },
        { midi: 72, text: '8', tone: 'root' },
      ],
      play: [60, 67, 69, 65],
      playAs: 'chords',
      playLabel: 'Hear 1 - 5 - 6 - 4',
      caption: 'Orange is the 4 and the 5 — the two you will call most often.',
    },
    tryIt: { tab: 'keys', what: 'Play C major saying the numbers out loud.' },
  },
  {
    level: 4,
    title: 'Your first chords',
    blurb: 'Skip a note, skip a note.',
    minutes: 10,
    learn: [
      'A **chord** is 3 notes together. Start anywhere and **skip every other note**.',
      'From C: C, E, G. That is the **1 chord**. Thumb, middle, little finger.',
      'Same shape from F gives F A C (**the 4**). From G gives G B D (**the 5**).',
    ],
    visual: {
      kind: 'row',
      playAll: 'Hear all three',
      items: [
        {
          title: 'The 1',
          sub: 'C  E  G',
          span: [60, 76],
          marks: named([[60, 'C'], [64, 'E'], [67, 'G']]),
          play: [60, 64, 67],
        },
        {
          title: 'The 4',
          sub: 'F  A  C',
          span: [60, 76],
          marks: named([[65, 'F'], [69, 'A'], [72, 'C']]),
          play: [65, 69, 72],
        },
        {
          title: 'The 5',
          sub: 'G  B  D',
          span: [60, 76],
          marks: named([[67, 'G'], [71, 'B'], [74, 'D']]),
          play: [67, 71, 74],
        },
      ],
      caption: 'Look at the gaps, not the letters. It is the same shape slid along: on, off, on, off, on.',
    },
    tryIt: { tab: 'keys', what: 'Play C-E-G, then F-A-C, then G-B-D.' },
  },
  {
    level: 5,
    title: 'Happy and sad',
    blurb: 'One note changes everything.',
    minutes: 10,
    learn: [
      'Play C-E-G. That is **major** — bright.',
      'Move the middle note down one key: C-Eb-G. That is **minor** — dark. One note.',
      'In any key the **1, 4 and 5** come out major. The **2, 3 and 6** come out minor.',
    ],
    visual: {
      kind: 'row',
      items: [
        {
          title: 'Major',
          sub: 'C  E  G — bright',
          span: [60, 72],
          marks: named([[60, 'C'], [64, 'E'], [67, 'G']]),
          play: [60, 64, 67],
          playLabel: 'Hear major',
        },
        {
          title: 'Minor',
          sub: 'C  E♭  G — dark',
          span: [60, 72],
          marks: [
            { midi: 60, text: 'C', tone: 'root' },
            { midi: 63, text: 'E♭', tone: 'accent' },
            { midi: 67, text: 'G', tone: 'root' },
          ],
          play: [60, 63, 67],
          playLabel: 'Hear minor',
        },
      ],
      caption: 'The outside notes never moved. The middle one slid one key left, onto a black key.',
    },
    tryIt: { tab: 'ear', what: 'Flip between major and minor and listen.' },
  },
  {
    level: 6,
    title: 'The four chords',
    blurb: '1 - 5 - 6 - 4.',
    minutes: 15,
    learn: [
      'Play **1, 5, 6, 4** — in C that is C, G, Am, F. Four beats each. Loop it.',
      'That pattern carries a huge share of worship and pop music.',
      'Left hand: just the bottom note of each chord, low down.',
    ],
    visual: {
      kind: 'row',
      playAll: 'Hear the loop',
      items: [
        {
          title: '1',
          sub: 'C',
          span: [60, 76],
          marks: named([[60, 'C'], [64, 'E'], [67, 'G']]),
          play: [60, 64, 67],
        },
        {
          title: '5',
          sub: 'G',
          span: [60, 76],
          marks: named([[67, 'G'], [71, 'B'], [74, 'D']]),
          play: [67, 71, 74],
        },
        {
          title: '6',
          sub: 'Am',
          span: [60, 76],
          marks: named([[69, 'A'], [72, 'C'], [76, 'E']]),
          play: [69, 72, 76],
        },
        {
          title: '4',
          sub: 'F',
          span: [60, 76],
          marks: named([[65, 'F'], [69, 'A'], [72, 'C']]),
          play: [65, 69, 72],
        },
      ],
      caption: 'Press "Hear the loop" and you will recognise it before the third chord.',
    },
    tryIt: { tab: 'decode', what: 'Paste a song you know and look for 1-5-6-4.' },
  },
  {
    level: 7,
    title: 'A new key',
    blurb: 'Same shapes, moved.',
    minutes: 15,
    learn: [
      '**G major** is C major with one change: every F becomes **F#**.',
      'Numbers: G=1, A=2, B=3, C=4, D=5, E=6, F#=7.',
      'So 1-5-6-4 in G is **G, D, Em, C**. Same shapes, new spot.',
    ],
    visual: {
      kind: 'row',
      items: [
        {
          title: 'C major',
          sub: 'all white keys',
          span: [60, 72],
          marks: numbered(C_SCALE),
          play: C_SCALE,
          playAs: 'scale',
          playLabel: 'Hear C',
        },
        {
          title: 'G major',
          sub: 'one black key',
          span: [67, 79],
          marks: [
            { midi: 67, text: '1', tone: 'root' },
            { midi: 69, text: '2', tone: 'soft' },
            { midi: 71, text: '3', tone: 'soft' },
            { midi: 72, text: '4', tone: 'soft' },
            { midi: 74, text: '5', tone: 'soft' },
            { midi: 76, text: '6', tone: 'soft' },
            { midi: 78, text: '7', tone: 'accent' },
            { midi: 79, text: '8', tone: 'root' },
          ],
          play: [67, 69, 71, 72, 74, 76, 78, 79],
          playAs: 'scale',
          playLabel: 'Hear G',
        },
      ],
      caption: 'Identical pattern of steps, started somewhere else. The one orange key is F♯ — the only new note.',
    },
    tryIt: { tab: 'keys', what: 'Pick G, play the scale, then G-D-Em-C.' },
  },
  {
    level: 8,
    title: 'All twelve keys',
    blurb: 'One a week beats all twelve in a night.',
    minutes: 30,
    learn: [
      'Keys are listed easiest first. Each adds one more black key.',
      'For each: play the scale, find its 1-4-5-6, loop 1-5-6-4.',
      'Every major key shares its notes with a minor one. Learn C and you get Am free.',
    ],
    visual: {
      kind: 'row',
      items: [
        {
          title: 'C',
          sub: 'no black keys',
          span: [60, 72],
          marks: numbered(C_SCALE),
          play: C_SCALE,
          playAs: 'scale',
          playLabel: 'Hear C',
        },
        {
          title: 'G',
          sub: 'one: F♯',
          span: [67, 79],
          marks: [
            ...numbered([67, 69, 71, 72, 74, 76]),
            { midi: 78, text: '7', tone: 'accent' },
            { midi: 79, text: '8', tone: 'root' },
          ],
          play: [67, 69, 71, 72, 74, 76, 78, 79],
          playAs: 'scale',
          playLabel: 'Hear G',
        },
        {
          title: 'D',
          sub: 'two: F♯ C♯',
          span: [62, 74],
          marks: [
            { midi: 62, text: '1', tone: 'root' },
            { midi: 64, text: '2', tone: 'soft' },
            { midi: 66, text: '3', tone: 'accent' },
            { midi: 67, text: '4', tone: 'soft' },
            { midi: 69, text: '5', tone: 'soft' },
            { midi: 71, text: '6', tone: 'soft' },
            { midi: 73, text: '7', tone: 'accent' },
            { midi: 74, text: '8', tone: 'root' },
          ],
          play: [62, 64, 66, 67, 69, 71, 73, 74],
          playAs: 'scale',
          playLabel: 'Hear D',
        },
        {
          title: 'A',
          sub: 'three: F♯ C♯ G♯',
          span: [69, 81],
          marks: [
            { midi: 69, text: '1', tone: 'root' },
            { midi: 71, text: '2', tone: 'soft' },
            { midi: 73, text: '3', tone: 'accent' },
            { midi: 74, text: '4', tone: 'soft' },
            { midi: 76, text: '5', tone: 'soft' },
            { midi: 78, text: '6', tone: 'accent' },
            { midi: 80, text: '7', tone: 'accent' },
            { midi: 81, text: '8', tone: 'root' },
          ],
          play: [69, 71, 73, 74, 76, 78, 80, 81],
          playAs: 'scale',
          playLabel: 'Hear A',
        },
      ],
      caption: 'Each key along the row adds exactly one orange key. The shape of the steps never changes.',
    },
    tryIt: { tab: 'keys', what: 'Take the next key you have not done.' },
  },
  {
    level: 9,
    title: 'Find the key by ear',
    blurb: 'Hunt for home.',
    minutes: 15,
    learn: [
      'You do not need perfect pitch. You need to find **home**.',
      'While music plays, try notes one at a time. Most sound wrong. One sounds like it arrived.',
      'Then play the 3rd above it. Bright = major, dark = minor.',
    ],
    visual: {
      span: [60, 72],
      marks: [
        { midi: 60, text: 'home', tone: 'root' },
        { midi: 62, text: '2', tone: 'soft' },
        { midi: 64, text: '3', tone: 'accent' },
        { midi: 65, text: '4', tone: 'soft' },
        { midi: 67, text: '5', tone: 'soft' },
        { midi: 69, text: '6', tone: 'soft' },
        { midi: 71, text: '7', tone: 'soft' },
        { midi: 72, text: 'home', tone: 'root' },
      ],
      play: [62, 64, 65, 67, 69, 71, 72],
      playAs: 'scale',
      playLabel: 'Hear it land on home',
      caption: 'Blue is home — the note that feels like arriving. Orange is the 3rd you check next: bright means major, dark means minor.',
    },
    tryIt: { tab: 'ear', what: 'Start on Easy. Hunt, then lock it in.' },
  },
  {
    level: 10,
    title: 'Follow a live singer',
    blurb: 'Four bars to find the key.',
    minutes: 15,
    learn: [
      'A singer picks whatever key suits their voice. The band meets them there.',
      'Use the **Live key finder** to check yourself, then confirm by playing home.',
      'Got the key? Find 1, play 1-5-6-4, you are in.',
    ],
    visual: {
      kind: 'row',
      items: [
        {
          title: 'Singer in C',
          sub: '1 = C',
          span: [60, 79],
          marks: named([[60, 'C'], [64, 'E'], [67, 'G']]),
          play: [60, 64, 67],
        },
        {
          title: 'Singer in E♭',
          sub: '1 = E♭',
          span: [60, 79],
          marks: named([[63, 'E♭'], [67, 'G'], [70, 'B♭']]),
          play: [63, 67, 70],
        },
        {
          title: 'Singer in G',
          sub: '1 = G',
          span: [60, 79],
          marks: named([[67, 'G'], [71, 'B'], [74, 'D']]),
          play: [67, 71, 74],
        },
      ],
      caption: 'Same chord, three singers. The shape just slides — which is why bands call numbers, not letters.',
    },
    tryIt: { tab: 'live', what: 'Have someone sing and check what it says.' },
  },

  // ---- past the basics: this is where it stops being about notes ----
  {
    level: 11,
    title: 'Stop playing like a robot',
    blurb: 'Loud and soft is most of what feel is.',
    minutes: 15,
    advanced: true,
    learn: [
      'Beginners hit every note the same. That is the main thing that sounds "learner".',
      'Lean on the **top note** of each chord — that is the one people hear as the tune.',
      'Build through a line and ease off at the end of it. Loud everywhere is the same as quiet everywhere.',
    ],
    visual: {
      kind: 'bars',
      rows: [
        {
          label: 'Robot',
          bars: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55],
          note: 'Every note the same weight',
        },
        {
          label: 'Musical',
          good: true,
          bars: [0.3, 0.44, 0.62, 0.82, 1, 0.76, 0.5, 0.28],
          note: 'Build through the line, then ease off',
        },
      ],
      caption: 'Height is how hard you press. Same notes in both rows — only the weight changed.',
    },
    tryIt: { tab: 'style', what: 'Play 1-5-6-4 and let it check your dynamics.' },
  },
  {
    level: 12,
    title: 'Stop jumping around',
    blurb: 'Inversions: move less, sound better.',
    minutes: 20,
    advanced: true,
    learn: [
      'C to F in root position is a big leap. It sounds clumsy because it is.',
      'An **inversion** is the same chord with the notes reordered — C-E-G can be E-G-C or G-C-E.',
      'Pick the inversion nearest your hand. Your fingers barely move and it sounds smoother.',
    ],
    visual: {
      kind: 'row',
      items: [
        {
          title: 'You are here',
          sub: 'C  E  G',
          span: [60, 76],
          marks: named([[60, 'C'], [64, 'E'], [67, 'G']]),
          play: [60, 64, 67],
          playLabel: 'Hear C',
        },
        {
          title: 'F the long way',
          sub: 'F  A  C — a leap up',
          span: [60, 76],
          marks: named([[65, 'F'], [69, 'A'], [72, 'C']], 'soft'),
          play: [65, 69, 72],
          playLabel: 'Hear the leap',
        },
        {
          title: 'F inverted',
          sub: 'C  F  A — right there',
          span: [60, 76],
          marks: named([[60, 'C'], [65, 'F'], [69, 'A']], 'accent'),
          play: [60, 65, 69],
          playLabel: 'Hear the inversion',
        },
      ],
      caption: 'Both middle and right are F. Compare how far your hand travels from the first picture.',
    },
    tryIt: { tab: 'style', what: 'Play the progression using inversions and compare.' },
  },
  {
    level: 13,
    title: 'Leave gaps',
    blurb: 'What you do not play matters.',
    minutes: 20,
    advanced: true,
    learn: [
      'Every chord on every beat is a wall of sound. Nobody can sing over it.',
      'Hold a chord and let it ring. Come in under the singer, not on top of them.',
      'Try playing on beats 1 and 3 only, and listen to how much room appears.',
    ],
    visual: {
      kind: 'beats',
      rows: [
        {
          label: 'Wall of sound',
          beats: [true, true, true, true, true, true, true, true],
          note: 'Nobody can sing over this',
        },
        {
          label: 'Room to breathe',
          good: true,
          beats: [true, false, true, false, true, false, true, false],
          note: 'Hold it and let it ring',
        },
      ],
      caption: 'Two bars of four. Filled means you play; empty means you let it ring. Same chords, half the hits.',
    },
    tryIt: { tab: 'style', what: 'Play the same four chords with half as many notes.' },
  },
  {
    level: 14,
    title: 'Add colour',
    blurb: 'The 7th, the 2, and the sus.',
    minutes: 25,
    advanced: true,
    learn: [
      'Add one more skip to a chord and you get a **7th** — richer, less plain.',
      'A **sus** swaps the middle note for the one above it, then falls back. Classic worship move.',
      'Use these sparingly. A plain chord in the right place beats a fancy one in the wrong place.',
    ],
    visual: {
      kind: 'row',
      items: [
        {
          title: 'Plain',
          sub: 'C  E  G',
          span: [60, 74],
          marks: named([[60, 'C'], [64, 'E'], [67, 'G']]),
          play: [60, 64, 67],
          playLabel: 'Hear plain',
        },
        {
          title: 'With a 7th',
          sub: 'C  E  G  B',
          span: [60, 74],
          marks: [
            ...named([[60, 'C'], [64, 'E'], [67, 'G']]),
            { midi: 71, text: 'B', tone: 'accent' },
          ],
          play: [60, 64, 67, 71],
          playLabel: 'Hear the 7th',
        },
        {
          title: 'Sus',
          sub: 'C  F  G',
          span: [60, 74],
          marks: [
            ...named([[60, 'C'], [67, 'G']]),
            { midi: 65, text: 'F', tone: 'accent' },
          ],
          play: [60, 65, 67],
          playLabel: 'Hear the sus',
        },
      ],
      caption: 'Orange is the only thing that changed each time. One note is the whole difference.',
    },
    tryIt: { tab: 'style', what: 'Play the progression adding 7ths and susses.' },
  },
]

export const STAGES = [
  { name: 'Starting out', from: 1, to: 3, hint: 'Never touched a piano' },
  { name: 'Playing chords', from: 4, to: 7, hint: 'Enough to join in' },
  { name: 'Any key, by ear', from: 8, to: 10, hint: 'Playing with other people' },
  { name: 'Playing with feel', from: 11, to: 14, hint: 'Sounding good, not just right' },
]
