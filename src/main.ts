import { CityLayout } from './city/CityLayout';
import { Pedestrian, clearPedestrianState } from './entities/Pedestrian';
import { Car } from './entities/Car';
import { ClockManager } from './clock/ClockManager';
import { DayNightCycle } from './rendering/DayNightCycle';
import { Weather } from './rendering/Weather';
import { TOTAL_PEDESTRIANS, CLOCK_ELIGIBLE_COUNT, TOTAL_CARS, setTotalPedestrians, setTotalCars } from './utils/constants';

const canvas = document.getElementById('cityCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

let layout: CityLayout;
let pedestrians: Pedestrian[] = [];
let cars: Car[] = [];
const clockManager = new ClockManager();
const dayNight = new DayNightCycle();
const weather = new Weather();

// Traffic light phase: cycles 0→1 over ~8 seconds
let trafficPhase = 0;

// Offscreen canvas for static city elements
let staticCanvas: HTMLCanvasElement | null = null;
let lastStaticNightAlpha = -1;

// The city world is WORLD_SCALE times the viewport in each dimension.
const WORLD_SCALE = 2.0;

// Zoom / pan state
let zoom = 1.0;
let panX = 0;
let panY = 0;
let minZoom = 0.5;
const MAX_ZOOM = 5.0;

// Current slider values (for live adjustment without full resize)
let currentCarCount = TOTAL_CARS;
let currentPedCount = TOTAL_PEDESTRIANS;

// Alarm state
let alarmTime: string | null = null;
let isAlarmActive = false;
let isDancing = false;
const alarmAudio = new Audio('./MiniCityAlarm.mp3');
alarmAudio.loop = true;

function clampPan(w: number, h: number) {
  const worldW = w * WORLD_SCALE;
  const worldH = h * WORLD_SCALE;
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

// ==================== Double-tap / double-click to force clock ====================
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
canvas.addEventListener('dblclick', () => {
  clockManager.triggerForceShow();
});
// Separate touchstart to record tap position for distance check
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const now = Date.now();
    const dx = t.clientX - lastTapX;
    const dy = t.clientY - lastTapY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (now - lastTapTime < 300 && dist < 40) {
      clockManager.triggerForceShow();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
      lastTapX = t.clientX;
      lastTapY = t.clientY;
    }
  }
}, { passive: true });

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
    const [a, b] = [...activeTouches.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinchDist > 0 && dist > 0) {
      const factor = dist / lastPinchDist;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      applyZoom(factor, mx, my, window.innerWidth, window.innerHeight);
    }
    lastPinchDist = dist;
    touchDragId = null;
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    activeTouches.delete(t.identifier);
    if (t.identifier === touchDragId) touchDragId = null;
  }
  if (activeTouches.size < 2) lastPinchDist = -1;
  if (activeTouches.size === 1) {
    const [id, pos] = [...activeTouches.entries()][0];
    touchDragId = id;
    touchDragStartX = pos.x;
    touchDragStartY = pos.y;
    touchDragStartPanX = panX;
    touchDragStartPanY = panY;
  }
}, { passive: true });

