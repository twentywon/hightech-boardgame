/**
 * Quiet jazz for the whole page, the kind heard low in a café or a pub, made
 * as it is played: nothing is recorded and nothing is fetched. A trio plays
 * it: an electric piano comps the chords (seventh and ninth chords, without
 * their roots, on the swung off-beats), an upright bass walks under it, and
 * brushes and a ride cymbal keep the time; now and then a vibraphone or the
 * piano plays a short line over the changes. The changes are drawn round by
 * round (ii–V–I and its relatives) and the lines are improvised from the
 * chord's own scale, so no two minutes are the same.
 *
 * There are two pieces of it. In the collection a medium swing plays, with
 * the bass walking, the ride and the vibraphone. At a table a ballad takes its
 * place, slower and quieter, the bass in two, brushes only and fewer notes, so
 * that it stays behind the game. One fades into the other.
 *
 * Some tables have music of their own instead (`OWN`): Korean and Indian music for the tables of those countries,
 * bright pop for the amusement park's machines (`ARCADE`) and rock for the bowling alley (`ROCK`). Those two are
 * made the same way: their changes are drawn four bars at a time from happy pop or rock progressions, each four
 * bars are a section of their own (a groove, a hook, a lift; a verse, a chorus, a break), and their lines are
 * drawn from the chord's scale, so they never come round the same way twice either.
 *
 * It begins only after the first touch or key (a page may not make a sound
 * before that), rests while the page is hidden, and can be switched off in
 * the settings.
 */
const C4 = 261.63,
  hertz = (semitones: number) => C4 * 2 ** (semitones / 12);
const ROOTS: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
/** Each kind of chord: its notes from the root, the piano's rootless voicing, and the scale a line is drawn from. */
const KINDS: Record<string, { tones: number[]; voicing: number[]; scale: number[] }> = {
  maj9: { tones: [0, 4, 7, 11], voicing: [4, 7, 11, 14], scale: [0, 2, 4, 7, 9, 11] },
  "6": { tones: [0, 4, 7, 9], voicing: [4, 9, 14, 16], scale: [0, 2, 4, 7, 9] },
  m9: { tones: [0, 3, 7, 10], voicing: [3, 7, 10, 14], scale: [0, 2, 3, 5, 7, 10] },
  m7: { tones: [0, 3, 7, 10], voicing: [3, 7, 10, 15], scale: [0, 2, 3, 5, 7, 10] },
  "13": { tones: [0, 4, 7, 10], voicing: [4, 9, 10, 14], scale: [0, 2, 4, 7, 9, 10] },
  "9": { tones: [0, 4, 7, 10], voicing: [4, 7, 10, 14], scale: [0, 2, 4, 7, 9, 10] },
  "7b9": { tones: [0, 4, 7, 10], voicing: [4, 7, 10, 13], scale: [0, 1, 4, 7, 8, 10] },
  m7b5: { tones: [0, 3, 6, 10], voicing: [3, 6, 10, 15], scale: [0, 3, 5, 6, 8, 10] },
  // Pop's plain triads, a line drawn from the chord's own pentatonic (all of it in the key), and rock's power chord.
  "": { tones: [0, 4, 7], voicing: [0, 4, 7], scale: [0, 2, 4, 7, 9] },
  m: { tones: [0, 3, 7], voicing: [0, 3, 7], scale: [0, 3, 5, 7, 10] },
  "5": { tones: [0, 7], voicing: [0, 7, 12], scale: [0, 3, 5, 7, 10] },
};
interface Chord {
  root: number;
  tones: number[];
  voicing: number[];
  scale: number[];
}
function chord(name: string): Chord {
  const [, root, kind] = /^([A-G]b?)(.*)$/.exec(name)!;
  return { root: ROOTS[root], ...KINDS[kind] };
}
/** The jazz of the collection and of most tables. */
interface Jazz {
  style: "jazz";
  /** Beats a minute. */
  tempo: number;
  /** Where in a beat its off-beat falls: a half is straight, two thirds a full swing. */
  swing: number;
  /** How far the whole piece is moved from C, in semitones. */
  key: number;
  /** Rounds of four bars, a chord a bar; one is drawn after another. */
  rounds: string[][];
  /** The bass walks in quarters, or plays in two (half notes) as in a ballad. */
  bass: "walk" | "two";
  /** Where in a bar the piano strikes its chord, in beats (x.5 is the swung off-beat), and how many beats it holds it. */
  comps: number[][];
  hold: number;
  /** Whether the ride cymbal plays, and how loud the brushes are. */
  ride: boolean;
  brush: number;
  /** How often a bar begins a line, how many bars a line runs, and where and how it is played. */
  lines: { chance: number; bars: [number, number]; range: [number, number]; voice: "vibes" | "keys"; rhythms: number[][] };
  /** How loud the piano, the bass and the line are. */
  keys: number;
  low: number;
  tune: number;
}
/** The collection: a medium swing in C, the bass walking, the ride and a vibraphone. */
const LOBBY: Jazz = {
  style: "jazz",
  tempo: 112,
  swing: 0.64,
  key: 0,
  rounds: [
    ["Dm9", "G13", "Cmaj9", "Cmaj9"],
    ["Cmaj9", "A7b9", "Dm9", "G13"],
    ["Em7", "A7b9", "Dm9", "G13"],
    ["Fmaj9", "Bb13", "Cmaj9", "A7b9"],
    ["Cmaj9", "Ebm7", "Dm9", "Db13"],
    ["Fmaj9", "Fm7", "Em7", "A7b9"],
  ],
  bass: "walk",
  comps: [[0, 1.5], [1.5], [0.5, 2.5], [1.5, 3], [0, 2.5], [2.5], [1, 3.5]],
  hold: 0.9,
  ride: true,
  brush: 0.006,
  lines: {
    chance: 0.4,
    bars: [1, 3],
    range: [12, 28],
    voice: "vibes",
    rhythms: [[0, 0.5, 1, 1.5, 2], [0.5, 1, 1.5, 2.5, 3], [0, 1, 1.5, 2.5], [1.5, 2, 2.5, 3, 3.5], [0, 0.5, 1.5, 2, 3], [0, 2], [0.5, 1.5, 2.5]],
  },
  keys: 0.017,
  low: 0.075,
  tune: 0.04,
};
/** A table: a ballad a tone down, slower, the bass in two, brushes only, few notes. */
const TABLE: Jazz = {
  style: "jazz",
  tempo: 66,
  swing: 0.6,
  key: -2,
  rounds: [
    ["Am9", "D9", "Gmaj9", "Cmaj9"],
    ["Fmaj9", "E7b9", "Am9", "Am9"],
    ["Dm9", "G13", "Cmaj9", "E7b9"],
    ["Bm7b5", "E7b9", "Am9", "A13"],
    ["Dm9", "G13", "Em7", "A7b9"],
    ["Fmaj9", "Fm7", "Cmaj9", "C6"],
  ],
  bass: "two",
  comps: [[0], [0, 2.5], [0], [0, 3], [0.5]],
  hold: 3.2,
  ride: false,
  brush: 0.008,
  lines: {
    chance: 0.25,
    bars: [1, 2],
    range: [5, 20],
    voice: "keys",
    rhythms: [[0, 1, 2], [0.5, 1.5, 3], [0, 1.5], [1, 2, 2.5], [0, 2]],
  },
  keys: 0.015,
  low: 0.07,
  tune: 0.034,
};
/**
 * Korean court and folk music for the Korean tables (gonu, yut): a gayageum plucking the five notes of gyemyeonjo
 * on A, its long notes shaken (nonghyeon) and now and then bent down a step, a daegeum holding a note over it,
 * and a janggu keeping the gutgeori rhythm (four beats of three).
 */
interface Gugak {
  style: "korea";
  /** Seconds a beat (a dotted quarter); a bar is four beats of three. */
  beat: number;
  /** Pitch classes of the mode, as semitones from C. */
  mode: number[];
  /** Where the gayageum plucks in a bar, in eighths (0 to 12), and its range. */
  figures: number[][];
  range: [number, number];
  /** How often a bar holds a daegeum note, and where it goes. */
  flute: number;
  high: [number, number];
  /** Notes a bar's first pluck rests on. */
  rest: number[];
  drum: number;
  pluck: number;
  breath: number;
}
const KOREA: Gugak = {
  style: "korea",
  beat: 0.82,
  mode: [9, 0, 2, 4, 7],
  figures: [[0, 3, 6, 9], [0, 2, 3, 6, 8, 9], [0, 3, 4, 6, 9, 10], [0, 6], [0, 3, 6, 8, 9, 11], [0, 1.5, 3, 6, 9], [0, 4, 6, 10]],
  range: [-3, 16],
  flute: 0.45,
  high: [9, 21],
  rest: [9, 4, 9, 2],
  drum: 0.055,
  pluck: 0.05,
  breath: 0.03,
};
/**
 * North Indian music for the Indian tables (mancala, carrom, peg solitaire): a tanpura's drone on Sa and Pa, a
 * tabla playing teental (sixteen beats, four by four, the third four open) and a sitar wandering through a calm
 * evening raga (the notes of Yaman on D), gliding into some notes, coming home to Sa or Pa on the first beat.
 */
