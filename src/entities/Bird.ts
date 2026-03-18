import type { CityLayout } from '../city/CityLayout';
import type { Pedestrian } from './Pedestrian';

type BirdState = 'flying' | 'landing' | 'perched';

// Pigeon / sparrow colour palette
const BIRD_BODIES = ['#6b6b6b', '#7a7a7a', '#5c5044', '#8a7d6b', '#4a4a4a'];
const BIRD_WINGS  = ['#888888', '#9a9a9a', '#7a6e5c', '#a0937f', '#666666'];

// Shared bird feeder state — a pedestrian in the plaza tossing crumbs
export let birdFeederActive = false;
export let birdFeederX = 0;
export let birdFeederY = 0;
let feederTimer = 0;

export function updateBirdFeeder(layout: CityLayout) {
  if (birdFeederActive) {
    feederTimer--;
    if (feederTimer <= 0) birdFeederActive = false;
  } else if (Math.random() < 0.0001) { // ~every 2.5 min at 60fps
    const pb = layout.plazaBounds;
    birdFeederX = pb.x + pb.w * 0.3 + Math.random() * pb.w * 0.4;
    birdFeederY = pb.y + pb.h * 0.3 + Math.random() * pb.h * 0.4;
    birdFeederActive = true;
    feederTimer = 900; // ~15 seconds
  }
}

