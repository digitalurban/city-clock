import { CAR_SPEED, ROAD_WIDTH } from '../utils/constants';
import type { CityLayout, RoadSegment, DeliveryLane, VenueDef } from '../city/CityLayout';
import type { Pedestrian } from './Pedestrian';

const CAR_COLORS = [
  '#2c3e50', '#e74c3c', '#3498db', '#f1c40f',
  '#1abc9c', '#9b59b6', '#ecf0f1',
  '#34495e', '#c0392b', '#2980b9', '#27ae60',
];

const DELIVERY_COLOR = '#e67e22';

// States for delivery cars
type DeliveryState = 'driving' | 'entering' | 'delivering' | 'exiting';

/** A dropped-off package sitting outside a venue */
export interface DroppedPackage {
  x: number;
  y: number;
  timer: number;   // frames left until it disappears (carried inside by staff)
  color: string;
}

// Package colours — small brown cardboard boxes with tape
const PKG_COLORS = ['#b08050', '#a07040', '#c09060', '#907050'];

export class Car {
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
  angle: number = 0;
  baseSpeed: number;
  currentSpeed: number;
  color: string;
  length: number;
  width: number;
  road: RoadSegment;
  dirX: number = 0;
  dirY: number = 0;

  // Delivery car fields
  isDelivery: boolean;
  deliveryState: DeliveryState = 'driving';
  deliveryTimer: number = 0;
  deliveryLane: DeliveryLane | null = null;
  deliveryPauseTimer: number = 0;
  targetVenue: VenueDef | null = null;

  // Class-level collection of dropped packages (shared across all trucks)
  static droppedPackages: DroppedPackage[] = [];

  constructor(layout: CityLayout, isDelivery: boolean = false) {
    this.isDelivery = isDelivery;
    this.baseSpeed = CAR_SPEED * (0.3 + Math.random() * 0.4);
    this.currentSpeed = this.baseSpeed;
    this.color = isDelivery ? DELIVERY_COLOR : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.length = isDelivery ? 18 : 14 + Math.random() * 6;
    this.width = isDelivery ? 9 : 7 + Math.random() * 2;

    this.road = this.pickRandomRoad(layout);
    this.placeOnRoad(this.road);

    if (isDelivery) {
      // Stagger deliveries so they don't all go at once
      this.deliveryTimer = 60 + Math.random() * 120;
    }
  }

  private pickRandomRoad(layout: CityLayout): RoadSegment {
    const roads = layout.roads;
    const lengths = roads.map(r => r.horizontal ? r.w : r.h);
    const total = lengths.reduce((a, b) => a + b, 0);
    let pick = Math.random() * total;
    for (let i = 0; i < roads.length; i++) {
      pick -= lengths[i];
      if (pick <= 0) return roads[i];
    }
    return roads[roads.length - 1];
  }

  private placeOnRoad(road: RoadSegment) {
    if (road.horizontal) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.x = road.x + Math.random() * road.w;
      this.y = road.y + (direction > 0 ? road.h * 0.25 : road.h * 0.75);
      this.dirX = direction;
      this.dirY = 0;
      this.angle = direction > 0 ? 0 : Math.PI;
    } else {
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.y = road.y + Math.random() * road.h;
      this.x = road.x + (direction > 0 ? road.w * 0.25 : road.w * 0.75);
      this.dirX = 0;
      this.dirY = direction;
      this.angle = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.vx = this.dirX * this.baseSpeed;
    this.vy = this.dirY * this.baseSpeed;
  }

  private isOutsideRoad(): boolean {
    const r = this.road;
    if (r.horizontal) {
      return this.x < r.x - 5 || this.x > r.x + r.w + 5;
    } else {
      return this.y < r.y - 5 || this.y > r.y + r.h + 5;
    }
  }

  // Find a road that intersects near the car's current position (for turning at junctions)
  private findConnectingRoad(layout: CityLayout): RoadSegment | null {
    const snap = ROAD_WIDTH * 1.5;
    // Prefer roads with different orientation (to turn rather than continue straight / U-turn)
    let best: RoadSegment | null = null;
    let bestSameDir: RoadSegment | null = null;
    for (const road of layout.roads) {
      if (road === this.road) continue;
      if (this.x >= road.x - snap && this.x <= road.x + road.w + snap &&
          this.y >= road.y - snap && this.y <= road.y + road.h + snap) {
        if (road.horizontal !== this.road.horizontal) {
          best = road; // perpendicular road – ideal turn
          break;
        } else {
          bestSameDir = road; // parallel – fallback (e.g. continue past clipped section)
        }
      }
    }
    return best ?? bestSameDir;
  }

