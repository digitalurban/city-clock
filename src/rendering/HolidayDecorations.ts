/**
 * HolidayDecorations.ts
 *
 * Seasonal / event-driven decorations drawn over the central plaza.
 * All drawing is in world space; call after the static canvas but before pedestrians.
 *
 * Active events (in priority order):
 *   New Year   — Dec 31 & Jan 1          — gold/silver confetti + bunting
 *   Christmas  — Dec 1 – Jan 6           — tree, fairy lights, red/green bunting
 *   Halloween  — Oct 25 – 31             — jack-o'-lanterns, orange/black bunting
 *   Bonfire    — Nov 4 – 6               — animated bonfire with sparks
 *   Valentine  — Feb 13 – 15             — hearts on lamps, pink bunting
 *   St Patrick — Mar 16 – 18             — shamrocks, green/orange bunting
 *   Easter     — Palm Sunday – Easter Mon — pastel eggs, pastel bunting
 *   May Day    — first Mon in May ±1 day  — maypole + colourful bunting
 *   Solstice   — Jun 20 – 22             — flower garlands, sun rays, gold bunting
 *   Weekend    — every Sat & Sun          — rainbow bunting
 */

import type { CityLayout } from '../city/CityLayout';

export type Holiday =
  | 'christmas' | 'newyear' | 'valentine' | 'stpatricks'
  | 'easter' | 'mayday' | 'solstice' | 'halloween' | 'bonfire' | 'weekend';

// ── Easter calculation (Anonymous Gregorian algorithm) ────────────────────────
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function firstMondayOf(year: number, month: number): number {
  const d = new Date(year, month - 1, 1);
  return 1 + ((8 - d.getDay()) % 7);
}

