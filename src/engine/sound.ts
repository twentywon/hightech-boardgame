export class Sound {
  private context: AudioContext | null = null;
  enabled = true;
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
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
