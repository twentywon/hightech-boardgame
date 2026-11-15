// Recorded effects, inlined so nothing is fetched at run time. They are
// Kenney's "Casino Audio", "RPG Audio" and "UI Audio" (all CC0); see
// public/sound-license.txt. Each kind of sound has several recordings
// ("wood-1" … "wood-4"), and one is drawn each time.
const recordings = import.meta.glob<string>("./sounds/*.wav", {
  query: "?inline",
  import: "default",
  eager: true,
});
/** Decoded recordings by name ("dice-1", "card-2", …), shared by every Sound. */
const samples = new Map<string, AudioBuffer>();
let decoding = false;
function decode(context: AudioContext) {
  if (decoding) return;
  decoding = true;
  for (const [path, url] of Object.entries(recordings)) {
    const name = path.slice(path.lastIndexOf("/") + 1, -4),
      bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    // A recording that cannot be decoded simply falls back to the synthesised sound.
    void context
      .decodeAudioData(bytes.buffer)
      .then((buffer) => samples.set(name, buffer))
      .catch(() => {});
  }
}
/** A little more or less each time, so that nothing sounds twice the same. */
const vary = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;
export class Sound {
  private context: AudioContext | null = null;
  /** The recording each kind played last, which is not played twice running. */
  private last = new Map<string, string>();
  enabled = true;
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
      decode(this.context);
    } catch {}
  }
  dispose() {
    void this.context?.close().catch(() => {});
    this.context = null;
  }
  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    at: number,
    length: number,
    volume: number,
  ) {
    const c = this.context;
    if (!this.enabled || !c) return;
    const o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime + at;
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + length * 0.65);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + length + 0.01);
  }
  /** A light touch on a board that is of no particular stuff (the flat games): never quite the same note twice. */
  tap() {
    const pitch = vary(0.1);
    this.tone("triangle", 780 * pitch, 160 * pitch, 0, 0.1, 0.07 * vary(0.2));
  }
  /**
   * Plays one of the recordings whose name starts with `kind`, not the one it played last, a little higher or
   * lower and louder or softer each time; false when none is ready.
   */
  private sample(kind: string, volume: number, spread = 0.06) {
    const c = this.context;
    if (!this.enabled || !c) return true;
    const ready = [...samples.keys()].filter((name) => name.startsWith(`${kind}-`));
    if (!ready.length) return false;
    const fresh = ready.length > 1 ? ready.filter((name) => name !== this.last.get(kind)) : ready,
      name = fresh[Math.floor(Math.random() * fresh.length)],
      source = c.createBufferSource(),
      gain = c.createGain();
    this.last.set(kind, name);
    source.buffer = samples.get(name)!;
    source.playbackRate.value = vary(spread);
    gain.gain.value = volume * vary(0.15);
    source.connect(gain);
    gain.connect(c.destination);
    source.start();
    return true;
  }
  /** A wooden piece set down on a wooden board: chess, janggi, a pawn, a checker. */
  wood() {
    if (!this.sample("wood", 0.5, 0.1)) this.tap();
  }
  /** Something heavier of wood: a disc on its peg, a wall pushed into its groove. */
  knock() {
    if (!this.sample("knock", 0.45, 0.1)) this.tap();
  }
  /** A stone on a board: the click of the stone, and the board under it. */
  stone() {
    if (!this.sample("stone", 0.6, 0.1)) return this.tap();
    const pitch = vary(0.12);
    this.tone("sine", 210 * pitch, 120 * pitch, 0, 0.07, 0.07);
  }
  /** A tile, a domino, a ball: something hard clacking on something hard. */
  tile() {
    if (!this.sample("tile", 0.55, 0.1)) this.plastic();
  }
  /** Glass or porcelain: a marble into its hollow, with a short ring. */
  glass() {
    if (!this.sample("glass", 0.4, 0.12)) return this.plastic();
    const pitch = vary(0.15);
    this.tone("sine", 2900 * pitch, 2700 * pitch, 0, 0.16, 0.018);
  }
  /** Something set down on cloth, earth or a mat. */
  soft() {
    if (!this.sample("soft", 0.5, 0.1)) this.tap();
  }
  /** Paper: a pencil's stroke, a page, chalk. */
  paper() {
    if (!this.sample("paper", 0.4, 0.12)) this.tap();
  }
  /** A card or a hwatu landing on the felt. */
  card() {
    if (!this.sample("card", 0.5)) this.tap();
  }
  /** Dice thrown into the tray: several at once, or one or two. */
  dice(count: number) {
    if (!this.sample(count >= 3 ? "dice" : "die", 0.6)) this.tap();
  }
  /** Chips sliding across the felt. */
  chips() {
    if (!this.sample("chips", 0.5))
      [1900, 2300, 2050].forEach((f, i) => this.tone("triangle", f, f * 0.8, i * 0.05, 0.07, 0.035));
  }
  /** A burst of filtered noise that swells and dies away. */
  private noise(at: number, length: number, volume: number, frequency: number, type: BiquadFilterType = "bandpass", sweep = frequency) {
    const c = this.context;
    if (!this.enabled || !c) return;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain(),
      t = c.currentTime + at;
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t);
    filter.frequency.linearRampToValueAtTime(sweep, t + length);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + length * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    source.start(t);
  }
  /** A cash machine: coins, the drawer's rattle, then two bright bells. */
  cash() {
    this.sample("coin", 0.35, 0.08);
    this.noise(0, 0.12, 0.12, 3200, "highpass");
    this.noise(0.1, 0.1, 0.1, 2600, "highpass");
    [1568, 2093].forEach((f, i) => this.tone("triangle", f, f, 0.2 + i * 0.09, 0.5, 0.09));
    this.tone("sine", 3136, 3136, 0.29, 0.6, 0.04);
  }
  /** Something heavy dropping into water: a plop and the wash after it. */
  splash() {
    this.tone("sine", 420, 90, 0, 0.22, 0.16);
    this.noise(0.03, 0.55, 0.2, 2600, "lowpass", 500);
    this.noise(0.2, 0.5, 0.08, 1200, "bandpass", 600);
  }
  /** An explosion: a crack, a deep thump and a rumble dying away. */
  explosion() {
    this.noise(0, 0.12, 0.3, 3000, "highpass", 800);
    this.tone("sine", 140, 34, 0, 0.6, 0.4);
    this.tone("triangle", 90, 30, 0.02, 0.5, 0.2);
    this.noise(0.04, 0.9, 0.26, 900, "lowpass", 120);
  }
  /** A plastic disc dropping into a plastic rack: a hard click and a lighter rattle. */
  plastic() {
    const pitch = vary(0.1),
      gap = 0.07 * vary(0.25);
    this.noise(0, 0.035, 0.3 * vary(0.15), 4200 * pitch, "bandpass", 3200 * pitch);
    this.tone("square", 1900 * pitch, 1300 * pitch, 0, 0.04, 0.05);
    this.noise(gap, 0.03, 0.14, 5200 * pitch, "bandpass", 4200 * pitch);
    this.tone("square", 2300 * pitch, 1700 * pitch, gap, 0.03, 0.025);
  }
  /** Two barks. */
  bark() {
    for (const at of [0, 0.2]) {
      this.tone("sawtooth", 520, 210, at, 0.13, 0.16);
      this.tone("square", 260, 120, at, 0.12, 0.06);
      this.noise(at, 0.1, 0.1, 1400, "bandpass", 700);
    }
  }
  /** Three light, quick hops. */
  hop() {
    [0, 0.11, 0.22].forEach((at, i) => {
      this.tone("sine", 880 + i * 120, 620 + i * 120, at, 0.07, 0.09);
      this.noise(at, 0.04, 0.05, 2600, "bandpass", 1800);
    });
  }
  /** A double: a short rising fanfare. */
  double() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone("triangle", f, f, 0.25 + i * 0.09, i === 3 ? 0.5 : 0.16, 0.08));
    this.tone("sine", 3136, 3136, 0.52, 0.5, 0.03);
  }
  /** A bright, glittering run of notes. */
  sparkle() {
    [1047, 1319, 1568, 2093, 2637, 3136, 4186].forEach((f, i) => {
      this.tone("sine", f, f, i * 0.07, 0.5, 0.05);
      this.tone("triangle", f * 2, f * 2, i * 0.07 + 0.02, 0.25, 0.015);
    });
  }
  /** Waves breaking on a beach, twice. */
  waves() {
    this.noise(0, 1.3, 0.16, 500, "lowpass", 2200);
    this.noise(1.0, 1.6, 0.13, 700, "lowpass", 1600);
  }
  /** Something vast and far away: a slow rising sweep over a hollow chord. */
  space() {
    this.tone("sine", 110, 440, 0, 1.6, 0.07);
    this.tone("sine", 165, 660, 0.1, 1.6, 0.045);
    this.tone("triangle", 880, 1760, 0.5, 1.3, 0.02);
    this.noise(0.2, 1.4, 0.03, 4000, "bandpass", 900);
  }
  /** A soft bell: a note with two partials over it, struck and left to ring. */
  private bell(frequency: number, at: number, length: number, volume: number) {
    this.tone("sine", frequency, frequency, at, length, volume);
    this.tone("sine", frequency * 2, frequency * 2, at, length * 0.6, volume * 0.3);
    this.tone("triangle", frequency * 3.01, frequency * 3.01, at, length * 0.3, volume * 0.12);
  }
  /** A win or a draw: a rising broken chord on bells and the chord held under its last note; one of three keys. */
  win() {
    const key = [1, 1.122, 0.891][Math.floor(Math.random() * 3)],
      notes = [523.25, 659.25, 783.99, 1046.5].map((f) => f * key);
    notes.forEach((f, i) => this.bell(f, i * 0.12, i === 3 ? 1.1 : 0.5, 0.055));
    notes.slice(0, 3).forEach((f) => this.tone("sine", f / 2, f / 2, 0.36, 1.2, 0.022));
  }
  /** A loss against the computer: three falling notes, soft, the last one held. */
  lose() {
    const key = [1, 0.944, 1.059][Math.floor(Math.random() * 3)];
    [392, 349.23, 293.66].forEach((f, i) => this.bell(f * key, i * 0.2, i === 2 ? 1.0 : 0.45, 0.05));
    this.tone("sine", 146.83 * key, 146.83 * key, 0.4, 1.0, 0.03);
  }
}
