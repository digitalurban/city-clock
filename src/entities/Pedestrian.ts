import { PEDESTRIAN_BASE_SPEED, PEDESTRIAN_MAX_FORCE, SEPARATION_RADIUS, PEDESTRIAN_COLORS } from '../utils/constants';
import type { CityLayout } from '../city/CityLayout';

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
  clockDismissTarget: { x: number; y: number } | null = null; // Where to go when clock is active but this ped is inactive

  color: string;
  waypointX: number = 0;
  waypointY: number = 0;
  waypointTimer: number = 0;

  // Sitting at venue
  isSitting: boolean = false;
  sitTimer: number = 0;
  sitDuration: number = 0;
  sitX: number = 0;
  sitY: number = 0;

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

    // Spawn on a walkable position (clock-eligible near plaza)
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

    // Initial waypoint
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
        // Close enough — lerp directly to target, kill velocity (no wobble)
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
      // === DISMISS MODE === move to edge of plaza to clear digit area
      const dx = this.clockDismissTarget.x - this.x;
      const dy = this.clockDismissTarget.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) {
        // Settled — just stay put
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

      // Check if sitting at a venue
      if (this.isSitting) {
        this.sitTimer++;
        if (this.sitTimer >= this.sitDuration) {
          // Done sitting, get up and walk
          this.isSitting = false;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          // Stay at seat — strong pull to exact seat position, almost no movement
          const sdx = this.sitX - this.x;
          const sdy = this.sitY - this.y;
          ax += sdx * 0.1;
          ay += sdy * 0.1;
          this.vx *= 0.8;
          this.vy *= 0.8;
        }
      }

      if (!this.isSitting) {
      // 1. Waypoint following
      this.waypointTimer++;
      const wpDx = this.waypointX - this.x;
      const wpDy = this.waypointY - this.y;
      const wpDist = Math.sqrt(wpDx * wpDx + wpDy * wpDy);

      if (wpDist < 15 || this.waypointTimer > 600) {
        // Maybe sit at a venue instead of picking a new waypoint
        if (!this.isClockEligible && layout.venues.length > 0 && Math.random() < 0.15) {
          const venue = layout.venues[Math.floor(Math.random() * layout.venues.length)];
          if (venue.seatingPositions.length > 0) {
            const seat = venue.seatingPositions[Math.floor(Math.random() * venue.seatingPositions.length)];
            this.isSitting = true;
            this.sitX = seat.x;
            this.sitY = seat.y;
            this.sitTimer = 0;
            this.sitDuration = 300 + Math.random() * 500; // 5-13 seconds at 60fps
            this.waypointX = seat.x;
            this.waypointY = seat.y;
            this.waypointTimer = 0;
          }
        }
        if (!this.isSitting) {
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        }
      }

      if (wpDist > 0) {
        const wpForce = this.maxForce * 1.5;
        ax += (wpDx / wpDist) * wpForce;
        ay += (wpDy / wpDist) * wpForce;
      }

      // 2. Separation from other pedestrians
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

      // 4. Stay within canvas bounds
      const margin = 30;
      const turnForce = this.maxForce * 5;
      if (this.x < margin) ax += turnForce * (margin - this.x) / margin;
      if (this.x > layout.width - margin) ax -= turnForce * (this.x - (layout.width - margin)) / margin;
      if (this.y < margin) ay += turnForce * (margin - this.y) / margin;
      if (this.y > layout.height - margin) ay -= turnForce * (this.y - (layout.height - margin)) / margin;
      } // end if (!this.isSitting)
    }

    // Apply acceleration
    this.vx += ax;
    this.vy += ay;

    // Limit speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.clockTarget) {
      // Higher multiplier so pedestrians converge quickly despite slow strolling speed
      if (speed > this.maxSpeed * 12) {
        this.vx = (this.vx / speed) * this.maxSpeed * 12;
        this.vy = (this.vy / speed) * this.maxSpeed * 12;
      }
    } else {
      const minSpeed = this.maxSpeed * 0.15;
      if (speed > this.maxSpeed) {
        this.vx = (this.vx / speed) * this.maxSpeed;
        this.vy = (this.vy / speed) * this.maxSpeed;
      } else if (speed < minSpeed && speed > 0) {
        this.vx = (this.vx / speed) * minSpeed;
        this.vy = (this.vy / speed) * minSpeed;
      }
    }

    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Update angle smoothly
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.clockTarget && currentSpeed < 1.0) {
      // Settle toward clock target angle
      let diff = normalizeAngle(this.clockTarget.angle - this.angle);
      this.angle += diff * 0.1;
    } else if (currentSpeed > 0.1) {
      const targetAngle = Math.atan2(this.vy, this.vx);
      let diff = normalizeAngle(targetAngle - this.angle);
      this.angle += diff * 0.12;
    }

    // Walking animation (scaled up so legs still move visibly at strolling speed)
    this.walkPhase += currentSpeed * 0.5;
  }

  draw(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const s = this.size * 5.5;
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const legSwing = Math.sin(this.walkPhase) * Math.min(speed * 1.5, 2);

    // Shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + nightAlpha * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(1, 1, s * 1.1, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (two small circles that swing)
    ctx.fillStyle = darkenColor(this.color, 0.3 + nightAlpha * 0.2);
    ctx.beginPath();
    ctx.arc(-s * 0.3, legSwing * 0.8, s * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-s * 0.3, -legSwing * 0.8, s * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Body (oval)
    ctx.fillStyle = adjustForNight(this.color, nightAlpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.7, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const skinTone = nightAlpha > 0.3 ? '#c4a078' : '#ecc8a0';
    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.arc(s * 0.5, 0, s * 0.35, 0, Math.PI * 2);
    ctx.fill();

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
  return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
}

function darkenColor(hexColor: string, amount: number): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const factor = 1 - amount;
  return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
}