  // Smoothly transition onto a connecting road, preserving travel direction where possible
  private transitionToRoad(road: RoadSegment) {
    this.road = road;
    if (road.horizontal) {
      const dir = this.dirX !== 0 ? Math.sign(this.dirX) : (Math.random() > 0.5 ? 1 : -1);
      this.dirX = dir;
      this.dirY = 0;
      this.x = Math.max(road.x + 5, Math.min(road.x + road.w - 5, this.x));
      this.y = road.y + (dir > 0 ? road.h * 0.25 : road.h * 0.75);
      this.angle = dir > 0 ? 0 : Math.PI;
    } else {
      const dir = this.dirY !== 0 ? Math.sign(this.dirY) : (Math.random() > 0.5 ? 1 : -1);
      this.dirX = 0;
      this.dirY = dir;
      this.y = Math.max(road.y + 5, Math.min(road.y + road.h - 5, this.y));
      this.x = road.x + (dir > 0 ? road.w * 0.25 : road.w * 0.75);
      this.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;
  }

  update(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[]) {
    if (this.isDelivery) {
      this.updateDelivery(layout, pedestrians, cars);
    } else {
      this.updateNormal(layout, pedestrians, cars);
    }
  }

  private updateNormal(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[]) {
    let targetSpeed = this.baseSpeed;
    const frontX = this.x + this.dirX * this.length * 0.5;
    const frontY = this.y + this.dirY * this.length * 0.5;

    for (const p of pedestrians) {
      const dx = p.x - frontX;
      const dy = p.y - frontY;
      const along = dx * this.dirX + dy * this.dirY;
      const perp = Math.abs(dx * this.dirY - dy * this.dirX);
      if (along > 0 && along < 40 && perp < 12) {
        targetSpeed = Math.min(targetSpeed, this.baseSpeed * (along / 40) * 0.5);
      }
    }

    for (const other of cars) {
      if (other === this) continue;
      const dx = other.x - frontX;
      const dy = other.y - frontY;
      const along = dx * this.dirX + dy * this.dirY;
      const perp = Math.abs(dx * this.dirY - dy * this.dirX);
      if (along > 0 && along < 30 && perp < 10) {
        targetSpeed = Math.min(targetSpeed, this.baseSpeed * (along / 30) * 0.3);
      }
    }

    this.currentSpeed += (targetSpeed - this.currentSpeed) * 0.1;
    if (this.currentSpeed < 0.02) this.currentSpeed = 0;

    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;
    this.x += this.vx;
    this.y += this.vy;

    if (this.isOutsideRoad()) {
      const connecting = this.findConnectingRoad(layout);
      if (connecting) {
        this.transitionToRoad(connecting);
      } else {
        // No connecting road found (e.g. screen edge) — teleport to a random road
        this.road = this.pickRandomRoad(layout);
        this.placeOnRoad(this.road);
      }
    }
  }

  private updateDelivery(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[]) {
    switch (this.deliveryState) {

      case 'driving': {
        this.updateNormal(layout, pedestrians, cars);
        this.deliveryTimer--;
        if (this.deliveryTimer <= 0 && layout.deliveryLanes.length > 0) {
          // Only pick a lane that no other delivery truck is currently using
          const occupiedLanes = new Set(
            cars
              .filter(c => c !== this && c.isDelivery && c.deliveryLane !== null)
              .map(c => c.deliveryLane!)
          );
          const freeLanes = layout.deliveryLanes.filter(l => !occupiedLanes.has(l));
          if (freeLanes.length === 0) {
            // All lanes busy — retry after a short wait
            this.deliveryTimer = 30 + Math.floor(Math.random() * 40);
            break;
          }
          const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
          this.deliveryLane = lane;

          // Pick a venue on this side of the plaza to deliver to
          const sideVenues = layout.venues.filter(v =>
            (lane.side === 'top' && v.facingPlaza === 'bottom') ||
            (lane.side === 'bottom' && v.facingPlaza === 'top')
          );
          this.targetVenue = sideVenues.length > 0
            ? sideVenues[Math.floor(Math.random() * sideVenues.length)]
            : null;

          this.x = lane.laneX;
          this.y = lane.outerY;
          this.vx = 0;
          this.vy = 0;
          this.deliveryState = 'entering';
        }
        break;
      }

      case 'entering': {
        if (!this.deliveryLane) { this.deliveryState = 'driving'; break; }
        const lane = this.deliveryLane;
        const inDir = lane.side === 'top' ? 1 : -1; // +1 = moving down, -1 = moving up
        const speed = this.baseSpeed * 4.0; // fast entry so clearly visible

        // Drive straight along the lane
        this.vx = 0;
        this.vy = inDir * speed;
        this.angle = inDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.x = lane.laneX; // keep perfectly centred in lane
        this.y += this.vy;

        const reachedInner = lane.side === 'top'
          ? this.y >= lane.innerY
          : this.y <= lane.innerY;

        if (reachedInner) {
          this.y = lane.innerY;
          this.vx = 0;
          this.vy = 0;
          this.deliveryPauseTimer = 0;
          this.deliveryState = 'delivering';
        }
        break;
      }

      case 'delivering': {
        // Parked — slow drift to stop
        this.vx *= 0.8;
        this.vy *= 0.8;
        this.deliveryPauseTimer++;

        // Drop the package partway through the pause
        if (this.deliveryPauseTimer === 60 && this.targetVenue) {
          const v = this.targetVenue;
          // Place package at venue entrance
          let px = v.x + v.w / 2;
          let py = v.y + v.h / 2;
          if (v.facingPlaza === 'bottom') py = v.y + v.h + 6;
          else if (v.facingPlaza === 'top') py = v.y - 6;
          else if (v.facingPlaza === 'right') px = v.x + v.w + 6;
          else px = v.x - 6;

          Car.droppedPackages.push({
            x: px,
            y: py,
            timer: 400 + Math.floor(Math.random() * 200), // visible for 7-10 seconds
            color: PKG_COLORS[Math.floor(Math.random() * PKG_COLORS.length)],
          });
        }

        if (this.deliveryPauseTimer >= 120) {
          this.deliveryState = 'exiting';
        }
        break;
      }

      case 'exiting': {
        if (!this.deliveryLane) { this.deliveryState = 'driving'; break; }
        const lane = this.deliveryLane;
        const outDir = lane.side === 'top' ? -1 : 1; // reverse direction
        const speed = this.baseSpeed * 4.0;

        // Drive straight back out
        this.vx = 0;
        this.vy = outDir * speed;
        this.angle = outDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.x = lane.laneX;
        this.y += this.vy;

        const reachedOuter = lane.side === 'top'
          ? this.y <= lane.outerY
          : this.y >= lane.outerY;

        if (reachedOuter) {
          // Back on the outer road — find connecting road or pick a random one
          const connecting = this.findConnectingRoad(layout);
          if (connecting) {
            this.transitionToRoad(connecting);
          } else {
            this.road = this.pickRandomRoad(layout);
            this.placeOnRoad(this.road);
          }
          this.deliveryLane = null;
          this.targetVenue = null;
          this.deliveryState = 'driving';
          this.deliveryTimer = 60 + Math.random() * 120;
        }
        break;
      }
    }
  }

  /** Tick all dropped packages (call once per frame from main loop) */
  static updateDroppedPackages() {
    for (let i = Car.droppedPackages.length - 1; i >= 0; i--) {
      Car.droppedPackages[i].timer--;
      if (Car.droppedPackages[i].timer <= 0) {
        Car.droppedPackages.splice(i, 1);
      }
    }
  }

  /** Draw all dropped packages */
  static drawDroppedPackages(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    for (const pkg of Car.droppedPackages) {
      const dark = 1 - nightAlpha * 0.4;
      const r = parseInt(pkg.color.slice(1, 3), 16);
      const g = parseInt(pkg.color.slice(3, 5), 16);
      const b = parseInt(pkg.color.slice(5, 7), 16);

      // Fade out in last 60 frames (carried inside)
      const alpha = pkg.timer < 60 ? pkg.timer / 60 : 1;

      // Shadow
      ctx.fillStyle = `rgba(0,0,0,${0.15 * alpha})`;
      ctx.fillRect(pkg.x - 3.5, pkg.y - 2.5, 8, 6);

      // Box
      ctx.fillStyle = `rgba(${Math.floor(r * dark)},${Math.floor(g * dark)},${Math.floor(b * dark)},${alpha})`;
      ctx.fillRect(pkg.x - 4, pkg.y - 3, 8, 6);

      // Tape stripe
      ctx.fillStyle = `rgba(200,180,140,${0.6 * alpha})`;
      ctx.fillRect(pkg.x - 4, pkg.y - 0.5, 8, 1);
      ctx.fillRect(pkg.x - 0.5, pkg.y - 3, 1, 6);
    }
  }

  draw(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const isBraking = this.currentSpeed < this.baseSpeed * 0.5;

    // Shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + nightAlpha * 0.1})`;
    ctx.fillRect(-this.length / 2 + 1.5, -this.width / 2 + 1.5, this.length, this.width);

    // Car body
    const darkFactor = 1 - nightAlpha * 0.4;
    const r = parseInt(this.color.slice(1, 3), 16);
    const g = parseInt(this.color.slice(3, 5), 16);
    const b = parseInt(this.color.slice(5, 7), 16);
    ctx.fillStyle = `rgb(${Math.floor(r * darkFactor)}, ${Math.floor(g * darkFactor)}, ${Math.floor(b * darkFactor)})`;

    const hw = this.length / 2;
    const hh = this.width / 2;
    const cr = 2;
    ctx.beginPath();
    ctx.moveTo(-hw + cr, -hh);
    ctx.lineTo(hw - cr, -hh);
    ctx.quadraticCurveTo(hw, -hh, hw, -hh + cr);
    ctx.lineTo(hw, hh - cr);
    ctx.quadraticCurveTo(hw, hh, hw - cr, hh);
    ctx.lineTo(-hw + cr, hh);
    ctx.quadraticCurveTo(-hw, hh, -hw, hh - cr);
    ctx.lineTo(-hw, -hh + cr);
    ctx.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
    ctx.fill();

    // Delivery cargo box on back
    if (this.isDelivery) {
      ctx.fillStyle = `rgb(${Math.floor(r * darkFactor * 0.75)}, ${Math.floor(g * darkFactor * 0.75)}, ${Math.floor(b * darkFactor * 0.75)})`;
      ctx.fillRect(-hw + 1, -hh + 1.5, this.length * 0.42, this.width - 3);
      ctx.strokeStyle = `rgba(0,0,0,0.25)`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-hw + 1, -hh + 1.5, this.length * 0.42, this.width - 3);
    }

    // Windshield
    ctx.fillStyle = `rgba(150, 200, 230, ${0.6 - nightAlpha * 0.3})`;
    ctx.fillRect(this.length * 0.15, -this.width / 2 + 1.5, this.length * 0.2, this.width - 3);

    // Headlights at night
    if (nightAlpha > 0.1) {
      const headlightAlpha = 0.3 + nightAlpha * 0.7;
      ctx.fillStyle = `rgba(255, 240, 180, ${headlightAlpha})`;
      ctx.beginPath();
      ctx.arc(this.length / 2, -this.width / 2 + 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.length / 2, this.width / 2 - 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();

      if (nightAlpha > 0.3) {
        const grad = ctx.createRadialGradient(this.length / 2 + 5, 0, 0, this.length / 2 + 5, 0, 25);
        grad.addColorStop(0, `rgba(255, 240, 180, ${nightAlpha * 0.2})`);
        grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(this.length / 2, -15, 30, 30);
      }
    }

    // Taillights
    const tailAlpha = isBraking ? 0.9 : (0.4 + nightAlpha * 0.4);
    ctx.fillStyle = `rgba(255, 50, 50, ${tailAlpha})`;
    ctx.fillRect(-this.length / 2, -this.width / 2 + 1, 2, 2);
    ctx.fillRect(-this.length / 2, this.width / 2 - 3, 2, 2);

    ctx.restore();
  }
}
