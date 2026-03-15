import { BLOCK_SIZE, ROAD_WIDTH, SIDEWALK_WIDTH, BUILDING_COLORS, HOUSE_COLORS, GARDEN_COLORS } from '../utils/constants';

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
}

export interface PlazaEntrance {
  x: number;
  y: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

export interface DeliveryLane {
  side: 'top' | 'bottom';
  laneX: number;    // center x of lane
  outerY: number;   // y-center of the outer road (entry/exit point)
  innerY: number;   // y inside plaza, past the venue band
  stripX: number;   // left edge of the road strip (for rendering)
  stripY: number;   // top edge of the road strip
  stripW: number;
  stripH: number;
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
type BlockType = 'commercial' | 'residential' | 'park' | 'utility';

export class CityLayout {
  width: number;
  height: number;
  gridCols: number;
  gridRows: number;
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
  intersections: IntersectionDef[] = [];
  plazaLamps: PlazaLampDef[] = [];
  plazaBenches: PlazaBenchDef[] = [];
  plazaBounds: { x: number; y: number; w: number; h: number };

  activeEvent: CityEvent | null = null;

  // Which grid cells are plaza (col, row)
  plazaCells: Set<string> = new Set();
  // Block types for generating varied city content
  blockTypes: Map<string, BlockType> = new Map();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    const cellSize = BLOCK_SIZE + ROAD_WIDTH;
    this.gridCols = Math.ceil(width / cellSize) + 1;
    this.gridRows = Math.ceil(height / cellSize) + 1;

    const offsetX = (width - (this.gridCols - 1) * cellSize) / 2;
    const offsetY = (height - (this.gridRows - 1) * cellSize) / 2;

    // Find center block for the plaza (4 wide × 3 tall — rectangular)
    const centerCol = Math.floor(this.gridCols / 2);
    const centerRow = Math.floor(this.gridRows / 2);

    const validPlazaCols: number[] = [];
    const validPlazaRows: number[] = [];
    for (let dc = -2; dc <= 1; dc++) {
      const c = centerCol + dc;
      if (c >= 0 && c < this.gridCols) validPlazaCols.push(c);
    }
    for (let dr = -1; dr <= 1; dr++) {
      const r = centerRow + dr;
      if (r >= 0 && r < this.gridRows) validPlazaRows.push(r);
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

    // Delivery lanes
    const laneW = 16;
    const laneX = px + pw * 0.25;
    const deliveryStopDepth = 45;

    this.deliveryLanes.push({
      side: 'top',
      laneX,
      outerY: py - ROAD_WIDTH / 2,
      innerY: py + deliveryStopDepth,
      stripX: laneX - laneW / 2,
      stripY: py - ROAD_WIDTH,
      stripW: laneW,
      stripH: ROAD_WIDTH + deliveryStopDepth,
    });
    this.deliveryLanes.push({
      side: 'bottom',
      laneX: px + pw * 0.75,
      outerY: this.plazaBounds.y + this.plazaBounds.h + ROAD_WIDTH / 2,
      innerY: this.plazaBounds.y + this.plazaBounds.h - deliveryStopDepth,
      stripX: laneX - laneW / 2,
      stripY: this.plazaBounds.y + this.plazaBounds.h - deliveryStopDepth,
      stripW: laneW,
      stripH: ROAD_WIDTH + deliveryStopDepth,
    });

    // Assign block types for non-plaza blocks
    this.assignBlockTypes(offsetX, offsetY, cellSize, validPlazaCols, validPlazaRows);

    // Generate roads, sidewalks, buildings, trees, lights, venues
    this.generateRoads(offsetX, offsetY, cellSize);
    this.generateBlocks(offsetX, offsetY, cellSize);
    this.generateVenues(offsetX, offsetY, cellSize, validPlazaCols, validPlazaRows);
    this.generatePlazaFurniture();
    this.generateStreetLights(offsetX, offsetY, cellSize);
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
  }

