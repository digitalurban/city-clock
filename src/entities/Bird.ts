import type { CityLayout } from '../city/CityLayout';
import type { Pedestrian } from './Pedestrian';

/**
 * Bird flock systems — seagulls and sparrows sweep across the city.
 * Each flock is a group of birds flying in formation with boid behaviours.
 * They fly at altitude with parallax shadows on the ground.
 */

const GULL_BODY = '#f5f5f0';   // white/off-white
const GULL_WING = '#d0d0cc';   // slightly grey wing tips
const GULL_TIPS = '#3a3a3a';   // dark wingtips

const SPARROW_BODY = '#8b6530'; // warm brown
const SPARROW_BELLY = '#d4b896'; // buff/cream underside
const SPARROW_WING = '#6b4a1e'; // darker brown wing
const SPARROW_STREAK = '#3d2208'; // dark brown streaks/cap

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

/** Create a sparrow flock — flies lower and faster than seagulls */
export function createSparrowFlock(layout: CityLayout): Flock {
  const worldW = layout.width;
  const worldH = layout.height;
  const edge = Math.floor(Math.random() * 4);
  let startX: number, startY: number;
  let exitX: number, exitY: number;

  const margin = 150;
  switch (edge) {
    case 0:
      startX = -margin; startY = 100 + Math.random() * (worldH - 200);
      exitX = worldW + margin; exitY = 100 + Math.random() * (worldH - 200);
      break;
    case 1:
      startX = worldW + margin; startY = 100 + Math.random() * (worldH - 200);
      exitX = -margin; exitY = 100 + Math.random() * (worldH - 200);
      break;
    case 2:
      startX = 100 + Math.random() * (worldW - 200); startY = -margin;
      exitX = 100 + Math.random() * (worldW - 200); exitY = worldH + margin;
      break;
    default:
      startX = 100 + Math.random() * (worldW - 200); startY = worldH + margin;
      exitX = 100 + Math.random() * (worldW - 200); exitY = -margin;
      break;
  }

  const count = 8 + Math.floor(Math.random() * 13); // 8-20 birds, tighter flocks
  const birds: Sparrow[] = [];
  for (let i = 0; i < count; i++) {
    birds.push(new Sparrow(
      startX + (Math.random() - 0.5) * 50,
      startY + (Math.random() - 0.5) * 50,
    ));
  }

  return { birds, targetX: exitX, targetY: exitY, active: true, timer: 0 };
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
  protected idOffset: number;
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

      // Left wing — root moved forward to match mid-body/shoulder
      ctx.fillStyle = GULL_WING;
      ctx.beginPath();
      ctx.moveTo(3 * s, -1.3 * s);
      ctx.quadraticCurveTo(0.5 * s, (-5 - wingFlap * 4) * s, -4 * s, (-3 - wingFlap * 3) * s);
      ctx.lineTo(-1 * s, -0.5 * s);
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

      // Right wing — root moved forward to match mid-body/shoulder
      ctx.fillStyle = GULL_WING;
      ctx.beginPath();
      ctx.moveTo(3 * s, 1.3 * s);
      ctx.quadraticCurveTo(0.5 * s, (5 + wingFlap * 4) * s, -4 * s, (3 + wingFlap * 3) * s);
      ctx.lineTo(-1 * s, 0.5 * s);
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

/**
 * Sparrow — smaller, lower-flying, faster-flapping city birds.
 * Tighter boid radii and rapid wing beats give a distinctly different feel.
 */
export class Sparrow extends Bird {
  constructor(x: number, y: number) {
    super(x, y);
    this.size = 0.45 + Math.random() * 0.2;  // much smaller than seagulls
    this.height = 0.1 + Math.random() * 0.25; // fly lower
  }

  update(flock: Bird[], targetX: number, targetY: number, time: number) {
    if (this.landed) {
      this.landTimer++;
      if (this.landTimer > 200 + Math.random() * 200) {
        this.landed = false;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8;
        this.height = 0.05;
      }
      return;
    }

    // Rise to a lower cruising altitude than seagulls
    if (this.height < 0.25) this.height += 0.004;

    // === Boid forces — tighter radii for sparrow flocking ===
    let sepX = 0, sepY = 0, sepN = 0;
    let aliVx = 0, aliVy = 0, aliN = 0;
    let cohX = 0, cohY = 0, cohN = 0;

    for (const other of flock) {
      if (other === this || other.landed) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 225 && distSq > 0) { // 15px separation (vs 25px gulls)
        const dist = Math.sqrt(distSq);
        sepX += dx / dist;
        sepY += dy / dist;
        sepN++;
      }
      if (distSq < 2500) { // 50px alignment (vs 80px)
        aliVx += other.vx;
        aliVy += other.vy;
        aliN++;
      }
      if (distSq < 4900) { // 70px cohesion (vs 126px)
        cohX += other.x;
        cohY += other.y;
        cohN++;
      }
    }

    let ax = 0, ay = 0;
    const maxForce = 0.013;

    if (sepN > 0) {
      ax += (sepX / sepN) * maxForce * 3;
      ay += (sepY / sepN) * maxForce * 3;
    }
    if (aliN > 0) {
      ax += (aliVx / aliN - this.vx) * maxForce * 2.5;
      ay += (aliVy / aliN - this.vy) * maxForce * 2.5;
    }
    if (cohN > 0) {
      const avgX = cohX / cohN;
      const avgY = cohY / cohN;
      ax += (avgX - this.x) * maxForce * 0.008;
      ay += (avgY - this.y) * maxForce * 0.008;
    }

    // Pull toward exit target or feeder
    let pullX = targetX, pullY = targetY;
    let pullStrength = 0.5;
    if (birdFeederActive) {
      const fd = Math.hypot(this.x - birdFeederX, this.y - birdFeederY);
      if (fd < 400) {
        pullX = birdFeederX;
        pullY = birdFeederY;
        pullStrength = 2.0; // sparrows love seed
        if (fd < 60 && Math.random() < 0.012 && !this.landed) {
          this.landed = true;
          this.landTimer = 0;
          this.height = 0;
          this.vx = 0;
          this.vy = 0;
          this.x = birdFeederX + (Math.random() - 0.5) * 30;
          this.y = birdFeederY + (Math.random() - 0.5) * 30;
          return;
        }
      }
    }

    const tDx = pullX - this.x;
    const tDy = pullY - this.y;
    const tD = Math.hypot(tDx, tDy) || 1;
    ax += (tDx / tD) * maxForce * pullStrength;
    ay += (tDy / tD) * maxForce * pullStrength;

    // More erratic wander than seagulls
    ax += Math.cos(time * 0.25 + this.idOffset * 5) * maxForce * 0.5;
    ay += Math.sin(time * 0.3 + this.idOffset * 7) * maxForce * 0.5;

    this.vx = this.vx * 0.982 + ax;
    this.vy = this.vy * 0.982 + ay;

    // Faster speed range
    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = 1.3;
    const minSpeed = 0.55;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    } else if (speed < minSpeed && speed > 0) {
      this.vx = (this.vx / speed) * minSpeed;
      this.vy = (this.vy / speed) * minSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;

    // Rapid flutter — sparrows don't really soar
    this.wingPhase += 0.18 + speed * 0.12;
  }

  drawShadow(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (this.landed) return;
    const dark = 1 - nightAlpha * 0.5;
    const shadowAlpha = Math.max(0, 0.1 - this.height * 0.08) * dark;
    if (shadowAlpha < 0.005) return;
    const shadowScale = 1 + this.height * 1.5;
    const offsetY = this.height * 10;
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(this.x + this.height * 4, this.y + offsetY, 3.5 * shadowScale, 1.2 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const dark = 1 - nightAlpha * 0.4;
    const s = this.size;
    const heightOffset = this.height * 40; // lower parallax than seagulls
    ctx.save();
    ctx.translate(this.x, this.y - heightOffset);
    ctx.globalAlpha = dark;

    if (this.landed) {
      // Perched sparrow — compact round body
      ctx.fillStyle = SPARROW_BODY;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3 * s, 2.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Buff belly
      ctx.fillStyle = SPARROW_BELLY;
      ctx.beginPath();
      ctx.ellipse(0.5 * s, 0.5 * s, 1.8 * s, 1.4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.fillStyle = SPARROW_BODY;
      ctx.beginPath();
      ctx.arc(2.5 * s, -0.8 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.fill();
      // Crown streak
      ctx.fillStyle = SPARROW_STREAK;
      ctx.beginPath();
      ctx.ellipse(2.5 * s, -1.5 * s, 0.6 * s, 0.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Short stubby beak
      ctx.fillStyle = '#a08040';
      ctx.beginPath();
      ctx.moveTo(4 * s, -0.7 * s);
      ctx.lineTo(5.2 * s, -0.4 * s);
      ctx.lineTo(4 * s, -0.1 * s);
      ctx.fill();
    } else {
      // Flying sparrow
      const angle = Math.atan2(this.vy, this.vx);
      const hScale = 1 + this.height * 0.2;
      ctx.rotate(angle);
      ctx.scale(hScale, hScale);

      // Body — plump oval
      ctx.fillStyle = SPARROW_BODY;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4 * s, 1.6 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // Buff belly stripe
      ctx.fillStyle = SPARROW_BELLY;
      ctx.beginPath();
      ctx.ellipse(0.5 * s, 0.3 * s, 2.5 * s, 1 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.fillStyle = SPARROW_BODY;
      ctx.beginPath();
      ctx.arc(3.5 * s, -0.2 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.fill();
      // Crown/streak
      ctx.fillStyle = SPARROW_STREAK;
      ctx.beginPath();
      ctx.arc(3.5 * s, -1 * s, 0.7 * s, 0, Math.PI * 2);
      ctx.fill();

      // Short stubby beak
      ctx.fillStyle = '#a08040';
      ctx.beginPath();
      ctx.moveTo(5 * s, -0.2 * s);
      ctx.lineTo(6.5 * s, 0.1 * s);
      ctx.lineTo(5 * s, 0.5 * s);
      ctx.fill();

      // Wings — short and rounded, rapid flutter
      const wingFlap = Math.sin(this.wingPhase) * 0.9;

      // Left wing
      ctx.fillStyle = SPARROW_WING;
      ctx.beginPath();
      ctx.moveTo(2 * s, -1 * s);
      ctx.quadraticCurveTo(0, (-4 - wingFlap * 3) * s, -2.5 * s, (-2 - wingFlap * 2.5) * s);
      ctx.lineTo(-0.5 * s, -0.4 * s);
      ctx.closePath();
      ctx.fill();
      // Wing streak
      ctx.fillStyle = SPARROW_STREAK;
      ctx.beginPath();
      ctx.moveTo(1.5 * s, -1 * s);
      ctx.lineTo(-0.5 * s, (-3.5 - wingFlap * 2.5) * s);
      ctx.lineTo(0.5 * s, (-3 - wingFlap * 2) * s);
      ctx.closePath();
      ctx.fill();

      // Right wing
      ctx.fillStyle = SPARROW_WING;
      ctx.beginPath();
      ctx.moveTo(2 * s, 1 * s);
      ctx.quadraticCurveTo(0, (4 + wingFlap * 3) * s, -2.5 * s, (2 + wingFlap * 2.5) * s);
      ctx.lineTo(-0.5 * s, 0.4 * s);
      ctx.closePath();
      ctx.fill();
      // Wing streak
      ctx.fillStyle = SPARROW_STREAK;
      ctx.beginPath();
      ctx.moveTo(1.5 * s, 1 * s);
      ctx.lineTo(-0.5 * s, (3.5 + wingFlap * 2.5) * s);
      ctx.lineTo(0.5 * s, (3 + wingFlap * 2) * s);
      ctx.closePath();
      ctx.fill();

      // Short rounded tail
      ctx.fillStyle = SPARROW_BODY;
      ctx.beginPath();
      ctx.moveTo(-3.5 * s, 0);
      ctx.lineTo(-5.5 * s, -0.8 * s);
      ctx.lineTo(-5 * s, 0);
      ctx.lineTo(-5.5 * s, 0.8 * s);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
