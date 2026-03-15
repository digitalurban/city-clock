import { BLOCK_SIZE, ROAD_WIDTH, SIDEWALK_WIDTH, BUILDING_COLORS } from '../utils/constants';

export interface BuildingDef {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  windowSeed: number;
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
  // Side facing the plaza: 'top' | 'bottom' | 'left' | 'right'
  facingPlaza: 'top' | 'bottom' | 'left' | 'right';
  // Outdoor seating positions (in world coords)
  seatingPositions: { x: number; y: number }[];
  // Queue positions for shops (in world coords, front→back order)
  queuePositions: { x: number; y: number }[];
}

export class CityLayout {
  width: number;
  height: number;
  gridCols: number;
  gridRows: number;
  buildings: BuildingDef[] = [];
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

  // Which grid cells are plaza (col, row)
  plazaCells: Set<string> = new Set();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    const cellSize = BLOCK_SIZE + ROAD_WIDTH;
    this.gridCols = Math.ceil(width / cellSize) + 1;
    this.gridRows = Math.ceil(height / cellSize) + 1;

    // Compute plaza size first so we can guarantee equal road margins
    // Keep the plaza compact and "cute" — with WORLD_SCALE = 2 the grid has
    // double the columns, so 0.3 gives the same visual plaza size as the
    // original 0.6 fraction on a viewport-sized world.
    const plazaW = Math.max(3, Math.floor(this.gridCols * 0.3));
    const plazaH = Math.max(2, Math.floor(this.gridRows * 0.3));
    // Ensure (gridCols - plazaW) is even so left/right road counts are identical
    if ((this.gridCols - plazaW) % 2 !== 0) this.gridCols++;
    if ((this.gridRows - plazaH) % 2 !== 0) this.gridRows++;

    // Center the grid — with equal parity guaranteed, startCol/Row are exact integers
    const totalW = this.gridCols * cellSize;
    const totalH = this.gridRows * cellSize;
    const offsetX = (width - totalW) / 2;
    const offsetY = (height - totalH) / 2;

    const startCol = (this.gridCols - plazaW) / 2;
    const startRow = (this.gridRows - plazaH) / 2;
    const plazaCols: number[] = [];
    for (let c = startCol; c < startCol + plazaW; c++) plazaCols.push(c);
    const plazaRows: number[] = [];
    for (let r = startRow; r < startRow + plazaH; r++) plazaRows.push(r);
    // Clamp to grid bounds
    const validPlazaCols = plazaCols.filter(c => c >= 0 && c < this.gridCols);
    const validPlazaRows = plazaRows.filter(r => r >= 0 && r < this.gridRows);

    for (const c of validPlazaCols) {
      for (const r of validPlazaRows) {
        this.plazaCells.add(`${c},${r}`);
      }
    }

    // Compute plaza bounds
    const pMinCol = Math.min(...validPlazaCols);
    const pMaxCol = Math.max(...validPlazaCols);
    const pMinRow = Math.min(...validPlazaRows);
    const pMaxRow = Math.max(...validPlazaRows);
    this.plazaBounds = {
      x: offsetX + pMinCol * cellSize + ROAD_WIDTH / 2,
      y: offsetY + pMinRow * cellSize + ROAD_WIDTH / 2,
      w: (pMaxCol - pMinCol + 1) * cellSize - ROAD_WIDTH,
      h: (pMaxRow - pMinRow + 1) * cellSize - ROAD_WIDTH,
    };

    // Plaza walkable area
    this.walkableRects.push({
      x: this.plazaBounds.x,
      y: this.plazaBounds.y,
      w: this.plazaBounds.w,
      h: this.plazaBounds.h,
      type: 'plaza',
    });

