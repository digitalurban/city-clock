/**
 * Procedural ambient audio engine.
 *
 * Active layers:
 *  • Rain / hail / snow  — filtered pink noise, scales with weather intensity
 *  • Thunder             — triggered on thunderstorm frames
 *  • Fountain water      — white-noise spray, active when jets are running
 *  • Birds               — sparrow chirps, seagull calls, pigeon coos (5am–9pm)
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

  // ── Sirens ───────────────────────────────────────────────────────────────

  /**
   * One "wee-woo" siren cycle (~2.4 s).
   * Police: classic two-tone (hi→lo→hi); ambulance: slower sweep; firetruck: airhorn blasts.
   */
  triggerSiren(type: 'police' | 'ambulance' | 'firetruck' = 'police') {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.28;
    out.connect(this.masterGain);

    if (type === 'police') {
      // Two-tone warble: 960 Hz and 770 Hz, alternating every 0.4 s, 3 pairs
      const pairs = 3;
      for (let i = 0; i < pairs; i++) {
        [960, 770].forEach((f, j) => {
          const t0 = ctx.currentTime + (i * 0.8) + j * 0.4;
          const osc = ctx.createOscillator();
          const g   = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, t0);
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(1, t0 + 0.03);
          g.gain.setValueAtTime(1, t0 + 0.34);
          g.gain.linearRampToValueAtTime(0, t0 + 0.4);
          osc.connect(g); g.connect(out);
          osc.start(t0); osc.stop(t0 + 0.42);
        });
      }
    } else if (type === 'ambulance') {
      // Slow continuous sweep between 580 Hz and 1100 Hz over 2.4 s, two sweeps
      for (let i = 0; i < 2; i++) {
        const t0 = ctx.currentTime + i * 1.2;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, t0);
        osc.frequency.linearRampToValueAtTime(1100, t0 + 0.6);
        osc.frequency.linearRampToValueAtTime(580,  t0 + 1.2);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(1, t0 + 0.05);
        g.gain.setValueAtTime(1, t0 + 1.1);
        g.gain.linearRampToValueAtTime(0, t0 + 1.2);
        osc.connect(g); g.connect(out);
        osc.start(t0); osc.stop(t0 + 1.22);
      }
    } else {
      // Firetruck: three short airhorn blasts (low, brassy)
      for (let i = 0; i < 3; i++) {
        const t0 = ctx.currentTime + i * 0.7;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 220 + i * 20;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(1, t0 + 0.04);
        g.gain.setValueAtTime(1, t0 + 0.45);
        g.gain.linearRampToValueAtTime(0, t0 + 0.6);
        osc.connect(g); g.connect(out);
        osc.start(t0); osc.stop(t0 + 0.62);
      }
    }

    // Fade the shared output node out after the full sequence
    out.gain.setValueAtTime(0.28, ctx.currentTime + 2.3);
    out.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5);
  }

  // ── Train departure ──────────────────────────────────────────────────────

  /**
   * Steam train pulling away: low rumble building then fading, followed by
   * a short steam-whistle toot.
   */
  triggerTrainDeparture() {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const sr  = ctx.sampleRate;

    // 1. Low rumble — filtered noise, ~2 s build then fade
    const rDur = 3.0;
    const rN   = Math.floor(sr * rDur);
    const rBuf = ctx.createBuffer(1, rN, sr);
    const rD   = rBuf.getChannelData(0);
    for (let i = 0; i < rN; i++) rD[i] = (Math.random() * 2 - 1) * (1 - i / rN * 0.6);
    const rSrc = ctx.createBufferSource();
    rSrc.buffer = rBuf;
    const rFilt = ctx.createBiquadFilter();
    rFilt.type = 'lowpass';
    rFilt.frequency.value = 180;
    rFilt.Q.value = 2.5;
    const rGain = ctx.createGain();
    const t0 = ctx.currentTime;
    rGain.gain.setValueAtTime(0, t0);
    rGain.gain.linearRampToValueAtTime(0.5, t0 + 0.6);
    rGain.gain.setValueAtTime(0.5, t0 + 1.4);
    rGain.gain.exponentialRampToValueAtTime(0.001, t0 + rDur);
    rSrc.connect(rFilt); rFilt.connect(rGain); rGain.connect(this.masterGain);
    rSrc.start(t0); rSrc.stop(t0 + rDur + 0.05);

    // 2. Steam whistle toot — two short sine sweeps at t+0.3 s
    [[880, 740, 0.3], [880, 740, 0.72]].forEach(([fHi, fLo, offset]) => {
      const osc  = ctx.createOscillator();
      const g    = ctx.createGain();
      const tw   = t0 + offset;
      osc.type   = 'sine';
      osc.frequency.setValueAtTime(fHi, tw);
      osc.frequency.exponentialRampToValueAtTime(fLo, tw + 0.28);
      g.gain.setValueAtTime(0, tw);
      g.gain.linearRampToValueAtTime(0.22, tw + 0.03);
      g.gain.setValueAtTime(0.22, tw + 0.22);
      g.gain.linearRampToValueAtTime(0, tw + 0.32);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(tw); osc.stop(tw + 0.35);
    });
  }

  // ── Thunder ──────────────────────────────────────────────────────────────

  triggerThunder(delay = 0) {
    if (!this.ctx || !this.masterGain || Date.now() - this.lastThunderTime < 3000) return;
    this.lastThunderTime = Date.now();
    const sr = this.ctx.sampleRate;
    const dur = 1.5;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * (Math.exp(-t * 2.5) + Math.exp(-t * 0.8) * 0.4);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;
    filter.Q.value = 2;
    const gain = this.ctx.createGain();
    const t0 = this.ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.6, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
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
