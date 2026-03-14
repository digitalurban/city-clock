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

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

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
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Rebuild static canvas if lighting changed significantly
  const quantizedAlpha = Math.round(nightAlpha * 20) / 20;
  if (quantizedAlpha !== lastStaticNightAlpha) {
    buildStaticCanvas(nightAlpha);
  }

  // Draw cached static city
  if (staticCanvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticCanvas, 0, 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
