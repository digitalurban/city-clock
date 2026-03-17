import { CAR_SPEED, ROAD_WIDTH } from '../utils/constants';
import type { CityLayout, RoadSegment, VenueDef, PlazaEntrance, IntersectionDef, DeliveryLane } from '../city/CityLayout';
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

type CarType = 'normal' | 'delivery' | 'police' | 'ambulance' | 'firetruck' | 'bus' | 'garbage';

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
type DeliveryState = 'road' | 'seeking_plaza' | 'to_venue' | 'delivering' | 'to_exit' | 'rejoin_road';

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

  // Plaza interior waypoints (lane entry → lateral move → delivery point)
  plazaWaypoints: { x: number; y: number }[] = [];
  plazaWaypointIdx: number = 0;

  // Delivery lane selected for this delivery run
  selectedLane: DeliveryLane | null = null;
  // Frames spent seeking the lane entry (timeout safety)
  seekingLaneTimer: number = 0;

  // Smooth angle interpolation
  private angleTarget: number = 0;
  private stuckTimer: number = 0;

  // Bezier arc turning
  private drivingPhase: 'road' | 'turning' = 'road';
  private arcP0 = { x: 0, y: 0 };
  private arcP1 = { x: 0, y: 0 };
  private arcP2 = { x: 0, y: 0 };
  private arcT: number = 0;
  private arcLength: number = 1;
  private arcExitRoad: RoadSegment | null = null;
  private arcExitDirX: number = 0;
  private arcExitDirY: number = 0;
  // Pre-resolved turn for red-light stops (eliminates stop-then-jump)
  private pendingTurnRoad: RoadSegment | null = null;
  private pendingTurnInter: IntersectionDef | null = null;

  // Bus stop FSM
  private busState: 'road' | 'stopping' | 'dwell' | 'departing' = 'road';
  private busStopTimer: number = 0;
  private busDwellTimer: number = 0;
  private busDwellDuration: number = 0;
  private busPassengerDots: { ox: number; oy: number; appearing: boolean; alpha: number }[] = [];
  private busDoorsOpen: boolean = false;

  // Garbage truck FSM
  private garbageState: 'road' | 'collecting' = 'road';
  private garbageStopTimer: number = 0;
  private garbageDwellTimer: number = 0;
  private garbageDwellDuration: number = 0;

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
      case 'bus':
        this.baseSpeed = CAR_SPEED * (0.35 + Math.random() * 0.1);
        break;
      case 'garbage':
        this.baseSpeed = CAR_SPEED * (0.3 + Math.random() * 0.1);
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
      case 'bus':
        this.color = Math.random() > 0.5 ? '#c0392b' : '#2980b9'; // Red or blue
        this.length = 32;
        this.width = 11;
        break;
      case 'garbage':
        this.color = '#27ae60'; // Green
        this.length = 26;
        this.width = 11;
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
    if (carType === 'bus') {
      this.busStopTimer = 200 + Math.floor(Math.random() * 200);
    }
    if (carType === 'garbage') {
      this.garbageStopTimer = 50 + Math.floor(Math.random() * 100);
    }

    this.sirenPhase = Math.random() * Math.PI * 2;
  }

  private reverseDirection() {
    this.dirX *= -1;
    this.dirY *= -1;
    this.angle += Math.PI;
    while (this.angle > Math.PI) this.angle -= Math.PI * 2;
    while (this.angle < -Math.PI) this.angle += Math.PI * 2;

    // Shift to the other lane
    if (this.road.horizontal) {
      const midY = this.road.y + this.road.h / 2;
      const offset = this.y - midY;
      this.y = midY - offset;
    } else {
      const midX = this.road.x + this.road.w / 2;
      const offset = this.x - midX;
      this.x = midX - offset;
    }
    this.currentSpeed *= 0.5; // slow down after reversing
  }

  // ── Bezier helpers ─────────────────────────────────────────────────────────

  private bezierPoint(
    p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, t: number
  ) {
    const u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
             y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
  }

  private bezierTangent(
    p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, t: number
  ) {
    const tx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const ty = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const len = Math.hypot(tx, ty) || 1;
    return { x: tx / len, y: ty / len };
  }

  private computeArcLength(
    p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }
  ): number {
    let sum = 0;
    let prev = p0;
    for (let i = 1; i <= 10; i++) {
      const pt = this.bezierPoint(p0, p1, p2, i / 10);
      sum += Math.hypot(pt.x - prev.x, pt.y - prev.y);
      prev = pt;
    }
    return sum || 1;
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
      // Right-side traffic: Right (dirX=1) is bottom (0.75), Left (dirX=-1) is top (0.25)
      this.y = road.y + (direction > 0 ? road.h * 0.75 : road.h * 0.25);
      this.dirX = direction;
      this.dirY = 0;
      this.angle = direction > 0 ? 0 : Math.PI;
    } else {
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.y = road.y + Math.random() * road.h;
      // Right-side traffic: Down (dirY=1) is left (0.25), Up (dirY=-1) is right (0.75)
      this.x = road.x + (direction > 0 ? road.w * 0.25 : road.w * 0.75);
      this.dirX = 0;
      this.dirY = direction;
      this.angle = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // angleTarget must match angle on spawn — otherwise the lerp drags cars sideways
    this.angleTarget = this.angle;
    this.vx = this.dirX * this.baseSpeed;
    this.vy = this.dirY * this.baseSpeed;
  }

  private isOutsideRoad(): boolean {
    const r = this.road;
    const margin = 5;
    const roadMargin = 10;
    if (r.horizontal) {
      const offEnds = this.x < r.x - margin || this.x > r.x + r.w + margin;
      const lateral = Math.abs(this.y - (r.y + r.h / 2)) > r.h / 2 + roadMargin;
      return offEnds || lateral;
    } else {
      const offEnds = this.y < r.y - margin || this.y > r.y + r.h + margin;
      const lateral = Math.abs(this.x - (r.x + r.w / 2)) > r.w / 2 + roadMargin;
      return offEnds || lateral;
    }
  }

  private findConnectingRoad(layout: CityLayout, perpOnly: boolean = false): RoadSegment | null {
    const snap = ROAD_WIDTH * 2.0;
    let fallback: RoadSegment | null = null;

    for (const road of layout.roads) {
      if (road === this.road) continue;

      if (this.x >= road.x - snap && this.x <= road.x + road.w + snap &&
        this.y >= road.y - snap && this.y <= road.y + road.h + snap) {

        // Prefer perpendicular roads (turns at intersections)
        if (road.horizontal !== this.road.horizontal) {
          return road;
        }
        if (!perpOnly) fallback = road;
      }
    }
    return fallback;
  }

  /**
   * Find the next intersection along the car's current direction of travel.
   * Returns the intersection and estimated distance to it.
   */
  private findNextIntersection(layout: CityLayout): { inter: IntersectionDef; dist: number } | null {
    let best: { inter: IntersectionDef; dist: number } | null = null;

    for (const inter of layout.intersections) {
      // The intersection must be ahead of us, on our road's axis
      let ahead = false;
      let dist = 0;
      if (this.road.horizontal) {
        // Check intersection is within our road's Y band
        if (Math.abs(inter.y - (this.road.y + this.road.h / 2)) > this.road.h) continue;
        const dx = inter.x - this.x;
        ahead = (dx * this.dirX) > 0; // same sign = ahead in our direction
        dist = Math.abs(dx);
      } else {
        if (Math.abs(inter.x - (this.road.x + this.road.w / 2)) > this.road.w) continue;
        const dy = inter.y - this.y;
        ahead = (dy * this.dirY) > 0;
        dist = Math.abs(dy);
      }
      if (!ahead) continue;
      if (!best || dist < best.dist) best = { inter, dist };
    }
    return best;
  }

  /**
   * Find a perpendicular road that connects at the given intersection point.
   */
  private findRoadAtIntersection(layout: CityLayout, ix: number, iy: number): RoadSegment | null {
    const snap = ROAD_WIDTH * 2.0;
    for (const road of layout.roads) {
      if (road === this.road) continue;
      if (road.horizontal === this.road.horizontal) continue; // must be perpendicular
      if (ix >= road.x - snap && ix <= road.x + road.w + snap &&
        iy >= road.y - snap && iy <= road.y + road.h + snap) {
        return road;
      }
    }
    return null;
  }

  /**
   * Begin a Bezier arc turn through an intersection.
   * Sets drivingPhase='turning' and stores arc control points P0/P1/P2.
   */
  private beginTurningArc(inter: IntersectionDef, exitRoad: RoadSegment, _layout: CityLayout) {
    // Determine exit direction from exitRoad + car position relative to intersection
    let newDirX = 0;
    let newDirY = 0;
    if (exitRoad.horizontal) {
      newDirX = this.x < inter.x ? 1 : -1;
      newDirY = 0;
    } else {
      newDirX = 0;
      newDirY = this.y < inter.y ? 1 : -1;
    }

    // Straight-through: skip arc, call transitionToRoad directly
    if (newDirX === this.dirX && newDirY === this.dirY) {
      this.transitionToRoad(exitRoad);
      return;
    }
    // U-turn: reverse direction
    if (newDirX === -this.dirX && newDirY === -this.dirY) {
      this.reverseDirection();
      return;
    }

    // Entry lane position on current road
    let entryLaneX = this.x;
    let entryLaneY = this.y;
    if (this.road.horizontal) {
      entryLaneY = this.road.y + (this.dirX > 0 ? this.road.h * 0.75 : this.road.h * 0.25);
    } else {
      entryLaneX = this.road.x + (this.dirY > 0 ? this.road.w * 0.25 : this.road.w * 0.75);
    }

    // Exit lane position on exit road
    let exitLaneX = inter.x;
    let exitLaneY = inter.y;
    if (exitRoad.horizontal) {
      exitLaneY = exitRoad.y + (newDirX > 0 ? exitRoad.h * 0.75 : exitRoad.h * 0.25);
    } else {
      exitLaneX = exitRoad.x + (newDirY > 0 ? exitRoad.w * 0.25 : exitRoad.w * 0.75);
    }

    // P0: intersection entry, snapped to entry lane
    let P0: { x: number; y: number };
    if (this.road.horizontal) {
      P0 = { x: inter.x - this.dirX * 18, y: entryLaneY };
    } else {
      P0 = { x: entryLaneX, y: inter.y - this.dirY * 18 };
    }

    // P2: intersection exit, snapped to exit lane
    let P2: { x: number; y: number };
    if (exitRoad.horizontal) {
      P2 = { x: inter.x + newDirX * 18, y: exitLaneY };
    } else {
      P2 = { x: exitLaneX, y: inter.y + newDirY * 18 };
    }

    // P1 depends on turn type
    // Cross product: dirX*newDirY - dirY*newDirX > 0 → right turn (tight)
    let P1: { x: number; y: number };
    const cross = this.dirX * newDirY - this.dirY * newDirX;
    if (cross > 0) {
      // Right turn — tight corner: P1 at corner of lane centre-lines
      if (this.road.horizontal) {
        P1 = { x: P2.x, y: P0.y };
      } else {
        P1 = { x: P0.x, y: P2.y };
      }
    } else {
      // Left turn — wide sweep through intersection centre
      P1 = { x: inter.x, y: inter.y };
    }

    // Snap car to P0
    this.x = P0.x;
    this.y = P0.y;

    this.arcP0 = P0;
    this.arcP1 = P1;
    this.arcP2 = P2;
    this.arcT = 0;
    this.arcLength = this.computeArcLength(P0, P1, P2);
    this.arcExitRoad = exitRoad;
    this.arcExitDirX = newDirX;
    this.arcExitDirY = newDirY;
    this.drivingPhase = 'turning';
    this.stuckTimer = 0;
  }

  /**
   * Check if the car is approaching the end of its current road.
   * Returns true if within `lookahead` pixels of the road end in the direction of travel.
   */
  private isApproachingRoadEnd(layout: CityLayout): boolean {
    const r = this.road;
    // Use a generous lookahead so we pick up the turn in time
    const lookahead = this.length * 4 + 30;

    if (r.horizontal) {
      if (this.dirX > 0 && this.x > r.x + r.w - lookahead) return true;
      if (this.dirX < 0 && this.x < r.x + lookahead) return true;
    } else {
      if (this.dirY > 0 && this.y > r.y + r.h - lookahead) return true;
      if (this.dirY < 0 && this.y < r.y + lookahead) return true;
    }
    return false;
  }

  /**
   * Transition to a new road. Snaps the car to the correct lane position
   * immediately, then lets the visual angle interpolate smoothly.
   * This avoids all the Bezier flickering problems.
   */

  private updateTurningArc() {
    // Advance t proportional to speed / arc length
    this.arcT = Math.min(1, this.arcT + this.currentSpeed / this.arcLength);

    const pt = this.bezierPoint(this.arcP0, this.arcP1, this.arcP2, this.arcT);
    this.x = pt.x;
    this.y = pt.y;

    const tan = this.bezierTangent(this.arcP0, this.arcP1, this.arcP2, this.arcT);
    this.angle = Math.atan2(tan.y, tan.x);
    this.angleTarget = this.angle;

    if (this.arcT >= 1) {
      // Commit to exit road
      this.road = this.arcExitRoad!;
      this.dirX = this.arcExitDirX;
      this.dirY = this.arcExitDirY;
      // Snap angle to exact cardinal direction (no drift from curve tangent)
      this.angle = Math.atan2(this.dirY, this.dirX);
      this.angleTarget = this.angle;
      // Snap to exact lane centre
      if (this.road.horizontal) {
        this.y = this.road.y + (this.dirX > 0 ? this.road.h * 0.75 : this.road.h * 0.25);
      } else {
        this.x = this.road.x + (this.dirY > 0 ? this.road.w * 0.25 : this.road.w * 0.75);
      }
      this.vx = this.dirX * this.currentSpeed;
      this.vy = this.dirY * this.currentSpeed;
      this.arcExitRoad = null;
      this.drivingPhase = 'road';
    }
  }

  private updateTurningAvoidance(pedestrians: Pedestrian[], cars: Car[]) {
    // Check from current position AND a point slightly ahead on the arc
    const cx = this.x;
    const cy = this.y;
    const aheadT = Math.min(1, this.arcT + 0.15);
    const ahead = this.bezierPoint(this.arcP0, this.arcP1, this.arcP2, aheadT);
    const SLOW_DIST = 22;
    const STOP_DIST = 12;

    for (const p of pedestrians) {
      const d1 = Math.hypot(cx - p.x, cy - p.y);
      const d2 = Math.hypot(ahead.x - p.x, ahead.y - p.y);
      const d = Math.min(d1, d2);
      if (d < STOP_DIST) { this.currentSpeed = 0; return; }
      if (d < SLOW_DIST) { this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.3); return; }
    }
    for (const c of cars) {
      if (c === this) continue;
      const d1 = Math.hypot(cx - c.x, cy - c.y);
      const d2 = Math.hypot(ahead.x - c.x, ahead.y - c.y);
      const d = Math.min(d1, d2);
      if (d < STOP_DIST + 8) { this.currentSpeed = 0; return; }
      if (d < SLOW_DIST + 12) { this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.4); return; }
    }
    // Recover speed
    if (this.currentSpeed < this.baseSpeed) {
      this.currentSpeed = Math.min(this.baseSpeed, this.currentSpeed + this.baseSpeed * 0.05);
    }
  }

  private transitionToRoad(road: RoadSegment) {
    this.stuckTimer = 0;
    const oldDirX = this.dirX;
    const oldDirY = this.dirY;
    this.road = road;

    if (road.horizontal) {
      const dirX = this.dirX !== 0 ? Math.sign(this.dirX) :
        (this.x < road.x + road.w / 2 ? 1 : -1);
      this.dirX = dirX;
      this.dirY = 0;
      this.y = road.y + (dirX > 0 ? road.h * 0.75 : road.h * 0.25);
      this.angleTarget = dirX > 0 ? 0 : Math.PI;
    } else {
      const dirY = this.dirY !== 0 ? Math.sign(this.dirY) :
        (this.y < road.y + road.h / 2 ? 1 : -1);
      this.dirX = 0;
      this.dirY = dirY;
      this.x = road.x + (dirY > 0 ? road.w * 0.25 : road.w * 0.75);
      this.angleTarget = dirY > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;
  }

  /**
   * Check for collisions with buildings, houses, and venues.
   * Returns a nudge vector {x, y} to push the car away from obstacles.
   */
  private checkObstacles(layout: CityLayout, nextX: number, nextY: number): { nx: number; ny: number } | null {
    const m = 10; // Margin
    const allObstacles = [...layout.buildings, ...layout.venues, ...layout.houses];

    for (const b of allObstacles) {
      // Don't collide with target venue if we are delivering or heading to it
      if (this.targetVenue && b === this.targetVenue &&
        (this.deliveryState === 'to_venue' || this.deliveryState === 'delivering')) continue;

      if (nextX >= b.x - m && nextX <= b.x + b.w + m &&
        nextY >= b.y - m && nextY <= b.y + b.h + m) {

        // Find center of building
        const bCx = b.x + b.w / 2;
        const bCy = b.y + b.h / 2;

        // Push away from center
        let dx = nextX - bCx;
        let dy = nextY - bCy;

        // If we are deep inside the building, provide a stronger directional push
        const dist = Math.hypot(dx, dy) || 1;
        return { nx: dx / dist, ny: dy / dist };
      }
    }
    return null;
  }

  /** Move directly toward a target point with building collision avoidance. Returns true when arrived. */
  private moveToward(tx: number, ty: number, speed: number, layout?: CityLayout): boolean {
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

    let moveX = nx * speed;
    let moveY = ny * speed;

    // Building collision: if next position hits an obstacle, cancel the component
    // moving into it. This prevents sliding sideways into walls.
    if (layout) {
      const nextX = this.x + moveX;
      const nextY = this.y + moveY;
      const obstacle = this.checkObstacles(layout, nextX, nextY);
      if (obstacle) {
        // Project motion away from obstacle surface (remove "into" component)
        const dot = moveX * obstacle.nx + moveY * obstacle.ny;
        if (dot < 0) {
          moveX -= dot * obstacle.nx;
          moveY -= dot * obstacle.ny;
        }
      }
    }

    this.x += moveX;
    this.y += moveY;
    this.vx = moveX;
    this.vy = moveY;
    // Smoothly rotate toward actual movement direction
    const targetAngle = Math.atan2(moveY, moveX);
    let angleDiff = targetAngle - this.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.angle += angleDiff * 0.2;
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

  /** Pick the delivery lane to use for a given venue.
   *  Top venues (facing down) → top lane. Everything else → nearest lane by y. */
  private pickDeliveryLane(venue: VenueDef, layout: CityLayout): DeliveryLane | null {
    if (layout.deliveryLanes.length === 0) return null;
    if (layout.deliveryLanes.length === 1) return layout.deliveryLanes[0];
    const midY = layout.plazaBounds.y + layout.plazaBounds.h / 2;
    if (venue.facingPlaza === 'bottom' || venue.y + venue.h / 2 < midY) {
      return layout.deliveryLanes[0]; // top lane
    }
    return layout.deliveryLanes[1]; // bottom lane
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

    // Entry point: ensure we're inside the plaza boundary
    const entryX = Math.max(pb.x + 10, Math.min(pb.x + pb.w - 10, from.x));
    const entryY = Math.max(pb.y + 10, Math.min(pb.y + pb.h - 10, from.y));

    const path: { x: number; y: number }[] = [];
    path.push({ x: entryX, y: entryY });
    path.push({ x: cx, y: cy });
    path.push({ x: approachX, y: approachY });
    path.push(to);

    return path;
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
    const dist = Math.hypot(this.x - entrance.x, this.y - entrance.y);
    return dist < 60; // Increased threshold
  }

  /**
   * When at a road junction and seeking the plaza, pick the connecting road
   * that brings us closest to the target entrance. Falls back to normal
   * connecting-road logic if nothing better is found.
   */
  private findConnectingRoadToward(layout: CityLayout, tx: number, ty: number): RoadSegment | null {
    const snap = ROAD_WIDTH * 2.0;
    let best: RoadSegment | null = null;
    let bestDist = Infinity;

    for (const road of layout.roads) {
      if (road === this.road) continue;

      // Check if we overlap with this road's area
      if (this.x >= road.x - snap && this.x <= road.x + road.w + snap &&
        this.y >= road.y - snap && this.y <= road.y + road.h + snap) {

        // Score road by how much closer its center brings us to the target
        const roadCx = road.x + road.w / 2;
        const roadCy = road.y + road.h / 2;
        const d = Math.hypot(roadCx - tx, roadCy - ty);

        // Penalize roads that would require a 180-degree U-turn if possible
        let penalty = 0;
        if (road.horizontal && this.road.horizontal) penalty = 500; // avoid same-dir roads

        if (d + penalty < bestDist) {
          bestDist = d + penalty;
          best = road;
        }
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
    // Angle lerp only when driving on a road (arc drives angle directly)
    if (this.drivingPhase === 'road') {
      let da = this.angleTarget - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * 0.22;
    }

    // Calculate red light status once per frame
    const isEmergency = this.carType === 'police' || this.carType === 'ambulance' || this.carType === 'firetruck';
    let stoppedAtRedLight = false;
    if (!isEmergency && this.drivingPhase === 'road') {
      const signal = this.getTrafficSignal(layout, trafficPhase);
      if (signal === 'red') {
        const inIntersection = this.isInsideIntersection(layout);
        if (!inIntersection) {
          stoppedAtRedLight = true;
        }
      } else if (signal === 'yellow') {
        for (const inter of layout.intersections) {
          const dist = Math.hypot(inter.x - this.x, inter.y - this.y);
          if (dist < 50) {
            const dotAlong = (inter.x - this.x) * this.dirX + (inter.y - this.y) * this.dirY;
            if (dotAlong > 20) {
              stoppedAtRedLight = true;
            }
          }
        }
      }
    }

    if (this.drivingPhase === 'turning') {
      this.updateTurningAvoidance(pedestrians, cars);
      this.updateTurningArc();
    } else if (this.carType === 'delivery') {
      this.updateDelivery(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
    } else if (this.carType === 'bus') {
      this.updateBus(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
    } else if (this.carType === 'garbage') {
      this.updateGarbage(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
    } else {
      this.updateNormal(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
    }

    // Update siren phase for emergency vehicles
    if (isEmergency) {
      this.sirenPhase += 0.15;
    }
  }

  // Track how long car has been stopped (for gridlock resolution)
  private stoppedFrames: number = 0;

  private updateNormal(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number, stoppedAtRedLight: boolean) {
    let targetSpeed = this.baseSpeed;
    const frontX = this.x + this.dirX * this.length * 0.5;
    const frontY = this.y + this.dirY * this.length * 0.5;

    // Traffic light check (emergency vehicles ignore)
    if (stoppedAtRedLight) {
      targetSpeed = 0;
    }

    // Pedestrian avoidance
    for (const p of pedestrians) {
      const dx = p.x - frontX;
      const dy = p.y - frontY;
      const along = dx * this.dirX + dy * this.dirY;
      const perp = Math.abs(dx * this.dirY - dy * this.dirX);
      if (along > 0 && along < 40 && perp < 12) {
        targetSpeed = Math.min(targetSpeed, this.baseSpeed * (along / 40) * 0.5);
      }
    }

    // Car-to-car avoidance: Centralized logic for all vehicle types
    for (const other of cars) {
      if (other === this) continue;
      const dx = other.x - frontX;
      const dy = other.y - frontY;
      const along = dx * this.dirX + dy * this.dirY;
      const perp = Math.abs(dx * this.dirY - dy * this.dirX);

      // Wider detection for non-horizontal/vertical overlaps (e.g. slight nudges)
      const safetyWidth = (this.carType === 'delivery' || this.carType === 'bus') ? 16 : 12;
      const safetyDist = (this.carType === 'delivery' || this.carType === 'bus') ? 50 : 35;
      const hardStopDist = 18; // Complete stop if very close

      if (along > 0 && along < safetyDist && perp < safetyWidth) {
        const dotDir = this.dirX * other.dirX + this.dirY * other.dirY;
        // Brake for cars in our direction OR any car that is stopped/blocking
        if (dotDir > -0.5 || other.currentSpeed < 0.2 || (dotDir < -0.8 && perp < 6)) {
          if (along < hardStopDist) {
            targetSpeed = 0;
          } else {
            // Sharper deceleration curve as we get closer
            const deceleration = Math.pow((along - hardStopDist) / (safetyDist - hardStopDist), 1.5);
            targetSpeed = Math.min(targetSpeed, this.baseSpeed * deceleration * 0.5);
          }
        }
      }
    }

    // Track stopped duration
    if (this.currentSpeed < 0.1) {
      this.stoppedFrames++;
      this.stuckTimer++; // Also increment stuckTimer for off-road checks
    } else {
      this.stoppedFrames = 0;
      this.stuckTimer = 0;
    }

    this.currentSpeed += (targetSpeed - this.currentSpeed) * 0.12;

    // Gridlock resolution: if stopped too long (>6 seconds = ~360 frames), try to reverse or nudge
    // ONLY if not stopped at a red light. This prevents cars from turning around at traffic signals.
    if (this.stoppedFrames > 360 && !stoppedAtRedLight) {
      if (Math.random() < 0.2 && this.deliveryState === 'road') {
        this.reverseDirection();
      } else {
        // Nudge: slightly shift position to break local overlap jams
        // Prefer lateral nudges to slip past obstacles
        if (this.road.horizontal) {
          this.y += (Math.random() - 0.5) * 6;
        } else {
          this.x += (Math.random() - 0.5) * 6;
        }
      }
      this.stoppedFrames = 0;
      return;
    }

    // Creep forward slightly to prevent permanent jams, but only when not at a red light
    if (this.currentSpeed < 0.05 && targetSpeed <= 0 && !stoppedAtRedLight) {
      this.currentSpeed = 0.05;
    } else if (this.currentSpeed < 0.02) {
      this.currentSpeed = 0;
    }

    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;

    // ---- Junction turning ----
    // Pre-resolve turn while stopped at red (prevents stop-then-jump on green)
    if (stoppedAtRedLight && !this.pendingTurnRoad) {
      const ni = this.findNextIntersection(layout);
      if (ni && ni.dist < ROAD_WIDTH * 1.5) {
        const perpRoad = this.findRoadAtIntersection(layout, ni.inter.x, ni.inter.y);
        if (perpRoad) {
          this.pendingTurnRoad = perpRoad;
          this.pendingTurnInter = ni.inter;
        }
      }
    }

    // When light goes green, fire pending arc immediately
    if (!stoppedAtRedLight && this.pendingTurnRoad && this.pendingTurnInter) {
      this.beginTurningArc(this.pendingTurnInter, this.pendingTurnRoad, layout);
      this.pendingTurnRoad = null;
      this.pendingTurnInter = null;
      return;
    }

    // Normal trigger (moving, not at red)
    if (!stoppedAtRedLight) {
      const TRIGGER_RADIUS = ROAD_WIDTH * 0.6;
      const nextInter = this.findNextIntersection(layout);

      if (nextInter && nextInter.dist < TRIGGER_RADIUS) {
        const perpRoad = this.findRoadAtIntersection(layout, nextInter.inter.x, nextInter.inter.y);
        if (perpRoad) {
          this.beginTurningArc(nextInter.inter, perpRoad, layout);
          return;
        }
      }

      // Road-end fallback: if somehow past the road end, find any perp road
      if (this.isApproachingRoadEnd(layout) && nextInter === null) {
        const perpFallback = this.findConnectingRoad(layout, true);
        if (perpFallback) {
          this.transitionToRoad(perpFallback);
          return;
        }
        if (this.stuckTimer > 30) {
          this.reverseDirection();
          this.stuckTimer = 0;
          return;
        }
      }
    }

    const nextX = this.x + this.vx;
    const nextY = this.y + this.vy;

    this.x = nextX;
    this.y = nextY;

    // Safety net: if somehow off-road after moving, snap to a connecting road
    if (this.isOutsideRoad()) {
      const connecting = this.findConnectingRoad(layout);
      if (connecting) {
        this.transitionToRoad(connecting);
      } else if (this.currentSpeed < 0.1 && this.stuckTimer > 60) {
        this.reverseDirection();
        this.stuckTimer = 0;
      }
    }
  }

  /** Check if the car is currently inside an intersection box */
  private isInsideIntersection(layout: CityLayout): boolean {
    const hw = ROAD_WIDTH * 0.7;
    for (const inter of layout.intersections) {
      if (Math.abs(this.x - inter.x) < hw && Math.abs(this.y - inter.y) < hw) {
        return true;
      }
    }
    return false;
  }

  // ── Bus stop FSM ───────────────────────────────────────────────────────────

  private updateBus(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number, stoppedAtRedLight: boolean) {
    switch (this.busState) {
      case 'road':
        this.updateNormal(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
        if (!stoppedAtRedLight) this.busStopTimer--;
        if (this.busStopTimer <= 0 && this.currentSpeed > 0.2) {
          this.busState = 'stopping';
          this.busDwellDuration = 90 + Math.floor(Math.random() * 60);
          this.busDwellTimer = 0;
          const count = 2 + Math.floor(Math.random() * 2);
          this.busPassengerDots = Array.from({ length: count }, () => ({
            ox: (Math.random() - 0.5) * 16,
            oy: (Math.random() - 0.5) * 8,
            appearing: Math.random() > 0.5,
            alpha: 0
          }));
        }
        break;
      case 'stopping':
        this.currentSpeed = Math.max(0, this.currentSpeed - this.baseSpeed * 0.08);
        this.vx = this.dirX * this.currentSpeed;
        this.vy = this.dirY * this.currentSpeed;
        this.x += this.vx;
        this.y += this.vy;
        if (this.currentSpeed < 0.02) {
          this.currentSpeed = 0;
          this.busDoorsOpen = true;
          this.busState = 'dwell';
        }
        break;
      case 'dwell':
        this.busDwellTimer++;
        for (const d of this.busPassengerDots) {
          d.alpha = d.appearing
            ? Math.min(1, d.alpha + 0.05)
            : Math.max(0, d.alpha - 0.04);
        }
        if (this.busDwellTimer >= this.busDwellDuration) {
          this.busDoorsOpen = false;
          this.busState = 'departing';
        }
        break;
      case 'departing':
        this.currentSpeed = Math.min(this.baseSpeed, this.currentSpeed + this.baseSpeed * 0.06);
        this.vx = this.dirX * this.currentSpeed;
        this.vy = this.dirY * this.currentSpeed;
        this.x += this.vx;
        this.y += this.vy;
        if (this.currentSpeed >= this.baseSpeed * 0.9) {
          this.busState = 'road';
          this.busStopTimer = 200 + Math.floor(Math.random() * 200);
        }
        break;
    }
  }

  // ── Garbage truck FSM ──────────────────────────────────────────────────────

  private updateGarbage(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number, stoppedAtRedLight: boolean) {
    switch (this.garbageState) {
      case 'road':
        this.updateNormal(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
        if (!stoppedAtRedLight) this.garbageStopTimer--;
        if (this.garbageStopTimer <= 0 && this.currentSpeed > 0.1) {
          this.garbageState = 'collecting';
          this.garbageDwellDuration = 90 + Math.floor(Math.random() * 30);
          this.garbageDwellTimer = 0;
          this.currentSpeed = 0;
          this.vx = 0;
          this.vy = 0;
        }
        break;
      case 'collecting':
        this.garbageDwellTimer++;
        if (this.garbageDwellTimer >= this.garbageDwellDuration) {
          this.garbageState = 'road';
          this.garbageStopTimer = 150 + Math.floor(Math.random() * 100);
          this.currentSpeed = this.baseSpeed;
        }
        break;
    }
  }

  /**
   * Delivery truck state machine.
   *
   * Trucks use the dedicated delivery lanes (vertical road strips entering the plaza
   * from the top/bottom bordering roads). This gives a deterministic, reliable path:
   *   road → seeking_plaza → to_venue (lane entry → inside lane → lateral → venue front)
   *       → delivering → to_exit (reverse through lane) → rejoin_road → road
   */
  private updateDelivery(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number, stoppedAtRedLight: boolean) {
    const laneSpeed = this.baseSpeed * 0.55;

    switch (this.deliveryState) {
      case 'road': {
        this.updateNormal(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
        this.deliveryTimer--;
        if (this.deliveryTimer <= 0 && layout.venues.length > 0) {
          const available = layout.venues.filter(v =>
            !cars.some(c => c !== this && c.carType === 'delivery' &&
              c.deliveryState !== 'road' && c.targetVenue === v)
          );
          if (available.length === 0) { this.deliveryTimer = 60; return; }

          const venue = available[Math.floor(Math.random() * available.length)];
          this.targetVenue = venue;
          this.selectedLane = this.pickDeliveryLane(venue, layout);
          if (!this.selectedLane) { this.deliveryTimer = 60; this.targetVenue = null; return; }

          this.seekingLaneTimer = 0;
          this.deliveryState = 'seeking_plaza';
        }
        break;
      }

      case 'seeking_plaza': {
        // Drive on roads toward the delivery lane entry point, biasing turns at junctions.
        // Once within range of the lane entry, build the full waypoint path and start driving in.
        if (!this.selectedLane || !this.targetVenue) { this.deliveryState = 'road'; break; }

        // Check if we're close enough to the delivery lane entry to leave the road
        const lane = this.selectedLane;
        const distToLane = Math.hypot(this.x - lane.laneX, this.y - lane.outerY);
        if (distToLane < 60) {
          const venue = this.targetVenue!;
          const deliveryX = venue.x + venue.w / 2;
          const deliveryY = lane.side === 'top' ? venue.y - 5 : venue.y + venue.h + 5;
          this.plazaWaypoints = [
            { x: lane.laneX, y: lane.outerY },
            { x: lane.laneX, y: lane.entryY },
            { x: lane.laneX, y: lane.innerY },
            { x: deliveryX, y: lane.innerY },
            { x: deliveryX, y: deliveryY },
          ];
          this.plazaWaypointIdx = 0;
          this.targetX = this.plazaWaypoints[0].x;
          this.targetY = this.plazaWaypoints[0].y;
          this.drivingPhase = 'road'; // ensure not in turning arc when entering plaza
          this.deliveryState = 'to_venue';
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
            if (Math.hypot(inter.x - this.x, inter.y - this.y) > 50) continue;
            const dot = (inter.x - this.x) * this.dirX + (inter.y - this.y) * this.dirY;
            if (dot > 20) { targetSpeed = 0; break; }
          }
        }

        const frontX = this.x + this.dirX * this.length * 0.5;
        const frontY = this.y + this.dirY * this.length * 0.5;
        for (const p of pedestrians) {
          const dx = p.x - frontX, dy = p.y - frontY;
          const along = dx * this.dirX + dy * this.dirY;
          const perp = Math.abs(dx * this.dirY - dy * this.dirX);
          if (along > 0 && along < 40 && perp < 12)
            targetSpeed = Math.min(targetSpeed, this.baseSpeed * (along / 40) * 0.5);
        }
        for (const other of cars) {
          if (other === this) continue;
          const dx = other.x - frontX, dy = other.y - frontY;
          const along = dx * this.dirX + dy * this.dirY;
          const perp = Math.abs(dx * this.dirY - dy * this.dirX);
          if (along > 0 && along < 50 && perp < 14) {
            if (this.dirX * other.dirX + this.dirY * other.dirY > -0.3)
              targetSpeed = Math.min(targetSpeed, this.baseSpeed * (along / 50) * 0.3);
          }
        }

        this.currentSpeed += (targetSpeed - this.currentSpeed) * 0.1;
        if (this.currentSpeed < 0.02) {
          this.currentSpeed = 0;
          if (!stoppedAtRedLight) this.stuckTimer++;
        } else {
          this.stuckTimer = 0;
        }
        this.vx = this.dirX * this.currentSpeed;
        this.vy = this.dirY * this.currentSpeed;
        this.x += this.vx;
        this.y += this.vy;

        // At road ends / junctions: pick road that brings us closest to lane entry
        if (this.isOutsideRoad()) {
          const biased = this.findConnectingRoadToward(layout, this.selectedLane.laneX, this.selectedLane.outerY);
          if (biased) {
            this.transitionToRoad(biased);
          } else {
            const fallback = this.findConnectingRoad(layout);
            if (fallback) {
              this.transitionToRoad(fallback);
            } else if (!stoppedAtRedLight && this.stuckTimer > 180) {
              this.reverseDirection();
              this.stuckTimer = 0;
            }
          }
        }
        break;
      }

      case 'to_venue': {
        // Follow waypoints: lane entry → inside lane → lateral → delivery point
        const arrived = this.moveToward(this.targetX, this.targetY, laneSpeed);
        if (arrived) {
          this.plazaWaypointIdx++;
          if (this.plazaWaypointIdx < this.plazaWaypoints.length) {
            this.targetX = this.plazaWaypoints[this.plazaWaypointIdx].x;
            this.targetY = this.plazaWaypoints[this.plazaWaypointIdx].y;
          } else {
            this.deliveryState = 'delivering';
            this.deliveryPauseTimer = 0;
            this.packageDropped = false;
            this.currentSpeed = 0;
            this.vx = 0;
            this.vy = 0;
          }
        }
        break;
      }

      case 'delivering': {
        this.vx = 0;
        this.vy = 0;
        this.deliveryPauseTimer++;

        if (!this.packageDropped && this.deliveryPauseTimer >= 50 && this.targetVenue) {
          const v = this.targetVenue;
          let px = v.x + v.w / 2, py = v.y + v.h / 2;
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
        // Drive back through the lane and out onto the bordering road
        const arrived = this.moveToward(this.targetX, this.targetY, laneSpeed);
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
        const arrived = this.moveToward(this.targetX, this.targetY, laneSpeed);
        if (arrived) {
          this.currentSpeed = this.baseSpeed * 0.5; // re-enter traffic gently
          this.transitionToRoad(this.road);
          this.deliveryState = 'road';
          this.targetVenue = null;
          this.targetEntrance = null;
          this.exitEntrance = null;
          this.selectedLane = null;
          this.deliveryTimer = 200 + Math.random() * 300;
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

    // Headlights at night — only when car is actually moving to prevent phantom lights
    if (nightAlpha > 0.1 && this.currentSpeed > 0.05) {
      const headlightAlpha = 0.3 + nightAlpha * 0.7;
      ctx.fillStyle = `rgba(255, 240, 180, ${headlightAlpha})`;
      ctx.beginPath();
      ctx.arc(this.length / 2, -this.width / 2 + 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.length / 2, this.width / 2 - 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();

      if (nightAlpha > 0.3 && this.currentSpeed > 0.1) {
        const grad = ctx.createRadialGradient(this.length / 2 + 5, 0, 0, this.length / 2 + 5, 0, 25);
        grad.addColorStop(0, `rgba(255, 240, 180, ${nightAlpha * 0.15})`);
        grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(this.length / 2, -12, 25, 24);
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

      case 'bus': {
        // Windows along the side
        ctx.fillStyle = `rgba(150, 200, 230, ${0.6 - nightAlpha * 0.3})`;
        for (let wx = -hw + 8; wx < hw - 6; wx += 6) {
          ctx.fillRect(wx, -hh + 1, 4, this.width - 2);
        }
        // Yellow door strip when stopped at bus stop
        if (this.busDoorsOpen) {
          ctx.fillStyle = 'rgba(255,220,0,0.9)';
          ctx.fillRect(-hw + 6, hh - 2, this.length - 12, 3);
        }
        // Passenger dots alongside bus
        for (const d of this.busPassengerDots) {
          if (d.alpha <= 0) continue;
          ctx.globalAlpha = d.alpha;
          ctx.fillStyle = '#f39c12';
          ctx.beginPath();
          ctx.arc(d.ox, d.oy + hh + 5, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'garbage': {
        // Garbage hopper on the back
        ctx.fillStyle = `rgba(80, 80, 80, ${darkFactor})`;
        ctx.fillRect(-hw + 1, -hh + 1.5, this.length * 0.6, this.width - 3);
        // White cab
        ctx.fillStyle = `rgba(240, 240, 240, ${darkFactor})`;
        ctx.fillRect(hw - 8, -hh + 1.5, 6, this.width - 3);
        // Amber flashing light when collecting
        if (this.garbageState === 'collecting') {
          const flashOn = Math.floor(Date.now() / 250) % 2 === 0;
          ctx.fillStyle = flashOn ? 'rgba(255,160,0,0.95)' : 'rgba(255,100,0,0.3)';
          ctx.beginPath();
          ctx.arc(hw * 0.5, -hh - 3, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  }
}
