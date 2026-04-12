/**
 * Weather system — uses real weather from Open-Meteo API based on user location.
 * Falls back to random cycling if geolocation unavailable.
 * Renders parallax clouds at multiple depth layers, rain particles, and puddle shimmers.
 */

type WeatherType = 'clear' | 'cloudy' | 'drizzle' | 'rain' | 'heavy_rain' | 'snow' | 'heavy_snow' | 'fog' | 'thunderstorm' | 'hail';

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
  isSnow: boolean;
  isHail: boolean;
}

interface HailParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
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
  // Cached offscreen render — rebuilt when cloud moves >4px or grey changes
  cachedCanvas?: HTMLCanvasElement;
  // Pre-rendered black silhouette for the ground shadow. Built alongside
  // cachedCanvas so the shadow draw is a plain drawImage with globalAlpha —
  // ctx.filter='brightness(0)' is software-rendered and kills GPU acceleration.
  cachedShadow?: HTMLCanvasElement;
  cachedGrey?: number;
  cachedX?: number; // x when cache was last built
}

interface Puddle {
  x: number;
  y: number;
  radius: number;
  phase: number;
}

interface SnowPatch {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
}

/** One hourly slot returned by Open-Meteo, trimmed to what the overlay needs. */
export interface HourlyForecast {
  hour: number;       // 0–23 local
  weatherCode: number;
  temp: number;       // °C, rounded to 1 decimal
}

// WMO Weather interpretation codes → WeatherType
function wmoToWeather(code: number): WeatherType {
  // 0-1: clear, 2-3: cloudy, 45-48: fog (cloudy),
  // 51-55: drizzle, 56-57: freezing drizzle (treat as drizzle)
  // 61: rain slight, 63: rain moderate, 65: rain heavy
  // 66-67: freezing rain
  // 71: snow slight, 73: snow moderate, 75: snow heavy
  // 77: snow grains
  // 80-82: rain showers (slight, mod, violent)
  // 85-86: snow showers
  // 95: thunderstorm, 96-99: thunderstorm with hail
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 61 || code === 63 || code === 66 || code === 80 || code === 81) return 'rain';
  if (code === 65 || code === 67 || code === 82) return 'heavy_rain';
  if (code === 71 || code === 73 || code === 77 || code === 85) return 'snow';
  if (code === 75 || code === 86) return 'heavy_snow';
  if (code === 95) return 'thunderstorm';
  if (code >= 96 && code <= 99) return 'hail';

  // default fallback
  return 'rain';
}

export class Weather {
  private current: WeatherType = 'clear';
  private targetAlpha: number = 0;      // 0 = clear, 0.5 = cloudy, 1 = rain/snow/fog intensity
  private alpha: number = 0;            // smoothed blend
  private transitionTimer: number = 0;  // frames until next weather change
  private rainDrops: RainDrop[] = [];
  private hailParticles: HailParticle[] = [];
  private clouds: Cloud[] = [];
  private puddles: Puddle[] = [];
  private snowPatches: SnowPatch[] = [];
  private worldW: number = 0;
  private worldH: number = 0;
  private initialised: boolean = false;

  // Cross-fade transition — fade old weather OUT to near-zero, then switch type and fade IN
  private pendingWeather: WeatherType | null = null;
  private pendingTargetAlpha: number = 0;
  private isFadingOut: boolean = false;

  // Dynamic levels (0 to 1)
  private puddleLevel: number = 0;
  private snowLevel: number = 0;
  private lightningPhase: number = 0;

  // Fog noise system
  private fogNoiseCanvas: HTMLCanvasElement | null = null;
  private fogNoiseCtx: CanvasRenderingContext2D | null = null;
  private fogOffset1 = { x: 0, y: 0 };
  private fogOffset2 = { x: 0, y: 0 };

  // Real weather from Open-Meteo
  public useRealWeather: boolean = false;
  private realWeatherFetched: boolean = false;
  // 30 min × 60 s × 60 fps = 108 000 frames between fetches.
  // Initialised high so the update() loop doesn't double-fetch while the
  // first setLocation() call is already in-flight.
  private fetchTimer: number = 108000;
  private userLat: number = 0;
  private userLon: number = 0;
  private cloudCover: number = 0; // 0-100 from API

  /** Next 12 hourly forecast slots (populated after first fetch). */
  public hourlyForecast: HourlyForecast[] = [];
  /** Incremented each time hourlyForecast is refreshed — lets callers detect changes cheaply. */
  public forecastVersion: number = 0;

