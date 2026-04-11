/// <reference types="vite/client" />
import sfxTrainUrl    from '../assets/sfx-train.mp3?url';
import sfxThunderUrl  from '../assets/sfx-thunder.mp3?url';
import sfxSirenUrl    from '../assets/sfx-siren.mp3?url';

/**
 * Procedural ambient audio engine.
 *
 * Active layers:
 *  • Rain / hail / snow  — filtered pink noise, scales with weather intensity
 *  • Thunder             — MP3 one-shot (falls back to synthesised rumble)
 *  • Fountain water      — white-noise spray, active when jets are running
 *  • Birds               — sparrow chirps, seagull calls, pigeon coos (5am–9pm)
 *  • Train departure     — MP3 one-shot (falls back to synthesised whistle)
 *  • Police siren        — MP3 one-shot (falls back to synthesised sweep)
 *
 * Starts muted — user enables via the Sound toggle in Settings.
 * AudioContext created lazily on first resume() to satisfy browser autoplay policy.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Weather
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;

  // Fountain
  private fountainGain: GainNode | null = null;

  // Birds
  private birdGain: GainNode | null = null;
  private birdTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private birdsActive = false;

  private lastThunderTime = 0;
  private initialised = false;
  private _muted = true;

  // MP3 sound-effect buffers — loaded once after AudioContext is created
  private sfxTrain:   AudioBuffer | null = null;
  private sfxThunder: AudioBuffer | null = null;
  private sfxSiren:   AudioBuffer | null = null;

  // ── Noise generators ────────────────────────────────────────────────────

  private makePinkNoise(duration: number): AudioBuffer {
    const sr = this.ctx!.sampleRate;
    const n = Math.floor(sr * duration);
    const buf = this.ctx!.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) / 7;
      b6 = w * 0.115926;
    }
    return buf;
  }

  private makeWhiteNoise(duration: number): AudioBuffer {
    const sr = this.ctx!.sampleRate;
    const n = Math.floor(sr * duration);
    const buf = this.ctx!.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── Setup audio graph ────────────────────────────────────────────────────

  private setupNodes() {
    const ctx = this.ctx!;

    // Start muted — unmuted via Settings Sound toggle
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(ctx.destination);

    // Rain: pink noise → lowpass filter → rain gain → master
    const rainBuf = this.makePinkNoise(2.5);
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = rainBuf;
    rainSrc.loop = true;

    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = 600;
    this.rainFilter.Q.value = 1.5;

    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;

    rainSrc.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    rainSrc.start();

    // Fountain spray: white noise → highpass 2400 Hz → fountain gain → master
    const fountainBuf = this.makeWhiteNoise(2.0);
    const fountainSrc = ctx.createBufferSource();
    fountainSrc.buffer = fountainBuf;
    fountainSrc.loop = true;
    const fountainHP = ctx.createBiquadFilter();
    fountainHP.type = 'highpass';
    fountainHP.frequency.value = 2400;
    fountainHP.Q.value = 1.0;
    this.fountainGain = ctx.createGain();
    this.fountainGain.gain.value = 0;
    fountainSrc.connect(fountainHP);
    fountainHP.connect(this.fountainGain);
    this.fountainGain.connect(this.masterGain);
    fountainSrc.start();

    // Bird bus
    this.birdGain = ctx.createGain();
    this.birdGain.gain.value = 0;
    this.birdGain.connect(this.masterGain);

    this.initialised = true;
  }

  // ── Bird synthesis ───────────────────────────────────────────────────────

  /** Short sine chirp with upward frequency glide — sparrow / robin style. */
  private chirp(freq: number, when: number, dur = 0.12, freqMult = 1.4, vol = 0.18) {
    if (!this.ctx || !this.birdGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(freq * freqMult, when + dur * 0.5);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(this.birdGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }


  // ── Bird scheduling ──────────────────────────────────────────────────────

  private scheduleBirds() {
    if (!this.ctx || !this.birdsActive) return;
    const now = this.ctx.currentTime;
    const roll = Math.random();

    if (roll < 0.65) {
      // Sparrow / robin cluster: 2–4 chirps
      const freqs = [1800, 2200, 1600, 2600, 1400, 2000];
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const f = freqs[Math.floor(Math.random() * freqs.length)];
        this.chirp(f * (0.85 + Math.random() * 0.3), now + i * (0.07 + Math.random() * 0.09));
      }
    } else {
      // Robin triplet: fast ascending
      const base = 2800 + Math.random() * 400;
      for (let i = 0; i < 3; i++) this.chirp(base * (1 + i * 0.12), now + i * 0.06, 0.08, 1.1, 0.14);
    }

    const delay = 4000 + Math.random() * 7000;
    this.birdTimerHandle = setTimeout(() => this.scheduleBirds(), delay);
  }

  // ── MP3 SFX loader ───────────────────────────────────────────────────────

  /** Fetch + decode the three SFX MP3s after the AudioContext is created. */
  private async loadSfxBuffers() {
    const load = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await this.ctx!.decodeAudioData(await resp.arrayBuffer());
      } catch (e) {
        console.warn('[AudioEngine] SFX load failed:', url, e);
        return null;
      }
    };
    [this.sfxTrain, this.sfxThunder, this.sfxSiren] = await Promise.all([
      load(sfxTrainUrl), load(sfxThunderUrl), load(sfxSirenUrl),
    ]);
  }

  /** Play a decoded AudioBuffer once through the master gain at the given volume. */
  private playSfx(buf: AudioBuffer, gain = 1.0) {
    if (!this.ctx || !this.masterGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.masterGain);
    src.start();
  }

  // ── Sirens ───────────────────────────────────────────────────────────────

  /**
   * Single siren pass — plays once for the vehicle, never repeats.
   * Police: authentic UK siren MP3 (falls back to synthesised two-tone sweep).
   * Ambulance / firetruck: synthesised.
   */
  triggerSiren(type: 'police' | 'ambulance' | 'firetruck' = 'police') {
    if (!this.ctx || !this.masterGain) return;

    if (type === 'police' && this.sfxSiren) {
      this.playSfx(this.sfxSiren, 0.55);
      return;
    }

    // Synthesised fallback (also used for ambulance + firetruck)
    const ctx = this.ctx;
    const t0  = ctx.currentTime;
    const out    = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type  = 'lowpass';
    filter.frequency.value = 1800;
    out.gain.value = 0.18;
    out.connect(filter);
    filter.connect(this.masterGain);

    const tone = (freq: number, start: number, dur: number, endFreq = freq) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type  = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      if (endFreq !== freq) osc.frequency.linearRampToValueAtTime(endFreq, start + dur);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(1, start + 0.04);
      g.gain.setValueAtTime(1, start + dur - 0.06);
      g.gain.linearRampToValueAtTime(0, start + dur);
      osc.connect(g); g.connect(out);
      osc.start(start); osc.stop(start + dur + 0.02);
    };

    if (type === 'ambulance') {
      tone(550, t0 + 0.0,  1.0, 1050);
      tone(1050, t0 + 1.0, 1.0, 550);
    } else {
      // Firetruck: sustained low horn
      tone(280, t0 + 0.0,  1.8, 240);
    }
  }

  // ── Train departure ──────────────────────────────────────────────────────

  /** Authentic narrow-gauge train whistle MP3, falls back to synthesised. */
  triggerTrainDeparture() {
    if (!this.ctx || !this.masterGain) return;

    if (this.sfxTrain) {
      this.playSfx(this.sfxTrain, 0.7);
      return;
    }

    // Synthesised fallback
    const ctx = this.ctx;
    const sr  = ctx.sampleRate;
    const t0  = ctx.currentTime;
    const rDur = 4.0;
    const rBuf = ctx.createBuffer(1, Math.floor(sr * rDur), sr);
    const rD   = rBuf.getChannelData(0);
    for (let i = 0; i < rD.length; i++) rD[i] = Math.random() * 2 - 1;
    const rSrc = ctx.createBufferSource(); rSrc.buffer = rBuf;
    const rFilt = ctx.createBiquadFilter(); rFilt.type = 'bandpass'; rFilt.frequency.value = 80; rFilt.Q.value = 0.8;
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0, t0); rGain.gain.linearRampToValueAtTime(0.4, t0 + 0.8);
    rGain.gain.setValueAtTime(0.4, t0 + 2.0); rGain.gain.exponentialRampToValueAtTime(0.001, t0 + rDur);
    rSrc.connect(rFilt); rFilt.connect(rGain); rGain.connect(this.masterGain);
    rSrc.start(t0); rSrc.stop(t0 + rDur + 0.05);
    const whistleNote = (start: number, dur: number) => {
      [[1.0, 0.55], [2.0, 0.30], [3.0, 0.15]].forEach(([mult, gain]) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(880 * mult, start);
        osc.frequency.linearRampToValueAtTime(880 * mult * 0.97, start + dur);
        g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(gain, start + 0.02);
        g.gain.setValueAtTime(gain, start + dur - 0.05); g.gain.linearRampToValueAtTime(0, start + dur + 0.04);
        osc.connect(g); g.connect(this.masterGain); osc.start(start); osc.stop(start + dur + 0.08);
      });
    };
    whistleNote(t0 + 0.5, 0.32);
    whistleNote(t0 + 1.1, 0.90);
  }

  // ── Thunder ──────────────────────────────────────────────────────────────

  triggerThunder(delay = 0) {
    if (!this.ctx || !this.masterGain || Date.now() - this.lastThunderTime < 3000) return;
    this.lastThunderTime = Date.now();

    if (this.sfxThunder) {
      // Delay the MP3 shot by scheduling a deferred play
      if (delay > 0) {
        setTimeout(() => this.playSfx(this.sfxThunder!, 0.75), delay * 1000);
      } else {
        this.playSfx(this.sfxThunder, 0.75);
      }
      return;
    }

    // Synthesised fallback
    const sr = this.ctx.sampleRate;
    const dur = 1.5;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * (Math.exp(-t * 2.5) + Math.exp(-t * 0.8) * 0.4);
    }
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 150; filter.Q.value = 2;
    const gain = this.ctx.createGain();
    const t0 = this.ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(0.6, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    src.start(t0);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  resume() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.setupNodes();
        this.loadSfxBuffers();
      } catch (e) {
        console.warn('[AudioEngine] AudioContext creation failed.', e);
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  update(
    weatherType: string,
    weatherIntensity: number,
    nightAlpha: number,
    hour: number,
    fountainActive = false,
  ) {
    if (!this.initialised || !this.ctx || !this.rainGain || !this.rainFilter) return;
    const t = this.ctx.currentTime;

    // ── Rain ─────────────────────────────────────────────────────────────────
    let rainTarget = 0;
    let filterFreq = 600;
    switch (weatherType) {
      case 'drizzle':      rainTarget = 0.08 * weatherIntensity; filterFreq = 800;  break;
      case 'rain':         rainTarget = 0.18 * weatherIntensity; filterFreq = 600;  break;
      case 'heavy_rain':   rainTarget = 0.30 * weatherIntensity; filterFreq = 400;  break;
      case 'thunderstorm': rainTarget = 0.35 * weatherIntensity; filterFreq = 350;  break;
      case 'hail':         rainTarget = 0.28 * weatherIntensity; filterFreq = 500;  break;
      case 'snow':
      case 'heavy_snow':   rainTarget = 0.06 * weatherIntensity; filterFreq = 1200; break;
    }
    this.rainGain.gain.setTargetAtTime(rainTarget, t, 0.5);
    this.rainFilter.frequency.setTargetAtTime(filterFreq, t, 0.8);

    // ── Fountain water ────────────────────────────────────────────────────────
    this.fountainGain!.gain.setTargetAtTime(fountainActive ? 0.07 : 0, t, 0.8);

    // ── Birds: active from sunrise to late evening ────────────────────────────
    const shouldBird = hour >= 5 && hour <= 21;
    if (shouldBird && !this.birdsActive) {
      this.birdsActive = true;
      this.birdGain!.gain.setTargetAtTime(1.0, t, 1.0);
      this.scheduleBirds();
    } else if (!shouldBird && this.birdsActive) {
      this.birdsActive = false;
      this.birdGain!.gain.setTargetAtTime(0, t, 1.0);
      if (this.birdTimerHandle !== null) {
        clearTimeout(this.birdTimerHandle);
        this.birdTimerHandle = null;
      }
    }
  }

  /**
   * Mute / unmute with a smooth 150 ms ramp.
   * The AudioContext keeps running when muted so unmute is instant.
   */
  setMuted(muted: boolean) {
    this._muted = muted;
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 1.0, this.ctx.currentTime, 0.15);
  }

  get muted(): boolean { return this._muted; }

  get isActive(): boolean {
    return this.initialised && this.ctx !== null && this.ctx.state !== 'closed';
  }
}
