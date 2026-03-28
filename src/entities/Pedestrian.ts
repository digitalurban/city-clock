import { PEDESTRIAN_BASE_SPEED, PEDESTRIAN_MAX_FORCE, SEPARATION_RADIUS, PEDESTRIAN_COLORS } from '../utils/constants';
import type { CityLayout, VenueDef, PlazaBenchDef } from '../city/CityLayout';
import type { Car } from './Car';

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

// Umbrella colours
const UMBRELLA_COLORS = [
  '#e53935', '#1e88e5', '#43a047', '#fdd835',
  '#8e24aa', '#d81b60', '#3949ab', '#00acc1',
  '#1a1a1a', '#e64a19', '#00897b', '#ffb300'
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
  hasUmbrella: boolean;
  umbrellaColor: string;

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

  // Rain sheltering — standing under a venue awning
  isSheltering: boolean = false;
  shelterX: number = 0;
  shelterY: number = 0;

  // Market browsing — wandering between market stalls
  isBrowsingMarket: boolean = false;
  marketBrowseTimer: number = 0;

  // Garden presence — stepping outside while at home
  isInGarden: boolean = false;
  gardenTimer: number = 0;
  gardenDuration: number = 0;
  gardenTargetX: number = 0;
  gardenTargetY: number = 0;

  // Busker watching — slowing down near a street musician and tossing coins
  isWatchingBusker: boolean = false;
  watchBuskerTimer: number = 0;

  // Newspaper stand — stopping briefly to buy a morning paper
  isBuyingPaper: boolean = false;
  buyPaperTimer: number = 0;

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

  // Home assignment
  assignedHome: number = -1; // index into layout.houses
  isGoingHome: boolean = false;
  isAtHome: boolean = false;
  homeTimer: number = 0;
  homeDuration: number = 0;

  // Needs
  energy: number = 100;
  hunger: number = 100;
  social: number = 100;

  // Daily schedule/routine
  assignedWorkplace: number = -1;  // index into layout.buildings
  assignedLunchVenue: number = -1; // index into layout.venues
  assignedEveningVenue: number = -1; // index into layout.venues
  schedulePhase: string = 'wandering'; // current phase
  scheduleJitter: number = 0; // +/- hours offset for transitions
  isAtWorkplace: boolean = false;
  workplaceTimer: number = 0;

  // Dog walking
  hasDog: boolean = false;
  dogX: number = 0;
  dogY: number = 0;
  dogVx: number = 0;
  dogVy: number = 0;
  dogColor: string = '#8b5e3c';
  dogWanderPhase: number = 0;

  // Bicycle
  hasBicycle: boolean = false;
  isRidingBicycle: boolean = false;

  // Track current weather for drawing (e.g. umbrellas)
  currentWeatherType: string = 'clear';
  bicycleSpeed: number = 0;

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
    this.hatColor = HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)];

    // ~28% of non-clock pedestrians carry a shopping bag
    this.hasBag = !this.isClockEligible && Math.random() < 0.28;
    this.bagColor = BAG_COLORS[Math.floor(Math.random() * BAG_COLORS.length)];

    this.hasUmbrella = Math.random() < 0.6; // 60% of people have umbrellas
    this.umbrellaColor = UMBRELLA_COLORS[Math.floor(Math.random() * UMBRELLA_COLORS.length)];

    // ~10% of non-clock pedestrians walk a dog (mutually exclusive with bicycle)
    const DOG_COLORS = ['#8b5e3c', '#d4a76a', '#3c2415', '#faebd7', '#696969', '#c4a882'];
    const dogRoll = Math.random();
    if (!this.isClockEligible && dogRoll < 0.10) {
      this.hasDog = true;
      this.dogColor = DOG_COLORS[Math.floor(Math.random() * DOG_COLORS.length)];
      this.dogWanderPhase = Math.random() * Math.PI * 2;
    }

    // ~15% of non-clock pedestrians have a bicycle (not if they have a dog)
    this.hasBicycle = !this.isClockEligible && !this.hasDog && Math.random() < 0.15;
    this.bicycleSpeed = PEDESTRIAN_BASE_SPEED * 3;

    // Assign each non-clock pedestrian a home, workplace, and favourite venues
    if (!this.isClockEligible) {
      this.assignedHome = Math.floor(Math.random() * Math.max(1, layout.houses.length));
      if (layout.buildings.length > 0) {
        this.assignedWorkplace = Math.floor(Math.random() * layout.buildings.length);
      }
      const cafes = layout.venues.filter(v => v.type === 'cafe' || v.type === 'restaurant');
      const bars = layout.venues.filter(v => v.type === 'bar');
      if (cafes.length > 0) {
        this.assignedLunchVenue = layout.venues.indexOf(cafes[Math.floor(Math.random() * cafes.length)]);
      } else if (layout.venues.length > 0) {
        this.assignedLunchVenue = Math.floor(Math.random() * layout.venues.length);
      }
      if (bars.length > 0) {
        this.assignedEveningVenue = layout.venues.indexOf(bars[Math.floor(Math.random() * bars.length)]);
      } else if (layout.venues.length > 0) {
        this.assignedEveningVenue = Math.floor(Math.random() * layout.venues.length);
      }
      this.scheduleJitter = (Math.random() - 0.5) * 0.5; // +/- 15 min
    }

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

    // Varied starting needs so they don't all act at once
    this.energy = 30 + Math.random() * 70;
    this.hunger = 30 + Math.random() * 70;
    this.social = 30 + Math.random() * 70;

    this.angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(this.angle) * this.baseSpeed * 0.5;
    this.vy = Math.sin(this.angle) * this.baseSpeed * 0.5;

    const wp = layout.getRandomSidewalkWaypoint();
    this.waypointX = wp.x;
    this.waypointY = wp.y;
    this.waypointTimer = 0;
    this.walkPhase = Math.random() * Math.PI * 2;

    // Init dog position behind owner
    if (this.hasDog) {
      this.dogX = this.x - 10;
      this.dogY = this.y;
    }
  }

  /** Determine which schedule phase this pedestrian should be in based on real time */
  private getSchedulePhase(): string {
    const d = new Date();
    const hour = d.getHours() + d.getMinutes() / 60 + this.scheduleJitter;
    if (hour >= 22 || hour < 7) return 'sleeping';
    if (hour < 7.5) return 'commuting_to_work';
    if (hour < 12) return 'working';
    if (hour < 13) return 'lunch_break';
    if (hour < 13.5) return 'commuting_back';
    if (hour < 17.5) return 'working_afternoon';
    if (hour < 18) return 'commuting_evening';
    if (hour < 21) return 'evening_out';
    return 'going_home';
  }

  /** Set waypoint to a building's entrance (front face midpoint) */
  private setWaypointToBuilding(layout: CityLayout, bIdx: number) {
    if (bIdx < 0 || bIdx >= layout.buildings.length) return;
    const b = layout.buildings[bIdx];
    // Walk to front of building (bottom edge midpoint, facing the street)
    const tx = b.x + b.w / 2;
    const ty = b.y + b.h + 8; // just outside the front
    this.setWaypointWithCrosswalkRouting(layout, tx, ty);
  }

  /** Set waypoint to a venue's seating area */
  private setWaypointToVenue(layout: CityLayout, vIdx: number) {
    if (vIdx < 0 || vIdx >= layout.venues.length) return;
    const v = layout.venues[vIdx];
    if (v.seatingPositions.length > 0) {
      const seat = v.seatingPositions[Math.floor(Math.random() * v.seatingPositions.length)];
      this.isSitting = true;
      this.sitX = seat.x;
      this.sitY = seat.y;
      this.sitTimer = 0;
      // Longer sits during morning coffee and lunch rush
      const hour = new Date().getHours() + new Date().getMinutes() / 60 + this.scheduleJitter;
      let sitMult = 1.0;
      if (hour >= 8 && hour < 9.5) sitMult = 1.4;   // morning coffee
      if (hour >= 12 && hour < 13.5) sitMult = 1.8;  // lunch
      if (hour >= 17.5 && hour < 20) sitMult = 1.5;  // after-work drinks
      this.sitDuration = Math.floor((600 + Math.random() * 600) * sitMult);
      this.waypointX = seat.x;
      this.waypointY = seat.y;
      this.waypointTimer = 0;
    } else {
      const tx = v.x + v.w / 2;
      const ty = v.y + v.h + 10;
      this.setWaypointWithCrosswalkRouting(layout, tx, ty);
    }
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
  }

  update(
    pedestrians: Pedestrian[],
    layout: CityLayout,
    isDancing: boolean = false,
    weatherIntensity: number = 0,
    weatherType: string = 'clear',
    width: number,
    height: number,
    cars: Car[] = []
  ) {
    this.currentWeatherType = weatherType;
    let ax = 0;
    let ay = 0;
    const time = Date.now() * 0.001;

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
      // Send each pedestrian to their own individual waypoint (not shared, avoids clustering)
      const dx = this.clockDismissTarget.x - this.x;
      const dy = this.clockDismissTarget.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 20) {
        // Reached dismiss target — smoothly enter autonomous mode
        this.clockDismissTarget = null;
        // Set a fresh individual waypoint spread across the plaza/sidewalks
        const wp = layout.getRandomSidewalkWaypoint();
        this.waypointX = wp.x;
        this.waypointY = wp.y;
        this.waypointTimer = Math.floor(Math.random() * 400); // stagger restarts
        this.vx *= 0.5;
        this.vy *= 0.5;
      } else {
        ax += (dx / dist) * this.maxForce * 6.0;
        ay += (dy / dist) * this.maxForce * 6.0;
      }
      this.vx *= 0.90;
      this.vy *= 0.90;

    } else {
      // === AUTONOMOUS MODE ===

      // Update thought bubble timer
      if (this.thoughtTimer > 0) {
        this.thoughtTimer--;
        if (this.thoughtTimer <= 0) this.thoughtBubble = null;
      }

      // Decrease needs gradually over time
      this.energy = Math.max(0, this.energy - 0.005);
      this.hunger = Math.max(0, this.hunger - 0.01);
      this.social = Math.max(0, this.social - 0.015);

      const isBusy = this.isSitting || this.isBenchSitting || this.socialMode
        || this.isQueuing || this.isWindowShopping || this.isCheckingPhone || this.isTakingPhoto
        || this.isGoingHome || this.isAtHome || this.isAtWorkplace
        || this.isSheltering || this.isBrowsingMarket;

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
          this.thoughtTimer = 120;
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

      // --- Rain sheltering under awnings ---
      if (this.isSheltering) {
        const isHeavyRain = weatherType === 'rain' || weatherType === 'heavy_rain'
          || weatherType === 'thunderstorm' || weatherType === 'hail';
        if (!isHeavyRain || weatherIntensity < 0.35 || this.clockTarget || isDancing) {
          // Weather eased or overridden — resume normal life
          this.isSheltering = false;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          const sdx = this.shelterX - this.x;
          const sdy = this.shelterY - this.y;
          ax += sdx * 0.12;
          ay += sdy * 0.12;
          this.vx *= 0.78;
          this.vy *= 0.78;
          // Face inward (toward the venue wall)
          if (Math.abs(sdx) + Math.abs(sdy) < 5) {
            const pb = layout.plazaBounds;
            const toCenterX = (pb.x + pb.w / 2) - this.x;
            const toCenterY = (pb.y + pb.h / 2) - this.y;
            this.angle = Math.atan2(-toCenterY, -toCenterX); // face away from center (toward wall)
          }
        }
      }

      // --- Market browsing ---
      if (this.isBrowsingMarket) {
        this.marketBrowseTimer++;
        const stallDuration = 180 + Math.random() * 240; // ~3-7 seconds per stall
        if (this.marketBrowseTimer >= stallDuration || this.clockTarget || isDancing) {
          this.isBrowsingMarket = false;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          const sdx = this.waypointX - this.x;
          const sdy = this.waypointY - this.y;
          ax += sdx * 0.04;
          ay += sdy * 0.04;
          this.vx *= 0.88;
          this.vy *= 0.88;
        }
      }

      // --- Busker watching ---
      if (this.isWatchingBusker) {
        this.watchBuskerTimer++;
        const watchDuration = 100 + Math.random() * 200; // ~2–5 s
        if (!layout.buskerActive || this.watchBuskerTimer >= watchDuration || this.clockTarget || isDancing) {
          this.isWatchingBusker = false;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          // Drift toward standing spot and slow right down
          const sdx = this.waypointX - this.x;
          const sdy = this.waypointY - this.y;
          ax += sdx * 0.05;
          ay += sdy * 0.05;
          this.vx *= 0.84;
          this.vy *= 0.84;
          // Face the busker
          this.angle = Math.atan2(layout.buskerY - this.y, layout.buskerX - this.x);
          // Toss a coin roughly every 1.5 s
          if (this.watchBuskerTimer % 90 === 45 && Math.random() < 0.4) {
            layout.addCoinParticle(this.x, this.y);
          }
        }
      }

      // --- Newspaper stand ---
      if (this.isBuyingPaper) {
        this.buyPaperTimer++;
        const buyDuration = 55 + Math.random() * 65; // ~1–2 s
        if (this.buyPaperTimer >= buyDuration || this.clockTarget || isDancing) {
          this.isBuyingPaper = false;
          this.thoughtBubble = 'happy';
          this.thoughtTimer = 80;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          const sdx = this.waypointX - this.x;
          const sdy = this.waypointY - this.y;
          ax += sdx * 0.09;
          ay += sdy * 0.09;
          this.vx *= 0.78;
          this.vy *= 0.78;
          // Face the stand
          this.angle = Math.atan2(layout.newsstandY - this.y, layout.newsstandX - this.x);
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
            this.thoughtTimer = 100;
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
            this.thoughtTimer = 120;
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
          this.thoughtTimer = 100;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
        } else {
          this.vx *= 0.82;
          this.vy *= 0.82;
        }
      }

      // --- Going home ---
      if (this.isGoingHome && !this.isAtHome) {
        const home = layout.houses[this.assignedHome];
        if (home) {
          const frontDoorX = home.x + home.w / 2;
          const frontDoorY = home.gardenSide === 'bottom' ? home.y + home.h : home.y;
          const distToDoor = Math.hypot(frontDoorX - this.x, frontDoorY - this.y);

          if (distToDoor < 15) {
            // Arrived at house - go inside
            this.isAtHome = true;
            this.isRidingBicycle = false;
            this.homeTimer = 0;
            this.vx = 0;
            this.vy = 0;
          }
        }
      }

      // --- At home ---
      if (this.isAtHome) {
        this.homeTimer++;
        const home = layout.houses[this.assignedHome];

        // --- Garden puttering (daytime only) ---
        if (this.isInGarden) {
          this.gardenTimer++;
          if (this.gardenTimer >= this.gardenDuration || isDancing || this.clockTarget) {
            // Come back inside
            this.isInGarden = false;
            if (home) {
              this.x = home.x + home.w / 2;
              this.y = home.gardenSide === 'bottom' ? home.y + home.h - 2 : home.y + 2;
            }
            this.vx = 0; this.vy = 0;
          } else {
            // Slow wander within garden bounds
            if (Math.random() < 0.018 && home && home.hasGarden) {
              const gh = Math.floor(home.h * 0.5);
              const gy = home.gardenSide === 'top' ? home.y - gh : home.y + home.h;
              this.gardenTargetX = home.x + 3 + Math.random() * (home.w - 6);
              this.gardenTargetY = gy + 3 + Math.random() * (gh - 6);
            }
            const gdx = this.gardenTargetX - this.x;
            const gdy = this.gardenTargetY - this.y;
            ax += gdx * 0.04;
            ay += gdy * 0.04;
            this.vx *= 0.88;
            this.vy *= 0.88;
            this.angle = Math.atan2(gdy, gdx);
          }
        } else {
          // Inside — freeze position
          this.vx *= 0.1;
          this.vy *= 0.1;

          // Occasionally step into garden during the day
          const phase = this.getSchedulePhase();
          const isDaytime = phase !== 'sleeping';
          if (isDaytime && !this.clockTarget && !isDancing && Math.random() < 0.0015
            && home && home.hasGarden) {
            const gh = Math.floor(home.h * 0.5);
            const gy = home.gardenSide === 'top' ? home.y - gh : home.y + home.h;
            this.isInGarden = true;
            this.gardenTimer = 0;
            this.gardenDuration = 180 + Math.floor(Math.random() * 300); // 3–8 s in garden
            this.gardenTargetX = home.x + 3 + Math.random() * (home.w - 6);
            this.gardenTargetY = gy + 3 + Math.random() * (gh - 6);
            this.x = this.gardenTargetX;
            this.y = this.gardenTargetY;
          }
        }

        if (this.homeTimer >= this.homeDuration) {
          // During sleeping phase, renew stay instead of leaving
          if (this.getSchedulePhase() === 'sleeping') {
            this.homeTimer = 0;
            this.homeDuration = 3600; // re-check in ~1 min
          } else {
            // Leave home
            this.isAtHome = false;
            this.isGoingHome = false;
            this.isInGarden = false;
            this.thoughtBubble = 'happy';
            this.thoughtTimer = 100;

            // Walk back out to sidewalk via garden path
            if (home && home.gardenPathEnd) {
              this.waypointX = home.gardenPathEnd.x;
              this.waypointY = home.gardenPathEnd.y;
            } else {
              const wp = layout.getRandomSidewalkWaypoint();
              this.waypointX = wp.x;
              this.waypointY = wp.y;
            }
            this.waypointTimer = 0;

            if (this.hasBicycle && Math.random() < 0.6) this.isRidingBicycle = true;
          }
        }
      }

      // --- At workplace ---
      if (this.isAtWorkplace) {
        this.workplaceTimer++;
        // Slow movement near building
        this.vx *= 0.3;
        this.vy *= 0.3;
        // Check if schedule phase has changed — time to leave work
        const phase = this.getSchedulePhase();
        if (phase !== 'working' && phase !== 'working_afternoon' && phase !== 'commuting_to_work' && phase !== 'commuting_back') {
          this.isAtWorkplace = false;
          this.schedulePhase = phase;
          const wp = layout.getRandomSidewalkWaypoint();
          this.waypointX = wp.x;
          this.waypointY = wp.y;
          this.waypointTimer = 0;
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

        if (wpDist < 18 || this.waypointTimer > 360) {
          // Detect stuck — if timer expired but we barely moved, force a brand new waypoint
          // far away to break the oscillation
          const forceNewWaypoint = this.waypointTimer > 360;
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

            let roll = Math.random();
            let scheduledAction = false;

            // Daily schedule — override waypoint based on time of day
            if (!this.isClockEligible && !forceNewWaypoint) {
              const targetPhase = this.getSchedulePhase();
              if (targetPhase !== this.schedulePhase) {
                this.schedulePhase = targetPhase;
                // Clear workplace state on phase change
                this.isAtWorkplace = false;
                this.workplaceTimer = 0;
              }

              // Route based on current schedule phase
              switch (this.schedulePhase) {
                case 'sleeping':
                case 'going_home':
                  if (!this.isGoingHome && !this.isAtHome && this.assignedHome >= 0) {
                    roll = 0.82; // -> go home path
                  }
                  scheduledAction = true;
                  break;
                case 'commuting_to_work':
                case 'commuting_back':
                case 'working':
                case 'working_afternoon':
                  if (this.assignedWorkplace >= 0) {
                    const b = layout.buildings[this.assignedWorkplace];
                    const distToWork = Math.hypot(this.x - (b.x + b.w / 2), this.y - (b.y + b.h));
                    if (distToWork > 30) {
                      // Walk toward workplace
                      this.setWaypointToBuilding(layout, this.assignedWorkplace);
                      this.waypointTimer = 0;
                      scheduledAction = true;
                    } else {
                      // At workplace — stand around near building, low activity
                      this.isAtWorkplace = true;
                      this.workplaceTimer = 0;
                      const wx = b.x + Math.random() * b.w;
                      const wy = b.y + b.h + 5 + Math.random() * 10;
                      this.waypointX = wx;
                      this.waypointY = wy;
                      this.waypointTimer = 0;
                      scheduledAction = true;
                    }
                  }
                  break;
                case 'lunch_break':
                  if (this.assignedLunchVenue >= 0 && !this.isSitting) {
                    this.setWaypointToVenue(layout, this.assignedLunchVenue);
                    this.waypointTimer = 0;
                    scheduledAction = true;
                  }
                  break;
                case 'commuting_evening':
                case 'evening_out':
                  if (this.assignedEveningVenue >= 0 && !this.isSitting) {
                    this.setWaypointToVenue(layout, this.assignedEveningVenue);
                    this.waypointTimer = 0;
                    scheduledAction = true;
                  }
                  break;
              }
            }

            // Override roll based on needs if not clock eligible (fallback when not scheduled)
            if (!scheduledAction && !this.isClockEligible) {
              if (this.energy < 20 && this.assignedHome >= 0) {
                roll = 0.82; // Force -> Go home
                this.energy = 100; // Reset need
              } else if (this.hunger < 25) {
                roll = 0.05; // Force -> Venue sitting (Cafe/Restaurant)
                this.hunger = 100; // Reset need
              } else if (this.social < 20) {
                roll = 0.50; // Force -> Social chat
                this.social = 100; // Reset need
              }
            }

            // Increase venue-visit probability during morning coffee and lunch rush
            const nowHour = new Date().getHours() + new Date().getMinutes() / 60 + this.scheduleJitter;
            const isMorningRush = nowHour >= 8 && nowHour < 9.5;
            const isLunchRush = nowHour >= 12 && nowHour < 13.5;
            const venueRollThreshold = (isMorningRush || isLunchRush) ? 0.22 : 0.12;

            // Trigger rain sheltering — seek awning if in plaza during heavy rain
            if (!scheduledAction && !this.isClockEligible && !this.isSheltering
              && !this.isRidingBicycle && layout.isInPlaza(this.x, this.y)) {
              const isHeavyRain = weatherType === 'rain' || weatherType === 'heavy_rain'
                || weatherType === 'thunderstorm' || weatherType === 'hail';
              if (isHeavyRain && weatherIntensity > 0.45) {
                let nearest: { x: number; y: number } | null = null;
                let nearestDist = 250;
                for (const s of layout.awningSheltPositions) {
                  const d = Math.hypot(s.x - this.x, s.y - this.y);
                  if (d < nearestDist) { nearestDist = d; nearest = s; }
                }
                if (nearest) {
                  this.isSheltering = true;
                  this.shelterX = nearest.x;
                  this.shelterY = nearest.y;
                  this.waypointX = nearest.x;
                  this.waypointY = nearest.y;
                  this.waypointTimer = 0;
                  this.thoughtBubble = 'idea';
                  this.thoughtTimer = 90;
                }
              }
            }

            // Trigger market browsing — wander to a stall when market is active
            if (!scheduledAction && !this.isClockEligible && !this.isBrowsingMarket
              && layout.isMarketDay() && layout.isInPlaza(this.x, this.y)
              && !isDancing && roll >= 0.35 && roll < 0.42) {
              if (layout.marketStalls.length > 0) {
                const stall = layout.marketStalls[Math.floor(Math.random() * layout.marketStalls.length)];
                this.isBrowsingMarket = true;
                this.marketBrowseTimer = 0;
                // Stand in front of the stall (south edge + gap), not on top of it
                this.waypointX = stall.x + 10 + (Math.random() - 0.5) * 8;
                this.waypointY = stall.y + 22;
                this.waypointTimer = 0;
              }
            }

            // Trigger busker watching — stop and listen when passing near an active pitch
            if (!scheduledAction && !this.isClockEligible && !this.isWatchingBusker
              && !this.isBuyingPaper && layout.buskerActive && !isDancing) {
              const bdx = this.x - layout.buskerX;
              const bdy = this.y - layout.buskerY;
              const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
              if (bdist < 70 && Math.random() < 0.018) {
                this.isWatchingBusker = true;
                this.watchBuskerTimer = 0;
                // Stand a short distance away facing the busker
                const angle = Math.atan2(bdy, bdx);
                const standDist = 22 + Math.random() * 18;
                this.waypointX = layout.buskerX + Math.cos(angle) * standDist;
                this.waypointY = layout.buskerY + Math.sin(angle) * standDist;
                this.waypointTimer = 0;
              }
            }

            // Trigger newspaper buying — stop at the stand in the morning
            if (!scheduledAction && !this.isClockEligible && !this.isBuyingPaper
              && !this.isWatchingBusker && !isDancing) {
              const hour = new Date().getHours();
              if (hour >= 6 && hour < 13) {
                const ndx = this.x - layout.newsstandX;
                const ndy = this.y - layout.newsstandY;
                if (Math.sqrt(ndx * ndx + ndy * ndy) < 90 && Math.random() < 0.010) {
                  this.isBuyingPaper = true;
                  this.buyPaperTimer = 0;
                  this.waypointX = layout.newsstandX + 10;
                  this.waypointY = layout.newsstandY + 32;
                  this.waypointTimer = 0;
                }
              }
            }

            // Venue sitting — prefer cafes/restaurants, boosted during rush hours
            if (scheduledAction) {
              // Schedule already set the waypoint — skip random activity selection
            } else if (!this.isClockEligible && roll < venueRollThreshold) {
              const cafeVenues = layout.venues.filter(v => v.type === 'cafe' || v.type === 'restaurant');
              const pool = cafeVenues.length > 0 ? cafeVenues : layout.venues;
              const venue = pool[Math.floor(Math.random() * pool.length)];
              if (venue.seatingPositions.length > 0) {
                const seat = venue.seatingPositions[Math.floor(Math.random() * venue.seatingPositions.length)];
                this.isSitting = true;
                this.sitX = seat.x;
                this.sitY = seat.y;
                this.sitTimer = 0;
                const sitMult = isMorningRush ? 1.4 : isLunchRush ? 1.8 : 1.0;
                this.sitDuration = Math.floor((600 + Math.random() * 600) * sitMult);
                this.waypointX = seat.x;
                this.waypointY = seat.y;
                this.waypointTimer = 0;
                // Face toward plaza center
                const pb = layout.plazaBounds;
                this.angle = Math.atan2(
                  (pb.y + pb.h / 2) - seat.y,
                  (pb.x + pb.w / 2) - seat.x
                );
                this.thoughtBubble = 'food';
                this.thoughtTimer = 100;
              }
            }

            // Bench sitting
            if (!this.isSitting && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.12 && roll < 0.20) {
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
                this.sitDuration = 600 + Math.random() * 600;
                this.waypointX = nearestBench.x;
                this.waypointY = nearestBench.y;
                this.waypointTimer = 0;
                // Face perpendicular to bench
                this.angle = nearestBench.angle + Math.PI / 2;
              }
            }

            // Shop queuing
            if (!this.isSitting && !this.isBenchSitting && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.20 && roll < 0.30) {
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
            if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.30 && roll < 0.42) {
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
                this.windowShopTimer = 120 + Math.floor(Math.random() * 240);
                this.waypointX = wx;
                this.waypointY = wy;
                this.waypointTimer = 0;
              }
            }

            // Social chat
            if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.42 && roll < 0.56) {
              this.socialMode = true;
              this.socialTimer = 100 + Math.floor(Math.random() * 220);
              if (this.social < 50) {
                this.thoughtBubble = 'chat';
                this.thoughtTimer = 100;
              }
            }

            // Group walking
            if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.56 && roll < 0.62) {
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
            if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.62 && roll < 0.72) {
              this.isCheckingPhone = true;
              this.phoneTimer = 80 + Math.floor(Math.random() * 150);
            }

            // Photo taking near venues
            if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isCheckingPhone && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.72 && roll < 0.78) {
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

            // Go home
            if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isCheckingPhone && !this.isTakingPhoto && !this.isGoingHome && !this.isAtHome && !this.isClockEligible && roll >= 0.78 && roll < 0.88) {
              if (this.assignedHome >= 0 && this.assignedHome < layout.houses.length) {
                const home = layout.houses[this.assignedHome];
                this.isGoingHome = true;
                this.homeTimer = 0;
                this.homeDuration = 1200 + Math.floor(Math.random() * 1200); // 20–40 s daytime visit

                // Walk to garden path end first, then to front door
                const pathEnd = home.gardenPathEnd;
                if (pathEnd) {
                  this.setWaypointWithCrosswalkRouting(layout, pathEnd.x, pathEnd.y);
                } else {
                  this.waypointX = home.x + home.w / 2;
                  this.waypointY = home.y + home.h;
                  this.waypointTimer = 0;
                }

                // If has bicycle, ride it
                if (this.hasBicycle) {
                  this.isRidingBicycle = true;
                }

                this.thoughtBubble = 'home';
                this.thoughtTimer = 100;
              }
            }

            // Otherwise pick a new waypoint
            // If stuck (timer expired without reaching target), skip activities and just move
            if (!this.isSitting && !this.isBenchSitting && !this.isQueuing && !this.isWindowShopping && !this.socialMode && !this.isCheckingPhone && !this.isTakingPhoto && !this.isGoingHome && !this.isAtHome) {

              if (!forceNewWaypoint && layout.activeEvent && !this.isClockEligible && roll < 0.3) {
                // Route to event
                const ev = layout.activeEvent;
                const d = Math.hypot(ev.x - this.x, ev.y - this.y);
                if (d < 600) { // If within reasonable distance
                  this.waypointX = ev.x + (Math.random() - 0.5) * ev.radius;
                  this.waypointY = ev.y + (Math.random() - 0.5) * ev.radius;
                  this.waypointTimer = 0;

                  // Watch the event when they arrive
                  this.socialMode = true;
                  this.socialTimer = 200 + Math.random() * 400; // Watch for a while

                  // Face the event
                  this.angle = Math.atan2(ev.y - this.waypointY, ev.x - this.waypointX);

                  this.thoughtBubble = ev.type === 'musician' ? 'music' : 'idea';
                  this.thoughtTimer = 120;
                }
              }

              if (!this.socialMode) {
                if (Math.random() < 0.3) this.hasFood = false; // might finish food
                const wp = layout.getRandomSidewalkWaypoint();
                this.setWaypointWithCrosswalkRouting(layout, wp.x, wp.y);
                // Stagger timer when forced to prevent all stuck peds refreshing at once
                if (forceNewWaypoint) this.waypointTimer = Math.floor(Math.random() * 120);
              }
            }
          } // close else for intermediate waypoint check
        }

        if (wpDist > 0) {
          ax += (wpDx / wpDist) * this.maxForce * 1.5;
          ay += (wpDy / wpDist) * this.maxForce * 1.5;
        }

        // Random thought while walking (Sims-style idle thoughts) — ~1 visible every 30s
        if (!isBusy && !this.groupLeader && !this.thoughtBubble && Math.random() < 0.00004) {
          const thoughts = ['music', 'happy', 'idea'];
          this.thoughtBubble = thoughts[Math.floor(Math.random() * thoughts.length)];
          this.thoughtTimer = 80 + Math.floor(Math.random() * 80);
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

        // 3. Organic wander — small random angle drift unique per pedestrian
        // Use a per-pedestrian random walk rather than fixed sin/cos so pedestrians
        // don't all sway in sync. Much smaller magnitude to avoid jitter.
        const wanderStrength = this.maxForce * 0.25;
        ax += Math.cos(time * 0.4 + this.idOffset * 7.3) * wanderStrength;
        ay += Math.sin(time * 0.5 + this.idOffset * 5.1) * wanderStrength;
      }

      // Dancing logic
      if (isDancing) {
        if (!this.clockTarget) { // Non-clock pedestrians head to plaza
          const pC = layout.plazaBounds;
          const pCX = pC.x + pC.w / 2;
          const pCY = pC.y + pC.h / 2;
          const pdx = pCX - this.x;
          const pdy = pCY - this.y;
          const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
          if (pDist > 100) {
            ax += (pdx / pDist) * this.maxForce * 5.0;
            ay += (pdy / pDist) * this.maxForce * 5.0;
          }
        }
      }

      // 4. Boundary repulsion
      const margin = 30;
      const turnForce = this.maxForce * 5;
      if (this.x < margin) ax += turnForce * (margin - this.x) / margin;
      if (this.x > layout.width - margin) ax -= turnForce * (this.x - (layout.width - margin)) / margin;
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
            repelled = true;
            break;
          }
        }
      }
      // House repulsion
      if (!repelled) {
        for (const h of layout.houses) {
          // Skip own home when going home
          if (this.isGoingHome && layout.houses.indexOf(h) === this.assignedHome) continue;
          if (nextX >= h.x - m && nextX <= h.x + h.w + m &&
            nextY >= h.y - m && nextY <= h.y + h.h + m) {
            const rdx = this.x - (h.x + h.w / 2);
            const rdy = this.y - (h.y + h.h / 2);
            const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
            ax += (rdx / rd) * this.maxForce * 8;
            ay += (rdy / rd) * this.maxForce * 8;
            break;
          }
        }
      }

      // Market stall repulsion — treat active stalls as solid obstacles
      if (!repelled && layout.isMarketDay()) {
        const mhour = new Date().getHours();
        if (mhour >= 8 && mhour < 19) {
          const stallW = 20, stallH = 14, sm = 5;
          for (const stall of layout.marketStalls) {
            if (nextX >= stall.x - sm && nextX <= stall.x + stallW + sm &&
                nextY >= stall.y - sm && nextY <= stall.y + stallH + sm) {
              const rdx = this.x - (stall.x + stallW / 2);
              const rdy = this.y - (stall.y + stallH / 2);
              const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
              ax += (rdx / rd) * this.maxForce * 7;
              ay += (rdy / rd) * this.maxForce * 7;
              repelled = true;
              break;
            }
          }
        }
      }

      // 6. Vehicle repulsion — pedestrians flee from any car/truck nearby
      // Delivery trucks inside the plaza get a larger flee radius and stronger push
      const pb = layout.plazaBounds;
      for (const car of cars) {
        const cdx = this.x - car.x;
        const cdy = this.y - car.y;
        const cdist = Math.hypot(cdx, cdy);
        const inPlaza = car.x > pb.x && car.x < pb.x + pb.w &&
                        car.y > pb.y && car.y < pb.y + pb.h;
        const isDeliveryInPlaza = car.carType === 'delivery' && inPlaza;
        const FLEE_RADIUS = isDeliveryInPlaza ? 65 : 45;
        const fleeMult = isDeliveryInPlaza ? 40 : 20;
        if (cdist < FLEE_RADIUS && cdist > 0) {
          const strength = ((FLEE_RADIUS - cdist) / FLEE_RADIUS) * this.maxForce * fleeMult;
          ax += (cdx / cdist) * strength;
          ay += (cdy / cdist) * strength;
        }
      }

      // 7. Road repulsion — keep pedestrians on sidewalks (skip plaza, crosswalks, clock mode)
      // Use distance-proportional force to prevent harsh wobble at road edges
      if (!this.clockTarget && !this.clockDismissTarget &&
        !layout.isInPlaza(nextX, nextY) && !layout.isOnCrosswalk(nextX, nextY)) {
        // Also skip if near a crosswalk (within 20px) — they're trying to cross
        const nearCrosswalk = layout.isOnCrosswalk(this.x, this.y, 20);
        if (!nearCrosswalk) {
          for (const road of layout.roads) {
            const rm = 4;
            if (nextX >= road.x - rm && nextX <= road.x + road.w + rm &&
              nextY >= road.y - rm && nextY <= road.y + road.h + rm) {
              const rdx = this.x - (road.x + road.w / 2);
              const rdy = this.y - (road.y + road.h / 2);
              const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
              // Softer, distance-proportional push — stronger the deeper into the road
              const halfW = road.horizontal ? road.h / 2 : road.w / 2;
              const penetration = Math.max(0, halfW + rm - rd) / (halfW + rm);
              ax += (rdx / rd) * this.maxForce * 6 * penetration;
              ay += (rdy / rd) * this.maxForce * 6 * penetration;
              break;
            }
          }
        }
      }
    }

    // Apply acceleration with velocity damping to prevent oscillation/wobble
    this.vx = this.vx * 0.85 + ax;
    this.vy = this.vy * 0.85 + ay;

    // Speed limits
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.clockTarget) {
      if (speed > this.maxSpeed * 12) {
        this.vx = (this.vx / speed) * this.maxSpeed * 12;
        this.vy = (this.vy / speed) * this.maxSpeed * 12;
      }
    } else {
      let speedMultiplier = this.isRidingBicycle ? 2.5 : 1;

      // Weather reactions
      if (!this.clockTarget) {
        if (weatherType === 'hail') {
          // Hail makes everyone run as fast as possible regardless of umbrella
          speedMultiplier *= 2.5;
        } else if ((weatherType === 'heavy_rain' || weatherType === 'thunderstorm') && !this.hasUmbrella && !this.isRidingBicycle) {
          // Heavy rain / Thunderstorm - huge sprint if no umbrella (pedestrians only)
          speedMultiplier *= 2.0;
        } else if (weatherType === 'rain' && !this.hasUmbrella && !this.isRidingBicycle) {
          // Normal rain sprint (pedestrians only)
          speedMultiplier *= 1.5;
        } else if (weatherType === 'drizzle' && !this.hasUmbrella && !this.isRidingBicycle) {
          // Light drizzle hurry (pedestrians only)
          speedMultiplier *= 1.2;
        } else if ((weatherType === 'snow' || weatherType === 'heavy_snow') && !this.isRidingBicycle) {
          // Slow down slightly on slippery snow (pedestrians only)
          speedMultiplier *= 0.85;
        }
      }

      if (speed > this.maxSpeed * speedMultiplier) {
        this.vx = (this.vx / speed) * this.maxSpeed * speedMultiplier;
        this.vy = (this.vy / speed) * this.maxSpeed * speedMultiplier;
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

    // Update dog position — walks ahead of owner with gentle side wander
    if (this.hasDog && !this.isAtHome) {
      this.dogWanderPhase += 0.02;
      const leashLen = 14;
      // Target: ahead of the owner with gentle sniffing side-to-side
      const wanderX = Math.sin(this.dogWanderPhase * 1.3 + this.idOffset) * 5;
      const wanderY = Math.cos(this.dogWanderPhase * 0.9 + this.idOffset) * 3;
      const targetDogX = this.x + Math.cos(this.angle) * leashLen + wanderX;
      const targetDogY = this.y + Math.sin(this.angle) * leashLen + wanderY;
      // Stiff follow — lerp directly toward target, no velocity accumulation
      this.dogX += (targetDogX - this.dogX) * 0.15;
      this.dogY += (targetDogY - this.dogY) * 0.15;
      this.dogVx = targetDogX - this.dogX; // for angle calculation only
      this.dogVy = targetDogY - this.dogY;
      // Hard clamp leash
      const dDist = Math.hypot(this.dogX - this.x, this.dogY - this.y);
      if (dDist > leashLen * 1.5) {
        const ratio = (leashLen * 1.5) / dDist;
        this.dogX = this.x + (this.dogX - this.x) * ratio;
        this.dogY = this.y + (this.dogY - this.y) * ratio;
      }
    }

    if (isDancing) {
      this.walkPhase += 0.8; // dance faster
      if (currentSpeed < 0.5) { // if standing still, spin or bounce
        this.angle += Math.sin(time * 10 + this.idOffset) * 0.2;
      }
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    nightAlpha: number,
    weatherIntensity: number,
    isDancing: boolean
  ) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.isAtHome && !this.isInGarden) {
      ctx.globalAlpha = 0.15;  // inside the house — faintly visible through roof
    } else if (this.isAtWorkplace) {
      ctx.globalAlpha = 0.3;
    }

    const s = this.size * 5.5;
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    let legSwing = (this.isSitting || this.socialMode)
      ? 0
      : Math.sin(this.walkPhase) * Math.min(speed * 1.5, 2);

    if (isDancing) {
      legSwing = Math.sin(this.walkPhase * 1.5) * 2;
    }

    // Shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + nightAlpha * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(1, 1, s * 1.1, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bicycle
    if (this.isRidingBicycle) {
      const wheelR = s * 0.32;
      ctx.strokeStyle = adjustForNight('#555555', nightAlpha);
      ctx.lineWidth = 1.2;
      // Rear wheel
      ctx.beginPath();
      ctx.arc(-s * 0.5, s * 0.1, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      // Front wheel
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.1, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      // Frame
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.1);
      ctx.lineTo(0, -s * 0.2);
      ctx.lineTo(s * 0.5, s * 0.1);
      ctx.stroke();
      // Handlebar
      ctx.beginPath();
      ctx.moveTo(s * 0.35, -s * 0.1);
      ctx.lineTo(s * 0.65, -s * 0.1);
      ctx.stroke();
    }

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
    ctx.arc(-s * 0.3, legSwing * 0.8, s * 0.25, 0, Math.PI * 2);
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
          ctx.fillRect(s * 0.13, 0, s * 0.1, s * 0.36);
          ctx.fillRect(s * 0.77, 0, s * 0.1, s * 0.36);
        }
      }
    }

    // Umbrella when raining/snowing (pedestrians only, cyclists keep both hands on bars)
    const isPrecipitation = ['rain', 'heavy_rain', 'drizzle', 'snow', 'heavy_snow', 'thunderstorm', 'hail'].includes(this.currentWeatherType);
    if (weatherIntensity > 0.3 && isPrecipitation && !this.isAtHome && !this.isSitting && !this.isRidingBicycle) {
      const wobble = Math.sin(this.walkPhase * 2) * 0.1 * s;
      const ur = s * 1.5;

      // Umbrella canopy
      ctx.fillStyle = adjustForNight(this.umbrellaColor, nightAlpha);
      ctx.beginPath();
      ctx.arc(wobble, 0, ur, 0, Math.PI * 2);
      ctx.fill();

      // Umbrella spokes (subtle lines)
      ctx.strokeStyle = darkenColor(this.umbrellaColor, 0.2);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(wobble, 0);
        ctx.lineTo(wobble + Math.cos(a) * ur, Math.sin(a) * ur);
      }
      ctx.stroke();

      // Umbrella tip
      ctx.fillStyle = adjustForNight('#222222', nightAlpha);
      ctx.beginPath();
      ctx.arc(wobble, 0, ur * 0.1, 0, Math.PI * 2);
      ctx.fill();
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
        case 'home':
          ctx.fillStyle = 'rgba(139, 69, 19, 0.9)';
          ctx.fillText('\u2302', bx, by); // house symbol
          break;
        case 'food':
          ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
          ctx.fillText('\u2615', bx, by); // cafe/coffee symbol
          break;
        case 'chat':
          ctx.fillStyle = 'rgba(80, 150, 220, 0.9)';
          ctx.fillText('\u2026', bx, by); // ellipsis
          break;
      }
      ctx.globalAlpha = prevAlpha;
    }

    ctx.restore();

    // Draw dog (in world space, after restoring owner transform)
    if (this.hasDog && !this.isAtHome && ctx.globalAlpha > 0.2) {
      ctx.save();
      ctx.translate(this.dogX, this.dogY);
      // Dog faces same direction as owner (walking ahead)
      const dogAngle = this.angle;
      ctx.rotate(dogAngle);
      const ds = 0.8; // dog scale

      // Leash line (from dog's back to owner)
      ctx.strokeStyle = `rgba(100, 80, 60, ${0.5 - nightAlpha * 0.2})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const lx = this.x - this.dogX;
      const ly = this.y - this.dogY;
      const cosA = Math.cos(-dogAngle), sinA = Math.sin(-dogAngle);
      const llx = cosA * lx - sinA * ly;
      const lly = sinA * lx + cosA * ly;
      ctx.moveTo(-3 * ds, 0); // attach at dog's back
      ctx.quadraticCurveTo(llx * 0.5, lly * 0.5 + 3, llx, lly); // slight sag
      ctx.stroke();

      // Legs (animated trot)
      const legPhase = this.walkPhase * 1.5;
      const legSwing = Math.sin(legPhase) * 2 * ds;
      ctx.strokeStyle = this.dogColor;
      ctx.lineWidth = 1;
      // Front legs
      ctx.beginPath();
      ctx.moveTo(2 * ds, -1.5 * ds); ctx.lineTo(2 * ds + legSwing, -3.5 * ds);
      ctx.moveTo(2 * ds, 1.5 * ds); ctx.lineTo(2 * ds - legSwing, 3.5 * ds);
      ctx.stroke();
      // Back legs
      ctx.beginPath();
      ctx.moveTo(-2 * ds, -1.5 * ds); ctx.lineTo(-2 * ds - legSwing, -3.5 * ds);
      ctx.moveTo(-2 * ds, 1.5 * ds); ctx.lineTo(-2 * ds + legSwing, 3.5 * ds);
      ctx.stroke();

      // Body (oval)
      ctx.fillStyle = this.dogColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4 * ds, 2 * ds, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head (in front, direction of travel)
      ctx.beginPath();
      ctx.arc(4 * ds, 0, 2.2 * ds, 0, Math.PI * 2);
      ctx.fill();
      // Snout
      ctx.fillStyle = darkenColor(this.dogColor, 0.3);
      ctx.beginPath();
      ctx.ellipse(6 * ds, 0.2 * ds, 1.2 * ds, 0.8 * ds, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ears (floppy)
      ctx.fillStyle = darkenColor(this.dogColor, 0.15);
      ctx.beginPath();
      ctx.ellipse(3.5 * ds, -2 * ds, 1.2 * ds, 1.8 * ds, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(3.5 * ds, 2 * ds, 1.2 * ds, 1.8 * ds, 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Tail (wagging, at back)
      const wagAngle = Math.sin(this.walkPhase * 2.5) * 0.6;
      ctx.strokeStyle = this.dogColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-4 * ds, 0);
      ctx.quadraticCurveTo(-6 * ds, wagAngle * 5 * ds, -7 * ds, wagAngle * 3 * ds);
      ctx.stroke();

      ctx.restore();
    }
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
