import type { CityLayout } from '../city/CityLayout';
import type { Pedestrian } from './Pedestrian';

/**
 * Seagull flock system — occasional flocks sweep across the city.
 * Each flock is a group of birds flying in formation with boid behaviours.
 * They fly at altitude with parallax shadows on the ground.
 */

const GULL_BODY = '#f5f5f0';   // white/off-white
const GULL_WING = '#d0d0cc';   // slightly grey wing tips
const GULL_TIPS = '#3a3a3a';   // dark wingtips

export interface Flock {
  birds: Bird[];
  targetX: number;
  targetY: number;
  active: boolean;
  timer: number;
}

// Bird feeder state — occasionally someone tosses crumbs in the plaza
export let birdFeederActive = false;
export let birdFeederX = 0;
export let birdFeederY = 0;
let feederTimer = 0;

export function updateBirdFeeder(layout: CityLayout) {
  if (birdFeederActive) {
    feederTimer--;
    if (feederTimer <= 0) birdFeederActive = false;
  } else if (Math.random() < 0.00008) { // ~every 3 min at 60fps
    const pb = layout.plazaBounds;
    birdFeederX = pb.x + pb.w * 0.3 + Math.random() * pb.w * 0.4;
    birdFeederY = pb.y + pb.h * 0.3 + Math.random() * pb.h * 0.4;
    birdFeederActive = true;
    feederTimer = 1200; // ~20 seconds
  }
}

/** Manage flocks — spawn, update, despawn */
export function createFlock(layout: CityLayout): Flock {
  // Pick an entry edge and exit edge
  const worldW = layout.width;
  const worldH = layout.height;
  const edge = Math.floor(Math.random() * 4);
  let startX: number, startY: number;
  let exitX: number, exitY: number;

  const margin = 150;
  switch (edge) {
    case 0: // from left
      startX = -margin; startY = 100 + Math.random() * (worldH - 200);
      exitX = worldW + margin; exitY = 100 + Math.random() * (worldH - 200);
      break;
    case 1: // from right
      startX = worldW + margin; startY = 100 + Math.random() * (worldH - 200);
      exitX = -margin; exitY = 100 + Math.random() * (worldH - 200);
      break;
    case 2: // from top
      startX = 100 + Math.random() * (worldW - 200); startY = -margin;
      exitX = 100 + Math.random() * (worldW - 200); exitY = worldH + margin;
      break;
    default: // from bottom
      startX = 100 + Math.random() * (worldW - 200); startY = worldH + margin;
      exitX = 100 + Math.random() * (worldW - 200); exitY = -margin;
      break;
  }

  const count = 5 + Math.floor(Math.random() * 8); // 5-12 birds per flock
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    birds.push(new Bird(
      startX + (Math.random() - 0.5) * 60,
      startY + (Math.random() - 0.5) * 60,
    ));
  }

  return {
    birds,
    targetX: exitX,
    targetY: exitY,
    active: true,
    timer: 0,
  };
}

