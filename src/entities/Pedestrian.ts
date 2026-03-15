import { PEDESTRIAN_BASE_SPEED, PEDESTRIAN_MAX_FORCE, SEPARATION_RADIUS, PEDESTRIAN_COLORS } from '../utils/constants';
import type { CityLayout, VenueDef, PlazaBenchDef } from '../city/CityLayout';

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

// Shared state across all pedestrians — cleared on resize via clearPedestrianState()
const occupiedBenches = new Set<PlazaBenchDef>();
const venueQueues = new Map<VenueDef, Pedestrian[]>();

export function clearPedestrianState() {
  occupiedBenches.clear();
  venueQueues.clear();
}

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

  // Bench sitting
  isBenchSitting: boolean = false;
  benchRef: PlazaBenchDef | null = null;

  // Shop queuing
  isQueuing: boolean = false;
  queueVenue: VenueDef | null = null;
  queuePosition: number = -1;
  queueTimer: number = 0;

  // Window shopping
  isWindowShopping: boolean = false;
  windowShopTimer: number = 0;

  // Group walking
  groupLeader: Pedestrian | null = null;
  groupFollowers: Pedestrian[] = [];

  // Walking animation phase
  walkPhase: number = 0;

  // Phone checking
  isCheckingPhone: boolean = false;
  phoneTimer: number = 0;

  // Photo taking
  isTakingPhoto: boolean = false;
  photoTimer: number = 0;

  // Thought bubble (Sims-style)
  thoughtBubble: string | null = null;
  thoughtTimer: number = 0;

  // Carrying food/drink from cafes
  hasFood: boolean = false;

  // Crosswalk routing intermediate waypoint
  intermediateWaypoint: { x: number; y: number } | null = null;

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

  private setWaypointWithCrosswalkRouting(layout: CityLayout, wx: number, wy: number) {
    if (!layout.isInPlaza(this.x, this.y) && !layout.isInPlaza(wx, wy) &&
        layout.requiresCrossing(this.x, this.y, wx, wy)) {
      const cw = layout.getNearestCrosswalk(this.x, this.y);
      this.intermediateWaypoint = { x: wx, y: wy };
      this.waypointX = cw.x;
      this.waypointY = cw.y;
    } else {
      this.intermediateWaypoint = null;
      this.waypointX = wx;
      this.waypointY = wy;
    }
    this.waypointTimer = 0;
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

      // Update thought bubble timer
      if (this.thoughtTimer > 0) {
        this.thoughtTimer--;
        if (this.thoughtTimer <= 0) this.thoughtBubble = null;
      }

      const isBusy = this.isSitting || this.isBenchSitting || this.socialMode
        || this.isQueuing || this.isWindowShopping || this.isCheckingPhone || this.isTakingPhoto;

      // --- Social chat mode ---
      if (this.socialMode) {
        this.socialTimer--;
        if (this.socialTimer <= 0) {
          this.socialMode = false;
        } else {
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
          this.vx *= 0.78;
          this.vy *= 0.78;
        }
      }

      // --- Sitting at venue ---
      if (this.isSitting) {
        this.sitTimer++;
        if (this.sitTimer >= this.sitDuration) {
          this.isSitting = false;
          this.hasFood = Math.random() < 0.4;
          this.thoughtBubble = 'heart';
          this.thoughtTimer = 60;
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

      // --- Bench sitting ---
      if (this.isBenchSitting) {
        this.sitTimer++;
        if (this.sitTimer >= this.sitDuration) {
          this.isBenchSitting = false;
          if (this.benchRef) occupiedBenches.delete(this.benchRef);
          this.benchRef = null;
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

      // --- Shop queuing ---
      if (this.isQueuing && this.queueVenue) {
        this.queueTimer++;
        const queue = venueQueues.get(this.queueVenue);
        if (!queue) {
          this.isQueuing = false;
          this.queueVenue = null;
        } else {
          const myIdx = queue.indexOf(this);
          if (myIdx === -1) {
            this.isQueuing = false;
            this.queueVenue = null;
          } else if (myIdx === 0 && this.queueTimer > 150) {
            // At front of queue, done shopping
            queue.shift();
            if (queue.length === 0) venueQueues.delete(this.queueVenue);
            this.isQueuing = false;
            this.hasBag = true;
            this.thoughtBubble = 'happy';
            this.thoughtTimer = 50;
            this.queueVenue = null;
            const wp = layout.getRandomSidewalkWaypoint();
            this.waypointX = wp.x;
            this.waypointY = wp.y;
            this.waypointTimer = 0;
          } else {
            // Move toward my queue position
            const positions = this.queueVenue.queuePositions;
            const posIdx = Math.min(myIdx, positions.length - 1);
            const target = positions[posIdx];
            const qdx = target.x - this.x;
            const qdy = target.y - this.y;
            ax += qdx * 0.08;
            ay += qdy * 0.08;
            this.vx *= 0.82;
            this.vy *= 0.82;
          }
        }
      }

      // --- Window shopping ---
      if (this.isWindowShopping) {
        this.windowShopTimer--;
        if (this.windowShopTimer <= 0) {
          this.isWindowShopping = false;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          this.vx *= 0.85;
          this.vy *= 0.85;
        }
      }

      // --- Phone checking ---
      if (this.isCheckingPhone) {
        this.phoneTimer--;
        if (this.phoneTimer <= 0) {
          this.isCheckingPhone = false;
          if (Math.random() < 0.3) {
            this.thoughtBubble = Math.random() < 0.5 ? 'happy' : 'idea';
            this.thoughtTimer = 60;
          }
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          this.vx *= 0.85;
          this.vy *= 0.85;
        }
      }

      // --- Photo taking ---
      if (this.isTakingPhoto) {
        this.photoTimer--;
        if (this.photoTimer <= 0) {
          this.isTakingPhoto = false;
          this.thoughtBubble = 'happy';
          this.thoughtTimer = 50;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          this.vx *= 0.82;
          this.vy *= 0.82;
        }
      }

      // --- Group following ---
      if (this.groupLeader && !isBusy) {
        const leader = this.groupLeader;
        const dx = leader.x - this.x;
        const dy = leader.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 100 || leader.isSitting || leader.isQueuing || leader.isCheckingPhone || leader.isTakingPhoto) {
          // Dissolve — too far or leader got busy
          this.groupLeader = null;
        } else if (dist > 10) {
          ax += (dx / dist) * this.maxForce * 1.2;
          ay += (dy / dist) * this.maxForce * 1.2;
        }
      }

      if (!isBusy && !this.groupLeader) {
        // 1. Waypoint following
        this.waypointTimer++;
        const wpDx = this.waypointX - this.x;
        const wpDy = this.waypointY - this.y;
        const wpDist = Math.sqrt(wpDx * wpDx + wpDy * wpDy);

        if (wpDist < 15 || this.waypointTimer > 600) {
          // If we have an intermediate waypoint (crosswalk routing), go to final destination
          if (this.intermediateWaypoint) {
            this.waypointX = this.intermediateWaypoint.x;
            this.waypointY = this.intermediateWaypoint.y;
            this.intermediateWaypoint = null;
            this.waypointTimer = 0;
          } else {
          // Dissolve group followers at waypoint
          if (this.groupFollowers.length > 0) {
            for (const f of this.groupFollowers) f.groupLeader = null;
            this.groupFollowers = [];
          }

          const roll = Math.random();

          // Venue sitting — prefer cafes/restaurants
          if (!this.isClockEligible && roll < 0.12) {
            const cafeVenues = layout.venues.filter(v => v.type === 'cafe' || v.type === 'restaurant');
            const pool = cafeVenues.length > 0 ? cafeVenues : layout.venues;
            const venue = pool[Math.floor(Math.random() * pool.length)];
            if (venue.seatingPositions.length > 0) {
              const seat = venue.seatingPositions[Math.floor(Math.random() * venue.seatingPositions.length)];
              this.isSitting = true;
              this.sitX = seat.x;
              this.sitY = seat.y;
              this.sitTimer = 0;
              this.sitDuration = 300 + Math.random() * 300;
              this.waypointX = seat.x;
              this.waypointY = seat.y;
              this.waypointTimer = 0;
              // Face toward plaza center
              const pb = layout.plazaBounds;
              this.angle = Math.atan2(
                (pb.y + pb.h / 2) - seat.y,
                (pb.x + pb.w / 2) - seat.x
              );
            }
          }

          // Bench sitting
          if (!this.isSitting && !this.isClockEligible && roll >= 0.12 && roll < 0.20) {
            let nearestBench: PlazaBenchDef | null = null;
            let nearestDist = Infinity;
            for (const bench of layout.plazaBenches) {
              if (occupiedBenches.has(bench)) continue;
              const d = Math.hypot(bench.x - this.x, bench.y - this.y);
              if (d < 200 && d < nearestDist) {
                nearestDist = d;
                nearestBench = bench;
              }
            }
            if (nearestBench) {
              occupiedBenches.add(nearestBench);
              this.isBenchSitting = true;
              this.benchRef = nearestBench;
              this.sitX = nearestBench.x;
              this.sitY = nearestBench.y;
              this.sitTimer = 0;
              this.sitDuration = 300 + Math.random() * 300;
              this.waypointX = nearestBench.x;
              this.waypointY = nearestBench.y;
              this.waypointTimer = 0;
              // Face perpendicular to bench
              this.angle = nearestBench.angle + Math.PI / 2;
            }
          }

          // Shop queuing
          if (!this.isSitting && !this.isBenchSitting && !this.isClockEligible && roll >= 0.20 && roll < 0.30) {
            const shops = layout.venues.filter(v =>
              (v.type === 'shop' || v.type === 'bookshop') && v.queuePositions.length > 0
            );
            if (shops.length > 0) {
              const shop = shops[Math.floor(Math.random() * shops.length)];
              const queue = venueQueues.get(shop) || [];
              if (queue.length < 4) {
                queue.push(this);
                venueQueues.set(shop, queue);
                this.isQueuing = true;
                this.queueVenue = shop;
                this.queueTimer = 0;
              }
            }
          }

          // Window shopping
          if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isClockEligible && roll >= 0.30 && roll < 0.42) {
            const shops = layout.venues.filter(v => v.type === 'shop' || v.type === 'bookshop');
            if (shops.length > 0) {
              const shop = shops[Math.floor(Math.random() * shops.length)];
              let wx = shop.x + shop.w / 2;
              let wy = shop.y + shop.h / 2;
              if (shop.facingPlaza === 'bottom') wy = shop.y + shop.h + 12;
              else if (shop.facingPlaza === 'top') wy = shop.y - 12;
              else if (shop.facingPlaza === 'right') wx = shop.x + shop.w + 12;
              else wx = shop.x - 12;
              this.isWindowShopping = true;
              this.windowShopTimer = 60 + Math.floor(Math.random() * 120);
              this.waypointX = wx;
              this.waypointY = wy;
              this.waypointTimer = 0;
            }
          }

          // Social chat
          if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.isClockEligible && roll >= 0.42 && roll < 0.56) {
            this.socialMode = true;
            this.socialTimer = 100 + Math.floor(Math.random() * 220);
          }

          // Group walking
          if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isClockEligible && roll >= 0.56 && roll < 0.62) {
            const nearbyFree: Pedestrian[] = [];
            for (const other of pedestrians) {
              if (other === this || other.isClockEligible || other.groupLeader || other.groupFollowers.length > 0) continue;
              if (other.isSitting || other.isBenchSitting || other.isQueuing || other.isWindowShopping || other.socialMode) continue;
              const d = Math.hypot(other.x - this.x, other.y - this.y);
              if (d < 60) nearbyFree.push(other);
              if (nearbyFree.length >= 2) break;
            }
            if (nearbyFree.length > 0) {
              this.groupFollowers = nearbyFree;
              for (const f of nearbyFree) f.groupLeader = this;
            }
          }

          // Phone checking — stand still and browse
          if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isClockEligible && roll >= 0.62 && roll < 0.72) {
            this.isCheckingPhone = true;
            this.phoneTimer = 80 + Math.floor(Math.random() * 150);
          }

          // Photo taking near venues
          if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isCheckingPhone && !this.isClockEligible && roll >= 0.72 && roll < 0.78) {
            let nearVenue: VenueDef | null = null;
            let nearDist = Infinity;
            for (const v of layout.venues) {
              const vcx = v.x + v.w / 2;
              const vcy = v.y + v.h / 2;
              const d = Math.hypot(vcx - this.x, vcy - this.y);
              if (d < 100 && d < nearDist) {
                nearDist = d;
                nearVenue = v;
              }
            }
            if (nearVenue) {
              this.isTakingPhoto = true;
              this.photoTimer = 60 + Math.floor(Math.random() * 100);
              this.angle = Math.atan2(
                (nearVenue.y + nearVenue.h / 2) - this.y,
                (nearVenue.x + nearVenue.w / 2) - this.x
              );
            }
          }

          // Otherwise pick a new waypoint
          if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isCheckingPhone && !this.isTakingPhoto) {
            if (Math.random() < 0.3) this.hasFood = false; // might finish food
            const wp = layout.getRandomSidewalkWaypoint();
            this.setWaypointWithCrosswalkRouting(layout, wp.x, wp.y);
          }
          } // close else for intermediate waypoint check
        }

        if (wpDist > 0) {
          ax += (wpDx / wpDist) * this.maxForce * 1.5;
          ay += (wpDy / wpDist) * this.maxForce * 1.5;
        }

        // Random thought while walking (Sims-style idle thoughts) — ~1 visible every 30s
        if (!isBusy && !this.groupLeader && !this.thoughtBubble && Math.random() < 0.00008) {
          const thoughts = ['music', 'happy', 'idea'];
          this.thoughtBubble = thoughts[Math.floor(Math.random() * thoughts.length)];
          this.thoughtTimer = 40 + Math.floor(Math.random() * 40);
        }
      }

      if (!this.socialMode) {
        // 2. Separation — skip distant pedestrians early using squared distance
        let sepX = 0, sepY = 0, sepCount = 0;
        const sepRadSq = SEPARATION_RADIUS * SEPARATION_RADIUS;
        for (const other of pedestrians) {
          if (other === this) continue;
          const dx = this.x - other.x;
          const dy = this.y - other.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 0 && distSq < sepRadSq) {
            const dist = Math.sqrt(distSq);
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

      // 5. Building repulsion — single-pass check + repel (avoid double iteration)
      const nextX = this.x + this.vx + ax;
      const nextY = this.y + this.vy + ay;
      const m = 6;
      let repelled = false;
      for (const b of layout.buildings) {
        if (nextX >= b.x - m && nextX <= b.x + b.w + m &&
            nextY >= b.y - m && nextY <= b.y + b.h + m) {
          const rdx = this.x - (b.x + b.w / 2);
          const rdy = this.y - (b.y + b.h / 2);
          const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
          ax += (rdx / rd) * this.maxForce * 8;
          ay += (rdy / rd) * this.maxForce * 8;
          repelled = true;
          break;
        }
      }
      if (!repelled) {
        for (const v of layout.venues) {
          if (nextX >= v.x - m && nextX <= v.x + v.w + m &&
              nextY >= v.y - m && nextY <= v.y + v.h + m) {
            const rdx = this.x - (v.x + v.w / 2);
            const rdy = this.y - (v.y + v.h / 2);
            const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
            ax += (rdx / rd) * this.maxForce * 8;
            ay += (rdy / rd) * this.maxForce * 8;
            break;
          }
        }
      }

      // 6. Road repulsion — keep pedestrians on sidewalks (skip plaza, crosswalks, clock mode)
      if (!this.clockTarget && !this.clockDismissTarget &&
          !layout.isInPlaza(nextX, nextY) && !layout.isOnCrosswalk(nextX, nextY)) {
        for (const road of layout.roads) {
          const rm = 4;
          if (nextX >= road.x - rm && nextX <= road.x + road.w + rm &&
              nextY >= road.y - rm && nextY <= road.y + road.h + rm) {
            const rdx = this.x - (road.x + road.w / 2);
            const rdy = this.y - (road.y + road.h / 2);
            const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
            ax += (rdx / rd) * this.maxForce * 10;
            ay += (rdy / rd) * this.maxForce * 10;
            break;
          }
        }
      }
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

    // Phone in hand when checking phone — fixed pixel sizes
    if (this.isCheckingPhone) {
      ctx.fillStyle = `rgba(25, 25, 30, 0.9)`;
      ctx.fillRect(3, -1.5, 2.5, 3.5);
      ctx.fillStyle = `rgba(170, 200, 255, 0.6)`;
      ctx.fillRect(3.3, -1.2, 1.9, 2.9);
    }

    // Phone held up when taking photo — fixed pixel sizes
    if (this.isTakingPhoto) {
      ctx.fillStyle = `rgba(25, 25, 30, 0.9)`;
      ctx.fillRect(4, -2, 3, 4);
      ctx.fillStyle = `rgba(170, 200, 255, 0.5)`;
      ctx.fillRect(4.3, -1.7, 2.4, 3.4);
    }

    // Takeaway food/drink while walking — fixed pixel sizes
    if (this.hasFood && !this.isSitting && !this.isBenchSitting) {
      const cf = 1 - nightAlpha * 0.25;
      ctx.fillStyle = `rgb(${Math.floor(240 * cf)},${Math.floor(232 * cf)},${Math.floor(210 * cf)})`;
      ctx.fillRect(3, 1.5, 2.2, 3);
      ctx.fillStyle = `rgb(${Math.floor(180 * cf)},${Math.floor(80 * cf)},${Math.floor(40 * cf)})`;
      ctx.fillRect(3.1, 1.8, 2, 0.8);
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

    // Thought bubble (Sims-style) — drawn in fixed pixel sizes so visible at any zoom
    if (this.thoughtBubble && this.thoughtTimer > 0) {
      const alpha = Math.min(1, this.thoughtTimer / 15);
      const bx = 2;
      const by = -10;
      const bubR = 5;

      // Bubble background
      ctx.fillStyle = `rgba(255, 255, 255, ${0.88 * alpha})`;
      ctx.beginPath();
      ctx.arc(bx, by, bubR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(160, 160, 160, ${0.6 * alpha})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Connector dots
      ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * alpha})`;
      ctx.beginPath();
      ctx.arc(bx - 1, by + bubR + 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx - 0.5, by + bubR + 4.5, 1, 0, Math.PI * 2);
      ctx.fill();

      // Icon — fixed 7px font
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha;
      switch (this.thoughtBubble) {
        case 'heart':
          ctx.fillStyle = 'rgba(220, 50, 50, 0.9)';
          ctx.fillText('\u2665', bx, by);
          break;
        case 'music':
          ctx.fillStyle = 'rgba(80, 80, 80, 0.9)';
          ctx.fillText('\u266A', bx, by);
          break;
        case 'happy':
          ctx.fillStyle = 'rgba(50, 160, 50, 0.9)';
          ctx.fillText('\u2605', bx, by);
          break;
        case 'idea':
          ctx.fillStyle = 'rgba(220, 180, 30, 0.9)';
          ctx.fillText('!', bx, by);
          break;
      }
      ctx.globalAlpha = prevAlpha;
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