    // Delivery lanes — one top-centre, one bottom-centre
    // venueDepth = edgeInset(6) + venueH(30) = 36; awning = 14px → stop at 36+14+4=54 but
    // use 44 so truck parks just in front of the venue awning (visible drop-off point)
    const venueDepth = 36;
    const awningDepth = 14;
    const deliveryStopDepth = venueDepth + awningDepth + 4; // 54px inside plaza edge
    const laneW = ROAD_WIDTH;
    const laneX = this.plazaBounds.x + this.plazaBounds.w / 2;
    this.deliveryLanes.push({
      side: 'top',
      laneX,
      outerY: this.plazaBounds.y - ROAD_WIDTH / 2,
      innerY: this.plazaBounds.y + deliveryStopDepth,
      stripX: laneX - laneW / 2,
      stripY: this.plazaBounds.y - ROAD_WIDTH,
      stripW: laneW,
      stripH: ROAD_WIDTH + deliveryStopDepth,
    });
    this.deliveryLanes.push({
      side: 'bottom',
      laneX,
      outerY: this.plazaBounds.y + this.plazaBounds.h + ROAD_WIDTH / 2,
      innerY: this.plazaBounds.y + this.plazaBounds.h - deliveryStopDepth,
      stripX: laneX - laneW / 2,
      stripY: this.plazaBounds.y + this.plazaBounds.h - deliveryStopDepth,
      stripW: laneW,
      stripH: ROAD_WIDTH + deliveryStopDepth,
    });

