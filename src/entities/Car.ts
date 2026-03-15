import { CAR_SPEED, ROAD_WIDTH } from '../utils/constants';
import type { CityLayout, RoadSegment, VenueDef, PlazaEntrance, IntersectionDef } from '../city/CityLayout';
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

type CarType = 'normal' | 'delivery' | 'police' | 'ambulance' | 'firetruck';

/**
 * Delivery state machine:
 * - 'road': driving normally on roads, counting down to next delivery
 * - 'seeking_plaza': driving on roads, biasing turns toward the target entrance
 * - 'to_entrance': on a plaza-bordering road — short direct move into the entrance
 * - 'to_venue': driving across the plaza surface toward the target venue front
 * - 'delivering': parked at venue, dropping package
 * - 'to_exit': driving back toward a plaza entrance
 * - 'rejoin_road': steering from entrance back onto a nearby road
 */
type DeliveryState = 'road' | 'seeking_plaza' | 'to_entrance' | 'to_venue' | 'delivering' | 'to_exit' | 'rejoin_road';

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

  carType: CarType;

  // Delivery fields
  deliveryState: DeliveryState = 'road';
  deliveryTimer: number = 0;
  deliveryPauseTimer: number = 0;
  targetVenue: VenueDef | null = null;
  targetEntrance: PlazaEntrance | null = null;
  exitEntrance: PlazaEntrance | null = null;
  packageDropped: boolean = false;
  targetX: number = 0;
  targetY: number = 0;

  // Plaza interior waypoints (to avoid cutting through venue buildings)
  plazaWaypoints: { x: number; y: number }[] = [];
  plazaWaypointIdx: number = 0;

  // Smooth turning fields
  isTurning: boolean = false;
  turnProgress: number = 0;
  turnStartX: number = 0;
  turnStartY: number = 0;
  turnEndX: number = 0;
  turnEndY: number = 0;
  turnCenterX: number = 0;
  turnCenterY: number = 0;
  turnStartAngle: number = 0;
  turnEndAngle: number = 0;
  turnRadius: number = 0;
  turnArcLength: number = 0;
  pendingRoad: RoadSegment | null = null;
  pendingToward: { x: number; y: number } | undefined = undefined;

  // Traffic light: stopped at red
  stoppedAtLight: boolean = false;

  // Emergency fields
  sirenPhase: number = 0;

  static droppedPackages: DroppedPackage[] = [];

  constructor(layout: CityLayout, carType: CarType = 'normal') {
    this.carType = carType;

    // Speed varies by type
    switch (carType) {
      case 'delivery':
        this.baseSpeed = CAR_SPEED * (0.25 + Math.random() * 0.3);
        break;
      case 'police':
      case 'ambulance':
      case 'firetruck':
        this.baseSpeed = CAR_SPEED * (0.6 + Math.random() * 0.4);
        break;
      default:
        this.baseSpeed = CAR_SPEED * (0.3 + Math.random() * 0.4);
    }
    this.currentSpeed = this.baseSpeed;

    // Appearance
    switch (carType) {
      case 'delivery':
        this.color = DELIVERY_COLOR;
        this.length = 18;
        this.width = 9;
        break;
      case 'police':
        this.color = '#1a237e';
        this.length = 16;
        this.width = 8;
        break;
      case 'ambulance':
        this.color = '#ffffff';
        this.length = 19;
        this.width = 9;
        break;
      case 'firetruck':
        this.color = '#b71c1c';
        this.length = 22;
        this.width = 10;
        break;
      default:
        this.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
        this.length = 14 + Math.random() * 6;
        this.width = 7 + Math.random() * 2;
    }

    this.road = this.pickRandomRoad(layout);
    this.placeOnRoad(this.road);

    if (carType === 'delivery') {
      this.deliveryTimer = 150 + Math.random() * 250;
    }

    this.sirenPhase = Math.random() * Math.PI * 2;
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

  private transitionToRoad(road: RoadSegment, toward?: { x: number; y: number }) {
    const wasSameOrientation = (this.road.horizontal === road.horizontal);

    // Compute target position and direction on the new road
    let newDirX = 0, newDirY = 0, newX = this.x, newY = this.y, newAngle = 0;

    if (road.horizontal) {
      let dir: number;
      if (this.dirX !== 0) {
        dir = Math.sign(this.dirX);
      } else if (toward) {
        dir = toward.x > this.x ? 1 : -1;
      } else {
        dir = Math.random() > 0.5 ? 1 : -1;
      }
      newDirX = dir;
      newDirY = 0;
      newX = Math.max(road.x + 5, Math.min(road.x + road.w - 5, this.x));
      newY = road.y + (dir > 0 ? road.h * 0.25 : road.h * 0.75);
      newAngle = dir > 0 ? 0 : Math.PI;
    } else {
      let dir: number;
      if (this.dirY !== 0) {
        dir = Math.sign(this.dirY);
      } else if (toward) {
        dir = toward.y > this.y ? 1 : -1;
      } else {
        dir = Math.random() > 0.5 ? 1 : -1;
      }
      newDirX = 0;
      newDirY = dir;
      newY = Math.max(road.y + 5, Math.min(road.y + road.h - 5, this.y));
      newX = road.x + (dir > 0 ? road.w * 0.25 : road.w * 0.75);
      newAngle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    // For perpendicular transitions, animate a smooth turn
    if (!wasSameOrientation && this.currentSpeed > 0.05) {
      const turnR = ROAD_WIDTH * 0.4;

      // Calculate arc center: offset from current position perpendicular to current direction
      // toward the target position
      const dx = newX - this.x;
      const dy = newY - this.y;

      // Determine turn direction (clockwise or counter-clockwise)
      const cross = this.dirX * dy - this.dirY * dx;

      // Arc center is perpendicular to current travel direction
      let cx: number, cy: number;
      if (cross > 0) {
        // Turn right (clockwise looking down)
        cx = this.x + this.dirY * turnR;
        cy = this.y - this.dirX * turnR;
      } else {
        // Turn left (counter-clockwise)
        cx = this.x - this.dirY * turnR;
        cy = this.y + this.dirX * turnR;
      }

      // Calculate start and end angles on the arc
      const startA = Math.atan2(this.y - cy, this.x - cx);
      let endA = Math.atan2(newY - cy, newX - cx);

      // Ensure correct arc direction
      let angleDelta = endA - startA;
      if (cross > 0) {
        // Clockwise: angleDelta should be negative
        while (angleDelta > 0) angleDelta -= Math.PI * 2;
        while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      } else {
        // Counter-clockwise: angleDelta should be positive
        while (angleDelta < 0) angleDelta += Math.PI * 2;
        while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
      }
      endA = startA + angleDelta;

      this.isTurning = true;
      this.turnProgress = 0;
      this.turnStartX = this.x;
      this.turnStartY = this.y;
      this.turnEndX = newX;
      this.turnEndY = newY;
      this.turnCenterX = cx;
      this.turnCenterY = cy;
      this.turnStartAngle = startA;
      this.turnEndAngle = endA;
      this.turnRadius = turnR;
      this.turnArcLength = Math.abs(angleDelta) * turnR;
      this.pendingRoad = road;
      this.pendingToward = toward;
      return;
    }

    // Same orientation or too slow — snap directly
    this.road = road;
    this.dirX = newDirX;
    this.dirY = newDirY;
    this.x = newX;
    this.y = newY;
    this.angle = newAngle;
    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;
  }

  /** Move directly toward a target point (ignoring road constraints). Returns true when arrived. */
  private moveToward(tx: number, ty: number, speed: number): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < speed * 2) {
      this.x = tx;
      this.y = ty;
      return true;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    this.x += nx * speed;
    this.y += ny * speed;
    this.vx = nx * speed;
    this.vy = ny * speed;
    // Smoothly rotate toward target
    const targetAngle = Math.atan2(ny, nx);
    let angleDiff = targetAngle - this.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.angle += angleDiff * 0.15;
    return false;
  }

  /** Get the position in front of a venue's entrance (where truck should stop) */
  private getVenueDeliveryPoint(v: VenueDef): { x: number; y: number } {
    let px = v.x + v.w / 2;
    let py = v.y + v.h / 2;
    const stopDist = 20; // stop this far from venue face
    if (v.facingPlaza === 'bottom') { py = v.y + v.h + stopDist; }
    else if (v.facingPlaza === 'top') { py = v.y - stopDist; }
    else if (v.facingPlaza === 'right') { px = v.x + v.w + stopDist; }
    else { px = v.x - stopDist; }
    return { x: px, y: py };
  }

  /** Build a path through the plaza interior to avoid cutting through venue buildings.
   *  Routes: entrance → center → safe approach point → delivery point.
   *  The safe approach point is clamped to the interior zone (well past all venues/awnings)
   *  so the final segment is a short perpendicular move to the venue face. */
  private buildPlazaPath(from: { x: number; y: number }, to: { x: number; y: number }, layout: CityLayout): { x: number; y: number }[] {
    const pb = layout.plazaBounds;
    const cx = pb.x + pb.w / 2;
    const cy = pb.y + pb.h / 2;
    const safeMargin = 75; // well past venues (30h) + awnings (14) + seating (~14) + gap

    // Safe approach point: same coordinates as target but clamped to interior
    const approachX = Math.max(pb.x + safeMargin, Math.min(pb.x + pb.w - safeMargin, to.x));
    const approachY = Math.max(pb.y + safeMargin, Math.min(pb.y + pb.h - safeMargin, to.y));

    const fromEdge = this.getPlazaEdge(from, pb);
    const toEdge = this.getPlazaEdge(to, pb);

    if (fromEdge === toEdge) {
      // Same edge: approach from interior then final move to venue
      return [{ x: approachX, y: approachY }, to];
    }

    // Different edges: route through center first to stay in open interior
    return [{ x: cx, y: cy }, { x: approachX, y: approachY }, to];
  }

  private getPlazaEdge(p: { x: number; y: number }, pb: { x: number; y: number; w: number; h: number }): string {
    const distTop = Math.abs(p.y - pb.y);
    const distBot = Math.abs(p.y - (pb.y + pb.h));
    const distLeft = Math.abs(p.x - pb.x);
    const distRight = Math.abs(p.x - (pb.x + pb.w));
    const min = Math.min(distTop, distBot, distLeft, distRight);
    if (min === distTop) return 'top';
    if (min === distBot) return 'bottom';
    if (min === distLeft) return 'left';
    return 'right';
  }

  /** Find the nearest entrance to a given point */
  private findNearestEntrance(layout: CityLayout, px: number, py: number): PlazaEntrance | null {
    if (layout.entrances.length === 0) return null;
    let best = layout.entrances[0];
    let bestDist = Infinity;
    for (const e of layout.entrances) {
      const d = Math.hypot(e.x - px, e.y - py);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  /** Find the nearest road to an entrance point so the truck can rejoin traffic */
  private findNearestRoadToPoint(layout: CityLayout, px: number, py: number): RoadSegment | null {
    let best: RoadSegment | null = null;
    let bestDist = Infinity;
    for (const road of layout.roads) {
      // distance from point to road center
      const cx = road.x + road.w / 2;
      const cy = road.y + road.h / 2;
      const d = Math.hypot(cx - px, cy - py);
      if (d < bestDist) { bestDist = d; best = road; }
    }
    return best;
  }

  /**
   * Check if the truck is currently close to the target entrance (on a plaza-bordering road).
   * Returns true if within striking distance of the entrance.
   */
  private isNearEntrance(entrance: PlazaEntrance): boolean {
    return Math.hypot(this.x - entrance.x, this.y - entrance.y) < ROAD_WIDTH * 2;
  }

  /**
   * When at a road junction and seeking the plaza, pick the connecting road
   * that brings us closest to the target entrance. Falls back to normal
   * connecting-road logic if nothing better is found.
   */
  private findConnectingRoadToward(layout: CityLayout, tx: number, ty: number): RoadSegment | null {
    const snap = ROAD_WIDTH * 1.5;
    let best: RoadSegment | null = null;
    let bestDist = Infinity;
    for (const road of layout.roads) {
      if (road === this.road) continue;
      if (this.x >= road.x - snap && this.x <= road.x + road.w + snap &&
          this.y >= road.y - snap && this.y <= road.y + road.h + snap) {
        // Score by how close road midpoint is to the target
        const cx = road.x + road.w / 2;
        const cy = road.y + road.h / 2;
        const d = Math.hypot(cx - tx, cy - ty);
        if (d < bestDist) { bestDist = d; best = road; }
      }
    }
    return best;
  }

  /** Check if the car is approaching an intersection with a red/yellow light */
  private getTrafficSignal(layout: CityLayout, trafficPhase: number): 'green' | 'yellow' | 'red' {
    const lookAhead = 40;
    const frontX = this.x + this.dirX * lookAhead;
    const frontY = this.y + this.dirY * lookAhead;

    for (const inter of layout.intersections) {
      const dist = Math.hypot(inter.x - this.x, inter.y - this.y);
      if (dist > 50) continue;

      // Check if we're approaching (not past) the intersection
      const toInterX = inter.x - this.x;
      const toInterY = inter.y - this.y;
      const dotAlong = toInterX * this.dirX + toInterY * this.dirY;
      if (dotAlong < 5 || dotAlong > 45) continue;

      // Determine if car is moving horizontally or vertically
      const isHorizontal = Math.abs(this.dirX) > Math.abs(this.dirY);

      let signal: 'green' | 'yellow' | 'red';
      if (trafficPhase < 0.45) {
        signal = isHorizontal ? 'green' : 'red';
      } else if (trafficPhase < 0.50) {
        signal = 'yellow';
      } else if (trafficPhase < 0.95) {
        signal = isHorizontal ? 'red' : 'green';
      } else {
        signal = 'yellow';
      }
      return signal;
    }
    return 'green';
  }

  update(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number = 0) {
    // Handle smooth turning animation
    if (this.isTurning) {
      this.turnProgress += this.currentSpeed / Math.max(this.turnArcLength, 1);
      if (this.turnProgress >= 1) {
        // Finish turn
        this.isTurning = false;
        this.x = this.turnEndX;
        this.y = this.turnEndY;
        this.angle = this.turnEndAngle;
        if (this.pendingRoad) {
          this.road = this.pendingRoad;
          // Set direction based on turn end angle
          if (this.pendingRoad.horizontal) {
            this.dirX = Math.cos(this.turnEndAngle) > 0 ? 1 : -1;
            this.dirY = 0;
            this.angle = this.dirX > 0 ? 0 : Math.PI;
          } else {
            this.dirX = 0;
            this.dirY = Math.sin(this.turnEndAngle) > 0 ? 1 : -1;
            this.angle = this.dirY > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          this.vx = this.dirX * this.currentSpeed;
          this.vy = this.dirY * this.currentSpeed;
          this.pendingRoad = null;
        }
      } else {
        // Interpolate along arc
        const t = this.turnProgress;
        const a = this.turnStartAngle + (this.turnEndAngle - this.turnStartAngle) * t;
        this.x = this.turnCenterX + Math.cos(a) * this.turnRadius;
        this.y = this.turnCenterY + Math.sin(a) * this.turnRadius;
        // Car visual angle is tangent to arc
        this.angle = a + Math.PI / 2;
        // Adjust angle direction based on whether we're turning CW or CCW
        if (this.turnEndAngle < this.turnStartAngle) {
          this.angle = a - Math.PI / 2;
        }
      }
      // Update siren phase for emergency vehicles
      if (this.carType === 'police' || this.carType === 'ambulance' || this.carType === 'firetruck') {
        this.sirenPhase += 0.15;
      }
      return;
    }

    if (this.carType === 'delivery') {
      this.updateDelivery(layout, pedestrians, cars, trafficPhase);
    } else {
      this.updateNormal(layout, pedestrians, cars, trafficPhase);
    }

    // Update siren phase for emergency vehicles
    if (this.carType === 'police' || this.carType === 'ambulance' || this.carType === 'firetruck') {
      this.sirenPhase += 0.15;
    }
  }

  private updateNormal(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number) {
    let targetSpeed = this.baseSpeed;
    const frontX = this.x + this.dirX * this.length * 0.5;
    const frontY = this.y + this.dirY * this.length * 0.5;

    // Traffic light check (emergency vehicles ignore)
    const isEmergency = this.carType === 'police' || this.carType === 'ambulance' || this.carType === 'firetruck';
    if (!isEmergency) {
      const signal = this.getTrafficSignal(layout, trafficPhase);
      if (signal === 'red') {
        targetSpeed = 0;
      } else if (signal === 'yellow') {
        // Check distance to intersection — stop if far, continue if close
        for (const inter of layout.intersections) {
          const dist = Math.hypot(inter.x - this.x, inter.y - this.y);
          if (dist > 50) continue;
          const dotAlong = (inter.x - this.x) * this.dirX + (inter.y - this.y) * this.dirY;
          if (dotAlong > 20) {
            targetSpeed = 0; // far enough to stop
          }
          break;
        }
      }
    }

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
   * Delivery truck state machine: drives on roads toward the plaza,
   * then enters through an entrance to deliver packages to venue fronts.
   */
  private updateDelivery(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number = 0) {
    const plazaSpeed = this.baseSpeed * 0.6; // slow inside plaza

    switch (this.deliveryState) {
      case 'road': {
        // Normal road driving, count down to next delivery
        this.updateNormal(layout, pedestrians, cars, trafficPhase);
        this.deliveryTimer--;
        if (this.deliveryTimer <= 0 && layout.venues.length > 0) {
          // Pick a random venue that no other truck is targeting
          const available = layout.venues.filter(v =>
            !cars.some(c => c !== this && c.carType === 'delivery' &&
              c.deliveryState !== 'road' && c.targetVenue === v)
          );
          if (available.length === 0) {
            this.deliveryTimer = 60;
            return;
          }
          const venue = available[Math.floor(Math.random() * available.length)];
          this.targetVenue = venue;

          // Find entrance nearest to the delivery point
          const deliveryPt = this.getVenueDeliveryPoint(venue);
          this.targetEntrance = this.findNearestEntrance(layout, deliveryPt.x, deliveryPt.y);
          if (!this.targetEntrance) {
            this.deliveryTimer = 60;
            this.targetVenue = null;
            return;
          }

          // Switch to seeking_plaza — keep driving on roads but bias toward entrance
          this.deliveryState = 'seeking_plaza';
        }
        break;
      }

      case 'seeking_plaza': {
        // Drive on roads normally, but when reaching a junction pick
        // the road closest to the target entrance. Once close enough
        // to the entrance, switch to direct movement into the plaza.
        if (!this.targetEntrance) { this.deliveryState = 'road'; break; }

        // Check if we're close enough to the entrance to leave the road
        if (this.isNearEntrance(this.targetEntrance)) {
          this.targetX = this.targetEntrance.x;
          this.targetY = this.targetEntrance.y;
          this.deliveryState = 'to_entrance';
          break;
        }

        // Drive on road with pedestrian/car avoidance + traffic lights
        let targetSpeed = this.baseSpeed;

        // Traffic light check for delivery trucks
        const signal = this.getTrafficSignal(layout, trafficPhase);
        if (signal === 'red') {
          targetSpeed = 0;
        } else if (signal === 'yellow') {
          for (const inter of layout.intersections) {
            const dist = Math.hypot(inter.x - this.x, inter.y - this.y);
            if (dist > 50) continue;
            const dotAlong = (inter.x - this.x) * this.dirX + (inter.y - this.y) * this.dirY;
            if (dotAlong > 20) targetSpeed = 0;
            break;
          }
        }

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

        // When leaving current road, bias toward a road closer to the entrance
        if (this.isOutsideRoad()) {
          const biased = this.findConnectingRoadToward(
            layout, this.targetEntrance.x, this.targetEntrance.y
          );
          const toward = { x: this.targetEntrance.x, y: this.targetEntrance.y };
          if (biased) {
            this.transitionToRoad(biased, toward);
          } else {
            // Fallback: pick any connecting road
            const connecting = this.findConnectingRoad(layout);
            if (connecting) {
              this.transitionToRoad(connecting, toward);
            } else {
              this.road = this.pickRandomRoad(layout);
              this.placeOnRoad(this.road);
            }
          }
        }
        break;
      }

      case 'to_entrance': {
        // Short direct drive from the plaza-bordering road into the entrance
        const arrived = this.moveToward(this.targetX, this.targetY, plazaSpeed);
        if (arrived && this.targetVenue) {
          // Build path through plaza center to avoid cutting through venues
          const dp = this.getVenueDeliveryPoint(this.targetVenue);
          this.plazaWaypoints = this.buildPlazaPath(
            { x: this.x, y: this.y }, dp, layout
          );
          this.plazaWaypointIdx = 0;
          const wp = this.plazaWaypoints[0];
          this.targetX = wp.x;
          this.targetY = wp.y;
          this.deliveryState = 'to_venue';
        }
        break;
      }

      case 'to_venue': {
        // Follow plaza waypoints to the venue front
        const arrived = this.moveToward(this.targetX, this.targetY, plazaSpeed * 0.7);
        if (arrived) {
          this.plazaWaypointIdx++;
          if (this.plazaWaypointIdx < this.plazaWaypoints.length) {
            const wp = this.plazaWaypoints[this.plazaWaypointIdx];
            this.targetX = wp.x;
            this.targetY = wp.y;
            break;
          }
          this.deliveryState = 'delivering';
          this.deliveryPauseTimer = 0;
          this.packageDropped = false;
          this.currentSpeed = 0;
          this.vx = 0;
          this.vy = 0;
        }
        break;
      }

      case 'delivering': {
        // Parked at venue, drop package
        this.vx = 0;
        this.vy = 0;
        this.deliveryPauseTimer++;

        if (!this.packageDropped && this.deliveryPauseTimer >= 50 && this.targetVenue) {
          const v = this.targetVenue;
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

        if (this.deliveryPauseTimer >= 120) {
          // Done — head back out to an exit entrance
          this.exitEntrance = this.findNearestEntrance(layout, this.x, this.y);
          if (this.exitEntrance) {
            this.plazaWaypoints = this.buildPlazaPath(
              { x: this.x, y: this.y },
              { x: this.exitEntrance.x, y: this.exitEntrance.y },
              layout
            );
            this.plazaWaypointIdx = 0;
            const wp = this.plazaWaypoints[0];
            this.targetX = wp.x;
            this.targetY = wp.y;
          }
          this.deliveryState = 'to_exit';
        }
        break;
      }

      case 'to_exit': {
        // Follow plaza waypoints back toward an entrance
        const arrived = this.moveToward(this.targetX, this.targetY, plazaSpeed);
        if (arrived) {
          this.plazaWaypointIdx++;
          if (this.plazaWaypointIdx < this.plazaWaypoints.length) {
            const wp = this.plazaWaypoints[this.plazaWaypointIdx];
            this.targetX = wp.x;
            this.targetY = wp.y;
            break;
          }
          // Find nearest road to rejoin
          const nearRoad = this.findNearestRoadToPoint(layout, this.x, this.y);
          if (nearRoad) {
            this.targetX = nearRoad.x + nearRoad.w / 2;
            this.targetY = nearRoad.y + nearRoad.h / 2;
            this.road = nearRoad;
          }
          this.deliveryState = 'rejoin_road';
        }
        break;
      }

      case 'rejoin_road': {
        // Drive from entrance to the nearest road
        const arrived = this.moveToward(this.targetX, this.targetY, plazaSpeed);
        if (arrived) {
          // Snap onto road — bias direction away from plaza
          const roadCenter = { x: this.road.x + this.road.w / 2, y: this.road.y + this.road.h / 2 };
          this.transitionToRoad(this.road, roadCenter);
          this.deliveryState = 'road';
          this.targetVenue = null;
          this.targetEntrance = null;
          this.exitEntrance = null;
          this.deliveryTimer = 200 + Math.random() * 300;
          this.currentSpeed = this.baseSpeed;
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
    const darkFactor = 1 - nightAlpha * 0.4;
    const r = parseInt(this.color.slice(1, 3), 16);
    const g = parseInt(this.color.slice(3, 5), 16);
    const b = parseInt(this.color.slice(5, 7), 16);

    // Shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + nightAlpha * 0.1})`;
    ctx.fillRect(-this.length / 2 + 1.5, -this.width / 2 + 1.5, this.length, this.width);

    // Car body
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

    // Type-specific details
    this.drawTypeDetails(ctx, nightAlpha, darkFactor, hw, hh, r, g, b);

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

  private drawTypeDetails(
    ctx: CanvasRenderingContext2D, nightAlpha: number, darkFactor: number,
    hw: number, hh: number, r: number, g: number, b: number
  ) {
    const isParked = this.deliveryState === 'delivering';
    const flash = Math.sin(Date.now() / 200) > 0;

    switch (this.carType) {
      case 'delivery': {
        // Cargo box on back
        ctx.fillStyle = `rgb(${Math.floor(r * darkFactor * 0.75)}, ${Math.floor(g * darkFactor * 0.75)}, ${Math.floor(b * darkFactor * 0.75)})`;
        ctx.fillRect(-hw + 1, -hh + 1.5, this.length * 0.42, this.width - 3);
        ctx.strokeStyle = `rgba(0,0,0,0.25)`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-hw + 1, -hh + 1.5, this.length * 0.42, this.width - 3);

        // Hazard flashers when in the plaza (not on roads)
        if (this.deliveryState !== 'road' && this.deliveryState !== 'seeking_plaza') {
          if (flash) {
            ctx.fillStyle = `rgba(255, 160, 0, 0.9)`;
            ctx.fillRect(-hw, -hh, 2, 2);
            ctx.fillRect(-hw, hh - 2, 2, 2);
            ctx.fillRect(hw - 2, -hh, 2, 2);
            ctx.fillRect(hw - 2, hh - 2, 2, 2);
          }
        }
        break;
      }

      case 'police': {
        // Light bar on roof
        const sirenOn = Math.sin(this.sirenPhase) > 0;
        const sirenOn2 = Math.sin(this.sirenPhase + Math.PI) > 0;
        // Blue light (left)
        ctx.fillStyle = sirenOn ? 'rgba(0, 100, 255, 0.95)' : 'rgba(0, 60, 150, 0.5)';
        ctx.fillRect(-2, -hh + 1, 3, 2);
        // Red light (right)
        ctx.fillStyle = sirenOn2 ? 'rgba(255, 0, 0, 0.95)' : 'rgba(150, 0, 0, 0.5)';
        ctx.fillRect(-2, hh - 3, 3, 2);

        // Light glow at night
        if (nightAlpha > 0.1) {
          if (sirenOn) {
            const grad = ctx.createRadialGradient(-1, -hh, 0, -1, -hh, 20);
            grad.addColorStop(0, `rgba(0, 100, 255, ${nightAlpha * 0.3})`);
            grad.addColorStop(1, 'rgba(0, 100, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(-21, -hh - 20, 40, 40);
          }
          if (sirenOn2) {
            const grad = ctx.createRadialGradient(-1, hh, 0, -1, hh, 20);
            grad.addColorStop(0, `rgba(255, 0, 0, ${nightAlpha * 0.3})`);
            grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(-21, hh - 20, 40, 40);
          }
        }

        // Side stripe
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * darkFactor})`;
        ctx.fillRect(-hw + 3, -hh, this.length - 6, 1.5);
        ctx.fillRect(-hw + 3, hh - 1.5, this.length - 6, 1.5);
        break;
      }

      case 'ambulance': {
        // Red cross marking
        ctx.fillStyle = `rgba(220, 30, 30, ${0.85 * darkFactor})`;
        ctx.fillRect(-3, -1, 6, 2);
        ctx.fillRect(-1, -3, 2, 6);

        // Red stripe down the sides
        ctx.fillStyle = `rgba(220, 30, 30, ${0.6 * darkFactor})`;
        ctx.fillRect(-hw + 2, -hh, this.length - 4, 1.5);
        ctx.fillRect(-hw + 2, hh - 1.5, this.length - 4, 1.5);

        // Light bar
        const sirenOn = Math.sin(this.sirenPhase) > 0;
        ctx.fillStyle = sirenOn ? 'rgba(255, 0, 0, 0.95)' : 'rgba(150, 0, 0, 0.5)';
        ctx.fillRect(hw * 0.2, -hh + 1, 3, 2);
        ctx.fillStyle = !sirenOn ? 'rgba(255, 0, 0, 0.95)' : 'rgba(150, 0, 0, 0.5)';
        ctx.fillRect(hw * 0.2, hh - 3, 3, 2);

        if (nightAlpha > 0.1 && sirenOn) {
          const grad = ctx.createRadialGradient(hw * 0.2, 0, 0, hw * 0.2, 0, 25);
          grad.addColorStop(0, `rgba(255, 0, 0, ${nightAlpha * 0.25})`);
          grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(hw * 0.2 - 25, -25, 50, 50);
        }
        break;
      }

      case 'firetruck': {
        // Equipment strip (lighter red side panel)
        ctx.fillStyle = `rgba(200, 50, 50, ${0.7 * darkFactor})`;
        ctx.fillRect(-hw + 2, -hh + 1.5, this.length * 0.5, this.width - 3);

        // Chrome bumper
        ctx.fillStyle = `rgba(200, 200, 210, ${0.6 * darkFactor})`;
        ctx.fillRect(hw - 2, -hh + 1, 2, this.width - 2);

        // Ladder rack (top-down view: thin lines)
        ctx.strokeStyle = `rgba(160, 160, 170, ${0.7 * darkFactor})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-hw + 4, -hh + 2.5);
        ctx.lineTo(hw * 0.3, -hh + 2.5);
        ctx.moveTo(-hw + 4, hh - 2.5);
        ctx.lineTo(hw * 0.3, hh - 2.5);
        ctx.stroke();

        // Light bar
        const sirenOn = Math.sin(this.sirenPhase) > 0;
        ctx.fillStyle = sirenOn ? 'rgba(255, 0, 0, 0.95)' : 'rgba(150, 0, 0, 0.5)';
        ctx.fillRect(hw * 0.3, -hh + 0.5, 4, 2);
        ctx.fillStyle = !sirenOn ? 'rgba(255, 255, 255, 0.95)' : 'rgba(180, 180, 180, 0.5)';
        ctx.fillRect(hw * 0.3, hh - 2.5, 4, 2);

        if (nightAlpha > 0.1 && sirenOn) {
          const grad = ctx.createRadialGradient(hw * 0.3, 0, 0, hw * 0.3, 0, 30);
          grad.addColorStop(0, `rgba(255, 50, 0, ${nightAlpha * 0.3})`);
          grad.addColorStop(1, 'rgba(255, 50, 0, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(hw * 0.3 - 30, -30, 60, 60);
        }
        break;
      }
    }
  }
}
