// Motes audio: a catch blip, a gold chime, the last-five-seconds tick and the end chord,
// all synthesized through host.audio.out. Peaks stay under −6 dBFS (plan 12.1, loud).

import type { GameHost } from '../../src/games/types.ts';

export class MotesAudio {
  private ctx: AudioContext;
  private out: GainNode | null = null;

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

  private tone(
    f0: number,
    f1: number,
    type: OscillatorType,
    ms: number,
    peak: number,
    attackMs = 6,
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

  catch(): void {
    this.tone(880, 1320, 'sine', 140, 0.22);
  }

  gold(): void {
    this.tone(1046, 1046, 'triangle', 220, 0.2);
    window.setTimeout(() => this.tone(1568, 1568, 'triangle', 320, 0.18), 90);
  }

  tick(): void {
    this.tone(660, 660, 'square', 40, 0.08, 2);
  }

  end(): void {
    this.tone(392, 392, 'sine', 700, 0.16, 20);
    this.tone(523, 523, 'sine', 700, 0.16, 20);
    this.tone(659, 659, 'sine', 700, 0.12, 20);
  }

  destroy(): void {
    this.out?.disconnect();
    this.out = null;
  }
}
