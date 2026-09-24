/**
 * WebAudio-synthesized SFX. No external audio files.
 * Call sfx.unlock() on first user gesture (browsers require it).
 */
import { loadMuted, saveMuted } from '../utils/storage';

let ctx: AudioContext | null = null;
let muted = loadMuted();

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  slideTo?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur: number, vol: number, cutoff: number): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = c.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
}

export const sfx = {
  /** call from first pointerdown */
  unlock(): void {
    ac();
  },
  isMuted(): boolean {
    return muted;
  },
  setMuted(m: boolean): void {
    muted = m;
    saveMuted(m);
  },
  toggleMuted(): boolean {
    this.setMuted(!muted);
    return muted;
  },

  /** fruit released */
  drop(): void {
    tone(240, 0.14, { type: 'sine', vol: 0.16, slideTo: 130 });
  },
  /** merge — pitch rises with tier */
  merge(tier: number): void {
    const f = 300 + tier * 65;
    tone(f, 0.16, { type: 'triangle', vol: 0.22 });
    tone(f * 1.5, 0.2, { type: 'sine', vol: 0.14, delay: 0.05 });
  },
  button(): void {
    tone(620, 0.07, { type: 'square', vol: 0.07 });
  },
  gameOver(): void {
    [392, 330, 262, 196].forEach((f, i) =>
      tone(f, 0.28, { type: 'sawtooth', vol: 0.1, delay: i * 0.17 }),
    );
  },
  /** soft thud when fruits collide hard (call sparingly) */
  thud(): void {
    tone(95, 0.09, { type: 'sine', vol: 0.1, slideTo: 55 });
  },
  /** quiet squash thump when a fruit lands (paired with the squash tween) */
  land(): void {
    tone(140, 0.08, { type: 'sine', vol: 0.07, slideTo: 80 });
  },
  /** Durian Burst shockwave */
  burst(): void {
    noiseBurst(0.45, 0.5, 900);
    tone(120, 0.4, { type: 'sawtooth', vol: 0.16, slideTo: 40 });
  },
};
