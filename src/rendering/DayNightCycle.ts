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
    // Interpolate between day ground (#d4d8c8) and night ground (#0a0f1a)
    const dayR = 200, dayG = 205, dayB = 195;
    const nightR = 10, nightG = 15, nightB = 26;
    const t = nightAlpha / 0.6; // normalize to 0-1
    const r = Math.floor(dayR + (nightR - dayR) * t);
    const g = Math.floor(dayG + (nightG - dayG) * t);
    const b = Math.floor(dayB + (nightB - dayB) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  drawNightOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, nightAlpha: number) {
    if (nightAlpha < 0.01) return;
    ctx.fillStyle = `rgba(8, 12, 30, ${nightAlpha * 0.4})`;
    ctx.fillRect(0, 0, w, h);
  }
}