    // Generate roads, sidewalks, buildings, trees, lights, venues
    this.generateRoads(offsetX, offsetY, cellSize);
    this.generateBlocks(offsetX, offsetY, cellSize);
    this.generateVenues(offsetX, offsetY, cellSize, validPlazaCols, validPlazaRows);
    this.generatePlazaFurniture();
    this.generateStreetLights(offsetX, offsetY, cellSize);
  }

  private clipRoadAroundPlaza(road: RoadSegment): RoadSegment[] {
    const pb = this.plazaBounds;
    if (road.horizontal) {
      // Check vertical overlap
      if (road.y + road.h <= pb.y || road.y >= pb.y + pb.h) return [road];
      const segments: RoadSegment[] = [];
      // Left portion
      if (road.x < pb.x) {
        segments.push({ x: road.x, y: road.y, w: pb.x - road.x, h: road.h, horizontal: true });
      }
      // Right portion
      const roadRight = road.x + road.w;
      const plazaRight = pb.x + pb.w;
      if (roadRight > plazaRight) {
        segments.push({ x: plazaRight, y: road.y, w: roadRight - plazaRight, h: road.h, horizontal: true });
      }
      return segments;
    } else {
      // Check horizontal overlap
      if (road.x + road.w <= pb.x || road.x >= pb.x + pb.w) return [road];
      const segments: RoadSegment[] = [];
      // Top portion
      if (road.y < pb.y) {
        segments.push({ x: road.x, y: road.y, w: road.w, h: pb.y - road.y, horizontal: false });
      }
      // Bottom portion
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

      // Sidewalks along horizontal roads
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

      // Sidewalks along vertical roads
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

      // If the road was clipped (overlaps plaza), record entrances
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
        // Skip inside the plaza
        if (ix > pb.x && ix < pb.x + pb.w && iy > pb.y && iy < pb.y + pb.h) continue;
        this.walkableRects.push({
          x: ix - ROAD_WIDTH / 2 - 4, y: iy - ROAD_WIDTH / 2 - 4,
          w: ROAD_WIDTH + 8, h: ROAD_WIDTH + 8, type: 'crosswalk',
        });
        // Check which directions have roads at this intersection
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
            // Only trees near edges, not center
            const cx = bx + blockW / 2;
            const cy = by + blockH / 2;
            const distFromCenter = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
            if (distFromCenter > blockW * 0.35) {
              this.trees.push({ x: tx, y: ty, radius: 8 + seededRandom(seed + 100) * 5, seed });
            }
          }
          continue;
        }

        // Generate 1-4 buildings per block
        const numBuildings = 1 + Math.floor(seededRandom(c * 37 + r * 73) * 3);
        const margin = 4;

        if (numBuildings === 1) {
          this.buildings.push({
            x: bx + margin, y: by + margin,
            w: blockW - margin * 2, h: blockH - margin * 2,
            color: BUILDING_COLORS[buildingIdx % BUILDING_COLORS.length],
            windowSeed: buildingIdx * 17,
          });
          buildingIdx++;
        } else {
          // Split block into sub-buildings
          const splitH = seededRandom(c * 53 + r * 91) > 0.5;
          if (splitH) {
            const split = 0.35 + seededRandom(c * 41 + r * 67) * 0.3;
            const h1 = Math.floor((blockH - margin * 3) * split);
            const h2 = blockH - margin * 3 - h1;
            this.buildings.push({
              x: bx + margin, y: by + margin, w: blockW - margin * 2, h: h1,
              color: BUILDING_COLORS[buildingIdx % BUILDING_COLORS.length], windowSeed: buildingIdx * 17,
            });
            buildingIdx++;
            this.buildings.push({
              x: bx + margin, y: by + margin * 2 + h1, w: blockW - margin * 2, h: h2,
              color: BUILDING_COLORS[(buildingIdx) % BUILDING_COLORS.length], windowSeed: buildingIdx * 17,
            });
            buildingIdx++;
          } else {
            const split = 0.35 + seededRandom(c * 41 + r * 67) * 0.3;
            const w1 = Math.floor((blockW - margin * 3) * split);
            const w2 = blockW - margin * 3 - w1;
            this.buildings.push({
              x: bx + margin, y: by + margin, w: w1, h: blockH - margin * 2,
              color: BUILDING_COLORS[buildingIdx % BUILDING_COLORS.length], windowSeed: buildingIdx * 17,
            });
            buildingIdx++;
            this.buildings.push({
              x: bx + margin * 2 + w1, y: by + margin, w: w2, h: blockH - margin * 2,
              color: BUILDING_COLORS[(buildingIdx) % BUILDING_COLORS.length], windowSeed: buildingIdx * 17,
            });
            buildingIdx++;
          }
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

  private generateStreetLights(offsetX: number, offsetY: number, cellSize: number) {
    for (let r = 0; r <= this.gridRows; r++) {
      for (let c = 0; c <= this.gridCols; c++) {
        const ix = offsetX + c * cellSize;
        const iy = offsetY + r * cellSize;
        // Place lights at corners of intersections
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
    const innerMargin = 80; // keep lamps/benches away from venue edges

    // Plaza lamps — evenly spaced in the interior area
    const lampAreaW = pb.w - innerMargin * 2;
    const lampAreaH = pb.h - innerMargin * 2;
    const lampCols = Math.max(2, Math.floor(lampAreaW / 120));
    const lampRows = Math.max(2, Math.floor(lampAreaH / 100));
    for (let r = 0; r < lampRows; r++) {
      for (let c = 0; c < lampCols; c++) {
        const lx = pb.x + innerMargin + (c + 0.5) * (lampAreaW / lampCols);
        const ly = pb.y + innerMargin + (r + 0.5) * (lampAreaH / lampRows);
        // Avoid placing too close to center (where clock pedestrians gather)
        const dx = lx - cx;
        const dy = ly - cy;
        if (Math.abs(dx) < 40 && Math.abs(dy) < 30) continue;
        this.plazaLamps.push({ x: lx, y: ly });
      }
    }

    // Plaza benches — placed near lamps, facing inward
    for (const lamp of this.plazaLamps) {
      const dx = lamp.x - cx;
      const dy = lamp.y - cy;
      // Place bench offset from lamp
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
    const edgeInset = 6;   // how far from the plaza edge the building sits
    const seatingGap = 8;  // gap between building and seating

    const topLane = this.deliveryLanes[0];
    const botLane = this.deliveryLanes[1];
    const laneGap = ROAD_WIDTH + 10; // clearance around lane centre

    // Top edge — buildings sit against top of plaza, face inward
    for (let x = pb.x + 25; x < pb.x + pb.w - venueW; x += venueW + 25) {
      // Leave gap for delivery lane
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

    // Bottom edge — buildings sit against bottom of plaza, face inward
    for (let x = pb.x + 45; x < pb.x + pb.w - venueW; x += venueW + 30) {
      // Leave gap for delivery lane
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

    // Left edge — buildings sit against left of plaza, face inward
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

    // Right edge — buildings sit against right of plaza, face inward
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

      // Awning (striped canopy extending toward plaza)
      const aw = 14;
      const ar = parseInt(v.awningColor.slice(1, 3), 16);
      const ag = parseInt(v.awningColor.slice(3, 5), 16);
      const ab = parseInt(v.awningColor.slice(5, 7), 16);
      const awningDark = 1 - nightAlpha * 0.3;
      const awCol = `rgb(${Math.floor(ar * awningDark)}, ${Math.floor(ag * awningDark)}, ${Math.floor(ab * awningDark)})`;
      const awCol2 = `rgb(${Math.floor(ar * awningDark * 0.85)}, ${Math.floor(ag * awningDark * 0.85)}, ${Math.floor(ab * awningDark * 0.85)})`;

      if (v.facingPlaza === 'bottom') {
        // Awning extends down
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

      // Venue name label
      ctx.fillStyle = `rgba(255,255,255,${0.8 - nightAlpha * 0.3})`;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.name, v.x + v.w / 2, v.y + v.h / 2);

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

      // Outdoor seating — round tables with bistro chairs
      for (const seat of v.seatingPositions) {
        const hasParasol = seededRandom(seat.x * 7 + seat.y * 13) > 0.4;

        // Parasol shadow (drawn first, beneath everything)
        if (hasParasol) {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.08 - nightAlpha * 0.03})`;
          ctx.beginPath();
          ctx.ellipse(seat.x + 1.5, seat.y + 1.5, 8, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Two chairs (rounded rectangles beside table)
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

        // Table (round, wooden)
        ctx.fillStyle = `rgba(140, 100, 65, ${0.85 - nightAlpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(seat.x, seat.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(100, 70, 40, ${0.4 - nightAlpha * 0.15})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();

        // Parasol canopy on top
        if (hasParasol) {
          const umColor = seededRandom(seat.x * 3 + seat.y * 11) > 0.5 ? '#c44569' : '#e8a84c';
          const ur = parseInt(umColor.slice(1, 3), 16);
          const ug = parseInt(umColor.slice(3, 5), 16);
          const ub = parseInt(umColor.slice(5, 7), 16);
          const pDark = 1 - nightAlpha * 0.3;
          // Scalloped edge parasol
          ctx.fillStyle = `rgba(${Math.floor(ur * pDark)}, ${Math.floor(ug * pDark)}, ${Math.floor(ub * pDark)}, 0.7)`;
          ctx.beginPath();
          ctx.arc(seat.x, seat.y, 7.5, 0, Math.PI * 2);
          ctx.fill();
          // Center pole dot
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
    // Dashed centre lines
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

    // Lane markings (dashed center lines)
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
        // Draw zebra stripes
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
        const winSize = 4;
        const winGap = 8;
        const winAlpha = nightAlpha * 1.2;
        for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += winGap) {
          for (let wy = b.y + 6; wy < b.y + b.h - 6; wy += winGap) {
            const isLit = seededRandom(b.windowSeed + wx * 7 + wy * 13) > 0.4;
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

  drawTrees(ctx: CanvasRenderingContext2D, time: number, nightAlpha: number) {
    for (const t of this.trees) {
      const sway = Math.sin(time * 0.5 + t.seed) * 1.5;
      const green = Math.max(0, 120 - nightAlpha * 60);
      const lightness = 35 - nightAlpha * 15;

      // Shadow
      ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + nightAlpha * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(t.x + 2, t.y + 2, t.radius, t.radius * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Canopy
      ctx.fillStyle = `hsl(${green}, 50%, ${lightness}%)`;
      ctx.beginPath();
      ctx.arc(t.x + sway, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = `rgba(255, 255, 255, ${0.1 - nightAlpha * 0.05})`;
      ctx.beginPath();
      ctx.arc(t.x + sway - t.radius * 0.2, t.y - t.radius * 0.2, t.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawStreetLights(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    if (nightAlpha < 0.05) return;

    for (const sl of this.streetLights) {
      // Glow
      const grad = ctx.createRadialGradient(sl.x, sl.y, 0, sl.x, sl.y, 60);
      grad.addColorStop(0, `rgba(255, 210, 120, ${nightAlpha * 0.35})`);
      grad.addColorStop(0.5, `rgba(255, 200, 100, ${nightAlpha * 0.1})`);
      grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sl.x - 60, sl.y - 60, 120, 120);

      // Light pole dot
      ctx.fillStyle = `rgba(255, 240, 180, ${nightAlpha})`;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPlazaBenches(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    const benchL = 18;  // bench length
    const benchW = 5;   // bench depth
    const legH = 2;

    for (const b of this.plazaBenches) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);

      const dark = 1 - nightAlpha * 0.45;
      // Shadow
      ctx.fillStyle = `rgba(0,0,0,${0.12 + nightAlpha * 0.06})`;
      ctx.fillRect(-benchL / 2 + 1.5, -benchW / 2 + 1.5, benchL, benchW);

      // Seat slats (3 planks)
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

      // Backrest (a thin plank set back)
      ctx.fillStyle = `rgba(${Math.floor(140 * dark)}, ${Math.floor(95 * dark)}, ${Math.floor(50 * dark)}, 0.9)`;
      ctx.fillRect(-benchL / 2, -benchW / 2 - 3, benchL, 2.5);

      // Metal legs (two pairs)
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

      // Ground shadow (top-down: shadow falls slightly south-east)
      ctx.fillStyle = `rgba(0,0,0,${0.18 + nightAlpha * 0.04})`;
      ctx.beginPath();
      ctx.ellipse(lamp.x + 2, lamp.y + 2, 4, 3, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Base disc (the base plate of the post)
      ctx.fillStyle = `rgba(${Math.floor(75 * dark)}, ${Math.floor(75 * dark)}, ${Math.floor(85 * dark)}, 1)`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Lamp head (the housing — top-down circle, slightly larger)
      const lampLit = nightAlpha > 0.1;
      ctx.fillStyle = lampLit
        ? `rgba(255, 245, 190, ${0.6 + nightAlpha * 0.4})`
        : `rgba(210, 215, 225, 0.95)`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Rim ring
      ctx.strokeStyle = `rgba(${Math.floor(60 * dark)}, ${Math.floor(60 * dark)}, ${Math.floor(70 * dark)}, 0.9)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4.5, 0, Math.PI * 2);
      ctx.stroke();

      // Centre dot (the bulb or lens)
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
      // Determine signal colors for horizontal and vertical roads
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

      // Draw dots at intersection corners — one per corner
      const corners = [
        { x: inter.x - hw + 2, y: inter.y - hw + 2, dir: 'h' }, // top-left → horizontal
        { x: inter.x + hw - 2, y: inter.y - hw + 2, dir: 'v' }, // top-right → vertical
        { x: inter.x - hw + 2, y: inter.y + hw - 2, dir: 'v' }, // bottom-left → vertical
        { x: inter.x + hw - 2, y: inter.y + hw - 2, dir: 'h' }, // bottom-right → horizontal
      ];

      for (const corner of corners) {
        const signal = corner.dir === 'h' ? hColor : vColor;
        const alpha = 0.7;

        // Night glow
        if (nightAlpha > 0.1) {
          const glowR = 5;
          const grad = ctx.createRadialGradient(corner.x, corner.y, 0, corner.x, corner.y, glowR);
          grad.addColorStop(0, colorToRgba(signal, nightAlpha * 0.4));
          grad.addColorStop(1, colorToRgba(signal, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(corner.x - glowR, corner.y - glowR, glowR * 2, glowR * 2);
        }

        // Dot
        ctx.fillStyle = colorToRgba(signal, alpha);
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  getRandomWalkablePosition(seed: number): { x: number; y: number } {
    // Pick a random walkable rect weighted by area
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

  isInBuilding(x: number, y: number, margin = 4): boolean {
    for (const b of this.buildings) {
      if (x >= b.x - margin && x <= b.x + b.w + margin &&
          y >= b.y - margin && y <= b.y + b.h + margin) return true;
    }
    for (const v of this.venues) {
      if (x >= v.x - margin && x <= v.x + v.w + margin &&
          y >= v.y - margin && y <= v.y + v.h + margin) return true;
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
