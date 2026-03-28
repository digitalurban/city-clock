export class DayNightCycle {
  getNightAlpha(): number {
    const d = new Date();
    const hour = d.getHours() + d.getMinutes() / 60;

    if (hour >= 8 && hour <= 17) return 0;          // Full day
    if (hour >= 21 || hour <= 5) return 0.6;         // Full night
    if (hour > 5 && hour < 8) return 0.6 * (1 - (hour - 5) / 3);  // Dawn
    if (hour > 17 && hour < 21) return 0.6 * ((hour - 17) / 4);    // Dusk
    return 0;
  }

  getSkyColor(nightAlpha: number): string {
    // Interpolate between day sky (#c8d8e8) and night sky (#050a1a)
    const dayR = 200, dayG = 215, dayB = 230;
    const nightR = 5, nightG = 10, nightB = 26;
    const t = nightAlpha / 0.6; // normalize to 0-1
    const r = Math.floor(dayR + (nightR - dayR) * t);
    const g = Math.floor(dayG + (nightG - dayG) * t);
    const b = Math.floor(dayB + (nightB - dayB) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  }

  drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, nightAlpha: number) {
    if (nightAlpha < 0.15) return;
    const alpha = Math.min(1, (nightAlpha - 0.15) / 0.35); // fade in from dusk
    ctx.save();
    for (let i = 0; i < 180; i++) {
      const sx = this.seededRandom(i * 7 + 1) * w;
      const sy = this.seededRandom(i * 13 + 2) * h * 0.65; // upper portion
      const r = 0.4 + this.seededRandom(i * 17 + 3) * 1.1;
      const brightness = 0.5 + this.seededRandom(i * 11 + 4) * 0.5;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * brightness * 0.85})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMoon(ctx: CanvasRenderingContext2D, w: number, h: number, nightAlpha: number) {
    if (nightAlpha < 0.15) return;
    const alpha = Math.min(1, (nightAlpha - 0.15) / 0.35);
    const moonX = w * 0.82;
    const moonY = h * 0.10;
    const moonR = 16;

    // Moon glow halo
    const halo = ctx.createRadialGradient(moonX, moonY, moonR, moonX, moonY, moonR * 4);
    halo.addColorStop(0, `rgba(220, 240, 255, ${alpha * 0.20})`);
    halo.addColorStop(1, 'rgba(180, 210, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 4, 0, Math.PI * 2);
    ctx.fill();

    // Moon body
    ctx.fillStyle = `rgba(245, 250, 235, ${alpha * 0.92})`;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // Crescent shadow to give 3/4 lit look
    ctx.fillStyle = `rgba(5, 10, 26, ${alpha * 0.88})`;
    ctx.beginPath();
    ctx.arc(moonX - 6, moonY - 1, moonR * 0.82, 0, Math.PI * 2);
    ctx.fill();
  }

  drawNightOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, nightAlpha: number) {
    if (nightAlpha < 0.01) return;
    // Dark blue overlay — strong enough for night feel but not murky
    ctx.fillStyle = `rgba(5, 8, 22, ${nightAlpha * 0.75})`;
    ctx.fillRect(0, 0, w, h);
  }

  /** World-space atmospheric overlays driven by time of day and day of week.
   *  Call in the dynamic render loop (after static canvas, before pedestrians).
   *  w/h should be the world dimensions (layout.width / layout.height).
   */
  drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, nightAlpha: number) {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const day = now.getDay(); // 0 = Sunday

    // --- Morning mist (5–9 am) ---
    // Low-lying fog that burns off as dawn progresses
    if (hour >= 5 && hour < 9) {
      const progress = (hour - 5) / 4; // 0 at 5am → 1 at 9am
      const mistAlpha = Math.pow(1 - progress, 2) * 0.18;
      if (mistAlpha > 0.005) {
        // Denser at ground level, fades toward the top of the frame
        const grad = ctx.createLinearGradient(0, h * 0.25, 0, h);
        grad.addColorStop(0, `rgba(200, 215, 230, 0)`);
        grad.addColorStop(0.45, `rgba(200, 215, 230, ${mistAlpha * 0.5})`);
        grad.addColorStop(1, `rgba(210, 222, 235, ${mistAlpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // --- Golden hour warm glow (17–20 h) ---
    // A gentle amber wash that peaks around 18:00 and fades into dusk
    if (hour >= 17 && hour < 20 && nightAlpha < 0.45) {
      const t = hour < 18.5
        ? (hour - 17) / 1.5   // ramp up
        : (20 - hour) / 1.5;  // ramp down
      const warmAlpha = Math.max(0, Math.min(1, t)) * 0.08 * (1 - nightAlpha * 1.5);
      if (warmAlpha > 0.004) {
        ctx.fillStyle = `rgba(255, 160, 50, ${warmAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // --- Sunday morning quiet (Sun 7–12 h) ---
    // Barely-there cool blue tint — the world feels a little slower
    if (day === 0 && hour >= 7 && hour < 12 && nightAlpha < 0.05) {
      const quietAlpha = Math.min(1, (12 - hour) / 5) * 0.04;
      if (quietAlpha > 0.003) {
        ctx.fillStyle = `rgba(195, 210, 235, ${quietAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
}
