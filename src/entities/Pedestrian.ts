import { PEDESTRIAN_BASE_SPEED, PEDESTRIAN_MAX_FORCE, SEPARATION_RADIUS, PEDESTRIAN_COLORS } from '../utils/constants';
import type { CityLayout } from '../city/CityLayout';

// Skin tone palette — varied across the full human range
const SKIN_TONES = [
  '#fcd5b0', '#f5c28a', '#e8aa68', '#d4884a',
  '#b86a30', '#8b4513', '#5c2a0a', '#fde0c8',
];

// Hair colours
const HAIR_COLORS = [
  '#1a1008', '#2e1a0a', '#4a3018', '#6b4c28',
  '#c8a050', '#e0b060', '#d44030', '#909090', '#555555',
];

// Hat colours
const HAT_COLORS = [
  '#2c2c2c', '#1a3a5c', '#2c3e20', '#4a2010',
  '#c8c8c8', '#8b0000', '#333366',
];

// Shopping bag colours
const BAG_COLORS = [
  '#e8f0ff', '#f0e8d0', '#d0f0d8', '#f0d0d8',
  '#fffacd', '#e8d8f0', '#ffd0a0',
];

type HairStyle = 'bald' | 'short' | 'long' | 'hat';

export class Pedestrian {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  size: number;
  baseSpeed: number;
  maxSpeed: number;
  maxForce: number;
  idOffset: number;
  clockTarget: { x: number; y: number; angle: number } | null = null;
  isClockEligible: boolean;
  clockDismissTarget: { x: number; y: number } | null = null;

  color: string;

  // Appearance
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  hatColor: string;
  hasBag: boolean;
  bagColor: string;

  waypointX: number = 0;
  waypointY: number = 0;
  waypointTimer: number = 0;

  // Sitting at venue
  isSitting: boolean = false;
  sitTimer: number = 0;
  sitDuration: number = 0;
  sitX: number = 0;
  sitY: number = 0;

  // Social chat pause
  socialMode: boolean = false;
  socialTimer: number = 0;

  // Walking animation phase
  walkPhase: number = 0;

  constructor(layout: CityLayout, index: number, clockEligibleCount: number) {
    this.isClockEligible = index < clockEligibleCount;
    this.idOffset = Math.random() * 1000;
    this.size = 0.8 + Math.random() * 0.4;
    this.baseSpeed = PEDESTRIAN_BASE_SPEED * (0.7 + Math.random() * 0.6);
    this.maxSpeed = this.baseSpeed;
    this.maxForce = PEDESTRIAN_MAX_FORCE * (0.8 + Math.random() * 0.4);
    this.color = PEDESTRIAN_COLORS[Math.floor(Math.random() * PEDESTRIAN_COLORS.length)];

    // Varied skin tones
    this.skinTone = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];

