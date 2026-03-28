import { CityLayout } from './city/CityLayout';
import { Pedestrian, clearPedestrianState } from './entities/Pedestrian';
import { Car } from './entities/Car';
import { Bird, Flock, createFlock, createSparrowFlock, updateBirdFeeder, birdFeederActive, birdFeederX, birdFeederY } from './entities/Bird';
import { ChimneySmoke } from './rendering/ChimneySmoke';
import { ClockManager } from './clock/ClockManager';
import { DayNightCycle } from './rendering/DayNightCycle';
import { Weather } from './rendering/Weather';
import { TOTAL_PEDESTRIANS, CLOCK_ELIGIBLE_COUNT, TOTAL_CARS, setTotalPedestrians, setTotalCars } from './utils/constants';

const canvas = document.getElementById('cityCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

let layout: CityLayout;
let pedestrians: Pedestrian[] = [];
let cars: Car[] = [];
let flocks: Flock[] = [];
let sparrowFlocks: Flock[] = [];
const chimneySmoke = new ChimneySmoke();
const clockManager = new ClockManager();
const dayNight = new DayNightCycle();
const weather = new Weather();

// Traffic light phase: cycles 0→1 over ~8 seconds
let trafficPhase = 0;

// Offscreen canvas for static city elements
let staticCanvas: HTMLCanvasElement | null = null;
let lastStaticNightAlpha = -1;
let lastStaticDetailScale = -1;   // track which detail level the canvas was built at

// Debounced rebuild: fires 300ms after the last zoom/pan gesture settles
let staticRebuildTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleStaticRebuild() {
  if (staticRebuildTimer) clearTimeout(staticRebuildTimer);
  staticRebuildTimer = setTimeout(() => {
    lastStaticNightAlpha = -1; // force rebuild on next frame
    staticRebuildTimer = null;
  }, 300);
}

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
const alarmAudio = new Audio('./alarm.mp3');
alarmAudio.loop = true;
alarmAudio.preload = 'auto';

// iOS audio unlock: keep the audio element "warm" on every user gesture
// so play() works when the alarm fires (not from a gesture context)
let audioCtx: AudioContext | null = null;
function ensureAudioUnlocked() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Connect the alarm audio element to the AudioContext
    const source = audioCtx.createMediaElementSource(alarmAudio);
    source.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function clampPan(w: number, h: number) {
  const worldW = layout.width;
  const worldH = layout.height;

  if (worldW * zoom <= w) {
    panX = (w - worldW * zoom) / 2;
  } else {
    const minPanX = w - worldW * zoom;
    const maxPanX = 0;
    panX = Math.max(minPanX, Math.min(maxPanX, panX));
  }

  if (worldH * zoom <= h) {
    panY = (h - worldH * zoom) / 2;
  } else {
    const minPanY = h - worldH * zoom;
    const maxPanY = 0;
    panY = Math.max(minPanY, Math.min(maxPanY, panY));
  }
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
  scheduleStaticRebuild(); // rebuild at new zoom level once scrolling settles
}, { passive: false });

// ==================== Mouse drag to pan + click to inspect ====================
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPanX = 0;
let dragStartPanY = 0;
let dragMoved = false; // true if pointer moved enough to be a drag (not a click)

canvas.addEventListener('mousedown', (e) => {
  ensureAudioUnlocked();
  isDragging = true;
  dragMoved = false;
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
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
    dragMoved = true;
    if (followedPedestrian) stopFollowing(); // user reclaimed manual control
  }
  panX = dragStartPanX + dx;
  panY = dragStartPanY + dy;
  clampPan(window.innerWidth, window.innerHeight);
});

window.addEventListener('mouseup', (e) => {
  if (isDragging) {
    isDragging = false;
    canvas.style.cursor = 'grab';
    if (!dragMoved) {
      // Treat as a click — try to inspect a pedestrian
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const worldX = (cssX - panX) / zoom;
      const worldY = (cssY - panY) / zoom;
      inspectPedestrianAt(worldX, worldY);
    }
  }
});

