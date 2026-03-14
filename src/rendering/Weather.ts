/**
 * Weather system — cycles between clear, cloudy, and rain.
 * Renders clouds drifting across the sky, rain particles, and puddle shimmers.
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
}

interface Puddle {
  x: number;
  y: number;
  radius: number;
  phase: number;
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

  constructor() {
    this.transitionTimer = 600 + Math.random() * 1200; // 10-30s before first change
  }

  /** Call once when world dimensions change */
  init(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.initialised = true;

    // Pre-create clouds
    this.clouds = [];
    const numClouds = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numClouds; i++) {
      this.clouds.push({
        x: Math.random() * worldW,
        y: Math.random() * worldH * 0.7,
        w: 60 + Math.random() * 120,
        h: 25 + Math.random() * 35,
        speed: 0.15 + Math.random() * 0.3,
        opacity: 0.15 + Math.random() * 0.2,
        seed: Math.random() * 1000,
      });
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

    // Timer to switch weather
    this.transitionTimer--;
    if (this.transitionTimer <= 0) {
      this.cycleWeather();
    }

    // Animate rain drops
    const rainIntensity = Math.max(0, (this.alpha - 0.5) * 2); // 0-1 (only during rain)
    for (const drop of this.rainDrops) {
      drop.y += drop.speed;
      drop.x += 0.5; // slight wind
      if (drop.y > this.worldH) {
        drop.y = -drop.length;
        drop.x = Math.random() * this.worldW;
      }
    }

    // Animate clouds
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed;
      if (cloud.x > this.worldW + cloud.w) {
        cloud.x = -cloud.w;
        cloud.y = Math.random() * this.worldH * 0.7;
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
   * Renders clouds, rain, and puddle shimmers.
   */
  drawWorldEffects(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (!this.initialised) return;
    const time = Date.now() / 1000;

    // --- Clouds (always present, vary opacity by weather) ---
    const cloudAlpha = this.alpha > 0.1 ? this.alpha : 0;
    if (cloudAlpha > 0.01) {
      for (const cloud of this.clouds) {
        const baseAlpha = cloud.opacity * cloudAlpha * (1 - nightAlpha * 0.5);
        if (baseAlpha < 0.01) continue;

        ctx.fillStyle = `rgba(180, 185, 195, ${baseAlpha})`;
        // Draw cloud as overlapping ellipses
        const cx = cloud.x;
        const cy = cloud.y;
        const hw = cloud.w / 2;
        const hh = cloud.h / 2;

        ctx.beginPath();
        ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - hw * 0.4, cy + hh * 0.2, hw * 0.6, hh * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + hw * 0.35, cy + hh * 0.15, hw * 0.55, hh * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + hw * 0.1, cy - hh * 0.3, hw * 0.5, hh * 0.5, 0, 0, Math.PI * 2);
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
