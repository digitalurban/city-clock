/**
 * Procedural ambient audio engine.
 * Rain (filtered pink noise), thunder (on lightning trigger),
 * city hum (low drone), and birdsong (morning 5–9am).
 * AudioContext is created lazily on first resume() call to satisfy
 * browser autoplay policies. All gain changes use exponential ramps
 * to avoid clicks.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private humGain: GainNode | null = null;
  private birdGain: GainNode | null = null;
  private lastThunderTime = 0;
  private initialised = false;

  // Bird scheduling
  private birdTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private birdsActive = false;

  // ── Pink noise ──────────────────────────────────────────────────────────────

  private makePinkNoise(duration = 2.5): AudioBuffer {
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

  // ── Setup audio graph ───────────────────────────────────────────────────────

  private setupNodes() {
    const ctx = this.ctx!;

    // Master
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.7;
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

    // City hum: pink noise → lowpass (120 Hz) → hum gain → master
    const humBuf = this.makePinkNoise(2.5);
    const humSrc = ctx.createBufferSource();
    humSrc.buffer = humBuf;
    humSrc.loop = true;

    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 120;
    humFilter.Q.value = 0.8;

    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.04;

    humSrc.connect(humFilter);
    humFilter.connect(this.humGain);
    this.humGain.connect(this.masterGain);
    humSrc.start();

    // Bird gain bus
    this.birdGain = ctx.createGain();
    this.birdGain.gain.value = 0;
    this.birdGain.connect(this.masterGain);

    this.initialised = true;
  }

  // ── Bird chirps ─────────────────────────────────────────────────────────────

  private chirp(freq: number, when: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.4, when + 0.06);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.15, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(when);
    osc.stop(when + 0.15);
  }

  private scheduleBirds() {
    if (!this.ctx || !this.birdsActive) return;

    const now = this.ctx.currentTime;
    const baseFreqs = [1800, 2200, 1600];
    const count = 2 + Math.floor(Math.random() * 2); // 2-3 chirps
    for (let i = 0; i < count; i++) {
      const baseFreq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)];
      const variation = 0.85 + Math.random() * 0.3;
      this.chirp(baseFreq * variation, now + i * (0.08 + Math.random() * 0.1));
    }

    // Schedule next batch 3-8 seconds later
    const delay = 3000 + Math.random() * 5000;
    this.birdTimerHandle = setTimeout(() => this.scheduleBirds(), delay);
  }

  // ── Thunder ─────────────────────────────────────────────────────────────────

  triggerThunder(delay = 0) {
    if (!this.ctx || Date.now() - this.lastThunderTime < 3000) return;
    this.lastThunderTime = Date.now();
    const sr = this.ctx.sampleRate;
    const dur = 1.5;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const envelope = Math.exp(-t * 2.5) + Math.exp(-t * 0.8) * 0.4;
      d[i] = (Math.random() * 2 - 1) * envelope;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;
    filter.Q.value = 2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(0.6, this.ctx.currentTime + delay + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    src.start(this.ctx.currentTime + delay);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

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
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {/* ignore */});
    }
  }

  update(
    weatherType: string,
    weatherIntensity: number,
    nightAlpha: number,
    hour: number
  ) {
    if (!this.initialised || !this.ctx || !this.rainGain || !this.rainFilter || !this.birdGain) return;

    const t = this.ctx.currentTime;

    // ── Rain gain & filter frequency ────────────────────────────────────────
    let rainTarget = 0;
    let filterFreq = 600;

    switch (weatherType) {
      case 'drizzle':
        rainTarget = 0.08 * weatherIntensity;
        filterFreq = 800;
        break;
      case 'rain':
        rainTarget = 0.18 * weatherIntensity;
        filterFreq = 600;
        break;
      case 'heavy_rain':
        rainTarget = 0.30 * weatherIntensity;
        filterFreq = 400;
        break;
      case 'thunderstorm':
        rainTarget = 0.35 * weatherIntensity;
        filterFreq = 350;
        break;
      case 'hail':
        rainTarget = 0.28 * weatherIntensity;
        filterFreq = 500;
        break;
      case 'snow':
      case 'heavy_snow':
        rainTarget = 0.06 * weatherIntensity;
        filterFreq = 1200;
        break;
      default:
        rainTarget = 0;
        filterFreq = 600;
        break;
    }

    this.rainGain.gain.setTargetAtTime(rainTarget, t, 0.5);
    this.rainFilter.frequency.setTargetAtTime(filterFreq, t, 0.8);

    // ── Birds: active 5 ≤ hour ≤ 9 ─────────────────────────────────────────
    const shouldBird = hour >= 5 && hour <= 9;
    if (shouldBird && !this.birdsActive) {
      this.birdsActive = true;
      this.birdGain.gain.setTargetAtTime(0.8, t, 1.0);
      this.scheduleBirds();
    } else if (!shouldBird && this.birdsActive) {
      this.birdsActive = false;
      this.birdGain.gain.setTargetAtTime(0, t, 1.0);
      if (this.birdTimerHandle !== null) {
        clearTimeout(this.birdTimerHandle);
        this.birdTimerHandle = null;
      }
    }
  }

  setMasterVolume(vol: number) {
    if (!this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx!.currentTime, 0.1);
  }

  get isActive(): boolean {
    return this.initialised && this.ctx !== null && this.ctx.state !== 'closed';
  }
}
