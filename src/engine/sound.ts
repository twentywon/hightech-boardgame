// Recorded effects, inlined so nothing is fetched at run time. They are
// Kenney's "Casino Audio" (CC0); see public/sound-license.txt.
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
  /** Stone touching the board. */
  tap() {
    this.tone("triangle", 780, 160, 0, 0.1, 0.08);
  }
  /** Plays one of the recordings whose name starts with `kind`; false when none is ready. */
  private sample(kind: string, volume: number) {
    const c = this.context;
    if (!this.enabled || !c) return true;
    const ready = [...samples.keys()].filter((name) => name.startsWith(`${kind}-`));
    if (!ready.length) return false;
    const source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = samples.get(ready[Math.floor(Math.random() * ready.length)])!;
    // A little pitch variation keeps repeated sounds from feeling mechanical.
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(c.destination);
    source.start();
    return true;
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
  /** A cash machine: the drawer's rattle, then two bright bells. */
  cash() {
    this.noise(0, 0.12, 0.12, 3200, "highpass");
    this.noise(0.1, 0.1, 0.1, 2600, "highpass");
    [1568, 2093].forEach((f, i) => this.tone("triangle", f, f, 0.2 + i * 0.09, 0.5, 0.09));
    this.tone("sine", 3136, 3136, 0.29, 0.6, 0.04);
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
  /** Rising chime for a win or a draw. */
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone("sine", f, f, i * 0.11, 0.32, 0.06),
    );
  }
  /** Falling phrase for a loss against the computer. */
  lose() {
    [392, 330, 262].forEach((f, i) =>
      this.tone("sine", f, f * 0.97, i * 0.16, 0.36, 0.06),
    );
  }
}
