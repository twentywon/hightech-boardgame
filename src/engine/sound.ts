// Recorded effects, inlined so nothing is fetched at run time. They are
// Kenney's packs, BigSoundBank's recordings and a few more (all CC0); see
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
/** A few seconds of fire made by the page, to be looped: a soft low rush with snaps of burning wood in it. */
function crackling(context: BaseAudioContext) {
  const rate = context.sampleRate,
    length = Math.ceil(rate * 4.3),
    buffer = context.createBuffer(1, length, rate),
    data = buffer.getChannelData(0);
  let seed = 7,
    low = 0;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < length; i++) {
    low += (random() * 2 - 1 - low) * 0.02;
    data[i] = low * 0.6;
  }
  for (let k = 0; k < 80; k++) {
    const at = Math.floor(random() * (length - rate * 0.03)),
      size = 0.12 + random() * 0.55,
      span = Math.floor(rate * (0.002 + random() * 0.012));
    for (let j = 0; j < span; j++) data[at + j] += (random() * 2 - 1) * size * Math.exp((-6 * j) / span);
  }
  return buffer;
}
/**
 * 슬롯 카: one second of a small electric motor made by the page, to be looped (and pitched by its playback rate): a
 * bright buzz of the armature at 220 Hz with its overtones, the commutator's ripple over it and the hiss of the
 * brushes. Whole cycles fill the stretch that loops, so that it joins without a click.
 */
function whining(context: BaseAudioContext) {
  const rate = context.sampleRate,
    length = rate,
    buffer = context.createBuffer(1, length, rate),
    data = buffer.getChannelData(0);
  let seed = 3,
    hiss = 0,
    peak = 0;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < length; i++) {
    const w = (2 * Math.PI * 220 * i) / rate;
    let v = 0;
    for (let h = 1; h <= 9; h++) v += Math.sin(h * w + h * 0.7) / h ** 0.85;
    // The commutator's ripple, three times a turn, and the brushes' hiss.
    v *= 0.75 + 0.25 * Math.sin(3 * w);
    hiss += (random() * 2 - 1 - hiss) * 0.35;
    data[i] = v + hiss * 0.5;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < length; i++) data[i] *= 0.8 / peak;
  return buffer;
}
/**
 * 슬롯 카: a second of tyres chattering at the edge of their grip, to be looped: a rasp of squeal and grit broken up
 * about 27 times a second, the "카가각" the user asked to hear before a car flies off. Whole cycles, so the loop joins.
 */
function screeching(context: BaseAudioContext) {
  const rate = context.sampleRate,
    length = rate,
    buffer = context.createBuffer(1, length, rate),
    data = buffer.getChannelData(0);
  let seed = 11,
    grit = 0,
    peak = 0;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < length; i++) {
    const t = i / rate,
      // Each catch of the tyre: a sharp rise, a quick fall.
      phase = (t * 27) % 1,
      catchOf = Math.exp(-phase * 9) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 3 * t)),
      squeal = Math.sin(2 * Math.PI * 2300 * t + 0.6 * Math.sin(2 * Math.PI * 27 * t)) * 0.6 + Math.sin(2 * Math.PI * 3400 * t) * 0.35;
    grit += (random() * 2 - 1 - grit) * 0.55;
    data[i] = catchOf * (squeal + grit * 0.9);
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < length; i++) data[i] *= 0.8 / peak;
  return buffer;
}
/**
 * 축구: four seconds of a crowd's murmur made by the page, to be looped: many voices as low noise, swelling and falling
 * slowly, with now and then a shout over it. The ends are faded into each other so that the loop joins.
 */
function murmuring(context: BaseAudioContext) {
  const rate = context.sampleRate,
    length = Math.ceil(rate * 4.3),
    buffer = context.createBuffer(1, length, rate),
    data = buffer.getChannelData(0);
  let seed = 13,
    low = 0,
    mid = 0;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < length; i++) {
    const n = random() * 2 - 1;
    low += (n - low) * 0.05;
    mid += (n - mid) * 0.22;
    const swell = 0.75 + 0.25 * Math.sin((i / rate) * 1.7) * Math.sin((i / rate) * 0.63 + 1);
    data[i] = (low * 1.6 + (mid - low) * 0.35) * swell;
  }
  for (let k = 0; k < 14; k++) {
    const at = Math.floor(random() * (length - rate * 0.4)),
      span = Math.floor(rate * (0.15 + random() * 0.25)),
      f = 300 + random() * 380;
    for (let j = 0; j < span; j++) data[at + j] += Math.sin((2 * Math.PI * f * j) / rate) * 0.05 * Math.sin((Math.PI * j) / span);
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = 0; i < length; i++) data[i] *= 0.8 / peak;
  return buffer;
}
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
/**
 * The loops (motor-1, winch-1, roll-1) carry this many seconds of their own continuation before and after the stretch
 * that loops, so that the loop is seamless whether or not the decoder keeps the MP3's padding.
 */
