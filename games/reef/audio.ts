// Reef audio, all synthesized through host.audio.out. Plan v2, section 11.14. Peaks under −6 dBFS.

import type { GameHost } from '../../src/games/types.ts';

export class ReefAudio {
  private ctx: AudioContext;
  private out: GainNode | null = null;
  private hum: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private vacuumNode: { osc: OscillatorNode; gain: GainNode; noise: AudioBufferSourceNode } | null =
    null;
  private noiseBuf: AudioBuffer | null = null;

  constructor(host: GameHost) {
    this.ctx = host.audio.ctx;
    if (this.ctx && host.audio.out) {
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(host.audio.out);
    }
  }

  private ready(): boolean {
    return Boolean(this.out) && this.ctx.state === 'running';
  }

  private noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  private tone(
    f0: number,
    f1: number,
    type: OscillatorType,
    ms: number,
    peak: number,
    attackMs = 8,
  ): void {
    if (!this.ready() || !this.out) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + ms / 1000);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attackMs / 1000);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.05);
  }

  private noiseBurst(fromHz: number, toHz: number, ms: number, peak: number, q = 1): void {
    if (!this.ready() || !this.out) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(fromHz, t);
    f.frequency.exponentialRampToValueAtTime(toHz, t + ms / 1000);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + ms / 1000 + 0.02);
  }

  /** Continuous water hum at about −30 dBFS. */
  startHum(): void {
    if (!this.ready() || !this.out || this.hum) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.03;
    src.connect(f).connect(g).connect(this.out);
    src.start();
    this.hum = { src, gain: g };
  }

  stopHum(): void {
    if (!this.hum) return;
    this.hum.src.stop();
    this.hum.src.disconnect();
    this.hum = null;
  }

  sprinkle(): void {
    for (let i = 0; i < 4; i++)
      window.setTimeout(() => this.noiseBurst(3000, 5000, 35, 0.12, 2), i * 30);
  }

  squeegee(speed: number): void {
    this.noiseBurst(800 + speed * 600, 1600 + speed * 900, 90, 0.1, 3);
  }

  vacuum(on: boolean): void {
    if (!this.ready() || !this.out) return;
    if (on && !this.vacuumNode) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.09, this.ctx.currentTime + 0.1);
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noise();
      noise.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 0.7;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.05;
      osc.connect(g).connect(this.out);
      noise.connect(f).connect(ng).connect(this.out);
      osc.start();
      noise.start();
      this.vacuumNode = { osc, gain: g, noise };
    } else if (!on && this.vacuumNode) {
      const v = this.vacuumNode;
      v.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      window.setTimeout(() => {
        v.osc.stop();
        v.noise.stop();
        v.osc.disconnect();
        v.noise.disconnect();
      }, 200);
      this.vacuumNode = null;
    }
  }

  bell(): void {
    if (!this.ready() || !this.out) return;
    const t = this.ctx.currentTime;
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    carrier.frequency.value = 880;
    mod.frequency.value = 880 * 1.4;
    modGain.gain.value = 300;
    mod.connect(modGain).connect(carrier.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    carrier.connect(g).connect(this.out);
    mod.start(t);
    carrier.start(t);
    mod.stop(t + 2.1);
    carrier.stop(t + 2.1);
  }

  pour(): void {
    this.noiseBurst(600, 2400, 900, 0.14, 0.8);
  }

  nuzzle(): void {
    this.tone(520 + Math.random() * 200, 700, 'sine', 90, 0.12, 10);
  }

  eat(): void {
    this.tone(1200, 900, 'triangle', 40, 0.06, 4);
  }

  thud(): void {
    this.tone(120, 60, 'sine', 140, 0.22, 4);
  }

  buy(): void {
    this.tone(660, 990, 'triangle', 120, 0.16);
  }

  sparkle(): void {
    this.tone(1760, 2640, 'sine', 160, 0.1);
  }

  /** The hub's lift chord down a fifth: 261.6 + 349.2 Hz. */
  chord(): void {
    this.tone(261.6, 261.6, 'sine', 700, 0.16, 20);
    this.tone(349.2, 349.2, 'sine', 700, 0.16, 20);
    this.tone(392, 392, 'sine', 700, 0.1, 20);
  }

  destroy(): void {
    this.stopHum();
    this.vacuum(false);
    this.out?.disconnect();
    this.out = null;
  }
}
