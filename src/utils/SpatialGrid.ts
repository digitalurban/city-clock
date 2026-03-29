/**
 * Fixed-cell spatial hash grid for O(1) proximity queries.
 * Built once per frame in O(n), replaces O(n²) brute-force scans.
 *
 * GC-friendly: clear() resets array lengths without deleting them —
 * no Map entry deletion, no per-frame heap allocation after the first frame.
 *
 * Usage:
 *   const grid = new SpatialGrid<Pedestrian>(cellSize, worldWidth);
 *   // each frame:
 *   grid.clear();
 *   for (const p of pedestrians) grid.add(p);
 *   grid.query(x, y, radius, item => { ... });  // zero allocation
 */
export class SpatialGrid<T extends { x: number; y: number }> {
  private readonly cells = new Map<number, T[]>();
  /** Keys of cells that have at least one item this frame — used by clear() */
  private readonly usedKeys: number[] = [];
  private readonly cols: number;

  constructor(
    public readonly cellSize: number,
    worldWidth: number,
  ) {
    this.cols = Math.ceil(worldWidth / cellSize) + 2;
  }

  /**
   * Reset all populated cells without deleting Map entries or arrays.
   * After the first few frames every needed array is already allocated;
   * subsequent clear() calls do zero heap work (no GC pressure).
   */
  clear(): void {
    for (const key of this.usedKeys) {
      // biome-ignore: intentional direct mutation
      const cell = this.cells.get(key);
      if (cell) cell.length = 0;
    }
    this.usedKeys.length = 0;
  }

  /** Insert an item into its grid cell. */
  add(item: T): void {
    const key = this.cellKey(
      Math.floor(item.x / this.cellSize),
      Math.floor(item.y / this.cellSize),
    );
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    if (cell.length === 0) this.usedKeys.push(key); // first item this frame → mark used
    cell.push(item);
  }

  /**
   * Iterate every item whose cell overlaps the bounding box of (x±radius, y±radius).
   * Calls `cb` for each candidate — caller must do its own exact distance check.
   * Zero heap allocation per call.
   */
  query(x: number, y: number, radius: number, cb: (item: T) => void): void {
    const cs = this.cellSize;
    const cx0 = Math.floor((x - radius) / cs);
    const cy0 = Math.floor((y - radius) / cs);
    const cx1 = Math.floor((x + radius) / cs);
    const cy1 = Math.floor((y + radius) / cs);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = this.cells.get(this.cellKey(cx, cy));
        if (!cell || cell.length === 0) continue;
        for (const item of cell) cb(item);
      }
    }
  }

  private cellKey(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }
}