const LOOP_MARGIN = 0.15;
/**
 * A loop that is not asked for again within this many seconds fades away by itself (a safety net: views ask every
 * frame and say 0 when they stop; long enough for a slow software-drawn frame not to cut the loop off).
 */
const LOOP_HOLD = 1;
interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** The loudness and the rate it was last sent toward. */
  volume: number;
  rate: number;
  /** The context's time after which it fades unless asked for again. */
  until: number;
}
export class Sound {
  private context: AudioContext | null = null;
  enabled = true;
  /** Sounds that last while something goes on (a motor, a winch, balls rolling), by recording. */
  private loops = new Map<string, Loop>();
  private watch = 0;
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
      decode(this.context);
    } catch {}
  }
  dispose() {
    this.hush();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
  /** A page put away silences what goes on (a view's clock stops with it and can no longer say so). */
  private readonly hidden = () => {
    if (document.hidden) this.hush();
  };
  /**
   * A sound that lasts while something goes on: the recording `name` looped at `volume` (0 lets it fade out), played
   * at `rate`. It has to be asked for again at least every `LOOP_HOLD` seconds (a view does so every frame), or it
   * fades away by itself: a view that stops (a page hidden, a view thrown away) never leaves it running.
   */
  private hum(name: string, volume: number, rate = 1) {
    const c = this.context,
      held = this.loops.get(name);
    if (!c || !this.enabled || volume <= 0.002) {
      if (held) this.fade(name, held);
      return;
    }
    const now = c.currentTime;
    if (held) {
      // Only a change worth hearing is sent, so that a view asking every frame does not pile up automation.
      if (Math.abs(volume - held.volume) > 0.005) held.gain.gain.setTargetAtTime((held.volume = volume), now, 0.05);
      if (Math.abs(rate - held.rate) > 0.005) held.source.playbackRate.setTargetAtTime((held.rate = rate), now, 0.08);
      held.until = now + LOOP_HOLD;
      return;
    }
    const buffer = samples.get(name);
    if (!buffer || buffer.duration < LOOP_MARGIN * 3) return;
    const source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = LOOP_MARGIN;
    source.loopEnd = buffer.duration - LOOP_MARGIN;
    source.playbackRate.value = rate;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.06);
    source.connect(gain);
    gain.connect(c.destination);
    source.start(now, LOOP_MARGIN);
    this.loops.set(name, { source, gain, volume, rate, until: now + LOOP_HOLD });
    if (!this.watch) {
      this.watch = window.setInterval(() => this.lapse(), 100);
      document.addEventListener("visibilitychange", this.hidden);
    }
  }
  /** A loop let go: a quick fade, then it stops. */
  private fade(name: string, loop: Loop) {
    this.loops.delete(name);
    const c = this.context;
    try {
      if (c) {
        loop.gain.gain.cancelScheduledValues(c.currentTime);
        loop.gain.gain.setTargetAtTime(0, c.currentTime, 0.03);
        loop.source.stop(c.currentTime + 0.25);
      } else loop.source.stop();
    } catch {}
    if (!this.loops.size) this.unwatch();
  }
  /** Loops that have not been asked for again lately fade away. */
  private lapse() {
    const now = this.context?.currentTime ?? Infinity;
    for (const [name, loop] of this.loops) if (now > loop.until) this.fade(name, loop);
  }
  private unwatch() {
    if (!this.watch) return;
    clearInterval(this.watch);
    this.watch = 0;
    document.removeEventListener("visibilitychange", this.hidden);
  }
  /** Every lasting sound faded out at once (paused, a window opened, the page hidden, the table left). */
  hush() {
    for (const [name, loop] of this.loops) this.fade(name, loop);
    this.unwatch();
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
  soft(which = 1, volume = 0.5) {
    if (!this.piece("soft", which, volume)) this.tap();
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
  stick(volume = 0.32) {
    if (!this.sample("stick", volume)) this.knock(2);
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
  /** One coin landing on the felt or on other coins: a short clink, a little higher or lower each time, softer with `strength`. */
  coin(strength = 1) {
    if (!this.recording("coin-2", 0.1 + 0.32 * strength, 0.9 + Math.random() * 0.3))
      this.tone("triangle", 2500 + Math.random() * 500, 2300, 0, 0.09, 0.012 + 0.03 * strength);
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
  /**
   * 레이저 체스, made by the page: the laser firing (a falling zap over a low hum), its beam stopped by a shield's
   * front or a laser (a short metallic clink), and a piece it takes bursting (a crackle, a thump and glassy glints).
   */
  laser(what: "fire" | "block" | "burst") {
    if (what === "fire") {
      this.tone("sawtooth", 1500, 380, 0, 0.24, 0.03);
      this.tone("sine", 2400, 900, 0, 0.18, 0.04);
      this.tone("sine", 110, 96, 0, 0.42, 0.05);
      this.noise(0, 0.2, 0.03, 6000, "highpass", 3000);
    } else if (what === "block") {
      this.tone("triangle", 2500, 1900, 0, 0.07, 0.05);
      this.noise(0, 0.05, 0.08, 5200, "bandpass", 4000);
    } else {
      this.noise(0, 0.28, 0.2, 3200, "highpass", 700);
      this.tone("sine", 190, 55, 0, 0.32, 0.14);
      [3300, 4200, 2900].forEach((f, i) => this.tone("triangle", f, f * 0.92, 0.05 + i * 0.06, 0.12, 0.025));
    }
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
  /**
   * A frog's 폴짝 (the user asked for it instead of the knock on wood): a springy rise as it leaps, higher and
   * longer over another frog (`far`), and a soft, damp landing `land` seconds later; nothing recorded, the same each time.
   */
  leap(far: boolean, land: number) {
    const rise = far ? 0.2 : 0.13;
    this.tone("sine", far ? 250 : 310, far ? 1250 : 960, 0, rise, 0.13);
    this.tone("triangle", far ? 380 : 470, far ? 1700 : 1350, 0.025, rise * 0.8, 0.035);
    this.noise(0.01, rise + 0.08, 0.025, 900, "bandpass", 2600);
    this.tone("sine", 430, 150, land, 0.09, 0.1);
    this.noise(land, 0.06, 0.05, 520, "lowpass", 260);
  }
  /** Frogs croaking (every frog home): a few rib-bits, each a buzz of quick pulses, lower and higher, `after` seconds from now. */
  croak(after = 0) {
    [
      [0.12, 1],
      [0.42, 1.18],
      [0.7, 0.88],
    ].forEach(([at, pitch]) => {
      for (const [start, pulses, base] of [
        [0, 5, 205],
        [0.14, 7, 170],
      ])
        for (let k = 0; k < pulses; k++) this.tone("square", base * pitch, base * pitch * 0.82, after + at + start + k * 0.021, 0.018, 0.035);
    });
  }
  /**
   * A cat's small, unhappy 냐옹 `after` seconds from now (trap the cat): a voice that rises and falls through a nasal
   * vowel, with a breath under it; nothing recorded, the same each time.
   */
  meow(after = 0) {
    this.tone("sawtooth", 560, 820, after, 0.2, 0.035);
    this.tone("sawtooth", 820, 470, after + 0.16, 0.34, 0.04);
    this.tone("triangle", 1120, 1640, after, 0.2, 0.05);
    this.tone("triangle", 1640, 940, after + 0.16, 0.36, 0.06);
    this.tone("sine", 2300, 1500, after + 0.1, 0.32, 0.02);
    this.noise(after, 0.48, 0.012, 1800, "bandpass", 1200);
  }
  /**
   * A snake's hiss as a token reaches its mouth (snakes and ladders), and over the `ride` seconds after it a soft
   * whistle sliding down with the token; made by the page, the same each time.
   */
  hiss(ride = 0) {
    this.noise(0, 0.42, 0.05, 5200, "bandpass", 4200);
    if (ride <= 0.35) return;
    this.tone("sine", 880, 230, 0.3, ride - 0.3, 0.045);
    this.noise(0.3, ride - 0.3, 0.018, 1400, "bandpass", 500);
  }
  /** Three light, quick notes rising (a merge of fruit; the hare's hop while its recording is not ready). */
  pop() {
    [0, 0.11, 0.22].forEach((at, i) => {
      this.tone("sine", 880 + i * 120, 620 + i * 120, at, 0.07, 0.09);
      this.noise(at, 0.04, 0.05, 2600, "bandpass", 1800);
    });
  }
  /**
   * Two fruits merging (과일 게임): a wet squelch and a bubbly pop, lower for a larger fruit (`size` 0 to 1) and a
   * step higher for every merge of a combo; from the third a bright chime rings over it.
   */
  squish(size = 0.5, combo = 1) {
    const lift = 2 ** (Math.min(6, Math.max(0, combo - 1)) / 6),
      base = (720 - size * 420) * lift;
    this.noise(0, 0.12 + size * 0.08, 0.1, 1400 - size * 600, "bandpass", 500);
    this.tone("sine", base * 0.7, base * 1.5, 0, 0.12, 0.11);
    this.tone("sine", base * 1.25, base * 2.1, 0.05, 0.1, 0.06);
    this.tone("triangle", base * 0.5, base * 0.42, 0, 0.16 + size * 0.1, 0.05);
    if (combo >= 3) [0, 0.06, 0.12].forEach((at, i) => this.tone("sine", 1568 * lift * (1 + i * 0.26), 1568 * lift * (1 + i * 0.26), 0.08 + at, 0.3, 0.025));
  }
  /** A fruit landing in the box (`strength` 0 to 1, `size` 0 to 1): a soft, rubbery plunk. */
  plunk(strength = 0.5, size = 0.5) {
    const f = 300 - size * 170;
    this.tone("sine", f * 1.6, f, 0, 0.09 + size * 0.05, 0.03 + strength * 0.07);
    this.noise(0, 0.05, 0.012 + strength * 0.03, 900 - size * 400, "lowpass", 300);
  }
  /** A soft thing thrown through the air (a germ's jump): a rising and falling whoosh, then a wet splat `land` seconds from now. */
  whoosh(land: number) {
    this.noise(0, land * 0.55, 0.07, 500, "bandpass", 2400);
    this.noise(land * 0.45, land * 0.6, 0.05, 2400, "bandpass", 700);
    this.tone("sine", 340, 120, land, 0.12, 0.13);
    this.noise(land, 0.09, 0.08, 1300, "bandpass", 500);
    this.tone("sine", 620, 900, land + 0.05, 0.06, 0.04);
  }
  /** Something soaking in (germs won over): a short gurgle and a bubble for each of `count`, rising. */
  gurgle(count: number) {
    if (this.context && samples.has("gurgle-1")) this.recording("gurgle-1", 0.26, 1.2);
    else this.noise(0, 0.3, 0.06, 700, "lowpass", 300);
    for (let k = 0; k < Math.min(count, 6); k++) {
      const f = 330 + k * 70;
      this.tone("sine", f, f * 1.9, 0.04 + k * 0.13, 0.07, 0.07);
      this.tone("sine", f * 1.5, f * 2.4, 0.08 + k * 0.13, 0.05, 0.03);
    }
  }
  /** A bite of an apple (스네이크): a crisp crunch, a second smaller one, and a little gulp. */
  crunch(gold = false) {
    this.noise(0, 0.07, 0.12, 3200, "bandpass", 1800);
    this.noise(0.075, 0.05, 0.07, 2600, "bandpass", 1500);
    this.tone("sine", 260, 140, 0.13, 0.09, 0.07);
    if (gold) [1319, 1760, 2349].forEach((f, i) => this.tone("triangle", f, f, 0.12 + i * 0.06, 0.28, 0.04));
  }
  /** A head running into something (스네이크): a dull bonk and a falling, dizzy wobble. */
  bonk() {
    this.tone("sine", 180, 60, 0, 0.22, 0.16);
    this.noise(0, 0.12, 0.08, 700, "lowpass", 200);
    this.tone("triangle", 660, 220, 0.18, 0.55, 0.05);
    this.tone("triangle", 620, 200, 0.24, 0.55, 0.035);
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
  /**
   * The angel's coming (전술 대전): a choir-like chord of soft voices swelling for a second, a shimmer rising under it,
   * then at `flash` seconds a bright struck chord on bells with a glitter running up, the chord held as it dies away.
   */
  heavenly(flash = 1.15) {
    const c = this.context;
    if (!this.enabled || !c) return;
    const now = c.currentTime;
    for (const [f, detune] of [[261.63, -6], [329.63, 5], [392, -4], [523.25, 7], [261.63, 9], [392, 6]] as const) {
      const o = c.createOscillator(),
        low = c.createBiquadFilter(),
        g = c.createGain();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = detune;
      low.type = "lowpass";
      low.frequency.setValueAtTime(500, now);
      low.frequency.linearRampToValueAtTime(1600, now + flash);
      low.frequency.exponentialRampToValueAtTime(700, now + flash + 1.6);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.011, now + flash);
      g.gain.setValueAtTime(0.011, now + flash + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, now + flash + 1.7);
      o.connect(low);
      low.connect(g);
      g.connect(c.destination);
      o.start(now);
      o.stop(now + flash + 1.75);
    }
    this.tone("sine", 300, 1400, 0, flash, 0.02);
    this.noise(0.1, flash, 0.02, 2000, "bandpass", 7000);
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.bell(f, flash + i * 0.015, 1.5, 0.045));
    [1568, 2093, 2637, 3136, 4186, 5274].forEach((f, i) => this.tone("sine", f, f, flash + 0.1 + i * 0.06, 0.45, 0.025));
  }
  /** A bowling ball rolling away down its lane for `length` seconds: a low rumble that swells and fades as it goes. */
  rumble(length = 2.4) {
    if (!this.enabled || !this.context) return;
    this.noise(0, length, 0.22, 190, "lowpass", 110);
    this.noise(0.05, length * 0.8, 0.05, 420, "bandpass", 260);
    this.tone("sine", 58, 46, 0, length, 0.05);
  }
  /**
   * Pins scattered by a ball (`strength` 0 to 1): the full crash of a rack going down for a strong hit, a few pins
   * for a lighter one, a pin or two knocking for the knocks after; louder the harder (made by the page until the
   * recordings are ready).
   */
  pins(strength = 1) {
    if (!this.enabled || !this.context) return;
    const s = Math.max(0, Math.min(1, strength)),
      name = s >= 0.55 ? "pins-1" : s >= 0.22 ? "pins-2" : "pins-3";
    if (!this.recording(name, 0.28 + 0.34 * s)) this.knocked(s);
  }
  /** Pins made by the page: hard knocks one after another, with their clatter, dying away. */
  private knocked(strength: number) {
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
  /** An air hockey puck struck by a mallet (`strength` 0 to 1): a hard plastic clack. */
  puck(strength = 0.6) {
    if (!this.recording("puck-1", 0.12 + 0.4 * Math.min(1, strength))) this.plastic();
  }
  /** The puck against a rail: a duller knock. */
  rail(strength = 0.6) {
    if (!this.recording("puck-2", 0.1 + 0.38 * Math.min(1, strength))) this.plastic();
  }
  /** The puck dropping into a goal slot and clattering down the chute under it. */
  slot() {
    if (!this.recording("puck-3", 0.55)) this.plastic();
  }
  /** A basketball against the rim (`strength` 0 to 1): the steel rings over the ball's thump. */
  rim(strength = 0.6) {
    if (!this.recording("hoop-1", 0.14 + 0.42 * Math.min(1, strength))) this.tile(5);
  }
  /** A basketball against the backboard. */
  backboard(strength = 0.6) {
    if (!this.recording("board-1", 0.14 + 0.42 * Math.min(1, strength))) this.cushion(strength);
  }
  /** A basketball bouncing on the floor, or knocking another (`strength` 0 to 1): its thump and the ring of its air. */
  bounce(strength = 0.6) {
    if (!this.recording("bounce-1", 0.06 + 0.46 * Math.min(1, strength))) this.soft(2);
  }
  /** A basketball through the net: the swish of the cords. */
  swish() {
    if (!this.recording("swish-1", 0.5)) this.noise(0, 0.3, 0.06, 3200, "bandpass", 1800);
  }
  /** Balls rolling back down the ramp (`level` 0 to 1, 0 is silence), as long as it is asked for. */
  rolling(level: number) {
    const l = Math.max(0, Math.min(1, level));
    this.hum("roll-1", 0.24 * l, 0.85 + 0.3 * l);
  }
  /** The claw machine's gantry motor (`level` 0 to 1, how fast the trolley goes; 0 is silence), as long as it is asked for. */
  motor(level: number) {
    const l = Math.max(0, Math.min(1, level));
    this.hum("motor-1", l > 0.03 ? 0.1 + 0.18 * l : 0, 0.82 + 0.22 * l);
  }
  /** The claw machine's winch letting the claw down (quicker, higher) or winding it up, as long as it is asked for. */
  winch(level: number, rising = false) {
    this.hum("winch-1", 0.26 * Math.max(0, Math.min(1, level)), rising ? 0.92 : 1.08);
  }
  /** Fires burning in 전술 대전's dungeon (`level` 0 to 1, 0 is silence), as long as it is asked for; made by the page. */
  crackle(level: number) {
    const c = this.context;
    if (c && !samples.has("crackle-0")) samples.set("crackle-0", crackling(c));
    this.hum("crackle-0", 0.14 * Math.max(0, Math.min(1, level)));
  }
  /** The claw's prongs closing on their solenoid (or, softer, opening). */
  clasp(strength = 1) {
    if (!this.recording("clasp-1", 0.2 + 0.32 * Math.min(1, strength), strength < 1 ? 1.15 : 1)) this.knock(1);
  }
  /** A heavy, dull thud: a soft mallet striking a mole. */
  thud() {
    if (this.recording("thud-1", 0.6)) return;
    this.tone("sine", 150, 55, 0, 0.18, 0.3);
    this.noise(0, 0.08, 0.12, 700, "lowpass", 300);
  }
  /** A bow let go (archery): the string's low thrum and the arrow's hiss as it leaves; made by the page, the same each time. */
  bow() {
    this.tone("triangle", 148, 92, 0, 0.24, 0.13);
    this.tone("sine", 74, 52, 0, 0.2, 0.12);
    this.noise(0, 0.05, 0.14, 2400, "bandpass", 900);
    this.noise(0.02, 0.34, 0.05, 5200, "highpass", 3000);
  }
  /** Bamboo striking bronze (투호): a dry wooden clack with a short metallic ping over it; made by the page. */
  clack(strength = 0.6) {
    const s = Math.max(0.15, Math.min(1, strength));
    this.noise(0, 0.035, 0.16 * s, 1900, "bandpass", 1300);
    this.tone("triangle", 720, 540, 0, 0.06, 0.09 * s);
    this.tone("sine", 2380, 2350, 0.003, 0.32, 0.028 * s);
    this.tone("sine", 3710, 3690, 0.003, 0.2, 0.014 * s);
  }
  /** An arrow dropping into a bronze pot (투호): a soft knock deep inside and the hollow body ringing low; made by the page. */
  hollow(strength = 0.6) {
    const s = Math.max(0.3, Math.min(1, strength));
    this.noise(0, 0.05, 0.12 * s, 900, "lowpass", 400);
    this.tone("sine", 196, 188, 0.01, 0.9, 0.11 * s);
    this.tone("sine", 523, 519, 0.01, 0.7, 0.04 * s);
    this.tone("sine", 1131, 1127, 0.01, 0.45, 0.018 * s);
    this.tone("triangle", 98, 96, 0.02, 0.5, 0.05 * s);
  }
  /** A crowd clapping (`strength` 0 to 1, how many and how long), beginning a moment from now; made by the page. */
  applause(strength = 1, after = 0.3) {
    if (!this.enabled || !this.context) return;
    const s = Math.max(0, Math.min(1, strength)),
      claps = Math.round(16 + 44 * s),
      length = 1.1 + 1.3 * s;
    for (let k = 0; k < claps; k++) {
      const at = Math.random() ** 1.5 * length;
      this.noise(after + at, 0.03, (0.045 + 0.04 * s) * (1 - at / (length + 0.4)), 1300 + Math.random() * 1800, "bandpass", 900 + Math.random() * 1200);
    }
  }
  /**
   * 사격, made by the page: a BB rifle's spring-air pop, a shotgun's deep boom or a rifle's sharp crack, each with its
   * echo rolling away over the range or the wood.
   */
  gunshot(kind: "bb" | "shotgun" | "rifle") {
    if (kind === "bb") {
      this.noise(0, 0.05, 0.22, 2600, "bandpass", 1200);
      this.tone("square", 900, 500, 0, 0.03, 0.035);
      this.noise(0.01, 0.12, 0.05, 5000, "highpass", 4000);
      return;
    }
    const big = kind === "shotgun";
    this.noise(0, 0.03, big ? 0.5 : 0.45, big ? 4000 : 5200, "highpass", 2500);
    this.noise(0, big ? 0.2 : 0.13, big ? 0.5 : 0.42, big ? 1000 : 1500, "lowpass", 220);
    this.tone("sine", big ? 95 : 125, 32, 0, big ? 0.36 : 0.24, big ? 0.45 : 0.32);
    this.noise(0.09, big ? 1.2 : 0.9, 0.08, 650, "lowpass", 180);
    this.noise(0.38, 0.7, 0.04, 520, "lowpass", 160);
  }
  /** The trigger pulled on nothing (out, or reloading): a dry metallic click. */
  dryFire() {
    this.tone("square", 2400, 1800, 0, 0.02, 0.045);
    this.noise(0, 0.025, 0.14, 3500, "bandpass", 3000);
  }
  /** Reloading: a BB magazine out and in, a shotgun broken open and shut, a rifle's bolt worked; "done" is the last soft click. */
  reload(kind: "bb" | "shotgun" | "rifle" | "done") {
    const click = (at: number, f: number, v: number) => {
      this.noise(at, 0.03, v, f, "bandpass", f * 0.8);
      this.tone("triangle", f * 0.7, f * 0.55, at, 0.03, v * 0.25);
    };
    if (kind === "done") return click(0, 2600, 0.08);
    if (kind === "bb") {
      click(0, 2200, 0.12);
      click(0.42, 2600, 0.14);
    } else if (kind === "shotgun") {
      click(0, 1500, 0.18);
      this.noise(0.25, 0.22, 0.06, 1800, "bandpass", 900);
      click(0.75, 1300, 0.2);
    } else {
      this.noise(0, 0.12, 0.1, 2000, "bandpass", 3000);
      click(0.06, 2400, 0.12);
      this.noise(0.24, 0.12, 0.1, 3000, "bandpass", 1900);
      click(0.36, 1900, 0.15);
    }
  }
  /** A BB striking plastic or sheet metal: a light, hard tick (`strength` 0 to 1). */
  bbTick(strength = 0.6) {
    const s = Math.max(0.2, Math.min(1, strength));
    this.noise(0, 0.015, 0.18 * s, 5200, "bandpass", 4200);
    this.tone("triangle", 3200, 2600, 0, 0.03, 0.045 * s);
  }
  /** A lit target struck: the machine's bright chime, a third note more for a yellow one (`strength` near 1). */
  ding(strength = 0.6) {
    this.tone("square", 1318.5, 1318.5, 0, 0.09, 0.03);
    this.tone("square", 1760, 1760, 0.07, 0.14, 0.03);
    if (strength > 0.9) this.tone("square", 2637, 2637, 0.14, 0.2, 0.026);
  }
  /** A soft chime: two bell notes a fifth apart, struck lightly and left to ring (a pair matched in mahjong solitaire). */
  chime() {
    this.bell(1046.5, 0, 0.7, 0.03);
    this.bell(1568, 0.06, 0.9, 0.024);
  }
  /** The trap machine throwing a clay: its arm's thump and the spring's twang. */
  trap() {
    this.tone("sine", 160, 70, 0, 0.12, 0.18);
    this.noise(0, 0.1, 0.1, 600, "lowpass", 200);
    this.tone("triangle", 420, 380, 0.01, 0.26, 0.035);
  }
  /** A clay shattering far off: a crisp crack and its pieces tinkling. */
  clayBreak() {
    this.noise(0, 0.08, 0.22, 3200, "highpass", 1800);
    for (let k = 0; k < 6; k++) this.noise(0.03 + k * 0.025, 0.02, 0.05, 4200 + k * 300, "bandpass", 3800);
  }
  /** Birds taking off: a flurry of wing beats fading. */
  flutter() {
    for (let k = 0; k < 9; k++) this.noise(k * 0.065, 0.05, 0.08 * (1 - k / 11), 520 + (k % 3) * 120, "bandpass", 380);
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
  // ─────────────── 슬롯 카 ───────────────
  /** The two motor loops (the people's cars and the computer's pack) share one buffer made by the page. */
  private motorLoops() {
    const c = this.context;
    if (c && !samples.has("whine-0")) {
      const buffer = whining(c);
      samples.set("whine-0", buffer);
      samples.set("whine-1", buffer);
    }
    if (c && !samples.has("screech-0")) samples.set("screech-0", screeching(c));
  }
  /** A person's car's motor (`level` 0 to 1, its speed; 0 is silence): louder and brighter while `pulling` (the pedal held), as long as it is asked for. */
  slotMotor(level: number, pulling: boolean) {
    this.motorLoops();
    const l = Math.max(0, Math.min(1, level));
    this.hum("whine-0", l > 0.02 ? (pulling ? 0.06 + 0.12 * l : 0.03 + 0.05 * l) : 0, 0.42 + 1.55 * l + (pulling ? 0.08 : 0));
  }
  /** My car's tyres at the edge of their grip (`level` 0 to 1; 0 is silence): louder and higher the nearer it is to flying off, as long as it is asked for. */
  slotScreech(level: number) {
    this.motorLoops();
    const l = Math.max(0, Math.min(1, level));
    this.hum("screech-0", l > 0.03 ? 0.04 + 0.2 * l : 0, 0.85 + 0.35 * l);
  }
  /** The computer's cars as one quieter motor (`level` 0 to 1, the fastest of them), as long as it is asked for. */
  slotPack(level: number) {
    this.motorLoops();
    const l = Math.max(0, Math.min(1, level));
    this.hum("whine-1", l > 0.02 ? 0.02 + 0.045 * l : 0, 0.47 + 1.45 * l);
  }
  /** A slot car flying off (`strength` 0 to 1, how fast): the tyres' skid, a knock on the table and the plastic body clattering over. */
  deslot(strength = 0.7) {
    const s = Math.max(0.25, Math.min(1, strength));
    this.noise(0, 0.3, 0.12 * s, 2800, "bandpass", 900);
    this.tone("sine", 190, 70, 0.22, 0.16, 0.16 * s);
    for (let k = 0; k < 5; k++) {
      const at = 0.24 + k * 0.09 + Math.random() * 0.05,
        v = (0.16 - k * 0.025) * s;
      this.noise(at, 0.03, v, 3600 + Math.random() * 1400, "bandpass", 2600);
      this.tone("square", 1700 + Math.random() * 600, 1200, at, 0.03, v * 0.2);
    }
  }
  /** The start lights: a short low beep for each red lamp, a long high one for green. */
  startLight(go: boolean) {
    if (go) this.tone("square", 1318.5, 1318.5, 0, 0.55, 0.045);
    else this.tone("square", 659.25, 659.25, 0, 0.22, 0.04);
  }
  /** A lap counted: the lap counter's two quick blips. */
  lapBeep() {
    this.tone("triangle", 1568, 1568, 0, 0.07, 0.05);
    this.tone("triangle", 2093, 2093, 0.08, 0.1, 0.05);
  }
  // ─────────────── 축구 ───────────────
  /** A football kicked (`strength` 0 to 1): the thump of the leather, a little higher than a basketball's. */
  kickBall(strength = 1) {
    if (!this.recording("bounce-1", 0.16 + 0.34 * Math.min(1, strength), 1.35)) this.soft(2, 0.4);
  }
  /** The ball against the boards (or a wall in the side view): a dull wooden knock. */
  boardKnock(strength = 0.6) {
    if (!this.recording("puck-2", 0.06 + 0.3 * Math.min(1, strength), 0.7)) this.knock(2);
  }
  /** The ball off a post or the crossbar: the ring of the metal. */
  postRing(strength = 0.6) {
    if (!this.recording("hoop-1", 0.12 + 0.36 * Math.min(1, strength), 1.1)) this.tile(5);
  }
  /** The referee's whistle, made by the page: a long blast for the start, two short ones for a kickoff. */
  whistle(long = false) {
    const blast = (at: number, length: number) => {
      // The pea's trill: a tone near 3 kHz shaken quickly, with the breath through it.
      for (let k = 0; k * 0.03 < length; k++) this.tone("sine", 3050 + (k % 2) * 160, 2950 + (k % 2) * 160, at + k * 0.03, 0.04, 0.035);
      this.noise(at, length, 0.035, 3000, "bandpass", 3100);
    };
    if (long) blast(0, 0.75);
    else {
      blast(0, 0.16);
      blast(0.24, 0.32);
    }
  }
  /** A goal: the crowd's roar going up, and its clapping. */
  goalRoar() {
    this.noise(0, 2.4, 0.16, 500, "lowpass", 1100);
    this.noise(0.05, 1.8, 0.07, 1400, "bandpass", 1900);
    this.applause(1, 0.6);
  }
  /** The crowd's murmur (`level` 0 to 1; 0 is silence), as long as it is asked for. */
  crowd(level: number) {
    const c = this.context;
    if (c && !samples.has("murmur-0")) samples.set("murmur-0", murmuring(c));
    this.hum("murmur-0", 0.09 * Math.max(0, Math.min(1, level)), 0.95 + 0.1 * Math.min(1, level));
  }
}