canvas.style.cursor = 'grab';
// Prevent all native iOS/Android touch gestures on the canvas
// so our custom single-finger pan and two-finger pinch take full control.
canvas.style.touchAction = 'none';
// Also prevent the document from scrolling under the canvas on iOS Safari
document.body.style.overflow = 'hidden';
document.body.style.touchAction = 'none';

// ==================== Double-tap / double-click to force clock ====================
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
canvas.addEventListener('dblclick', () => {
  clockManager.triggerForceShow();
});
// Separate touchstart to record tap position for distance check
canvas.addEventListener('touchstart', (e) => {
  ensureAudioUnlocked();
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
const activeTouches: Map<number, { x: number; y: number; clientX: number; clientY: number }> = new Map();
let lastPinchDist = -1;
let touchDragId: number | null = null;
let touchDragStartX = 0;
let touchDragStartY = 0;
let touchDragStartPanX = 0;
let touchDragStartPanY = 0;

canvas.addEventListener('touchstart', (e) => {
  const rect = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    activeTouches.set(t.identifier, {
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
      clientX: t.clientX,
      clientY: t.clientY
    });
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
    activeTouches.set(t.identifier, {
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
      clientX: t.clientX,
      clientY: t.clientY
    });
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
  if (activeTouches.size < 2) {
    lastPinchDist = -1;
    scheduleStaticRebuild(); // rebuild once pinch-zoom settles
  }
  if (activeTouches.size === 1) {
    const [id, pos] = [...activeTouches.entries()][0];
    touchDragId = id;
    touchDragStartX = pos.clientX;
    touchDragStartY = pos.clientY;
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
    ensureAudioUnlocked(); // Unlock AudioContext from user gesture
    if (alarmTime) {
      // Clear alarm
      alarmTime = null;
      alarmBtn.textContent = 'Set';
      alarmStatusLabel.textContent = 'Off';
      isAlarmActive = false;
      isDancing = false;
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
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
    const rn = Math.random();
    let type: 'delivery' | 'police' | 'ambulance' | 'firetruck' | 'bus' | 'garbage' | 'normal';
    if (rn < 0.15) type = 'delivery';
    else if (rn < 0.20) type = (['police', 'ambulance', 'firetruck'] as const)[cars.length % 3];
    else if (rn < 0.30) type = 'bus';
    else if (rn < 0.35) type = 'garbage';
    else type = 'normal';
    cars.push(new Car(layout, type));
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
  // visualViewport gives the actual visible area on iOS (accounts for toolbar/rotation)
  const vv = window.visualViewport;
  const width = vv ? vv.width : window.innerWidth;
  const height = vv ? vv.height : window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  // Create the fixed-grid layout. The constructor defines its own constant dimensions (12x8).
  layout = new CityLayout(width, height);
  const worldW = layout.width;
  const worldH = layout.height;

  // minZoom = zoom at which the world FULLY covers the viewport (no black space)
  // We use Math.max to ensure the smaller world dimension still fills the screen.
  const zoomFitW = width / worldW;
  const zoomFitH = height / worldH;
  minZoom = Math.max(zoomFitW, zoomFitH);

  // Initial zoom: show the plaza with neighborhood context.
  // We target a viewport window of ~1.8 × plaza dimensions for a closer look.
  const plazaW = layout.plazaBounds.w;
  const plazaH = layout.plazaBounds.h;
  const CONTEXT = 1.56;
  const initialZoomW = width / (plazaW * CONTEXT);
  const initialZoomH = height / (plazaH * CONTEXT);
  const initialZoom = Math.min(initialZoomW, initialZoomH);

  // Start at the initial zoom, but never less than minZoom
  zoom = Math.max(minZoom, Math.min(MAX_ZOOM, initialZoom));

  // Centre view on the plaza
  const plazaCX = layout.plazaBounds.x + plazaW / 2;
  const plazaCY = layout.plazaBounds.y + plazaH / 2;
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
  const emergencyTypes: Array<'police' | 'ambulance' | 'firetruck'> = ['police', 'ambulance', 'firetruck'];
  for (let i = 0; i < currentCarCount; i++) {
    const rn = Math.random();
    if (rn < 0.15) {
      cars.push(new Car(layout, 'delivery'));
    } else if (rn < 0.20) {
      cars.push(new Car(layout, emergencyTypes[i % emergencyTypes.length]));
    } else if (rn < 0.30) {
      cars.push(new Car(layout, 'bus'));
    } else if (rn < 0.35) {
      cars.push(new Car(layout, 'garbage'));
    } else {
      cars.push(new Car(layout, 'normal'));
    }
  }

  // Seagull flocks — start with one
  flocks = [createFlock(layout)];
  // Sparrow flocks — start with one
  sparrowFlocks = [createSparrowFlock(layout)];

  // Chimney smoke sources
  chimneySmoke.setSources(layout.chimneyPositions);

  // Init weather with world dimensions
  weather.init(worldW, worldH);

  // Force static canvas rebuild
  lastStaticNightAlpha = -1;
  staticCanvas = null;
}

function buildStaticCanvas(nightAlpha: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const worldW = layout.width;
  const worldH = layout.height;

  // Render at the current zoom level so there's no upscaling when displayed.
  // Cap to avoid exceeding browser/iOS canvas size limits (~4096px per dimension).
  const MAX_CANVAS_DIM = 4096;
  const maxScale = Math.min(
    MAX_CANVAS_DIM / (worldW * dpr),   // width limit
    MAX_CANVAS_DIM / (worldH * dpr),   // height limit
    2.0                                 // memory cap: never more than 2× world pixels
  );
  const detailScale = Math.min(Math.max(zoom, 1), maxScale);

  if (!staticCanvas) {
    staticCanvas = document.createElement('canvas');
  }
  staticCanvas.width  = Math.round(worldW * dpr * detailScale);
  staticCanvas.height = Math.round(worldH * dpr * detailScale);

  lastStaticDetailScale = detailScale;

  const sctx = staticCanvas.getContext('2d')!;
  sctx.scale(dpr * detailScale, dpr * detailScale);

  // Sky/ground base
  sctx.fillStyle = dayNight.getSkyColor(nightAlpha);
  sctx.fillRect(0, 0, worldW, worldH);

  // Stars and moon drawn before buildings so buildings cover them naturally
  dayNight.drawStars(sctx, worldW, worldH, nightAlpha);
  dayNight.drawMoon(sctx, worldW, worldH, nightAlpha);

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
  layout.drawDeliveryLanes(sctx, nightAlpha); // on top of venues so stub is visible
  layout.drawPlazaLampPosts(sctx, nightAlpha);

  lastStaticNightAlpha = nightAlpha;
}

// ==================== Visibility pause ====================
let loopRunning = true; // paused when tab hidden

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !loopRunning) {
    loopRunning = true;
    requestAnimationFrame(loop);
  } else if (document.hidden) {
    loopRunning = false;
  }
});

function loop(timestamp: number = 0) {
  if (!loopRunning) return; // tab hidden — stop scheduling frames

  const time = Date.now() / 1000;
  const nightAlpha = dayNight.getNightAlpha();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Update traffic light phase (~16 second cycle, time-based so frame-rate independent)
  trafficPhase = (time / 16) % 1;

  // Update weather
  weather.update();

  // Follow camera — smoothly pan to keep the selected pedestrian centred
  if (followedPedestrian) {
    // Update chip activity text live each frame
    if (followChipActivityEl) {
      const act = followedPedestrian.getActivityLabel();
      if (followChipActivityEl.textContent !== act) followChipActivityEl.textContent = act;
    }
    const targetPanX = w / 2 - followedPedestrian.x * zoom;
    const targetPanY = h / 2 - followedPedestrian.y * zoom;
    // Lerp for a smooth lag that feels like a camera operator rather than a hard lock
    panX += (targetPanX - panX) * 0.08;
    panY += (targetPanY - panY) * 0.08;
    clampPan(w, h);
  }

  // Rebuild static canvas if lighting changed significantly, or if zoom has moved
  // far enough from the level it was last rendered at (detail mismatch).
  const quantizedAlpha = Math.round(nightAlpha * 20) / 20;
  const detailMismatch = lastStaticDetailScale > 0 &&
    Math.abs(zoom - lastStaticDetailScale) > 0.18 &&
    staticRebuildTimer === null; // only if no pending debounced rebuild already
  if (quantizedAlpha !== lastStaticNightAlpha || detailMismatch) {
    buildStaticCanvas(nightAlpha);
  }

  // Fill entire canvas with sky colour
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = dayNight.getSkyColor(nightAlpha);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply zoom + pan + DPR transform
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);

  // Draw cached static city — use high-quality smoothing for any residual upscale
  if (staticCanvas) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(staticCanvas, 0, 0, layout.width, layout.height);
  }

  // Venue labels — drawn live in world space so text is rasterised at current zoom, never upscaled
  layout.drawVenueLabels(ctx, nightAlpha);

  // Time-of-day atmosphere (mist, golden hour, Sunday tint) — world space, under everything
  dayNight.drawAtmosphere(ctx, layout.width, layout.height, nightAlpha);

  // Chimney smoke — above rooftops, below everything else
  chimneySmoke.update();
  chimneySmoke.draw(ctx);

  // Roadside bins — update respawn timers and draw before pedestrians
  layout.updateBins();
  layout.drawBins(ctx, nightAlpha);

  // Market stalls and morning newsstand — drawn in plaza before pedestrians
  layout.drawMarket(ctx, nightAlpha);
  layout.drawNewstand(ctx, nightAlpha);

  // Busker update + draw (after market stalls so they layer correctly)
  layout.updateBusker();
  layout.drawBusker(ctx, nightAlpha);

  // Update clock targets
  const plazaCX = layout.plazaBounds.x + layout.plazaBounds.w / 2;
  const plazaCY = layout.plazaBounds.y + layout.plazaBounds.h / 2;
  clockManager.update(pedestrians, plazaCX, plazaCY, layout.plazaBounds);

  // Construction site (animated crane)
  layout.drawConstructionSite(ctx, nightAlpha, time);

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
    if (`${currentH}:${currentM}` === alarmTime) {
      isAlarmActive = true;
      isDancing = true;
      alarmAudio.play().catch(e => console.error("Audio play failed:", e));

      // Show alarm options container
      let alarmControls = document.getElementById('alarm-controls');
      if (!alarmControls) {
        alarmControls = document.createElement('div');
        alarmControls.id = 'alarm-controls';
        alarmControls.style.cssText = `
          position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 200;
          display: flex; gap: 15px;
        `;
        document.body.appendChild(alarmControls);

        const snoozeBtn = document.createElement('button');
        snoozeBtn.id = 'snooze-btn';
        snoozeBtn.textContent = 'Snooze (9 min)';
        snoozeBtn.style.cssText = `
          background: #ffaa00; color: #fff; border: none; border-radius: 20px;
          padding: 12px 24px; font-size: 18px; font-weight: bold; cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); border: 2px solid #fff;
        `;
        alarmControls.appendChild(snoozeBtn);

        const dismissBtn = document.createElement('button');
        dismissBtn.id = 'dismiss-btn';
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = `
          background: #e63946; color: #fff; border: none; border-radius: 20px;
          padding: 12px 24px; font-size: 18px; font-weight: bold; cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); border: 2px solid #fff;
        `;
        alarmControls.appendChild(dismissBtn);

        snoozeBtn.addEventListener('click', () => {
          isAlarmActive = false;
          isDancing = false;
          alarmAudio.pause();
          alarmControls!.style.display = 'none';

          // Add 9 minutes
          const [h, m] = alarmTime!.split(':').map(Number);
          const date = new Date();
          date.setHours(h, m + 9);
          alarmTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

          const status = document.getElementById('alarm-status-label');
          if (status) status.textContent = alarmTime;
        });

        dismissBtn.addEventListener('click', () => {
          isAlarmActive = false;
          isDancing = false;
          alarmAudio.pause();
          alarmTime = null; // Clear the alarm
          alarmControls!.style.display = 'none';

          const status = document.getElementById('alarm-status-label');
          const input = document.getElementById('alarm-time-input') as HTMLInputElement;
          if (status) status.textContent = 'None';
          if (input) input.value = ''; // Clear input field
        });
      }
      alarmControls.style.display = 'flex';
    }
  }

  // Update and draw pedestrians
  for (const p of pedestrians) {
    p.update(
      pedestrians,
      layout,
      isDancing,
      weather.intensity,
      weather.type,
      w,
      h,
      cars
    );
    p.draw(ctx, nightAlpha, weather.intensity, isDancing);
  }

  // Bird feeder event — occasionally someone tosses crumbs in the plaza
  updateBirdFeeder(layout);
  if (birdFeederActive) {
    ctx.fillStyle = `rgba(180, 160, 100, ${0.6 - nightAlpha * 0.3})`;
    for (let i = 0; i < 8; i++) {
      const cx = birdFeederX + Math.sin(i * 2.5 + time * 0.01) * 12;
      const cy = birdFeederY + Math.cos(i * 3.1 + time * 0.01) * 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Spawn new flock occasionally (max 1 active seagull flock)
  if (flocks.length < 1 && Math.random() < 0.0003) {
    flocks.push(createFlock(layout));
  }
  // Spawn sparrow flocks more frequently (max 4 active flocks)
  if (sparrowFlocks.length < 4 && Math.random() < 0.0005) {
    sparrowFlocks.push(createSparrowFlock(layout));
  }

  // Update flocks and draw shadows on ground
  for (const flock of flocks) {
    if (!flock.active) continue;
    for (const bird of flock.birds) {
      bird.update(flock.birds, flock.targetX, flock.targetY, time);
      bird.drawShadow(ctx, nightAlpha);
    }
    // Check if flock has exited the map
    flock.timer++;
    if (flock.timer > 3000) { // ~50 seconds max
      const allOut = flock.birds.every(b =>
        b.x < -200 || b.x > layout.width + 200 ||
        b.y < -200 || b.y > layout.height + 200
      );
      if (allOut || flock.timer > 5000) flock.active = false;
    }
  }
  // Clean up inactive flocks
  flocks = flocks.filter(f => f.active);

  // Update sparrow flocks and draw shadows
  for (const flock of sparrowFlocks) {
    if (!flock.active) continue;
    for (const bird of flock.birds) {
      bird.update(flock.birds, flock.targetX, flock.targetY, time);
      bird.drawShadow(ctx, nightAlpha);
    }
    flock.timer++;
    if (flock.timer > 3000) {
      const allOut = flock.birds.every(b =>
        b.x < -200 || b.x > layout.width + 200 ||
        b.y < -200 || b.y > layout.height + 200
      );
      if (allOut || flock.timer > 5000) flock.active = false;
    }
  }
  sparrowFlocks = sparrowFlocks.filter(f => f.active);

  // House windows — lit only when a resident is actually home
  {
    const occupiedHouses = new Set<number>();
    for (const p of pedestrians) {
      if (p.isAtHome && p.assignedHome >= 0) occupiedHouses.add(p.assignedHome);
    }
    layout.drawHouseWindows(ctx, nightAlpha, occupiedHouses);
  }

  // Trees on top (canopies)
  layout.drawTrees(ctx, time, nightAlpha);

  // Update and draw dynamic events (in world space, underneath weather/UI)
  if (nightAlpha < 0.3 && !layout.activeEvent && Math.random() < 0.00025) {
    layout.startEvent(Math.random() < 0.5 ? 'musician' : 'protest');
  }
  layout.updateEvent();
  layout.drawEvent(ctx, nightAlpha);

  // Traffic lights
  layout.drawTrafficLights(ctx, nightAlpha, trafficPhase);

  // Weather effects in world space
  weather.drawWorldEffects(ctx, nightAlpha);

  // Sparrow flocks — drawn below seagulls (lower altitude)
  for (const flock of sparrowFlocks) {
    if (!flock.active) continue;
    for (const bird of flock.birds) {
      bird.draw(ctx, nightAlpha);
    }
  }

  // Seagull flocks — drawn above everything (parallax height)
  for (const flock of flocks) {
    if (!flock.active) continue;
    for (const bird of flock.birds) {
      bird.draw(ctx, nightAlpha);
    }
  }

  // Night overlay — drawn in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  dayNight.drawNightOverlay(ctx, canvas.width, canvas.height, nightAlpha);

  // Street lights, lamp glows, and car headlight beams drawn AFTER the overlay so they punch through darkness
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);
  layout.drawStreetLights(ctx, nightAlpha);
  layout.drawPlazaLampGlows(ctx, nightAlpha);
  for (const car of cars) {
    car.drawHeadlightGlow(ctx, nightAlpha);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Weather screen overlay
  weather.drawScreenOverlay(ctx, canvas.width, canvas.height);

  // Vignette — subtle radial darkening at the screen edges to frame the scene
  {
    const vw = canvas.width, vh = canvas.height;
    const vig = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.18, vw / 2, vh / 2, vw * 0.72);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, vw, vh);
  }

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  resize();
});

