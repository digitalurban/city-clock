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
    // Splice dead particles in-place (reverse order) to avoid allocating a new array
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].alpha <= 0.01) this.particles.splice(i, 1);
    }
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

export class FactorySmoke {
  private particles: { x: number; y: number; vx: number; vy: number; alpha: number; size: number }[] = [];
  private sources: { x: number; y: number }[] = [];
  private emitTimer: number = 0;

  setSources(sources: { x: number; y: number }[]) { this.sources = sources; }

  update() {
    if (this.sources.length === 0) return;
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    // Factories work 6am–10pm; emit more during those hours
    const working = hour >= 6 && hour < 22;
    const emitChance = working ? 0.75 : 0.15;

    this.emitTimer++;
    if (this.particles.length < 500 && this.emitTimer >= 2) {
      this.emitTimer = 0;
      const batch = Math.min(8, this.sources.length * 2);
      for (let i = 0; i < batch; i++) {
        if (Math.random() > emitChance) continue;
        const src = this.sources[Math.floor(Math.random() * this.sources.length)];
        this.particles.push({
          x: src.x + (Math.random() - 0.5) * 2,
          y: src.y,
          vx: (Math.random() - 0.5) * 0.22,
          vy: -(0.30 + Math.random() * 0.25),
          alpha: 0.38 + Math.random() * 0.18,
          size: 1.5 + Math.random() * 1.2,
        });
      }
    }
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx += (Math.random() - 0.5) * 0.028;
      p.vx *= 0.97;
      p.vy *= 0.994;
      p.size += 0.07;
      p.alpha -= 0.0032;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].alpha <= 0.01) this.particles.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      // Warm mid-grey — industrial but not pitch black
      ctx.fillStyle = `rgba(118, 108, 98, ${p.alpha})`;
      ctx.fill();
    }
  }
}
