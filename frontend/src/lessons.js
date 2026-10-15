/**
 * The curriculum, beginner to playing with feel.
 *
 * Kept deliberately short. Every line a kid has to read before they touch the
 * piano is a line that delays them touching the piano, so each level is a few
 * sentences and a thing to go and do. The slant is church band: numbers and
 * 1-5-6-4 arrive early, because that is what gets used on a Sunday.
 */

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
    tryIt: { tab: 'style', what: 'Play the progression adding 7ths and susses.' },
  },
]

export const STAGES = [
  { name: 'Starting out', from: 1, to: 3, hint: 'Never touched a piano' },
  { name: 'Playing chords', from: 4, to: 7, hint: 'Enough to join in' },
  { name: 'Any key, by ear', from: 8, to: 10, hint: 'Playing with other people' },
  { name: 'Playing with feel', from: 11, to: 14, hint: 'Sounding good, not just right' },
]