  constructor() {
    this.transitionTimer = 12000 + Math.random() * 24000; // 3–10 min before first change
  }

  /** Set location via city name using Open-Meteo Geocoding */
  public async setLocation(city: string) {
    if (!city || city.trim() === '') {
      this.useRealWeather = false;
      return;
    }

    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geoResp = await fetch(geoUrl);
      const geoData = await geoResp.json();

      if (geoData.results && geoData.results.length > 0) {
        this.userLat = geoData.results[0].latitude;
        this.userLon = geoData.results[0].longitude;
        this.useRealWeather = true;
        this.fetchTimer = 108000; // arm the 30-min interval before the async fetch starts
        this.fetchWeather(true); // pass true for instant
        console.log(`Weather location set to: ${geoData.results[0].name}, ${geoData.results[0].country}`);
      } else {
        console.warn(`City not found: ${city}`);
      }
    } catch (e) {
      console.error('Error fetching geocoding:', e);
    }
  }

  /** Fetch current + next-12h hourly weather from Open-Meteo */
  private async fetchWeather(instant: boolean = false) {
    if (!this.useRealWeather) return;
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${this.userLat}&longitude=${this.userLon}` +
        `&current=weather_code,cloud_cover` +
        `&hourly=weather_code,temperature_2m` +
        `&forecast_days=2&timezone=auto`;
      const resp = await fetch(url);
      const data = await resp.json();
      const code = data.current.weather_code as number;
      const cover = data.current.cloud_cover as number;

      this.cloudCover = cover;
      const weatherType = wmoToWeather(code);

      let newAlpha: number;
      if (weatherType === 'clear') {
        newAlpha = 0;
      } else if (weatherType === 'cloudy' || weatherType === 'fog') {
        newAlpha = 0.2 + (cover / 100) * 0.3;
      } else {
        newAlpha = Math.max(0.6, 0.7 + (cover / 100) * 0.3);
      }

      if (instant) {
        this.current = weatherType;
        this.targetAlpha = newAlpha;
        this.alpha = newAlpha;
        this.puddleLevel = ['rain', 'heavy_rain', 'thunderstorm', 'hail'].includes(weatherType) ? 1.0 : (weatherType === 'drizzle' ? 0.4 : 0.0);
        this.snowLevel = ['snow', 'heavy_snow'].includes(weatherType) ? 1.0 : 0.0;
        this.lightningPhase = 0;
      } else {
        this.scheduleWeatherChange(weatherType, newAlpha);
      }

      // Parse next 12 hourly slots starting from the current hour
      if (data.hourly && Array.isArray(data.hourly.time)) {
        const times: string[] = data.hourly.time;
        const codes: number[] = data.hourly.weather_code;
        const temps: number[] = data.hourly.temperature_2m;
        const nowHourStr = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
        // Find the index whose ISO prefix matches the current local hour.
        // The API returns local-time strings when timezone=auto, e.g. "2024-01-15T14:00".
        const nowLocal = new Date();
        const padded = (n: number) => String(n).padStart(2, '0');
        const localHourPrefix =
          `${nowLocal.getFullYear()}-${padded(nowLocal.getMonth() + 1)}-${padded(nowLocal.getDate())}T${padded(nowLocal.getHours())}`;
        let startIdx = times.findIndex(t => t.startsWith(localHourPrefix));
        // Fallback: match against UTC if timezone offset made local prefix miss
        if (startIdx === -1) startIdx = times.findIndex(t => t.startsWith(nowHourStr));
        if (startIdx === -1) startIdx = 0;

        const slots: HourlyForecast[] = [];
        for (let i = startIdx; i < times.length && slots.length < 12; i++) {
          // Parse the hour from the time string "YYYY-MM-DDTHH:00"
          const hour = parseInt(times[i].slice(11, 13), 10);
          slots.push({
            hour,
            weatherCode: codes[i] ?? 0,
            temp: Math.round((temps[i] ?? 0) * 10) / 10,
          });
        }
        this.hourlyForecast = slots;
        this.forecastVersion++;
      }

      this.realWeatherFetched = true;
      // Re-fetch every 30 minutes (108 000 frames at 60 fps) to respect Open-Meteo rate limits
      this.fetchTimer = 108000;
    } catch {
      // Network error — retry in 5 minutes
      this.fetchTimer = 18000;
    }
  }

  /** Call once when world dimensions change */
  init(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.initialised = true;

    // Create parallax cloud layers — Nintendo-style fluffy clouds
    // Layer 0 (far): large, slow — always visible for ambient depth
    // Layer 1 (mid): medium — visible in all weather
    // Layer 2 (near): smaller, faster — more prominent when cloudy/rain
    this.clouds = [];
    const layerConfigs = [
      { count: 10, wMin: 180, wMax: 400, hMin: 55, hMax: 100, speedMin: 0.025, speedMax: 0.05, opMin: 0.35, opMax: 0.55 },
      { count: 8, wMin: 120, wMax: 250, hMin: 40, hMax: 70, speedMin: 0.06, speedMax: 0.11, opMin: 0.30, opMax: 0.50 },
      { count: 6, wMin: 80, wMax: 160, hMin: 28, hMax: 50, speedMin: 0.10, speedMax: 0.19, opMin: 0.25, opMax: 0.45 },
    ];

    for (let layer = 0; layer < layerConfigs.length; layer++) {
      const cfg = layerConfigs[layer];
      for (let i = 0; i < cfg.count; i++) {
        this.clouds.push({
          x: Math.random() * worldW,
          y: Math.random() * worldH * 0.85,
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
    for (let i = 0; i < 2000; i++) { // Increased pool significantly for better density
      this.rainDrops.push(this.newDrop());
    }

    // Pre-create hail particles
    this.hailParticles = [];
    for (let i = 0; i < 150; i++) {
      this.hailParticles.push(this.newHailParticle());
    }

    // Create puddles at fixed positions (on plazas and sidewalks)
    this.puddles = [];
    for (let i = 0; i < 150; i++) { // Much higher density of puddles
      this.puddles.push({
        x: Math.random() * worldW,
        y: Math.random() * worldH,
        radius: 8 + Math.random() * 12, // Bigger puddles
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Create snow patches
    this.snowPatches = [];
    for (let i = 0; i < 40; i++) {
      this.snowPatches.push({
        x: Math.random() * worldW,
        y: Math.random() * worldH,
        radiusX: 10 + Math.random() * 20,
        radiusY: 5 + Math.random() * 10,
        rotation: Math.random() * Math.PI,
      });
    }

    this.buildFogNoise();
  }

  private newDrop(): RainDrop {
    const isSnow = this.current === 'snow' || this.current === 'heavy_snow';
    const isHeavy = this.current === 'heavy_rain' || this.current === 'heavy_snow' || this.current === 'thunderstorm';
    const isDrizzle = this.current === 'drizzle';

    let speed, length, opacity;
    if (isSnow) {
      speed = ((isHeavy ? 2 : 1) + Math.random() * 2) * 0.5;
      length = (isHeavy ? 3 : 2) + Math.random() * 2;
      opacity = isHeavy ? 0.5 + Math.random() * 0.4 : 0.3 + Math.random() * 0.5;
    } else {
      speed = (isDrizzle ? 2 + Math.random() * 2 : (isHeavy ? 6 + Math.random() * 4 : 4 + Math.random() * 3)) * 0.5;
      length = isDrizzle ? 3 + Math.random() * 3 : (isHeavy ? 10 + Math.random() * 12 : 6 + Math.random() * 8);
      opacity = isDrizzle ? 0.1 + Math.random() * 0.15 : (isHeavy ? 0.2 + Math.random() * 0.3 : 0.15 + Math.random() * 0.25);
    }

    return {
      x: Math.random() * this.worldW,
      y: Math.random() * this.worldH,
      speed, length, opacity,
      isSnow: isSnow,
      isHail: this.current === 'hail'
    };
  }

  private newHailParticle(): HailParticle {
    return {
      x: Math.random() * this.worldW,
      y: -Math.random() * 100, // Start above the screen
      vx: (Math.random() - 0.5) * 1,
      vy: 4 + Math.random() * 3,
      life: 1.0 // 1.0 = falling, < 1.0 = bouncing on ground
    };
  }

  /**
   * Schedule a cross-fade to a new weather type.
   * If the type is unchanged, just adjust the target intensity immediately.
   * Otherwise, fade the current weather out to near-zero first, then switch type
   * and fade the new weather in — so particles never pop on/off harshly.
   */
  private scheduleWeatherChange(newType: WeatherType, newTargetAlpha: number) {
    if (newType === this.current) {
      // Same type — just nudge intensity, no cross-fade needed
      this.targetAlpha = newTargetAlpha;
      this.pendingWeather = null;
      this.isFadingOut = false;
      return;
    }
    this.pendingWeather = newType;
    this.pendingTargetAlpha = newTargetAlpha;
    this.isFadingOut = true;
    this.targetAlpha = 0; // begin fading the current weather out
  }

  /** Advance weather state — call once per frame */
  update() {
    if (!this.initialised) return;

    // Phase 1: fading OUT the old weather type — use a moderately fast lerp
    // Phase 2: once switched, fade the new weather IN at the normal slow rate
    const lerpRate = this.isFadingOut ? 0.006 : 0.0025;
    this.alpha += (this.targetAlpha - this.alpha) * lerpRate;

    // When the outgoing weather has faded to near-invisible, flip to the pending type
    if (this.isFadingOut && this.pendingWeather !== null && this.alpha < 0.04) {
      this.current = this.pendingWeather;
      this.targetAlpha = this.pendingTargetAlpha;
      this.pendingWeather = null;
      this.isFadingOut = false;
    }

    // Dynamic puddle and snow level accumulators
    if (this.current === 'rain' || this.current === 'thunderstorm') {
      this.puddleLevel = Math.min(1.0, this.puddleLevel + 0.0005);
    } else if (this.current === 'heavy_rain') {
      this.puddleLevel = Math.min(1.0, this.puddleLevel + 0.001);
    } else if (this.current === 'drizzle') {
      this.puddleLevel = Math.min(0.4, this.puddleLevel + 0.0002);
    } else {
      this.puddleLevel = Math.max(0.0, this.puddleLevel - 0.0002);
    }

    if (this.current === 'snow') {
      this.snowLevel = Math.min(1.0, this.snowLevel + 0.0002);
    } else if (this.current === 'heavy_snow') {
      this.snowLevel = Math.min(1.0, this.snowLevel + 0.0006);
    } else {
      this.snowLevel = Math.max(0.0, this.snowLevel - 0.0001);
    }

    // Lightning driver
    if (this.current === 'thunderstorm' || this.current === 'hail') {
      if (this.lightningPhase <= 0 && Math.random() < 0.005) { // 0.5% chance per frame to strike
        this.lightningPhase = 1.0;
      }
      if (this.lightningPhase > 0) {
        this.lightningPhase -= Math.random() * 0.1 + 0.02; // jagged decay
      }
    } else {
      this.lightningPhase = 0;
    }

    // Real weather: re-fetch every 5 minutes
    if (this.useRealWeather) {
      this.fetchTimer--;
      if (this.fetchTimer <= 0) {
        this.fetchWeather();
      }
    } else {
      // Fallback: random weather cycling — pause timer while a cross-fade is in progress
      // so we don't trigger the next cycle mid-transition
      if (!this.isFadingOut) {
        this.transitionTimer--;
        if (this.transitionTimer <= 0) {
          this.cycleWeather();
        }
      }
    }

    // Animate rain drops — skip entirely when weather is clear (saves iterating 2000 objects)
    const isSnowingStatus = this.current === 'snow' || this.current === 'heavy_snow';
    const isHailingStatus = this.current === 'hail';
    const needsDrops = this.current !== 'clear' && this.alpha > 0.01;
    if (needsDrops) {
      const t = Date.now() / 1000; // compute once, not per-particle
      for (const drop of this.rainDrops) {
        if (drop.isSnow !== isSnowingStatus || drop.isHail !== isHailingStatus) {
          Object.assign(drop, this.newDrop());
        }
        drop.y += drop.speed;
        drop.x += isSnowingStatus ? Math.sin(t + drop.y * 0.05) * 0.75 + 0.25 : 0.25;
        if (drop.y > this.worldH) {
          drop.y = -drop.length;
          drop.x = Math.random() * this.worldW;
        }
      }
    }

    // Animate hail particles
    if (isHailingStatus) {
      for (const hail of this.hailParticles) {
        hail.x += hail.vx;
        hail.y += hail.vy;

        if (hail.life >= 1.0) {
          // Falling phase
          if (hail.y > this.worldH * 0.9 + Math.random() * 100) {
            // Hit the ground
            hail.life = 0.99; // start bouncing/melting phase
            hail.vy = -hail.vy * 0.3; // bounce up slightly
            hail.vx *= 0.5;
          }
        } else {
          // Bouncing / Melting phase
          hail.life -= 0.025; // Quick melt
          hail.vy += 0.25; // Gravity pulls it back down fast
          if (hail.life <= 0) {
            Object.assign(hail, this.newHailParticle());
          }
        }
      }
    }

    // Animate clouds — different speeds per layer for parallax
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed;
      if (cloud.x > this.worldW + cloud.w) {
        cloud.x = -cloud.w;
        cloud.y = Math.random() * this.worldH * 0.85;
      }
    }

    // Animate fog layers
    if (this.current === 'fog') {
      this.fogOffset1.x += 0.12; this.fogOffset1.y += 0.05;
      this.fogOffset2.x -= 0.07; this.fogOffset2.y += 0.09;
    }
  }

  private cycleWeather() {
    // Weighted distribution across all 10 weather types.
    // Rarer events (thunderstorm, hail, heavy snow) are brief; common ones last longer.
    // scheduleWeatherChange fades the current weather out before switching type.
    const roll = Math.random();

    if (roll < 0.28) {
      this.scheduleWeatherChange('clear', 0);
      this.transitionTimer = 18000 + Math.random() * 36000;  // 5–15 min
    } else if (roll < 0.50) {
      this.scheduleWeatherChange('cloudy', 0.4);
      this.transitionTimer = 12000 + Math.random() * 24000;  // 3–10 min
    } else if (roll < 0.64) {
      this.scheduleWeatherChange('drizzle', 0.55);
      this.transitionTimer = 9000  + Math.random() * 15000;  // 2.5–7 min
    } else if (roll < 0.76) {
      this.scheduleWeatherChange('rain', 0.85);
      this.transitionTimer = 6000  + Math.random() * 18000;  // 1.5–6 min
    } else if (roll < 0.84) {
      this.scheduleWeatherChange('fog', 0.45);
      this.transitionTimer = 12000 + Math.random() * 24000;  // 3–10 min
    } else if (roll < 0.90) {
      this.scheduleWeatherChange('heavy_rain', 1.0);
      this.transitionTimer = 4800  + Math.random() * 9600;   // 1.3–4 min
    } else if (roll < 0.94) {
      this.scheduleWeatherChange('snow', 0.80);
      this.transitionTimer = 9000  + Math.random() * 15000;  // 2.5–7 min
    } else if (roll < 0.97) {
      this.scheduleWeatherChange('thunderstorm', 1.0);
      this.transitionTimer = 4800  + Math.random() * 9600;   // 1.3–4 min
    } else if (roll < 0.99) {
      this.scheduleWeatherChange('heavy_snow', 1.0);
      this.transitionTimer = 6000  + Math.random() * 12000;  // 1.7–5 min
    } else {
      this.scheduleWeatherChange('hail', 1.0);
      this.transitionTimer = 2400  + Math.random() * 4800;   // 40s–2 min
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

    // --- Rain / Snow drops ---
    const intensityRaw = Math.max(0, (this.alpha - 0.4) * 1.67); // 0-1
    if (intensityRaw > 0.01 && (this.current === 'rain' || this.current === 'snow' || this.current === 'heavy_rain' || this.current === 'heavy_snow' || this.current === 'thunderstorm' || this.current === 'drizzle' || this.current === 'hail')) {
      const isHeavy = this.current === 'heavy_rain' || this.current === 'heavy_snow' || this.current === 'thunderstorm';
      const isDrizzle = this.current === 'drizzle';
      // More drops for heavy, fewer for drizzle
      let dropsMultiplier = isHeavy ? 2.0 : (isDrizzle ? 0.4 : 1.0);
      const dropsToDraw = Math.floor(this.rainDrops.length * intensityRaw * dropsMultiplier);

      const isSnowingStatus = this.current === 'snow' || this.current === 'heavy_snow';
      // Use a darker blue/grey for rain so it heavily contrasts the light beige plaza!
      ctx.strokeStyle = isSnowingStatus ? `rgba(255, 255, 255, ${Math.min(1.0, 0.8 * intensityRaw + 0.3)})` : `rgba(70, 90, 130, ${Math.min(1.0, 0.8 * intensityRaw + 0.3)})`;
      ctx.lineWidth = isSnowingStatus ? (isHeavy ? 3 : 2) : (isDrizzle ? 1.0 : (isHeavy ? 3 : 2));
      ctx.beginPath();
      for (let i = 0; i < dropsToDraw; i++) {
        const d = this.rainDrops[i];
        if (!d) continue;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + (isSnowingStatus ? Math.sin(time + d.y) * 2 : 0.5), d.y + d.length);
      }
      ctx.stroke();

      // --- Hail Bouncing ---
      if (this.current === 'hail') {
        ctx.fillStyle = `rgba(230, 240, 255, ${0.9 * intensityRaw})`;
        for (const hail of this.hailParticles) {
          ctx.beginPath();
          // Scale size based on life (melts as it bounces)
          const radius = Math.max(0.5, 2 * hail.life);
          ctx.arc(hail.x, hail.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // --- Puddle reflections and ripples (during rain or lingering after) ---
      const pl = this.puddleLevel * Math.max(0, (this.alpha - 0.2) * 1.25);
      if (pl > 0.05 && !isSnowingStatus) {
        for (const puddle of this.puddles) {
          const r = puddle.radius * pl;
          const ripple = Math.sin(time * 3 + puddle.phase) * 0.5 + 0.5;

          // Puddle base — wet reflective surface
          ctx.fillStyle = `rgba(100, 130, 170, ${0.15 * pl})`;
          ctx.beginPath();
          ctx.ellipse(puddle.x, puddle.y, r, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();

          // Sky/building reflection — subtle lighter patch offset upward
          const reflAlpha = pl * 0.12 * (1 - nightAlpha * 0.5);
          if (reflAlpha > 0.01) {
            ctx.fillStyle = `rgba(180, 200, 230, ${reflAlpha})`;
            ctx.beginPath();
            ctx.ellipse(puddle.x, puddle.y - r * 0.15, r * 0.6, r * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            // Tiny building silhouette reflection (dark vertical lines)
            ctx.fillStyle = `rgba(60, 60, 80, ${reflAlpha * 0.5})`;
            const numLines = Math.floor(r / 4);
            for (let i = 0; i < numLines; i++) {
              const lx = puddle.x - r * 0.4 + (r * 0.8 / numLines) * i;
              const lh = 2 + Math.sin(puddle.phase + i) * 1.5;
              ctx.fillRect(lx, puddle.y - r * 0.3, 1, lh);
            }
          }

          // Ripple rings
          const pa = pl * (0.4 + 0.5 * ripple);
          ctx.strokeStyle = `rgba(50, 70, 110, ${pa})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(puddle.x, puddle.y, r * (0.6 + ripple * 0.4), 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(puddle.x, puddle.y, r * 0.3 * (1 + ripple * 0.5), 0, Math.PI * 2);
          ctx.stroke();

          // Occasional splash dots
          if (Math.random() < pl * 0.2) {
            ctx.fillStyle = `rgba(150, 180, 220, ${0.9 * pl})`;
            ctx.beginPath();
            const sx = puddle.x + (Math.random() - 0.5) * r;
            const sy = puddle.y + (Math.random() - 0.5) * r;
            ctx.arc(sx, sy, 1.0 + Math.random(), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // --- Parallax clouds ---
    // Each cloud is rendered once to an offscreen canvas and cached.
    // The cache is only rebuilt when the cloud's colour (grey) changes by >3
    // (i.e. storm intensity shifts), not every frame — eliminating ~200
    // createRadialGradient calls per frame.
    for (const cloud of this.clouds) {
      let layerAlpha: number;
      if (cloud.layer === 0) {
        layerAlpha = cloud.opacity * (0.8 + this.alpha * 0.2);
      } else if (cloud.layer === 1) {
        layerAlpha = cloud.opacity * (0.6 + this.alpha * 0.4);
      } else {
        layerAlpha = cloud.opacity * (0.35 + this.alpha * 0.65);
      }
      layerAlpha *= (1 - nightAlpha * 0.5);
      if (layerAlpha < 0.01) continue;

      const stormDarkness = this.alpha * 80;
      const baseGrey = cloud.layer === 0 ? 200 : cloud.layer === 1 ? 185 : 170;
      const grey = Math.max(70, baseGrey - stormDarkness);

      // Rebuild offscreen cache when grey shifts enough or first time
      if (!cloud.cachedCanvas || cloud.cachedGrey === undefined || Math.abs(grey - cloud.cachedGrey) > 3) {
        const hw = cloud.w / 2;
        const hh = cloud.h / 2;
        const pad = 4;
        const cw = cloud.w + pad * 2;
        const ch = cloud.h + pad * 2;

        // Seeded PRNG — same seed → same puff layout every rebuild
        let rngState = cloud.seed * 9301 + 49297;
        const seededRandom = (): number => {
          rngState = (rngState * 9301 + 49297) % 233280;
          return rngState / 233280;
        };

        // More puffs for a fluffier, more organic silhouette
        const puffCount = 10 + Math.floor(seededRandom() * 5); // 10–14
        const puffs: Array<{ px: number; py: number; r: number }> = [];
        for (let i = 0; i < puffCount; i++) {
          const angle = seededRandom() * Math.PI * 2;
          // Wider spread — puffs reach out to 85% of the half-width
          const dist = seededRandom() * (hw * 0.85);
          const px = Math.cos(angle) * dist;
          const py = Math.sin(angle) * dist * (hh / hw) * 0.7; // flatter vertically
          // Smaller individual puffs so edges are softer and less blobby
          const r = (hh * 0.3) + seededRandom() * (hh * 0.55);
          puffs.push({ px, py, r });
        }

        if (!cloud.cachedCanvas) cloud.cachedCanvas = document.createElement('canvas');
        cloud.cachedCanvas.width = cw;
        cloud.cachedCanvas.height = ch;
        const oc = cloud.cachedCanvas.getContext('2d')!;
        oc.clearRect(0, 0, cw, ch);

        const ox = hw + pad; // offset so cloud centre → canvas centre
        const oy = hh + pad;

        const drawPath = () => {
          oc.beginPath();
          for (const p of puffs) {
            oc.moveTo(ox + p.px + p.r, oy + p.py);
            oc.arc(ox + p.px, oy + p.py, p.r, 0, Math.PI * 2);
          }
        };

        // Base body
        oc.fillStyle = `rgb(${grey + 10}, ${grey + 12}, ${grey + 15})`;
        drawPath();
        oc.fill();

        // Per-puff highlight — softer, wider falloff so edges aren't sharp
        const hiGrey = Math.min(255, grey + 50);
        for (const p of puffs) {
          const grad = oc.createRadialGradient(
            ox + p.px - p.r * 0.25, oy + p.py - p.r * 0.3, p.r * 0.05,
            ox + p.px, oy + p.py, p.r * 1.4  // wider than puff radius → feathered edge
          );
          grad.addColorStop(0,    `rgba(${hiGrey}, ${hiGrey + 3}, ${hiGrey + 8}, 0.75)`);
          grad.addColorStop(0.45, `rgba(${hiGrey}, ${hiGrey + 2}, ${hiGrey + 5}, 0.25)`);
          grad.addColorStop(0.75, `rgba(${grey + 5}, ${grey + 5}, ${grey + 5}, 0.08)`);
          grad.addColorStop(1,    `rgba(${grey}, ${grey}, ${grey}, 0)`);
          oc.fillStyle = grad;
          oc.beginPath();
          oc.arc(ox + p.px, oy + p.py, p.r * 1.1, 0, Math.PI * 2);
          oc.fill();
        }

        // Bottom shadow gradient — darker underside gives 3-D roundness
        const shadowGrey = Math.max(30, grey - 45);
        const bottomGrad = oc.createLinearGradient(0, oy, 0, oy + hh * 0.9);
        bottomGrad.addColorStop(0,   `rgba(${shadowGrey}, ${shadowGrey}, ${shadowGrey + 5}, 0)`);
        bottomGrad.addColorStop(0.6, `rgba(${shadowGrey}, ${shadowGrey}, ${shadowGrey + 5}, 0.18)`);
        bottomGrad.addColorStop(1,   `rgba(${shadowGrey}, ${shadowGrey}, ${shadowGrey + 5}, 0.32)`);
        oc.fillStyle = bottomGrad;
        drawPath();
        oc.fill();

        // Very subtle outline — almost invisible, just rounds the silhouette
        oc.strokeStyle = `rgba(${Math.max(0, grey - 20)}, ${Math.max(0, grey - 15)}, ${Math.max(0, grey - 10)}, 0.12)`;
        oc.lineWidth = 0.8;
        drawPath();
        oc.stroke();

        // Pre-render a black silhouette for the ground shadow.
        // ctx.filter='brightness(0)' is software-rendered and kills GPU accel —
        // instead bake the black shape once here and blit it cheaply each frame.
        if (!cloud.cachedShadow) cloud.cachedShadow = document.createElement('canvas');
        cloud.cachedShadow.width = cw;
        cloud.cachedShadow.height = ch;
        const sc2 = cloud.cachedShadow.getContext('2d')!;
        sc2.clearRect(0, 0, cw, ch);
        sc2.fillStyle = 'rgb(0,0,0)';
        sc2.beginPath();
        for (const p of puffs) {
          sc2.moveTo(ox + p.px + p.r, oy + p.py);
          sc2.arc(ox + p.px, oy + p.py, p.r, 0, Math.PI * 2);
        }
        sc2.fill();

        cloud.cachedGrey = grey;
        cloud.cachedX = cloud.x;
      }

      const hw = cloud.w / 2;
      const hh = cloud.h / 2;
      const pad = 4;

      // Ground shadow — plain drawImage with globalAlpha, no ctx.filter needed
      if (cloud.layer <= 1 && layerAlpha > 0.03 && cloud.cachedShadow) {
        const shadowOffsetY = cloud.layer === 0 ? 80 : 40;
        const shadowAlpha = layerAlpha * (cloud.layer === 0 ? 0.06 : 0.08);
        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.drawImage(cloud.cachedShadow, cloud.x - hw - pad + hw * 0.1, cloud.y - hh - pad + shadowOffsetY);
        ctx.restore();
      }

      // Blit cached cloud — just one drawImage call per cloud per frame
      ctx.save();
      ctx.globalAlpha = layerAlpha;
      ctx.drawImage(cloud.cachedCanvas!, cloud.x - hw - pad, cloud.y - hh - pad);
      ctx.restore();
    }

  }

  /**
   * Draw a screen-space overlay for rain/cloud tint (call after resetting transform).
   * Adds a subtle blue-grey wash during rain, and handles lightning flashes.
   */
  drawScreenOverlay(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    if (this.lightningPhase > 0) {
      // White/blue flash for lightning
      ctx.fillStyle = `rgba(220, 240, 255, ${this.lightningPhase * 0.8})`;
      ctx.fillRect(0, 0, screenW, screenH);
    } else if (this.alpha >= 0.05) {
      const tint = Math.min(0.08, this.alpha * 0.08);

      if (this.current === 'fog') {
        ctx.fillStyle = `rgba(200, 210, 220, ${this.alpha * 0.4})`;
        ctx.fillRect(0, 0, screenW, screenH);
      } else {
        ctx.fillStyle = `rgba(100, 110, 130, ${tint})`;
        ctx.fillRect(0, 0, screenW, screenH);
      }
    }
  }

  private buildFogNoise() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    // Build layered smooth noise using sin/cos octaves
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Two octaves of smooth noise using sin waves
        const v1 = Math.sin(x * 0.04 + 1.3) * Math.cos(y * 0.05 + 0.7);
        const v2 = Math.sin(x * 0.09 - 0.5) * Math.cos(y * 0.08 + 2.1);
        const v3 = Math.sin(x * 0.15 + y * 0.12) * 0.5;
        const n = (v1 * 0.5 + v2 * 0.3 + v3 * 0.2 + 1) * 0.5; // 0-1
        const a = Math.floor(n * 255);
        const idx = (y * size + x) * 4;
        img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = 200;
        img.data[idx + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.fogNoiseCanvas = c;
    this.fogNoiseCtx = ctx;
  }

  drawFogTendrils(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, nightAlpha: number) {
    if (!this.fogNoiseCanvas || this.current !== 'fog' || this.alpha < 0.1) return;
    const fogAlpha = Math.min(1, (this.alpha - 0.1) / 0.35) * 0.55 * (1 - nightAlpha * 0.3);
    if (fogAlpha < 0.01) return;
    ctx.save();
    // Layer 1: slow drift
    ctx.globalAlpha = fogAlpha * 0.6;
    ctx.globalCompositeOperation = 'source-over';
    const n = this.fogNoiseCanvas;
    const sx1 = this.fogOffset1.x % 512;
    const sy1 = this.fogOffset1.y % 512;
    // Tile the noise canvas across the screen
    for (let tx = -512; tx < screenW + 512; tx += 512) {
      for (let ty = -512; ty < screenH + 512; ty += 512) {
        ctx.drawImage(n, tx + sx1, ty + sy1);
      }
    }
    // Layer 2: faster, different direction
    ctx.globalAlpha = fogAlpha * 0.4;
    const sx2 = this.fogOffset2.x % 512;
    const sy2 = this.fogOffset2.y % 512;
    for (let tx = -512; tx < screenW + 512; tx += 512) {
      for (let ty = -512; ty < screenH + 512; ty += 512) {
        ctx.drawImage(n, tx + sx2, ty + sy2);
      }
    }
    ctx.restore();
  }

  drawWetSheen(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cachedGrad?: CanvasGradient | null) {
    const wetness = this.puddleLevel * Math.min(1, this.alpha * 2);
    if (wetness < 0.02) return;
    ctx.save();
    ctx.globalAlpha = wetness * 0.07;
    ctx.globalCompositeOperation = 'source-over';
    // Use caller-supplied cached gradient when available to avoid per-frame allocation
    ctx.fillStyle = cachedGrad ?? ctx.createLinearGradient(0, 0, screenW, 0);
    if (!cachedGrad) {
      const g = ctx.fillStyle as CanvasGradient;
      g.addColorStop(0,   'rgba(100,130,180,0)');
      g.addColorStop(0.3, 'rgba(140,170,220,1)');
      g.addColorStop(0.7, 'rgba(100,130,180,1)');
      g.addColorStop(1,   'rgba(100,130,180,0)');
    }
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.restore();
  }
}
