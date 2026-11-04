// The AudioContext owner. Plan v2, section 7.7: four hub sounds, synthesized, no files.
// Games connect to `out`; the hub owns master volume and mute.

export class Audio {
  readonly ctx: AudioContext;
  readonly out: GainNode;
  private master: GainNode;
  private _muted = false;
  private onMuteChange: ((muted: boolean) => void) | null = null;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(this.master);
  }

  /** Suspended until the first click or key; resume() on the Welcome activation. */
  static create(): Audio {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = Ctor ? new Ctor() : (null as unknown as AudioContext);
    return new Audio(ctx);
  }

  get available(): boolean {
    return Boolean(this.ctx);
  }

  async resume(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* needs a user activation; the next click tries again */
      }
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    if (this.ctx) this.master.gain.setTargetAtTime(value ? 0 : 0.8, this.ctx.currentTime, 0.02);
    this.onMuteChange?.(value);
  }

  onMute(cb: (muted: boolean) => void): void {
    this.onMuteChange = cb;
  }

  private tone(
    freqFrom: number,
    freqTo: number,
    type: OscillatorType,
    ms: number,
    peak: number,
    attackMs: number,
  ): void {
    if (!this.ctx || this.ctx.state !== 'running' || this._muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t);
    if (freqTo !== freqFrom) osc.frequency.exponentialRampToValueAtTime(freqTo, t + ms / 1000);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attackMs / 1000);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.05);
  }

  private noiseSweep(fromHz: number, toHz: number, ms: number, peak: number): void {
    if (!this.ctx || this.ctx.state !== 'running' || this._muted) return;
    const t = this.ctx.currentTime;
    const len = Math.ceil((this.ctx.sampleRate * ms) / 1000);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(toHz, t + ms / 1000);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(filter).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + ms / 1000 + 0.02);
  }

  /** sine 520 → 780 Hz glide, 180 ms, −12 dBFS. */
  handFound(): void {
    this.tone(520, 780, 'sine', 180, 0.25, 40);
  }

  /** triangle blip 900 Hz, 60 ms, −10 dBFS. */
  pinch(): void {
    this.tone(900, 900, 'triangle', 60, 0.32, 8);
  }

  /** filtered noise sweep 2 → 6 kHz, 120 ms, −14 dBFS. */
  swipe(): void {
    this.noiseSweep(2000, 6000, 120, 0.2);
  }

  /** two-note sine chord 392 + 523 Hz, 500 ms, −12 dBFS. */
  lift(): void {
    this.tone(392, 392, 'sine', 500, 0.18, 20);
    this.tone(523, 523, 'sine', 500, 0.18, 20);
  }
}