interface Raga {
  style: "india";
  /** Seconds a beat (a matra); a bar is one vibhag of four. */
  beat: number;
  /** Sa, in semitones from middle C, and the raga's notes from Sa. */
  sa: number;
  notes: number[];
  /** Where the sitar plucks in a bar, in beats, and its range in semitones from middle C. */
  figures: number[][];
  range: [number, number];
  /** How often a bar begins a phrase, and how many bars it runs. */
  chance: number;
  bars: [number, number];
  drone: number;
  tabla: number;
  sitar: number;
}
const INDIA: Raga = {
  style: "india",
  beat: 0.62,
  sa: 2,
  notes: [0, 2, 4, 6, 7, 9, 11],
  figures: [[0, 1, 2, 3], [0, 0.5, 1, 2, 3], [0, 1.5, 2, 2.5, 3], [0, 2], [0, 1, 1.5, 2, 3, 3.5], [0, 0.75, 1.5, 3], [0, 3]],
  range: [-1, 21],
  chance: 0.6,
  bars: [1, 3],
  drone: 0.014,
  tabla: 0.05,
  sitar: 0.05,
};
/** A bass's eighth: semitones above the chord's root, "a" a step into the next root, null a rest. */
type Step = number | "a" | null;
/**
 * Bright pop for the amusement park's machines (whack-a-mole, the claw machine, basketball): a four-on-the-floor
 * kick with claps on two and four and hats on the off-beats, a driving synth bass in eighths, a plucked synth chord
 * stabbing the off-beats, and over it a toy-like arpeggio or a catchy hook drawn from the chord's scale.
 */
interface Arcade {
  style: "arcade";
  tempo: number;
  /** How far the whole piece is moved from C, in semitones. */
  key: number;
  /** Rounds of four bars, a chord a bar; one is drawn after another. */
  rounds: string[][];
  /** Where the chord stab strikes in a bar, in beats (on the off-beats, mostly); one is drawn a phrase. */
  stabs: number[][];
  /** The bass's eight eighths a bar; one pattern is drawn a phrase. */
  basses: Step[][];
  /** The arpeggio's eight eighths a bar, as places among the chord's notes from the lowest up (two octaves). */
  arps: number[][];
  /** Rhythms a hook's motif is drawn from (one bar, in beats), and the range of the hook. */
  hooks: number[][];
  range: [number, number];
  /** How often a phrase is a lift: no kick, the chords held, and a roll into the next phrase. */
  lift: number;
  /** How loud each part is. */
  kick: number;
  clap: number;
  hat: number;
  bass: number;
  stab: number;
  lead: number;
  arp: number;
}
const ARCADE: Arcade = {
  style: "arcade",
  tempo: 132,
  key: 2,
  rounds: [
    ["C", "G", "Am", "F"],
    ["Am", "F", "C", "G"],
    ["C", "Am", "F", "G"],
    ["F", "G", "Em", "Am"],
    ["C", "F", "Am", "G"],
    ["F", "C", "G", "Am"],
    ["C", "G", "F", "G"],
    ["Dm", "G", "C", "Am"],
    ["F", "G", "C", "C"],
  ],
  stabs: [
    [0.5, 1.5, 2.5, 3.5],
    [0.5, 1.5, 2.5, 3.5],
    [0.5, 1.5, 2.5, 3.25, 3.75],
    [0.5, 1.75, 2.5, 3.5],
    [0.75, 1.5, 2.75, 3.5],
  ],
  basses: [
    [0, 12, 0, 12, 0, 12, 0, 12],
    [0, 12, 0, 12, 0, 12, 7, "a"],
    [0, 0, 0, 0, 0, 0, 0, "a"],
    [0, 0, 12, 0, 7, 0, 12, "a"],
    [0, null, 0, 12, null, 12, 7, "a"],
  ],
  arps: [
    [0, 1, 2, 3, 4, 3, 2, 1],
    [0, 2, 1, 3, 2, 4, 3, 5],
    [3, 2, 1, 2, 3, 4, 3, 2],
    [0, 1, 2, 1, 3, 2, 4, 2],
    [0, 2, 3, 2, 4, 3, 5, 3],
  ],
  hooks: [
    [0, 0.5, 1, 1.5, 2.5, 3],
    [0, 0.75, 1.5, 2, 3],
    [0.5, 1, 1.5, 2.5, 3, 3.5],
    [0, 1, 1.5, 2.5, 3],
    [0, 0.5, 1.5, 2, 2.5, 3.5],
    [0, 0.75, 1.5, 2.25, 3],
    [0, 1.5, 2, 3],
  ],
  range: [7, 24],
  lift: 0.1,
  kick: 0.12,
  clap: 0.24,
  hat: 0.04,
  bass: 0.058,
  stab: 0.04,
  lead: 0.026,
  arp: 0.02,
};
/** A power chord struck in a bar: where (in beats), for how many beats, and how: "m" palm-muted, "o" open, "n" open and the next bar's chord, pushed ahead of it. */
type Strike = [number, number, "m" | "o" | "n"];
/**
 * Rock for the bowling alley: power chords on an overdriven guitar (the oscillators through one shared amplifier: an
 * overdrive and a cabinet that keeps the low and the middle), a bass on the roots in eighths, a rock kit (kick,
 * snare, hats, a crash at the head of a phrase, fills round the toms) and now and then a short lead fill.
 */
