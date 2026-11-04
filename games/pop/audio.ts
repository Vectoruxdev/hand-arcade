// Balloon Pop audio: everything is synthesized on host.audio.ctx and routed through one GainNode
// of our own into host.audio.out, never ctx.destination. A pop is a bandpassed noise burst plus a
// quick pitch blip; gold is a two-note chime; a combo is a rising three-note arpeggio; the last
// five seconds tick; the end is a short chord. Every voice peaks at 0.32 or less behind a 0.5
// gain with short envelopes, and pops are spaced 40 ms apart, so the output stays under −6 dBFS
// (plan 12.1, the loud gate). Gold and combo replace the plain pop rather than stack on it.

import type { GameHost } from '../../src/games/types.ts';

export class PopAudio {
  private host: GameHost;
  private ctx: AudioContext | null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPopAt = -Infinity;

  constructor(host: GameHost) {
    this.host = host;
    const ctx = host.audio.ctx as AudioContext | null;
    const dest = host.audio.out as GainNode | null;
    this.ctx = ctx;
    if (ctx && dest) {
      this.out = ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(dest);
      // 100 ms of white noise, made once and reused by every pop.
      const len = Math.ceil(ctx.sampleRate * 0.1);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
  }

  private live(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.ctx || !this.out || this.ctx.state !== 'running' || this.host.audio.muted)
      return null;
    return { ctx: this.ctx, out: this.out };
  }

  private tone(
    f0: number,
    f1: number,
    type: OscillatorType,
    startIn: number,
    ms: number,
    peak: number,
    attackMs = 6,
  ): void {
    const a = this.live();
    if (!a) return;
    const t = a.ctx.currentTime + startIn;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + ms / 1000);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attackMs / 1000);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(g).connect(a.out);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.05);
  }

  private burst(ms: number, peak: number, hz: number, q: number): void {
    const a = this.live();
    if (!a || !this.noise) return;
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = a.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = q;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(filter).connect(g).connect(a.out);
    src.start(t);
    src.stop(t + ms / 1000 + 0.02);
  }

  /** A balloon bursting; `level` scales it when a chime or arpeggio plays alongside. */
  pop(level = 1): void {
    const now = performance.now();
    if (now - this.lastPopAt < 40) return;
    this.lastPopAt = now;
    this.burst(70, 0.32 * level, 1800, 1.4);
    this.tone(620, 1040, 'sine', 0, 80, 0.2 * level, 4);
  }

  /** Two-note chime for a gold balloon. */
  gold(): void {
    this.tone(1046, 1046, 'triangle', 0, 200, 0.24, 8);
    this.tone(1568, 1568, 'triangle', 0.11, 260, 0.22, 8);
  }

  /** Rising three-note arpeggio for a combo. */
  combo(): void {
    this.tone(659, 659, 'sine', 0, 170, 0.18);
    this.tone(784, 784, 'sine', 0.08, 170, 0.18);
    this.tone(988, 988, 'sine', 0.16, 190, 0.18);
  }

  /** A soft tick, once a second through the last five. */
  tick(): void {
    this.tone(660, 660, 'square', 0, 40, 0.08, 2);
  }

  /** The round-end chord. */
  end(): void {
    this.tone(392, 392, 'sine', 0, 700, 0.18, 20);
    this.tone(523, 523, 'sine', 0, 700, 0.16, 20);
    this.tone(659, 659, 'sine', 0, 700, 0.14, 20);
  }

  destroy(): void {
    this.out?.disconnect();
    this.out = null;
    this.noise = null;
  }
}
