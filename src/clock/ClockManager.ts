import { CLOCK_ACTIVE_SECONDS, PEDS_PER_SEGMENT } from '../utils/constants';
import type { Pedestrian } from '../entities/Pedestrian';

const DIGITS = [
  [1, 1, 1, 1, 1, 1, 0], // 0
  [0, 1, 1, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1], // 2
  [1, 1, 1, 1, 0, 0, 1], // 3
  [0, 1, 1, 0, 0, 1, 1], // 4
  [1, 0, 1, 1, 0, 1, 1], // 5
  [1, 0, 1, 1, 1, 1, 1], // 6
  [1, 1, 1, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1], // 8
  [1, 1, 1, 1, 0, 1, 1], // 9
];

// Simple deterministic hash for stable dismiss positions
function stableRandom(seed: number): number {
  let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class ClockManager {
  // Cache dismiss targets so they don't change every frame
  private dismissCache: Map<number, { x: number; y: number }> = new Map();
  private lastMinute: number = -1;

  // Force-show: triggered by double-tap, holds clock active for CLOCK_ACTIVE_SECONDS
  private forceShowUntil: number = 0;

  /** Force the clock to show immediately for CLOCK_ACTIVE_SECONDS */
  triggerForceShow() {
    this.forceShowUntil = Date.now() + CLOCK_ACTIVE_SECONDS * 1000;
    this.dismissCache.clear();
  }

  update(pedestrians: Pedestrian[], plazaCenterX: number, plazaCenterY: number, plazaBounds: { x: number; y: number; w: number; h: number }) {
    const d = new Date();
    const seconds = d.getSeconds();
    const currentMinute = d.getMinutes();
    const isClockTime = seconds < CLOCK_ACTIVE_SECONDS || Date.now() < this.forceShowUntil;

    const eligible = pedestrians.filter(p => p.isClockEligible);
    const pedsPerSeg = PEDS_PER_SEGMENT;

    // Clear dismiss cache on minute change so positions refresh each cycle
    if (currentMinute !== this.lastMinute) {
      this.dismissCache.clear();
      this.lastMinute = currentMinute;
    }

    if (isClockTime && eligible.length >= 28 * pedsPerSeg) {
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const timeStr = hours + minutes;

      const pb = plazaBounds;

      // === Scale digits to fit the plaza ===
      // Leave ~25% on each side for venues/seating/dismissed peds
      const usableW = pb.w * 0.55;
      const usableH = pb.h * 0.45;

      // Compute digit dimensions from available space
      // Layout: [digit][spacing][digit][groupSpacing][digit][spacing][digit]
      // Total = 4*w + 2*spacing + groupSpacing
      // Ratios based on ideal proportions (80:35:60 → w:spacing:group)
      const w = usableW / (4 + 2 * 0.44 + 0.75); // spacing=0.44w, group=0.75w
      const h = Math.min(usableH, w * 1.6);       // keep aspect ~1:1.6
      const spacing = w * 0.44;
      const groupSpacing = w * 0.75;

      const totalWidth = 4 * w + 2 * spacing + groupSpacing;
      const startX = plazaCenterX - totalWidth / 2;
      const startY = plazaCenterY - h / 2;

      const margin = 30;

      let idx = 0;

      for (let i = 0; i < 4; i++) {
        const digitVal = parseInt(timeStr[i]);
        const segments = DIGITS[digitVal];

        const dx = startX + i * (w + spacing) + (i >= 2 ? groupSpacing - spacing : 0);
        const dy = startY;

        const segDefs = [
          { cx: dx + w / 2, cy: dy,         horizontal: true  }, // A
          { cx: dx + w,     cy: dy + h / 4, horizontal: false }, // B
          { cx: dx + w,     cy: dy + 3*h/4, horizontal: false }, // C
          { cx: dx + w / 2, cy: dy + h,     horizontal: true  }, // D
          { cx: dx,         cy: dy + 3*h/4, horizontal: false }, // E
          { cx: dx,         cy: dy + h / 4, horizontal: false }, // F
          { cx: dx + w / 2, cy: dy + h / 2, horizontal: true  }, // G
        ];

        for (let j = 0; j < 7; j++) {
          const seg = segDefs[j];
          const spread = seg.horizontal ? w * 0.35 : h * 0.18;

          for (let k = 0; k < pedsPerSeg; k++) {
            if (idx < eligible.length) {
              if (segments[j]) {
                const t = pedsPerSeg <= 1 ? 0 : (k / (pedsPerSeg - 1) - 0.5) * 2;
                const offsetX = seg.horizontal ? t * spread : 0;
                const offsetY = seg.horizontal ? 0 : t * spread;
                eligible[idx].clockTarget = {
                  x: seg.cx + offsetX,
                  y: seg.cy + offsetY,
                  angle: seg.horizontal ? 0 : Math.PI / 2,
                };
                eligible[idx].clockDismissTarget = null;
              } else {
                // Inactive segment — dismiss with stable position
                eligible[idx].clockTarget = null;
                if (!this.dismissCache.has(idx)) {
                  // Spread evenly around all 4 edges of the plaza
                  const edge = idx % 4;
                  const r1 = stableRandom(idx * 17 + 3);
                  let tx: number, ty: number;
                  if (edge === 0) { // top
                    tx = pb.x + margin + r1 * (pb.w - margin * 2);
                    ty = pb.y + margin * 0.5;
                  } else if (edge === 1) { // bottom
                    tx = pb.x + margin + r1 * (pb.w - margin * 2);
                    ty = pb.y + pb.h - margin * 0.5;
                  } else if (edge === 2) { // left
                    tx = pb.x + margin * 0.5;
                    ty = pb.y + margin + r1 * (pb.h - margin * 2);
                  } else { // right
                    tx = pb.x + pb.w - margin * 0.5;
                    ty = pb.y + margin + r1 * (pb.h - margin * 2);
                  }
                  this.dismissCache.set(idx, { x: tx, y: ty });
                }
                eligible[idx].clockDismissTarget = this.dismissCache.get(idx)!;
              }
              idx++;
            }
          }
        }
      }

      // Remaining eligible pedestrians also get dismissed
      for (; idx < eligible.length; idx++) {
        eligible[idx].clockTarget = null;
        if (!this.dismissCache.has(idx)) {
          const r1 = stableRandom(idx * 23 + 7);
          const edge = idx % 4;
          let tx: number, ty: number;
          if (edge === 0) {
            tx = pb.x + margin + r1 * (pb.w - margin * 2);
            ty = pb.y + margin * 0.5;
          } else if (edge === 1) {
            tx = pb.x + margin + r1 * (pb.w - margin * 2);
            ty = pb.y + pb.h - margin * 0.5;
          } else if (edge === 2) {
            tx = pb.x + margin * 0.5;
            ty = pb.y + margin + r1 * (pb.h - margin * 2);
          } else {
            tx = pb.x + pb.w - margin * 0.5;
            ty = pb.y + margin + r1 * (pb.h - margin * 2);
          }
          this.dismissCache.set(idx, { x: tx, y: ty });
        }
        eligible[idx].clockDismissTarget = this.dismissCache.get(idx)!;
      }
    } else {
      // Clear all targets
      for (const p of eligible) {
        p.clockTarget = null;
        p.clockDismissTarget = null;
      }
    }
  }
}