interface Rock {
  style: "rock";
  tempo: number;
  key: number;
  /** The key's tonic as a pitch class: lead fills are drawn from its minor pentatonic. */
  tonic: number;
  rounds: string[][];
  /** Riffs a phrase is drawn from, by section. */
  riffs: Record<"verse" | "chorus" | "break", Strike[][]>;
  /** Where the kick falls in a bar; one is drawn a phrase. */
  kicks: number[][];
  /** Rhythms of a bar of lead fill, in beats, and its range. */
  licks: number[][];
  range: [number, number];
  /** How often a phrase ends in a drum fill, and in a lead fill. */
  fill: number;
  solo: number;
  kick: number;
  snare: number;
  hat: number;
  crash: number;
  tom: number;
  /** How loud the guitar's and the lead's amplifiers are, and the bass. */
  guitar: number;
  lead: number;
  bass: number;
}
/** Eighths, every one muted. */
const CHUGS: Strike[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((position) => [position, 0.42, "m"]);
const ROCK: Rock = {
  style: "rock",
  tempo: 138,
  key: 0,
  tonic: 4,
  rounds: [
    ["E5", "D5", "A5", "E5"],
    ["E5", "D5", "A5", "A5"],
    ["E5", "C5", "D5", "E5"],
    ["E5", "C5", "D5", "D5"],
    ["E5", "G5", "A5", "E5"],
    ["E5", "G5", "A5", "C5"],
    ["A5", "G5", "D5", "A5"],
    ["E5", "A5", "B5", "A5"],
    ["E5", "E5", "D5", "A5"],
  ],
  riffs: {
    verse: [
      CHUGS,
      [[0, 1.4, "o"], [1.5, 0.42, "m"], [2, 0.42, "m"], [2.5, 0.42, "m"], [3, 0.42, "m"], [3.5, 0.42, "m"]],
      [[0, 0.42, "m"], [0.5, 0.42, "m"], [1, 0.42, "m"], [1.5, 0.9, "o"], [2.5, 0.42, "m"], [3, 0.42, "m"], [3.5, 0.42, "m"]],
      [[0, 0.7, "o"], [1, 0.42, "m"], [1.5, 0.42, "m"], [2, 0.7, "o"], [3, 0.42, "m"], [3.5, 0.42, "m"]],
    ],
    chorus: [
      [[0, 1.9, "o"], [2, 1.4, "o"], [3.5, 0.42, "m"]],
      [[0, 1.4, "o"], [1.5, 1.4, "o"], [3, 0.42, "m"], [3.5, 0.5, "n"]],
      [[0, 0.9, "o"], [1, 0.42, "m"], [1.5, 0.9, "o"], [2.5, 0.42, "m"], [3, 0.9, "o"]],
      [[0, 3.8, "o"]],
    ],
    break: [[[0, 3.8, "o"]], [[0, 1.9, "o"], [2, 1.9, "o"]]],
  },
  kicks: [[0, 2], [0, 2, 2.5], [0, 1.5, 2], [0, 0.5, 2, 2.5], [0, 2, 3.5]],
  licks: [[2, 2.5, 3, 3.5], [1.5, 2, 2.5, 3], [2, 2.25, 2.5, 3], [0, 0.5, 1, 2], [2.5, 2.75, 3, 3.25, 3.5], [1, 1.5, 2, 2.5, 3]],
  range: [4, 19],
  fill: 0.45,
  solo: 0.35,
  kick: 0.11,
  snare: 0.13,
  hat: 0.03,
  crash: 0.045,
  tom: 0.08,
  guitar: 0.031,
  lead: 0.019,
  bass: 0.06,
};
type Piece = Jazz | Gugak | Raga | Arcade | Rock;
const PIECES = { lobby: LOBBY, table: TABLE };
/** Tables that have music of their own instead of the jazz: their country's, or the place's. */
const OWN: Record<string, Piece> = {
  gonu: KOREA,
  "yut-nori": KOREA,
  tuho: KOREA,
  mancala: INDIA,
  carrom: INDIA,
  "peg-solitaire": INDIA,
  "whack-a-mole": ARCADE,
  // The lake is calm: the gayageum and the daegeum, not the arcade's pop.
  fishing: KOREA,
  "claw-machine": ARCADE,
  "coin-pusher": ARCADE,
  "valet-parking": ARCADE,
  "slot-machine": ARCADE,
  basketball: ARCADE,
  bowling: ROCK,
  "slot-car": ROCK,
  soccer: ARCADE,
};
/** How long a bar of a piece lasts, in seconds. */
const barLength = (piece: Piece) => ("tempo" in piece ? (60 / piece.tempo) * 4 : piece.beat * 4);
/** The four bars of a pop or rock piece now played: what they are and what they are made of, drawn at their first bar. */
interface Phrase {
  section: "groove" | "hook" | "lift" | "verse" | "chorus" | "break";
  /** A crash on its first beat; a fill (drums) at its end. */
  crash: boolean;
  fill: boolean;
  /** Pop: where the stab strikes, the bass's and the arpeggio's patterns, and whether the hook's last bar answers it. */
  stabs: number[];
  bass: Step[];
  arp: number[];
  answer: boolean;
  /** Rock: the guitar's riff, where the kick falls, and how many of its last bars carry a lead fill. */
  riff: Strike[];
  kicks: number[];
  solo: number;
}
const QUIET: Phrase = { section: "groove", crash: false, fill: false, stabs: [], bass: [], arp: [], answer: false, riff: [], kicks: [], solo: 0 };
/** The note of pitch class `n` from `low` up to an octave above it. */
const within = (n: number, low: number) => low + pitchClass(n - low);
/** An amplifier's overdrive: a soft curve that rounds the wave off instead of cutting it, kept a strength. */
const curves = new Map<number, Float32Array<ArrayBuffer>>();
function overdrive(strength: number) {
  let curve = curves.get(strength);
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(strength * ((i / (curve.length - 1)) * 2 - 1)) / Math.tanh(strength);
    curves.set(strength, curve);
  }
  return curve;
}
const pick = <X>(list: X[]) => list[Math.floor(Math.random() * list.length)];
const jitter = (seconds: number) => (Math.random() * 2 - 1) * seconds;
const pitchClass = (n: number) => ((n % 12) + 12) % 12;

class Music {
  private context: AudioContext | null = null;
  /** Everything goes out through this (the setting and the hidden page turn it down). */
  private out: GainNode | null = null;
  private room: ConvolverNode | null = null;
  /** What the piece now playing goes through; a new piece gets a new one, and the old one is faded away. */
  private bus: GainNode | null = null;
  /** The piano's own way into the bus, through a slow tremolo as an electric piano has. */
  private keysBus: GainNode | null = null;
  private tremolo: OscillatorNode | null = null;
  /** The piece's way out that keeps out of the room (a kick and a bass sound better dry); it fades with the bus. */
  private dry: GainNode | null = null;
  /** What the piece's instruments share: a filter, an amplifier. Its nodes go with the bus. */
  private lanes: Partial<Record<"lead" | "bass" | "guitar", AudioNode>> = {};
  private chain: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private piece: Piece = LOBBY;
  private timer = 0;
  /** When the next bar begins, by the context's clock, and how many of this piece have been written. */
  private next = 0;
  private bars = 0;
  private round = LOBBY.rounds[0];
  private coming = LOBBY.rounds[1];
  /** The bass's last note and the line's, in semitones from middle C; bars left of the line now played. */
  private bassNote = -24;
  private lineNote = 19;
  private line = 0;
  /** Pop and rock: the four bars now played, the hook's motif and how many phrases have played it. */
  private phrase: Phrase = QUIET;
  private motif = { rhythm: [0], steps: [0] };
  private motifUses = 0;
  /** The game chosen last in the collection: a table plays its music. */
  game: string | null = null;
  private wanted = true;
  private begun = false;