// iOS: viewport dimensions may not update immediately on rotation
// Multiple delayed calls ensure we catch the final settled dimensions
window.addEventListener('orientationchange', () => {
  resize();
  setTimeout(resize, 50);
  setTimeout(resize, 150);
  setTimeout(resize, 350);
  setTimeout(resize, 700);
});

// visualViewport fires reliably on iOS when toolbar shows/hides or rotation settles
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => resize());
}


// ==================== Follow camera + chip ====================
let followedPedestrian: (typeof pedestrians)[0] | null = null;

// Compact follow chip — persistent pill shown while following
let followChip: HTMLDivElement | null = null;
let followChipNameEl: HTMLElement | null = null;
let followChipActivityEl: HTMLSpanElement | null = null;

function buildFollowChip() {
  const chip = document.createElement('div');
  chip.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    z-index: 300; display: none; align-items: center; gap: 5px;
    background: rgba(10,12,22,0.88); color: #e0eaff;
    border: 1px solid rgba(120,150,220,0.4); border-radius: 20px;
    padding: 5px 6px 5px 13px; white-space: nowrap; cursor: default;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 3px 14px rgba(0,0,0,0.5); user-select: none;
  `;

  const icon = document.createElement('span');
  icon.textContent = '➤';
  icon.style.cssText = 'color:#5888c8;font-size:10px;margin-right:2px;';

  const nameEl = document.createElement('strong');
  nameEl.style.color = '#b8d0ff';

  const sep = document.createElement('span');
  sep.textContent = '·';
  sep.style.cssText = 'color:#3a5070;margin:0 4px;';

  const actEl = document.createElement('span');
  actEl.style.color = '#7a94b8';

  const stopBtn = document.createElement('button');
  stopBtn.textContent = '✕';
  stopBtn.title = 'Stop following';
  stopBtn.style.cssText = `
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
    color: #7a8898; border-radius: 12px; width: 22px; height: 22px;
    flex-shrink: 0; cursor: pointer; font-size: 10px; margin-left: 6px; padding: 0;
  `;

  chip.append(icon, nameEl, sep, actEl, stopBtn);

  // Tap/click chip body → show full popup for this person
  chip.addEventListener('click', (e) => {
    if (e.target === stopBtn) return;
    if (followedPedestrian) showInspectPopup(followedPedestrian);
  });
  chip.addEventListener('mousedown', e => e.stopPropagation());
  chip.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  stopBtn.addEventListener('click', e => { e.stopPropagation(); stopFollowing(); });

  document.body.appendChild(chip);
  followChip = chip;
  followChipNameEl = nameEl;
  followChipActivityEl = actEl;
}

function startFollowing(p: (typeof pedestrians)[0]) {
  followedPedestrian = p;
  if (!followChip) buildFollowChip();
  followChipNameEl!.textContent = p.name;
  followChipActivityEl!.textContent = p.getActivityLabel();
  followChip!.style.display = 'flex';
  // Hide the full popup — chip takes over
  if (inspectPopup) {
    clearTimeout((inspectPopup as any)._hideTimeout);
    inspectPopup.style.display = 'none';
  }
}

function stopFollowing() {
  followedPedestrian = null;
  if (followChip) followChip.style.display = 'none';
}

// ==================== Pedestrian inspector ====================
let inspectPopup: HTMLDivElement | null = null;

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function createInspectPopup() {
  const popup = document.createElement('div');
  popup.id = 'ped-inspect';
  popup.style.cssText = `
    position: fixed; z-index: 200;
    background: rgba(10, 12, 22, 0.88); color: #e8ecf4;
    border: 1px solid rgba(120,150,220,0.35); border-radius: 10px;
    padding: 10px 14px; min-width: 180px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px; line-height: 1.6;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 4px 18px rgba(0,0,0,0.55); display: none;
  `;
  popup.addEventListener('mousedown', e => e.stopPropagation());
  popup.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  document.body.appendChild(popup);
  return popup;
}

function inspectPedestrianAt(worldX: number, worldY: number) {
  if (!inspectPopup) inspectPopup = createInspectPopup();

  let nearest: (typeof pedestrians)[0] | null = null;
  let bestDist = 16;
  for (const p of pedestrians) {
    const dx = p.x - worldX, dy = p.y - worldY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) { bestDist = d; nearest = p; }
  }

  if (!nearest) {
    inspectPopup.style.display = 'none';
    return;
  }
  showInspectPopup(nearest);
}

function showInspectPopup(p: (typeof pedestrians)[0]) {
  if (!inspectPopup) inspectPopup = createInspectPopup();

  const phase    = titleCase(p.getSchedulePhase().replace(/_/g, ' '));
  const activity = p.getActivityLabel();
  const homeName = p.assignedHome >= 0 ? `House ${p.assignedHome + 1}` : '—';
  const type     = p.isClockEligible ? 'Clock performer'
                 : p.hasBicycle      ? 'Cyclist'
                 : p.hasDog          ? 'Dog walker' : 'Resident';
  const isFollowing = followedPedestrian === p;

  inspectPopup.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:#b8d0ff;margin-bottom:5px">${p.name}</div>
    <div><span style="color:#7a94b8">Type:</span> ${type}</div>
    <div><span style="color:#7a94b8">Doing:</span> ${activity}</div>
    <div><span style="color:#7a94b8">Schedule:</span> ${phase}</div>
    <div style="margin-bottom:8px"><span style="color:#7a94b8">Home:</span> ${homeName}</div>
    <button id="inspect-follow-btn" style="
      width:100%;padding:5px 0;border-radius:6px;border:none;cursor:pointer;
      font-size:11px;font-weight:600;letter-spacing:0.03em;
      background:${isFollowing ? 'rgba(255,80,80,0.22)' : 'rgba(90,140,255,0.22)'};
      color:${isFollowing ? '#ff9090' : '#90b8ff'};
      border:1px solid ${isFollowing ? 'rgba(255,80,80,0.32)' : 'rgba(90,140,255,0.32)'};
    ">${isFollowing ? '✕  Stop following' : '➤  Follow'}</button>
  `;

  document.getElementById('inspect-follow-btn')?.addEventListener('click', () => {
    if (followedPedestrian === p) {
      stopFollowing();
      showInspectPopup(p); // refresh button state in popup
    } else {
      startFollowing(p); // hides popup, shows chip
    }
  });

  // Position beside the pedestrian, clamped to viewport
  const sx = p.x * zoom + panX, sy = p.y * zoom + panY;
  const pw = 196, ph = 148;
  let left = sx + 16, top = sy - ph / 2;
  if (left + pw > window.innerWidth - 10) left = sx - pw - 16;
  if (top < 8) top = 8;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  inspectPopup.style.left = `${left}px`;
  inspectPopup.style.top  = `${top}px`;
  inspectPopup.style.display = 'block';

  // Auto-dismiss after 5 s when not following
  clearTimeout((inspectPopup as any)._hideTimeout);
  (inspectPopup as any)._hideTimeout = setTimeout(() => {
    if (inspectPopup) inspectPopup.style.display = 'none';
  }, 5000);
}

createOptionsUI();
resize();
requestAnimationFrame(loop);
