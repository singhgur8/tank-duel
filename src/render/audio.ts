/**
 * All sounds are synthesised at runtime with WebAudio, so there are no audio files to ship and the game
 * works offline. Each sound is a few oscillators and filtered noise bursts.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  /** Silences gameplay sounds (used for the menu demo) without touching the user's mute setting. */
  suppressed = false;

  /** Must be called from a user gesture on some browsers. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  private ok() {
    return this.ctx && this.master && this.noiseBuf && !this.muted && !this.suppressed;
  }

  private noise(dur: number, filterType: BiquadFilterType, f0: number, f1: number, gain: number, q = 0.8, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  fire(power: number) {
    if (!this.ok()) return;
    this.tone('sine', 140, 40, 0.25, 0.7);
    this.noise(0.18, 'lowpass', 2400, 300, 0.5 + power / 250);
    this.noise(0.05, 'highpass', 3000, 2000, 0.25);
  }

  explosion(radius: number, style: string) {
    if (!this.ok()) return;
    const s = Math.min(1, radius / 140);
    const dur = 0.4 + s * 1.6;
    this.tone('sine', 90 - s * 40, 28, dur * 0.8, 0.6 + s * 0.4);
    this.noise(dur, 'lowpass', 1200 + s * 1800, 60, 0.7 + s * 0.3, 0.6);
    this.noise(0.12 + s * 0.1, 'bandpass', 2500, 600, 0.35, 1);
    if (style === 'plasma') this.tone('sawtooth', 900, 120, 0.35, 0.15);
    if (style === 'ice') this.noise(0.4, 'highpass', 6000, 3000, 0.25, 2);
    if (style === 'nuke') {
      this.noise(2.8, 'lowpass', 500, 40, 0.9, 0.5, 0.15);
      this.tone('sine', 50, 22, 2.5, 0.8, 0.05);
    }
  }

  small() {
    if (!this.ok()) return;
    this.noise(0.14, 'bandpass', 1800, 400, 0.4, 1.2);
  }

  bounce() {
    if (!this.ok()) return;
    this.tone('triangle', 520, 260, 0.12, 0.25);
  }

  dig() {
    if (!this.ok()) return;
    this.noise(0.09, 'lowpass', 700, 200, 0.18);
  }

  laser() {
    if (!this.ok()) return;
    this.tone('sawtooth', 1800, 90, 0.6, 0.25);
    this.tone('square', 900, 60, 0.5, 0.12);
    this.noise(0.5, 'highpass', 5000, 1500, 0.2);
  }

  thud() {
    if (!this.ok()) return;
    this.tone('sine', 110, 40, 0.18, 0.5);
  }

  sizzle() {
    if (!this.ok()) return;
    this.noise(1.6, 'highpass', 3000, 1200, 0.18, 0.5);
    this.noise(0.6, 'lowpass', 900, 200, 0.4);
  }

  dirt() {
    if (!this.ok()) return;
    this.noise(0.5, 'lowpass', 500, 80, 0.5);
  }

  click() {
    if (!this.ok()) return;
    this.tone('square', 1400, 1100, 0.03, 0.05);
  }

  turn() {
    if (!this.ok()) return;
    this.tone('sine', 660, 660, 0.09, 0.12);
    this.tone('sine', 880, 880, 0.12, 0.12, 0.08);
  }

  move() {
    if (!this.ok()) return;
    this.noise(0.35, 'lowpass', 300, 120, 0.25);
  }

  fanfare() {
    if (!this.ok()) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.2, i * 0.13));
  }
}