  /** Whether the music is wanted at all (the setting). */
  set enabled(on: boolean) {
    this.wanted = on;
    if (!on) this.rest();
    else if (this.begun) this.play();
  }
  get enabled() {
    return this.wanted;
  }
  /** Which piece plays: the collection's or a table's. The one playing fades out and the other comes in. */
  scene(name: keyof typeof PIECES) {
    const piece = (name === "table" && this.game && OWN[this.game]) || PIECES[name];
    if (piece === this.piece) return;
    this.piece = piece;
    this.bars = 0;
    this.line = 0;
    this.phrase = QUIET;
    this.motifUses = 0;
    if ("rounds" in piece) this.coming = pick(piece.rounds);
    if (piece.style === "jazz") this.lineNote = Math.round((piece.lines.range[0] + piece.lines.range[1]) / 2);
    else if (piece.style === "arcade" || piece.style === "rock") this.lineNote = Math.round((piece.range[0] + piece.range[1]) / 2);
    else this.lineNote = piece.style === "korea" ? 9 : piece.sa + 12;
    const c = this.context;
    if (!c) return;
    this.change();
    // The new piece waits a moment for the old one to leave.
    this.next = c.currentTime + 1.2;
  }
  /** Called on a touch or a key: from then on the page may sound. */
  begin() {
    this.begun = true;
    if (this.wanted) this.play();
  }
  /** Listens for the first touch or key, and for the page being put away and brought back. */
  attach() {
    if (typeof window === "undefined") return;
    const first = () => this.begin();
    window.addEventListener("pointerdown", first, { passive: true });
    window.addEventListener("keydown", first);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.rest();
      else if (this.begun && this.wanted) this.play();
    });
  }
  private play() {
    if (this.timer || document.hidden) return;
    try {
      if (!this.context) this.build();
      const c = this.context!;
      void c.resume().catch(() => {});
      this.next = Math.max(this.next, c.currentTime + 0.3);
      this.timer = window.setInterval(() => this.write(), 400);
      // It comes in over a few seconds instead of starting at full.
      this.out!.gain.cancelScheduledValues(c.currentTime);
      this.out!.gain.setValueAtTime(Math.max(0.0001, this.out!.gain.value), c.currentTime);
      this.out!.gain.linearRampToValueAtTime(0.65, c.currentTime + 4);
      this.write();
    } catch {
      /* No sound on this machine: the games go on without it. */
    }
  }
  private rest() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = 0;
    const c = this.context,
      out = this.out;
    if (!c || !out) return;
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setValueAtTime(out.gain.value, c.currentTime);
    out.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.6);
    // What was written ahead dies away with the gain; then the clock is stopped.
    window.setTimeout(() => {
      if (!this.timer) void c.suspend().catch(() => {});
    }, 800);
  }
  private build() {
    const c = new AudioContext(),
      out = c.createGain(),
      soften = c.createBiquadFilter(),
      room = c.createConvolver(),
      // A small room: noise that dies away over two seconds, different in each ear.
      length = Math.floor(c.sampleRate * 2),
      impulse = c.createBuffer(2, length, c.sampleRate),
      noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 4;
    }
    const hiss = noise.getChannelData(0);
    for (let i = 0; i < hiss.length; i++) hiss[i] = Math.random() * 2 - 1;
    room.buffer = impulse;
    out.gain.value = 0.0001;
    // A little warmth, as from a speaker across the room.
    soften.type = "lowpass";
    soften.frequency.value = 5200;
    room.connect(out);
    out.connect(soften);
    soften.connect(c.destination);
    this.context = c;
    this.out = out;
    this.room = room;
    this.noiseBuffer = noise;
    this.change();
  }
  /** Gives the piece that is to play a way out of its own and fades away the one that was playing. */
  private change() {
    const c = this.context!,
      old = this.bus,
      oldDry = this.dry,
      oldKeys = this.keysBus,
      oldTremolo = this.tremolo,
      oldChain = this.chain,
      bus = c.createGain(),
      dry = c.createGain(),
      wet = c.createGain(),
      keys = c.createGain(),
      tremolo = c.createOscillator(),
      depth = c.createGain(),
      tone = c.createBiquadFilter();
    if (old) {
      for (const gain of [old.gain, oldDry?.gain]) {
        if (!gain) continue;
        gain.cancelScheduledValues(c.currentTime);
        gain.setValueAtTime(gain.value, c.currentTime);
        gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.4);
      }
      window.setTimeout(() => {
        old.disconnect();
        oldDry?.disconnect();
        oldKeys?.disconnect();
        for (const node of oldChain) node.disconnect();
        try {
          oldTremolo?.stop();
        } catch {}
      }, 1600);
    }
    for (const gain of [bus.gain, dry.gain]) {
      gain.setValueAtTime(0.0001, c.currentTime);
      gain.linearRampToValueAtTime(1, c.currentTime + (old ? 3.5 : 0.05));
    }
    // The pop and the rock are played closer to the ear than the jazz, with less of the room.
    wet.gain.value = this.piece.style === "arcade" ? 0.2 : this.piece.style === "rock" ? 0.16 : 0.32;
    bus.connect(this.out!);
    bus.connect(wet);
    wet.connect(this.room!);
    dry.connect(this.out!);
    this.dry = dry;
    this.lay(this.piece, bus, dry);
    // The electric piano: a slow tremolo and the top taken off.
    tremolo.frequency.value = 4.2;
    depth.gain.value = 0.18;
    keys.gain.value = 0.82;
    tremolo.connect(depth);
    depth.connect(keys.gain);
    tremolo.start();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    keys.connect(tone);
    tone.connect(bus);
    this.bus = bus;
    this.keysBus = keys;
    this.tremolo = tremolo;
  }
  /** The lanes a pop or rock piece's instruments share, laid between them and the piece's bus. */
  private lay(piece: Piece, bus: GainNode, dry: GainNode) {
    const c = this.context!,
      chain: AudioNode[] = [],
      filter = (type: BiquadFilterType, frequency: number, q: number, gain = 0) => {
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.value = frequency;
        f.Q.value = q;
        f.gain.value = gain;
        return f;
      },
      // Nodes one into the next; the first is the lane's way in.
      line = (...nodes: AudioNode[]) => {
        for (let i = 0; i + 1 < nodes.length; i++) nodes[i].connect(nodes[i + 1]);
        chain.push(...nodes.slice(0, -1));
        return nodes[0];
      },
      // A guitar amplifier: the low end tightened before the overdrive, then a cabinet that keeps the low and the
      // middle and rolls the top off steeply (no fizz), and the level it plays at.
      amplifier = (strength: number, top: number, level: number) => {
        const drive = c.createWaveShaper(),
          out = c.createGain();
        drive.curve = overdrive(strength);
        drive.oversample = "4x";
        out.gain.value = level;
        return line(
          filter("highpass", 95, 0.7),
          drive,
          filter("lowshelf", 160, 0, 3),
          filter("peaking", 650, 0.9, 2.5),
          filter("lowpass", top, 0.9),
          filter("lowpass", top * 1.4, 0.6),
          out,
          bus,
        );
      };
    if (piece.style === "arcade")
      this.lanes = { lead: line(filter("lowpass", 2600, 0.7), bus), bass: line(filter("lowpass", 760, 1.1), dry) };
    else if (piece.style === "rock")
      this.lanes = {
        guitar: amplifier(5, 2900, piece.guitar),
        lead: amplifier(3, 2700, piece.lead),
        bass: line(filter("lowpass", 680, 0.8), dry),
      };
    else this.lanes = {};
    this.chain = chain;
  }
  /** An oscillator through its own envelope into `to`: struck, dying away, and let go at `end`. */
  private voice(to: AudioNode, type: OscillatorType, frequency: number, at: number, attack: number, peak: number, decay: number, end: number) {
    const c = this.context!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.value = frequency;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setTargetAtTime(0.0001, at + attack, decay);
    g.gain.setTargetAtTime(0.0001, Math.max(end, at + attack), 0.08);
    o.connect(g);
    g.connect(to);
    o.start(at);
    o.stop(end + 0.5);
    o.onended = () => g.disconnect();
  }
  /** One note of the electric piano: a sine with its octave fading quickly and a faint bell of the tine. */
  private key(semitones: number, at: number, length: number, volume: number) {
    const f = hertz(semitones),
      keys = this.keysBus!;
    this.voice(keys, "sine", f, at, 0.006, volume, 1.1, at + length);
    this.voice(keys, "sine", f * 2, at, 0.004, volume * 0.35, 0.25, at + length);
    this.voice(keys, "sine", f * 7.1, at, 0.002, volume * 0.05, 0.05, at + 0.3);
  }
  /** One note of the vibraphone: a pure tone with its strong fourth partial, ringing on. */
  private vibe(semitones: number, at: number, length: number, volume: number) {
    const f = hertz(semitones),
      bus = this.bus!;
    this.voice(bus, "sine", f, at, 0.004, volume, 0.9, at + Math.max(length, 0.6));
    this.voice(bus, "sine", f * 4, at, 0.002, volume * 0.18, 0.12, at + 0.4);
  }
  /** One plucked note of the upright bass: a round tone with a little thump, dying as a string does. */
  private pluck(semitones: number, at: number, length: number, volume: number) {
    const c = this.context!,
      f = hertz(semitones),
      body = c.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.setValueAtTime(900, at);
    body.frequency.setTargetAtTime(320, at, 0.12);
    body.connect(this.bus!);
    this.voice(body, "triangle", f, at, 0.01, volume, 0.55, at + length);
    this.voice(body, "sine", f, at, 0.008, volume * 0.8, 0.7, at + length);
  }
  /** A burst of noise through a filter: a cymbal, a brush, a stroke. */
  private hiss(at: number, attack: number, length: number, volume: number, type: BiquadFilterType, frequency: number, q = 0.8, to: AudioNode = this.bus!) {
    const c = this.context!,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      g = c.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + length);
    source.connect(filter);
    filter.connect(g);
    g.connect(to);
    source.start(at, Math.random() * 0.9);
    source.stop(at + attack + length + 0.05);
    source.onended = () => g.disconnect();
  }
  /** Writes the bars that begin within the next second and a half. */
  private write() {
    const c = this.context;
    if (!c) return;
    // A clock that fell behind (the page slept) starts again from now rather than hurrying to catch up.
    if (this.next < c.currentTime) this.next = c.currentTime + 0.2;
    while (this.next < c.currentTime + 1.5) {
      this.bar(this.next);
      this.next += barLength(this.piece);
      this.bars++;
    }
  }
  private bar(at: number) {
    const piece = this.piece;
    if (piece.style === "korea") return this.gugak(at, piece);
    if (piece.style === "india") return this.raga(at, piece);
    if (piece.style === "arcade") return this.arcade(at, piece);
    if (piece.style === "rock") return this.rock(at, piece);
    this.jazz(at, piece);
  }
  /** A note drawn from `scale` (absolute semitones) by a step or two from the last one. */
  private wander(scale: number[], steps = [-2, -1, -1, 1, 1, 2, 0]) {
    let index = scale.reduce((best, n, i) => (Math.abs(n - this.lineNote) < Math.abs(scale[best] - this.lineNote) ? i : best), 0);
    index = Math.max(0, Math.min(scale.length - 1, index + pick(steps)));
    return index;
  }
  /** A drum's low skin: a thump falling in pitch. */
  private thump(at: number, from: number, to: number, length: number, volume: number, into: AudioNode = this.bus!) {
    const c = this.context!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + length * 0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    o.connect(g);
    g.connect(into);
    o.start(at);
    o.stop(at + length + 0.05);
    o.onended = () => g.disconnect();
  }
  /** A plucked string with its own shaking and bending: a gayageum or a sitar. */
  private string(semitones: number, at: number, length: number, volume: number, how: { bright: boolean; shake: number; bend: number; glide: number }) {
    const c = this.context!,
      f = hertz(semitones),
      g = c.createGain(),
      tone = c.createBiquadFilter(),
      lfo = c.createOscillator(),
      depth = c.createGain(),
      ring = Math.max(0.5, length) + (how.bright ? 0.9 : 0.6),
      oscillators: [OscillatorType, number, number][] = how.bright
        ? [
            ["sawtooth", 1, 0.55],
            ["triangle", 2, 0.25],
          ]
        : [
            ["triangle", 1, 1],
            ["sine", 2, 0.3],
          ];
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(how.bright ? 3400 : 2400, at);
    tone.frequency.setTargetAtTime(how.bright ? 1300 : 900, at, 0.25);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.004);
    g.gain.setTargetAtTime(0.0001, at + 0.004, how.bright ? 0.45 : 0.55);
    g.gain.setTargetAtTime(0.0001, at + ring - 0.25, 0.08);
    g.connect(tone);
    tone.connect(this.bus!);
    // The shaking of the string (nonghyeon, gamak) comes in after the pluck and grows.
    lfo.frequency.value = 5 + Math.random();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(0, at + 0.2);
    depth.gain.linearRampToValueAtTime(f * how.shake, at + Math.max(0.5, length * 0.8));
    lfo.connect(depth);
    lfo.start(at);
    lfo.stop(at + ring);
    for (const [type, partial, share] of oscillators) {
      const o = c.createOscillator(),
        part = c.createGain();
      o.type = type;
      const base = f * partial;
      // A glide up into the note from the step below (meend), or a fall at its end to the step below.
      if (how.glide) {
        o.frequency.setValueAtTime(base * 2 ** (-how.glide / 12), at);
        o.frequency.exponentialRampToValueAtTime(base, at + 0.14);
      } else o.frequency.setValueAtTime(base, at);
      if (how.bend) {
        o.frequency.setValueAtTime(base, at + length * 0.55);
        o.frequency.exponentialRampToValueAtTime(base * 2 ** (-how.bend / 12), at + length * 0.9);
      }
      depth.connect(o.frequency);
      part.gain.value = share;
      o.connect(part);
      part.connect(g);
      o.start(at);
      o.stop(at + ring);
    }
  }
  /** A bar of gutgeori: the janggu, the gayageum, and now and then the daegeum. */
  private gugak(at: number, p: Gugak) {
    const eighth = p.beat / 3,
      when = (position: number) => at + position * eighth + jitter(0.01);
    // The janggu: 덩 (both heads), 쿵 (the low head), 기덕 (the high head, with a grace stroke), 더러러 (a roll).
    const low = (t: number, loud: number) => this.thump(t, 120, 72, 0.5, p.drum * loud),
      high = (t: number, loud: number) => {
        this.hiss(t, 0.002, 0.07, p.drum * 0.28 * loud, "bandpass", 2300, 1.4);
        this.thump(t, 520, 380, 0.08, p.drum * 0.25 * loud);
      };
    const strokes: [number, string][] = [
      [0, "dung"],
      [2, "deok"],
      [3, "kung"],
      [4, "roll"],
      [6, "kung"],
      [8, "deok"],
      [9, "kung"],
      [10, "roll"],
    ];
    for (const [position, stroke] of strokes) {
      const t = when(position);
      if (stroke === "dung") {
        low(t, 1);
        high(t, 1);
      } else if (stroke === "kung") low(t, 0.75);
      else if (stroke === "deok") {
        high(t - eighth * 0.4, 0.45);
        high(t, 0.9);
      } else [0, 1, 2].forEach((i) => high(t + (i * eighth) / 3, 0.6 - i * 0.12));
    }
    // The gayageum: by steps through the mode, resting on its own notes at the head of the bar.
    const scale: number[] = [];
    for (let n = p.range[0]; n <= p.range[1]; n++) if (p.mode.includes(pitchClass(n))) scale.push(n);
    const figure = pick(p.figures);
    figure.forEach((position, i) => {
      let index = this.wander(scale);
      if (position === 0) {
        const home = scale.filter((n) => pitchClass(n) === pitchClass(pick(p.rest)));
        if (home.length) index = scale.indexOf(home.reduce((a, b) => (Math.abs(b - this.lineNote) < Math.abs(a - this.lineNote) ? b : a)));
      }
      const note = scale[index],
        length = ((figure[i + 1] ?? 12) - position) * eighth,
        below = index > 0 ? note - scale[index - 1] : 0,
        // A long note is shaken; now and then it is bent down to the note below (꺾는 음).
        bend = length > eighth * 2.5 && below === 2 && Math.random() < 0.3 ? 2 : 0;
      this.lineNote = note;
      this.string(note, when(position), length, p.pluck * (position === 0 ? 1 : 0.8) * (0.85 + Math.random() * 0.3), {
        bright: false,
        shake: length > eighth * 2 ? 0.014 : 0.004,
        bend,
        glide: 0,
      });
    });
    // The daegeum: one long breath over the bar, high, shaken more as it goes.
    if (Math.random() < p.flute) {
      const high: number[] = [];
      for (let n = p.high[0]; n <= p.high[1]; n++) if (p.mode.includes(pitchClass(n))) high.push(n);
      const start = pick([0, 3, 6]),
        note = high[Math.floor(Math.random() * high.length)];
      this.flute(note, when(start), (12 - start) * eighth * 0.95, p.breath);
    }
  }
  /** A bamboo flute: a pure tone with breath round it, coming in slowly and shaking more as it is held. */
  private flute(semitones: number, at: number, length: number, volume: number) {
    const c = this.context!,
      f = hertz(semitones),
      o = c.createOscillator(),
      g = c.createGain(),
      lfo = c.createOscillator(),
      depth = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    lfo.frequency.value = 4.6;
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(f * 0.018, at + length);
    lfo.connect(depth);
    depth.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.3);
    g.gain.setValueAtTime(volume, at + length * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, at + length + 0.4);
    o.connect(g);
    g.connect(this.bus!);
    o.start(at);
    o.stop(at + length + 0.5);
    lfo.start(at);
    lfo.stop(at + length + 0.5);
    // The breath: noise round the note.
    this.hiss(at, 0.3, length, volume * 0.25, "bandpass", f * 2, 6);
  }
  /** A bar of teental: the tanpura's four strings, the tabla's four strokes, and the sitar's phrase. */
  private raga(at: number, p: Raga) {
    const beat = p.beat,
      part = this.bars % 4,
      sa = p.sa;
    // The tanpura: Pa below, Sa, Sa, and Sa an octave down, one string a beat, each left to ring.
    [sa - 17, sa - 12, sa - 12, sa - 24].forEach((note, i) => this.drone(note, at + i * beat, beat * 4.5, p.drone));
    // The tabla: Dha Dhin Dhin Dha, Dha Dhin Dhin Dha, Dha Tin Tin Ta (open: no bass), Ta Dhin Dhin Dha.
    const theka = [
      ["dha", "dhin", "dhin", "dha"],
      ["dha", "dhin", "dhin", "dha"],
      ["dha", "tin", "tin", "ta"],
      ["ta", "dhin", "dhin", "dha"],
    ][part];
    theka.forEach((bol, i) => {
      const t = at + i * beat + jitter(0.008),
        accent = part === 0 && i === 0 ? 1.25 : 1;
      // The dayan rings at Sa; the bayan swells upward under it.
      if (bol === "dha" || bol === "ta") this.dayan(t, sa + 12, p.tabla * accent, 0.22);
      else this.dayan(t, sa + 12, p.tabla * 0.7, 0.45);
      if (bol === "dha" || bol === "dhin") {
        const c = this.context!,
          o = c.createOscillator(),
          g = c.createGain();
        o.frequency.setValueAtTime(72, t);
        o.frequency.exponentialRampToValueAtTime(102, t + 0.25);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(p.tabla * 1.3 * accent, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g);
        g.connect(this.bus!);
        o.start(t);
        o.stop(t + 0.75);
      }
    });
    // A light filler between the beats now and then (tirakita).
    if (Math.random() < 0.3) [0, 1, 2, 3].forEach((i) => this.dayan(at + (2.5 + i * 0.125) * beat, sa + 12, p.tabla * 0.35, 0.08));
    // The sitar: a phrase now and then, by steps through the raga, home to Sa or Pa on the cycle's first beat.
    if (this.line === 0 && Math.random() < p.chance) this.line = p.bars[0] + Math.floor(Math.random() * (p.bars[1] - p.bars[0] + 1));
    if (this.line === 0) return;
    this.line--;
    const scale: number[] = [];
    for (let n = p.range[0]; n <= p.range[1]; n++) if (p.notes.includes(pitchClass(n - sa))) scale.push(n);
    const figure = pick(p.figures);
    figure.forEach((position, i) => {
      let index = this.wander(scale);
      if (part === 0 && position === 0) {
        const home = scale.filter((n) => [0, 7].includes(pitchClass(n - sa)));
        index = scale.indexOf(home.reduce((a, b) => (Math.abs(b - this.lineNote) < Math.abs(a - this.lineNote) ? b : a)));
      }
      const note = scale[index],
        length = ((figure[i + 1] ?? 4) - position) * beat,
        glide = index > 0 && Math.random() < 0.3 ? note - scale[index - 1] : 0;
      this.lineNote = note;
      this.string(note, at + position * beat + jitter(0.01), length, p.sitar * (0.8 + Math.random() * 0.3), {
        bright: true,
        shake: length > beat * 1.5 ? 0.008 : 0,
        bend: 0,
        glide,
      });
    });
  }
  /** One string of the tanpura: a buzzing tone (jawari) left to ring, its colour moving as it dies. */
  private drone(semitones: number, at: number, length: number, volume: number) {
    const c = this.context!,
      o = c.createOscillator(),
      buzz = c.createBiquadFilter(),
      g = c.createGain();
    o.type = "sawtooth";
    o.frequency.value = hertz(semitones);
    o.detune.value = jitter(4);
    buzz.type = "bandpass";
    buzz.Q.value = 2.5;
    buzz.frequency.setValueAtTime(1800, at);
    buzz.frequency.exponentialRampToValueAtTime(500, at + length);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    o.connect(buzz);
    buzz.connect(g);
    g.connect(this.bus!);
    o.start(at);
    o.stop(at + length + 0.05);
  }
  /** The tabla's right drum: a tuned ring with its overtones and a click, `decay` long. */
  private dayan(at: number, semitones: number, volume: number, decay: number) {
    const f = hertz(semitones);
    this.voice(this.bus!, "sine", f, at, 0.002, volume * 0.6, decay * 0.5, at + decay * 2);
    this.voice(this.bus!, "sine", f * 2.01, at, 0.002, volume * 0.3, decay * 0.3, at + decay * 1.5);
    this.voice(this.bus!, "sine", f * 3.02, at, 0.001, volume * 0.15, decay * 0.15, at + decay);
    this.hiss(at, 0.001, 0.03, volume * 0.2, "bandpass", 3500, 1.5);
  }
  private jazz(at: number, piece: Jazz) {
    const
      beat = 60 / piece.tempo,
      place = this.bars % 4,
      // Where a position in the bar falls in time, its off-beats swung.
      when = (position: number) => {
        const whole = Math.floor(position);
        return at + (whole + (position - whole === 0.5 ? piece.swing : position - whole)) * beat;
      };
    if (place === 0) {
      this.round = this.coming;
      this.coming = pick(piece.rounds);
    }
    const now = chord(this.round[place]),
      then = chord(place === 3 ? this.coming[0] : this.round[place + 1]),
      root = now.root + piece.key,
      nextRoot = then.root + piece.key;
    // The piano: the voicing laid round the middle of the keyboard, struck where the comping falls.
    let base = root;
    while (base + now.voicing[0] < -9) base += 12;
    while (base + now.voicing[0] > 2) base -= 12;
    for (const position of pick(piece.comps)) {
      const t = Math.max(at, when(position) + jitter(0.012)),
        length = Math.min(piece.hold, 4 - position) * beat,
        loud = piece.keys * (0.8 + Math.random() * 0.35);
      now.voicing.forEach((v, i) => this.key(base + v, t + i * 0.006, length, loud));
    }
    // The bass, between E1 and C3: the root on the downbeat, then notes of the chord, and a step into the next root.
    const near = (pc: number) => {
      let n = pitchClass(pc) - 32;
      if (n < -32) n += 12;
      if (n + 12 <= -14 && Math.abs(n + 12 - this.bassNote) < Math.abs(n - this.bassNote)) n += 12;
      return n;
    };
    const first = near(root),
      target = near(nextRoot),
      approach = target + pick([-1, 1, -5]),
      fifth = first + 7 > -12 ? first - 5 : first + 7;
    const notes =
      piece.bass === "walk"
        ? [first, first + pick(now.tones.slice(1, 3)), first + pick([now.tones[2], now.tones[3], 12]), approach]
        : [first, Math.random() < 0.5 ? fifth : approach];
    const step = 4 / notes.length;
    notes.forEach((n, i) => {
      let note = n;
      while (note > -12) note -= 12;
      while (note < -32) note += 12;
      this.pluck(note, Math.max(at, at + i * step * beat + jitter(0.008)), step * beat * 0.92, piece.low * (i === 0 ? 1 : 0.85));
      this.bassNote = note;
    });
    // The drums: brushes stirring through every beat, a tap on two and four, the ride's ding, ding-a ding.
    for (let b = 0; b < 4; b++) {
      this.hiss(at + b * beat, beat * 0.45, beat * 0.6, piece.brush, "bandpass", 2600, 0.6);
      if (b % 2 === 1) this.hiss(when(b) + jitter(0.006), 0.004, 0.09, piece.brush * 2.2, "bandpass", 1800, 0.9);
    }
    if (piece.ride)
      for (const position of [0, 1, 1.5, 2, 3, 3.5]) {
        const strong = position === 1 || position === 3,
          t = Math.max(at, when(position) + jitter(0.005));
        this.hiss(t, 0.002, strong ? 0.5 : 0.3, strong ? 0.011 : 0.007, "highpass", 7200);
        this.hiss(t, 0.002, 0.25, strong ? 0.005 : 0.003, "bandpass", 5200, 6);
      }
    // A line now and then, drawn from the chord's scale by steps, resting on a chord note on the strong beats.
    const lines = piece.lines;
    if (this.line === 0 && Math.random() < lines.chance)
      this.line = lines.bars[0] + Math.floor(Math.random() * (lines.bars[1] - lines.bars[0] + 1));
    if (this.line === 0) return;
    this.line--;
    const [lowest, highest] = lines.range,
      scale: number[] = [],
      tones = new Set(now.tones.map((t) => pitchClass(t + root))),
      colours = new Set(now.scale.map((s) => pitchClass(s + root)));
    for (let n = lowest; n <= highest; n++) if (colours.has(pitchClass(n))) scale.push(n);
    let index = scale.reduce((best, n, i) => (Math.abs(n - this.lineNote) < Math.abs(scale[best] - this.lineNote) ? i : best), 0);
    const rhythm = pick(lines.rhythms);
    rhythm.forEach((position, i) => {
      index = Math.max(0, Math.min(scale.length - 1, index + pick([-2, -1, -1, 1, 1, 2, 0])));
      if (position % 2 === 0) {
        // A strong beat rests on a note of the chord.
        const up = scale.findIndex((n, j) => j >= index && tones.has(pitchClass(n)));
        if (up >= 0) index = up;
      }
      const note = scale[index],
        length = ((rhythm[i + 1] ?? 4) - position) * beat,
        t = Math.max(at, when(position) + jitter(0.015)),
        loud = (lines.voice === "vibes" ? piece.tune : piece.tune * 1.6) * (0.8 + Math.random() * 0.3);
      this.lineNote = note;
      if (lines.voice === "vibes") this.vibe(note, t, length, loud);
      else this.key(note, t, length * 0.95, loud);
    });
  }
  /** The next four bars' round of chords is the one drawn before; another is drawn to follow it. */
  private nextRound(rounds: string[][]) {
    this.round = this.coming;
    this.coming = pick(rounds);
  }
  /** A bar of the arcade's pop. */
  private arcade(at: number, p: Arcade) {
    const beat = 60 / p.tempo,
      place = this.bars % 4,
      when = (position: number) => at + position * beat;
    if (place === 0) {
      this.nextRound(p.rounds);
      this.popPhrase(p);
    }
    const now = chord(this.round[place]),
      then = chord(place === 3 ? this.coming[0] : this.round[place + 1]),
      root = now.root + p.key,
      nextRoot = then.root + p.key,
      phrase = this.phrase,
      lift = phrase.section === "lift",
      hook = phrase.section === "hook";
    // The drums: the kick on every beat (none in a lift), claps on two and four, hats on the off-beats, and ticking
    // on the beats as well under a hook.
    if (place === 0 && phrase.crash) this.crash(at, p.hat * 1.3);
    for (let b = 0; b < 4; b++) {
      if (!lift) this.kick(when(b), p.kick * (b === 0 ? 1 : 0.92), 0.12);
      if (b % 2 === 1) this.clap(when(b) + jitter(0.003), p.clap * (lift ? 0.6 : 1));
      if (lift || place < 3 || b < 3) this.hiss(when(b + 0.5) + jitter(0.004), 0.001, 0.045, p.hat * (0.85 + Math.random() * 0.3), "highpass", 6600, 0.7);
      if (hook) this.hiss(when(b) + jitter(0.003), 0.001, 0.03, p.hat * 0.45, "highpass", 7200, 0.7);
    }
    if (place === 3) {
      if (lift)
        // A roll of claps growing through the last two beats, into the next phrase.
        for (let i = 0; i < 8; i++) this.clap(when(2 + i * 0.25), p.clap * (0.2 + i * 0.09));
      else {
        // An open hat lets the phrase go; now and then a pair of claps leads into the next one.
        this.hiss(when(3.5), 0.002, 0.24, p.hat * 1.1, "highpass", 6000, 0.6);
        if (phrase.fill) [3.5, 3.75].forEach((position, i) => this.clap(when(position), p.clap * (0.55 + i * 0.2)));
      }
    }
    // The bass: eighths of the phrase's pattern, softer on the beats where the kick falls (as if it ducked under
    // it); in a lift, the root held.
    const bass = this.lanes.bass!,
      low = within(root, -27);
    if (lift) [0, 2].forEach((position) => this.voice(bass, "sawtooth", hertz(low), when(position), 0.01, p.bass * 0.7, 0.9, when(position + 1.9)));
    else
      phrase.bass.forEach((step, i) => {
        if (step === null) return;
        const note = step === "a" ? within(nextRoot, -27) + pick([-1, 2, -2]) : low + step,
          t = when(i * 0.5) + jitter(0.003);
        this.voice(bass, "sawtooth", hertz(note), t, 0.004, p.bass * (i % 2 ? 1 : 0.78), 0.22, t + 0.42 * beat);
      });
    // The stab: the chord laid close round the middle of the keyboard, so that one chord goes to the next by small
    // steps; struck short on the off-beats, or held in a lift.
    const voicing = now.voicing.map((v) => within(root + v, -2)).sort((a, b) => a - b);
    for (const position of lift ? [0, 2] : phrase.stabs)
      this.stab(voicing, when(position) + jitter(0.004), (lift ? 1.9 : 0.32) * beat, p.stab * (lift ? 0.75 : 0.9 + Math.random() * 0.2), lift ? 1500 : 3000, lift ? 0.06 : 0.004);
    // Outside the hook, a toy-like arpeggio through the chord's notes, two octaves of them.
    if (!hook && phrase.arp.length) {
      const lowest = within(root, 3),
        notes = [0, 12].flatMap((octave) => now.tones.map((t) => lowest + t + octave));
      phrase.arp.forEach((k, i) => {
        const t = when(i * 0.5) + jitter(0.003);
        this.voice(this.bus!, "triangle", hertz(notes[Math.min(k, notes.length - 1)]), t, 0.003, p.arp * (i % 2 ? 0.75 : 1), 0.14, t + 0.2);
      });
    }
    if (hook) this.hook(p, now, root, place, when, beat);
  }
  /** Draws what the next four bars of the pop are: a groove, a hook (its motif kept for a second phrase, then a new one drawn), or now and then a lift. */
  private popPhrase(p: Arcade) {
    const last = this.phrase.section,
      first = this.bars === 0,
      r = Math.random(),
      section: Phrase["section"] = first
        ? "groove"
        : last === "lift"
          ? r < 0.8
            ? "hook"
            : "groove"
          : r < p.lift
            ? "lift"
            : r < p.lift + (last === "hook" ? 0.4 : 0.55)
              ? "hook"
              : "groove";
    if (section === "hook" && (last !== "hook" || this.motifUses >= 2)) {
      // A motif: a rhythm, and the steps through the chord's scale from one of its notes to the next (often none, so
      // that a note is struck again, as a hook does).
      const rhythm = pick(p.hooks);
      this.motif = { rhythm, steps: rhythm.map((_, i) => (i === 0 ? 0 : pick([-2, -1, -1, 0, 0, 1, 1, 2]))) };
      this.motifUses = 0;
    }
    if (section === "hook") this.motifUses++;
    this.phrase = {
      ...QUIET,
      section,
      crash: first || last === "lift" || (section === "hook" && last !== "hook"),
      fill: Math.random() < 0.4,
      stabs: pick(p.stabs),
      bass: pick(p.basses),
      arp: section === "groove" && Math.random() < 0.3 ? [] : pick(p.arps),
      answer: Math.random() < 0.6,
    };
  }
  /** A bar of the hook: its motif played on the chord now, from the chord's note nearest where the last bar began. */
  private hook(p: Arcade, now: Chord, root: number, place: number, when: (position: number) => number, beat: number) {
    const scale: number[] = [],
      colours = new Set(now.scale.map((s) => pitchClass(s + root))),
      tones = new Set(now.tones.map((t) => pitchClass(t + root)));
    for (let n = p.range[0]; n <= p.range[1]; n++) if (colours.has(pitchClass(n))) scale.push(n);
    const nearest = (fits: (n: number) => boolean) =>
      scale.reduce((best, n, i) => (fits(n) && (best < 0 || Math.abs(n - this.lineNote) < Math.abs(scale[best] - this.lineNote)) ? i : best), -1);
    let index = nearest((n) => tones.has(pitchClass(n)));
    this.lineNote = scale[index];
    const { rhythm, steps } = this.motif,
      // The phrase's last bar may answer the motif: its first half, then a long note on the chord's root.
      answer = place === 3 && this.phrase.answer,
      positions = answer ? [...rhythm.filter((x) => x < 2), 2] : rhythm;
    positions.forEach((position, i) => {
      const last = i === positions.length - 1;
      if (i > 0) index = Math.max(0, Math.min(scale.length - 1, index + (steps[i] ?? 0)));
      if (answer && last) index = nearest((n) => pitchClass(n - root) === 0);
      const length = (last ? Math.min(answer ? 1.75 : 1, 4 - position) : Math.min((positions[i + 1] - position) * 0.9, 1.2)) * beat,
        loud = p.lead * (position % 1 === 0 ? 1 : 0.85) * (0.9 + Math.random() * 0.15);
      this.lead(scale[index], when(position) + jitter(0.004), length, loud);
    });
  }
  /** One note of the hook: a square softened by its lane, with a little of the octave above. */
  private lead(semitones: number, at: number, length: number, volume: number) {
    const f = hertz(semitones),
      lane = this.lanes.lead!;
    this.voice(lane, "square", f, at, 0.005, volume, 0.5, at + length);
    this.voice(lane, "triangle", f * 2, at, 0.003, volume * 0.3, 0.18, at + length);
  }
  /** A plucked synth chord: detuned saws through one filter that closes as it dies (or opens slowly, held). */
  private stab(notes: number[], at: number, length: number, volume: number, bright: number, attack: number) {
    const c = this.context!,
      tone = c.createBiquadFilter(),
      g = c.createGain();
    tone.type = "lowpass";
    tone.Q.value = 1.6;
    tone.frequency.setValueAtTime(bright, at);
    tone.frequency.setTargetAtTime(bright * 0.35, at, 0.06 + length * 0.25);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + attack);
    g.gain.setTargetAtTime(0.0001, at + attack, Math.max(0.06, length * 0.5));
    g.gain.setTargetAtTime(0.0001, at + length, 0.04);
    tone.connect(g);
    g.connect(this.bus!);
    let o: OscillatorNode | null = null;
    for (const n of notes) {
      o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hertz(n);
      o.detune.value = jitter(7);
      o.connect(tone);
      o.start(at);
      o.stop(at + length + 0.3);
    }
    if (o)
      o.onended = () => {
        tone.disconnect();
        g.disconnect();
      };
  }
  /** A kick drum: a thump that falls fast to its low note, and the click of the beater when `click` is given; kept out of the room. */
  private kick(at: number, volume: number, click: number) {
    const c = this.context!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(165, at);
    o.frequency.exponentialRampToValueAtTime(60, at + 0.045);
    o.frequency.exponentialRampToValueAtTime(44, at + 0.32);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.003);
    g.gain.setTargetAtTime(0.0001, at + 0.03, 0.085);
    o.connect(g);
    g.connect(this.dry!);
    o.start(at);
    o.stop(at + 0.55);
    o.onended = () => g.disconnect();
    if (click) this.hiss(at, 0.0005, 0.012, volume * click, "bandpass", 3200, 0.8, this.dry!);
  }
  /** A hand clap: three quick slaps and a short ring after them, one burst of noise. */
  private clap(at: number, volume: number) {
    const c = this.context!,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      g = c.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 1250;
    filter.Q.value = 1.1;
    for (const d of [0, 0.01, 0.021]) {
      g.gain.setValueAtTime(volume, at + d);
      g.gain.exponentialRampToValueAtTime(volume * 0.2, at + d + 0.008);
    }
    g.gain.setValueAtTime(volume * 0.85, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    source.connect(filter);
    filter.connect(g);
    g.connect(this.bus!);
    source.start(at, Math.random() * 0.9);
    source.stop(at + 0.22);
    source.onended = () => g.disconnect();
  }
  /** A snare drum: its skin's tone and the rattle of its wires. */
  private snare(at: number, volume: number) {
    this.thump(at, 240, 180, 0.12, volume * 0.9);
    this.hiss(at, 0.001, 0.18, volume, "bandpass", 1900, 0.6);
    this.hiss(at, 0.001, 0.07, volume * 0.45, "highpass", 5200, 0.7);
  }
  /** A crash cymbal, washing away over a second and a half. */
  private crash(at: number, volume: number) {
    this.hiss(at, 0.002, 1.6, volume, "highpass", 4600, 0.6);
    this.hiss(at, 0.002, 0.7, volume * 0.6, "bandpass", 3100, 0.5);
  }
  /** A bar of the bowling alley's rock. */
  private rock(at: number, p: Rock) {
    const beat = 60 / p.tempo,
      place = this.bars % 4,
      when = (position: number) => at + position * beat + jitter(0.004);
    if (place === 0) {
      this.nextRound(p.rounds);
      this.rockPhrase(p);
    }
    const now = chord(this.round[place]),
      then = chord(place === 3 ? this.coming[0] : this.round[place + 1]),
      root = now.root + p.key,
      nextRoot = then.root + p.key,
      phrase = this.phrase,
      half = phrase.section === "break",
      open = phrase.section === "chorus",
      // The last bar's second half is the drummer's when the phrase ends in a fill.
      filling = phrase.fill && place === 3,
      kept = (position: number) => !(filling && position >= 2),
      crash = place === 0 && phrase.crash;
    // The kit: a crash at the head of a phrase, hats in eighths (looser in a chorus, quarters in a break), the kick
    // where the phrase has it, the snare on two and four (on three in a break, half time).
    if (crash) this.crash(at, p.crash);
    for (let i = 0; i < 8; i++) {
      const position = i * 0.5;
      if (!kept(position) || (half && i % 2) || (crash && i === 0)) continue;
      this.hiss(when(position), 0.001, open ? 0.12 : 0.04, p.hat * (i % 2 ? 0.65 : 1) * (open ? 1.15 : 1), "highpass", open ? 5600 : 6600, 0.7);
    }
    for (const position of half ? [0, 2.5] : phrase.kicks) if (kept(position)) this.kick(when(position), p.kick, 0.18);
    for (const position of half ? [2] : [1, 3]) if (kept(position)) this.snare(when(position), p.snare);
    if (filling) this.drumFill(p, when);
    // The guitar: the phrase's riff on this bar's power chord (the next bar's, where it is pushed ahead).
    const low = within(root, -22),
      ahead = within(nextRoot, -22);
    let push = 4;
    for (const [position, length, how] of phrase.riff) {
      if (how === "n") push = Math.min(push, position);
      this.power(how === "n" ? ahead : low, when(position), length * beat, how !== "m");
    }
    // The bass: the guitar's root an octave down, in eighths (held in a break).
    const bass = this.lanes.bass!;
    if (half) [0, 2].forEach((position) => this.voice(bass, "sawtooth", hertz(low - 12), when(position), 0.005, p.bass, 0.8, when(position + 1.85)));
    else
      for (let i = 0; i < 8; i++) {
        const position = i * 0.5,
          t = when(position);
        this.voice(bass, "sawtooth", hertz((position >= push ? ahead : low) - 12), t, 0.004, p.bass * (i % 2 ? 0.8 : 1), 0.25, t + 0.42 * beat);
      }
    // Now and then a lead fill over the phrase's last bar or two.
    if (place >= 4 - phrase.solo) this.lick(p, root, when, beat);
  }
  /** Draws what the next four bars of the rock are: a verse, a chorus, or now and then a break. */
  private rockPhrase(p: Rock) {
    const last = this.phrase,
      first = this.bars === 0,
      r = Math.random(),
      section: "verse" | "chorus" | "break" = first
        ? "verse"
        : last.section === "break"
          ? r < 0.7
            ? "chorus"
            : "verse"
          : r < 0.1
            ? "break"
            : last.section === "chorus"
              ? r < 0.55
                ? "verse"
                : "chorus"
              : r < 0.6
                ? "chorus"
                : "verse";
    this.phrase = {
      ...QUIET,
      section,
      crash: first || last.fill || section !== last.section,
      fill: Math.random() < p.fill,
      riff: pick(p.riffs[section]),
      kicks: pick(p.kicks),
      solo: section !== "break" && Math.random() < p.solo ? (section === "chorus" && Math.random() < 0.5 ? 2 : 1) : 0,
    };
  }
  /** A power chord on the overdriven guitar: root and fifth, and the octave when it rings open; a palm on the strings keeps a muted one short and dark. */
  private power(root: number, at: number, length: number, open: boolean) {
    const c = this.context!,
      tone = c.createBiquadFilter(),
      g = c.createGain(),
      peak = open ? 0.3 : 0.24;
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(open ? 3400 : 1200, at);
    tone.frequency.setTargetAtTime(open ? 1700 : 480, at, open ? 0.5 : 0.04);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.004);
    g.gain.setTargetAtTime(0.0001, at + 0.004, open ? 1.6 : 0.1);
    g.gain.setTargetAtTime(0.0001, at + length, 0.03);
    tone.connect(g);
    g.connect(this.lanes.guitar!);
    let o: OscillatorNode | null = null;
    for (const ratio of open ? [1, 1.5, 2] : [1, 1.5]) {
      o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hertz(root) * ratio;
      o.detune.value = jitter(6);
      o.connect(tone);
      o.start(at);
      o.stop(at + length + 0.25);
    }
    if (o)
      o.onended = () => {
        tone.disconnect();
        g.disconnect();
      };
  }
  /** The drummer's fill over the last two beats of a phrase: the snare, and down the toms. */
  private drumFill(p: Rock, when: (position: number) => number) {
    const toms: Record<string, number> = { h: 196, m: 147, l: 110 };
    for (const [position, drum] of pick(FILLS)) {
      const t = when(position),
        loud = 0.8 + (position - 2) * 0.12;
      if (drum === "s") this.snare(t, p.snare * loud);
      else this.thump(t, toms[drum] * 1.3, toms[drum], 0.34, p.tom * loud);
    }
    this.kick(when(2), p.kick, 0.18);
  }
  /** A bar of lead fill, by steps through the key's minor pentatonic, bent up into some notes, the last one held and shaken, on the chord's root or fifth where it can. */
  private lick(p: Rock, root: number, when: (position: number) => number, beat: number) {
    const tonic = p.tonic + p.key,
      scale: number[] = [];
    for (let n = p.range[0]; n <= p.range[1]; n++) if ([0, 3, 5, 7, 10].includes(pitchClass(n - tonic))) scale.push(n);
    const rhythm = pick(p.licks);
    rhythm.forEach((position, i) => {
      const last = i === rhythm.length - 1;
      let index = this.wander(scale, [-2, -1, -1, 1, 1, 0]);
      if (last) {
        const home = scale.filter((n) => [0, 7].includes(pitchClass(n - root)));
        if (home.length) index = scale.indexOf(home.reduce((a, b) => (Math.abs(b - this.lineNote) < Math.abs(a - this.lineNote) ? b : a)));
      }
      const note = scale[index],
        below = index > 0 ? note - scale[index - 1] : 0,
        bend = below > 0 && below <= 2 && Math.random() < (last ? 0.45 : 0.15) ? below : 0,
        length = (last ? Math.max(0.5, 4 - position) * 0.95 : (rhythm[i + 1] - position) * 0.9) * beat;
      this.lineNote = note;
      this.wail(note, when(position), length, bend, last);
    });
  }
  /** One note of the lead guitar: a saw into its own amplifier, bent up into the note, or shaken as it is held. */
  private wail(semitones: number, at: number, length: number, bend: number, shake: boolean) {
    const c = this.context!,
      f = hertz(semitones),
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "sawtooth";
    if (bend) {
      const from = f * 2 ** (-bend / 12);
      o.frequency.setValueAtTime(from, at);
      o.frequency.setValueAtTime(from, at + 0.03);
      o.frequency.exponentialRampToValueAtTime(f, at + 0.15);
    } else o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.4, at + 0.006);
    g.gain.setTargetAtTime(0.0001, at + 0.006, 1.4);
    g.gain.setTargetAtTime(0.0001, at + length, 0.05);
    o.connect(g);
    g.connect(this.lanes.lead!);
    o.start(at);
    o.stop(at + length + 0.4);
    o.onended = () => g.disconnect();
    if (shake && length > 0.3) {
      const lfo = c.createOscillator(),
        depth = c.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(0, at + 0.2);
      depth.gain.linearRampToValueAtTime(f * 0.012, at + length);
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + length + 0.4);
    }
  }
}
/** The drummer's fills: where in the bar each stroke falls, and on what (s the snare, h m l the toms high to low). */
const FILLS: [number, "s" | "h" | "m" | "l"][][] = [
  [[2, "s"], [2.25, "s"], [2.5, "h"], [2.75, "h"], [3, "m"], [3.25, "m"], [3.5, "l"], [3.75, "l"]],
  [[2, "s"], [2.5, "s"], [3, "s"], [3.25, "s"], [3.5, "s"], [3.75, "s"]],
  [[2, "h"], [2.5, "m"], [3, "l"], [3.5, "s"], [3.75, "s"]],
  [[2, "s"], [2.5, "h"], [2.75, "h"], [3, "m"], [3.5, "l"], [3.75, "l"]],
];
/** The one music of the page. */
export const music = new Music();
