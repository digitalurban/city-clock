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

  /** Seagull: long descending glissando with vibrato. */
  private seagullCall(when: number) {
    if (!this.ctx || !this.birdGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1100, when);
    osc.frequency.exponentialRampToValueAtTime(680, when + 0.6);
    osc.frequency.exponentialRampToValueAtTime(820, when + 0.9);

    const vibLFO = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vibLFO.frequency.value = 7;
    vibGain.gain.value = 22;
    vibLFO.connect(vibGain);
    vibGain.connect(osc.frequency);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.13, when + 0.05);
    env.gain.setValueAtTime(0.13, when + 0.7);
    env.gain.exponentialRampToValueAtTime(0.001, when + 1.0);

    osc.connect(hp);
    hp.connect(env);
    env.connect(this.birdGain);

    vibLFO.start(when); osc.start(when);
    vibLFO.stop(when + 1.1); osc.stop(when + 1.1);
  }

  /** Pigeon coo: low FM tone. */
  private pigeonCoo(when: number) {
    if (!this.ctx || !this.birdGain) return;
    const ctx = this.ctx;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(280, when);
    carrier.frequency.linearRampToValueAtTime(295, when + 0.15);
    carrier.frequency.linearRampToValueAtTime(262, when + 0.42);
    mod.type = 'sine';
    mod.frequency.value = 5;
    modGain.gain.value = 16;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.11, when + 0.05);
    env.gain.setValueAtTime(0.11, when + 0.3);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.5);
    carrier.connect(env);
    env.connect(this.birdGain);

    mod.start(when); carrier.start(when);
    mod.stop(when + 0.6); carrier.stop(when + 0.6);
  }

  // ── Bird scheduling ──────────────────────────────────────────────────────

  private scheduleBirds() {
    if (!this.ctx || !this.birdsActive) return;
    const now = this.ctx.currentTime;
    const roll = Math.random();

    if (roll < 0.40) {
      // Sparrow / robin cluster: 2–4 chirps
      const freqs = [1800, 2200, 1600, 2600, 1400, 2000];
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const f = freqs[Math.floor(Math.random() * freqs.length)];
        this.chirp(f * (0.85 + Math.random() * 0.3), now + i * (0.07 + Math.random() * 0.09));
      }
    } else if (roll < 0.58) {
      // Seagull cry
      this.seagullCall(now + Math.random() * 0.4);
    } else if (roll < 0.76) {
      // Pigeon triple coo
      const gap = 0.58 + Math.random() * 0.3;
      for (let i = 0; i < 3; i++) this.pigeonCoo(now + i * gap);
    } else if (roll < 0.88) {
      // Robin triplet: fast ascending
      const base = 2800 + Math.random() * 400;
      for (let i = 0; i < 3; i++) this.chirp(base * (1 + i * 0.12), now + i * 0.06, 0.08, 1.1, 0.14);
    } else {
      // Double seagull exchange
      this.seagullCall(now);
      this.seagullCall(now + 1.3 + Math.random() * 0.5);
    }

    const delay = 4000 + Math.random() * 7000;
    this.birdTimerHandle = setTimeout(() => this.scheduleBirds(), delay);
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
    this.fountainGain!.gain.setTargetAtTime(fountainActive ? 0.20 : 0, t, 0.8);

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
