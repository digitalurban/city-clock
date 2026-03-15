/**
 * Weather system — uses real weather from Open-Meteo API based on user location.
 * Falls back to random cycling if geolocation unavailable.
 * Renders parallax clouds at multiple depth layers, rain particles, and puddle shimmers.
 */

type WeatherType = 'clear' | 'cloudy' | 'rain';

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  opacity: number;
  seed: number;
  layer: number; // 0 = far background, 1 = mid, 2 = near foreground
}

interface Puddle {
  x: number;
  y: number;
  radius: number;
  phase: number;
}

// WMO Weather interpretation codes → WeatherType
function wmoToWeather(code: number): WeatherType {
  // 0-1: clear, 2-3: cloudy, 45-48: fog (cloudy),
  // 51-67: drizzle/rain, 71-77: snow (rain), 80-82: showers, 85-86: snow showers, 95-99: thunderstorm
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'cloudy';
  return 'rain';
}

export class Weather {
  private current: WeatherType = 'clear';
  private targetAlpha: number = 0;      // 0 = clear, 0.5 = cloudy, 1 = rain
  private alpha: number = 0;            // smoothed blend
  private transitionTimer: number = 0;  // frames until next weather change
  private rainDrops: RainDrop[] = [];
  private clouds: Cloud[] = [];
  private puddles: Puddle[] = [];
  private worldW: number = 0;
  private worldH: number = 0;
  private initialised: boolean = false;

  // Real weather from Open-Meteo
  private useRealWeather: boolean = false;
  private realWeatherFetched: boolean = false;
  private fetchTimer: number = 0;
  private userLat: number = 0;
  private userLon: number = 0;
  private cloudCover: number = 0; // 0-100 from API

  constructor() {
    this.transitionTimer = 600 + Math.random() * 1200;
    this.requestGeolocation();
  }

