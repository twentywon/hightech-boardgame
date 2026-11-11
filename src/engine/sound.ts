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
