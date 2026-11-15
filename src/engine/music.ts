/**
 * Quiet music for the whole page, made as it is played: nothing is recorded
 * and nothing is fetched. A slow round of chords is held by a soft pad and a
 * low note under it, and over them a few notes at a time fall like those of a
 * music box, wandering by steps through the five notes of the key. No two
 * minutes of it are the same, so it never comes round as a loop does.
 *
 * It begins only after the first touch or key (a page may not make a sound
 * before that), rests while the page is hidden, and can be switched off in
 * the settings.
 */
const BEAT = 0.92,
  BAR = BEAT * 4,
  /** A chord is held this many bars. */
  HOLD = 2,
  /** Middle C and the steps of its five-note scale, as counts of semitones. */
  C4 = 261.63,
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
/** Rounds of four chords; one is drawn after another. */
const ROUNDS = [
  ["C", "Am", "F", "G"],
  ["C", "Em", "F", "G"],
  ["Am", "F", "C", "G"],
  ["F", "G", "Em", "Am"],
  ["C", "F", "Dm", "G"],
];
/** Where in a bar the notes of a tune may fall, in beats; an empty bar is a breath. */
const FIGURES = [[0, 2], [0, 1.5, 3], [0.5, 2, 2.5], [0, 1, 2, 3], [1, 2.5], [0, 3], [], [0, 0.5, 2], []];
const pick = <X>(list: X[]) => list[Math.floor(Math.random() * list.length)];

class Music {
  private context: AudioContext | null = null;
  private out: GainNode | null = null;
  private wet: GainNode | null = null;
  private timer = 0;
  /** When the next bar begins, by the context's clock, and how many have been written. */
  private next = 0;
  private bars = 0;
  private round: string[] = ROUNDS[0];
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
      wet = c.createGain(),
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
    wet.gain.value = 0.55;
    wet.connect(room);
    room.connect(out);
    out.connect(soften);
    soften.connect(c.destination);
    this.context = c;
    this.out = out;
    this.wet = wet;
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
    g.connect(this.out!);
    g.connect(this.wet!);
    o.start(at);
    o.stop(at + length + 2.5);
  }
  /** One note of the tune: struck, with two faint partials over it, and left to ring. */
  private struck(frequency: number, at: number, volume: number) {
    const c = this.context!,
      g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
    g.connect(this.out!);
    g.connect(this.wet!);
    [
      [1, 1],
      [2, 0.28],
      [3, 0.08],
    ].forEach(([partial, share]) => {
      const o = c.createOscillator(),
        part = c.createGain();
      o.type = "sine";
      o.frequency.value = frequency * partial;
      part.gain.value = share;
      o.connect(part);
      part.connect(g);
      o.start(at);
      o.stop(at + 2.7);
    });
  }
  /** Writes the bars that begin within the next second and a half. */
  private write() {
    const c = this.context;
    if (!c) return;
    // A clock that fell behind (the page slept) starts again from now rather than hurrying to catch up.
    if (this.next < c.currentTime) this.next = c.currentTime + 0.2;
    while (this.next < c.currentTime + 1.5) {
      this.bar(this.next);
      this.next += BAR;
      this.bars++;
    }
  }
  private bar(at: number) {
    const place = this.bars % (HOLD * 4);
    if (place === 0) this.round = pick(ROUNDS);
    const chord = CHORDS[this.round[Math.floor(place / HOLD)]];
    if (place % HOLD === 0) {
      const length = BAR * HOLD;
      chord.pad.forEach((note, i) => this.held(hertz(note), at + i * 0.07, length, 0.026, i % 2 ? "triangle" : "sine"));
      this.held(hertz(chord.low), at, length, 0.06, "sine");
    }
    for (const beat of pick(FIGURES)) {
      // The tune goes by a step or two, stays within two octaves, and on the first beat rests on a note of the chord.
      this.step = Math.max(2, Math.min(11, this.step + pick([-2, -1, -1, 0, 1, 1, 2])));
      if (beat === 0) {
        const octave = Math.floor(this.step / 5);
        this.step = octave * 5 + pick(chord.rest);
      }
      const note = Math.floor(this.step / 5) * 12 + FIVE[this.step % 5];
      this.struck(hertz(note), at + beat * BEAT + Math.random() * 0.02, 0.05 + Math.random() * 0.025);
    }
  }
}
/** The one music of the page. */
export const music = new Music();
