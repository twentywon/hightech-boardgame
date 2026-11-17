// Recorded effects, inlined so nothing is fetched at run time. They are
// Kenney's "Casino Audio", "RPG Audio" and "UI Audio" (all CC0); see
// public/sound-license.txt. Each kind of sound has several recordings
// ("wood-1" … "wood-4"): a game takes one of them for its pieces and keeps
// to it, so that a game always sounds the same and no two games quite alike.
const recordings = import.meta.glob<string>("./sounds/*.{wav,mp3}", {
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
export class Sound {
  private context: AudioContext | null = null;
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
  /** A light touch on a board that is of no particular stuff (the flat games). */
  tap() {
    this.tone("triangle", 780, 160, 0, 0.1, 0.07);
  }
  /** Plays one recording; false when it is not ready. */
  private recording(name: string, volume: number, rate = 1, at = 0) {
    const c = this.context,
      buffer = samples.get(name);
    if (!this.enabled || !c) return true;
    if (!buffer) return false;
    const source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(c.destination);
    source.start(c.currentTime + at);
    return true;
  }
  /**
   * Cards, dice and chips: one of the recordings whose name starts with `kind`, a little higher or lower each
   * time, as no two throws or deals are alike; false when none is ready.
   */
  private sample(kind: string, volume: number, at = 0) {
    if (!this.enabled || !this.context) return true;
    const ready = [...samples.keys()].filter((name) => name.startsWith(`${kind}-`));
    return ready.length > 0 && this.recording(ready[Math.floor(Math.random() * ready.length)], volume, 0.94 + Math.random() * 0.12, at);
  }
  /**
   * A piece set down: the `which`-th recording of its kind, always the same one at the same pitch, so that every
   * move of a game sounds alike (the user asked); games of one stuff take different recordings.
   */
  private piece(kind: string, which: number, volume: number) {
    return this.recording(`${kind}-${which}`, volume) || this.recording(`${kind}-1`, volume);
  }
  /** A wooden piece set down on a wooden board: chess, janggi, a pawn, a checker. */
  wood(which = 1) {
    if (!this.piece("wood", which, 0.5)) this.tap();
  }
  /** Something heavier of wood: a disc on its peg, a wall pushed into its groove. */
  knock(which = 1) {
    if (!this.piece("knock", which, 0.45)) this.tap();
  }
  /** A stone on a board: the click of the stone, and the board under it. */
  stone(which = 1) {
    if (!this.piece("stone", which, 0.6)) return this.tap();
    this.tone("sine", 210, 120, 0, 0.07, 0.07);
  }
  /** A tile, a domino, a ball: something hard clacking on something hard. */
  tile(which = 1) {
    if (!this.piece("tile", which, 0.55)) this.plastic();
  }
  /** Glass or porcelain: a marble into its hollow, with a short ring. */
  glass(which = 1) {
    if (!this.piece("glass", which, 0.4)) return this.plastic();
    this.tone("sine", 2900, 2700, 0, 0.16, 0.018);
  }
  /** Something set down on cloth, earth or a mat. */
  soft(which = 1) {
    if (!this.piece("soft", which, 0.5)) this.tap();
  }
  /** Paper: a pencil's stroke, a page, chalk. */
  paper(which = 1) {
    if (!this.piece("paper", which, 0.4)) this.tap();
  }
  /** A card or a hwatu landing on the felt. */
  card() {
    if (!this.sample("card", 0.5)) this.tap();
  }
  /** One die knocking against another or against the board: a short, bright click. */
  private click(at: number, volume: number, pitch = 1) {
    const f = (2600 + Math.random() * 1800) * pitch;
    this.noise(at, 0.018, volume, f, "bandpass", f * 0.8);
    this.tone("triangle", f * 0.42, f * 0.3, at, 0.025, volume * 0.35);
  }
  /**
   * Dice rolled: rattled in the hand while they fly, thrown into the tray as they land (`land` seconds from now,
   * when the view's dice come down), then tumbling over a few times, each knock softer and later than the last,
   * until they lie still. Several dice rattle more and roll longer than one.
   */
  dice(count: number, land = 0) {
    if (!this.enabled || !this.context) return;
    const many = Math.max(1, Math.min(5, count));
    // The rattle in the hand: quick knocks while they are shaken and fly.
    for (let t = 0; t < land - 0.1; t += 0.035 + Math.random() * 0.035) this.click(t, 0.035 + Math.random() * 0.03, 0.85);
    if (!this.sample(many >= 3 ? "dice" : "die", 0.6, land)) this.click(land, 0.14);
    // Rolling to a stop: knocks closing up and dying away.
    const knocks = 4 + many * 2;
    let t = land + 0.08,
      gap = 0.05;
    for (let i = 0; i < knocks; i++) {
      this.click(t, 0.075 * (1 - i / knocks) + 0.012, 1 - i * 0.02);
      t += gap * (0.6 + Math.random() * 0.8);
      gap *= 1.2;
    }
  }
  /** One yut stick knocking on another or landing on the mat. */
  stick() {
    if (!this.sample("stick", 0.32)) this.knock(2);
  }
  /** The four sticks shaken together in the hand as they are thrown: a few quick knocks. */
  sticks() {
    if (!this.enabled || !this.context) return;
    [0, 0.05, 0.11, 0.15].forEach((at, i) => this.sample("stick", 0.22 - i * 0.03, at));
  }
  /** Glass marbles knocking together: always the same knock, as for any piece. */
  marble() {
    if (!this.piece("marble", 1, 0.45)) this.glass(1);
  }
  /** Two billiard balls striking each other; `strength` from 0 to 1 sets how loud. */
  ball(strength = 0.6) {
    if (!this.sample("ball", 0.15 + 0.45 * strength)) this.tile(5);
  }
  /** A billiard ball against a cushion. */
  cushion(strength = 0.6) {
    if (!this.sample("cushion", 0.12 + 0.35 * strength)) this.soft();
  }
  /** A billiard ball dropping into a pocket and rolling down into it. */
  pocket() {
    if (!this.piece("pocket", 1, 0.5)) this.knock();
  }
  /** Meat laid on a hot grill, or turned over: a hiss of fat. */
  sizzle() {
    if (!this.sample("sizzle", 0.32)) this.noise(0, 1.2, 0.08, 5200, "highpass");
  }
  /** Something eaten with relish: chewing and the smack of the lips. */
  chew() {
    if (!this.sample("chew", 0.55)) this.tap();
  }
  /** Water poured from one beaker into another, glugging as it goes. */
  pour() {
    if (!this.piece("pour", 1, 0.5)) return this.plop();
    this.recording("gurgle-1", 0.22, 1, 0.35);
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
    this.sample("coin", 0.35);
    this.noise(0, 0.12, 0.12, 3200, "highpass");
    this.noise(0.1, 0.1, 0.1, 2600, "highpass");
    [1568, 2093].forEach((f, i) => this.tone("triangle", f, f, 0.2 + i * 0.09, 0.5, 0.09));
    this.tone("sine", 3136, 3136, 0.29, 0.6, 0.04);
  }
  /** Something dropping into water: a plop and the wash after it, made by the page (a boat's oars, a pour that has not loaded). */
  plop() {
    this.tone("sine", 420, 90, 0, 0.22, 0.16);
    this.noise(0.03, 0.55, 0.2, 2600, "lowpass", 500);
    this.noise(0.2, 0.5, 0.08, 1200, "bandpass", 600);
  }
  /** A shell falling into the sea: a recording of a big splash, the same each time (made by the page until it is ready). */
  splash() {
    if (!this.piece("splash", 1, 0.6)) this.plop();
  }
  /** An explosion: a recording of a close blast and its rumble rolling away (made by the page until it is ready). */
  explosion() {
    if (!this.piece("explosion", 1, 0.75)) this.blast();
  }
  /** An explosion made by the page: a crack, a deep thump and a rumble dying away. */
  private blast() {
    this.noise(0, 0.12, 0.3, 3000, "highpass", 800);
    this.tone("sine", 140, 34, 0, 0.6, 0.4);
    this.tone("triangle", 90, 30, 0.02, 0.5, 0.2);
    this.noise(0.04, 0.9, 0.26, 900, "lowpass", 120);
  }
  /** A plastic disc dropping into a plastic rack: a hard click and a lighter rattle. */
  plastic() {
    this.noise(0, 0.035, 0.3, 4200, "bandpass", 3200);
    this.tone("square", 1900, 1300, 0, 0.04, 0.05);
    this.noise(0.07, 0.03, 0.14, 5200, "bandpass", 4200);
    this.tone("square", 2300, 1700, 0.07, 0.03, 0.025);
  }
  /** A hound's bark: a recording, the same each time. */
  bark() {
    if (this.piece("bark", 2, 0.32)) return;
    this.barked();
  }
  /** Two barks, made by the page while the recording is not ready. */
  private barked() {
    for (const at of [0, 0.2]) {
      this.tone("sawtooth", 520, 210, at, 0.13, 0.16);
      this.tone("square", 260, 120, at, 0.12, 0.06);
      this.noise(at, 0.1, 0.1, 1400, "bandpass", 700);
    }
  }
  /** The hare's hop: a light footfall in the grass, the same each time. */
  hop() {
    if (this.recording("hop-1", 0.5, 1.25)) return;
    this.pop();
  }
  /** Three light, quick notes rising (a merge of fruit; the hare's hop while its recording is not ready). */
  pop() {
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
  /** A bowling ball rolling away down its lane for `length` seconds: a low rumble that swells and fades as it goes. */
  rumble(length = 2.4) {
    if (!this.enabled || !this.context) return;
    this.noise(0, length, 0.22, 190, "lowpass", 110);
    this.noise(0.05, length * 0.8, 0.05, 420, "bandpass", 260);
    this.tone("sine", 58, 46, 0, length, 0.05);
  }
  /** Pins scattered by a ball (`strength` 0 to 1): hard knocks one after another, with their clatter, dying away. */
  pins(strength = 1) {
    if (!this.enabled || !this.context) return;
    const knocks = 3 + Math.round(Math.min(1, strength) * 9);
    let at = 0;
    for (let i = 0; i < knocks; i++) {
      const loud = (0.45 * Math.min(1, strength) + 0.15) * (1 - i / (knocks + 2));
      if (!this.recording(`knock-${1 + (i % 4)}`, loud, 0.9 + Math.random() * 0.35, at)) this.click(at, loud * 0.4, 0.5);
      this.noise(at, 0.06, loud * 0.22, 2400 + Math.random() * 1600, "bandpass", 1400);
      at += (0.02 + Math.random() * 0.05) * (1 + i * 0.2);
    }
    this.tone("sine", 160, 70, 0, 0.25, 0.08 * Math.min(1, strength));
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