  private clipRoadAroundPlaza(road: RoadSegment): RoadSegment[] {
    const pb = this.plazaBounds;
    if (road.horizontal) {
      if (road.y + road.h <= pb.y || road.y >= pb.y + pb.h) return [road];
      const segments: RoadSegment[] = [];
      if (road.x < pb.x) {
        segments.push({ x: road.x, y: road.y, w: pb.x - road.x, h: road.h, horizontal: true });
      }
      const roadRight = road.x + road.w;
      const plazaRight = pb.x + pb.w;
      if (roadRight > plazaRight) {
        segments.push({ x: plazaRight, y: road.y, w: roadRight - plazaRight, h: road.h, horizontal: true });
      }
      return segments;
    } else {
      if (road.x + road.w <= pb.x || road.x >= pb.x + pb.w) return [road];
      const segments: RoadSegment[] = [];
      if (road.y < pb.y) {
        segments.push({ x: road.x, y: road.y, w: road.w, h: pb.y - road.y, horizontal: false });
      }
      const roadBottom = road.y + road.h;
      const plazaBottom = pb.y + pb.h;
      if (roadBottom > plazaBottom) {
        segments.push({ x: road.x, y: plazaBottom, w: road.w, h: roadBottom - plazaBottom, horizontal: false });
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
        this.walkableRects.push({
          x: ix - ROAD_WIDTH / 2 - 4, y: iy - ROAD_WIDTH / 2 - 4,
          w: ROAD_WIDTH + 8, h: ROAD_WIDTH + 8, type: 'crosswalk',
        });
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
    const botLane = this.deliveryLanes[1];
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
      if (x < botLane.laneX + laneGap / 2 && x + venueW > botLane.laneX - laneGap / 2) continue;
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

      // Venue name label — rotate for left/right facing venues so text fits
      ctx.fillStyle = `rgba(255,255,255,${0.8 - nightAlpha * 0.3})`;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
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

  drawDeliveryLanes(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const roadLight = Math.max(0, 45 - nightAlpha * 25);
    ctx.fillStyle = `hsl(220, 5%, ${roadLight}%)`;
    for (const lane of this.deliveryLanes) {
      ctx.fillRect(lane.stripX, lane.stripY, lane.stripW, lane.stripH);
    }
    ctx.strokeStyle = `rgba(255, 255, 200, ${0.4 - nightAlpha * 0.1})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    for (const lane of this.deliveryLanes) {
      ctx.beginPath();
      ctx.moveTo(lane.laneX, lane.stripY);
      ctx.lineTo(lane.laneX, lane.stripY + lane.stripH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawRoads(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const roadLight = Math.max(0, 45 - nightAlpha * 25);
    ctx.fillStyle = `hsl(220, 5%, ${roadLight}%)`;
    for (const road of this.roads) {
      ctx.fillRect(road.x, road.y, road.w, road.h);
    }
    ctx.strokeStyle = `rgba(255, 255, 200, ${0.3 - nightAlpha * 0.1})`;
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
    const light = Math.max(0, 75 - nightAlpha * 35);
    ctx.fillStyle = `hsl(35, 15%, ${light}%)`;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    // Subtle tile pattern
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.05 - nightAlpha * 0.02})`;
    ctx.lineWidth = 0.5;
    const tileSize = 20;
    for (let tx = p.x; tx < p.x + p.w; tx += tileSize) {
      ctx.beginPath(); ctx.moveTo(tx, p.y); ctx.lineTo(tx, p.y + p.h); ctx.stroke();
    }
    for (let ty = p.y; ty < p.y + p.h; ty += tileSize) {
      ctx.beginPath(); ctx.moveTo(p.x, ty); ctx.lineTo(p.x + p.w, ty); ctx.stroke();
    }
  }

  drawBuildings(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    for (const b of this.buildings) {
      // Shadow for depth
      ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + nightAlpha * 0.06})`;
      ctx.fillRect(b.x + 3, b.y + 3, b.w, b.h);

      // Building body
      const r = parseInt(b.color.slice(1, 3), 16);
      const g = parseInt(b.color.slice(3, 5), 16);
      const bl = parseInt(b.color.slice(5, 7), 16);
      const darkFactor = 1 - nightAlpha * 0.5;
      ctx.fillStyle = `rgb(${Math.floor(r * darkFactor)}, ${Math.floor(g * darkFactor)}, ${Math.floor(bl * darkFactor)})`;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Building border
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.15 + nightAlpha * 0.1})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Windows at night
      if (nightAlpha > 0.1) {
        const hour = new Date().getHours() + new Date().getMinutes() / 60;
        let litChance = 0.4;
        if (hour >= 20 || hour < 6) litChance = 0.05; // Late night
        else if (hour >= 18 && hour < 20) litChance = 0.2; // Evening

        const winSize = 4;
        const winGap = 8;
        const winAlpha = nightAlpha * 1.2;
        for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += winGap) {
          for (let wy = b.y + 6; wy < b.y + b.h - 6; wy += winGap) {
            const isLit = seededRandom(b.windowSeed + wx * 7 + wy * 13) < litChance;
            if (isLit) {
              const warmth = seededRandom(b.windowSeed + wx * 3 + wy * 11);
              if (warmth > 0.5) {
                ctx.fillStyle = `rgba(255, 220, 120, ${winAlpha * 0.8})`;
              } else {
                ctx.fillStyle = `rgba(200, 230, 255, ${winAlpha * 0.5})`;
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

      // House shadow
      ctx.fillStyle = `rgba(0, 0, 0, ${0.14 + nightAlpha * 0.06})`;
      ctx.fillRect(h.x + 2.5, h.y + 2.5, h.w, h.h);

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

      // Lit windows at night (visible through roof — skylight effect)
      if (nightAlpha > 0.1) {
        const hour = new Date().getHours() + new Date().getMinutes() / 60;
        let litChance = 0.35;
        if (hour >= 23 || hour < 6) litChance = 0.05; // Mostly asleep

        const winAlpha = nightAlpha * 0.8;
        const winSize = 2.5;
        // Two skylights
        const windowPositions = [
          { x: h.x + h.w * 0.3, y: h.y + h.h * 0.35 },
          { x: h.x + h.w * 0.6, y: h.y + h.h * 0.65 },
        ];
        for (const wp of windowPositions) {
          const isLit = seededRandom(h.seed + wp.x * 7 + wp.y * 13) < litChance;
          if (isLit) {
            // Warm glow
            ctx.fillStyle = `rgba(255, 220, 120, ${winAlpha * 0.7})`;
            ctx.fillRect(wp.x - winSize / 2, wp.y - winSize / 2, winSize, winSize);
            // Tiny glow around it
            const gr = ctx.createRadialGradient(wp.x, wp.y, 0, wp.x, wp.y, 5);
            gr.addColorStop(0, `rgba(255, 210, 100, ${nightAlpha * 0.15})`);
            gr.addColorStop(1, 'rgba(255, 210, 100, 0)');
            ctx.fillStyle = gr;
            ctx.fillRect(wp.x - 5, wp.y - 5, 10, 10);
          }
        }
      }

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

  drawTrees(ctx: CanvasRenderingContext2D, time: number, nightAlpha: number) {
    for (const t of this.trees) {
      const sway = Math.sin(time * 0.5 + t.seed) * 1.5;
      const green = Math.max(0, 120 - nightAlpha * 60);
      const lightness = 35 - nightAlpha * 15;

      ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + nightAlpha * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(t.x + 2, t.y + 2, t.radius, t.radius * 0.8, 0, 0, Math.PI * 2);
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
    for (const sl of this.streetLights) {
      const grad = ctx.createRadialGradient(sl.x, sl.y, 0, sl.x, sl.y, 60);
      grad.addColorStop(0, `rgba(255, 210, 120, ${nightAlpha * 0.35})`);
      grad.addColorStop(0.5, `rgba(255, 200, 100, ${nightAlpha * 0.1})`);
      grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sl.x - 60, sl.y - 60, 120, 120);

      ctx.fillStyle = `rgba(255, 240, 180, ${nightAlpha})`;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 2.5, 0, Math.PI * 2);
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
    for (const lamp of this.plazaLamps) {
      const glowR = 50 + nightAlpha * 20;
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, glowR);
      grad.addColorStop(0, `rgba(255, 220, 130, ${nightAlpha * 0.5})`);
      grad.addColorStop(0.4, `rgba(255, 210, 110, ${nightAlpha * 0.18})`);
      grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lamp.x - glowR, lamp.y - glowR, glowR * 2, glowR * 2);
    }
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
  }

  updateEvent() {
    if (this.activeEvent) {
      this.activeEvent.timer--;
      if (this.activeEvent.timer <= 0) {
        this.activeEvent = null;
      }
    }
  }

  drawEvent(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (!this.activeEvent) return;

    // Draw the event focal point
    ctx.save();
    ctx.translate(this.activeEvent.x, this.activeEvent.y);

    // A small gathering radius debug/visual indicator (subtle)
    ctx.fillStyle = `rgba(200, 200, 200, ${0.1 - nightAlpha * 0.05})`;
    ctx.beginPath();
    ctx.arc(0, 0, this.activeEvent.radius, 0, Math.PI * 2);
    ctx.fill();

    const t = Date.now() / 1000;
    const bounce = Math.abs(Math.sin(t * 4)) * 3;

    if (this.activeEvent.type === 'musician') {
      // Draw a tiny guitar player
      ctx.fillStyle = `rgba(150, 100, 50, ${1 - nightAlpha * 0.3})`;
      ctx.fillRect(-4, -6 - bounce, 8, 12); // body
      ctx.fillStyle = `rgba(220, 180, 140, ${1 - nightAlpha * 0.3})`;
      ctx.beginPath(); ctx.arc(0, -9 - bounce, 4, 0, Math.PI * 2); ctx.fill(); // head
      ctx.fillStyle = `rgba(180, 120, 60, ${1 - nightAlpha * 0.3})`;
      ctx.fillRect(-6, -4 - bounce, 14, 4); // guitar
    } else if (this.activeEvent.type === 'protest') {
      // Draw a person holding a sign
      ctx.fillStyle = `rgba(100, 150, 200, ${1 - nightAlpha * 0.3})`;
      ctx.fillRect(-4, -6, 8, 12); // body
      ctx.fillStyle = `rgba(220, 180, 140, ${1 - nightAlpha * 0.3})`;
      ctx.beginPath(); ctx.arc(0, -9, 4, 0, Math.PI * 2); ctx.fill(); // head

      // The sign bouncing
      ctx.strokeStyle = `rgba(80, 60, 40, ${1 - nightAlpha * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(6, -15 - bounce); ctx.stroke(); // pole
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - nightAlpha * 0.3})`;
      ctx.fillRect(0, -22 - bounce, 12, 8); // sign board
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - nightAlpha * 0.3})`;
      ctx.fillRect(2, -20 - bounce, 8, 2); // sign text line 1
      ctx.fillRect(2, -17 - bounce, 6, 2); // sign text line 2
    }

    ctx.restore();
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

  isOnCrosswalk(x: number, y: number): boolean {
    for (const wr of this.walkableRects) {
      if (wr.type === 'crosswalk' &&
        x >= wr.x && x <= wr.x + wr.w &&
        y >= wr.y && y <= wr.y + wr.h) {
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
