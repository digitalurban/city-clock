import { CAR_SPEED, ROAD_WIDTH } from '../utils/constants';
import type { CityLayout, RoadSegment, VenueDef } from '../city/CityLayout';
import type { Pedestrian } from './Pedestrian';

const CAR_COLORS = [
  '#2c3e50', '#e74c3c', '#3498db', '#f1c40f',
  '#1abc9c', '#9b59b6', '#ecf0f1',
  '#34495e', '#c0392b', '#2980b9', '#27ae60',
];

const DELIVERY_COLOR = '#e67e22';

/** A dropped-off package sitting outside a venue */
export interface DroppedPackage {
  x: number;
  y: number;
  timer: number;
  color: string;
}

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

  // Delivery fields — simple approach: drive on roads, stop near venues
  isDelivery: boolean;
  deliveryTimer: number = 0;
  isParkedDelivering: boolean = false;
  deliveryPauseTimer: number = 0;
  targetVenue: VenueDef | null = null;
  packageDropped: boolean = false;

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
      this.deliveryTimer = 80 + Math.random() * 160;
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

  private findConnectingRoad(layout: CityLayout): RoadSegment | null {
    const snap = ROAD_WIDTH * 1.5;
    let best: RoadSegment | null = null;
    let bestSameDir: RoadSegment | null = null;
    for (const road of layout.roads) {
      if (road === this.road) continue;
      if (this.x >= road.x - snap && this.x <= road.x + road.w + snap &&
          this.y >= road.y - snap && this.y <= road.y + road.h + snap) {
        if (road.horizontal !== this.road.horizontal) {
          best = road;
          break;
        } else {
          bestSameDir = road;
        }
      }
    }
    return best ?? bestSameDir;
  }

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

  /**
   * Find a road segment that borders the plaza on the same side as a venue,
   * and return a position on it close to the venue.
   */
  private findPlazaBorderRoad(layout: CityLayout, venue: VenueDef):
    { road: RoadSegment; x: number; y: number; dirX: number; dirY: number } | null {

    const pb = layout.plazaBounds;
    const margin = ROAD_WIDTH * 0.8;

    for (const road of layout.roads) {
      if (venue.facingPlaza === 'bottom') {
        // Venue on top edge → road runs horizontally just above plaza top
        if (road.horizontal &&
            road.y + road.h > pb.y - ROAD_WIDTH - 2 &&
            road.y < pb.y &&
            road.x < pb.x && road.x + road.w >= pb.x - 5) {
          // Place truck at the end of this segment closest to the plaza
          const tx = Math.min(road.x + road.w - 10, pb.x - 5);
          const ty = road.y + road.h * 0.5;
          return { road, x: tx, y: ty, dirX: -1, dirY: 0 };
        }
      } else if (venue.facingPlaza === 'top') {
        // Venue on bottom edge → road runs horizontally just below plaza bottom
        if (road.horizontal &&
            road.y < pb.y + pb.h + ROAD_WIDTH + 2 &&
            road.y + road.h > pb.y + pb.h &&
            road.x < pb.x && road.x + road.w >= pb.x - 5) {
          const tx = Math.min(road.x + road.w - 10, pb.x - 5);
          const ty = road.y + road.h * 0.5;
          return { road, x: tx, y: ty, dirX: -1, dirY: 0 };
        }
      } else if (venue.facingPlaza === 'right') {
        // Venue on left edge → road runs vertically just left of plaza
        if (!road.horizontal &&
            road.x + road.w > pb.x - ROAD_WIDTH - 2 &&
            road.x < pb.x &&
            road.y < pb.y && road.y + road.h >= pb.y - 5) {
          const tx = road.x + road.w * 0.5;
          const ty = Math.min(road.y + road.h - 10, pb.y - 5);
          return { road, x: tx, y: ty, dirX: 0, dirY: -1 };
        }
      } else {
        // Venue on right edge → road runs vertically just right of plaza
        if (!road.horizontal &&
            road.x < pb.x + pb.w + ROAD_WIDTH + 2 &&
            road.x + road.w > pb.x + pb.w &&
            road.y < pb.y && road.y + road.h >= pb.y - 5) {
          const tx = road.x + road.w * 0.5;
          const ty = Math.min(road.y + road.h - 10, pb.y - 5);
          return { road, x: tx, y: ty, dirX: 0, dirY: 1 };
        }
      }
    }
    return null;
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
        this.road = this.pickRandomRoad(layout);
        this.placeOnRoad(this.road);
      }
    }
  }

  /**
   * Delivery approach: the truck drives normally on roads. When its timer
   * expires AND it's on a road that borders the plaza (within ROAD_WIDTH of
   * the plaza edge), it stops, picks a random venue, and drops a package
   * at that venue's door. Roads are clipped around the plaza so the truck
   * can never drive *inside* the plaza — it stops on the bordering road.
   */
  private updateDelivery(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[]) {

    // === PARKED: delivering a package ===
    if (this.isParkedDelivering) {
      this.vx *= 0.85;
      this.vy *= 0.85;
      this.deliveryPauseTimer++;

      // Drop the package halfway through
      if (!this.packageDropped && this.deliveryPauseTimer >= 50 && this.targetVenue) {
        const v = this.targetVenue;
        // Place package at the venue's plaza-facing entrance
        let px = v.x + v.w / 2;
        let py = v.y + v.h / 2;
        if (v.facingPlaza === 'bottom') py = v.y + v.h + 8;
        else if (v.facingPlaza === 'top') py = v.y - 8;
        else if (v.facingPlaza === 'right') px = v.x + v.w + 8;
        else px = v.x - 8;

        Car.droppedPackages.push({
          x: px, y: py,
          timer: 400 + Math.floor(Math.random() * 200),
          color: PKG_COLORS[Math.floor(Math.random() * PKG_COLORS.length)],
        });
        this.packageDropped = true;
      }

      // Done delivering — resume driving
      if (this.deliveryPauseTimer >= 120) {
        this.isParkedDelivering = false;
        this.targetVenue = null;
        this.packageDropped = false;
        this.deliveryTimer = 120 + Math.random() * 240;
        this.currentSpeed = this.baseSpeed;
        this.vx = this.dirX * this.currentSpeed;
        this.vy = this.dirY * this.currentSpeed;
      }
      return;
    }

    // === DRIVING: normal movement, count down timer ===
    this.updateNormal(layout, pedestrians, cars);
    this.deliveryTimer--;

    if (this.deliveryTimer > 0) return;
    if (layout.venues.length === 0) return;

    // Timer expired — pick a venue and drive to the nearest plaza-bordering road.
    // Roads are clipped around the plaza, so we find a road segment whose edge
    // touches the plaza bounds and teleport the truck there (like arriving at
    // a junction). This guarantees the truck visibly stops on the road next to
    // the plaza to make its delivery.
    const pb = layout.plazaBounds;
    const venue = layout.venues[Math.floor(Math.random() * layout.venues.length)];

    // Check no other truck is already delivering to this venue
    const taken = cars.some(c =>
      c !== this && c.isDelivery && c.isParkedDelivering && c.targetVenue === venue
    );
    if (taken) {
      this.deliveryTimer = 30 + Math.floor(Math.random() * 60);
      return;
    }

    // Find a road segment that borders the plaza near this venue
    const plazaRoad = this.findPlazaBorderRoad(layout, venue);
    if (plazaRoad) {
      this.road = plazaRoad.road;
      this.x = plazaRoad.x;
      this.y = plazaRoad.y;
      this.dirX = plazaRoad.dirX;
      this.dirY = plazaRoad.dirY;
      this.angle = Math.atan2(this.dirY, this.dirX);
    }

    // Park and deliver
    this.isParkedDelivering = true;
    this.targetVenue = venue;
    this.deliveryPauseTimer = 0;
    this.packageDropped = false;
    this.currentSpeed = 0;
    this.vx = 0;
    this.vy = 0;
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

      // Hazard flashers when parked
      if (this.isParkedDelivering) {
        const flash = Math.sin(Date.now() / 200) > 0;
        if (flash) {
          ctx.fillStyle = `rgba(255, 160, 0, 0.9)`;
          ctx.fillRect(-hw, -hh, 2, 2);
          ctx.fillRect(-hw, hh - 2, 2, 2);
          ctx.fillRect(hw - 2, -hh, 2, 2);
          ctx.fillRect(hw - 2, hh - 2, 2, 2);
        }
      }
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