    // Hair style
    const hairRoll = Math.random();
    if (hairRoll < 0.12) this.hairStyle = 'bald';
    else if (hairRoll < 0.42) this.hairStyle = 'short';
    else if (hairRoll < 0.72) this.hairStyle = 'long';
    else this.hairStyle = 'hat';
    this.hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
    this.hatColor  = HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)];

    // ~28% of non-clock pedestrians carry a shopping bag
    this.hasBag   = !this.isClockEligible && Math.random() < 0.28;
    this.bagColor = BAG_COLORS[Math.floor(Math.random() * BAG_COLORS.length)];

    // Spawn position
    if (this.isClockEligible) {
      const p = layout.plazaBounds;
      this.x = p.x + Math.random() * p.w;
      this.y = p.y + Math.random() * p.h;
    } else {
      const pos = layout.getRandomWalkablePosition(index * 7 + 13);
      this.x = pos.x;
      this.y = pos.y;
    }

    this.angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(this.angle) * this.baseSpeed * 0.5;
    this.vy = Math.sin(this.angle) * this.baseSpeed * 0.5;

    const wp = layout.getRandomSidewalkWaypoint();
    this.waypointX = wp.x;
    this.waypointY = wp.y;
    this.waypointTimer = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
  }

  update(pedestrians: Pedestrian[], layout: CityLayout) {
    let ax = 0;
    let ay = 0;
    const time = Date.now() / 1000;

    if (this.clockTarget) {
      // === CLOCK MODE ===
      const dx = this.clockTarget.x - this.x;
      const dy = this.clockTarget.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 3) {
        this.x += dx * 0.15;
        this.y += dy * 0.15;
        this.vx *= 0.7;
        this.vy *= 0.7;
      } else if (dist > 0) {
        const forceScale = Math.min(1, dist / 30);
        ax += (dx / dist) * this.maxForce * 40.0 * forceScale;
        ay += (dy / dist) * this.maxForce * 40.0 * forceScale;
      }

      this.vx *= 0.88;
      this.vy *= 0.88;

    } else if (this.clockDismissTarget) {
      // === DISMISS MODE ===
      const dx = this.clockDismissTarget.x - this.x;
      const dy = this.clockDismissTarget.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) {
        this.vx *= 0.7;
        this.vy *= 0.7;
      } else {
        ax += (dx / dist) * this.maxForce * 8.0;
        ay += (dy / dist) * this.maxForce * 8.0;
      }
      this.vx *= 0.92;
      this.vy *= 0.92;

    } else {
      // === AUTONOMOUS MODE ===

      // --- Social chat mode ---
      if (this.socialMode) {
        this.socialTimer--;
        if (this.socialTimer <= 0) {
          this.socialMode = false;
        } else {
          // Gently attract to nearest pedestrian within 60 px (form a pair/group)
          let nearDist = Infinity;
          let nearDx = 0, nearDy = 0;
          for (const other of pedestrians) {
            if (other === this || other.isClockEligible) continue;
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 60 && d < nearDist) {
              nearDist = d;
              nearDx = dx / d;
              nearDy = dy / d;
            }
          }
          if (nearDist < 60 && nearDist > 12) {
            ax += nearDx * this.maxForce * 2.0;
            ay += nearDy * this.maxForce * 2.0;
          }
          // Strong damping — almost stationary
          this.vx *= 0.78;
          this.vy *= 0.78;
        }
      }

      // --- Sitting at venue ---
      if (this.isSitting) {
        this.sitTimer++;
        if (this.sitTimer >= this.sitDuration) {
          this.isSitting = false;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          const sdx = this.sitX - this.x;
          const sdy = this.sitY - this.y;
          ax += sdx * 0.1;
          ay += sdy * 0.1;
          this.vx *= 0.8;
          this.vy *= 0.8;
        }
      }

      if (!this.isSitting && !this.socialMode) {
        // 1. Waypoint following
        this.waypointTimer++;
        const wpDx = this.waypointX - this.x;
        const wpDy = this.waypointY - this.y;
        const wpDist = Math.sqrt(wpDx * wpDx + wpDy * wpDy);

        if (wpDist < 15 || this.waypointTimer > 600) {
          // Maybe sit at a venue
          if (!this.isClockEligible && layout.venues.length > 0 && Math.random() < 0.15) {
            const venue = layout.venues[Math.floor(Math.random() * layout.venues.length)];
            if (venue.seatingPositions.length > 0) {
              const seat = venue.seatingPositions[Math.floor(Math.random() * venue.seatingPositions.length)];
              this.isSitting   = true;
              this.sitX        = seat.x;
              this.sitY        = seat.y;
              this.sitTimer    = 0;
              this.sitDuration = 300 + Math.random() * 500;
              this.waypointX   = seat.x;
              this.waypointY   = seat.y;
              this.waypointTimer = 0;
            }
          }
          // Maybe enter social / chat mode
          if (!this.isSitting && !this.isClockEligible && Math.random() < 0.14) {
            this.socialMode  = true;
            this.socialTimer = 100 + Math.floor(Math.random() * 220);
          }
          // Otherwise pick a new walkway waypoint
          if (!this.isSitting && !this.socialMode) {
            const wp = layout.getRandomSidewalkWaypoint();
            this.waypointX   = wp.x;
            this.waypointY   = wp.y;
            this.waypointTimer = 0;
          }
        }

        if (wpDist > 0) {
          ax += (wpDx / wpDist) * this.maxForce * 1.5;
          ay += (wpDy / wpDist) * this.maxForce * 1.5;
        }
      }

      if (!this.socialMode) {
        // 2. Separation
        let sepX = 0, sepY = 0, sepCount = 0;
        for (const other of pedestrians) {
          if (other === this) continue;
          const dx = this.x - other.x;
          const dy = this.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0 && dist < SEPARATION_RADIUS) {
            sepX += dx / dist;
            sepY += dy / dist;
            sepCount++;
          }
        }
        if (sepCount > 0) {
          ax += (sepX / sepCount) * this.maxForce * 3.0;
          ay += (sepY / sepCount) * this.maxForce * 3.0;
        }

        // 3. Wander noise
        ax += Math.cos(time * 0.7 + this.idOffset) * this.maxForce * 0.5;
        ay += Math.sin(time * 0.9 + this.idOffset * 1.3) * this.maxForce * 0.5;
      }

      // 4. Boundary repulsion
      const margin = 30;
      const turnForce = this.maxForce * 5;
      if (this.x < margin) ax += turnForce * (margin - this.x) / margin;
      if (this.x > layout.width  - margin) ax -= turnForce * (this.x - (layout.width  - margin)) / margin;
      if (this.y < margin) ay += turnForce * (margin - this.y) / margin;
      if (this.y > layout.height - margin) ay -= turnForce * (this.y - (layout.height - margin)) / margin;
    }

    // Apply acceleration
    this.vx += ax;
    this.vy += ay;

    // Speed limits
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.clockTarget) {
      if (speed > this.maxSpeed * 12) {
        this.vx = (this.vx / speed) * this.maxSpeed * 12;
        this.vy = (this.vy / speed) * this.maxSpeed * 12;
      }
    } else {
      if (speed > this.maxSpeed) {
        this.vx = (this.vx / speed) * this.maxSpeed;
        this.vy = (this.vy / speed) * this.maxSpeed;
      } else if (speed < this.maxSpeed * 0.15 && speed > 0 && !this.isSitting && !this.socialMode) {
        this.vx = (this.vx / speed) * this.maxSpeed * 0.15;
        this.vy = (this.vy / speed) * this.maxSpeed * 0.15;
      }
    }

    this.x += this.vx;
    this.y += this.vy;

    // Angle
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.clockTarget && currentSpeed < 1.0) {
      let diff = normalizeAngle(this.clockTarget.angle - this.angle);
      this.angle += diff * 0.1;
    } else if (currentSpeed > 0.1) {
      const targetAngle = Math.atan2(this.vy, this.vx);
      let diff = normalizeAngle(targetAngle - this.angle);
      this.angle += diff * 0.12;
    }

    this.walkPhase += currentSpeed * 0.5;
  }

  draw(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const s = this.size * 5.5;
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const legSwing = (this.isSitting || this.socialMode)
      ? 0
      : Math.sin(this.walkPhase) * Math.min(speed * 1.5, 2);

    // Shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + nightAlpha * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(1, 1, s * 1.1, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shopping bag (right side of body)
    if (this.hasBag) {
      const bx = s * 0.05;
      const by = s * 0.52;
      const bw = s * 0.42;
      const bh = s * 0.46;
      ctx.fillStyle = adjustForNight(this.bagColor, nightAlpha);
      ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
      ctx.strokeStyle = darkenColor(this.bagColor, 0.35);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(bx, by - bh / 2, bw * 0.22, Math.PI, 0);
      ctx.stroke();
    }

    // Legs
    ctx.fillStyle = darkenColor(this.color, 0.3 + nightAlpha * 0.2);
    ctx.beginPath();
    ctx.arc(-s * 0.3,  legSwing * 0.8, s * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-s * 0.3, -legSwing * 0.8, s * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = adjustForNight(this.color, nightAlpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.7, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Coffee cup when sitting at a venue
    if (this.isSitting) {
      const cf = 1 - nightAlpha * 0.25;
      ctx.fillStyle = `rgb(${Math.floor(240 * cf)},${Math.floor(232 * cf)},${Math.floor(210 * cf)})`;
      ctx.fillRect(s * 0.62, -s * 0.18, s * 0.3, s * 0.36);
      ctx.fillStyle = `rgb(${Math.floor(100 * cf)},${Math.floor(58 * cf)},${Math.floor(18 * cf)})`;
      ctx.fillRect(s * 0.64, -s * 0.06, s * 0.26, s * 0.1);
      ctx.fillStyle = `rgb(${Math.floor(218 * cf)},${Math.floor(208 * cf)},${Math.floor(188 * cf)})`;
      ctx.fillRect(s * 0.56, s * 0.17, s * 0.42, s * 0.07);
    }

    // Chat speech bubble (three dots) when socially paused
    if (this.socialMode) {
      const ba = 0.72 - nightAlpha * 0.25;
      ctx.fillStyle = `rgba(255,255,255,${ba})`;
      ctx.beginPath();
      ctx.arc(s * 0.76, -s * 0.56, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(70,70,70,${ba * 0.9})`;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(s * 0.76 + i * s * 0.09, -s * 0.56, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Head — varied skin tone
    const skinFactor = 1 - nightAlpha * 0.35;
    const sr = parseInt(this.skinTone.slice(1, 3), 16);
    const sg = parseInt(this.skinTone.slice(3, 5), 16);
    const sb = parseInt(this.skinTone.slice(5, 7), 16);
    ctx.fillStyle = `rgb(${Math.floor(sr * skinFactor)},${Math.floor(sg * skinFactor)},${Math.floor(sb * skinFactor)})`;
    ctx.beginPath();
    ctx.arc(s * 0.5, 0, s * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Hair / hat
    if (this.hairStyle !== 'bald') {
      const hf = 1 - nightAlpha * 0.4;
      if (this.hairStyle === 'hat') {
        const hr = parseInt(this.hatColor.slice(1, 3), 16);
        const hg = parseInt(this.hatColor.slice(3, 5), 16);
        const hb = parseInt(this.hatColor.slice(5, 7), 16);
        ctx.fillStyle = `rgb(${Math.floor(hr * hf)},${Math.floor(hg * hf)},${Math.floor(hb * hf)})`;
        ctx.fillRect(s * 0.14, -s * 0.42, s * 0.72, s * 0.11); // brim
        ctx.fillRect(s * 0.24, -s * 0.72, s * 0.52, s * 0.32); // crown
      } else {
        const hr = parseInt(this.hairColor.slice(1, 3), 16);
        const hg = parseInt(this.hairColor.slice(3, 5), 16);
        const hb = parseInt(this.hairColor.slice(5, 7), 16);
        ctx.fillStyle = `rgb(${Math.floor(hr * hf)},${Math.floor(hg * hf)},${Math.floor(hb * hf)})`;
        if (this.hairStyle === 'short') {
          ctx.beginPath();
          ctx.arc(s * 0.5, 0, s * 0.37, Math.PI * 0.75, Math.PI * 2.25);
          ctx.fill();
        } else {
          // Long hair: wider arc + side strands
          ctx.beginPath();
          ctx.arc(s * 0.5, 0, s * 0.38, Math.PI * 0.55, Math.PI * 2.45);
          ctx.fill();
          ctx.fillRect(s * 0.13, 0, s * 0.1,  s * 0.36);
          ctx.fillRect(s * 0.77, 0, s * 0.1,  s * 0.36);
        }
      }
    }

    ctx.restore();
  }
}

function normalizeAngle(angle: number): number {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function adjustForNight(hexColor: string, nightAlpha: number): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const factor = 1 - nightAlpha * 0.5;
  return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}

function darkenColor(hexColor: string, amount: number): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const factor = 1 - amount;
  return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}