export function getActiveHoliday(): Holiday | null {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth() + 1; // 1-12
  const d   = now.getDate();
  const dow = now.getDay();        // 0=Sun, 6=Sat

  // New Year (highest priority so it overrides Christmas on Dec 31/Jan 1)
  if ((m === 12 && d === 31) || (m === 1 && d === 1)) return 'newyear';

  // Christmas: Dec 1–30 and Jan 2–6
  if (m === 12 || (m === 1 && d <= 6)) return 'christmas';

  // Halloween: Oct 25–31
  if (m === 10 && d >= 25) return 'halloween';

  // Bonfire Night: Nov 4–6
  if (m === 11 && d >= 4 && d <= 6) return 'bonfire';

  // Valentine's Day: Feb 13–15
  if (m === 2 && d >= 13 && d <= 15) return 'valentine';

  // St Patrick's Day: Mar 16–18
  if (m === 3 && d >= 16 && d <= 18) return 'stpatricks';

  // Easter: Palm Sunday (Easter - 7) through Easter Monday (+1)
  const easter = easterSunday(y);
  const palmSunday   = new Date(easter); palmSunday.setDate(palmSunday.getDate() - 7);
  const easterMonday = new Date(easter); easterMonday.setDate(easterMonday.getDate() + 1);
  const today = new Date(y, m - 1, d);
  if (today >= palmSunday && today <= easterMonday) return 'easter';

  // May Day: first Monday in May ±1 day
  if (m === 5) {
    const fm = firstMondayOf(y, 5);
    if (d >= fm - 1 && d <= fm + 1) return 'mayday';
  }

  // Summer Solstice: Jun 20–22
  if (m === 6 && d >= 20 && d <= 22) return 'solstice';

  // Weekend bunting every Saturday and Sunday
  if (dow === 0 || dow === 6) return 'weekend';

  return null;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function d(v: number, nightAlpha: number, factor = 0.5): number {
  return Math.floor(v * (1 - nightAlpha * factor));
}

/** Sort lamp posts clockwise around the plaza centre so bunting follows the perimeter. */
function sortedLamps(layout: CityLayout): { x: number; y: number }[] {
  const pb = layout.plazaBounds;
  const cx = pb.x + pb.w / 2;
  const cy = pb.y + pb.h / 2;
  return [...layout.plazaLamps].sort((a, b) =>
    Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

/**
 * Draw bunting triangles along the line segments connecting pts[].
 * pts should be sorted perimeter-wise for a clean circuit.
 */
function drawBunting(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  colors: string[],
  nightAlpha: number,
  flagSize = 5.5,
  spacing  = 16,
) {
  if (pts.length < 2) return;
  const alpha = 0.82 - nightAlpha * 0.25;

  for (let i = 0; i < pts.length; i++) {
    const ax = pts[i].x, ay = pts[i].y;
    const bx = pts[(i + 1) % pts.length].x;
    const by = pts[(i + 1) % pts.length].y;
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 150) continue; // skip very long spans
    const steps = Math.max(2, Math.floor(len / spacing));

    // String
    ctx.strokeStyle = `rgba(60,60,60,${0.35 - nightAlpha * 0.15})`;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      ctx.lineTo(ax + dx * t, ay + dy * t + Math.sin(t * Math.PI) * 7);
    }
    ctx.stroke();

    // Flags
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const fx = ax + dx * t;
      const fy = ay + dy * t + Math.sin(t * Math.PI) * 7;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colors[s % colors.length];
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - flagSize * 0.55, fy + flagSize);
      ctx.lineTo(fx + flagSize * 0.55, fy + flagSize);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ── Christmas ─────────────────────────────────────────────────────────────────

function drawChristmas(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number, time: number,
) {
  const pb = layout.plazaBounds;

  // Tree sits in the upper-left corner of the plaza, clear of clock digits
  const tx = pb.x + pb.w * 0.06;
  const ty = pb.y + pb.h * 0.30;
  const dark = 1 - nightAlpha * 0.4;

  // Trunk
  ctx.fillStyle = `rgb(${d(101,nightAlpha)},${d(67,nightAlpha)},${d(33,nightAlpha)})`;
  ctx.fillRect(tx - 3, ty + 2, 6, 9);

  // Three tree tiers
  const tiers: { yw: number; yh: number; cy: number }[] = [
    { yw: 10, yh: 7,  cy: ty - 14 },
    { yw: 17, yh: 8,  cy: ty - 8  },
    { yw: 24, yh: 10, cy: ty      },
  ];
  for (const t of tiers) {
    ctx.fillStyle = `rgb(${d(34,nightAlpha,0.3)},${d(139,nightAlpha,0.3)},${d(34,nightAlpha,0.3)})`;
    ctx.beginPath();
    ctx.moveTo(tx, t.cy - t.yh);
    ctx.lineTo(tx - t.yw / 2, t.cy);
    ctx.lineTo(tx + t.yw / 2, t.cy);
    ctx.closePath();
    ctx.fill();
  }

  // Baubles (twinkling)
  const baublePos = [
    { x: tx - 5, y: ty - 5 }, { x: tx + 4, y: ty - 6 },
    { x: tx - 3, y: ty },     { x: tx + 6, y: ty + 1 },
    { x: tx - 7, y: ty + 5 }, { x: tx + 2, y: ty + 6 },
    { x: tx,     y: ty - 12 },
  ];
  const baubleColors = ['#ff3333', '#3399ff', '#ffdd00', '#ff88aa', '#ff9900', '#aa55ff'];
  baublePos.forEach((bp, idx) => {
    const tw = 0.65 + 0.35 * Math.sin(time * 3.5 + idx * 1.8);
    ctx.globalAlpha = tw * (0.9 - nightAlpha * 0.1);
    ctx.fillStyle = baubleColors[idx % baubleColors.length];
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Star on top (5-pointed)
  const sx = tx, sy = ty - 22;
  ctx.fillStyle = `rgb(255,${d(220,nightAlpha,0.2)},50)`;
  ctx.beginPath();
  for (let v = 0; v < 10; v++) {
    const va = (v / 10) * Math.PI * 2 - Math.PI / 2;
    const r = v % 2 === 0 ? 5 : 2.5;
    if (v === 0) ctx.moveTo(sx + Math.cos(va) * r, sy + Math.sin(va) * r);
    else         ctx.lineTo(sx + Math.cos(va) * r, sy + Math.sin(va) * r);
  }
  ctx.closePath();
  ctx.fill();

  // Fairy lights strung between adjacent plaza lamp posts
  const lamps = sortedLamps(layout);
  const lightColors = ['#ff2222', '#22cc22', '#3399ff', '#ffdd00', '#ff88ff', '#00cccc', '#ff8800'];
  for (let i = 0; i < lamps.length; i++) {
    const a = lamps[i], b = lamps[(i + 1) % lamps.length];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist > 130) continue;
    const steps = Math.floor(dist / 9);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const lx = a.x + (b.x - a.x) * t;
      const ly = a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 5;
      const on = Math.sin(time * 4.5 + i * 1.4 + s * 0.8) > 0;
      if (!on) continue;
      ctx.globalAlpha = 0.75 + nightAlpha * 0.25;
      ctx.fillStyle = lightColors[(i + s) % lightColors.length];
      ctx.beginPath();
      ctx.arc(lx, ly, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Red/green bunting
  drawBunting(ctx, lamps, ['#cc0000','#006600','#cc0000','#006600','#ffffff'], nightAlpha);
}

// ── New Year ──────────────────────────────────────────────────────────────────

function drawNewYear(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number, time: number,
) {
  const pb = layout.plazaBounds;
  const colors = ['#ffd700','#ff6b6b','#4ecdc4','#45b7d1','#c0c0c0','#ffeaa7','#fd79a8','#a29bfe'];

  // Spinning confetti pieces (seed-based so they're stable)
  for (let i = 0; i < 45; i++) {
    const sx = pb.x + (Math.abs(Math.sin(i * 13.7)) * pb.w);
    const sy = pb.y + (Math.abs(Math.cos(i * 9.3))  * pb.h);
    const rotation = time * (0.5 + (i % 5) * 0.25) + i;
    const flicker  = 0.55 + 0.45 * Math.sin(time * 3 + i * 0.9);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rotation);
    ctx.globalAlpha = flicker * (1 - nightAlpha * 0.3);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-2.5, -1, 5, 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Gold/silver bunting
  drawBunting(ctx, sortedLamps(layout), ['#ffd700','#c0c0c0','#ffd700','#c0c0c0','#ff8c00'], nightAlpha);
}

// ── Halloween ─────────────────────────────────────────────────────────────────

function drawHalloween(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number, time: number,
) {
  const pb = layout.plazaBounds;

  // Jack-o'-lanterns at plaza corners and mid-edges (not in clock digit area)
  const pumpkins = [
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.12 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.12 },
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.88 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.88 },
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.50 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.50 },
  ];

  for (const pp of pumpkins) {
    // Body
    ctx.fillStyle = `rgb(${d(220,nightAlpha,0.3)},${d(100,nightAlpha,0.3)},${d(20,nightAlpha,0.3)})`;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 7, 0, Math.PI * 2);
    ctx.fill();
    // Ribs
    ctx.strokeStyle = `rgba(${d(170,nightAlpha,0.3)},${d(70,nightAlpha,0.3)},${d(10,nightAlpha,0.3)},0.5)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(pp.x,     pp.y - 7); ctx.lineTo(pp.x,     pp.y + 7);
    ctx.moveTo(pp.x - 4, pp.y - 5); ctx.lineTo(pp.x - 4, pp.y + 5);
    ctx.moveTo(pp.x + 4, pp.y - 5); ctx.lineTo(pp.x + 4, pp.y + 5);
    ctx.stroke();
    // Triangle eyes
    ctx.fillStyle = 'rgba(15,0,0,0.9)';
    ctx.beginPath();
    ctx.moveTo(pp.x - 3.5, pp.y - 1.5);
    ctx.lineTo(pp.x - 2,   pp.y - 3.5);
    ctx.lineTo(pp.x - 0.5, pp.y - 1.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pp.x + 0.5, pp.y - 1.5);
    ctx.lineTo(pp.x + 2,   pp.y - 3.5);
    ctx.lineTo(pp.x + 3.5, pp.y - 1.5);
    ctx.fill();
    // Grin
    ctx.beginPath();
    ctx.arc(pp.x, pp.y + 2.5, 3, 0, Math.PI);
    ctx.fill();
    // Inner candle glow at night
    if (nightAlpha > 0.1) {
      const glow = (0.25 + 0.15 * Math.sin(time * 9 + pp.x)) * nightAlpha;
      ctx.fillStyle = `rgba(255,170,20,${glow})`;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Stalk
    ctx.fillStyle = `rgb(${d(40,nightAlpha)},${d(120,nightAlpha)},${d(40,nightAlpha)})`;
    ctx.fillRect(pp.x - 1, pp.y - 11, 2, 5);
  }

  // Orange/black bunting
  drawBunting(ctx, sortedLamps(layout), ['#cc5500','#111111','#cc5500','#111111','#884400'], nightAlpha);
}

// ── Bonfire Night ─────────────────────────────────────────────────────────────

function drawBonfire(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number, time: number,
) {
  const pb = layout.plazaBounds;
  // Upper-right corner, away from the clock digit area
  const fx = pb.x + pb.w * 0.90;
  const fy = pb.y + pb.h * 0.18;

  // Log pile
  ctx.save();
  ctx.translate(fx, fy + 5);
  ctx.fillStyle = `rgb(${d(90,nightAlpha)},${d(58,nightAlpha)},${d(28,nightAlpha)})`;
  ctx.save(); ctx.rotate(0.4);  ctx.fillRect(-9, -2, 18, 3); ctx.restore();
  ctx.save(); ctx.rotate(-0.4); ctx.fillRect(-9, -2, 18, 3); ctx.restore();
  ctx.restore();

  // Flame layers (back → front: red → orange → yellow)
  const layers = [
    { col: [200, 20, 0],   w: 10, h: 15 },
    { col: [255, 100, 0],  w: 8,  h: 12 },
    { col: [255, 220, 0],  w: 5,  h: 8  },
  ] as const;
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const wb = Math.sin(time * 7  + li * 1.1) * 2.2;
    const wt = Math.cos(time * 5.5 + li * 0.9) * 1.8;
    const df = 1 - nightAlpha * 0.15;
    ctx.fillStyle = `rgba(${Math.floor(L.col[0]*df)},${Math.floor(L.col[1]*df)},${Math.floor(L.col[2]*df)},0.88)`;
    ctx.beginPath();
    ctx.moveTo(fx - L.w / 2 + wb, fy + 3);
    ctx.quadraticCurveTo(fx - L.w / 4 + wt, fy - L.h * 0.5, fx + wb * 0.5, fy - L.h);
    ctx.quadraticCurveTo(fx + L.w / 4 + wb,  fy - L.h * 0.5, fx + L.w / 2 + wt, fy + 3);
    ctx.closePath();
    ctx.fill();
  }

  // Glow pool at night
  if (nightAlpha > 0.05) {
    const gr = 32 + nightAlpha * 14;
    const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, gr);
    grd.addColorStop(0, `rgba(255,110,0,${nightAlpha * 0.45})`);
    grd.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(fx - gr, fy - gr, gr * 2, gr * 2);
  }

  // Rising sparks
  for (let s = 0; s < 7; s++) {
    const phase = ((time * 1.6 + s * 0.55) % 1);
    const sx = fx + Math.sin(time * 3.2 + s * 1.3) * 6;
    const sy = fy - 4 - phase * 28;
    if (phase < 0.05) continue;
    ctx.globalAlpha = (1 - phase) * 0.85;
    ctx.fillStyle = `rgb(255,${Math.floor(130 + 90 * (1 - phase))},0)`;
    ctx.beginPath();
    ctx.arc(sx, sy, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Orange/yellow bunting
  drawBunting(ctx, sortedLamps(layout), ['#ff6600','#cc3300','#ffcc00','#cc3300','#ff6600'], nightAlpha);
}

// ── Valentine's Day ───────────────────────────────────────────────────────────

function drawValentine(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number, time: number,
) {
  const pb = layout.plazaBounds;

  function heart(x: number, y: number, size: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.bezierCurveTo(x, y - size * 0.3, x - size, y - size * 0.3, x - size, y + size * 0.3);
    ctx.bezierCurveTo(x - size, y + size * 0.9, x, y + size * 1.4, x, y + size * 1.4);
    ctx.bezierCurveTo(x, y + size * 1.4, x + size, y + size * 0.9, x + size, y + size * 0.3);
    ctx.bezierCurveTo(x + size, y - size * 0.3, x, y - size * 0.3, x, y + size * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // Hearts on lamp posts
  for (const lamp of layout.plazaLamps) {
    const pulse = 0.8 + 0.2 * Math.sin(time * 2.2 + lamp.x * 0.05);
    ctx.globalAlpha = (0.72 - nightAlpha * 0.2) * pulse;
    heart(
      lamp.x, lamp.y - 13,
      3.5 * pulse,
      `rgb(${d(210,nightAlpha,0.3)},${d(20,nightAlpha,0.3)},${d(55,nightAlpha,0.3)})`,
    );
  }

  // Larger drifting hearts around the plaza edges
  const pos = [
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.30 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.30 },
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.70 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.70 },
    { x: pb.x + pb.w * 0.30, y: pb.y + pb.h * 0.08 },
    { x: pb.x + pb.w * 0.70, y: pb.y + pb.h * 0.92 },
  ];
  for (const hp of pos) {
    const drift = Math.sin(time * 1.4 + hp.x * 0.03) * 2;
    ctx.globalAlpha = 0.7 - nightAlpha * 0.25;
    heart(
      hp.x + drift, hp.y,
      5.5,
      `rgb(${d(255,nightAlpha,0.2)},${d(105,nightAlpha,0.2)},${d(180,nightAlpha,0.2)})`,
    );
  }
  ctx.globalAlpha = 1;

  drawBunting(ctx, sortedLamps(layout), ['#ff1493','#ff69b4','#dc143c','#ffb6c1','#ff1493'], nightAlpha);
}

// ── St Patrick's Day ──────────────────────────────────────────────────────────

function drawStPatricks(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number,
) {
  // Shamrock on each lamp post
  for (const lamp of layout.plazaLamps) {
    const lx = lamp.x, ly = lamp.y - 11;
    const g = `rgb(${d(0,nightAlpha)},${d(154,nightAlpha)},${d(68,nightAlpha)})`;
    ctx.fillStyle = g;
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(lx + Math.cos(a) * 3, ly + Math.sin(a) * 3, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = g;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(lx, ly + 3.5);
    ctx.lineTo(lx, ly + 9);
    ctx.stroke();
  }

  // Irish tricolour bunting
  drawBunting(ctx, sortedLamps(layout), ['#009a44','#ffffff','#ff7900','#ffffff','#009a44'], nightAlpha);
}

// ── Easter ────────────────────────────────────────────────────────────────────

function drawEaster(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number,
) {
  const pb = layout.plazaBounds;

  // Easter eggs — placed along the plaza perimeter, away from clock digits
  const eggs = [
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.20 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.22 },
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.78 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.78 },
    { x: pb.x + pb.w * 0.22, y: pb.y + pb.h * 0.08 },
    { x: pb.x + pb.w * 0.78, y: pb.y + pb.h * 0.08 },
    { x: pb.x + pb.w * 0.22, y: pb.y + pb.h * 0.92 },
    { x: pb.x + pb.w * 0.78, y: pb.y + pb.h * 0.92 },
    { x: pb.x + pb.w * 0.06, y: pb.y + pb.h * 0.50 },
    { x: pb.x + pb.w * 0.94, y: pb.y + pb.h * 0.50 },
  ];

  const bases:   [number, number, number][] = [
    [255,182,193],[255,253,150],[173,216,230],[144,238,144],
    [255,200,150],[221,160,221],[175,238,238],[255,228,196],
    [250,218,221],[204,229,255],
  ];
  const stripes: [number, number, number][] = [
    [220,100,120],[200,180,0],[70,130,180],[60,160,60],
    [200,100,50],[150,80,180],[60,160,160],[180,140,80],
    [180,80,100],[100,130,200],
  ];

  eggs.forEach((ep, idx) => {
    const base   = bases[idx % bases.length];
    const stripe = stripes[idx % stripes.length];
    // Egg body
    ctx.fillStyle = `rgb(${d(base[0],nightAlpha,0.35)},${d(base[1],nightAlpha,0.35)},${d(base[2],nightAlpha,0.35)})`;
    ctx.beginPath();
    ctx.ellipse(ep.x, ep.y, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stripe bands (clipped to egg)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ep.x, ep.y, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = `rgba(${d(stripe[0],nightAlpha,0.35)},${d(stripe[1],nightAlpha,0.35)},${d(stripe[2],nightAlpha,0.35)},0.65)`;
    ctx.fillRect(ep.x - 6, ep.y - 1.8, 12, 1.6);
    ctx.fillRect(ep.x - 6, ep.y + 1.0, 12, 1.6);
    ctx.restore();
    // Centre dot
    ctx.fillStyle = `rgb(${d(stripe[0],nightAlpha,0.35)},${d(stripe[1],nightAlpha,0.35)},${d(stripe[2],nightAlpha,0.35)})`;
    ctx.beginPath();
    ctx.arc(ep.x, ep.y - 2.8, 1.1, 0, Math.PI * 2);
    ctx.fill();
  });

  // Pastel bunting
  drawBunting(ctx, sortedLamps(layout), ['#ffb6c1','#fffacd','#add8e6','#90ee90','#ffa07a','#dda0dd'], nightAlpha);
}

// ── May Day ───────────────────────────────────────────────────────────────────

function drawMayDay(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number, time: number,
) {
  const pb = layout.plazaBounds;
  // Maypole on the left edge of the plaza, clear of clock digits
  const mx = pb.x + pb.w * 0.06;
  const my = pb.y + pb.h * 0.50;
  const poleH = 30;

  // Pole
  ctx.strokeStyle = `rgb(${d(180,nightAlpha)},${d(130,nightAlpha)},${d(70,nightAlpha)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(mx, my + 5);
  ctx.lineTo(mx, my - poleH);
  ctx.stroke();

  // Ribbons
  const ribbonColors = ['#ff0000','#ff7700','#ffff00','#00bb00','#0066ff','#9900cc','#ff00aa','#00cccc'];
  for (let r = 0; r < 8; r++) {
    const angle = (r / 8) * Math.PI * 2 + time * 0.4;
    const ex = mx + Math.cos(angle) * 18;
    const ey = my + 4 + Math.sin(angle) * 7;
    ctx.strokeStyle = ribbonColors[r];
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.8 - nightAlpha * 0.3;
    ctx.beginPath();
    ctx.moveTo(mx, my - poleH);
    ctx.quadraticCurveTo(
      mx + Math.cos(angle + 0.6) * 9,
      my - poleH / 2 + Math.sin(angle) * 5,
      ex, ey,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Colourful bunting
  drawBunting(ctx, sortedLamps(layout), ['#ff0000','#ff8800','#ffdd00','#00bb00','#0055ff','#cc00cc'], nightAlpha);
}

// ── Summer Solstice ───────────────────────────────────────────────────────────

function drawSolstice(
  ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number, time: number,
) {
  const pb = layout.plazaBounds;
  const cx = pb.x + pb.w / 2;
  const cy = pb.y + pb.h / 2;

  // Faint sun-ray lines on the plaza floor
  const rayAlpha = Math.max(0, 0.12 - nightAlpha * 0.1);
  if (rayAlpha > 0.01) {
    ctx.strokeStyle = `rgba(255,200,0,${rayAlpha})`;
    ctx.lineWidth = 1.5;
    for (let r = 0; r < 12; r++) {
      const a = (r / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
      ctx.lineTo(cx + Math.cos(a) * 65, cy + Math.sin(a) * 65);
      ctx.stroke();
    }
  }

  // Flower garlands on lamp posts (slowly rotating)
  const flowerColors = ['#ffaacc','#ffdd00','#ff8844','#cc44ff','#44ffbb','#ff5599','#44ccff'];
  for (const lamp of layout.plazaLamps) {
    for (let f = 0; f < 5; f++) {
      const a = (f / 5) * Math.PI * 2 + time * 0.25;
      const fx = lamp.x + Math.cos(a) * 5;
      const fy = lamp.y + Math.sin(a) * 5;
      ctx.globalAlpha = Math.max(0, 0.7 - nightAlpha * 0.35);
      ctx.fillStyle = flowerColors[f % flowerColors.length];
      ctx.beginPath();
      ctx.arc(fx, fy, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = Math.max(0, 0.9 - nightAlpha * 0.2);
    ctx.fillStyle = `rgb(255,${d(220,nightAlpha,0.2)},20)`;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Golden/amber bunting
  drawBunting(ctx, sortedLamps(layout), ['#ffdd00','#ff8800','#ffee88','#ff4400','#ffffaa'], nightAlpha);
}

// ── Weekend Bunting ───────────────────────────────────────────────────────────

function drawWeekend(ctx: CanvasRenderingContext2D, layout: CityLayout, nightAlpha: number) {
  drawBunting(
    ctx, sortedLamps(layout),
    ['#ff3333','#ff9900','#ffdd00','#33cc33','#3399ff','#cc33ff','#ff6699','#00cccc'],
    nightAlpha,
  );
}

// ── Public entry point ────────────────────────────────────────────────────────

export function drawHolidayDecorations(
  ctx: CanvasRenderingContext2D,
  layout: CityLayout,
  nightAlpha: number,
  time: number,
  holiday: Holiday | null,
) {
  if (!holiday) return;
  ctx.save();
  ctx.beginPath(); // defensive path reset
  switch (holiday) {
    case 'christmas':  drawChristmas(ctx, layout, nightAlpha, time);  break;
    case 'newyear':    drawNewYear(ctx, layout, nightAlpha, time);     break;
    case 'halloween':  drawHalloween(ctx, layout, nightAlpha, time);   break;
    case 'bonfire':    drawBonfire(ctx, layout, nightAlpha, time);     break;
    case 'valentine':  drawValentine(ctx, layout, nightAlpha, time);   break;
    case 'stpatricks': drawStPatricks(ctx, layout, nightAlpha);        break;
    case 'easter':     drawEaster(ctx, layout, nightAlpha);            break;
    case 'mayday':     drawMayDay(ctx, layout, nightAlpha, time);      break;
    case 'solstice':   drawSolstice(ctx, layout, nightAlpha, time);    break;
    case 'weekend':    drawWeekend(ctx, layout, nightAlpha);           break;
  }
  ctx.restore();
}
