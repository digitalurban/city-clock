import { CityLayout } from './city/CityLayout';
import { Pedestrian, clearPedestrianState } from './entities/Pedestrian';
import { Car } from './entities/Car';
import { ClockManager } from './clock/ClockManager';
import { DayNightCycle } from './rendering/DayNightCycle';
import { Weather } from './rendering/Weather';
import { TOTAL_PEDESTRIANS, CLOCK_ELIGIBLE_COUNT, TOTAL_CARS } from './utils/constants';

const canvas = document.getElementById('cityCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

let layout: CityLayout;
let pedestrians: Pedestrian[] = [];
let cars: Car[] = [];
const clockManager = new ClockManager();
const dayNight = new DayNightCycle();
const weather = new Weather();

// Offscreen canvas for static city elements
let staticCanvas: HTMLCanvasElement | null = null;
let lastStaticNightAlpha = -1;

// The city world is WORLD_SCALE times the viewport in each dimension.
// At minZoom the full world fits in the viewport; zooming in shows detail.
const WORLD_SCALE = 2.0;

// Zoom / pan state
let zoom = 1.0;
let panX = 0;
let panY = 0;
let minZoom = 0.5;  // updated dynamically in resize()
const MAX_ZOOM = 5.0;

function clampPan(w: number, h: number) {
  // World dimensions in CSS pixels
  const worldW = w * WORLD_SCALE;
  const worldH = h * WORLD_SCALE;
  // Pan limits: keep world edges from scrolling past screen edges
  const minPanX = w - worldW * zoom;
  const maxPanX = 0;
  const minPanY = h - worldH * zoom;
  const maxPanY = 0;
  panX = Math.max(minPanX, Math.min(maxPanX, panX));
  panY = Math.max(minPanY, Math.min(maxPanY, panY));
}

function applyZoom(factor: number, pivotX: number, pivotY: number, w: number, h: number) {
  const newZoom = Math.max(minZoom, Math.min(MAX_ZOOM, zoom * factor));
  const zoomRatio = newZoom / zoom;
  panX = pivotX - (pivotX - panX) * zoomRatio;
  panY = pivotY - (pivotY - panY) * zoomRatio;
  zoom = newZoom;
  clampPan(w, h);
}

// ==================== Mouse wheel zoom ====================
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  applyZoom(factor, px, py, window.innerWidth, window.innerHeight);
}, { passive: false });

// ==================== Mouse drag to pan ====================
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPanX = 0;
let dragStartPanY = 0;

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartPanX = panX;
  dragStartPanY = panY;
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  panX = dragStartPanX + dx;
  panY = dragStartPanY + dy;
  clampPan(window.innerWidth, window.innerHeight);
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    canvas.style.cursor = 'grab';
  }
});

canvas.style.cursor = 'grab';

// ==================== Touch pinch zoom + drag to pan ====================
const activeTouches: Map<number, { x: number; y: number }> = new Map();
let lastPinchDist = -1;
let touchDragId: number | null = null;
let touchDragStartX = 0;
let touchDragStartY = 0;
let touchDragStartPanX = 0;
let touchDragStartPanY = 0;

canvas.addEventListener('touchstart', (e) => {
  const rect = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    activeTouches.set(t.identifier, { x: t.clientX - rect.left, y: t.clientY - rect.top });
  }
  // Start single-finger drag
  if (activeTouches.size === 1) {
    const t = e.changedTouches[0];
    touchDragId = t.identifier;
    touchDragStartX = t.clientX;
    touchDragStartY = t.clientY;
    touchDragStartPanX = panX;
    touchDragStartPanY = panY;
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    activeTouches.set(t.identifier, { x: t.clientX - rect.left, y: t.clientY - rect.top });
  }

  if (activeTouches.size === 1 && touchDragId !== null) {
    // Single-finger drag → pan
    for (const t of e.changedTouches) {
      if (t.identifier === touchDragId) {
        const dx = t.clientX - touchDragStartX;
        const dy = t.clientY - touchDragStartY;
        panX = touchDragStartPanX + dx;
        panY = touchDragStartPanY + dy;
        clampPan(window.innerWidth, window.innerHeight);
      }
    }
  } else if (activeTouches.size === 2) {
    // Two-finger pinch → zoom
    const [a, b] = [...activeTouches.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinchDist > 0 && dist > 0) {
      const factor = dist / lastPinchDist;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      applyZoom(factor, mx, my, window.innerWidth, window.innerHeight);
    }
    lastPinchDist = dist;
    touchDragId = null; // cancel drag when pinching
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    activeTouches.delete(t.identifier);
    if (t.identifier === touchDragId) touchDragId = null;
  }
  if (activeTouches.size < 2) lastPinchDist = -1;
  // If one finger remains after lifting second, start a new drag
  if (activeTouches.size === 1) {
    const [id, pos] = [...activeTouches.entries()][0];
    touchDragId = id;
    touchDragStartX = pos.x;
    touchDragStartY = pos.y;
    touchDragStartPanX = panX;
    touchDragStartPanY = panY;
  }
}, { passive: true });