  /** Request user location for real weather */
  private requestGeolocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userLat = pos.coords.latitude;
        this.userLon = pos.coords.longitude;
        this.useRealWeather = true;
        this.fetchWeather();
      },
      () => {
        // Geolocation denied — fall back to random weather cycling
      },
      { timeout: 5000 }
    );
  }

  /** Fetch current weather from Open-Meteo */
  private async fetchWeather() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.userLat}&longitude=${this.userLon}&current=weather_code,cloud_cover`;
      const resp = await fetch(url);
      const data = await resp.json();
      const code = data.current.weather_code as number;
      const cover = data.current.cloud_cover as number;

      this.cloudCover = cover;
      const weatherType = wmoToWeather(code);
      this.current = weatherType;

      if (weatherType === 'clear') {
        this.targetAlpha = 0;
      } else if (weatherType === 'cloudy') {
        // Scale alpha by cloud cover percentage
        this.targetAlpha = 0.2 + (cover / 100) * 0.3;
      } else {
        this.targetAlpha = 0.7 + (cover / 100) * 0.3;
      }

      this.realWeatherFetched = true;
      // Next fetch in 5 minutes (18000 frames at 60fps)
      this.fetchTimer = 18000;
    } catch {
      // Network error — retry in 1 minute
      this.fetchTimer = 3600;
    }
  }

  /** Call once when world dimensions change */
  init(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.initialised = true;

    // Create parallax cloud layers:
    // Layer 0 (far): large, slow, faint — always visible for depth
    // Layer 1 (mid): medium speed/size — visible in all weather
    // Layer 2 (near): faster, smaller, more opaque — more visible when cloudy/rain
    this.clouds = [];
    const layerConfigs = [
      { count: 8, wMin: 150, wMax: 350, hMin: 45, hMax: 80, speedMin: 0.06, speedMax: 0.12, opMin: 0.25, opMax: 0.45 },
      { count: 6, wMin: 100, wMax: 200, hMin: 30, hMax: 55, speedMin: 0.15, speedMax: 0.28, opMin: 0.20, opMax: 0.35 },
      { count: 5, wMin: 60, wMax: 140, hMin: 22, hMax: 40, speedMin: 0.25, speedMax: 0.45, opMin: 0.18, opMax: 0.30 },
    ];

    for (let layer = 0; layer < layerConfigs.length; layer++) {
      const cfg = layerConfigs[layer];
      for (let i = 0; i < cfg.count; i++) {
        this.clouds.push({
          x: Math.random() * worldW,
          y: Math.random() * worldH * 0.6,
          w: cfg.wMin + Math.random() * (cfg.wMax - cfg.wMin),
          h: cfg.hMin + Math.random() * (cfg.hMax - cfg.hMin),
          speed: cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin),
          opacity: cfg.opMin + Math.random() * (cfg.opMax - cfg.opMin),
          seed: Math.random() * 1000,
          layer,
        });
      }
    }

    // Pre-create rain drops (pool — recycled)
    this.rainDrops = [];
    for (let i = 0; i < 300; i++) {
      this.rainDrops.push(this.newDrop());
    }

    // Create puddles at fixed positions (on plazas and sidewalks)
    this.puddles = [];
    for (let i = 0; i < 20; i++) {
      this.puddles.push({
        x: Math.random() * worldW,
        y: Math.random() * worldH,
        radius: 4 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private newDrop(): RainDrop {
    return {
      x: Math.random() * this.worldW,
      y: Math.random() * this.worldH,
      speed: 4 + Math.random() * 3,
      length: 6 + Math.random() * 8,
      opacity: 0.15 + Math.random() * 0.25,
    };
  }

  /** Advance weather state — call once per frame */
  update() {
    if (!this.initialised) return;

    // Smooth transition
    this.alpha += (this.targetAlpha - this.alpha) * 0.005;

    // Real weather: re-fetch every 5 minutes
    if (this.useRealWeather) {
      this.fetchTimer--;
      if (this.fetchTimer <= 0) {
        this.fetchWeather();
      }
    } else {
      // Fallback: random weather cycling
      this.transitionTimer--;
      if (this.transitionTimer <= 0) {
        this.cycleWeather();
      }
    }

    // Animate rain drops
    for (const drop of this.rainDrops) {
      drop.y += drop.speed;
      drop.x += 0.5; // slight wind
      if (drop.y > this.worldH) {
        drop.y = -drop.length;
        drop.x = Math.random() * this.worldW;
      }
    }

    // Animate clouds — different speeds per layer for parallax
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed;
      if (cloud.x > this.worldW + cloud.w) {
        cloud.x = -cloud.w;
        cloud.y = Math.random() * this.worldH * 0.6;
      }
    }
  }

  private cycleWeather() {
    // Weighted random: clear 40%, cloudy 35%, rain 25%
    const roll = Math.random();
    if (roll < 0.40) {
      this.current = 'clear';
      this.targetAlpha = 0;
      this.transitionTimer = 900 + Math.random() * 1800; // 15-45 seconds of clear
    } else if (roll < 0.75) {
      this.current = 'cloudy';
      this.targetAlpha = 0.5;
      this.transitionTimer = 600 + Math.random() * 1200; // 10-30 seconds cloudy
    } else {
      this.current = 'rain';
      this.targetAlpha = 1.0;
      this.transitionTimer = 400 + Math.random() * 800;  // 7-20 seconds of rain
    }
  }

  /** Current weather type */
  get type(): WeatherType { return this.current; }

  /** 0 = clear, 0.5 = cloudy, 1 = full rain — smoothly blended */
  get intensity(): number { return this.alpha; }

  /** Extra darkness from clouds/rain — feed into nightAlpha adjustments */
  get cloudDarkness(): number {
    return this.alpha * 0.12; // up to 12% darker at full rain
  }

  /**
   * Draw weather effects in WORLD space (call with world transform active).
   * Renders parallax clouds at multiple depth layers, rain, and puddle shimmers.
   */
  drawWorldEffects(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (!this.initialised) return;
    const time = Date.now() / 1000;

    // --- Parallax clouds ---
    // Background layer clouds are ALWAYS visible (ambient depth).
    // Mid and near layers become more visible with weather intensity.
    for (const cloud of this.clouds) {
      let layerAlpha: number;
      if (cloud.layer === 0) {
        // Far layer: always clearly visible for ambient sky depth
        layerAlpha = cloud.opacity * (0.7 + this.alpha * 0.3);
      } else if (cloud.layer === 1) {
        // Mid layer: visible in clear, fuller in cloudy
        layerAlpha = cloud.opacity * (0.45 + this.alpha * 0.55);
      } else {
        // Near layer: faint in clear, prominent in cloudy/rain
        layerAlpha = cloud.opacity * (0.15 + this.alpha * 0.85);
      }

      // Reduce at night
      layerAlpha *= (1 - nightAlpha * 0.5);
      if (layerAlpha < 0.01) continue;

      // Cloud color shifts slightly by layer for depth
      const grey = cloud.layer === 0 ? 200 : cloud.layer === 1 ? 185 : 170;

      const cx = cloud.x;
      const cy = cloud.y;
      const hw = cloud.w / 2;
      const hh = cloud.h / 2;

      // --- Seeded PRNG for deterministic cloud shapes ---
      let rngState = cloud.seed * 9301 + 49297;
      const seededRandom = (): number => {
        rngState = (rngState * 9301 + 49297) % 233280;
        return rngState / 233280;
      };

      // Determine cloud type from seed: < 0.35 = flat/stratus, else = puffy/cumulus
      const typeRoll = (cloud.seed % 100) / 100;
      const isStratus = typeRoll < 0.35;

      // Generate 6-10 overlapping lobes for the main cloud body
      const lobeCount = 6 + Math.floor(seededRandom() * 5); // 6-10

      interface Lobe {
        ox: number; oy: number; rx: number; ry: number;
      }
      const lobes: Lobe[] = [];

      for (let i = 0; i < lobeCount; i++) {
        const t = i / (lobeCount - 1); // 0..1 across cloud width
        const xSpread = (t - 0.5) * 2; // -1..1

        let ox: number, oy: number, rx: number, ry: number;

        if (isStratus) {
          // Stratus: wide, flat — lobes spread horizontally with small vertical extent
          ox = xSpread * hw * 0.9;
          oy = (seededRandom() - 0.5) * hh * 0.3;
          rx = hw * (0.3 + seededRandom() * 0.25);
          ry = hh * (0.35 + seededRandom() * 0.2);
        } else {
          // Cumulus: taller center, rounded puffs — lobes arc upward in the middle
          const archRise = (1 - xSpread * xSpread); // parabolic, peaks at center
          ox = xSpread * hw * 0.85;
          oy = -archRise * hh * (0.5 + seededRandom() * 0.4) + (seededRandom() - 0.4) * hh * 0.2;
          rx = hw * (0.25 + seededRandom() * 0.25);
          ry = hh * (0.45 + seededRandom() * 0.35);
        }

        lobes.push({ ox, oy, rx, ry });
      }

      // --- Shadow layer (bottom/darker) ---
      for (const lobe of lobes) {
        const shadowGrey = Math.max(0, grey - 35);
        ctx.fillStyle = `rgba(${shadowGrey}, ${shadowGrey + 3}, ${shadowGrey + 8}, ${layerAlpha * 0.55})`;
        ctx.beginPath();
        ctx.ellipse(
          cx + lobe.ox,
          cy + lobe.oy + hh * 0.18,
          lobe.rx * 0.95,
          lobe.ry * 0.6,
          0, 0, Math.PI * 2
        );
        ctx.fill();
      }

      // --- Main body (mid-tone) ---
      for (const lobe of lobes) {
        ctx.fillStyle = `rgba(${grey}, ${grey + 5}, ${grey + 10}, ${layerAlpha})`;
        ctx.beginPath();
        ctx.ellipse(cx + lobe.ox, cy + lobe.oy, lobe.rx, lobe.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Highlight layer (top/lighter) ---
      for (const lobe of lobes) {
        const hiGrey = Math.min(255, grey + 30);
        ctx.fillStyle = `rgba(${hiGrey}, ${hiGrey + 3}, ${hiGrey + 5}, ${layerAlpha * 0.45})`;
        ctx.beginPath();
        ctx.ellipse(
          cx + lobe.ox - lobe.rx * 0.05,
          cy + lobe.oy - lobe.ry * 0.35,
          lobe.rx * 0.75,
          lobe.ry * 0.45,
          0, 0, Math.PI * 2
        );
        ctx.fill();
      }

      // --- Wispy edges: smaller semi-transparent ellipses around the perimeter ---
      const wispCount = 4 + Math.floor(seededRandom() * 4); // 4-7 wisps
      for (let i = 0; i < wispCount; i++) {
        const angle = seededRandom() * Math.PI * 2;
        const dist = 0.7 + seededRandom() * 0.45;
        const wx = cx + Math.cos(angle) * hw * dist;
        const wy = cy + Math.sin(angle) * hh * dist * 0.6;
        const wr = hw * (0.1 + seededRandom() * 0.15);
        const wry = hh * (0.15 + seededRandom() * 0.12);
        ctx.fillStyle = `rgba(${grey + 10}, ${grey + 15}, ${grey + 18}, ${layerAlpha * (0.15 + seededRandom() * 0.2)})`;
        ctx.beginPath();
        ctx.ellipse(wx, wy, wr, wry, seededRandom() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Cloud shadow on ground with soft gradient ---
      if (cloud.layer <= 1 && layerAlpha > 0.03) {
        const shadowOffsetY = (cloud.layer === 0 ? 80 : 40);
        const shadowScale = cloud.layer === 0 ? 1.2 : 1.0;
        const shadowAlpha = layerAlpha * (cloud.layer === 0 ? 0.04 : 0.06);
        const sx = cx + shadowOffsetY * 0.3;
        const sy = cy + shadowOffsetY;
        const srx = hw * shadowScale;
        const sry = hh * shadowScale * 0.5;

        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(srx, sry));
        grad.addColorStop(0, `rgba(0, 0, 0, ${shadowAlpha})`);
        grad.addColorStop(0.6, `rgba(0, 0, 0, ${shadowAlpha * 0.5})`);
        grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(sx, sy, srx, sry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Rain drops ---
    const rainIntensity = Math.max(0, (this.alpha - 0.4) * 1.67); // 0-1
    if (rainIntensity > 0.01) {
      const dropsToDraw = Math.floor(this.rainDrops.length * rainIntensity);
      ctx.strokeStyle = `rgba(160, 180, 220, ${0.3 * rainIntensity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < dropsToDraw; i++) {
        const d = this.rainDrops[i];
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + 0.5, d.y + d.length);
      }
      ctx.stroke();

      // --- Puddle ripples (during rain) ---
      if (rainIntensity > 0.2) {
        for (const puddle of this.puddles) {
          const ripple = Math.sin(time * 3 + puddle.phase) * 0.5 + 0.5;
          const pa = rainIntensity * 0.12 * ripple;
          ctx.strokeStyle = `rgba(140, 160, 200, ${pa})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(puddle.x, puddle.y, puddle.radius * (0.6 + ripple * 0.4), 0, Math.PI * 2);
          ctx.stroke();
          // Inner ripple
          ctx.beginPath();
          ctx.arc(puddle.x, puddle.y, puddle.radius * 0.3 * (1 + ripple * 0.5), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  /**
   * Draw a screen-space overlay for rain/cloud tint (call after resetting transform).
   * Adds a subtle blue-grey wash during rain.
   */
  drawScreenOverlay(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    if (this.alpha < 0.05) return;
    const tint = Math.min(0.08, this.alpha * 0.08);
    ctx.fillStyle = `rgba(100, 110, 130, ${tint})`;
    ctx.fillRect(0, 0, screenW, screenH);
  }
}