export class Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wingPhase: number;
  size: number;
  height: number; // parallax altitude
  private idOffset: number;
  private soarTimer: number = 0;
  landed: boolean = false;
  landTimer: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.wingPhase = Math.random() * Math.PI * 2;
    this.idOffset = Math.random() * 100;
    this.size = 0.9 + Math.random() * 0.25;
    this.height = 0.5 + Math.random() * 0.4;
  }

  update(flock: Bird[], targetX: number, targetY: number, time: number) {
    if (this.landed) {
      this.landTimer++;
      if (this.landTimer > 300 + Math.random() * 300) {
        this.landed = false;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.height = 0.1;
      }
      return;
    }

    // Rise to altitude
    if (this.height < 0.45) this.height += 0.005;

    // === Boid forces ===
    let sepX = 0, sepY = 0, sepN = 0;
    let aliVx = 0, aliVy = 0, aliN = 0;
    let cohX = 0, cohY = 0, cohN = 0;

    for (const other of flock) {
      if (other === this || other.landed) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 625 && distSq > 0) { // 25px separation
        const dist = Math.sqrt(distSq);
        sepX += dx / dist;
        sepY += dy / dist;
        sepN++;
      }
      if (distSq < 6400) { // 80px alignment
        aliVx += other.vx;
        aliVy += other.vy;
        aliN++;
      }
      if (distSq < 16000) { // 126px cohesion
        cohX += other.x;
        cohY += other.y;
        cohN++;
      }
    }

    let ax = 0, ay = 0;
    const maxForce = 0.01;

    if (sepN > 0) {
      ax += (sepX / sepN) * maxForce * 3;
      ay += (sepY / sepN) * maxForce * 3;
    }
    if (aliN > 0) {
      ax += (aliVx / aliN - this.vx) * maxForce * 2;
      ay += (aliVy / aliN - this.vy) * maxForce * 2;
    }
    if (cohN > 0) {
      const avgX = cohX / cohN;
      const avgY = cohY / cohN;
      ax += (avgX - this.x) * maxForce * 0.005;
      ay += (avgY - this.y) * maxForce * 0.005;
    }

    // Pull toward flock target (exit point) or feeder
    let pullX = targetX, pullY = targetY;
    let pullStrength = 0.4;
    if (birdFeederActive) {
      const fd = Math.hypot(this.x - birdFeederX, this.y - birdFeederY);
      if (fd < 500) {
        pullX = birdFeederX;
        pullY = birdFeederY;
        pullStrength = 1.5;
        // Chance to land near feeder
        if (fd < 80 && Math.random() < 0.008 && !this.landed) {
          this.landed = true;
          this.landTimer = 0;
          this.height = 0;
          this.vx = 0;
          this.vy = 0;
          this.x = birdFeederX + (Math.random() - 0.5) * 40;
          this.y = birdFeederY + (Math.random() - 0.5) * 40;
          return;
        }
      }
    }

    const tDx = pullX - this.x;
    const tDy = pullY - this.y;
    const tD = Math.hypot(tDx, tDy) || 1;
    ax += (tDx / tD) * maxForce * pullStrength;
    ay += (tDy / tD) * maxForce * pullStrength;

    // Wander
    ax += Math.cos(time * 0.15 + this.idOffset * 5) * maxForce * 0.3;
    ay += Math.sin(time * 0.2 + this.idOffset * 7) * maxForce * 0.3;

    this.vx = this.vx * 0.985 + ax;
    this.vy = this.vy * 0.985 + ay;

    // Speed clamp
    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = 0.9;
    const minSpeed = 0.35;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    } else if (speed < minSpeed && speed > 0) {
      this.vx = (this.vx / speed) * minSpeed;
      this.vy = (this.vy / speed) * minSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;

    // Wing flap with soar phases
    this.soarTimer--;
    if (this.soarTimer <= 0) {
      this.wingPhase += 0.1 + speed * 0.06;
      if (Math.random() < 0.004) this.soarTimer = 40 + Math.random() * 50;
    }
  }

  drawShadow(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (this.landed) return;
    const dark = 1 - nightAlpha * 0.5;
    const shadowAlpha = Math.max(0, 0.12 - this.height * 0.06) * dark;
    if (shadowAlpha < 0.005) return;
    const shadowScale = 1 + this.height * 2;
    // Shadow offset increases with height (sun angle effect)
    const offsetY = this.height * 15;
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(this.x + this.height * 5, this.y + offsetY, 6 * shadowScale, 2 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const dark = 1 - nightAlpha * 0.4;
    const s = this.size;
    const heightOffset = this.height * 50;
    ctx.save();
    ctx.translate(this.x, this.y - heightOffset);
    ctx.globalAlpha = dark;

    if (this.landed) {
      // Landed: small perched gull
      ctx.fillStyle = GULL_BODY;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.5 * s, 2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(3 * s, -0.5 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.fill();
      // Beak (yellow-orange)
      ctx.fillStyle = '#e8a030';
      ctx.beginPath();
      ctx.moveTo(4.5 * s, -0.3 * s);
      ctx.lineTo(6 * s, 0);
      ctx.lineTo(4.5 * s, 0.3 * s);
      ctx.fill();
      // Dark wingtip marks
      ctx.fillStyle = GULL_TIPS;
      ctx.beginPath();
      ctx.ellipse(-3 * s, -0.3 * s, 1.5 * s, 0.8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Flying seagull
      const angle = Math.atan2(this.vy, this.vx);
      const hScale = 1 + this.height * 0.25;
      ctx.rotate(angle);
      ctx.scale(hScale, hScale);

      // Body
      ctx.fillStyle = GULL_BODY;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5 * s, 1.8 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(4.5 * s, -0.2 * s, 1.8 * s, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = '#e8a030';
      ctx.beginPath();
      ctx.moveTo(6.2 * s, -0.2 * s);
      ctx.lineTo(8 * s, 0.1 * s);
      ctx.lineTo(6.2 * s, 0.4 * s);
      ctx.fill();

      // Wings — long, gull-like with dark tips
      const flapIntensity = this.soarTimer > 0 ? 0.15 : 0.8;
      const wingFlap = Math.sin(this.wingPhase) * flapIntensity;

      // Left wing
      ctx.fillStyle = GULL_WING;
      ctx.beginPath();
      ctx.moveTo(2 * s, -1.5 * s);
      ctx.quadraticCurveTo(0, (-5 - wingFlap * 4) * s, -4 * s, (-3 - wingFlap * 3) * s);
      ctx.lineTo(-2 * s, -0.5 * s);
      ctx.closePath();
      ctx.fill();
      // Dark wingtip
      ctx.fillStyle = GULL_TIPS;
      ctx.beginPath();
      ctx.moveTo(-3 * s, (-2.5 - wingFlap * 2.5) * s);
      ctx.lineTo(-5.5 * s, (-3.5 - wingFlap * 3) * s);
      ctx.lineTo(-4 * s, (-2 - wingFlap * 2) * s);
      ctx.closePath();
      ctx.fill();

      // Right wing
      ctx.fillStyle = GULL_WING;
      ctx.beginPath();
      ctx.moveTo(2 * s, 1.5 * s);
      ctx.quadraticCurveTo(0, (5 + wingFlap * 4) * s, -4 * s, (3 + wingFlap * 3) * s);
      ctx.lineTo(-2 * s, 0.5 * s);
      ctx.closePath();
      ctx.fill();
      // Dark wingtip
      ctx.fillStyle = GULL_TIPS;
      ctx.beginPath();
      ctx.moveTo(-3 * s, (2.5 + wingFlap * 2.5) * s);
      ctx.lineTo(-5.5 * s, (3.5 + wingFlap * 3) * s);
      ctx.lineTo(-4 * s, (2 + wingFlap * 2) * s);
      ctx.closePath();
      ctx.fill();

      // Tail
      ctx.fillStyle = GULL_BODY;
      ctx.beginPath();
      ctx.moveTo(-4 * s, 0);
      ctx.lineTo(-7 * s, -1.2 * s);
      ctx.lineTo(-6 * s, 0);
      ctx.lineTo(-7 * s, 1.2 * s);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
