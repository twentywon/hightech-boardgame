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
  tap() {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(780, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(160, c.currentTime + 0.065);
    g.gain.setValueAtTime(0.08, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.11);
  }
}