// ==================== Resize / init ====================
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const worldW = width * WORLD_SCALE;
  const worldH = height * WORLD_SCALE;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  layout = new CityLayout(worldW, worldH);

  // Zoom so the plaza fills ~80% of the viewport, centered on screen.
  // This works regardless of device/viewport size.
  const plazaCX = layout.plazaBounds.x + layout.plazaBounds.w / 2;
  const plazaCY = layout.plazaBounds.y + layout.plazaBounds.h / 2;
  const plazaFillFraction = 0.8;
  const zoomToFitW = (width * plazaFillFraction) / layout.plazaBounds.w;
  const zoomToFitH = (height * plazaFillFraction) / layout.plazaBounds.h;
  const initialZoom = Math.min(zoomToFitW, zoomToFitH);
  // Allow zooming out to 1.5× of the initial view (no further)
  minZoom = initialZoom / 1.5;
  zoom = Math.max(minZoom, Math.min(MAX_ZOOM, initialZoom));
  panX = width / 2 - plazaCX * zoom;
  panY = height / 2 - plazaCY * zoom;
  clampPan(width, height);

  // Re-spawn entities
  pedestrians = [];
  for (let i = 0; i < TOTAL_PEDESTRIANS; i++) {
    pedestrians.push(new Pedestrian(layout, i, CLOCK_ELIGIBLE_COUNT));
  }

  cars = [];
  Car.droppedPackages = []; // clear packages on resize
  clearPedestrianState(); // clear shared queues/benches state
  // Allocate car types: ~15% delivery, ~4% emergency, rest normal
  const deliveryCount = Math.floor(TOTAL_CARS * 0.15);
  const emergencyCount = Math.max(2, Math.floor(TOTAL_CARS * 0.04));
  const emergencyTypes: Array<'police' | 'ambulance' | 'firetruck'> = ['police', 'ambulance', 'firetruck'];
  for (let i = 0; i < TOTAL_CARS; i++) {
    if (i < deliveryCount) {
      cars.push(new Car(layout, 'delivery'));
    } else if (i < deliveryCount + emergencyCount) {
      cars.push(new Car(layout, emergencyTypes[i % emergencyTypes.length]));
    } else {
      cars.push(new Car(layout, 'normal'));
    }
  }

  // Init weather with world dimensions
  weather.init(worldW, worldH);

  // Force static canvas rebuild
  lastStaticNightAlpha = -1;
  staticCanvas = null;
}

function buildStaticCanvas(nightAlpha: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const worldW = w * WORLD_SCALE;
  const worldH = h * WORLD_SCALE;

  if (!staticCanvas) {
    staticCanvas = document.createElement('canvas');
  }
  staticCanvas.width = worldW * dpr;
  staticCanvas.height = worldH * dpr;

  const sctx = staticCanvas.getContext('2d')!;
  sctx.scale(dpr, dpr);

  // Sky/ground base
  sctx.fillStyle = dayNight.getSkyColor(nightAlpha);
  sctx.fillRect(0, 0, worldW, worldH);

  // Render layers
  layout.drawRoads(sctx, nightAlpha);
  layout.drawSidewalks(sctx, nightAlpha);
  layout.drawCrosswalks(sctx, nightAlpha);
  layout.drawPlaza(sctx, nightAlpha);
  layout.drawPlazaBenches(sctx, nightAlpha);
  layout.drawBuildings(sctx, nightAlpha);
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
  const worldW = w * WORLD_SCALE;
  const worldH = h * WORLD_SCALE;

  // Update weather
  weather.update();

  // Rebuild static canvas if lighting changed significantly
  const quantizedAlpha = Math.round(nightAlpha * 20) / 20;
  if (quantizedAlpha !== lastStaticNightAlpha) {
    buildStaticCanvas(nightAlpha);
  }

  // Fill entire canvas with sky colour (visible when zoomed out past world edges)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = dayNight.getSkyColor(nightAlpha);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply zoom + pan + DPR transform
  // World coord (wx, wy) → screen physical pixel (panX*dpr + wx*zoom*dpr, panY*dpr + wy*zoom*dpr)
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);

  // Draw cached static city (maps from world 0,0,worldW,worldH)
  if (staticCanvas) {
    ctx.drawImage(staticCanvas, 0, 0, worldW, worldH);
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

  // Update and draw dropped packages
  Car.updateDroppedPackages();
  Car.drawDroppedPackages(ctx, nightAlpha);

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

  // Weather effects in world space (clouds, rain, puddles)
  weather.drawWorldEffects(ctx, nightAlpha);

  // Night overlay — drawn in screen space so it always covers the full viewport
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  dayNight.drawNightOverlay(ctx, canvas.width, canvas.height, nightAlpha);

  // Weather screen overlay (rain tint)
  weather.drawScreenOverlay(ctx, canvas.width, canvas.height);

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  resize();
});

resize();
loop();
