/**
 * Quiet music for the whole page, made as it is played: nothing is recorded
 * and nothing is fetched. A slow round of chords is held by a soft pad and a
 * low note under it, and over them a few notes at a time are struck,
 * wandering by steps through the five notes of the key. No two minutes of it
 * are the same, so it never comes round as a loop does.
 *
 * There are two pieces of it. In the collection a brighter one plays: a
 * music box in a major key at a walking pace. At a table a quieter one takes
 * its place, lower, slower and in the minor, with fewer notes and a rounder
 * voice, so that it stays behind the game. One fades into the other.
 *
 * It begins only after the first touch or key (a page may not make a sound
 * before that), rests while the page is hidden, and can be switched off in
 * the settings.
 */
/** Middle C and the steps of its five-note scale, as counts of semitones. */
const C4 = 261.63,
  FIVE = [0, 2, 4, 7, 9],
  hertz = (semitones: number) => C4 * 2 ** (semitones / 12);
/** The chords, as semitones from C: the note under it, the notes of the pad, and where in the five notes a tune rests on it. */
const CHORDS: Record<string, { low: number; pad: number[]; rest: number[] }> = {
  C: { low: -24, pad: [-12, -5, 4, 11], rest: [0, 2, 3] },
  Am: { low: -27, pad: [-15, -8, 0, 7], rest: [0, 2, 4] },
  F: { low: -19, pad: [-19, -12, -3, 4], rest: [0, 2, 4] },
  G: { low: -17, pad: [-17, -10, -1, 9], rest: [1, 3, 4] },
  Em: { low: -20, pad: [-20, -13, -5, 2], rest: [1, 2, 3] },
  Dm: { low: -22, pad: [-22, -15, -7, 0], rest: [0, 1, 4] },
};
/** One of the two pieces of music. */
interface Piece {
  /** Seconds a beat; a bar is four of them. */
  beat: number;
  /** How many bars a chord is held. */
  hold: number;
  /** How far the whole piece is moved from C, in semitones. */
  key: number;
  /** Rounds of four chords; one is drawn after another. */
  rounds: string[][];
  /** Where in a bar the notes of the tune may fall, in beats; an empty bar is a breath. */
  figures: number[][];
  /** How low and how high the tune goes, in steps of the five notes from middle C. */
  range: [number, number];
  /** How the tune's notes are made: a music box, or something softer and rounder. */
  voice: "box" | "felt";
  /** How loud the pad, the low note and the tune are. */
  pad: number;
  low: number;
  tune: number;
}
/** The collection: a music box in C major, at a walking pace. */
const LOBBY: Piece = {
  beat: 0.92,
  hold: 2,
  key: 0,
  rounds: [
    ["C", "Am", "F", "G"],
    ["C", "Em", "F", "G"],
    ["Am", "F", "C", "G"],
    ["F", "G", "Em", "Am"],
    ["C", "F", "Dm", "G"],
  ],
  figures: [[0, 2], [0, 1.5, 3], [0.5, 2, 2.5], [0, 1, 2, 3], [1, 2.5], [0, 3], [], [0, 0.5, 2], []],
  range: [2, 11],
  voice: "box",
  pad: 0.026,
  low: 0.06,
  tune: 0.05,
};
/** A table: lower, slower and in the minor (the same chords, begun from the sixth, a tone down), with few notes. */
const TABLE: Piece = {
  beat: 1.25,
  hold: 2,
  key: -2,
  rounds: [
    ["Am", "F", "C", "G"],
    ["Am", "Em", "F", "C"],
    ["Dm", "Am", "F", "Em"],
    ["Am", "Dm", "Em", "Am"],
    ["F", "C", "Dm", "Am"],
  ],
  figures: [[0], [0, 2], [1.5], [], [0, 3], [], [2], [0, 2.5], [], [1]],
  range: [-3, 5],
  voice: "felt",
  pad: 0.03,
  low: 0.065,
  tune: 0.045,
};
const PIECES = { lobby: LOBBY, table: TABLE };
const pick = <X>(list: X[]) => list[Math.floor(Math.random() * list.length)];

