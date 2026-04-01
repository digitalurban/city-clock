import { BLOCK_SIZE, ROAD_WIDTH, SIDEWALK_WIDTH, BUILDING_COLORS, HOUSE_COLORS, GARDEN_COLORS } from '../utils/constants';
import { Pedestrian } from '../entities/Pedestrian';

export interface BuildingDef {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  windowSeed: number;
}

export interface HouseDef {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  roofColor: string;
  seed: number;
  hasGarden: boolean;
  gardenSide: 'top' | 'bottom' | 'left' | 'right';
  gardenColor: string;
  gardenPathEnd?: { x: number; y: number };
}

export interface ParkDef {
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  hasFountain: boolean;
  hasPlayground: boolean;
}

export interface TreeDef {
  x: number;
  y: number;
  radius: number;
  seed: number;
}

export interface StreetLightDef {
  x: number;
  y: number;
}

export interface PlazaLampDef {
  x: number;
  y: number;
}

export interface PlazaBenchDef {
  x: number;
  y: number;
  angle: number; // 0 = horizontal, PI/2 = vertical
}

export interface WalkableRect {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'sidewalk' | 'plaza' | 'crosswalk';
}

export interface RoadSegment {
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: boolean;
  /** True if this road stub was created by clipping against the plaza */
  plazaBordering?: boolean;
}

export interface PlazaEntrance {
  x: number;
  y: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

export interface DeliveryLane {
  laneX: number;    // center x of entry road stub
  outerY: number;   // y on the approach road (navigation target while on road grid)
  entryY: number;   // y at the plaza boundary
  innerY: number;   // y at end of stub inside plaza (on the perimeter path)
  roadWidth: number;
}

export interface IntersectionDef {
  x: number;
  y: number;
  hasNorth: boolean;
  hasSouth: boolean;
  hasEast: boolean;
  hasWest: boolean;
}

export type VenueType = 'cafe' | 'bar' | 'shop' | 'restaurant' | 'bookshop';

export interface VenueDef {
  x: number;
  y: number;
  w: number;
  h: number;
  type: VenueType;
  name: string;
  color: string;
  awningColor: string;
  seed: number;
  facingPlaza: 'top' | 'bottom' | 'left' | 'right';
  seatingPositions: { x: number; y: number }[];
  queuePositions: { x: number; y: number }[];
}

export interface CityEvent {
  type: 'musician' | 'protest';
  x: number;
  y: number;
  radius: number;
  timer: number;
}

// Block type determines what fills a city block
type BlockType = 'commercial' | 'residential' | 'park' | 'utility' | 'construction';

export interface ConstructionSiteDef {
  x: number; y: number; w: number; h: number;
  craneX: number; craneY: number;
  craneAngle: number; // rotates slowly
}

export interface BinDef {
  x: number;
  y: number;
  collected: boolean;
  respawnTimer: number; // counts up; bin reappears when >= BIN_RESPAWN_FRAMES
  houseIndex: number;
}

const BIN_RESPAWN_FRAMES = 18000; // ~5 minutes at 60fps

export class CityLayout {
  width: number;
  height: number;
  gridCols: number;
  gridRows: number;
  cellSize: number = BLOCK_SIZE + ROAD_WIDTH;
  // Pedestrian pathfinding — obstacle-aware grid
  readonly PF_STEP = 9;          // world pixels per pathfinding cell
  pfCols: number = 0;
  pfRows: number = 0;
  pfGrid: Uint8Array = new Uint8Array(0); // 1 = walkable, 0 = blocked
  buildings: BuildingDef[] = [];
  houses: HouseDef[] = [];
  parks: ParkDef[] = [];
  trees: TreeDef[] = [];
  streetLights: StreetLightDef[] = [];
  walkableRects: WalkableRect[] = [];
  roads: RoadSegment[] = [];
  venues: VenueDef[] = [];
  entrances: PlazaEntrance[] = [];
  deliveryLanes: DeliveryLane[] = [];
  deliveryPerimeter: { topY: number; bottomY: number; leftX: number; rightX: number } = { topY: 0, bottomY: 0, leftX: 0, rightX: 0 };
  intersections: IntersectionDef[] = [];
  plazaLamps: PlazaLampDef[] = [];
  plazaBenches: PlazaBenchDef[] = [];
  plazaBounds: { x: number; y: number; w: number; h: number };

  constructionSite: ConstructionSiteDef | null = null;
  activeEvent: CityEvent | null = null;

  // Chimney smoke source positions (top of each chimney)
  chimneyPositions: { x: number; y: number }[] = [];

  // Market stall positions (active on weekends / market days)
  marketStalls: { x: number; y: number; awningColor: string; produceColors: string[] }[] = [];

  // Cached awning shelter positions (standing under venue awnings)
  awningSheltPositions: { x: number; y: number }[] = [];

  // ── Busker pitch ───────────────────────────────────────────────────────
  buskerActive: boolean = false;
  buskerX: number = 0;
  buskerY: number = 0;
  buskerPed: Pedestrian | null = null;  // reused pedestrian instance for the busker figure
  eventPed: Pedestrian | null = null;   // reused pedestrian instance for the event focal person
  buskerTimer: number = 0;
  buskerCooldown: number = 600; // frames until first appearance
  coinParticles: { sx: number; sy: number; tx: number; ty: number; t: number; alpha: number }[] = [];
  buskerNotes: { x: number; y: number; vy: number; alpha: number; char: string }[] = [];

  // ── Fountains ────────────────────────────────────────────────────────────
  // Two small basins positioned as the colon dots between HH and MM digits
  fountains: { x: number; y: number }[] = [];
  fountainActive: boolean = false;
  fountainTimer: number = 900;  // frames until first activation (~15s)
  private fountainParticles: { x: number; y: number; vx: number; vy: number; alpha: number; fy: number }[] = [];

  // ── Bandstand (appears when the alarm fires) ─────────────────────────────
  bandstandActive: boolean = false;
  bandstandX: number = 0;
  bandstandY: number = 0;
  private bandMembers: (Pedestrian & { instrument: string })[] = [];
  private bandNotes: { x: number; y: number; vy: number; alpha: number; char: string }[] = [];

  // ── Newspaper stand ────────────────────────────────────────────────────
  newsstandX: number = 0;
  newsstandY: number = 0;

  // Roadside wheelie bins — put out near houses, collected by garbage truck
  bins: BinDef[] = [];

  // Which grid cells are plaza (col, row)
  plazaCells: Set<string> = new Set();
  // Block types for generating varied city content
  blockTypes: Map<string, BlockType> = new Map();

  constructor(width: number, height: number) {
    // We now use a constant grid size for stability across all devices.
    // The plaza will always be at the geometric center of this fixed city.
    this.gridCols = 12;
    this.gridRows = 7;

    const cellSize = BLOCK_SIZE + ROAD_WIDTH;
    this.width = this.gridCols * cellSize;
    this.height = this.gridRows * cellSize;

    // Centered offsets: since we have a fixed grid, these are effectively the top-left of the coordinate system.
    // We'll keep them as 0 for simplicity, or keep the variable names to minimize changes to existing logic.
    const offsetX = 0;
    const offsetY = 0;

    // Find center block for the plaza (4 wide × 3 tall — rectangular)
    const centerCol = Math.floor(this.gridCols / 2);
    const centerRow = Math.floor(this.gridRows / 2);

    const validPlazaCols: number[] = [];
    const validPlazaRows: number[] = [];
    // 4 cells wide: offset by -2, -1, 0, 1 from center
    for (let dc = -2; dc <= 1; dc++) {
      validPlazaCols.push(centerCol + dc);
    }
    // 3 cells tall: offset by -1, 0, 1 from center
    for (let dr = -1; dr <= 1; dr++) {
      validPlazaRows.push(centerRow + dr);
    }

    for (const c of validPlazaCols) {
      for (const r of validPlazaRows) {
        this.plazaCells.add(`${c},${r}`);
      }
    }

    // Plaza bounds
    const px = offsetX + validPlazaCols[0] * cellSize + ROAD_WIDTH / 2;
    const py = offsetY + validPlazaRows[0] * cellSize + ROAD_WIDTH / 2;
    const pw = validPlazaCols.length * cellSize - ROAD_WIDTH;
    const ph = validPlazaRows.length * cellSize - ROAD_WIDTH;
    this.plazaBounds = { x: px, y: py, w: pw, h: ph };

    // Walkable plaza area
    this.walkableRects.push({ x: px, y: py, w: pw, h: ph, type: 'plaza' });

    // Delivery lane — one short road stub from the top city road into the plaza.
    // Once inside, trucks drive around the perimeter in front of the shops.
    const venueH = 30;
    const edgeInset = 6;
    const awningDepth = 14;
    const perimGap = 4; // gap between awning edge and truck path
    const perimInset = edgeInset + venueH + awningDepth + perimGap; // ~54px from plaza edge

    // Perimeter rectangle (truck driving path in front of shops)
    this.deliveryPerimeter = {
      topY: py + perimInset,
      bottomY: py + ph - perimInset,
      leftX: px + perimInset,
      rightX: px + pw - perimInset,
    };

    // Entry stub aligned with a grid road column
    const topLaneX = (validPlazaCols[0] + 1) * cellSize;
    this.deliveryLanes.push({
      laneX: topLaneX,
      outerY: py - ROAD_WIDTH / 2,          // on the city road above plaza
      entryY: py,                             // plaza top boundary
      innerY: py + perimInset,                // end of stub at perimeter path
      roadWidth: ROAD_WIDTH,
    });

    // Assign block types for non-plaza blocks
    this.assignBlockTypes(offsetX, offsetY, cellSize, validPlazaCols, validPlazaRows);

    // Generate roads, sidewalks, buildings, trees, lights, venues
    this.generateRoads(offsetX, offsetY, cellSize);
    this.generateBlocks(offsetX, offsetY, cellSize);
    this.generateVenues(offsetX, offsetY, cellSize, validPlazaCols, validPlazaRows);
    this.generatePlazaFurniture();
    this.generateStreetLights(offsetX, offsetY, cellSize);
    this.generateChimneyPositions();
    this.generateMarketStalls();
    this.generateAwningSheltPositions();
    this.generateBins();
    this.initPersistentFixtures();
    this.buildPfGrid();
  }

  private assignBlockTypes(offsetX: number, offsetY: number, cellSize: number, plazaCols: number[], plazaRows: number[]) {
    const centerCol = Math.floor(this.gridCols / 2);
    const centerRow = Math.floor(this.gridRows / 2);

    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        if (this.plazaCells.has(`${c},${r}`)) continue;

        const dist = Math.abs(c - centerCol) + Math.abs(r - centerRow);
        const seed = c * 37 + r * 73 + 42;
        const roll = seededRandom(seed);

        let blockType: BlockType;
        if (dist <= 2) {
          // Near plaza: mostly commercial
          blockType = roll < 0.85 ? 'commercial' : 'park';
        } else if (dist <= 4) {
          // Mid distance: mix of residential and commercial
          if (roll < 0.35) blockType = 'commercial';
          else if (roll < 0.82) blockType = 'residential';
          else if (roll < 0.92) blockType = 'park';
          else blockType = 'utility';
        } else {
          // Outer: mostly residential
          if (roll < 0.12) blockType = 'commercial';
          else if (roll < 0.78) blockType = 'residential';
          else if (roll < 0.90) blockType = 'park';
          else blockType = 'utility';
        }
        this.blockTypes.set(`${c},${r}`, blockType);
      }
    }

