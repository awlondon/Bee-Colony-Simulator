import type { SimEvent } from '../sim/types';
import type { AudioParams } from './audioParams';

const MUTE_KEY = 'bcs.muted.v1';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

type Ctor = typeof AudioContext;

/**
 * Everything you hear is synthesised: oscillators for wingbeats and crickets, filtered noise for wind
 * and rain, short blips for the interface. No audio files. The context is created on the first user
 * gesture, as browsers require, and every failure is swallowed so the game never depends on sound.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buzzOscA: OscillatorNode | null = null;
  private buzzOscB: OscillatorNode | null = null;
  private buzzFilter: BiquadFilterNode | null = null;
  private buzzGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private cricketGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted: boolean;
  onMuteChanged: ((muted: boolean) => void) | null = null;

  constructor(private storage: StorageLike | null) {
    let m = false;
    try {
      m = storage?.getItem(MUTE_KEY) === '1';
    } catch {
      /* default to sound on */
    }
    this.muted = m;
  }

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Create the audio graph. Safe to call repeatedly; call it from a user gesture. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const AC: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.7;
      master.connect(ctx.destination);
      this.master = master;

      // Wingbeat buzz: two slightly detuned oscillators through a lowpass, wobbled by a 6 Hz LFO.
      const a = ctx.createOscillator();
      a.type = 'sawtooth';
      const b = ctx.createOscillator();
      b.type = 'triangle';
      b.detune.value = 9;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      a.connect(filter);
      b.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.02;
      lfo.connect(lfoDepth);
      lfoDepth.connect(gain.gain);
      a.start();
      b.start();
      lfo.start();
      this.buzzOscA = a;
      this.buzzOscB = b;
      this.buzzFilter = filter;
      this.buzzGain = gain;

      // Wind and rain share one looping noise buffer.
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const mkNoise = (): AudioBufferSourceNode => {
        const s = ctx.createBufferSource();
        s.buffer = noise;
        s.loop = true;
        s.start();
        return s;
      };
      this.noiseBuf = noise;
      const windSrc = mkNoise();
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.5;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      const windLfo = ctx.createOscillator();
      windLfo.frequency.value = 0.12;
      const windLfoDepth = ctx.createGain();
      windLfoDepth.gain.value = 160;
      windLfo.connect(windLfoDepth);
      windLfoDepth.connect(windFilter.frequency);
      windLfo.start();
      this.windGain = windGain;

      const rainSrc = mkNoise();
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'highpass';
      rainFilter.frequency.value = 2200;
      const rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);
      this.rainGain = rainGain;

      // Night crickets: a high tone chopped by a fast LFO, itself fading in and out slowly.
      const cricket = ctx.createOscillator();
      cricket.frequency.value = 4300;
      const chop = ctx.createGain();
      chop.gain.value = 0;
      const chopLfo = ctx.createOscillator();
      chopLfo.type = 'square';
      chopLfo.frequency.value = 17;
      const chopDepth = ctx.createGain();
      chopDepth.gain.value = 0.5;
      chopLfo.connect(chopDepth);
      chopDepth.connect(chop.gain);
      const cricketGain = ctx.createGain();
      cricketGain.gain.value = 0;
      cricket.connect(chop);
      chop.connect(cricketGain);
      cricketGain.connect(master);
      const swell = ctx.createOscillator();
      swell.frequency.value = 0.4;
      const swellDepth = ctx.createGain();
      swellDepth.gain.value = 0.004;
      swell.connect(swellDepth);
      swellDepth.connect(cricketGain.gain);
      cricket.start();
      chopLfo.start();
      swell.start();
      this.cricketGain = cricketGain;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      this.storage?.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
    this.onMuteChanged?.(m);
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  /** Ease every continuous sound toward its target; never jumps, so there are no clicks. */
  update(p: AudioParams): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const ease = 0.12;
    this.buzzOscA?.frequency.setTargetAtTime(p.buzzFreq, t, ease);
    this.buzzOscB?.frequency.setTargetAtTime(p.buzzFreq * 1.005, t, ease);
    this.buzzFilter?.frequency.setTargetAtTime(p.buzzCutoff, t, ease);
    this.buzzGain?.gain.setTargetAtTime(p.buzzGain, t, 0.15);
    this.windGain?.gain.setTargetAtTime(p.windGain, t, 0.5);
    this.rainGain?.gain.setTargetAtTime(p.rainGain, t, 0.5);
    this.cricketGain?.gain.setTargetAtTime(p.cricketGain, t, 1.5);
  }

  private blip(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.05);
  }

  /** A short breathy hiss: the smoker. */
  hiss(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.55);
  }

  click(): void {
    this.blip(820, 0, 0.05, 0.18);
  }

  chirp(): void {
    this.blip(660, 0, 0.09, 0.14);
    this.blip(990, 0.09, 0.12, 0.14);
  }

  alarm(): void {
    this.blip(330, 0, 0.18, 0.2, 'square');
    this.blip(262, 0.2, 0.28, 0.2, 'square');
  }

  good(): void {
    this.blip(523, 0, 0.1, 0.15);
    this.blip(659, 0.1, 0.1, 0.15);
    this.blip(784, 0.2, 0.16, 0.15);
  }

  onEvent(e: SimEvent): void {
    switch (e.kind) {
      case 'waspSpawned':
      case 'pesticideDrift':
      case 'coldSnap':
      case 'starvationWarning':
      case 'queenDied':
      case 'colonyCollapse':
        this.alarm();
        break;
      case 'beekeeperStung':
        this.blip(1200, 0, 0.06, 0.1, 'sawtooth');
        break;
      case 'smokerLit':
        this.hiss();
        break;
      case 'beekeeperRetreated':
        this.alarm();
        break;
      case 'waspRepelled':
      case 'unlock':
        this.good();
        break;
      case 'dancePerformedByPlayer':
        this.chirp();
        break;
      default:
        break;
    }
  }
}