class Music {
  private context: AudioContext | null = null;
  /** Everything goes out through this (the setting and the hidden page turn it down). */
  private out: GainNode | null = null;
  private room: ConvolverNode | null = null;
  /** What the piece now playing goes through; a new piece gets a new one, and the old one is faded away. */
  private bus: GainNode | null = null;
  private piece: Piece = LOBBY;
  private timer = 0;
  /** When the next bar begins, by the context's clock, and how many of this piece have been written. */
  private next = 0;
  private bars = 0;
  private round: string[] = LOBBY.rounds[0];
  /** Where the tune stands: a step of the five notes, counted from middle C upward. */
  private step = 7;
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
    const piece = PIECES[name];
    if (piece === this.piece) return;
    this.piece = piece;
    this.bars = 0;
    this.step = Math.round((piece.range[0] + piece.range[1]) / 2);
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
      // A room: noise that dies away over three seconds, different in each ear.
      length = Math.floor(c.sampleRate * 3),
      impulse = c.createBuffer(2, length, c.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    room.buffer = impulse;
    out.gain.value = 0.0001;
    soften.type = "lowpass";
    soften.frequency.value = 3200;
    room.connect(out);
    out.connect(soften);
    soften.connect(c.destination);
    this.context = c;
    this.out = out;
    this.room = room;
    this.change();
  }
  /** Gives the piece that is to play a way out of its own and fades away the one that was playing. */
  private change() {
    const c = this.context!,
      old = this.bus,
      bus = c.createGain(),
      wet = c.createGain();
    if (old) {
      old.gain.cancelScheduledValues(c.currentTime);
      old.gain.setValueAtTime(old.gain.value, c.currentTime);
      old.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.4);
      window.setTimeout(() => old.disconnect(), 1600);
    }
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.linearRampToValueAtTime(1, c.currentTime + (old ? 3.5 : 0.05));
    wet.gain.value = 0.55;
    bus.connect(this.out!);
    bus.connect(wet);
    wet.connect(this.room!);
    this.bus = bus;
  }
  /** One held voice of the pad or the low note: it swells, is held, and dies away. */
  private held(frequency: number, at: number, length: number, volume: number, type: OscillatorType) {
    const c = this.context!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.value = frequency;
    o.detune.value = (Math.random() * 2 - 1) * 5;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + length * 0.3);
    g.gain.setValueAtTime(volume, at + length * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, at + length + 2.4);
    o.connect(g);
    g.connect(this.bus!);
    o.start(at);
    o.stop(at + length + 2.5);
  }
  /**
   * One note of the tune. A music box strikes it sharply, with two faint partials over it; the softer voice comes
   * in more slowly, is rounder (a triangle wave with the octave below under it, the top taken off) and rings longer.
   */
  private struck(frequency: number, at: number, volume: number) {
    const c = this.context!,
      box = this.piece.voice === "box",
      ring = box ? 2.6 : 3.6,
      g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + (box ? 0.012 : 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, at + ring);
    let end: AudioNode = g;
    if (!box) {
      const round = c.createBiquadFilter();
      round.type = "lowpass";
      round.frequency.value = 1300;
      g.connect(round);
      end = round;
    }
    end.connect(this.bus!);
    const partials: [number, number, OscillatorType][] = box
      ? [
          [1, 1, "sine"],
          [2, 0.28, "sine"],
          [3, 0.08, "sine"],
        ]
      : [
          [1, 1, "triangle"],
          [0.5, 0.4, "sine"],
        ];
    for (const [partial, share, type] of partials) {
      const o = c.createOscillator(),
        part = c.createGain();
      o.type = type;
      o.frequency.value = frequency * partial;
      part.gain.value = share;
      o.connect(part);
      part.connect(g);
      o.start(at);
      o.stop(at + ring + 0.1);
    }
  }
  /** Writes the bars that begin within the next second and a half. */
  private write() {
    const c = this.context;
    if (!c) return;
    // A clock that fell behind (the page slept) starts again from now rather than hurrying to catch up.
    if (this.next < c.currentTime) this.next = c.currentTime + 0.2;
    while (this.next < c.currentTime + 1.5) {
      this.bar(this.next);
      this.next += this.piece.beat * 4;
      this.bars++;
    }
  }
  private bar(at: number) {
    const piece = this.piece,
      place = this.bars % (piece.hold * 4),
      up = (semitones: number) => hertz(semitones + piece.key);
    if (place === 0) this.round = pick(piece.rounds);
    const chord = CHORDS[this.round[Math.floor(place / piece.hold)]];
    if (place % piece.hold === 0) {
      const length = piece.beat * 4 * piece.hold;
      chord.pad.forEach((note, i) => this.held(up(note), at + i * 0.07, length, piece.pad, i % 2 ? "triangle" : "sine"));
      this.held(up(chord.low), at, length, piece.low, "sine");
    }
    const [lowest, highest] = piece.range;
    for (const beat of pick(piece.figures)) {
      // The tune goes by a step or two, stays within its range, and on the first beat rests on a note of the chord.
      this.step = Math.max(lowest, Math.min(highest, this.step + pick([-2, -1, -1, 0, 1, 1, 2])));
      if (beat === 0) this.step = Math.floor(this.step / 5) * 5 + pick(chord.rest);
      const note = Math.floor(this.step / 5) * 12 + FIVE[((this.step % 5) + 5) % 5];
      this.struck(up(note), at + beat * piece.beat + Math.random() * 0.02, piece.tune + Math.random() * 0.02);
    }
  }
}
/** The one music of the page. */
export const music = new Music();
