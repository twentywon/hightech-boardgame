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
/** One of the two pieces of music. */
interface Piece {
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
const LOBBY: Piece = {
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
const TABLE: Piece = {
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
const PIECES = { lobby: LOBBY, table: TABLE };
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
    this.line = 0;
    this.coming = pick(piece.rounds);
    this.lineNote = Math.round((piece.lines.range[0] + piece.lines.range[1]) / 2);
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
      oldKeys = this.keysBus,
      oldTremolo = this.tremolo,
      bus = c.createGain(),
      wet = c.createGain(),
      keys = c.createGain(),
      tremolo = c.createOscillator(),
      depth = c.createGain(),
      tone = c.createBiquadFilter();
    if (old) {
      old.gain.cancelScheduledValues(c.currentTime);
      old.gain.setValueAtTime(old.gain.value, c.currentTime);
      old.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.4);
      window.setTimeout(() => {
        old.disconnect();
        oldKeys?.disconnect();
        try {
          oldTremolo?.stop();
        } catch {}
      }, 1600);
    }
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.linearRampToValueAtTime(1, c.currentTime + (old ? 3.5 : 0.05));
    wet.gain.value = 0.32;
    bus.connect(this.out!);
    bus.connect(wet);
    wet.connect(this.room!);
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
  private hiss(at: number, attack: number, length: number, volume: number, type: BiquadFilterType, frequency: number, q = 0.8) {
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
    g.connect(this.bus!);
    source.start(at, Math.random() * 0.9);
    source.stop(at + attack + length + 0.05);
  }
  /** Writes the bars that begin within the next second and a half. */
  private write() {
    const c = this.context;
    if (!c) return;
    // A clock that fell behind (the page slept) starts again from now rather than hurrying to catch up.
    if (this.next < c.currentTime) this.next = c.currentTime + 0.2;
    while (this.next < c.currentTime + 1.5) {
      this.bar(this.next);
      this.next += (60 / this.piece.tempo) * 4;
      this.bars++;
    }
  }
  private bar(at: number) {
    const piece = this.piece,
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
}
/** The one music of the page. */
export const music = new Music();
