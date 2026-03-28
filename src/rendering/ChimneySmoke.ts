/**
 * Chimney smoke — soft rising particles from residential rooftop chimneys.
 * More smoke in cold months and at morning/evening heating peaks.
 */

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
}

export class ChimneySmoke {
  private particles: SmokeParticle[] = [];
  private sources: { x: number; y: number }[] = [];
  private emitTimer: number = 0;

  setSources(sources: { x: number; y: number }[]) {
    this.sources = sources;
  }

  update() {
    if (this.sources.length === 0) return;

    const date = new Date();
    const hour = date.getHours() + date.getMinutes() / 60;
    const month = date.getMonth(); // 0 = Jan

    // More smoke in cold months (Oct–Mar), less in summer
    const isCold = month >= 9 || month <= 2;
    const isSummer = month >= 5 && month <= 7;
    // Heating peaks: morning warm-up and evening
    const isPeak = (hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 22);

    let emitChance = isSummer ? 0.06 : isCold ? 0.55 : 0.25;
    if (isPeak) emitChance *= 1.6;

    this.emitTimer++;
    if (this.particles.length < 350 && this.emitTimer >= 3) {
      this.emitTimer = 0;
      const batch = Math.min(6, this.sources.length);
      for (let i = 0; i < batch; i++) {
        if (Math.random() > emitChance) continue;
        const src = this.sources[Math.floor(Math.random() * this.sources.length)];
        this.particles.push({
          x: src.x + 1.5,
          y: src.y,
          vx: (Math.random() - 0.5) * 0.18,
          vy: -(0.22 + Math.random() * 0.18),
          alpha: 0.28 + Math.random() * 0.14,
          size: 1.0 + Math.random() * 0.8,
        });
      }
    }

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx += (Math.random() - 0.5) * 0.025;
      p.vx *= 0.97;
      p.vy *= 0.995;
      p.size += 0.055;
      p.alpha -= 0.0038;
    }
    this.particles = this.particles.filter(p => p.alpha > 0.01);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(185, 178, 172, ${p.alpha})`;
      ctx.fill();
    }
  }
}