export class Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: BirdState = 'flying';
  perchTimer: number = 0;
  perchTarget: { x: number; y: number } | null = null;
  wingPhase: number;
  bodyColor: string;
  wingColor: string;
  size: number; // 0.8 - 1.2 scale
  height: number = 0; // 0 = ground, 1 = high altitude — affects parallax
  targetHeight: number = 0.7;
  private idOffset: number;
  private soarTimer: number = 0; // gliding phase

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 0.3;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.wingPhase = Math.random() * Math.PI * 2;
    this.idOffset = Math.random() * 100;
    const ci = Math.floor(Math.random() * BIRD_BODIES.length);
    this.bodyColor = BIRD_BODIES[ci];
    this.wingColor = BIRD_WINGS[ci];
    this.size = 0.85 + Math.random() * 0.3;
    this.height = 0.5 + Math.random() * 0.5; // start airborne
    this.targetHeight = 0.5 + Math.random() * 0.5;
  }

  update(flock: Bird[], pedestrians: Pedestrian[], layout: CityLayout, time: number) {
    const worldW = layout.width;
    const worldH = layout.height;
    const pb = layout.plazaBounds;

    // Smoothly transition height
    this.height += (this.targetHeight - this.height) * 0.02;

    if (this.state === 'perched') {
      this.perchTimer++;
      this.targetHeight = 0;

      // Scatter if a pedestrian comes close
      let scatter = false;
      for (const p of pedestrians) {
        const dx = this.x - p.x;
        const dy = this.y - p.y;
        if (dx * dx + dy * dy < 35 * 35) {
          scatter = true;
          const dist = Math.hypot(dx, dy) || 1;
          this.vx = (dx / dist) * 0.8 + (Math.random() - 0.5) * 0.4;
          this.vy = (dy / dist) * 0.8 - 0.2; // upward bias when startled
          break;
        }
      }

      // Attracted to bird feeder
      if (!scatter && birdFeederActive) {
        const fd = Math.hypot(this.x - birdFeederX, this.y - birdFeederY);
        if (fd > 20 && fd < 300) {
          scatter = true; // take off toward feeder
          this.vx = (birdFeederX - this.x) / fd * 0.6;
          this.vy = (birdFeederY - this.y) / fd * 0.6;
        }
      }

      if (scatter || this.perchTimer > 400 + Math.random() * 600) {
        this.state = 'flying';
        this.perchTarget = null;
        this.targetHeight = 0.4 + Math.random() * 0.6; // gain altitude
        if (!scatter) {
          this.vx = (Math.random() - 0.5) * 0.6;
          this.vy = -0.2 - Math.random() * 0.3;
        }
      }
      return;
    }

    if (this.state === 'landing' && this.perchTarget) {
      this.targetHeight = 0; // descend
      const dx = this.perchTarget.x - this.x;
      const dy = this.perchTarget.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3 && this.height < 0.05) {
        this.state = 'perched';
        this.perchTimer = 0;
        this.vx = 0;
        this.vy = 0;
        this.x = this.perchTarget.x;
        this.y = this.perchTarget.y;
        return;
      }
      // Slower approach with wing flap
      this.vx = (dx / dist) * 0.2;
      this.vy = (dy / dist) * 0.2;
      this.x += this.vx;
      this.y += this.vy;
      this.wingPhase += 0.12;
      return;
    }

    // === Flying: boid algorithm ===
    let sepX = 0, sepY = 0, sepN = 0;
    let aliVx = 0, aliVy = 0, aliN = 0;
    let cohX = 0, cohY = 0, cohN = 0;

    for (const other of flock) {
      if (other === this) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 400 && distSq > 0) { // Separation 20px
        const dist = Math.sqrt(distSq);
        sepX += dx / dist;
        sepY += dy / dist;
        sepN++;
      }
      if (distSq < 3600) { // Alignment 60px
        aliVx += other.vx;
        aliVy += other.vy;
        aliN++;
      }
      if (distSq < 10000) { // Cohesion 100px
        cohX += other.x;
        cohY += other.y;
        cohN++;
      }
    }

    let ax = 0, ay = 0;
    const maxForce = 0.012;

    if (sepN > 0) {
      ax += (sepX / sepN) * maxForce * 3;
      ay += (sepY / sepN) * maxForce * 3;
    }
    if (aliN > 0) {
      ax += (aliVx / aliN - this.vx) * maxForce * 1.5;
      ay += (aliVy / aliN - this.vy) * maxForce * 1.5;
    }
    if (cohN > 0) {
      const avgX = cohX / cohN;
      const avgY = cohY / cohN;
      ax += (avgX - this.x) * maxForce * 0.008;
      ay += (avgY - this.y) * maxForce * 0.008;
    }

    // Bird feeder attraction — strong pull when active
    if (birdFeederActive) {
      const fdx = birdFeederX - this.x;
      const fdy = birdFeederY - this.y;
      const fd = Math.hypot(fdx, fdy) || 1;
      if (fd < 400) {
        ax += (fdx / fd) * maxForce * 3;
        ay += (fdy / fd) * maxForce * 3;
      }
    } else {
      // Default: gentle wander with slight center bias to keep them in the city
      const wcx = worldW / 2;
      const wcy = worldH / 2;
      const toCx = wcx - this.x;
      const toCy = wcy - this.y;
      const toCD = Math.hypot(toCx, toCy) || 1;
      // Very gentle pull toward center of city
      ax += (toCx / toCD) * maxForce * 0.3;
      ay += (toCy / toCD) * maxForce * 0.3;
    }

    // Organic wander — slow sinusoidal drift
    ax += Math.cos(time * 0.2 + this.idOffset * 5) * maxForce * 0.5;
    ay += Math.sin(time * 0.25 + this.idOffset * 7) * maxForce * 0.5;

    // Apply forces with damping
    this.vx = this.vx * 0.98 + ax;
    this.vy = this.vy * 0.98 + ay;

    // Speed clamp
    const speed = Math.hypot(this.vx, this.vy);
    const minSpeed = 0.3;
    const maxSpeed = 0.8;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    } else if (speed < minSpeed && speed > 0) {
      this.vx = (this.vx / speed) * minSpeed;
      this.vy = (this.vy / speed) * minSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;

    // Occasionally change altitude while flying
    if (Math.random() < 0.005) {
      this.targetHeight = 0.3 + Math.random() * 0.7;
    }

    // Wing flap with occasional soar/glide
    this.soarTimer--;
    if (this.soarTimer <= 0) {
      this.wingPhase += 0.12 + speed * 0.08;
      if (Math.random() < 0.003) this.soarTimer = 30 + Math.random() * 40; // glide
    }

    // Chance to land — on any tree or bench in the city, or near feeder
    if (Math.random() < 0.0008) {
      const perches: { x: number; y: number }[] = [];
      // All trees in the city are valid perches
      for (const tree of layout.trees) {
        perches.push({ x: tree.x, y: tree.y - tree.radius * 0.5 }); // top of tree
      }
      for (const bench of layout.plazaBenches) {
        perches.push({ x: bench.x, y: bench.y });
      }
      if (perches.length > 0) {
        // Pick a nearby perch (within 200px)
        const nearby = perches.filter(p => Math.hypot(p.x - this.x, p.y - this.y) < 200);
        if (nearby.length > 0) {
          this.perchTarget = nearby[Math.floor(Math.random() * nearby.length)];
          this.state = 'landing';
        }
      }
    }

    // If near feeder, higher chance to land on ground near it
    if (birdFeederActive && Math.random() < 0.005) {
      const fd = Math.hypot(this.x - birdFeederX, this.y - birdFeederY);
      if (fd < 60) {
        this.perchTarget = {
          x: birdFeederX + (Math.random() - 0.5) * 30,
          y: birdFeederY + (Math.random() - 0.5) * 30,
        };
        this.state = 'landing';
      }
    }

    // Soft world boundary
    const margin = 100;
    if (this.x < margin) this.vx += 0.03;
    if (this.x > worldW - margin) this.vx -= 0.03;
    if (this.y < margin) this.vy += 0.03;
    if (this.y > worldH - margin) this.vy -= 0.03;
  }

  /** Draw shadow at ground level, then bird offset upward by height */
  drawShadow(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (this.height < 0.02) return; // no shadow when perched
    const dark = 1 - nightAlpha * 0.5;
    const shadowAlpha = Math.max(0, 0.18 - this.height * 0.12) * dark;
    if (shadowAlpha < 0.01) return;
    // Shadow grows larger and fainter with height
    const shadowScale = 1 + this.height * 1.5;
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 5 * shadowScale, 2.5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const dark = 1 - nightAlpha * 0.5;
    const s = this.size;
    // Height offset: bird drawn above its ground position
    const heightOffset = this.height * 40; // max 40px vertical offset
    ctx.save();
    ctx.translate(this.x, this.y - heightOffset);
    ctx.globalAlpha = dark;

    if (this.state === 'perched') {
      // Perched bird — small body with tiny head and tail
      ctx.fillStyle = this.bodyColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3 * s, 2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.fillStyle = this.wingColor;
      ctx.beginPath();
      ctx.arc(2.5 * s, -0.5 * s, 1.3 * s, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#cc8833';
      ctx.beginPath();
      ctx.moveTo(3.8 * s, -0.5 * s);
      ctx.lineTo(5 * s, -0.2 * s);
      ctx.lineTo(3.8 * s, 0);
      ctx.fill();
      // Tail
      ctx.fillStyle = this.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-3 * s, 0);
      ctx.lineTo(-5 * s, -1 * s);
      ctx.lineTo(-5 * s, 1 * s);
      ctx.closePath();
      ctx.fill();
    } else {
      // Flying bird — oriented in direction of travel, scaled by height
      const angle = Math.atan2(this.vy, this.vx);
      const hScale = 1 + this.height * 0.3; // slightly bigger when high (closer to viewer)
      ctx.rotate(angle);
      ctx.scale(hScale, hScale);

      // Body (elongated oval)
      ctx.fillStyle = this.bodyColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4 * s, 1.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(3.5 * s, -0.3 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = '#cc8833';
      ctx.beginPath();
      ctx.moveTo(5 * s, -0.3 * s);
      ctx.lineTo(6.5 * s, 0);
      ctx.lineTo(5 * s, 0.3 * s);
      ctx.fill();

      // Wings — flapping (slower at altitude = soaring)
      const flapIntensity = this.soarTimer > 0 ? 0.3 : (1.0 - this.height * 0.3);
      const wingFlap = Math.sin(this.wingPhase) * flapIntensity;
      ctx.fillStyle = this.wingColor;
      // Left wing
      ctx.beginPath();
      ctx.moveTo(1 * s, -1 * s);
      ctx.quadraticCurveTo(-1 * s, (-4 - wingFlap * 3) * s, -3 * s, (-2 - wingFlap * 2) * s);
      ctx.lineTo(-1 * s, 0);
      ctx.closePath();
      ctx.fill();
      // Right wing
      ctx.beginPath();
      ctx.moveTo(1 * s, 1 * s);
      ctx.quadraticCurveTo(-1 * s, (4 + wingFlap * 3) * s, -3 * s, (2 + wingFlap * 2) * s);
      ctx.lineTo(-1 * s, 0);
      ctx.closePath();
      ctx.fill();

      // Tail feathers
      ctx.fillStyle = this.bodyColor;
      ctx.beginPath();
      ctx.moveTo(-3.5 * s, 0);
      ctx.lineTo(-6 * s, -1.5 * s);
      ctx.lineTo(-5 * s, 0);
      ctx.lineTo(-6 * s, 1.5 * s);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
