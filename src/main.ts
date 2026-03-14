import { CityLayout } from './city/CityLayout';
import { Pedestrian } from './entities/Pedestrian';
import { Car } from './entities/Car';
import { ClockManager } from './clock/ClockManager';
import { DayNightCycle } from './rendering/DayNightCycle';
import { TOTAL_PEDESTRIANS, CLOCK_ELIGIBLE_COUNT, TOTAL_CARS } from './utils/constants';

const canvas = document.getElementById('cityCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

let layout: CityLayout;
let pedestrians: Pedestrian[] = [];
let cars: Car[] = [];
const clockManager = new ClockManager();
const dayNight = new DayNightCycle();

// Offscreen canvas for static city elements
let staticCanvas: HTMLCanvasElement | null = null;
let lastStaticNightAlpha = -1;

// Zoom / pan state
let zoom = 1.0;
let panX = 0;
let panY = 0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5.0;

function clampPan(w: number, h: number) {
  // Keep the world visible — don't allow panning entirely off-screen
  const worldW = w * zoom;
  const worldH = h * zoom;
  const maxPanX = w * 0.15;
  const minPanX = w - worldW - w * 0.15;
  const maxPanY = h * 0.15;
  const minPanY = h - worldH - h * 0.15;
  panX = Math.max(minPanX, Math.min(maxPanX, panX));
  panY = Math.max(minPanY, Math.min(maxPanY, panY));
}

function applyZoom(factor: number, pivotX: number, pivotY: number, w: number, h: number) {
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
  const zoomRatio = newZoom / zoom;
  panX = pivotX - (pivotX - panX) * zoomRatio;
  panY = pivotY - (pivotY - panY) * zoomRatio;
  zoom = newZoom;
  clampPan(w, h);
}

// Mouse wheel zoom
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  applyZoom(factor, px, py, window.innerWidth, window.innerHeight);
}, { passive: false });

// Touch pinch zoom
const activeTouches: Map<number, { x: number; y: number }> = new Map();
let lastPinchDist = -1;

canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    const rect = canvas.getBoundingClientRect();
    activeTouches.set(t.identifier, { x: t.clientX - rect.left, y: t.clientY - rect.top });
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    activeTouches.set(t.identifier, { x: t.clientX - rect.left, y: t.clientY - rect.top });
  }
  if (activeTouches.size === 2) {
    const [a, b] = [...activeTouches.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinchDist > 0 && dist > 0) {
      const factor = dist / lastPinchDist;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      applyZoom(factor, mx, my, window.innerWidth, window.innerHeight);
    }
    lastPinchDist = dist;
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) activeTouches.delete(t.identifier);
  if (activeTouches.size < 2) lastPinchDist = -1;
}, { passive: true });

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  // Reset zoom/pan on resize
  zoom = 1.0;
  panX = 0;
  panY = 0;

  layout = new CityLayout(width, height);

  // Re-spawn entities
  pedestrians = [];
  for (let i = 0; i < TOTAL_PEDESTRIANS; i++) {
    pedestrians.push(new Pedestrian(layout, i, CLOCK_ELIGIBLE_COUNT));
  }

  cars = [];
  const deliveryCount = Math.floor(TOTAL_CARS * 0.2);
  for (let i = 0; i < TOTAL_CARS; i++) {
    cars.push(new Car(layout, i < deliveryCount));
  }

  // Force static canvas rebuild
  lastStaticNightAlpha = -1;
  staticCanvas = null;
}

function buildStaticCanvas(nightAlpha: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (!staticCanvas) {
    staticCanvas = document.createElement('canvas');
  }
  staticCanvas.width = w * dpr;
  staticCanvas.height = h * dpr;

  const sctx = staticCanvas.getContext('2d')!;
  sctx.scale(dpr, dpr);

  // Sky/ground base
  sctx.fillStyle = dayNight.getSkyColor(nightAlpha);
  sctx.fillRect(0, 0, w, h);

  // Render layers
  layout.drawRoads(sctx, nightAlpha);
  layout.drawDeliveryLanes(sctx, nightAlpha);
  layout.drawSidewalks(sctx, nightAlpha);
  layout.drawCrosswalks(sctx, nightAlpha);
  layout.drawPlaza(sctx, nightAlpha);
  layout.drawPlazaBenches(sctx, nightAlpha);
  layout.drawBuildings(sctx, nightAlpha);
  layout.drawDeliveryLanes(sctx, nightAlpha); // redraw inside plaza over plaza tile
  layout.drawVenues(sctx, nightAlpha);
  layout.drawPlazaLampPosts(sctx, nightAlpha);

  lastStaticNightAlpha = nightAlpha;
}

function loop() {
  const time = Date.now() / 1000;
  const nightAlpha = dayNight.getNightAlpha();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Rebuild static canvas if lighting changed significantly
  const quantizedAlpha = Math.round(nightAlpha * 20) / 20;
  if (quantizedAlpha !== lastStaticNightAlpha) {
    buildStaticCanvas(nightAlpha);
  }

  // Clear canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply zoom + pan + DPR transform
  // World coord (wx, wy) → screen physical pixel (panX*dpr + wx*zoom*dpr, panY*dpr + wy*zoom*dpr)
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);

  // Draw cached static city (mapped from world 0,0,w,h)
  if (staticCanvas) {
    ctx.drawImage(staticCanvas, 0, 0, w, h);
  }

  // Update clock targets
  const plazaCX = layout.plazaBounds.x + layout.plazaBounds.w / 2;
  const plazaCY = layout.plazaBounds.y + layout.plazaBounds.h / 2;
  clockManager.update(pedestrians, plazaCX, plazaCY, layout.plazaBounds);

  // Update and draw cars
  for (const car of cars) {
    car.update(layout, pedestrians, cars);
    car.draw(ctx, nightAlpha);
  }

  // Update and draw pedestrians
  for (const p of pedestrians) {
    p.update(pedestrians, layout);
    p.draw(ctx, nightAlpha);
  }

  // Trees on top (canopies)
  layout.drawTrees(ctx, time, nightAlpha);

  // Street light glows + plaza lamp glows (drawn after trees so they composite on top)
  layout.drawStreetLights(ctx, nightAlpha);
  layout.drawPlazaLampGlows(ctx, nightAlpha);

  // Night overlay
  dayNight.drawNightOverlay(ctx, w, h, nightAlpha);

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  resize();
});

resize();
loop();