// ==================== Options UI ====================
function createOptionsUI() {
  // Container
  const container = document.createElement('div');
  container.id = 'options-container';
  container.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 100;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    user-select: none;
  `;

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'options-toggle';
  toggleBtn.innerHTML = '⚙';
  toggleBtn.style.cssText = `
    width: 40px; height: 40px; border-radius: 50%; border: none;
    background: rgba(0,0,0,0.6); color: #fff; font-size: 20px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: transform 0.2s, background 0.2s;
  `;
  toggleBtn.addEventListener('mouseenter', () => { toggleBtn.style.background = 'rgba(0,0,0,0.8)'; });
  toggleBtn.addEventListener('mouseleave', () => { toggleBtn.style.background = 'rgba(0,0,0,0.6)'; });

  // Panel
  const panel = document.createElement('div');
  panel.id = 'options-panel';
  panel.style.cssText = `
    display: none; position: absolute; bottom: 50px; right: 0;
    background: rgba(15, 15, 25, 0.85); color: #fff; padding: 16px 20px;
    border-radius: 12px; min-width: 220px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    font-size: 13px;
  `;

  const maxCars = 300;
  const maxPeds = 500;

  panel.innerHTML = `
    <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #aab;">City Options</div>
    <div style="margin-bottom: 10px;">
      <label style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Traffic</span>
        <span id="car-count-label">${currentCarCount}</span>
      </label>
      <input type="range" id="car-slider" min="10" max="${maxCars}" value="${currentCarCount}" style="width: 100%; accent-color: #4a9eff;">
    </div>
    <div style="margin-bottom: 10px;">
      <label style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>People</span>
        <span id="ped-count-label">${currentPedCount}</span>
      </label>
      <input type="range" id="ped-slider" min="${CLOCK_ELIGIBLE_COUNT}" max="${maxPeds}" value="${currentPedCount}" style="width: 100%; accent-color: #4a9eff;">
    </div>
    <div style="margin-bottom: 6px;">
      <label style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Location (Open-Meteo)</span>
      </label>
      <div style="display: flex; gap: 8px;">
        <input type="text" id="weather-location" placeholder="e.g. London" style="flex: 1; background: #223; color: white; border: 1px solid #445; border-radius: 4px; padding: 2px 4px; color-scheme: dark;">
        <button id="location-btn" style="background: #4a9eff; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-weight: bold;">Set</button>
      </div>
    </div>
    <div style="margin-bottom: 6px;">
      <label style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Alarm</span>
        <span id="alarm-status-label">Off</span>
      </label>
      <div style="display: flex; gap: 8px;">
        <input type="time" id="alarm-time" style="flex: 1; background: #223; color: white; border: 1px solid #445; border-radius: 4px; padding: 2px 4px; color-scheme: dark;">
        <button id="alarm-btn" style="background: #4a9eff; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-weight: bold;">Set</button>
      </div>
    </div>
  `;

  container.appendChild(panel);
  container.appendChild(toggleBtn);
  document.body.appendChild(container);

  let panelOpen = false;
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'block' : 'none';
    toggleBtn.style.transform = panelOpen ? 'rotate(90deg)' : '';
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (panelOpen && !container.contains(e.target as Node)) {
      panelOpen = false;
      panel.style.display = 'none';
      toggleBtn.style.transform = '';
    }
  });

  // Slider handlers
  const carSlider = panel.querySelector('#car-slider') as HTMLInputElement;
  const pedSlider = panel.querySelector('#ped-slider') as HTMLInputElement;
  const carLabel = panel.querySelector('#car-count-label') as HTMLSpanElement;
  const pedLabel = panel.querySelector('#ped-count-label') as HTMLSpanElement;

  carSlider.addEventListener('input', () => {
    const val = parseInt(carSlider.value);
    carLabel.textContent = String(val);
    adjustCarCount(val);
  });

  pedSlider.addEventListener('input', () => {
    const val = parseInt(pedSlider.value);
    pedLabel.textContent = String(val);
    adjustPedCount(val);
  });

  // Location / Weather handlers
  const locationInput = panel.querySelector('#weather-location') as HTMLInputElement;
  const locationBtn = panel.querySelector('#location-btn') as HTMLButtonElement;

  locationBtn.addEventListener('click', () => {
    const loc = locationInput.value.trim();
    if (loc) {
      weather.setLocation(loc);
      locationBtn.textContent = 'Set ✓';
      locationBtn.style.background = '#4caf50';
      setTimeout(() => {
        locationBtn.textContent = 'Set';
        locationBtn.style.background = '#4a9eff';
      }, 2000);
    } else {
      weather.useRealWeather = false; // Disable if empty
    }
  });

  // Alarm handlers
  const alarmTimeInput = panel.querySelector('#alarm-time') as HTMLInputElement;
  const alarmBtn = panel.querySelector('#alarm-btn') as HTMLButtonElement;
  const alarmStatusLabel = panel.querySelector('#alarm-status-label') as HTMLSpanElement;

  alarmBtn.addEventListener('click', () => {
    if (alarmTime) {
      // Clear alarm
      alarmTime = null;
      alarmBtn.textContent = 'Set';
      alarmStatusLabel.textContent = 'Off';
      isAlarmActive = false;
      isDancing = false;
      alarmAudio.pause();
      const snoozeBtn = document.getElementById('snooze-btn');
      if (snoozeBtn) snoozeBtn.style.display = 'none';
      alarmBtn.style.background = '#4a9eff';
    } else {
      if (alarmTimeInput.value) {
        alarmTime = alarmTimeInput.value;
        alarmBtn.textContent = 'Clear';
        alarmBtn.style.background = '#ff4a4a';
        alarmStatusLabel.textContent = alarmTime;
      }
    }
  });

  // Prevent canvas interactions when interacting with sliders
  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  panel.addEventListener('touchstart', (e) => e.stopPropagation());
}

function adjustCarCount(target: number) {
  currentCarCount = target;
  setTotalCars(target);

  while (cars.length > target) {
    cars.pop();
  }
  while (cars.length < target) {
    const deliveryCount = Math.floor(target * 0.15);
    const emergencyCount = Math.max(2, Math.floor(target * 0.04));
    const emergencyTypes: Array<'police' | 'ambulance' | 'firetruck'> = ['police', 'ambulance', 'firetruck'];
    const i = cars.length;
    if (i < deliveryCount) {
      cars.push(new Car(layout, 'delivery'));
    } else if (i < deliveryCount + emergencyCount) {
      cars.push(new Car(layout, emergencyTypes[i % emergencyTypes.length]));
    } else {
      cars.push(new Car(layout, 'normal'));
    }
  }
}

function adjustPedCount(target: number) {
  target = Math.max(target, CLOCK_ELIGIBLE_COUNT);
  currentPedCount = target;
  setTotalPedestrians(target);

  while (pedestrians.length > target) {
    pedestrians.pop();
  }
  while (pedestrians.length < target) {
    pedestrians.push(new Pedestrian(layout, pedestrians.length, CLOCK_ELIGIBLE_COUNT));
  }
}

// ==================== Resize / init ====================
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const worldW = width * WORLD_SCALE;
  const worldH = height * WORLD_SCALE;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width} px`;
  canvas.style.height = `${height} px`;

  layout = new CityLayout(worldW, worldH);

  // Zoom so the plaza fills ~80% of the viewport
  const plazaCX = layout.plazaBounds.x + layout.plazaBounds.w / 2;
  const plazaCY = layout.plazaBounds.y + layout.plazaBounds.h / 2;
  const plazaFillFraction = 0.8;
  const zoomToFitW = (width * plazaFillFraction) / layout.plazaBounds.w;
  const zoomToFitH = (height * plazaFillFraction) / layout.plazaBounds.h;
  const initialZoom = Math.min(zoomToFitW, zoomToFitH);
  minZoom = initialZoom / 1.5;
  zoom = Math.max(minZoom, Math.min(MAX_ZOOM, initialZoom));
  panX = width / 2 - plazaCX * zoom;
  panY = height / 2 - plazaCY * zoom;
  clampPan(width, height);

  // Re-spawn entities
  pedestrians = [];
  for (let i = 0; i < currentPedCount; i++) {
    pedestrians.push(new Pedestrian(layout, i, CLOCK_ELIGIBLE_COUNT));
  }

  cars = [];
  Car.droppedPackages = [];
  clearPedestrianState();
  const deliveryCount = Math.floor(currentCarCount * 0.15);
  const emergencyCount = Math.max(2, Math.floor(currentCarCount * 0.04));
  const emergencyTypes: Array<'police' | 'ambulance' | 'firetruck'> = ['police', 'ambulance', 'firetruck'];
  for (let i = 0; i < currentCarCount; i++) {
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

  // Draw parks before buildings so buildings render on top
  layout.drawParks(sctx, nightAlpha);

  layout.drawPlazaBenches(sctx, nightAlpha);
  layout.drawBuildings(sctx, nightAlpha);
  layout.drawHouses(sctx, nightAlpha);
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

  // Update traffic light phase (~8 second cycle)
  trafficPhase = (trafficPhase + 1 / 480) % 1;

  // Update weather
  weather.update();

  // Rebuild static canvas if lighting changed significantly
  const quantizedAlpha = Math.round(nightAlpha * 20) / 20;
  if (quantizedAlpha !== lastStaticNightAlpha) {
    buildStaticCanvas(nightAlpha);
  }

  // Fill entire canvas with sky colour
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = dayNight.getSkyColor(nightAlpha);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply zoom + pan + DPR transform
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);

  // Draw cached static city
  const worldW = w * WORLD_SCALE;
  const worldH = h * WORLD_SCALE;
  if (staticCanvas) {
    ctx.drawImage(staticCanvas, 0, 0, worldW, worldH);
  }

  // Update clock targets
  const plazaCX = layout.plazaBounds.x + layout.plazaBounds.w / 2;
  const plazaCY = layout.plazaBounds.y + layout.plazaBounds.h / 2;
  clockManager.update(pedestrians, plazaCX, plazaCY, layout.plazaBounds);

  // Update and draw cars
  for (const car of cars) {
    car.update(layout, pedestrians, cars, trafficPhase);
    car.draw(ctx, nightAlpha);
  }

  // Update and draw dropped packages
  Car.updateDroppedPackages();
  Car.drawDroppedPackages(ctx, nightAlpha);

  // Alarm check
  if (alarmTime && !isAlarmActive) {
    const now = new Date();
    const currentH = now.getHours().toString().padStart(2, '0');
    const currentM = now.getMinutes().toString().padStart(2, '0');
    if (`${currentH}:${currentM} ` === alarmTime) {
      isAlarmActive = true;
      isDancing = true;
      alarmAudio.play().catch(e => console.error("Audio play failed:", e));

      // Show snooze button
      let snoozeBtn = document.getElementById('snooze-btn');
      if (!snoozeBtn) {
        snoozeBtn = document.createElement('button');
        snoozeBtn.id = 'snooze-btn';
        snoozeBtn.textContent = 'Snooze (9 min)';
        snoozeBtn.style.cssText = `
  position: fixed; bottom: 80px; left: 50 %; transform: translateX(-50 %); z - index: 200;
  background: #ffaa00; color: #fff; border: none; border - radius: 20px;
  padding: 12px 24px; font - size: 18px; font - weight: bold; cursor: pointer;
  box - shadow: 0 4px 12px rgba(0, 0, 0, 0.5); border: 2px solid #fff;
  `;
        document.body.appendChild(snoozeBtn);
        snoozeBtn.addEventListener('click', () => {
          isAlarmActive = false;
          isDancing = false;
          alarmAudio.pause();
          snoozeBtn!.style.display = 'none';

          // Add 9 minutes
          const [h, m] = alarmTime!.split(':').map(Number);
          const date = new Date();
          date.setHours(h, m + 9);
          alarmTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} `;

          const status = document.getElementById('alarm-status-label');
          if (status) status.textContent = alarmTime;
        });
      }
      snoozeBtn.style.display = 'block';
    }
  }

  // Update and draw pedestrians
  for (const p of pedestrians) {
    p.update(pedestrians, layout, isDancing, weather.intensity);
    // @ts-ignore - we'll update the signature in Pedestrian.ts next
    p.draw(ctx, nightAlpha, weather.intensity, isDancing);
  }

  // Trees on top (canopies)
  layout.drawTrees(ctx, time, nightAlpha);

  // Street light glows + plaza lamp glows
  layout.drawStreetLights(ctx, nightAlpha);
  layout.drawPlazaLampGlows(ctx, nightAlpha);

  // Traffic lights
  layout.drawTrafficLights(ctx, nightAlpha, trafficPhase);

  // Weather effects in world space
  weather.drawWorldEffects(ctx, nightAlpha);

  // Night overlay — drawn in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  dayNight.drawNightOverlay(ctx, canvas.width, canvas.height, nightAlpha);

  // Weather screen overlay
  weather.drawScreenOverlay(ctx, canvas.width, canvas.height);

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  resize();
});

createOptionsUI();
resize();
loop();
