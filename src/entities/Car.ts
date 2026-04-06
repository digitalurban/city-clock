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
  // Cooldown after a road transition to prevent re-triggering
  private transitionCooldown: number = 0;

  // Smooth turning: quadratic Bezier curve through intersection corner
  private turnLerping: boolean = false;
  private turnFromX: number = 0;
  private turnFromY: number = 0;
  private turnToX: number = 0;
  private turnToY: number = 0;
  private turnControlX: number = 0; // Bezier control point (intersection corner)
  private turnControlY: number = 0;
  private turnProgress: number = 0;
  private turnDuration: number = 16; // frames at 60fps (~0.27s)

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
      this.deliveryTimer = 300 + Math.random() * 500;
    }
    if (carType === 'bus') {
      this.busStopTimer = 400 + Math.floor(Math.random() * 400);
    }
    if (carType === 'garbage') {
      this.garbageStopTimer = 100 + Math.floor(Math.random() * 200);
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
    const perpSnap = ROAD_WIDTH * 2.0;  // generous snap for perpendicular turns
    const parallelSnap = ROAD_WIDTH * 0.8; // tight snap for parallel continuations
    let fallback: RoadSegment | null = null;
    let fallbackDist = Infinity;

    for (const road of layout.roads) {
      if (road === this.road) continue;
      // Only delivery trucks actively seeking a delivery may use plaza-bordering stubs
      if (road.plazaBordering && !(this.carType === 'delivery' && this.deliveryState === 'seeking_plaza')) continue;

      const isPerp = road.horizontal !== this.road.horizontal;
      const snap = isPerp ? perpSnap : parallelSnap;

      if (this.x >= road.x - snap && this.x <= road.x + road.w + snap &&
        this.y >= road.y - snap && this.y <= road.y + road.h + snap) {

        // Prefer perpendicular roads (turns at intersections)
        if (isPerp) {
          return road;
        }
        // For parallel: only accept if we're actually near the end/start of the other road
        // (i.e. it's a continuation of our road, not a distant parallel road)
        if (!perpOnly) {
          const cx = road.x + road.w / 2;
          const cy = road.y + road.h / 2;
          const d = Math.hypot(this.x - cx, this.y - cy);
          if (d < fallbackDist) {
            fallbackDist = d;
            fallback = road;
          }
        }
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
      // Only delivery trucks actively seeking a delivery may use plaza-bordering stubs
      if (road.plazaBordering && !(this.carType === 'delivery' && this.deliveryState === 'seeking_plaza')) continue;
      if (ix >= road.x - snap && ix <= road.x + road.w + snap &&
        iy >= road.y - snap && iy <= road.y + road.h + snap) {
        return road;
      }
    }
    return null;
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

  private transitionToRoad(road: RoadSegment, inter?: IntersectionDef) {
    this.stuckTimer = 0;

    // Store old position and direction for Bezier curve
    const oldX = this.x;
    const oldY = this.y;
    const wasHorizontal = this.road.horizontal;
    const isTurn = road.horizontal !== this.road.horizontal; // perpendicular = real turn

    this.road = road;

    if (road.horizontal) {
      // For same-direction continuation, keep current direction; only randomize for turns
      const dirX = isTurn ? (Math.random() > 0.5 ? 1 : -1) : this.dirX || (Math.random() > 0.5 ? 1 : -1);
      this.dirX = dirX;
      this.dirY = 0;
      this.y = road.y + (dirX > 0 ? road.h * 0.75 : road.h * 0.25);
      if (inter) this.x = inter.x;
    } else {
      const dirY = isTurn ? (Math.random() > 0.5 ? 1 : -1) : this.dirY || (Math.random() > 0.5 ? 1 : -1);
      this.dirX = 0;
      this.dirY = dirY;
      this.x = road.x + (dirY > 0 ? road.w * 0.25 : road.w * 0.75);
      if (inter) this.y = inter.y;
    }

    // Set up smooth interpolation from old position to new lane
    this.turnFromX = oldX;
    this.turnFromY = oldY;
    this.turnToX = this.x;
    this.turnToY = this.y;

    if (isTurn) {
      // Quadratic Bezier: use the intersection CENTRE as the control point.
      // Using the lane-snapped position (turnToX/Y) can place the control point
      // behind the car when it triggers close to the intersection, giving an
      // initial Bezier tangent that faces backward — causing the visual "spin".
      // The intersection centre is always ahead of the car (guaranteed by the
      // `ahead` check in findNextIntersection), so the arc always starts
      // pointing forward.  Falls back to the lane position when no intersection
      // is available (road-end fallback).
      if (wasHorizontal) {
        this.turnControlX = inter ? inter.x : this.turnToX;
        this.turnControlY = this.turnFromY;
      } else {
        this.turnControlX = this.turnFromX;
        this.turnControlY = inter ? inter.y : this.turnToY;
      }
    } else {
      // Same-direction continuation (parallel road segments): linear interpolation
      // Control point = midpoint makes Bezier degenerate to a straight line
      this.turnControlX = (this.turnFromX + this.turnToX) / 2;
      this.turnControlY = (this.turnFromY + this.turnToY) / 2;
    }

    this.turnProgress = 0;
    this.turnLerping = true;
    this.turnDuration = isTurn ? 32 : 24; // ~0.5s turn at 60fps
    // Start visually at old position — the Bezier will curve us to the new one
    this.x = oldX;
    this.y = oldY;

    this.angleTarget = Math.atan2(this.dirY, this.dirX);
    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;
    this.transitionCooldown = 120;
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
    // Snap angle to movement direction (axis-aligned waypoint following)
    this.angle = Math.atan2(moveY, moveX);
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
  private pickDeliveryLane(_venue: VenueDef, layout: CityLayout): DeliveryLane | null {
    return layout.deliveryLanes.length > 0 ? layout.deliveryLanes[0] : null;
  }

  /** Build perimeter waypoints from the entry stub to the venue's front.
   *  Trucks enter from the top, then drive around the plaza edge in front of shops. */
  private buildPerimeterToVenue(venue: VenueDef, lane: DeliveryLane, layout: CityLayout): { x: number; y: number }[] {
    const p = layout.deliveryPerimeter;
    const entryX = lane.laneX;
    const entryY = p.topY;

    // Determine venue delivery position on the perimeter
    let vx: number, vy: number;
    if (venue.facingPlaza === 'bottom') {
      vx = venue.x + venue.w / 2; vy = p.topY;
    } else if (venue.facingPlaza === 'top') {
      vx = venue.x + venue.w / 2; vy = p.bottomY;
    } else if (venue.facingPlaza === 'right') {
      vx = p.leftX; vy = venue.y + venue.h / 2;
    } else {
      vx = p.rightX; vy = venue.y + venue.h / 2;
    }

    const waypoints: { x: number; y: number }[] = [];
    // Start: align at entry on the perimeter
    waypoints.push({ x: entryX, y: entryY });

    if (venue.facingPlaza === 'bottom') {
      // Same top edge — go directly
      waypoints.push({ x: vx, y: vy });
    } else if (venue.facingPlaza === 'right') {
      // Top → left: go left to top-left corner, then down
      waypoints.push({ x: p.leftX, y: p.topY });
      waypoints.push({ x: vx, y: vy });
    } else if (venue.facingPlaza === 'left') {
      // Top → right: go right to top-right corner, then down
      waypoints.push({ x: p.rightX, y: p.topY });
      waypoints.push({ x: vx, y: vy });
    } else {
      // Bottom edge: pick shorter route (via left or right)
      const viaLeft = Math.abs(entryX - p.leftX) + (p.bottomY - p.topY) + Math.abs(vx - p.leftX);
      const viaRight = Math.abs(entryX - p.rightX) + (p.bottomY - p.topY) + Math.abs(vx - p.rightX);
      if (viaLeft < viaRight) {
        waypoints.push({ x: p.leftX, y: p.topY });
        waypoints.push({ x: p.leftX, y: p.bottomY });
        waypoints.push({ x: vx, y: vy });
      } else {
        waypoints.push({ x: p.rightX, y: p.topY });
        waypoints.push({ x: p.rightX, y: p.bottomY });
        waypoints.push({ x: vx, y: vy });
      }
    }
    return waypoints;
  }

  /** Build perimeter waypoints from the current position back to the entry stub. */
  private buildPerimeterToExit(layout: CityLayout): { x: number; y: number }[] {
    const p = layout.deliveryPerimeter;
    const lane = this.selectedLane!;
    const entryX = lane.laneX;
    const waypoints: { x: number; y: number }[] = [];

    // Determine which edge we're on
    const onTop = Math.abs(this.y - p.topY) < 10;
    const onBottom = Math.abs(this.y - p.bottomY) < 10;
    const onLeft = Math.abs(this.x - p.leftX) < 10;
    const onRight = Math.abs(this.x - p.rightX) < 10;

    if (onTop) {
      // Already on top edge, go to entry
      waypoints.push({ x: entryX, y: p.topY });
    } else if (onLeft) {
      // Go up to top-left corner, then to entry
      waypoints.push({ x: p.leftX, y: p.topY });
      waypoints.push({ x: entryX, y: p.topY });
    } else if (onRight) {
      // Go up to top-right corner, then to entry
      waypoints.push({ x: p.rightX, y: p.topY });
      waypoints.push({ x: entryX, y: p.topY });
    } else if (onBottom) {
      // Pick shorter route back to top
      const viaLeft = Math.abs(this.x - p.leftX) + (p.bottomY - p.topY) + Math.abs(entryX - p.leftX);
      const viaRight = Math.abs(this.x - p.rightX) + (p.bottomY - p.topY) + Math.abs(entryX - p.rightX);
      if (viaLeft < viaRight) {
        waypoints.push({ x: p.leftX, y: p.bottomY });
        waypoints.push({ x: p.leftX, y: p.topY });
        waypoints.push({ x: entryX, y: p.topY });
      } else {
        waypoints.push({ x: p.rightX, y: p.bottomY });
        waypoints.push({ x: p.rightX, y: p.topY });
        waypoints.push({ x: entryX, y: p.topY });
      }
    } else {
      // Fallback: go straight to entry
      waypoints.push({ x: entryX, y: p.topY });
    }

    // Final waypoint: exit through stub
    waypoints.push({ x: entryX, y: lane.outerY });
    return waypoints;
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

  /**
   * Level crossings: return a target speed for a car approaching the railway
   * boundary while the main train is actively moving through that X range.
   *
   * Vertical roads terminate at railwayRowTopY.  When the train (which runs
   * below that boundary at trainTrackY) is active and its bounding box
   * overlaps this road's X span, cars in the crossing zone brake smoothly to
   * a stop, simulating level-crossing gates.  The car resumes once the train
   * has cleared the crossing zone.
   *
   * Returns `baseSpeed` when no crossing applies (no-op fast path).
   */
  private getLevelCrossingTargetSpeed(layout: CityLayout): number {
    // Only applies when the main train is actively moving (not parked at station)
    if (!layout.trainActive || layout.trainState === 'stopped') return this.baseSpeed;
    // Only vertical-road cars are blocked (train runs horizontally)
    if (this.road.horizontal) return this.baseSpeed;

    const crossingY = layout.railwayRowTopY;
    const crossingZone = 60; // px: braking begins this far above the crossing

    // Car must be heading south (toward the railway) and within the zone
    if (this.dirY <= 0) return this.baseSpeed;
    const distToCrossing = crossingY - this.y;
    if (distToCrossing > crossingZone || distToCrossing < -10) return this.baseSpeed;

    // Check whether the train's X range overlaps this road (with a small gate buffer)
    const gateBuffer = 80; // px either side — gates extend beyond the train body
    const trainLen = 245;
    const trainLeft  = layout.trainX - gateBuffer;
    const trainRight = layout.trainX + trainLen + gateBuffer;
    const roadLeft   = this.road.x;
    const roadRight  = this.road.x + this.road.w;
    if (trainRight < roadLeft || trainLeft > roadRight) return this.baseSpeed;

    // Smooth braking curve toward zero, reaching full stop 5 px before the crossing
    if (distToCrossing <= 5) return 0;
    return this.baseSpeed * Math.max(0, (distToCrossing - 5) / (crossingZone - 5));
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
    // Calculate red light status once per frame
    const isEmergency = this.carType === 'police' || this.carType === 'ambulance' || this.carType === 'firetruck';
    let stoppedAtRedLight = false;
    if (!isEmergency) {
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

    // Smooth angle interpolation toward target
    if (this.angleTarget !== this.angle) {
      let da = this.angleTarget - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 0.05) {
        this.angle = this.angleTarget;
      } else {
        this.angle += da * 0.3;
      }
    }

    // Smooth turn: quadratic Bezier curve through intersection corner
    if (this.turnLerping) {
      this.turnProgress++;
      const t = Math.min(1, this.turnProgress / this.turnDuration);
      // Ease-in-out for smooth motion
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      // Quadratic Bezier: P = (1-t)²·from + 2(1-t)t·control + t²·to
      const inv = 1 - ease;
      this.x = inv * inv * this.turnFromX + 2 * inv * ease * this.turnControlX + ease * ease * this.turnToX;
      this.y = inv * inv * this.turnFromY + 2 * inv * ease * this.turnControlY + ease * ease * this.turnToY;
      // Bezier tangent for smooth angle: P' = 2(1-t)(control-from) + 2t(to-control)
      const tx = 2 * inv * (this.turnControlX - this.turnFromX) + 2 * ease * (this.turnToX - this.turnControlX);
      const ty = 2 * inv * (this.turnControlY - this.turnFromY) + 2 * ease * (this.turnToY - this.turnControlY);
      if (Math.abs(tx) > 0.001 || Math.abs(ty) > 0.001) {
        this.angle = Math.atan2(ty, tx);
      }
      if (t >= 1) {
        this.turnLerping = false;
        this.x = this.turnToX;
        this.y = this.turnToY;
      }
      // During lerp, still update siren but skip normal movement
      if (isEmergency) this.sirenPhase += 0.075;
      return;
    }

    if (this.carType === 'delivery') {
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
      this.sirenPhase += 0.075;
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

    // Level crossing — even emergency vehicles stop for trains
    const crossingSpeed = this.getLevelCrossingTargetSpeed(layout);
    if (crossingSpeed < targetSpeed) {
      targetSpeed = crossingSpeed;
    }
    const stoppedAtCrossing = crossingSpeed < this.baseSpeed * 0.1;

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
    // ONLY if not stopped at a red light or level crossing.
    if (this.stoppedFrames > 720 && !stoppedAtRedLight && !stoppedAtCrossing) {
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

    // Creep forward slightly to prevent permanent jams, but only when not at a red light or crossing
    if (this.currentSpeed < 0.05 && targetSpeed <= 0 && !stoppedAtRedLight && !stoppedAtCrossing) {
      this.currentSpeed = 0.05;
    } else if (this.currentSpeed < 0.02) {
      this.currentSpeed = 0;
    }

    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;

    // ---- Junction turning ----
    if (this.transitionCooldown > 0) {
      this.transitionCooldown--;
    } else {
      const TRIGGER_RADIUS = ROAD_WIDTH * 0.6;
      const nextInter = this.findNextIntersection(layout);

      if (nextInter && nextInter.dist < TRIGGER_RADIUS) {
        // 40% chance to turn at each intersection, 60% go straight
        if (Math.random() < 0.4) {
          const perpRoad = this.findRoadAtIntersection(layout, nextInter.inter.x, nextInter.inter.y);
          if (perpRoad) {
            this.transitionToRoad(perpRoad, nextInter.inter);
            return;
          }
        }
        // Going straight — just set cooldown to avoid re-checking same intersection
        this.transitionCooldown = 60;
      }

      // Road-end: MUST turn — no choice
      if (this.isApproachingRoadEnd(layout)) {
        const ni = this.findNextIntersection(layout);
        if (ni) {
          const perpRoad = this.findRoadAtIntersection(layout, ni.inter.x, ni.inter.y);
          if (perpRoad) {
            this.transitionToRoad(perpRoad, ni.inter);
            return;
          }
        }
        const perpFallback = this.findConnectingRoad(layout, true);
        if (perpFallback) {
          this.transitionToRoad(perpFallback);
          return;
        }
        if (this.stuckTimer > 60) {
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
      } else if (this.currentSpeed < 0.1 && this.stuckTimer > 120) {
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
        if (!stoppedAtRedLight && this.getLevelCrossingTargetSpeed(layout) >= this.baseSpeed * 0.1) this.busStopTimer--;
        if (this.busStopTimer <= 0 && this.currentSpeed > 0.2) {
          this.busState = 'stopping';
          this.busDwellDuration = 180 + Math.floor(Math.random() * 120);
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
        this.currentSpeed = Math.max(0, this.currentSpeed - this.baseSpeed * 0.04);
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
            ? Math.min(1, d.alpha + 0.025)
            : Math.max(0, d.alpha - 0.02);
        }
        if (this.busDwellTimer >= this.busDwellDuration) {
          this.busDoorsOpen = false;
          this.busState = 'departing';
        }
        break;
      case 'departing':
        this.currentSpeed = Math.min(this.baseSpeed, this.currentSpeed + this.baseSpeed * 0.03);
        this.vx = this.dirX * this.currentSpeed;
        this.vy = this.dirY * this.currentSpeed;
        this.x += this.vx;
        this.y += this.vy;
        if (this.currentSpeed >= this.baseSpeed * 0.9) {
          this.busState = 'road';
          this.busStopTimer = 400 + Math.floor(Math.random() * 400);
        }
        break;
    }
  }

  // ── Garbage truck FSM ──────────────────────────────────────────────────────

  private updateGarbage(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[], trafficPhase: number, stoppedAtRedLight: boolean) {
    switch (this.garbageState) {
      case 'road':
        this.updateNormal(layout, pedestrians, cars, trafficPhase, stoppedAtRedLight);
        if (!stoppedAtRedLight && this.getLevelCrossingTargetSpeed(layout) >= this.baseSpeed * 0.1) this.garbageStopTimer--;
        if (this.garbageStopTimer <= 0 && this.currentSpeed > 0.1) {
          this.garbageState = 'collecting';
          this.garbageDwellDuration = 180 + Math.floor(Math.random() * 60);
          this.garbageDwellTimer = 0;
          this.currentSpeed = 0;
          this.vx = 0;
          this.vy = 0;
          // Collect any roadside bins within reach
          for (const bin of layout.bins) {
            if (bin.collected) continue;
            const dx = bin.x - this.x;
            const dy = bin.y - this.y;
            if (dx * dx + dy * dy < 40 * 40) {
              bin.collected = true;
              bin.respawnTimer = 0;
            }
          }
        }
        break;
      case 'collecting':
        this.garbageDwellTimer++;
        if (this.garbageDwellTimer >= this.garbageDwellDuration) {
          this.garbageState = 'road';
          this.garbageStopTimer = 300 + Math.floor(Math.random() * 200);
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
          if (available.length === 0) { this.deliveryTimer = 120; return; }

          const venue = available[Math.floor(Math.random() * available.length)];
          this.targetVenue = venue;
          this.selectedLane = this.pickDeliveryLane(venue, layout);
          if (!this.selectedLane) { this.deliveryTimer = 120; this.targetVenue = null; return; }

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
          // Build waypoints: align x → straight down entry stub → perimeter path → venue front
          const perimWaypoints = this.buildPerimeterToVenue(venue, lane, layout);
          this.plazaWaypoints = [
            // First align horizontally on the current road, then go straight down
            { x: lane.laneX, y: this.y },
            { x: lane.laneX, y: lane.outerY },
            ...perimWaypoints,
          ];
          this.plazaWaypointIdx = 0;
          this.targetX = this.plazaWaypoints[0].x;
          this.targetY = this.plazaWaypoints[0].y;
          this.transitionCooldown = 0;
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
            } else if (!stoppedAtRedLight && this.stuckTimer > 360) {
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

        if (!this.packageDropped && this.deliveryPauseTimer >= 100 && this.targetVenue) {
          const v = this.targetVenue;
          // Drop package at venue front (plaza-facing side, past awning)
          const awning = 14;
          let px = v.x + v.w / 2, py = v.y + v.h / 2;
          if (v.facingPlaza === 'bottom') py = v.y + v.h + awning + 4;
          else if (v.facingPlaza === 'top') py = v.y - awning - 4;
          else if (v.facingPlaza === 'right') px = v.x + v.w + awning + 4;
          else px = v.x - awning - 4;
          Car.droppedPackages.push({
            x: px, y: py,
            timer: 800 + Math.floor(Math.random() * 400),
            color: PKG_COLORS[Math.floor(Math.random() * PKG_COLORS.length)],
          });
          this.packageDropped = true;
        }

        if (this.deliveryPauseTimer >= 240) {
          // Done — drive around perimeter back to entry stub and out
          this.plazaWaypoints = this.buildPerimeterToExit(layout);
          this.plazaWaypointIdx = 0;
          this.targetX = this.plazaWaypoints[0].x;
          this.targetY = this.plazaWaypoints[0].y;
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
          this.deliveryTimer = 400 + Math.random() * 600;
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
      ctx.fillStyle = `rgba(0,0,0,${0.2 * alpha})`;
      ctx.fillRect(pkg.x - 5, pkg.y - 3.5, 12, 9);

      // Box
      ctx.fillStyle = `rgba(${Math.floor(r * dark)},${Math.floor(g * dark)},${Math.floor(b * dark)},${alpha})`;
      ctx.fillRect(pkg.x - 6, pkg.y - 4, 12, 9);

      // Tape stripe
      ctx.fillStyle = `rgba(200,180,140,${0.7 * alpha})`;
      ctx.fillRect(pkg.x - 6, pkg.y - 0.5, 12, 1.5);
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

  /** Drawn after the night overlay so beams punch through darkness */
  drawHeadlightGlow(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (nightAlpha < 0.1 || this.currentSpeed < 0.05) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const hw = this.length / 2;
    const hh = this.width / 2;
    const beamLen = 50 + nightAlpha * 40;
    const spread = hh * 2.8;

    // Two separate beams — one per headlight
    for (const side of [-1, 1]) {
      const originY = side * (hh - 1.5);
      const grad = ctx.createRadialGradient(hw, originY, 0, hw + beamLen * 0.35, originY * 0.4, beamLen);
      grad.addColorStop(0,   `rgba(255, 248, 210, ${nightAlpha * 0.60})`);
      grad.addColorStop(0.25,`rgba(255, 242, 190, ${nightAlpha * 0.30})`);
      grad.addColorStop(0.7, `rgba(255, 235, 160, ${nightAlpha * 0.10})`);
      grad.addColorStop(1,   'rgba(255, 230, 140, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(hw, originY);
      ctx.lineTo(hw + beamLen, originY + side * spread);
      ctx.lineTo(hw + beamLen, originY + side * spread * 0.3);
      ctx.closePath();
      ctx.fill();
    }

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
        // Passenger dots rendered in world space (not rotated with bus)
        if (this.busDoorsOpen) {
          ctx.save();
          // Undo the bus rotation so dots stay upright
          ctx.rotate(-this.angle);
          for (const d of this.busPassengerDots) {
            if (d.alpha <= 0) continue;
            ctx.globalAlpha = d.alpha;
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(d.ox, d.oy + hh + 6, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        }
        break;
      }

      case 'garbage': {
        // Garbage hopper on the back
        ctx.fillStyle = `rgba(80, 80, 80, ${darkFactor})`;
        ctx.fillRect(-hw + 1, -hh + 1.5, this.length * 0.6, this.width - 3);
        // White cab
        ctx.fillStyle = `rgba(240, 240, 240, ${darkFactor})`;
        ctx.fillRect(hw - 8, -hh + 1.5, 6, this.width - 3);
        break;
      }
    }
  }
}