    // Pick one outer block to be a construction site
    const candidates: string[] = [];
    for (const [key, type] of this.blockTypes) {
      if (type === 'utility' || type === 'commercial') {
        const [c, r] = key.split(',').map(Number);
        const dist = Math.abs(c - centerCol) + Math.abs(r - centerRow);
        if (dist >= 3) candidates.push(key);
      }
    }
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(seededRandom(42) * candidates.length)];
      this.blockTypes.set(pick, 'construction');
    }
  }

  private clipRoadAroundPlaza(road: RoadSegment): RoadSegment[] {
    const pb = this.plazaBounds;
    if (road.horizontal) {
      if (road.y + road.h <= pb.y || road.y >= pb.y + pb.h) return [road];
      const segments: RoadSegment[] = [];
      if (road.x < pb.x) {
        segments.push({ x: road.x, y: road.y, w: pb.x - road.x, h: road.h, horizontal: true, plazaBordering: true });
      }
      const roadRight = road.x + road.w;
      const plazaRight = pb.x + pb.w;
      if (roadRight > plazaRight) {
        segments.push({ x: plazaRight, y: road.y, w: roadRight - plazaRight, h: road.h, horizontal: true, plazaBordering: true });
      }
      return segments;
    } else {
      if (road.x + road.w <= pb.x || road.x >= pb.x + pb.w) return [road];
      const segments: RoadSegment[] = [];
      if (road.y < pb.y) {
        segments.push({ x: road.x, y: road.y, w: road.w, h: pb.y - road.y, horizontal: false, plazaBordering: true });
      }
      const roadBottom = road.y + road.h;
      const plazaBottom = pb.y + pb.h;
      if (roadBottom > plazaBottom) {
        segments.push({ x: road.x, y: plazaBottom, w: road.w, h: roadBottom - plazaBottom, horizontal: false, plazaBordering: true });
      }
      return segments;
    }
  }

  private generateRoads(offsetX: number, offsetY: number, cellSize: number) {
    const rawRoads: RoadSegment[] = [];
    const pb = this.plazaBounds;

    // Horizontal roads
    for (let r = 0; r <= this.gridRows; r++) {
      const ry = offsetY + r * cellSize - ROAD_WIDTH / 2;
      rawRoads.push({ x: offsetX - cellSize, y: ry, w: this.width + cellSize * 2, h: ROAD_WIDTH, horizontal: true });
      this.walkableRects.push({
        x: 0, y: ry - SIDEWALK_WIDTH, w: this.width, h: SIDEWALK_WIDTH, type: 'sidewalk',
      });
      this.walkableRects.push({
        x: 0, y: ry + ROAD_WIDTH, w: this.width, h: SIDEWALK_WIDTH, type: 'sidewalk',
      });
    }

    // Vertical roads
    for (let c = 0; c <= this.gridCols; c++) {
      const rx = offsetX + c * cellSize - ROAD_WIDTH / 2;
      rawRoads.push({ x: rx, y: offsetY - cellSize, w: ROAD_WIDTH, h: this.height + cellSize * 2, horizontal: false });
      this.walkableRects.push({
        x: rx - SIDEWALK_WIDTH, y: 0, w: SIDEWALK_WIDTH, h: this.height, type: 'sidewalk',
      });
      this.walkableRects.push({
        x: rx + ROAD_WIDTH, y: 0, w: SIDEWALK_WIDTH, h: this.height, type: 'sidewalk',
      });
    }

    // Clip roads around plaza and compute entrances
    for (const raw of rawRoads) {
      const clipped = this.clipRoadAroundPlaza(raw);
      this.roads.push(...clipped);
      if (clipped.length !== 1 || clipped[0] !== raw) {
        if (raw.horizontal) {
          const roadCenterY = raw.y + raw.h / 2;
          if (roadCenterY > pb.y && roadCenterY < pb.y + pb.h) {
            this.entrances.push({ x: pb.x, y: roadCenterY, side: 'left' });
            this.entrances.push({ x: pb.x + pb.w, y: roadCenterY, side: 'right' });
          }
        } else {
          const roadCenterX = raw.x + raw.w / 2;
          if (roadCenterX > pb.x && roadCenterX < pb.x + pb.w) {
            this.entrances.push({ x: roadCenterX, y: pb.y, side: 'top' });
            this.entrances.push({ x: roadCenterX, y: pb.y + pb.h, side: 'bottom' });
          }
        }
      }
    }

    // Crosswalks + intersections at grid crossings (only outside plaza)
    for (let r = 0; r <= this.gridRows; r++) {
      for (let c = 0; c <= this.gridCols; c++) {
        const ix = offsetX + c * cellSize;
        const iy = offsetY + r * cellSize;
        if (ix > pb.x && ix < pb.x + pb.w && iy > pb.y && iy < pb.y + pb.h) continue;
        // Skip crosswalk at delivery lane entry to keep the stub clean
        const isDeliveryEntry = this.deliveryLanes.some(lane =>
          Math.abs(ix - lane.laneX) < ROAD_WIDTH && Math.abs(iy - lane.entryY) < ROAD_WIDTH
        );
        if (!isDeliveryEntry) {
          this.walkableRects.push({
            x: ix - ROAD_WIDTH / 2 - 4, y: iy - ROAD_WIDTH / 2 - 4,
            w: ROAD_WIDTH + 8, h: ROAD_WIDTH + 8, type: 'crosswalk',
          });
        }
        const hasRoadAt = (x: number, y: number) =>
          this.roads.some(rd =>
            x >= rd.x - 2 && x <= rd.x + rd.w + 2 &&
            y >= rd.y - 2 && y <= rd.y + rd.h + 2
          );
        const offset = ROAD_WIDTH;
        this.intersections.push({
          x: ix, y: iy,
          hasNorth: hasRoadAt(ix, iy - offset),
          hasSouth: hasRoadAt(ix, iy + offset),
          hasEast: hasRoadAt(ix + offset, iy),
          hasWest: hasRoadAt(ix - offset, iy),
        });
      }
    }
  }

  private generateBlocks(offsetX: number, offsetY: number, cellSize: number) {
    let buildingIdx = 0;

    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        const bx = offsetX + c * cellSize + ROAD_WIDTH / 2;
        const by = offsetY + r * cellSize + ROAD_WIDTH / 2;
        const blockW = BLOCK_SIZE;
        const blockH = BLOCK_SIZE;

        if (this.plazaCells.has(`${c},${r}`)) {
          // Plaza — add some trees around edges
          for (let i = 0; i < 3; i++) {
            const seed = c * 100 + r * 10 + i;
            const tx = bx + 15 + seededRandom(seed) * (blockW - 30);
            const ty = by + 15 + seededRandom(seed + 50) * (blockH - 30);
            const cx = bx + blockW / 2;
            const cy = by + blockH / 2;
            const distFromCenter = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
            if (distFromCenter > blockW * 0.35) {
              this.trees.push({ x: tx, y: ty, radius: 8 + seededRandom(seed + 100) * 5, seed });
            }
          }
          continue;
        }

        const blockType = this.blockTypes.get(`${c},${r}`) || 'commercial';
        const margin = 4;

        switch (blockType) {
          case 'commercial':
            this.generateCommercialBlock(bx, by, blockW, blockH, margin, c, r, buildingIdx);
            buildingIdx += 3; // approximate
            break;
          case 'residential':
            this.generateResidentialBlock(bx, by, blockW, blockH, margin, c, r);
            break;
          case 'park':
            this.generateParkBlock(bx, by, blockW, blockH, c, r);
            break;
          case 'utility':
            this.generateUtilityBlock(bx, by, blockW, blockH, margin, c, r, buildingIdx);
            buildingIdx += 2;
            break;
          case 'construction':
            this.generateConstructionBlock(bx, by, blockW, blockH);
            break;
        }

        // Trees along sidewalks (occasional)
        if (seededRandom(c * 31 + r * 59) > 0.5) {
          this.trees.push({
            x: bx - SIDEWALK_WIDTH / 2 - 2,
            y: by + blockH * seededRandom(c * 19 + r * 43),
            radius: 7 + seededRandom(c * 23 + r * 47) * 4,
            seed: c * 100 + r,
          });
        }
      }
    }
  }

  private generateCommercialBlock(bx: number, by: number, blockW: number, blockH: number, margin: number, c: number, r: number, buildingIdx: number) {
    const numBuildings = 1 + Math.floor(seededRandom(c * 37 + r * 73) * 3);

    if (numBuildings === 1) {
      this.buildings.push({
        x: bx + margin, y: by + margin,
        w: blockW - margin * 2, h: blockH - margin * 2,
        color: BUILDING_COLORS[buildingIdx % BUILDING_COLORS.length],
        windowSeed: buildingIdx * 17,
      });
    } else {
      const splitH = seededRandom(c * 53 + r * 91) > 0.5;
      if (splitH) {
        const split = 0.35 + seededRandom(c * 41 + r * 67) * 0.3;
        const h1 = Math.floor((blockH - margin * 3) * split);
        const h2 = blockH - margin * 3 - h1;
        this.buildings.push({
          x: bx + margin, y: by + margin, w: blockW - margin * 2, h: h1,
          color: BUILDING_COLORS[buildingIdx % BUILDING_COLORS.length], windowSeed: buildingIdx * 17,
        });
        this.buildings.push({
          x: bx + margin, y: by + margin * 2 + h1, w: blockW - margin * 2, h: h2,
          color: BUILDING_COLORS[(buildingIdx + 1) % BUILDING_COLORS.length], windowSeed: (buildingIdx + 1) * 17,
        });
      } else {
        const split = 0.35 + seededRandom(c * 41 + r * 67) * 0.3;
        const w1 = Math.floor((blockW - margin * 3) * split);
        const w2 = blockW - margin * 3 - w1;
        this.buildings.push({
          x: bx + margin, y: by + margin, w: w1, h: blockH - margin * 2,
          color: BUILDING_COLORS[buildingIdx % BUILDING_COLORS.length], windowSeed: buildingIdx * 17,
        });
        this.buildings.push({
          x: bx + margin * 2 + w1, y: by + margin, w: w2, h: blockH - margin * 2,
          color: BUILDING_COLORS[(buildingIdx + 1) % BUILDING_COLORS.length], windowSeed: (buildingIdx + 1) * 17,
        });
      }
    }
  }

  private generateResidentialBlock(bx: number, by: number, blockW: number, blockH: number, margin: number, c: number, r: number) {
    // Generate 2-4 houses with gardens
    const numHouses = 2 + Math.floor(seededRandom(c * 47 + r * 83) * 3);
    const houseW = Math.floor((blockW - margin * (numHouses + 1)) / numHouses);
    const roofColors = ['#8b4513', '#a0522d', '#6b3a2a', '#7a4830', '#5c3a1e', '#9c6b4a'];

    for (let i = 0; i < numHouses; i++) {
      const hx = bx + margin + i * (houseW + margin);
      const seed = c * 100 + r * 10 + i;
      const hasGarden = seededRandom(seed + 200) > 0.3;
      const gardenH = hasGarden ? Math.floor(blockH * 0.35) : 0;
      const gardenSide = seededRandom(seed + 300) > 0.5 ? 'bottom' as const : 'top' as const;

      const hy = gardenSide === 'top' ? by + margin + gardenH : by + margin;
      const hh = blockH - margin * 2 - gardenH;

      // Compute garden path end (sidewalk edge point)
      const frontDoorX = hx + houseW / 2;
      let gardenPathEnd: { x: number; y: number };
      if (hasGarden) {
        if (gardenSide === 'bottom') {
          gardenPathEnd = { x: frontDoorX, y: hy + hh + gardenH + 2 };
        } else {
          gardenPathEnd = { x: frontDoorX, y: hy - gardenH - 2 };
        }
      } else {
        // No garden: offset 15px toward sidewalk (assume bottom)
        gardenPathEnd = { x: frontDoorX, y: hy + hh + 15 };
      }

      this.houses.push({
        x: hx, y: hy, w: houseW, h: hh,
        color: HOUSE_COLORS[Math.floor(seededRandom(seed + 400) * HOUSE_COLORS.length)],
        roofColor: roofColors[Math.floor(seededRandom(seed + 500) * roofColors.length)],
        seed,
        hasGarden,
        gardenSide,
        gardenColor: GARDEN_COLORS[Math.floor(seededRandom(seed + 600) * GARDEN_COLORS.length)],
        gardenPathEnd,
      });

      // Garden trees
      if (hasGarden) {
        const gardenY = gardenSide === 'top' ? by + margin : by + margin + hh;
        if (seededRandom(seed + 700) > 0.4) {
          this.trees.push({
            x: hx + houseW * (0.3 + seededRandom(seed + 800) * 0.4),
            y: gardenY + gardenH * (0.3 + seededRandom(seed + 900) * 0.4),
            radius: 6 + seededRandom(seed + 1000) * 4,
            seed: seed + 1100,
          });
        }
      }
    }
  }

  private generateParkBlock(bx: number, by: number, blockW: number, blockH: number, c: number, r: number) {
    const seed = c * 67 + r * 89;
    const park: ParkDef = {
      x: bx + 4, y: by + 4, w: blockW - 8, h: blockH - 8,
      seed,
      hasFountain: seededRandom(seed + 100) > 0.5,
      hasPlayground: seededRandom(seed + 200) > 0.6,
    };
    this.parks.push(park);

    // Park trees — scattered around
    const treeCount = 4 + Math.floor(seededRandom(seed + 300) * 5);
    for (let i = 0; i < treeCount; i++) {
      const tx = bx + 15 + seededRandom(seed + i * 10) * (blockW - 30);
      const ty = by + 15 + seededRandom(seed + i * 10 + 5) * (blockH - 30);
      // Avoid center if fountain
      if (park.hasFountain) {
        const cx = bx + blockW / 2;
        const cy = by + blockH / 2;
        if (Math.hypot(tx - cx, ty - cy) < 25) continue;
      }
      this.trees.push({
        x: tx, y: ty,
        radius: 7 + seededRandom(seed + i * 10 + 50) * 6,
        seed: seed + i * 100,
      });
    }

    // Park benches
    this.plazaBenches.push({ x: bx + blockW * 0.3, y: by + blockH * 0.7, angle: 0 });
    this.plazaBenches.push({ x: bx + blockW * 0.7, y: by + blockH * 0.3, angle: Math.PI / 2 });

    // Add walkable area for the park
    this.walkableRects.push({ x: bx + 4, y: by + 4, w: blockW - 8, h: blockH - 8, type: 'sidewalk' });
  }

  private generateUtilityBlock(bx: number, by: number, blockW: number, blockH: number, margin: number, c: number, r: number, buildingIdx: number) {
    // One large utilitarian building (power station, water, etc.)
    this.buildings.push({
      x: bx + margin, y: by + margin,
      w: blockW - margin * 2, h: blockH - margin * 2,
      color: '#707880',
      windowSeed: buildingIdx * 17 + 500,
    });
  }

  private generateConstructionBlock(bx: number, by: number, blockW: number, blockH: number) {
    // Construction site with fencing, dirt, and crane
    this.constructionSite = {
      x: bx, y: by, w: blockW, h: blockH,
      craneX: bx + blockW * 0.3, craneY: by + blockH * 0.3,
      craneAngle: 0,
    };
    // Add as a building so pedestrians avoid it
    this.buildings.push({
      x: bx + 4, y: by + 4,
      w: blockW - 8, h: blockH - 8,
      color: '#8a7d5a', // dirt/sand color
      windowSeed: -1, // no windows
    });
  }

  drawConstructionSite(ctx: CanvasRenderingContext2D, nightAlpha: number, time: number) {
    if (!this.constructionSite) return;
    const cs = this.constructionSite;
    const dark = 1 - nightAlpha * 0.3;

    // Dirt ground
    ctx.fillStyle = `rgb(${Math.floor(160 * dark)}, ${Math.floor(140 * dark)}, ${Math.floor(90 * dark)})`;
    ctx.fillRect(cs.x + 4, cs.y + 4, cs.w - 8, cs.h - 8);

    // Dirt texture (random dots)
    ctx.fillStyle = `rgba(120, 100, 60, ${0.3 * dark})`;
    for (let i = 0; i < 20; i++) {
      const dx = cs.x + 10 + seededRandom(i * 7 + 13) * (cs.w - 20);
      const dy = cs.y + 10 + seededRandom(i * 11 + 17) * (cs.h - 20);
      ctx.fillRect(dx, dy, 3 + seededRandom(i * 3) * 4, 2 + seededRandom(i * 5) * 3);
    }

    // Partial building structure (concrete frame)
    const fx = cs.x + cs.w * 0.45;
    const fy = cs.y + cs.h * 0.35;
    const fw = cs.w * 0.45;
    const fh = cs.h * 0.55;
    ctx.fillStyle = `rgb(${Math.floor(180 * dark)}, ${Math.floor(180 * dark)}, ${Math.floor(175 * dark)})`;
    ctx.fillRect(fx, fy, fw, fh);
    // Floor lines
    ctx.strokeStyle = `rgba(100, 100, 100, ${0.4 * dark})`;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const ly = fy + (fh / 4) * i;
      ctx.beginPath();
      ctx.moveTo(fx, ly);
      ctx.lineTo(fx + fw, ly);
      ctx.stroke();
    }

    // Construction barriers (orange/white stripes) around perimeter
    const stripeW = 8;
    ctx.lineWidth = 3;
    for (let i = 0; i < Math.floor(cs.w / stripeW); i++) {
      ctx.strokeStyle = i % 2 === 0
        ? `rgba(255, 140, 0, ${0.8 * dark})`
        : `rgba(255, 255, 255, ${0.6 * dark})`;
      const sx = cs.x + 4 + i * stripeW;
      // Top barrier
      ctx.beginPath(); ctx.moveTo(sx, cs.y + 4); ctx.lineTo(sx + stripeW, cs.y + 4); ctx.stroke();
      // Bottom barrier
      ctx.beginPath(); ctx.moveTo(sx, cs.y + cs.h - 4); ctx.lineTo(sx + stripeW, cs.y + cs.h - 4); ctx.stroke();
    }
    for (let i = 0; i < Math.floor(cs.h / stripeW); i++) {
      ctx.strokeStyle = i % 2 === 0
        ? `rgba(255, 140, 0, ${0.8 * dark})`
        : `rgba(255, 255, 255, ${0.6 * dark})`;
      const sy = cs.y + 4 + i * stripeW;
      // Left barrier
      ctx.beginPath(); ctx.moveTo(cs.x + 4, sy); ctx.lineTo(cs.x + 4, sy + stripeW); ctx.stroke();
      // Right barrier
      ctx.beginPath(); ctx.moveTo(cs.x + cs.w - 4, sy); ctx.lineTo(cs.x + cs.w - 4, sy + stripeW); ctx.stroke();
    }

    // Crane
    cs.craneAngle += 0.002; // slowly rotates
    const crX = cs.craneX;
    const crY = cs.craneY;
    const boomLen = cs.w * 0.5;
    const boomAngle = cs.craneAngle + time * 0.0001;
    // Crane base
    ctx.fillStyle = `rgb(${Math.floor(220 * dark)}, ${Math.floor(180 * dark)}, ${Math.floor(40 * dark)})`;
    ctx.fillRect(crX - 4, crY - 4, 8, 8);
    // Crane boom
    ctx.strokeStyle = `rgb(${Math.floor(220 * dark)}, ${Math.floor(180 * dark)}, ${Math.floor(40 * dark)})`;
    ctx.lineWidth = 2;
    const boomEndX = crX + Math.cos(boomAngle) * boomLen;
    const boomEndY = crY + Math.sin(boomAngle) * boomLen;
    ctx.beginPath();
    ctx.moveTo(crX, crY);
    ctx.lineTo(boomEndX, boomEndY);
    ctx.stroke();
    // Cable from boom end
    ctx.strokeStyle = `rgba(80, 80, 80, ${0.6 * dark})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(boomEndX, boomEndY);
    ctx.lineTo(boomEndX, boomEndY + 15);
    ctx.stroke();
    // Load block
    ctx.fillStyle = `rgb(${Math.floor(160 * dark)}, ${Math.floor(160 * dark)}, ${Math.floor(160 * dark)})`;
    ctx.fillRect(boomEndX - 3, boomEndY + 15, 6, 5);

    // Material piles
    ctx.fillStyle = `rgb(${Math.floor(140 * dark)}, ${Math.floor(80 * dark)}, ${Math.floor(40 * dark)})`;
    ctx.fillRect(cs.x + 10, cs.y + cs.h - 25, 18, 12); // lumber pile
    ctx.fillStyle = `rgb(${Math.floor(100 * dark)}, ${Math.floor(100 * dark)}, ${Math.floor(105 * dark)})`;
    ctx.fillRect(cs.x + 35, cs.y + cs.h - 22, 15, 10); // concrete blocks
  }

  private generateStreetLights(offsetX: number, offsetY: number, cellSize: number) {
    for (let r = 0; r <= this.gridRows; r++) {
      for (let c = 0; c <= this.gridCols; c++) {
        const ix = offsetX + c * cellSize;
        const iy = offsetY + r * cellSize;
        const offset = ROAD_WIDTH / 2 + 5;
        this.streetLights.push({ x: ix - offset, y: iy - offset });
        this.streetLights.push({ x: ix + offset, y: iy + offset });
      }
    }
  }

  private generatePlazaFurniture() {
    const pb = this.plazaBounds;
    const cx = pb.x + pb.w / 2;
    const cy = pb.y + pb.h / 2;
    const innerMargin = 80;

    const lampAreaW = pb.w - innerMargin * 2;
    const lampAreaH = pb.h - innerMargin * 2;
    const lampCols = Math.max(2, Math.floor(lampAreaW / 120));
    const lampRows = Math.max(2, Math.floor(lampAreaH / 100));
    for (let r = 0; r < lampRows; r++) {
      for (let c = 0; c < lampCols; c++) {
        const lx = pb.x + innerMargin + (c + 0.5) * (lampAreaW / lampCols);
        const ly = pb.y + innerMargin + (r + 0.5) * (lampAreaH / lampRows);
        const dx = lx - cx;
        const dy = ly - cy;
        if (Math.abs(dx) < 40 && Math.abs(dy) < 30) continue;
        this.plazaLamps.push({ x: lx, y: ly });
      }
    }

    for (const lamp of this.plazaLamps) {
      const dx = lamp.x - cx;
      const dy = lamp.y - cy;
      const angle = Math.abs(dx) > Math.abs(dy) ? 0 : Math.PI / 2;
      const offsetDist = 18;
      const bx = lamp.x + (dy > 0 ? -offsetDist : offsetDist) * (angle === 0 ? 0 : 1);
      const by = lamp.y + (dx > 0 ? offsetDist : -offsetDist) * (angle === 0 ? 1 : 0);
      this.plazaBenches.push({ x: bx, y: by, angle });
    }
  }

  private generateVenues(offsetX: number, offsetY: number, cellSize: number, plazaCols: number[], plazaRows: number[]) {
    const pb = this.plazaBounds;
    const venueTypes: { type: VenueType; name: string; color: string; awning: string }[] = [
      { type: 'cafe', name: 'Cafe Sol', color: '#8B4513', awning: '#e8a84c' },
      { type: 'bar', name: 'The Local', color: '#4a2040', awning: '#c44569' },
      { type: 'shop', name: 'Market', color: '#2d6a4f', awning: '#52b788' },
      { type: 'restaurant', name: 'Bistro', color: '#7b2d26', awning: '#d4a373' },
      { type: 'bookshop', name: 'Books & Co', color: '#3a5a40', awning: '#a3b18a' },
      { type: 'cafe', name: 'Bean There', color: '#6b4226', awning: '#dda15e' },
      { type: 'bar', name: 'Night Owl', color: '#2b2d42', awning: '#8d99ae' },
      { type: 'shop', name: 'Flowers', color: '#606c38', awning: '#bc6c25' },
    ];

    let vi = 0;
    const venueW = 55;
    const venueH = 30;
    const edgeInset = 6;
    const seatingGap = 8;

    const topLane = this.deliveryLanes[0];
    const laneGap = ROAD_WIDTH + 10;

    // Top edge
    for (let x = pb.x + 25; x < pb.x + pb.w - venueW; x += venueW + 25) {
      if (x < topLane.laneX + laneGap / 2 && x + venueW > topLane.laneX - laneGap / 2) continue;
      const v = venueTypes[vi % venueTypes.length];
      const bx = x;
      const by = pb.y + edgeInset;
      const seats: { x: number; y: number }[] = [];
      for (let si = 0; si < 3; si++) {
        seats.push({ x: bx + 10 + si * 16, y: by + venueH + seatingGap + 14 });
      }
      const queue = buildQueuePositions(v.type, bx, by, venueW, venueH, 'bottom');
      this.venues.push({
        x: bx, y: by, w: venueW, h: venueH,
        type: v.type, name: v.name, color: v.color, awningColor: v.awning,
        seed: vi * 31 + 7, facingPlaza: 'bottom', seatingPositions: seats,
        queuePositions: queue,
      });
      vi++;
    }

    // Bottom edge
    for (let x = pb.x + 45; x < pb.x + pb.w - venueW; x += venueW + 30) {
      const v = venueTypes[vi % venueTypes.length];
      const bx = x;
      const by = pb.y + pb.h - edgeInset - venueH;
      const seats: { x: number; y: number }[] = [];
      for (let si = 0; si < 3; si++) {
        seats.push({ x: bx + 10 + si * 16, y: by - seatingGap - 14 });
      }
      const queue = buildQueuePositions(v.type, bx, by, venueW, venueH, 'top');
      this.venues.push({
        x: bx, y: by, w: venueW, h: venueH,
        type: v.type, name: v.name, color: v.color, awningColor: v.awning,
        seed: vi * 31 + 7, facingPlaza: 'top', seatingPositions: seats,
        queuePositions: queue,
      });
      vi++;
    }

    // Left edge
    for (let y = pb.y + 35; y < pb.y + pb.h - venueW; y += venueW + 20) {
      const v = venueTypes[vi % venueTypes.length];
      const bx = pb.x + edgeInset;
      const by = y;
      const seats: { x: number; y: number }[] = [];
      for (let si = 0; si < 2; si++) {
        seats.push({ x: bx + venueH + seatingGap + 14, y: by + 10 + si * 20 });
      }
      const queue = buildQueuePositions(v.type, bx, by, venueH, venueW, 'right');
      this.venues.push({
        x: bx, y: by, w: venueH, h: venueW,
        type: v.type, name: v.name, color: v.color, awningColor: v.awning,
        seed: vi * 31 + 7, facingPlaza: 'right', seatingPositions: seats,
        queuePositions: queue,
      });
      vi++;
    }

    // Right edge
    for (let y = pb.y + 55; y < pb.y + pb.h - venueW; y += venueW + 20) {
      const v = venueTypes[vi % venueTypes.length];
      const bx = pb.x + pb.w - edgeInset - venueH;
      const by = y;
      const seats: { x: number; y: number }[] = [];
      for (let si = 0; si < 2; si++) {
        seats.push({ x: bx - seatingGap - 14, y: by + 10 + si * 20 });
      }
      const queue = buildQueuePositions(v.type, bx, by, venueH, venueW, 'left');
      this.venues.push({
        x: bx, y: by, w: venueH, h: venueW,
        type: v.type, name: v.name, color: v.color, awningColor: v.awning,
        seed: vi * 31 + 7, facingPlaza: 'left', seatingPositions: seats,
        queuePositions: queue,
      });
      vi++;
    }
  }

  drawVenues(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    for (const v of this.venues) {
      // Shadow for depth
      ctx.fillStyle = `rgba(0, 0, 0, ${0.18 + nightAlpha * 0.06})`;
      ctx.fillRect(v.x + 3, v.y + 3, v.w, v.h);

      // Building body
      const darkFactor = 1 - nightAlpha * 0.4;
      const r = parseInt(v.color.slice(1, 3), 16);
      const g = parseInt(v.color.slice(3, 5), 16);
      const b = parseInt(v.color.slice(5, 7), 16);
      ctx.fillStyle = `rgb(${Math.floor(r * darkFactor)}, ${Math.floor(g * darkFactor)}, ${Math.floor(b * darkFactor)})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.strokeStyle = `rgba(0,0,0,0.2)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(v.x, v.y, v.w, v.h);

      // Awning
      const aw = 14;
      const ar = parseInt(v.awningColor.slice(1, 3), 16);
      const ag = parseInt(v.awningColor.slice(3, 5), 16);
      const ab = parseInt(v.awningColor.slice(5, 7), 16);
      const awningDark = 1 - nightAlpha * 0.3;
      const awCol = `rgb(${Math.floor(ar * awningDark)}, ${Math.floor(ag * awningDark)}, ${Math.floor(ab * awningDark)})`;
      const awCol2 = `rgb(${Math.floor(ar * awningDark * 0.85)}, ${Math.floor(ag * awningDark * 0.85)}, ${Math.floor(ab * awningDark * 0.85)})`;

      if (v.facingPlaza === 'bottom') {
        for (let sx = v.x; sx < v.x + v.w; sx += 8) {
          ctx.fillStyle = (Math.floor((sx - v.x) / 8) % 2 === 0) ? awCol : awCol2;
          ctx.fillRect(sx, v.y + v.h, Math.min(8, v.x + v.w - sx), aw);
        }
        ctx.fillStyle = `rgba(0,0,0,0.08)`;
        ctx.fillRect(v.x, v.y + v.h + aw, v.w, 2);
      } else if (v.facingPlaza === 'top') {
        for (let sx = v.x; sx < v.x + v.w; sx += 8) {
          ctx.fillStyle = (Math.floor((sx - v.x) / 8) % 2 === 0) ? awCol : awCol2;
          ctx.fillRect(sx, v.y - aw, Math.min(8, v.x + v.w - sx), aw);
        }
        ctx.fillStyle = `rgba(0,0,0,0.08)`;
        ctx.fillRect(v.x, v.y - aw - 2, v.w, 2);
      } else if (v.facingPlaza === 'right') {
        for (let sy = v.y; sy < v.y + v.h; sy += 8) {
          ctx.fillStyle = (Math.floor((sy - v.y) / 8) % 2 === 0) ? awCol : awCol2;
          ctx.fillRect(v.x + v.w, sy, aw, Math.min(8, v.y + v.h - sy));
        }
      } else {
        for (let sy = v.y; sy < v.y + v.h; sy += 8) {
          ctx.fillStyle = (Math.floor((sy - v.y) / 8) % 2 === 0) ? awCol : awCol2;
          ctx.fillRect(v.x - aw, sy, aw, Math.min(8, v.y + v.h - sy));
        }
      }

      // Door light at night
      if (nightAlpha > 0.1) {
        let doorX = v.x + v.w / 2;
        let doorY = v.y + v.h / 2;
        if (v.facingPlaza === 'bottom') doorY = v.y + v.h;
        else if (v.facingPlaza === 'top') doorY = v.y;
        else if (v.facingPlaza === 'right') doorX = v.x + v.w;
        else doorX = v.x;

        const grad = ctx.createRadialGradient(doorX, doorY, 0, doorX, doorY, 25);
        grad.addColorStop(0, `rgba(255, 200, 100, ${nightAlpha * 0.4})`);
        grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(doorX - 25, doorY - 25, 50, 50);
      }

      // Outdoor seating
      for (const seat of v.seatingPositions) {
        const hasParasol = seededRandom(seat.x * 7 + seat.y * 13) > 0.4;
        if (hasParasol) {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.08 - nightAlpha * 0.03})`;
          ctx.beginPath();
          ctx.ellipse(seat.x + 1.5, seat.y + 1.5, 8, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const chairAlpha = 0.7 - nightAlpha * 0.3;
        ctx.fillStyle = `rgba(60, 60, 60, ${chairAlpha})`;
        for (const cx of [-7, 7]) {
          ctx.beginPath();
          const chairX = seat.x + cx - 2;
          const chairY = seat.y - 2;
          ctx.moveTo(chairX + 1, chairY);
          ctx.arcTo(chairX + 4, chairY, chairX + 4, chairY + 4, 1);
          ctx.arcTo(chairX + 4, chairY + 4, chairX, chairY + 4, 1);
          ctx.arcTo(chairX, chairY + 4, chairX, chairY, 1);
          ctx.arcTo(chairX, chairY, chairX + 4, chairY, 1);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(140, 100, 65, ${0.85 - nightAlpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(seat.x, seat.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(100, 70, 40, ${0.4 - nightAlpha * 0.15})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        if (hasParasol) {
          const umColor = seededRandom(seat.x * 3 + seat.y * 11) > 0.5 ? '#c44569' : '#e8a84c';
          const ur = parseInt(umColor.slice(1, 3), 16);
          const ug = parseInt(umColor.slice(3, 5), 16);
          const ub = parseInt(umColor.slice(5, 7), 16);
          const pDark = 1 - nightAlpha * 0.3;
          ctx.fillStyle = `rgba(${Math.floor(ur * pDark)}, ${Math.floor(ug * pDark)}, ${Math.floor(ub * pDark)}, 0.7)`;
          ctx.beginPath();
          ctx.arc(seat.x, seat.y, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(80, 80, 80, 0.5)`;
          ctx.beginPath();
          ctx.arc(seat.x, seat.y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /**
   * Draw venue name labels in the dynamic layer so they're re-rasterised at
   * the current zoom level each frame — always crisp, never upscaled.
   */
  drawVenueLabels(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Scale font down slightly relative to world units so it fits inside the building body
    ctx.font = 'bold 7.5px sans-serif';
    ctx.fillStyle = `rgba(255,255,255,${0.82 - nightAlpha * 0.3})`;

    for (const v of this.venues) {
      const labelX = v.x + v.w / 2;
      const labelY = v.y + v.h / 2;
      if (v.facingPlaza === 'left' || v.facingPlaza === 'right') {
        ctx.save();
        ctx.translate(labelX, labelY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(v.name, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(v.name, labelX, labelY);
      }
    }
    ctx.restore();
  }

  drawDeliveryLanes(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const roadLight = Math.max(0, 45 - nightAlpha * 25);
    const hw = ROAD_WIDTH / 2;
    ctx.fillStyle = `hsl(220, 5%, ${roadLight}%)`;

    for (const lane of this.deliveryLanes) {
      // Short road stub from city road into the plaza — extend 2× road width above entry
      // to fully cover the crosswalk area at the grid intersection
      const stubTop = lane.entryY - ROAD_WIDTH * 2;
      const stubBot = lane.innerY + hw;
      // Draw slightly wider than road to cover crosswalk stripes (which are ROAD_WIDTH + 8)
      const stubW = ROAD_WIDTH + 10;
      ctx.fillRect(lane.laneX - stubW / 2, stubTop, stubW, stubBot - stubTop);
    }

    // Dashed center line on stub
    ctx.strokeStyle = `rgba(255, 255, 200, ${0.3 - nightAlpha * 0.1})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    for (const lane of this.deliveryLanes) {
      const stubTop = lane.entryY - ROAD_WIDTH;
      const stubBot = lane.innerY + hw;
      ctx.beginPath();
      ctx.moveTo(lane.laneX, stubTop);
      ctx.lineTo(lane.laneX, stubBot);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawRoads(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const roadLight = Math.max(0, 44 - nightAlpha * 25);
    ctx.fillStyle = `hsl(220, 6%, ${roadLight}%)`;
    for (const road of this.roads) {
      ctx.fillRect(road.x, road.y, road.w, road.h);
    }

    // Curb edge lines — thin bright strip at each road boundary, suggests raised kerb
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.20 - nightAlpha * 0.08})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const road of this.roads) {
      ctx.strokeRect(road.x + 0.5, road.y + 0.5, road.w - 1, road.h - 1);
    }

    // Dashed centre lines
    ctx.strokeStyle = `rgba(255, 255, 200, ${0.28 - nightAlpha * 0.10})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 12]);
    for (const road of this.roads) {
      ctx.beginPath();
      if (road.horizontal) {
        ctx.moveTo(road.x, road.y + road.h / 2);
        ctx.lineTo(road.x + road.w, road.y + road.h / 2);
      } else {
        ctx.moveTo(road.x + road.w / 2, road.y);
        ctx.lineTo(road.x + road.w / 2, road.y + road.h);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawSidewalks(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const swLight = Math.max(0, 65 - nightAlpha * 30);
    ctx.fillStyle = `hsl(30, 8%, ${swLight}%)`;
    for (const wr of this.walkableRects) {
      if (wr.type === 'sidewalk') {
        ctx.fillRect(wr.x, wr.y, wr.w, wr.h);
      }
    }
  }

  drawCrosswalks(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.5 - nightAlpha * 0.2})`;
    for (const wr of this.walkableRects) {
      if (wr.type === 'crosswalk') {
        const stripeW = 4;
        const gap = 4;
        for (let sx = wr.x + 2; sx < wr.x + wr.w - 2; sx += stripeW + gap) {
          ctx.fillRect(sx, wr.y + 2, stripeW, wr.h - 4);
        }
      }
    }
  }

  drawPlaza(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const p = this.plazaBounds;
    const light = Math.max(0, 76 - nightAlpha * 35);
    ctx.fillStyle = `hsl(36, 14%, ${light}%)`;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    // Subtle 2-tone checkerboard paving (40px tiles)
    const tileSize = 40;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.028 - nightAlpha * 0.01})`;
    for (let tx = p.x; tx < p.x + p.w; tx += tileSize) {
      for (let ty = p.y; ty < p.y + p.h; ty += tileSize) {
        const col = Math.floor((tx - p.x) / tileSize);
        const row = Math.floor((ty - p.y) / tileSize);
        if ((col + row) % 2 === 0) {
          ctx.fillRect(tx, ty, Math.min(tileSize, p.x + p.w - tx), Math.min(tileSize, p.y + p.h - ty));
        }
      }
    }

    // Grout / tile grid lines
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.08 - nightAlpha * 0.03})`;
    ctx.lineWidth = 0.6;
    ctx.setLineDash([]);
    for (let tx = p.x; tx <= p.x + p.w; tx += tileSize) {
      ctx.beginPath(); ctx.moveTo(tx, p.y); ctx.lineTo(tx, p.y + p.h); ctx.stroke();
    }
    for (let ty = p.y; ty <= p.y + p.h; ty += tileSize) {
      ctx.beginPath(); ctx.moveTo(p.x, ty); ctx.lineTo(p.x + p.w, ty); ctx.stroke();
    }

    // Decorative inset border (inner perimeter band)
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.11 - nightAlpha * 0.04})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 10, p.y + 10, p.w - 20, p.h - 20);
    // Second inner line, 4px inside
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.06 - nightAlpha * 0.02})`;
    ctx.strokeRect(p.x + 15, p.y + 15, p.w - 30, p.h - 30);

    // Central ornamental compass rose
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const r1 = Math.min(p.w, p.h) * 0.13;  // outer ring
    const r2 = r1 * 0.55;                    // inner ring
    const lineA = `rgba(0, 0, 0, ${0.07 - nightAlpha * 0.025})`;
    ctx.strokeStyle = lineA;
    ctx.lineWidth = 1.2;
    // Outer circle
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI * 2); ctx.stroke();
    // Inner circle
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2); ctx.stroke();
    // 8 radial spokes between the rings
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    // 4 cardinal cross lines through centre
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.05 - nightAlpha * 0.02})`;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }
  }

  /** Dynamic pass — call each frame with the set of currently-occupied house indices.
   *  Lit windows glow warmly; empty houses show dark window frames at night.
   */
  drawHouseWindows(ctx: CanvasRenderingContext2D, nightAlpha: number, occupiedIndices: Set<number>) {
    if (nightAlpha < 0.05) return;
    const winSize = 3;
    const winAlpha = Math.min(1, nightAlpha * 1.6);

    this.houses.forEach((h, i) => {
      const occupied = occupiedIndices.has(i);
      const positions = [
        { x: h.x + h.w * 0.30, y: h.y + h.h * 0.35 },
        { x: h.x + h.w * 0.65, y: h.y + h.h * 0.65 },
      ];

      for (const wp of positions) {
        if (occupied) {
          // Warm lit skylight
          ctx.fillStyle = `rgba(255, 218, 95, ${winAlpha * 0.88})`;
          ctx.fillRect(wp.x - winSize / 2, wp.y - winSize / 2, winSize, winSize);
          // Soft glow halo
          const gr = ctx.createRadialGradient(wp.x, wp.y, 0, wp.x, wp.y, 7);
          gr.addColorStop(0, `rgba(255, 205, 75, ${nightAlpha * 0.22})`);
          gr.addColorStop(1, 'rgba(255, 205, 75, 0)');
          ctx.fillStyle = gr;
          ctx.fillRect(wp.x - 7, wp.y - 7, 14, 14);
        } else {
          // Unlit — dark window frame, just enough to show the house is empty
          ctx.fillStyle = `rgba(15, 15, 25, ${nightAlpha * 0.28})`;
          ctx.fillRect(wp.x - winSize / 2, wp.y - winSize / 2, winSize, winSize);
        }
      }
    });
  }

  drawShadows(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const shadow = this.getShadowOffset();
    if (shadow.alpha < 0.01) return;
    const alpha = shadow.alpha * (1 - nightAlpha * 0.8) * 0.45;
    if (alpha < 0.01) return;
    ctx.save();
    ctx.fillStyle = `rgba(30, 25, 20, ${alpha})`;
    // Building shadows
    for (const b of this.buildings) {
      ctx.beginPath();
      ctx.rect(b.x + shadow.dx, b.y + shadow.dy, b.w, b.h);
      ctx.fill();
    }
    // House shadows
    for (const h of this.houses) {
      ctx.beginPath();
      ctx.rect(h.x + shadow.dx, h.y + shadow.dy, h.w, h.h);
      ctx.fill();
    }
    // Venue shadows
    for (const v of this.venues) {
      ctx.beginPath();
      ctx.rect(v.x + shadow.dx, v.y + shadow.dy, v.w, v.h);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBuildings(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const shadow = this.getShadowOffset();
    for (const b of this.buildings) {
      // Directional ground shadow — direction & length shift with sun position
      ctx.fillStyle = `rgba(0, 0, 0, ${shadow.alpha + nightAlpha * 0.06})`;
      ctx.fillRect(b.x + shadow.dx, b.y + shadow.dy, b.w, b.h);

      // Building body
      const r = parseInt(b.color.slice(1, 3), 16);
      const g = parseInt(b.color.slice(3, 5), 16);
      const bl = parseInt(b.color.slice(5, 7), 16);
      const darkFactor = 1 - nightAlpha * 0.82;
      ctx.fillStyle = `rgb(${Math.floor(r * darkFactor)}, ${Math.floor(g * darkFactor)}, ${Math.floor(bl * darkFactor)})`;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // ── Depth shading ────────────────────────────────────────────────
      // Top-edge highlight — roof parapet catching ambient light
      const hf = Math.min(1, darkFactor * 1.22);
      ctx.fillStyle = `rgb(${Math.min(255, Math.floor(r * hf))}, ${Math.min(255, Math.floor(g * hf))}, ${Math.min(255, Math.floor(bl * hf))})`;
      ctx.fillRect(b.x, b.y, b.w, 2);

      // Bottom near-face shadow — visible south wall in top-down view
      const sf = darkFactor * 0.68;
      ctx.fillStyle = `rgb(${Math.floor(r * sf)}, ${Math.floor(g * sf)}, ${Math.floor(bl * sf)})`;
      ctx.fillRect(b.x, b.y + b.h - 4, b.w, 4);

      // Right-edge shadow — east face catches less light
      ctx.fillStyle = `rgba(0, 0, 0, ${0.10 * darkFactor})`;
      ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h);
      // ────────────────────────────────────────────────────────────────

      // Building border
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.18 + nightAlpha * 0.1})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Windows at night
      if (nightAlpha > 0.1) {
        const hour = new Date().getHours() + new Date().getMinutes() / 60;
        let litChance = 0.30; // default
        if (hour >= 23 || hour < 5) litChance = 0.18;       // very late night — few lights on
        else if (hour >= 20 || hour < 6) litChance = 0.38;  // night — moderate
        else if (hour >= 18) litChance = 0.55;               // early evening — peak

        const winSize = 5;
        const winGap = 8;
        const winAlpha = Math.min(1, nightAlpha * 1.6);
        for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += winGap) {
          for (let wy = b.y + 6; wy < b.y + b.h - 6; wy += winGap) {
            const isLit = seededRandom(b.windowSeed + wx * 7 + wy * 13) < litChance;
            if (isLit) {
              const warmth = seededRandom(b.windowSeed + wx * 3 + wy * 11);
              if (warmth > 0.4) {
                // Warm incandescent / warm-white LED
                ctx.fillStyle = `rgba(255, 215, 110, ${winAlpha})`;
              } else if (warmth > 0.15) {
                // Cool daylight / monitor glow
                ctx.fillStyle = `rgba(180, 220, 255, ${winAlpha * 0.85})`;
              } else {
                // Blue-ish TV flicker
                ctx.fillStyle = `rgba(140, 180, 255, ${winAlpha * 0.7})`;
              }
              ctx.fillRect(wx, wy, winSize, winSize);
            }
          }
        }
      }
    }
  }

  drawHouses(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    for (const h of this.houses) {
      const darkFactor = 1 - nightAlpha * 0.45;

      // Garden
      if (h.hasGarden) {
        const gr = parseInt(h.gardenColor.slice(1, 3), 16);
        const gg = parseInt(h.gardenColor.slice(3, 5), 16);
        const gb = parseInt(h.gardenColor.slice(5, 7), 16);
        const gdf = 1 - nightAlpha * 0.5;
        ctx.fillStyle = `rgb(${Math.floor(gr * gdf)}, ${Math.floor(gg * gdf)}, ${Math.floor(gb * gdf)})`;
        const gardenH = h.gardenSide === 'top' || h.gardenSide === 'bottom'
          ? Math.floor(h.h * 0.5) : Math.floor(h.w * 0.5);
        const gardenY = h.gardenSide === 'top' ? h.y - gardenH : h.y + h.h;
        ctx.fillRect(h.x, gardenY, h.w, gardenH);
        // Fence
        ctx.strokeStyle = `rgba(139, 119, 90, ${0.5 - nightAlpha * 0.2})`;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(h.x, gardenY, h.w, gardenH);
        // Fence posts
        for (let fp = h.x; fp <= h.x + h.w; fp += 8) {
          ctx.fillStyle = `rgba(139, 119, 90, ${0.35 - nightAlpha * 0.15})`;
          ctx.fillRect(fp - 0.5, gardenY, 1, 1.5);
          ctx.fillRect(fp - 0.5, gardenY + gardenH - 1.5, 1, 1.5);
        }
        // Flower dots and small garden bushes
        for (let i = 0; i < 4; i++) {
          const fx = h.x + 4 + seededRandom(h.seed + i * 20) * (h.w - 8);
          const fy = gardenY + 4 + seededRandom(h.seed + i * 20 + 5) * (gardenH - 8);
          const flowerColors = ['#ff6b9d', '#ffd93d', '#6bcb77', '#4d96ff', '#ff9ff3'];
          ctx.fillStyle = flowerColors[i % flowerColors.length];
          ctx.beginPath();
          ctx.arc(fx, fy, 1.2 + seededRandom(h.seed + i * 30) * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        // Small garden bush
        if (seededRandom(h.seed + 750) > 0.4) {
          const bx = h.x + h.w * (0.2 + seededRandom(h.seed + 760) * 0.6);
          const by = gardenY + gardenH * 0.5;
          const bushGreen = Math.max(0, 100 - nightAlpha * 50);
          ctx.fillStyle = `hsl(${bushGreen + 20}, 45%, ${30 - nightAlpha * 12}%)`;
          ctx.beginPath();
          ctx.arc(bx, by, 3 + seededRandom(h.seed + 770) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // House shadow — directional, matches building shadows
      const shadow = this.getShadowOffset();
      ctx.fillStyle = `rgba(0, 0, 0, ${shadow.alpha + nightAlpha * 0.06})`;
      ctx.fillRect(h.x + shadow.dx, h.y + shadow.dy, h.w, h.h);

      // Determine roof style from seed: 0 = gabled (ridge runs left-right),
      // 1 = hip roof, 2 = gabled rotated (ridge runs top-bottom)
      const roofStyle = Math.floor(seededRandom(h.seed + 1500) * 3);

      const rr = parseInt(h.roofColor.slice(1, 3), 16);
      const rg = parseInt(h.roofColor.slice(3, 5), 16);
      const rb = parseInt(h.roofColor.slice(5, 7), 16);
      const roofBase = `rgb(${Math.floor(rr * darkFactor)}, ${Math.floor(rg * darkFactor)}, ${Math.floor(rb * darkFactor)})`;
      const roofLight = `rgb(${Math.floor(rr * darkFactor * 1.15)}, ${Math.floor(rg * darkFactor * 1.1)}, ${Math.floor(rb * darkFactor * 1.05)})`;
      const roofDark = `rgb(${Math.floor(rr * darkFactor * 0.8)}, ${Math.floor(rg * darkFactor * 0.8)}, ${Math.floor(rb * darkFactor * 0.8)})`;

      const cx = h.x + h.w / 2;
      const cy = h.y + h.h / 2;

      if (roofStyle === 0) {
        // Gabled roof — ridge runs left↔right, slopes face top and bottom
        // Two triangular slopes meeting at a horizontal ridge line

        // South-facing slope (lighter — catches more sun from bird's eye)
        ctx.fillStyle = roofLight;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y + h.h);         // bottom-left
        ctx.lineTo(h.x + h.w, h.y + h.h);   // bottom-right
        ctx.lineTo(h.x + h.w, cy);           // ridge-right
        ctx.lineTo(h.x, cy);                 // ridge-left
        ctx.closePath();
        ctx.fill();

        // North-facing slope (darker — in shadow)
        ctx.fillStyle = roofDark;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);               // top-left
        ctx.lineTo(h.x + h.w, h.y);         // top-right
        ctx.lineTo(h.x + h.w, cy);          // ridge-right
        ctx.lineTo(h.x, cy);                // ridge-left
        ctx.closePath();
        ctx.fill();

        // Ridge line
        ctx.strokeStyle = `rgba(0,0,0,${0.25 + nightAlpha * 0.1})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(h.x, cy);
        ctx.lineTo(h.x + h.w, cy);
        ctx.stroke();

        // Tile lines (horizontal rows)
        ctx.strokeStyle = `rgba(0,0,0,${0.06})`;
        ctx.lineWidth = 0.4;
        const tileSpacing = 4;
        for (let ty = h.y + tileSpacing; ty < h.y + h.h; ty += tileSpacing) {
          if (Math.abs(ty - cy) < 1) continue; // skip ridge
          ctx.beginPath();
          ctx.moveTo(h.x + 1, ty);
          ctx.lineTo(h.x + h.w - 1, ty);
          ctx.stroke();
        }

      } else if (roofStyle === 1) {
        // Hip roof — all four edges slope inward to a smaller rectangle at the top
        const inset = Math.min(h.w, h.h) * 0.3;

        // Four triangular/trapezoidal faces
        // Bottom face (lighter)
        ctx.fillStyle = roofLight;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y + h.h);
        ctx.lineTo(h.x + h.w, h.y + h.h);
        ctx.lineTo(h.x + h.w - inset, h.y + h.h - inset);
        ctx.lineTo(h.x + inset, h.y + h.h - inset);
        ctx.closePath();
        ctx.fill();

        // Top face (darker)
        ctx.fillStyle = roofDark;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(h.x + h.w, h.y);
        ctx.lineTo(h.x + h.w - inset, h.y + inset);
        ctx.lineTo(h.x + inset, h.y + inset);
        ctx.closePath();
        ctx.fill();

        // Left face
        ctx.fillStyle = roofBase;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(h.x, h.y + h.h);
        ctx.lineTo(h.x + inset, h.y + h.h - inset);
        ctx.lineTo(h.x + inset, h.y + inset);
        ctx.closePath();
        ctx.fill();

        // Right face (slightly lighter)
        ctx.fillStyle = roofLight;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(h.x + h.w, h.y);
        ctx.lineTo(h.x + h.w, h.y + h.h);
        ctx.lineTo(h.x + h.w - inset, h.y + h.h - inset);
        ctx.lineTo(h.x + h.w - inset, h.y + inset);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        // Ridge lines (the four edges from corner to inner rect)
        ctx.strokeStyle = `rgba(0,0,0,${0.2 + nightAlpha * 0.1})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + inset, h.y + inset);
        ctx.moveTo(h.x + h.w, h.y); ctx.lineTo(h.x + h.w - inset, h.y + inset);
        ctx.moveTo(h.x, h.y + h.h); ctx.lineTo(h.x + inset, h.y + h.h - inset);
        ctx.moveTo(h.x + h.w, h.y + h.h); ctx.lineTo(h.x + h.w - inset, h.y + h.h - inset);
        ctx.stroke();

        // Inner rectangle outline (the flat top)
        ctx.strokeStyle = `rgba(0,0,0,${0.15})`;
        ctx.lineWidth = 0.6;
        ctx.strokeRect(h.x + inset, h.y + inset, h.w - inset * 2, h.h - inset * 2);

      } else {
        // Gabled rotated — ridge runs top↔bottom, slopes face left and right

        // Right-facing slope (lighter)
        ctx.fillStyle = roofLight;
        ctx.beginPath();
        ctx.moveTo(h.x + h.w, h.y);          // top-right
        ctx.lineTo(h.x + h.w, h.y + h.h);    // bottom-right
        ctx.lineTo(cx, h.y + h.h);            // ridge-bottom
        ctx.lineTo(cx, h.y);                  // ridge-top
        ctx.closePath();
        ctx.fill();

        // Left-facing slope (darker)
        ctx.fillStyle = roofDark;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);                // top-left
        ctx.lineTo(h.x, h.y + h.h);          // bottom-left
        ctx.lineTo(cx, h.y + h.h);           // ridge-bottom
        ctx.lineTo(cx, h.y);                 // ridge-top
        ctx.closePath();
        ctx.fill();

        // Ridge line (vertical)
        ctx.strokeStyle = `rgba(0,0,0,${0.25 + nightAlpha * 0.1})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, h.y);
        ctx.lineTo(cx, h.y + h.h);
        ctx.stroke();

        // Tile lines (vertical rows)
        ctx.strokeStyle = `rgba(0,0,0,${0.06})`;
        ctx.lineWidth = 0.4;
        const tileSpacing = 4;
        for (let tx = h.x + tileSpacing; tx < h.x + h.w; tx += tileSpacing) {
          if (Math.abs(tx - cx) < 1) continue;
          ctx.beginPath();
          ctx.moveTo(tx, h.y + 1);
          ctx.lineTo(tx, h.y + h.h - 1);
          ctx.stroke();
        }
      }

      // Outline
      ctx.strokeStyle = `rgba(0,0,0,${0.15 + nightAlpha * 0.08})`;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(h.x, h.y, h.w, h.h);

      // Chimney (small rectangle on one side of ridge)
      if (seededRandom(h.seed + 2000) > 0.35) {
        const chimW = 3;
        const chimH = 4;
        const chimX = h.x + h.w * (0.7 + seededRandom(h.seed + 2010) * 0.2);
        const chimY = h.y + h.h * 0.15;
        ctx.fillStyle = `rgba(${Math.floor(120 * darkFactor)}, ${Math.floor(100 * darkFactor)}, ${Math.floor(90 * darkFactor)}, 0.9)`;
        ctx.fillRect(chimX, chimY, chimW, chimH);
        ctx.strokeStyle = `rgba(0,0,0,0.2)`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(chimX, chimY, chimW, chimH);
      }

      // Window lights are drawn dynamically (see drawHouseWindows) so they
      // respond to actual occupancy — nothing baked into the static canvas here.

      // Front door step (small rectangle at building edge)
      const doorStepAlpha = 0.4 - nightAlpha * 0.15;
      ctx.fillStyle = `rgba(160, 140, 120, ${doorStepAlpha})`;
      ctx.fillRect(h.x + h.w / 2 - 2.5, h.y + h.h - 0.5, 5, 2);
    }
  }

  drawParks(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    for (const park of this.parks) {
      const darkFactor = 1 - nightAlpha * 0.5;

      // Grass
      const grassGreen = Math.floor(140 * darkFactor);
      const grassBase = Math.floor(100 * darkFactor);
      ctx.fillStyle = `rgb(${Math.floor(80 * darkFactor)}, ${grassGreen}, ${Math.floor(60 * darkFactor)})`;
      ctx.fillRect(park.x, park.y, park.w, park.h);

      // Subtle grass texture
      ctx.strokeStyle = `rgba(0, 0, 0, 0.04)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 8; i++) {
        const lx = park.x + seededRandom(park.seed + i * 10) * park.w;
        const ly = park.y + seededRandom(park.seed + i * 10 + 5) * park.h;
        ctx.beginPath();
        ctx.arc(lx, ly, 3 + seededRandom(park.seed + i * 10 + 15) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Path through park
      ctx.fillStyle = `rgba(${Math.floor(180 * darkFactor)}, ${Math.floor(165 * darkFactor)}, ${Math.floor(140 * darkFactor)}, 0.6)`;
      ctx.fillRect(park.x + park.w * 0.1, park.y + park.h / 2 - 3, park.w * 0.8, 6);
      ctx.fillRect(park.x + park.w / 2 - 3, park.y + park.h * 0.1, 6, park.h * 0.8);

      // Fountain
      if (park.hasFountain) {
        const fx = park.x + park.w / 2;
        const fy = park.y + park.h / 2;
        // Water basin
        ctx.fillStyle = `rgba(${Math.floor(120 * darkFactor)}, ${Math.floor(160 * darkFactor)}, ${Math.floor(200 * darkFactor)}, 0.7)`;
        ctx.beginPath();
        ctx.arc(fx, fy, 10, 0, Math.PI * 2);
        ctx.fill();
        // Stone rim
        ctx.strokeStyle = `rgba(${Math.floor(160 * darkFactor)}, ${Math.floor(155 * darkFactor)}, ${Math.floor(145 * darkFactor)}, 0.8)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Center column
        ctx.fillStyle = `rgba(${Math.floor(180 * darkFactor)}, ${Math.floor(175 * darkFactor)}, ${Math.floor(165 * darkFactor)}, 0.9)`;
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Playground
      if (park.hasPlayground) {
        const px = park.x + park.w * 0.75;
        const py = park.y + park.h * 0.25;
        // Sandbox
        ctx.fillStyle = `rgba(${Math.floor(220 * darkFactor)}, ${Math.floor(200 * darkFactor)}, ${Math.floor(150 * darkFactor)}, 0.6)`;
        ctx.fillRect(px - 8, py - 8, 16, 16);
        ctx.strokeStyle = `rgba(139, 119, 90, ${0.4 - nightAlpha * 0.15})`;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(px - 8, py - 8, 16, 16);
      }

      // Park border
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.08 + nightAlpha * 0.04})`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(park.x, park.y, park.w, park.h);
    }
  }

  /** Returns the current directional shadow offset based on the time of day.
   *  Morning: shadow sweeps west (−dx), midday: short shadow pointing south, evening: shadow sweeps east (+dx).
   */
  getShadowOffset(): { dx: number; dy: number; alpha: number } {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    // Outside daylight hours — small static depth shadow
    if (hour < 6 || hour > 20) return { dx: 2, dy: 3, alpha: 0.15 };
    // t = 0 at 6 am, 0.5 at 1 pm (solar noon), 1 at 8 pm
    const t = (hour - 6) / 14;
    // Horizontal: sweeps from −10 (west/left at dawn) through 0 (noon) to +10 (east/right at dusk)
    const dx = (t - 0.5) * 20;
    // Vertical: always a small positive offset (depth), slightly larger at dawn/dusk (long shadows foreshorten)
    const dy = 2 + Math.abs(t - 0.5) * 3;
    // Shadow darkens slightly at dawn/dusk when the angle is shallower
    const alpha = 0.12 + Math.abs(t - 0.5) * 0.07;
    return { dx, dy, alpha };
  }

  drawTrees(ctx: CanvasRenderingContext2D, time: number, nightAlpha: number) {
    const shadow = this.getShadowOffset();
    for (const t of this.trees) {
      const sway = Math.sin(time * 0.5 + t.seed) * 1.5;
      const green = Math.max(0, 120 - nightAlpha * 60);
      const lightness = 35 - nightAlpha * 15;

      // Directional tree shadow — an ellipse offset in the sun's opposite direction
      const tsDx = shadow.dx * 0.55;
      const tsDy = shadow.dy * 0.55 + t.radius * 0.35; // always slightly below (trunk base)
      ctx.fillStyle = `rgba(0, 0, 0, ${shadow.alpha + nightAlpha * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(t.x + tsDx, t.y + tsDy, t.radius * 0.9, t.radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsl(${green}, 50%, ${lightness}%)`;
      ctx.beginPath();
      ctx.arc(t.x + sway, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${0.1 - nightAlpha * 0.05})`;
      ctx.beginPath();
      ctx.arc(t.x + sway - t.radius * 0.2, t.y - t.radius * 0.2, t.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawStreetLights(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (nightAlpha < 0.05) return;
    const glowR = 65;
    // 'screen' composite prevents overlapping glows from accumulating into
    // an opaque amber fog wash (especially visible in Safari).
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const sl of this.streetLights) {
      const grad = ctx.createRadialGradient(sl.x, sl.y, 0, sl.x, sl.y, glowR);
      grad.addColorStop(0,   `rgba(255, 215, 130, ${nightAlpha * 0.55})`);
      grad.addColorStop(0.4, `rgba(255, 205, 110, ${nightAlpha * 0.18})`);
      grad.addColorStop(0.8, `rgba(255, 195, 90,  ${nightAlpha * 0.05})`);
      grad.addColorStop(1,   'rgba(255, 190, 80, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sl.x - glowR, sl.y - glowR, glowR * 2, glowR * 2);
    }
    ctx.restore();

    // Bright lamp points drawn with normal composite (not screen) so they stay crisp
    for (const sl of this.streetLights) {
      ctx.fillStyle = `rgba(255, 248, 200, ${Math.min(1, nightAlpha * 1.8)})`;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPlazaBenches(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const benchL = 18;
    const benchW = 5;
    const legH = 2;

    for (const b of this.plazaBenches) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);

      const dark = 1 - nightAlpha * 0.45;
      ctx.fillStyle = `rgba(0,0,0,${0.12 + nightAlpha * 0.06})`;
      ctx.fillRect(-benchL / 2 + 1.5, -benchW / 2 + 1.5, benchL, benchW);

      const slatColors = [
        `rgba(${Math.floor(160 * dark)}, ${Math.floor(110 * dark)}, ${Math.floor(60 * dark)}, 0.95)`,
        `rgba(${Math.floor(150 * dark)}, ${Math.floor(100 * dark)}, ${Math.floor(55 * dark)}, 0.95)`,
        `rgba(${Math.floor(155 * dark)}, ${Math.floor(105 * dark)}, ${Math.floor(58 * dark)}, 0.95)`,
      ];
      const slatH = (benchW - 1) / 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = slatColors[i];
        ctx.fillRect(-benchL / 2, -benchW / 2 + i * slatH, benchL, slatH - 0.4);
      }

      ctx.fillStyle = `rgba(${Math.floor(140 * dark)}, ${Math.floor(95 * dark)}, ${Math.floor(50 * dark)}, 0.9)`;
      ctx.fillRect(-benchL / 2, -benchW / 2 - 3, benchL, 2.5);

      ctx.fillStyle = `rgba(${Math.floor(80 * dark)}, ${Math.floor(80 * dark)}, ${Math.floor(80 * dark)}, 0.8)`;
      const legPositions = [-benchL / 2 + 3, benchL / 2 - 3];
      for (const lx of legPositions) {
        ctx.fillRect(lx - 1, benchW / 2, 2, legH);
        ctx.fillRect(lx - 1, -benchW / 2 - 1, 2, legH);
      }

      ctx.restore();
    }
  }

  drawPlazaLampPosts(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    for (const lamp of this.plazaLamps) {
      const dark = 1 - nightAlpha * 0.35;

      ctx.fillStyle = `rgba(0,0,0,${0.18 + nightAlpha * 0.04})`;
      ctx.beginPath();
      ctx.ellipse(lamp.x + 2, lamp.y + 2, 4, 3, 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${Math.floor(75 * dark)}, ${Math.floor(75 * dark)}, ${Math.floor(85 * dark)}, 1)`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();

      const lampLit = nightAlpha > 0.1;
      ctx.fillStyle = lampLit
        ? `rgba(255, 245, 190, ${0.6 + nightAlpha * 0.4})`
        : `rgba(210, 215, 225, 0.95)`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(${Math.floor(60 * dark)}, ${Math.floor(60 * dark)}, ${Math.floor(70 * dark)}, 0.9)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = lampLit
        ? `rgba(255, 255, 220, ${0.8 + nightAlpha * 0.2})`
        : `rgba(180, 185, 195, 0.8)`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPlazaLampGlows(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (nightAlpha < 0.05) return;
    // 'screen' composite prevents overlapping glows accumulating into fog in Safari.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const lamp of this.plazaLamps) {
      const glowR = 55 + nightAlpha * 25;
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, glowR);
      grad.addColorStop(0,   `rgba(255, 225, 140, ${nightAlpha * 0.60})`);
      grad.addColorStop(0.45,`rgba(255, 215, 120, ${nightAlpha * 0.20})`);
      grad.addColorStop(0.85,`rgba(255, 205, 100, ${nightAlpha * 0.06})`);
      grad.addColorStop(1,   'rgba(255, 200, 90, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lamp.x - glowR, lamp.y - glowR, glowR * 2, glowR * 2);
    }
    ctx.restore();
  }

  drawTrafficLights(ctx: CanvasRenderingContext2D, nightAlpha: number, trafficPhase: number) {
    const hw = ROAD_WIDTH / 2;
    for (const inter of this.intersections) {
      let hColor: string;
      let vColor: string;
      if (trafficPhase < 0.45) {
        hColor = 'green'; vColor = 'red';
      } else if (trafficPhase < 0.50) {
        hColor = 'yellow'; vColor = 'yellow';
      } else if (trafficPhase < 0.95) {
        hColor = 'red'; vColor = 'green';
      } else {
        hColor = 'yellow'; vColor = 'yellow';
      }

      const colorToRgba = (c: string, a: number) => {
        if (c === 'green') return `rgba(50, 200, 50, ${a})`;
        if (c === 'red') return `rgba(200, 50, 50, ${a})`;
        return `rgba(220, 200, 50, ${a})`;
      };

      const corners = [
        { x: inter.x - hw + 2, y: inter.y - hw + 2, dir: 'h' },
        { x: inter.x + hw - 2, y: inter.y - hw + 2, dir: 'v' },
        { x: inter.x - hw + 2, y: inter.y + hw - 2, dir: 'v' },
        { x: inter.x + hw - 2, y: inter.y + hw - 2, dir: 'h' },
      ];

      for (const corner of corners) {
        const signal = corner.dir === 'h' ? hColor : vColor;
        const alpha = 0.7;

        if (nightAlpha > 0.1) {
          const glowR = 5;
          const grad = ctx.createRadialGradient(corner.x, corner.y, 0, corner.x, corner.y, glowR);
          grad.addColorStop(0, colorToRgba(signal, nightAlpha * 0.4));
          grad.addColorStop(1, colorToRgba(signal, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(corner.x - glowR, corner.y - glowR, glowR * 2, glowR * 2);
        }

        ctx.fillStyle = colorToRgba(signal, alpha);
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  startEvent(type: 'musician' | 'protest') {
    if (this.activeEvent) return;
    const p = this.plazaBounds;
    // Pick a random spot in the plaza that isn't too close to the edges
    const ex = p.x + 40 + Math.random() * (p.w - 80);
    const ey = p.y + 40 + Math.random() * (p.h - 80);
    this.activeEvent = {
      type,
      x: ex,
      y: ey,
      radius: type === 'musician' ? 80 : 120,
      timer: 3000 + Math.random() * 3000, // 50 to 100 seconds at 60fps
    };
    // Create a pedestrian to represent the event focal person
    this.eventPed = new Pedestrian(this, 9001, 0);
    this.eventPed.vx = this.eventPed.vy = 0;
    this.eventPed.angle = 0;
  }

  updateEvent() {
    if (this.activeEvent) {
      this.activeEvent.timer--;
      if (this.activeEvent.timer <= 0) {
        this.activeEvent = null;
      }
    }
  }

  drawEvent(ctx: CanvasRenderingContext2D, nightAlpha: number, zoom: number = 1) {
    if (!this.activeEvent || !this.eventPed) return;
    ctx.beginPath(); // guard against stale path from previous draw call

    const ex = this.activeEvent.x;
    const ey = this.activeEvent.y;

    // Subtle gathering-radius indicator
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = `rgba(200, 200, 200, ${0.1 - nightAlpha * 0.05})`;
    ctx.beginPath();
    ctx.arc(0, 0, this.activeEvent.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw event focal person as a regular pedestrian
    this.eventPed.x = ex;
    this.eventPed.y = ey;
    this.eventPed.draw(ctx, nightAlpha, 0, false, zoom);

    const t = Date.now() / 1000;
    const bounce = Math.abs(Math.sin(t * 4)) * 3;
    const s = this.eventPed.size * 5.5;
    const dark = 1 - nightAlpha * 0.3;

    if (this.activeEvent.type === 'musician') {
      // Guitar held in front, scaled to pedestrian size
      ctx.save();
      ctx.translate(ex, ey);
      ctx.fillStyle = `rgba(180, 120, 60, ${dark})`;
      ctx.fillRect(-s * 0.9, -s * 0.45, s * 1.8, s * 0.5);
      ctx.fillStyle = `rgba(140, 88, 38, ${dark})`;
      ctx.fillRect(s * 0.8, -s * 0.6, s * 0.55, s * 0.22);
      // Floating music notes
      ctx.font = `${Math.round(s * 1.4)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(70, 55, 190, ${dark * 0.8})`;
      ctx.fillText('♪', s * 1.5, -s * 1.8 - bounce);
      ctx.fillText('♫', -s, -s * 2.4 - bounce * 0.6);
      ctx.restore();
    } else if (this.activeEvent.type === 'protest') {
      // Banner/sign raised above the pedestrian
      ctx.save();
      ctx.translate(ex, ey);
      ctx.strokeStyle = `rgba(80, 60, 40, ${dark})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s * 0.4, -s * 0.3);
      ctx.lineTo(s * 0.5, -s * 2.2 - bounce);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 255, ${dark})`;
      ctx.fillRect(s * 0.1, -s * 3.2 - bounce, s * 1.8, s * 1.0);
      ctx.strokeStyle = `rgba(180, 30, 30, ${dark})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(s * 0.1, -s * 3.2 - bounce, s * 1.8, s * 1.0);
      ctx.fillStyle = `rgba(0, 0, 0, ${dark})`;
      ctx.fillRect(s * 0.3, -s * 2.95 - bounce, s * 1.3, s * 0.22);
      ctx.fillRect(s * 0.3, -s * 2.6 - bounce, s * 1.0, s * 0.22);
      ctx.restore();
    }
  }

  // ── Persistent fixtures: busker pitch + newspaper stand ──────────────

  private initPersistentFixtures() {
    const pb = this.plazaBounds;
    // Busker sets up in the left quarter of the plaza, away from the clock digits
    this.buskerX = pb.x + pb.w * 0.18;
    this.buskerY = pb.y + pb.h * 0.50;
    // Newsstand in the lower-left plaza corner, near pedestrian flow
    this.newsstandX = pb.x + 38;
    this.newsstandY = pb.y + pb.h - 60;
    // Two fountains act as the colon dots — positioned to match the clock digit geometry
    const cx = pb.x + pb.w / 2;
    const cy = pb.y + pb.h / 2;
    const usableW = pb.w * 0.55;
    const w_digit = usableW / (4 + 2 * 0.44 + 0.75);
    const usableH = pb.h * 0.45;
    const h_digit = Math.min(usableH, w_digit * 1.6);
    this.fountains = [
      { x: cx, y: cy - h_digit / 4 },
      { x: cx, y: cy + h_digit / 4 },
    ];

    // Create a dedicated pedestrian instance for the busker figure
    this.buskerPed = new Pedestrian(this, 9000, 0);
    this.buskerPed.vx = this.buskerPed.vy = 0;
    this.buskerPed.angle = 0; // facing east (toward audience)
  }

  /** Call once per frame — manages busker lifecycle, coin arcs and music notes. */
  updateBusker() {
    const hour = new Date().getHours();

    if (this.buskerActive) {
      this.buskerTimer--;

      // Float music notes up from the busker
      if (Math.random() < 0.07 && this.buskerNotes.length < 10) {
        this.buskerNotes.push({
          x: this.buskerX + (Math.random() - 0.5) * 12,
          y: this.buskerY - 14,
          vy: -(0.28 + Math.random() * 0.18),
          alpha: 0.65 + Math.random() * 0.3,
          char: Math.random() < 0.5 ? '♪' : '♫',
        });
      }

      if (this.buskerTimer <= 0) {
        this.buskerActive = false;
        this.buskerCooldown = Math.floor(1800 + Math.random() * 3600); // 30–90 s gap
      }
    } else if (hour >= 9 && hour < 21) {
      this.buskerCooldown--;
      if (this.buskerCooldown <= 0) {
        this.buskerActive = true;
        this.buskerTimer = Math.floor(2400 + Math.random() * 3600); // 40 s – 2 min
        // Vary position slightly each appearance
        const pb = this.plazaBounds;
        this.buskerX = pb.x + pb.w * 0.18 + (Math.random() - 0.5) * 40;
        this.buskerY = pb.y + pb.h * 0.50 + (Math.random() - 0.5) * 30;
      }
    }

    // Advance coin-arc particles — splice in-place to avoid per-frame array allocation
    for (let i = this.coinParticles.length - 1; i >= 0; i--) {
      const c = this.coinParticles[i];
      c.t += 0.045;
      if (c.t >= 1) this.coinParticles.splice(i, 1);
    }

    // Advance music notes — splice in-place
    for (let i = this.buskerNotes.length - 1; i >= 0; i--) {
      const n = this.buskerNotes[i];
      n.y += n.vy;
      n.x += Math.sin(n.y * 0.12) * 0.25;
      n.alpha -= 0.011;
      if (n.alpha <= 0.01) this.buskerNotes.splice(i, 1);
    }
  }

  /** Spawn a coin arc from a pedestrian toward the guitar case. */
  addCoinParticle(fromX: number, fromY: number) {
    if (!this.buskerActive || this.coinParticles.length > 18) return;
    this.coinParticles.push({
      sx: fromX,
      sy: fromY,
      tx: this.buskerX + (Math.random() - 0.5) * 8,
      ty: this.buskerY + 9,    // land in the guitar case
      t: 0,
      alpha: 1,
    });
  }

  // ── Fountain ─────────────────────────────────────────────────────────────

  /** Draw the static basins — call from buildStaticCanvas. */
  drawFountainBasin(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const dark = 1 - nightAlpha * 0.4;
    const nightBloom = 1 - nightAlpha * 0.55; // flowers dim at night

    // Flower / leaf data — fixed per-fountain, seeded by index so they're stable
    // 8 planting spots evenly around radius 20, each gets a leaf + optional flower
    const PLANT_R = 20;      // distance from fountain centre
    const PLANT_COUNT = 8;
    const FLOWER_COLORS = [
      [255, 80, 100],   // rose pink
      [255, 160, 40],   // amber
      [255, 220, 50],   // yellow
      [180, 100, 220],  // lavender
      [255, 120, 60],   // coral
      [220, 255, 80],   // lime (bud)
    ];

    for (let fi = 0; fi < this.fountains.length; fi++) {
      const f = this.fountains[fi];

      // ── Greenery ring (drawn first, behind basin) ──────────────────────
      for (let i = 0; i < PLANT_COUNT; i++) {
          const angle = (i / PLANT_COUNT) * Math.PI * 2 + fi * 0.4;
          const px = f.x + Math.cos(angle) * PLANT_R;
          const py = f.y + Math.sin(angle) * PLANT_R;

          // Stem — thin green line from ground up
          const stemLen = 4.5 + (i % 3) * 1.2;
          ctx.strokeStyle = `rgba(${Math.floor(60 * dark)},${Math.floor(130 * dark)},${Math.floor(50 * dark)},${0.85 * nightBloom})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(px, py + stemLen * 0.4);
          ctx.lineTo(px, py - stemLen);
          ctx.stroke();

          // Leaf — small ellipse tilted sideways
          const leafAngle = angle + Math.PI / 2 + (i % 2 === 0 ? 0.3 : -0.3);
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(leafAngle);
          ctx.fillStyle = `rgba(${Math.floor(55 * dark)},${Math.floor(145 * dark)},${Math.floor(55 * dark)},${0.8 * nightBloom})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, 1.2, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Flower head — every other plant gets a bloom, alternating colour
          if (i % 2 === 0) {
            const col = FLOWER_COLORS[(i / 2 + fi * 3) % FLOWER_COLORS.length];
            const petalR = 2.0 + (i % 3) * 0.4;

            // 5 petals
            for (let p = 0; p < 5; p++) {
              const pa = (p / 5) * Math.PI * 2;
              ctx.fillStyle = `rgba(${Math.floor(col[0] * dark)},${Math.floor(col[1] * dark)},${Math.floor(col[2] * dark)},${0.85 * nightBloom})`;
              ctx.beginPath();
              ctx.ellipse(
                px + Math.cos(pa) * petalR * 0.9,
                py - stemLen + Math.sin(pa) * petalR * 0.9,
                petalR * 0.7, petalR * 0.5, pa, 0, Math.PI * 2
              );
              ctx.fill();
            }
            // Centre dot
            ctx.fillStyle = `rgba(255,230,${Math.floor(80 * dark)},${0.9 * nightBloom})`;
            ctx.beginPath();
            ctx.arc(px, py - stemLen, 1.1, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Bud — closed teardrop on non-flower plants
            ctx.fillStyle = `rgba(${Math.floor(80 * dark)},${Math.floor(160 * dark)},${Math.floor(70 * dark)},${0.7 * nightBloom})`;
            ctx.beginPath();
            ctx.arc(px, py - stemLen, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
      }

      // ── Basin rim (stone) ───────────────────────────────────────────────
      ctx.fillStyle = `rgb(${Math.floor(185 * dark)},${Math.floor(178 * dark)},${Math.floor(165 * dark)})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 14, 0, Math.PI * 2);
      ctx.fill();

      // Water pool inside
      ctx.fillStyle = `rgba(${Math.floor(100 * dark)},${Math.floor(160 * dark)},${Math.floor(210 * dark)},0.85)`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Central pillar
      ctx.fillStyle = `rgb(${Math.floor(165 * dark)},${Math.floor(158 * dark)},${Math.floor(145 * dark)})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Update fountain on/off cycle and advance water particles. */
  updateFountain() {
    this.fountainTimer--;
    if (this.fountainTimer <= 0) {
      this.fountainActive = !this.fountainActive;
      // On for ~30–45 s, off for ~5 min (300 s) with slight random variation
      this.fountainTimer = this.fountainActive
        ? 1800 + Math.floor(Math.random() * 900)    // 30–45 s at 60 fps
        : 17400 + Math.floor(Math.random() * 1800); // ~4.8–5.3 min at 60 fps
      if (!this.fountainActive) this.fountainParticles.length = 0;
    }

    if (!this.fountainActive) return;

    // Emit new jets from each fountain — 3 streams at evenly-spaced angles
    if (this.fountainParticles.length < 80) {
      const now = Date.now() * 0.0008;
      for (const f of this.fountains) {
        for (let j = 0; j < 3; j++) {
          const angle = (j / 3) * Math.PI * 2 + now;
          const speed = 0.7 + Math.random() * 0.3;
          this.fountainParticles.push({
            x: f.x,
            y: f.y,
            vx: Math.cos(angle) * speed,
            vy: -1.3 - Math.random() * 0.5, // upward
            alpha: 0.75 + Math.random() * 0.2,
            fy: f.y,
          });
        }
      }
    }

    // Advance particles with gravity
    for (let i = this.fountainParticles.length - 1; i >= 0; i--) {
      const p = this.fountainParticles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.06; // gravity
      p.alpha -= 0.02;
      if (p.alpha <= 0 || p.y > p.fy + 4) {
        this.fountainParticles.splice(i, 1);
      }
    }
  }

  /** Draw animated water spray — call from the dynamic render loop. */
  drawFountainSpray(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (!this.fountainActive || this.fountainParticles.length === 0) return;
    const dark = 1 - nightAlpha * 0.3;
    ctx.save();
    for (const p of this.fountainParticles) {
      ctx.fillStyle = `rgba(${Math.floor(160 * dark)},${Math.floor(210 * dark)},${Math.floor(240 * dark)},${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Bandstand ────────────────────────────────────────────────────────────

  startBandstand() {
    if (this.bandstandActive) return;
    const pb = this.plazaBounds;
    // Position at the upper-right quarter of the plaza, away from the clock digits
    this.bandstandX = pb.x + pb.w * 0.80;
    this.bandstandY = pb.y + pb.h * 0.22;
    this.bandstandActive = true;
    this.bandMembers = [];
    this.bandNotes = [];

    const instruments = ['singer', 'guitar', 'bass', 'drums', 'keys'];
    const spacing = 14;
    const count = instruments.length;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spacing;
      const ped = new Pedestrian(this, 9100 + i, 0) as Pedestrian & { instrument: string };
      ped.vx = ped.vy = 0;
      ped.x = this.bandstandX + offset;
      ped.y = this.bandstandY;
      ped.angle = Math.PI * 1.5; // face into the square (upward toward plaza centre)
      ped.instrument = instruments[i];
      this.bandMembers.push(ped);
    }
  }

  stopBandstand() {
    this.bandstandActive = false;
    this.bandMembers = [];
    this.bandNotes = [];
  }

  updateBandstand() {
    if (!this.bandstandActive) return;
    // Emit floating notes from random band members
    if (Math.random() < 0.18 && this.bandNotes.length < 30) {
      const member = this.bandMembers[Math.floor(Math.random() * this.bandMembers.length)];
      this.bandNotes.push({
        x: member.x + (Math.random() - 0.5) * 10,
        y: member.y - 10,
        vy: -(0.28 + Math.random() * 0.22),
        alpha: 0.85 + Math.random() * 0.15,
        char: ['♪', '♫', '♬', '♩'][Math.floor(Math.random() * 4)],
      });
    }
    for (let i = this.bandNotes.length - 1; i >= 0; i--) {
      const n = this.bandNotes[i];
      n.y += n.vy;
      n.x += Math.sin(n.y * 0.09) * 0.35;
      n.alpha -= 0.009;
      if (n.alpha <= 0) this.bandNotes.splice(i, 1);
    }
  }

  drawBandstand(ctx: CanvasRenderingContext2D, nightAlpha: number, zoom: number = 1) {
    if (!this.bandstandActive || this.bandMembers.length === 0) return;
    ctx.beginPath();

    const dark = 1 - nightAlpha * 0.45;
    const bx = this.bandstandX;
    const by = this.bandstandY;
    const pw = 88, ph = 18;

    ctx.save();

    // ── Platform drop-shadow ──────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rx = pw / 2 + 4, ry = ph / 2 + 8;
      k === 0 ? ctx.moveTo(bx + Math.cos(a) * rx + 3, by + Math.sin(a) * ry + 4)
              : ctx.lineTo(bx + Math.cos(a) * rx + 3, by + Math.sin(a) * ry + 4);
    }
    ctx.closePath();
    ctx.fill();

    // ── Octagonal platform ────────────────────────────────────────────────
    ctx.fillStyle = `rgb(${Math.floor(185 * dark)},${Math.floor(142 * dark)},${Math.floor(88 * dark)})`;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rx = pw / 2, ry = ph / 2 + 6;
      k === 0 ? ctx.moveTo(bx + Math.cos(a) * rx, by + Math.sin(a) * ry)
              : ctx.lineTo(bx + Math.cos(a) * rx, by + Math.sin(a) * ry);
    }
    ctx.closePath();
    ctx.fill();

    // Plank grain lines
    ctx.strokeStyle = `rgba(0,0,0,${0.12 * dark})`;
    ctx.lineWidth = 0.7;
    for (let lx = -pw / 2 + 10; lx < pw / 2; lx += 11) {
      ctx.beginPath();
      ctx.moveTo(bx + lx, by - ph / 2 - 2);
      ctx.lineTo(bx + lx, by + ph / 2 + 2);
      ctx.stroke();
    }

    // Platform raised-edge band (front facing)
    ctx.fillStyle = `rgb(${Math.floor(148 * dark)},${Math.floor(108 * dark)},${Math.floor(58 * dark)})`;
    ctx.fillRect(bx - pw / 2, by + ph / 2 + 4, pw, 5);

    // ── Steps (front-centre) ──────────────────────────────────────────────
    ctx.fillStyle = `rgb(${Math.floor(168 * dark)},${Math.floor(130 * dark)},${Math.floor(78 * dark)})`;
    ctx.fillRect(bx - 12, by + ph / 2 + 9, 24, 4);
    ctx.fillStyle = `rgb(${Math.floor(178 * dark)},${Math.floor(140 * dark)},${Math.floor(88 * dark)})`;
    ctx.fillRect(bx - 8, by + ph / 2 + 13, 16, 3);

    // ── Canopy (curved back-wall seen from above) ─────────────────────────
    ctx.strokeStyle = `rgba(${Math.floor(210 * dark)},${Math.floor(210 * dark)},${Math.floor(210 * dark)},0.55)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(bx, by, pw / 2 - 2, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // ── Support pillars ───────────────────────────────────────────────────
    const pillarAngles = [Math.PI * 1.15, Math.PI * 1.5, Math.PI * 1.85];
    for (const pa of pillarAngles) {
      ctx.fillStyle = `rgb(${Math.floor(210 * dark)},${Math.floor(210 * dark)},${Math.floor(210 * dark)})`;
      ctx.beginPath();
      ctx.arc(bx + Math.cos(pa) * (pw / 2 - 2), by + Math.sin(pa) * (ph / 2 + 5), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Bunting — small coloured triangles between pillars ────────────────
    const buntingColors = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#264653'];
    const buntingPoints: { x: number; y: number }[] = pillarAngles.map(pa => ({
      x: bx + Math.cos(pa) * (pw / 2 - 2),
      y: by + Math.sin(pa) * (ph / 2 + 5),
    }));
    for (let seg = 0; seg < buntingPoints.length - 1; seg++) {
      const p0 = buntingPoints[seg], p1 = buntingPoints[seg + 1];
      const flags = 4;
      for (let f = 0; f < flags; f++) {
        const t0 = f / flags, t1 = (f + 0.5) / flags;
        const mx = p0.x + (p1.x - p0.x) * ((t0 + t1) / 2);
        const my = p0.y + (p1.y - p0.y) * ((t0 + t1) / 2) + 4;
        const lx = p0.x + (p1.x - p0.x) * t0;
        const ly = p0.y + (p1.y - p0.y) * t0;
        const rx = p0.x + (p1.x - p0.x) * t1;
        const ry = p0.y + (p1.y - p0.y) * t1;
        const col = buntingColors[(seg * flags + f) % buntingColors.length];
        const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${Math.floor(r * dark)},${Math.floor(g * dark)},${Math.floor(b * dark)},${0.8 * dark})`;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(rx, ry);
        ctx.lineTo(mx, my);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();

    // ── Band members (drawn as pedestrians dancing) ───────────────────────
    for (const ped of this.bandMembers) {
      ped.draw(ctx, nightAlpha, 0, true /* isDancing */, zoom);
    }

    // ── Instrument overlays ────────────────────────────────────────────────
    for (const ped of this.bandMembers) {
      const s = ped.size * 5.5;
      ctx.save();
      ctx.translate(ped.x, ped.y);

      switch (ped.instrument) {
        case 'singer':
          // Mic stand — slim vertical rod with ball head
          ctx.strokeStyle = `rgba(${Math.floor(70 * dark)},${Math.floor(70 * dark)},${Math.floor(70 * dark)},0.9)`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(0, s * 0.4);
          ctx.lineTo(0, -s * 1.1);
          ctx.stroke();
          ctx.fillStyle = `rgba(${Math.floor(50 * dark)},${Math.floor(50 * dark)},${Math.floor(50 * dark)},0.9)`;
          ctx.beginPath();
          ctx.arc(0, -s * 1.1, s * 0.28, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'guitar':
          // Guitar body + neck, held across
          ctx.fillStyle = `rgb(${Math.floor(165 * dark)},${Math.floor(88 * dark)},${Math.floor(38 * dark)})`;
          ctx.fillRect(-s * 0.9, -s * 0.38, s * 1.85, s * 0.44);
          ctx.fillStyle = `rgb(${Math.floor(130 * dark)},${Math.floor(68 * dark)},${Math.floor(28 * dark)})`;
          ctx.fillRect(s * 0.85, -s * 0.52, s * 0.52, s * 0.2);
          break;

        case 'bass':
          // Slightly larger / squarer bass guitar
          ctx.fillStyle = `rgb(${Math.floor(40 * dark)},${Math.floor(80 * dark)},${Math.floor(165 * dark)})`;
          ctx.fillRect(-s * 1.0, -s * 0.38, s * 2.0, s * 0.44);
          ctx.fillStyle = `rgb(${Math.floor(28 * dark)},${Math.floor(60 * dark)},${Math.floor(130 * dark)})`;
          ctx.fillRect(s * 0.9, -s * 0.52, s * 0.52, s * 0.2);
          break;

        case 'drums': {
          // Snare drum + hi-hat circle in front
          const t = Date.now() * 0.004;
          ctx.fillStyle = `rgba(${Math.floor(210 * dark)},${Math.floor(55 * dark)},${Math.floor(55 * dark)},0.85)`;
          ctx.beginPath();
          ctx.ellipse(0, s * 0.55, s * 0.72, s * 0.36, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${Math.floor(160 * dark)},${Math.floor(35 * dark)},${Math.floor(35 * dark)},0.75)`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.ellipse(0, s * 0.55, s * 0.72, s * 0.36, 0, 0, Math.PI * 2);
          ctx.stroke();
          // Two animated drumsticks
          const stickAngle = Math.sin(t * 3) * 0.4;
          ctx.strokeStyle = `rgba(${Math.floor(200 * dark)},${Math.floor(165 * dark)},${Math.floor(100 * dark)},0.9)`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(-s * 0.25, -s * 0.1);
          ctx.lineTo(-s * 0.15 + Math.cos(stickAngle) * s * 0.5, s * 0.3 + Math.sin(stickAngle) * s * 0.3);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s * 0.25, -s * 0.1);
          ctx.lineTo(s * 0.15 - Math.cos(stickAngle) * s * 0.5, s * 0.3 + Math.sin(stickAngle) * s * 0.3);
          ctx.stroke();
          break;
        }

        case 'keys':
          // Keyboard — white rectangle with black keys on top
          ctx.fillStyle = `rgba(${Math.floor(238 * dark)},${Math.floor(238 * dark)},${Math.floor(238 * dark)},0.92)`;
          ctx.fillRect(-s * 1.15, -s * 0.12, s * 2.3, s * 0.42);
          ctx.strokeStyle = `rgba(0,0,0,${0.3 * dark})`;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(-s * 1.15, -s * 0.12, s * 2.3, s * 0.42);
          ctx.fillStyle = `rgba(0,0,0,${0.75 * dark})`;
          for (let k = 0; k < 6; k++) {
            ctx.fillRect(-s * 0.95 + k * s * 0.36, -s * 0.12, s * 0.22, s * 0.26);
          }
          break;
      }
      ctx.restore();
    }

    // ── Floating music notes ───────────────────────────────────────────────
    ctx.save();
    ctx.font = '9px serif';
    ctx.textAlign = 'center';
    for (const n of this.bandNotes) {
      ctx.fillStyle = `rgba(60,45,180,${n.alpha * (1 - nightAlpha * 0.7)})`;
      ctx.fillText(n.char, n.x, n.y);
    }
    ctx.restore();
  }

  drawBusker(ctx: CanvasRenderingContext2D, nightAlpha: number, zoom: number = 1) {
    if (!this.buskerActive || !this.buskerPed) return;
    ctx.beginPath(); // guard against stale path from previous draw call
    const dark = 1 - nightAlpha * 0.5;
    const t = Date.now() / 1000;

    // Guitar case on the ground — drawn first (below pedestrian)
    ctx.save();
    ctx.translate(this.buskerX, this.buskerY);
    ctx.fillStyle = `rgb(${Math.floor(95 * dark)}, ${Math.floor(65 * dark)}, ${Math.floor(38 * dark)})`;
    ctx.fillRect(-9, 5, 18, 8);
    ctx.strokeStyle = `rgba(0,0,0,${0.35 * dark})`;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(-9, 5, 18, 8);
    ctx.fillStyle = `rgba(${Math.floor(215 * dark)}, ${Math.floor(175 * dark)}, ${Math.floor(45 * dark)}, 0.9)`;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(-6 + i * 3.2, 9, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw busker as a regular pedestrian
    this.buskerPed.x = this.buskerX;
    this.buskerPed.y = this.buskerY;
    this.buskerPed.draw(ctx, nightAlpha, 0, false, zoom);

    // Guitar overlay drawn on top of the pedestrian
    const s = this.buskerPed.size * 5.5;
    ctx.save();
    ctx.translate(this.buskerX, this.buskerY);
    ctx.fillStyle = `rgb(${Math.floor(155 * dark)}, ${Math.floor(88 * dark)}, ${Math.floor(38 * dark)})`;
    ctx.fillRect(-s * 0.9, -s * 0.5, s * 1.8, s * 0.55); // guitar body
    ctx.fillStyle = `rgb(${Math.floor(125 * dark)}, ${Math.floor(68 * dark)}, ${Math.floor(28 * dark)})`;
    ctx.fillRect(s * 0.8, -s * 0.65, s * 0.55, s * 0.25); // guitar neck
    ctx.restore();

    // Floating music notes
    ctx.save();
    ctx.font = '8px serif';
    ctx.textAlign = 'center';
    for (const n of this.buskerNotes) {
      ctx.fillStyle = `rgba(70, 55, 190, ${n.alpha * (1 - nightAlpha * 1.2)})`;
      ctx.fillText(n.char, n.x, n.y);
    }
    ctx.restore();

    // Coin arc particles
    for (const c of this.coinParticles) {
      const px = c.sx + (c.tx - c.sx) * c.t;
      const py = c.sy + (c.ty - c.sy) * c.t - Math.sin(c.t * Math.PI) * 18;
      const coinAlpha = c.alpha * (1 - nightAlpha * 0.6);
      ctx.fillStyle = `rgba(215, 178, 48, ${coinAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 228, 120, ${coinAlpha * 0.55})`;
      ctx.beginPath();
      ctx.arc(px - 0.6, py - 0.6, 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawNewstand(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const hour = new Date().getHours();
    if (hour < 6 || hour >= 13) return;   // morning papers only
    // Fade out toward 13:00
    const fadeAlpha = hour < 12 ? 1 : (13 - hour); // 1 until noon, then fade over 1 hour
    if (fadeAlpha < 0.05) return;

    const dark = (1 - nightAlpha * 0.5) * fadeAlpha;
    const x = this.newsstandX;
    const y = this.newsstandY;

    // Ground shadow
    ctx.fillStyle = `rgba(0,0,0,${0.13 * fadeAlpha})`;
    ctx.fillRect(x + 2, y + 2, 20, 26);

    // Kiosk body — slate metal
    ctx.fillStyle = `rgb(${Math.floor(125 * dark)}, ${Math.floor(120 * dark)}, ${Math.floor(118 * dark)})`;
    ctx.fillRect(x, y, 20, 26);

    // Roof overhang
    ctx.fillStyle = `rgb(${Math.floor(72 * dark)}, ${Math.floor(68 * dark)}, ${Math.floor(65 * dark)})`;
    ctx.fillRect(x - 2, y - 4, 24, 5);

    // Front display window — newspaper pages
    ctx.fillStyle = `rgb(${Math.floor(242 * dark)}, ${Math.floor(242 * dark)}, ${Math.floor(246 * dark)})`;
    ctx.fillRect(x + 2, y + 3, 16, 11);
    // Masthead block (blue banner)
    ctx.fillStyle = `rgb(${Math.floor(40 * dark)}, ${Math.floor(80 * dark)}, ${Math.floor(160 * dark)})`;
    ctx.fillRect(x + 2, y + 3, 16, 3);
    // Headline lines
    ctx.fillStyle = `rgba(15, 15, 15, ${0.65 * dark})`;
    ctx.fillRect(x + 3, y + 8,  12, 1.4);
    ctx.fillRect(x + 3, y + 10.5, 9,  1);
    ctx.fillRect(x + 3, y + 12,  11, 1);

    // Newspaper stack on the lower shelf
    for (let i = 0; i < 4; i++) {
      const shade = (228 - i * 12) * dark;
      ctx.fillStyle = `rgb(${Math.floor(shade)}, ${Math.floor(shade)}, ${Math.floor(shade + 6)})`;
      ctx.fillRect(x + 2, y + 16 + i * 2.5, 16, 2.2);
      ctx.strokeStyle = `rgba(0,0,0,0.18)`;
      ctx.lineWidth = 0.4;
      ctx.strokeRect(x + 2, y + 16 + i * 2.5, 16, 2.2);
    }

    // Kiosk border
    ctx.strokeStyle = `rgba(0,0,0,${0.38 * fadeAlpha})`;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(x, y, 20, 26);
  }

  getRandomWalkablePosition(seed: number): { x: number; y: number } {
    const sidewalksAndPlaza = this.walkableRects.filter(w => w.type === 'sidewalk' || w.type === 'plaza');
    const idx = Math.floor(seededRandom(seed) * sidewalksAndPlaza.length);
    const rect = sidewalksAndPlaza[idx];
    return {
      x: rect.x + seededRandom(seed + 1) * rect.w,
      y: rect.y + seededRandom(seed + 2) * rect.h,
    };
  }

  getRandomSidewalkWaypoint(): { x: number; y: number } {
    const eligible = this.walkableRects.filter(w => w.type === 'sidewalk' || w.type === 'plaza');
    const rect = eligible[Math.floor(Math.random() * eligible.length)];
    return {
      x: rect.x + Math.random() * rect.w,
      y: rect.y + Math.random() * rect.h,
    };
  }

  /** Get a random house position for pedestrian "going home" behavior */
  getRandomHousePosition(): { x: number; y: number; houseIndex: number } | null {
    if (this.houses.length === 0) return null;
    const houseIndex = Math.floor(Math.random() * this.houses.length);
    const h = this.houses[houseIndex];
    // Return the front door position and house index
    return { x: h.x + h.w / 2, y: h.y + h.h, houseIndex };
  }

  isOnRoad(x: number, y: number): boolean {
    for (const road of this.roads) {
      if (x >= road.x && x <= road.x + road.w && y >= road.y && y <= road.y + road.h) {
        return true;
      }
    }
    return false;
  }

  isInPlaza(x: number, y: number): boolean {
    const p = this.plazaBounds;
    return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }

  isOnCrosswalk(x: number, y: number, padding: number = 0): boolean {
    for (const wr of this.walkableRects) {
      if (wr.type === 'crosswalk' &&
        x >= wr.x - padding && x <= wr.x + wr.w + padding &&
        y >= wr.y - padding && y <= wr.y + wr.h + padding) {
        return true;
      }
    }
    return false;
  }

  getNearestCrosswalk(x: number, y: number): { x: number; y: number } {
    let bestDist = Infinity;
    let bestX = x, bestY = y;
    for (const wr of this.walkableRects) {
      if (wr.type !== 'crosswalk') continue;
      const cx = wr.x + wr.w / 2;
      const cy = wr.y + wr.h / 2;
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < bestDist) {
        bestDist = d;
        bestX = cx;
        bestY = cy;
      }
    }
    return { x: bestX, y: bestY };
  }

  requiresCrossing(x1: number, y1: number, x2: number, y2: number): boolean {
    const steps = Math.max(5, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 10));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = x1 + (x2 - x1) * t;
      const sy = y1 + (y2 - y1) * t;
      if (this.isOnRoad(sx, sy) && !this.isInPlaza(sx, sy)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Build a walkability grid over the whole city.
   * Cell size = PF_STEP (9px). A cell is blocked if it overlaps any building, house, or venue.
   * Called once at the end of the constructor after all structures are placed.
   */
  buildPfGrid() {
    const step = this.PF_STEP;
    const cols = Math.ceil(this.width  / step) + 1;
    const rows = Math.ceil(this.height / step) + 1;
    this.pfCols = cols;
    this.pfRows = rows;
    const grid = new Uint8Array(cols * rows); // default 0 = blocked

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = c * step;
        const wy = r * step;
        // walkable if not inside any solid structure (use a 1px margin so path stays off wall edges)
        grid[r * cols + c] = this.isInBuilding(wx, wy, 1) ? 0 : 1;
      }
    }
    this.pfGrid = grid;
  }

  /**
   * A* shortest path on the obstacle-aware walkability grid.
   * Avoids all buildings, houses and venues. Returns world-space waypoints.
   * Diagonal movement allowed (cost √2) so paths hug corners naturally.
   */
  findHomePath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
    const step  = this.PF_STEP;
    const cols  = this.pfCols;
    const rows  = this.pfRows;
    const grid  = this.pfGrid;

    const clampC = (c: number) => Math.max(0, Math.min(cols - 1, c));
    const clampR = (r: number) => Math.max(0, Math.min(rows - 1, r));

    const sc = clampC(Math.round(fromX / step));
    const sr = clampR(Math.round(fromY / step));
    let   ec = clampC(Math.round(toX   / step));
    let   er = clampR(Math.round(toY   / step));

    // If target cell is blocked (e.g. front-door is inside house bounds), walk outward to
    // the nearest walkable cell so the path can still finish close to the door
    if (!grid[er * cols + ec]) {
      let found = false;
      for (let radius = 1; radius <= 6 && !found; radius++) {
        for (let dc = -radius; dc <= radius && !found; dc++) {
          for (let dr = -radius; dr <= radius && !found; dr++) {
            if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
            const nc = clampC(ec + dc), nr = clampR(er + dr);
            if (grid[nr * cols + nc]) { ec = nc; er = nr; found = true; }
          }
        }
      }
    }

    if (sc === ec && sr === er) return [{ x: toX, y: toY }];

    type ANode = { c: number; r: number; g: number; f: number; parent: ANode | null };
    const h = (c: number, r: number) => Math.hypot(c - ec, r - er); // Euclidean heuristic for diagonals

    const idx = (c: number, r: number) => r * cols + c;
    const startNode: ANode = { c: sc, r: sr, g: 0, f: h(sc, sr), parent: null };
    const open: ANode[] = [startNode];
    const gCost  = new Float32Array(cols * rows).fill(Infinity);
    const nodeOf = new Array<ANode | null>(cols * rows).fill(null);
    gCost[idx(sc, sr)] = 0;
    nodeOf[idx(sc, sr)] = startNode;
    const closed = new Uint8Array(cols * rows);
    let found: ANode | null = null;

    // 8-directional moves: 4 cardinal + 4 diagonal
    const DIRS = [
      { dc:  1, dr:  0, cost: 1   },
      { dc: -1, dr:  0, cost: 1   },
      { dc:  0, dr:  1, cost: 1   },
      { dc:  0, dr: -1, cost: 1   },
      { dc:  1, dr:  1, cost: 1.4 },
      { dc: -1, dr:  1, cost: 1.4 },
      { dc:  1, dr: -1, cost: 1.4 },
      { dc: -1, dr: -1, cost: 1.4 },
    ];

    while (open.length > 0) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) { if (open[i].f < open[bi].f) bi = i; }
      const cur = open.splice(bi, 1)[0];

      if (cur.c === ec && cur.r === er) { found = cur; break; }

      const ci = idx(cur.c, cur.r);
      if (closed[ci]) continue;
      closed[ci] = 1;

      for (const { dc, dr, cost } of DIRS) {
        const nc = cur.c + dc, nr = cur.r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = idx(nc, nr);
        if (!grid[ni] || closed[ni]) continue;
        // For diagonal moves, ensure both cardinal neighbours are walkable (no corner-cutting)
        if (dc !== 0 && dr !== 0) {
          if (!grid[idx(cur.c + dc, cur.r)] || !grid[idx(cur.c, cur.r + dr)]) continue;
        }
        const g = cur.g + cost;
        if (g < gCost[ni]) {
          gCost[ni] = g;
          const node: ANode = { c: nc, r: nr, g, f: g + h(nc, nr), parent: cur };
          nodeOf[ni] = node;
          open.push(node);
        }
      }
    }

    if (!found) return [{ x: toX, y: toY }]; // fallback: direct line

    // Reconstruct path (skip start node), replace last point with exact world destination
    const path: { x: number; y: number }[] = [];
    let cur: ANode | null = found;
    while (cur && cur.parent !== null) {
      path.unshift({ x: cur.c * step, y: cur.r * step });
      cur = cur.parent;
    }

    // Thin the path — remove collinear intermediate nodes to reduce unnecessary micro-turns
    const thinned: { x: number; y: number }[] = [];
    for (let i = 0; i < path.length; i++) {
      if (i === 0 || i === path.length - 1) { thinned.push(path[i]); continue; }
      const prev = path[i - 1], next = path[i + 1];
      const dx1 = path[i].x - prev.x, dy1 = path[i].y - prev.y;
      const dx2 = next.x - path[i].x, dy2 = next.y - path[i].y;
      if (dx1 !== dx2 || dy1 !== dy2) thinned.push(path[i]); // direction changed — keep
    }

    if (thinned.length > 0) thinned[thinned.length - 1] = { x: toX, y: toY };
    else thinned.push({ x: toX, y: toY });
    return thinned;
  }

  isInBuilding(x: number, y: number, margin = 4): boolean {
    for (const b of this.buildings) {
      if (x >= b.x - margin && x <= b.x + b.w + margin &&
        y >= b.y - margin && y <= b.y + b.h + margin) return true;
    }
    for (const v of this.venues) {
      if (x >= v.x - margin && x <= v.x + v.w + margin &&
        y >= v.y - margin && y <= v.y + v.h + margin) return true;
    }
    for (const h of this.houses) {
      if (x >= h.x - margin && x <= h.x + h.w + margin &&
        y >= h.y - margin && y <= h.y + h.h + margin) return true;
    }
    return false;
  }

  /** Collect the top position of every chimney for smoke emission */
  private generateChimneyPositions() {
    for (const h of this.houses) {
      if (seededRandom(h.seed + 2000) > 0.35) {
        const chimX = h.x + h.w * (0.7 + seededRandom(h.seed + 2010) * 0.2);
        const chimY = h.y + h.h * 0.15; // top of chimney rectangle
        this.chimneyPositions.push({ x: chimX, y: chimY });
      }
    }
  }

  /** True when the market should be active (weekends, or ~30% of weekdays) */
  isMarketDay(): boolean {
    const d = new Date();
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return true;
    // Deterministic weekday roll — changes each calendar day
    const seed = d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
    return seededRandom(seed) < 0.3;
  }

  /** Place 8 market stalls in two rows inside the delivery perimeter */
  private generateMarketStalls() {
    const dp = this.deliveryPerimeter;

    const awningColors = ['#e63946','#f4a261','#e9c46a','#2a9d8f','#457b9d','#9b5de5','#f72585','#4cc9f0'];
    const produceSets = [
      ['#e63946','#f4a261','#a8dadc'],
      ['#81b29a','#f4e285','#d62828'],
      ['#ffb703','#fb8500','#8ecae6'],
      ['#e9c46a','#f4a261','#e63946'],
    ];

    // 4 stalls along the north inner edge + 4 along the south inner edge.
    // Spread evenly across the plaza width so the centre stays clear for the clock.
    const cols = 4;
    const pw = dp.rightX - dp.leftX;
    const xSpacing = pw / (cols + 1); // equal gaps including margins

    for (let col = 0; col < cols; col++) {
      const sx = dp.leftX + xSpacing * (col + 1) - 10; // -10 centres the 20 px stall
      const idx = col;

      // North row — just inside the north delivery lane
      this.marketStalls.push({
        x: sx,
        y: dp.topY + 16,
        awningColor: awningColors[idx % awningColors.length],
        produceColors: produceSets[idx % produceSets.length],
      });

      // South row — just inside the south delivery lane (stall h = 14, leave 18 px gap)
      this.marketStalls.push({
        x: sx,
        y: dp.bottomY - 30,
        awningColor: awningColors[(idx + 4) % awningColors.length],
        produceColors: produceSets[(idx + 2) % produceSets.length],
      });
    }
  }

  /** Draw market stalls — called each frame in the dynamic layer */
  drawMarket(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (!this.isMarketDay()) return;
    const hour = new Date().getHours();
    if (hour < 8 || hour >= 19) return; // market closed at night

    const dark = 1 - nightAlpha * 0.45;
    const sw = 20, sh = 14;

    for (const stall of this.marketStalls) {
      const { x, y } = stall;

      // Drop shadow for depth
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 3, y + 3, sw, sh);

      // Awning canopy (viewed from above)
      const ar = parseInt(stall.awningColor.slice(1, 3), 16);
      const ag = parseInt(stall.awningColor.slice(3, 5), 16);
      const ab = parseInt(stall.awningColor.slice(5, 7), 16);
      ctx.fillStyle = `rgb(${Math.floor(ar * dark)},${Math.floor(ag * dark)},${Math.floor(ab * dark)})`;
      ctx.fillRect(x, y, sw, sh);

      // Lighter awning stripes
      ctx.fillStyle = `rgba(255,255,255,${0.22 * dark})`;
      for (let sx = 0; sx < sw; sx += 5) {
        ctx.fillRect(x + sx, y, 2.5, sh);
      }

      // Produce items along the front edge
      for (let i = 0; i < stall.produceColors.length; i++) {
        const pr = parseInt(stall.produceColors[i].slice(1, 3), 16);
        const pg = parseInt(stall.produceColors[i].slice(3, 5), 16);
        const pb = parseInt(stall.produceColors[i].slice(5, 7), 16);
        ctx.fillStyle = `rgb(${Math.floor(pr * dark)},${Math.floor(pg * dark)},${Math.floor(pb * dark)})`;
        ctx.beginPath();
        ctx.arc(x + 3 + i * 5, y + sh - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outline
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x, y, sw, sh);
    }
  }

  /** Shelter positions just inside each venue awning — pedestrians retreat here in heavy rain */
  private generateAwningSheltPositions() {
    const aw = 14;
    for (const v of this.venues) {
      const count = (v.facingPlaza === 'top' || v.facingPlaza === 'bottom') ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        let sx: number, sy: number;
        if (v.facingPlaza === 'bottom') {
          sx = v.x + v.w * t; sy = v.y + v.h + aw * 0.5;
        } else if (v.facingPlaza === 'top') {
          sx = v.x + v.w * t; sy = v.y - aw * 0.5;
        } else if (v.facingPlaza === 'right') {
          sx = v.x + v.w + aw * 0.5; sy = v.y + v.h * t;
        } else {
          sx = v.x - aw * 0.5; sy = v.y + v.h * t;
        }
        this.awningSheltPositions.push({ x: sx, y: sy });
      }
    }
  }

  // ── Roadside bins ──────────────────────────────────────────────────────

  private generateBins() {
    this.bins = [];
    for (let i = 0; i < this.houses.length; i++) {
      const h = this.houses[i];
      if (!h.gardenPathEnd) continue;
      if (seededRandom(i * 17 + 3) > 0.70) continue;
      const pe = h.gardenPathEnd;
      const offsetX = (seededRandom(i * 31 + 7) - 0.5) * 10 + 5;
      const offsetY = (seededRandom(i * 23 + 11) - 0.5) * 4;
      this.bins.push({
        x: pe.x + offsetX,
        y: pe.y + offsetY,
        collected: false,
        respawnTimer: 0,
        houseIndex: i,
      });
    }
  }

  /** Call once per frame — respawn collected bins after a delay. */
  updateBins() {
    for (const bin of this.bins) {
      if (bin.collected) {
        bin.respawnTimer++;
        if (bin.respawnTimer >= BIN_RESPAWN_FRAMES) {
          bin.collected = false;
          bin.respawnTimer = 0;
        }
      }
    }
  }

  /** Draw wheelie bins in the dynamic layer. */
  drawBins(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const dark = 1 - nightAlpha * 0.55;
    for (const bin of this.bins) {
      if (bin.collected) continue;
      ctx.save();
      ctx.translate(bin.x, bin.y);

      // Body — dark grey
      const bw = 5, bh = 7;
      ctx.fillStyle = `rgb(${Math.floor(70 * dark)}, ${Math.floor(70 * dark)}, ${Math.floor(75 * dark)})`;
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 1);
      ctx.fill();

      // Lid — slightly lighter, slightly wider
      ctx.fillStyle = `rgb(${Math.floor(95 * dark)}, ${Math.floor(95 * dark)}, ${Math.floor(100 * dark)})`;
      ctx.fillRect(-bw / 2 - 0.5, -bh / 2 - 2, bw + 1, 2);

      // Coloured stripe on lid (each house gets its own colour)
      const stripeColors = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];
      ctx.fillStyle = stripeColors[bin.houseIndex % stripeColors.length];
      ctx.globalAlpha = 0.75 * dark;
      ctx.fillRect(-bw / 2, -bh / 2 - 1.5, bw, 1);
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }
}

function buildQueuePositions(
  type: VenueType, vx: number, vy: number, vw: number, vh: number,
  facing: 'top' | 'bottom' | 'left' | 'right',
): { x: number; y: number }[] {
  if (type !== 'shop' && type !== 'bookshop') return [];
  const positions: { x: number; y: number }[] = [];
  const count = 4;
  const spacing = 12;
  const doorX = vx + vw / 2;
  const doorY = vy + vh / 2;
  for (let i = 0; i < count; i++) {
    const offset = 14 + i * spacing;
    if (facing === 'bottom') positions.push({ x: doorX, y: vy + vh + offset });
    else if (facing === 'top') positions.push({ x: doorX, y: vy - offset });
    else if (facing === 'right') positions.push({ x: vx + vw + offset, y: doorY });
    else positions.push({ x: vx - offset, y: doorY });
  }
  return positions;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
