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

  // Stable assignments to prevent frame-to-frame position jitter
  private assignments: Map<Pedestrian, { x: number; y: number }> = new Map();

  /** Force the clock to show immediately for CLOCK_ACTIVE_SECONDS */
  triggerForceShow() {
    this.forceShowUntil = Date.now() + CLOCK_ACTIVE_SECONDS * 1000;
    this.dismissCache.clear();
  }

  update(pedestrians: Pedestrian[], plazaCenterX: number, plazaCenterY: number, plazaBounds: { x: number; y: number; w: number; h: number }) {
    const d = new Date();
    const currentMinute = d.getMinutes();

    // Clear assignments on minute change to refresh the layout
    if (currentMinute !== this.lastMinute) {
      this.dismissCache.clear();
      this.assignments.clear();
      this.lastMinute = currentMinute;
      for (const p of pedestrians) p.clockTarget = null;
    }

    // Identify pool of available/healthy participants
    const healthy = pedestrians.filter(p => {
      if (p.clockTarget) return p.hunger > 8 && p.energy > 8;
      return p.isClockEligible && p.hunger > 14 && p.energy > 14;
    });

    // Determine current digit layout
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const timeStr = hours + minutes;

    const digitSpacing = 55;
    const digitW = 40;
    const digitH = 70;
    const startX = plazaCenterX - (digitSpacing * 2.1);
    const startY = plazaCenterY - digitH / 2;

    const allTargets: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const digit = parseInt(timeStr[i]);
      const dx = startX + i * digitSpacing + (i >= 2 ? 15 : 0);
      const dy = startY;

      const layout = DIGITS[digit];
      const segments = [
        { x: dx, y: dy, w: digitW, h: 4 }, // top
        { x: dx + digitW - 4, y: dy, w: 4, h: digitH / 2 }, // top-right
        { x: dx + digitW - 4, y: dy + digitH / 2, w: 4, h: digitH / 2 }, // bot-right
        { x: dx, y: dy + digitH - 4, w: digitW, h: 4 }, // bottom
        { x: dx, y: dy + digitH / 2, w: 4, h: digitH / 2 }, // bot-left
        { x: dx, y: dy, w: 4, h: digitH / 2 }, // top-left
        { x: dx, y: dy + digitH / 2 - 2, w: digitW, h: 4 }, // middle
      ];

      segments.forEach((seg, segIdx) => {
        if (layout[segIdx]) {
          const count = PEDS_PER_SEGMENT;
          for (let pIdx = 0; pIdx < count; pIdx++) {
            const step = 1 / (count + 1);
            if (seg.w > seg.h) {
              allTargets.push({ x: seg.x + (pIdx + 1) * seg.w * step, y: seg.y + seg.h / 2 });
            } else {
              allTargets.push({ x: seg.x + seg.w / 2, y: seg.y + (pIdx + 1) * seg.h * step });
            }
          }
        }
      });
    }

    // Update stable assignments
    // 1. Remove pedestrians who are no longer healthy or present
    for (const [p, target] of this.assignments.entries()) {
      if (!healthy.includes(p)) {
        this.assignments.delete(p);
      }
    }

    // 2. Clear current targets (will be re-set from assignments map)
    for (const p of pedestrians) {
      p.clockTarget = null;
    }

    // 3. Re-apply existing assignments that still match current digit segments
    const occupiedTargets = new Set<string>();
    for (const [p, target] of this.assignments.entries()) {
      const stillValid = allTargets.find(t => t.x === target.x && t.y === target.y);
      if (stillValid) {
        p.clockTarget = { x: target.x, y: target.y, angle: 0 };
        occupiedTargets.add(`${target.x},${target.y}`);
      } else {
        this.assignments.delete(p);
      }
    }

    // 4. Fill remaining targets with new volunteers
    const freePeds = healthy.filter(p => !p.clockTarget);
    const unassignedTargets = allTargets.filter(t => !occupiedTargets.has(`${t.x},${t.y}`));

    let pedIdx = 0;
    for (const t of unassignedTargets) {
      if (pedIdx < freePeds.length) {
        const p = freePeds[pedIdx++];
        p.clockTarget = { x: t.x, y: t.y, angle: 0 };
        this.assignments.set(p, t);
      }
    }

    // Dismiss unassigned pedestrians to stable positions
    for (const p of pedestrians) {
      if (p.isClockEligible && !p.clockTarget) {
        // Direct bounds check instead of missing isInPlaza property
        const pb = plazaBounds;
        const isInPlaza = p.x >= pb.x && p.x <= pb.x + pb.w && p.y >= pb.y && p.y <= pb.y + pb.h;

        if (isInPlaza) {
          let dismissTarget = this.dismissCache.get(p.idOffset);
          if (!dismissTarget) {
            const angle = stableRandom(p.idOffset) * Math.PI * 2;
            const dist = 140 + stableRandom(p.idOffset + 1) * 80;
            dismissTarget = {
              x: plazaCenterX + Math.cos(angle) * dist,
              y: plazaCenterY + Math.sin(angle) * dist
            };
            this.dismissCache.set(p.idOffset, dismissTarget);
          }
          p.waypointX = dismissTarget.x;
          p.waypointY = dismissTarget.y;
        }
      }
    }
  }
}
