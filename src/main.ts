import { CityLayout } from './city/CityLayout';
import { Pedestrian, clearPedestrianState } from './entities/Pedestrian';
import { Car } from './entities/Car';
import { Bird, Flock, createFlock, createSparrowFlock, updateBirdFeeder, birdFeederActive, birdFeederX, birdFeederY } from './entities/Bird';
import { ChimneySmoke } from './rendering/ChimneySmoke';
import { ClockManager } from './clock/ClockManager';
import { DayNightCycle } from './rendering/DayNightCycle';
import { Weather } from './rendering/Weather';
import { AudioEngine } from './rendering/AudioEngine';
import { getActiveHoliday, drawHolidayDecorations, type Holiday } from './rendering/HolidayDecorations';
import { TOTAL_PEDESTRIANS, CLOCK_ELIGIBLE_COUNT, TOTAL_CARS, setTotalPedestrians, setTotalCars, SEPARATION_RADIUS } from './utils/constants';
import { SpatialGrid } from './utils/SpatialGrid';

const canvas = document.getElementById('cityCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

// --- Procedural audio ---
const audioEngine = new AudioEngine();
document.addEventListener('click', () => audioEngine.resume(), { once: true });
document.addEventListener('touchstart', () => audioEngine.resume(), { once: true });


// Cached screen-space gradients — rebuilt only on resize, not every frame.
// Creating new gradient objects each frame is CPU-heavy on Safari (not GPU-accelerated).
let cachedWetSheen: CanvasGradient | null = null;
let cachedGradientW = 0;
let cachedGradientH = 0;

function rebuildCachedGradients() {
  const vw = canvas.width;
  cachedWetSheen = ctx.createLinearGradient(0, 0, vw, 0);
  cachedWetSheen.addColorStop(0,   'rgba(100,130,180,0)');
  cachedWetSheen.addColorStop(0.3, 'rgba(140,170,220,1)');
  cachedWetSheen.addColorStop(0.7, 'rgba(100,130,180,1)');
  cachedWetSheen.addColorStop(1,   'rgba(100,130,180,0)');
  cachedGradientW = vw;
  cachedGradientH = canvas.height;
}

let layout: CityLayout;
let pedestrians: Pedestrian[] = [];
// Spatial grid rebuilt each frame for O(n) pedestrian separation (replaces O(n²) brute force)
let pedGrid: SpatialGrid<Pedestrian> | null = null;
let cars: Car[] = [];
let flocks: Flock[] = [];
let sparrowFlocks: Flock[] = [];
const chimneySmoke = new ChimneySmoke();
const clockManager = new ClockManager();
const dayNight = new DayNightCycle();
const weather = new Weather();

/// Traffic light phase: cycles 0→1 over ~8 seconds
let trafficPhase = 0;

// Holiday decorations — recalculated once per minute
let activeHoliday: Holiday | null = getActiveHoliday();
let lastHolidayCheckMinute = -1;

// Snow accumulation — increases while snowing, melts when weather changes
let snowAccumulation = 0;          // 0–1
let lastStaticSnowAlpha = -1;      // quantised to 0.05 steps to limit rebuilds

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
let lastRushHourSegment = -1; // tracks 10-min time segments for density auto-adjustment
let currentPedCount = TOTAL_PEDESTRIANS;

// Alarm state
let alarmTime: string | null = null;
let isAlarmActive = false;
let isDancing = false;

// Alarm audio — played via Web Audio API so it is never blocked by the browser
// autoplay policy.  The AudioContext is created during the "Set" button click
// (a user gesture) and kept alive; nodes on it can be started from any callback.
let alarmAudioCtx: AudioContext | null = null;
let alarmBuffer: AudioBuffer | null = null;       // decoded alarm.mp3
let alarmSourceNode: AudioBufferSourceNode | null = null; // currently playing node

/** Fetch and decode alarm.mp3 into the Web Audio buffer (called after ctx is created). */
async function loadAlarmBuffer() {
  if (!alarmAudioCtx || alarmBuffer) return;
  try {
    const resp = await fetch('./alarm.mp3');
    const ab = await resp.arrayBuffer();
    alarmBuffer = await alarmAudioCtx.decodeAudioData(ab);
  } catch (_) {
    // File missing or decode failed — ringAlarm() will fall back to beeps
  }
}

/** Start looping alarm.mp3 (or beeps if the file isn't available). */
function ringAlarm() {
  if (!alarmAudioCtx) return;
  const ctx = alarmAudioCtx;
  if (ctx.state === 'suspended') ctx.resume();

  if (alarmBuffer) {
    // Play the actual alarm.mp3 in a loop via AudioBufferSourceNode
    const src = ctx.createBufferSource();
    src.buffer = alarmBuffer;
    src.loop = true;
    src.connect(ctx.destination);
    src.start();
    alarmSourceNode = src;
  } else {
    // Fallback: synthesised beep pattern
    ringAlarmBeepBurst();
  }
}

let alarmBeepHandle: ReturnType<typeof setTimeout> | null = null;

function ringAlarmBeepBurst() {
  if (!isAlarmActive || !alarmAudioCtx) return;
  const ctx = alarmAudioCtx;
  const t = ctx.currentTime;
  [[880, 0], [1100, 0.22]].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t + offset);
    g.gain.linearRampToValueAtTime(0.45, t + offset + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t + offset); osc.stop(t + offset + 0.2);
  });
  alarmBeepHandle = setTimeout(ringAlarmBeepBurst, 900);
}

/** Stop the alarm (both mp3 and beep fallback). */
function stopAlarmRing() {
  if (alarmSourceNode) {
    try { alarmSourceNode.stop(); } catch (_) {}
    alarmSourceNode = null;
  }
  if (alarmBeepHandle !== null) { clearTimeout(alarmBeepHandle); alarmBeepHandle = null; }
}

/**
 * Called during the "Set" button click (user gesture).
 * Creates the AudioContext, starts loading alarm.mp3, and plays a confirmation chirp.
 */
function playAlarmSetBeep() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!alarmAudioCtx) {
      alarmAudioCtx = new AC();
      loadAlarmBuffer(); // kick off async fetch+decode while context is warm
    }
    if (alarmAudioCtx.state === 'suspended') alarmAudioCtx.resume();
    const ctx = alarmAudioCtx;
    const t = ctx.currentTime;

    // Quick ascending two-tone confirmation chirp
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1100, t + 0.12);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.3);
  } catch (_) {}
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
  audioEngine.resume();
  audioEngine.resume();
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
  audioEngine.resume();
  audioEngine.resume();
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
    <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
      <span>Sound</span>
      <button id="audio-toggle" style="
        background: #4a9eff; color: white; border: none; border-radius: 20px;
        padding: 4px 14px; cursor: pointer; font-size: 13px; font-weight: bold;
        min-width: 64px; transition: background 0.2s;">🔊 On</button>
    </div>
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
    <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
      <span>City Info</span>
      <button id="city-info-toggle" style="
        background: #444; color: #aaa; border: none; border-radius: 20px;
        padding: 4px 14px; cursor: pointer; font-size: 13px; font-weight: bold;
        min-width: 64px; transition: background 0.2s;">🏙 Off</button>
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

  // City Info toggle handler
  const cityInfoToggle = panel.querySelector('#city-info-toggle') as HTMLButtonElement;
  cityInfoToggle.addEventListener('click', () => {
    _cityInfoEnabled = !_cityInfoEnabled;
    cityInfoToggle.style.background = _cityInfoEnabled ? '#2a7a48' : '#444';
    cityInfoToggle.style.color = _cityInfoEnabled ? '#d4f5e0' : '#aaa';
    cityInfoToggle.textContent = _cityInfoEnabled ? '🏙 On' : '🏙 Off';
    if (_cityInfoEnabled) {
      showToast('🏙 City Information Stream', 'Welcome to the City Information Stream', 4000);
    } else {
      for (const t of [..._activeToasts]) {
        t.classList.remove('city-toast--visible');
      }
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
    audioEngine.resume(); // Unlock ambient AudioContext from user gesture
    if (alarmTime) {
      // Clear alarm
      alarmTime = null;
      alarmBtn.textContent = 'Set';
      alarmStatusLabel.textContent = 'Off';
      isAlarmActive = false;
      isDancing = false;
      stopAlarmRing();
      layout.stopBandstand();
      // Hide the entire alarm-controls overlay so both buttons reappear next time
      const alarmControls = document.getElementById('alarm-controls');
      if (alarmControls) alarmControls.style.display = 'none';
      alarmBtn.style.background = '#4a9eff';
    } else {
      if (alarmTimeInput.value) {
        alarmTime = alarmTimeInput.value;
        alarmBtn.textContent = 'Clear';
        alarmBtn.style.background = '#ff4a4a';
        alarmStatusLabel.textContent = alarmTime;
        // Confirmation beep — also creates/warms the AudioContext in this
        // user-gesture handler so it is ready when the alarm fires from rAF.
        playAlarmSetBeep();
      }
    }
  });

  // Audio toggle
  const audioToggleBtn = panel.querySelector('#audio-toggle') as HTMLButtonElement;
  audioToggleBtn.addEventListener('click', () => {
    audioEngine.resume(); // Unlock AudioContext from user gesture
    const nowMuted = !audioEngine.muted;
    audioEngine.setMuted(nowMuted);
    audioToggleBtn.textContent = nowMuted ? '🔇 Off' : '🔊 On';
    audioToggleBtn.style.background = nowMuted ? '#555' : '#4a9eff';
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
    const p = pedestrians[pedestrians.length - 1];
    // Stop following this pedestrian before removing it
    if (p === followedPedestrian) stopFollowing();
    // Sever all cross-references (groupFollowers, groupLeader, bench, queue)
    // so the object is immediately eligible for GC. Without this, other
    // pedestrians hold references to the removed object keeping it alive,
    // causing heap growth that never recovers even when the slider drops back.
    p.dispose();
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
  // (Re)create spatial grid sized to layout — cell size = separation radius for tight O(1) cells
  pedGrid = new SpatialGrid<Pedestrian>(SEPARATION_RADIUS, layout.width);
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

  // Sky/ground base — subtle gradient from slightly darker top to lighter bottom
  const skyBase = dayNight.getSkyColor(nightAlpha);
  const skyGrad = sctx.createLinearGradient(0, 0, 0, worldH);
  skyGrad.addColorStop(0, skyBase);
  // Shift lightness ~8% brighter toward the "horizon" (bottom of the top-down view)
  const skyBrighter = dayNight.getSkyColorOffset(nightAlpha, 0.08);
  skyGrad.addColorStop(1, skyBrighter);
  sctx.fillStyle = skyGrad;
  sctx.fillRect(0, 0, worldW, worldH);

  // Render layers
  layout.drawRoads(sctx, nightAlpha);
  layout.drawSidewalks(sctx, nightAlpha);
  layout.drawCrosswalks(sctx, nightAlpha);
  layout.drawPlaza(sctx, nightAlpha);

  // Draw parks before buildings so buildings render on top
  layout.drawParks(sctx, nightAlpha);

  layout.drawPlazaBenches(sctx, nightAlpha);
  layout.drawFountainBasin(sctx, nightAlpha);
  layout.drawRailwayCorridor(sctx, nightAlpha); // base fill first, before houses
  layout.drawBranchRailwayCorridor(sctx, nightAlpha); // branch corridor (col 2)
  layout.drawShadows(sctx, nightAlpha);
  layout.drawBuildings(sctx, nightAlpha);
  layout.drawBuildingRooftops(sctx, nightAlpha);
  layout.drawSnowCover(sctx, snowAccumulation);
  layout.drawHouses(sctx, nightAlpha);
  // House windows — baked into static canvas so lit windows are stable light
  // sources. At deep night all residents are home; using a full set avoids
  // per-frame occupancy changes that caused window shimmer.
  if (nightAlpha > 0.05) {
    const allHouseIndices = new Set(layout.houses.map((_, i) => i));
    layout.drawHouseWindows(sctx, nightAlpha, allHouseIndices);
  }
  layout.drawVenues(sctx, nightAlpha);
  layout.drawDeliveryLanes(sctx, nightAlpha); // on top of venues so stub is visible
  layout.drawPlazaLampPosts(sctx, nightAlpha);
  layout.drawTrainStation(sctx, nightAlpha);
  layout.drawBranchStation(sctx, nightAlpha);

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

  // Rush-hour density — auto-adjust pedestrian and car counts every 10 minutes
  {
    const _h = new Date();
    const hour = _h.getHours() + _h.getMinutes() / 60;
    const segment = Math.floor(hour * 6); // 10-minute granularity
    if (segment !== lastRushHourSegment) {
      lastRushHourSegment = segment;
      let pedMult: number, carMult: number;
      if      (hour < 5)  { pedMult = 0.22; carMult = 0.15; } // dead of night
      else if (hour < 7)  { pedMult = 0.48; carMult = 0.45; } // early morning
      else if (hour < 9)  { pedMult = 1.30; carMult = 1.40; } // morning rush hour
      else if (hour < 17) { pedMult = 1.00; carMult = 1.00; } // working day
      else if (hour < 19) { pedMult = 1.28; carMult = 1.35; } // evening rush hour
      else if (hour < 22) { pedMult = 0.75; carMult = 0.60; } // evening wind-down
      else                { pedMult = 0.35; carMult = 0.28; } // late night
      adjustPedCount(Math.round(TOTAL_PEDESTRIANS * pedMult));
      adjustCarCount(Math.round(TOTAL_CARS * carMult));
    }
  }

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

  // Update snow accumulation
  {
    const wt = weather.type;
    const isSnowing = wt === 'snow' || wt === 'heavy_snow';
    if (isSnowing) {
      snowAccumulation = Math.min(1, snowAccumulation + 0.00008 * (wt === 'heavy_snow' ? 2 : 1));
    } else {
      snowAccumulation = Math.max(0, snowAccumulation - 0.00004);
    }
  }

  // Rebuild static canvas if lighting or snow cover changed significantly,
  // or if zoom has moved far enough from the level it was last rendered at.
  const quantizedAlpha = Math.round(nightAlpha * 20) / 20;
  const quantizedSnow = Math.round(snowAccumulation * 20) / 20;
  const detailMismatch = lastStaticDetailScale > 0 &&
    Math.abs(zoom - lastStaticDetailScale) > 0.18 &&
    staticRebuildTimer === null; // only if no pending debounced rebuild already
  if (quantizedAlpha !== lastStaticNightAlpha || quantizedSnow !== lastStaticSnowAlpha || detailMismatch) {
    lastStaticSnowAlpha = quantizedSnow;
    buildStaticCanvas(nightAlpha);
    // After a mid-gesture detail rebuild, arm the debounce timer so subsequent
    // frames (while pinch is still active) don't each trigger another rebuild.
    if (detailMismatch) scheduleStaticRebuild();
  }

  // Fill entire canvas with sky colour
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = dayNight.getSkyColor(nightAlpha);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply zoom + pan + DPR transform
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);

  // Draw cached static city — medium smoothing is indistinguishable at normal zoom
  // and avoids Safari forcing software Lanczos resampling on the 8MP static canvas.
  if (staticCanvas) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(staticCanvas, 0, 0, layout.width, layout.height);
  }

  // Venue labels — drawn live in world space so text is rasterised at current zoom, never upscaled
  layout.drawVenueLabels(ctx, nightAlpha);
  layout.drawTrainStationLabel(ctx, nightAlpha);
  layout.drawOutdoorSeating(ctx, nightAlpha, weather.type, time);

  // Time-of-day atmosphere (mist, golden hour, Sunday tint) — world space, under everything
  dayNight.drawAtmosphere(ctx, layout.width, layout.height, nightAlpha);

  // Holiday / seasonal decorations — under pedestrians so people walk among them
  {
    const currentMinute = new Date().getMinutes();
    if (currentMinute !== lastHolidayCheckMinute) {
      activeHoliday = getActiveHoliday();
      lastHolidayCheckMinute = currentMinute;
    }
    drawHolidayDecorations(ctx, layout, nightAlpha, time, activeHoliday);
  }


  // Chimney smoke — above rooftops, below everything else
  chimneySmoke.update();
  chimneySmoke.draw(ctx);

  // Roadside bins — update respawn timers and draw before pedestrians
  layout.updateBins();
  layout.drawBins(ctx, nightAlpha);

  // Market stalls and morning newsstand — drawn in plaza before pedestrians
  layout.drawMarket(ctx, nightAlpha);
  layout.drawSundayMarket(ctx, nightAlpha);
  layout.drawNewstand(ctx, nightAlpha);

  // Ice cream van
  layout.updateIceCreamVan(weather.type);
  layout.drawIceCreamVan(ctx, nightAlpha);

  // Train station — animated train + passenger cycle
  layout.updateTrain();
  layout.drawTrain(ctx, nightAlpha);
  layout.updateBranchTrain();
  layout.drawBranchTrain(ctx, nightAlpha);

  // When train arrives: send 3–5 waiting pedestrians to platform, then board
  if (layout.trainJustArrived) {
    // 1. Spawn 3-5 new arrivals from the train onto the platform, heading into city
    const arrivalCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < arrivalCount; i++) {
      const p = new Pedestrian(layout, pedestrians.length, CLOCK_ELIGIBLE_COUNT);
      const plat = layout.getRandomPlatformPosition();
      p.x = plat.x;
      p.y = plat.y;
      p.vx = 0; p.vy = 0;
      p.isAlighting = true;
      p.alightTimer = 120 + Math.floor(Math.random() * 180);
      const wp = layout.getRandomSidewalkWaypoint();
      p.waypointX = wp.x;
      p.waypointY = wp.y;
      pedestrians.push(p);
    }
    // 2. Pull 3-5 idle city pedestrians toward the platform to board
    let boardCount = 3 + Math.floor(Math.random() * 3);
    for (const p of pedestrians) {
      if (boardCount <= 0) break;
      if (p.isClockEligible || p.isAtHome || p.isAtWorkplace || p.isBoarding
          || p.isOnPlatform || p.isHeadingToPlatform || p.isAlighting) continue;
      // Clear busy state so they can move
      p.isSitting = false; p.isBenchSitting = false; p.isQueuing = false;
      p.isWindowShopping = false; p.isCheckingPhone = false; p.socialMode = false;
      p.isBrowsingMarket = false; p.isSheltering = false;
      const plat = layout.getRandomPlatformPosition();
      p.isHeadingToPlatform = true;
      p.waypointX = plat.x;
      p.waypointY = plat.y;
      p.waypointTimer = 0;
      boardCount--;
    }
  }

  // When train departs: remove pedestrians on platform (they've boarded)
  if (layout.trainJustDeparted) {
    const nextMins = Math.round(layout.trainCooldown / 3600);
    showToast('🚂 Train departed', `Central Station: Service has departed. Next train in approximately ${nextMins} min.`, 8000);
    for (let i = pedestrians.length - 1; i >= 0; i--) {
      const p = pedestrians[i];
      if (p.isOnPlatform || p.isHeadingToPlatform) {
        p.dispose();
        pedestrians.splice(i, 1);
      }
    }
    // Also start boarding animation for any still on platform
  }

  // Tick boarding: pedestrians waiting on platform start boarding when train departs
  if (layout.trainState === 'departing') {
    for (const p of pedestrians) {
      if (p.isOnPlatform && !p.isBoarding) {
        p.isOnPlatform = false;
        p.isBoarding = true;
        p.boardTimer = 60 + Math.floor(Math.random() * 40);
        const cx = layout.stationX + layout.stationW / 2;
        p.waypointX = cx + (Math.random() - 0.5) * 60;
        p.waypointY = layout.trainTrackY;
      }
    }
  }

  // Remove pedestrians who have finished boarding
  for (let i = pedestrians.length - 1; i >= 0; i--) {
    if (pedestrians[i].isBoarding && pedestrians[i].boardTimer <= 0) {
      pedestrians[i].dispose();
      pedestrians.splice(i, 1);
    }
  }

  // --- Branch Train Boarding Logic ---
  if (layout.branchTrainJustArrived) {
    const arrivalCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < arrivalCount; i++) {
      const p = new Pedestrian(layout, pedestrians.length, CLOCK_ELIGIBLE_COUNT);
      const plat = layout.getRandomBranchPlatformPosition();
      p.x = plat.x;
      p.y = plat.y;
      p.vx = 0; p.vy = 0;
      p.isAlightingBranch = true;
      p.alightBranchTimer = 120 + Math.floor(Math.random() * 180);
      const wp = layout.getRandomSidewalkWaypoint();
      p.waypointX = wp.x;
      p.waypointY = wp.y;
      pedestrians.push(p);
    }
    let boardCount = 2 + Math.floor(Math.random() * 3);
    for (const p of pedestrians) {
      if (boardCount <= 0) break;
      if (p.isClockEligible || p.isAtHome || p.isAtWorkplace || p.isBoarding || p.isBoardingBranch
          || p.isOnPlatform || p.isHeadingToPlatform || p.isAlighting
          || p.isOnBranchPlatform || p.isHeadingToBranchPlatform || p.isAlightingBranch) continue;
      p.isSitting = false; p.isBenchSitting = false; p.isQueuing = false;
      p.isWindowShopping = false; p.isCheckingPhone = false; p.socialMode = false;
      p.isBrowsingMarket = false; p.isSheltering = false;
      const plat = layout.getRandomBranchPlatformPosition();
      p.isHeadingToBranchPlatform = true;
      p.waypointX = plat.x;
      p.waypointY = plat.y;
      p.waypointTimer = 0;
      boardCount--;
    }
  }

  if (layout.branchTrainJustDeparted) {
    const nextMins = Math.round(layout.branchTrainCooldown / 3600);
    showToast('🚂 Branch line departed', `West Street: Service has departed. Next train in approximately ${nextMins} min.`, 8000);
    for (let i = pedestrians.length - 1; i >= 0; i--) {
      const p = pedestrians[i];
      if (p.isOnBranchPlatform || p.isHeadingToBranchPlatform) {
        p.dispose();
        pedestrians.splice(i, 1);
      }
    }
  }

  if (layout.branchTrainState === 'outbound') {
    for (const p of pedestrians) {
      if (p.isOnBranchPlatform && !p.isBoardingBranch) {
        p.isOnBranchPlatform = false;
        p.isBoardingBranch = true;
        p.boardBranchTimer = 60 + Math.floor(Math.random() * 40);
        const cy = layout.branchStationY + layout.branchStationH / 2;
        p.waypointX = layout.branchTrackX;
        p.waypointY = cy + (Math.random() - 0.5) * 60;
      }
    }
  }

  for (let i = pedestrians.length - 1; i >= 0; i--) {
    if (pedestrians[i].isBoardingBranch && pedestrians[i].boardBranchTimer <= 0) {
      pedestrians[i].dispose();
      pedestrians.splice(i, 1);
    }
  }
  // -----------------------------------

  // Fountain — update on/off cycle and draw spray above the static basin
  layout.updateFountain();
  layout.drawFountainSpray(ctx, nightAlpha);

  // Busker update + draw (after market stalls so they layer correctly)
  layout.updateBusker();
  layout.drawBusker(ctx, nightAlpha, zoom);

  // Bandstand — only visible while the alarm is active
  layout.updateBandstand();
  layout.drawBandstand(ctx, nightAlpha, zoom);

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
      // Ring using the Web Audio context that was created during the "Set"
      // button click — nodes on a user-gesture-created context are never
      // blocked by autoplay policy, even when called from a rAF callback.
      ringAlarm();
      layout.startBandstand();

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
          stopAlarmRing();
          layout.stopBandstand();
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
          stopAlarmRing();
          layout.stopBandstand();
          alarmTime = null; // Clear the alarm
          alarmControls!.style.display = 'none';

          const status = document.getElementById('alarm-status-label');
          const alarmBtnEl = document.getElementById('alarm-btn') as HTMLButtonElement | null;
          if (status) status.textContent = 'Off';
          if (alarmBtnEl) { alarmBtnEl.textContent = 'Set'; alarmBtnEl.style.background = '#4a9eff'; }
        });
      }
      // Always restore snooze visibility (it may have been hidden by a previous
      // panel-clear or an earlier snooze+dismiss cycle)
      const snoozeEl = document.getElementById('snooze-btn') as HTMLElement | null;
      if (snoozeEl) snoozeEl.style.display = '';
      alarmControls.style.display = 'flex';
    }
  }

  // Rebuild spatial grid once per frame — O(n), GC-free after warmup (arrays reused)
  if (pedGrid) { pedGrid.clear(); for (const p of pedestrians) pedGrid.add(p); }

  // Viewport culling bounds in world space (with 60px buffer for thought bubbles / umbrellas)
  const cullMargin = 60;
  const visLeft   = (-panX / zoom) - cullMargin;
  const visTop    = (-panY / zoom) - cullMargin;
  const visRight  = visLeft + (w / zoom) + cullMargin * 2;
  const visBottom = visTop  + (h / zoom) + cullMargin * 2;

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
      cars,
      pedGrid ?? undefined
    );
    // Skip draw if off-screen (culling) — update still runs for correct simulation
    if (p.x >= visLeft && p.x <= visRight && p.y >= visTop && p.y <= visBottom) {
      p.draw(ctx, nightAlpha, weather.intensity, isDancing, zoom);
    }
  }

  // Draw branch station building over the pedestrians so they go under the roof
  layout.drawBranchStationBuilding(ctx, nightAlpha);
  layout.drawBranchStationLabel(ctx, nightAlpha);

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
  // Clean up inactive flocks — splice in-place to avoid array allocation
  for (let i = flocks.length - 1; i >= 0; i--) { if (!flocks[i].active) flocks.splice(i, 1); }

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
  for (let i = sparrowFlocks.length - 1; i >= 0; i--) { if (!sparrowFlocks[i].active) sparrowFlocks.splice(i, 1); }

  // Trees on top (canopies)
  layout.drawTrees(ctx, time, nightAlpha);

  // Update and draw dynamic events (in world space, underneath weather/UI)
  if (nightAlpha < 0.3 && !layout.activeEvent && Math.random() < 0.00025) {
    layout.startEvent(Math.random() < 0.5 ? 'musician' : 'protest');
  }
  layout.updateEvent();
  layout.drawEvent(ctx, nightAlpha, zoom);

  // Traffic lights
  layout.drawTrafficLights(ctx, nightAlpha, trafficPhase);

  // Weather effects in world space
  weather.drawWorldEffects(ctx, nightAlpha);

  // Fog tendrils (screen space, after world effects)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  weather.drawFogTendrils(ctx, canvas.width, canvas.height, nightAlpha);
  // Restore world transform for sparrow/seagull flocks
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);

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

  // Wet road sheen — pass cached gradient so Weather doesn't create one per frame
  weather.drawWetSheen(ctx, canvas.width, canvas.height, cachedWetSheen);


  // Rebuild cached gradients on first frame or if canvas was resized
  if (canvas.width !== cachedGradientW || canvas.height !== cachedGradientH) {
    rebuildCachedGradients();
  }


  // Update audio
  if (audioEngine.isActive) {
    const _now = new Date();
    const hour = _now.getHours() + _now.getMinutes() / 60;
    audioEngine.update(weather.type, weather.intensity, nightAlpha, hour, layout.fountainActive);
    if (weather.type === 'thunderstorm' && Math.random() < 0.003) {
      audioEngine.triggerThunder(Math.random() * 1.5);
    }
  }

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  resize();
  rebuildCachedGradients();
  // postProcess.resize(canvas.width, canvas.height);
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

// ==================== Toast notification system ====================

// Inject shared toast styles once
const _toastStyle = document.createElement('style');
_toastStyle.textContent = `
  .city-toast {
    position: fixed;
    left: 16px;
    z-index: 300;
    max-width: 280px;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(10, 12, 22, 0.88);
    color: #e8ecf4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.45;
    box-shadow: 0 4px 18px rgba(0,0,0,0.55);
    border: 1px solid rgba(100,130,200,0.18);
    pointer-events: none;
    transform: translateX(-110%);
    /* bottom is also transitioned so that existing visible toasts slide upward
       smoothly when a new toast is added, instead of jumping instantly. */
    transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease,
                bottom 0.25s ease;
    opacity: 0;
  }
  .city-toast.city-toast--visible {
    transform: translateX(0);
    opacity: 1;
  }
  .city-toast .toast-title {
    font-weight: 600;
    color: #b8d0ff;
    margin-bottom: 3px;
  }
`;
document.head.appendChild(_toastStyle);

// City info enabled flag — controlled from settings panel (off by default)
let _cityInfoEnabled = false;

// Stack management — toasts stack upward from bottom-left
const _activeToasts: HTMLDivElement[] = [];
const TOAST_GAP = 8;
const TOAST_BOTTOM_BASE = 20;
const TOAST_HEIGHT_ESTIMATE = 60; // fallback height (px) before a toast has been measured
const _toastHeights = new WeakMap<HTMLDivElement, number>(); // stable per-toast height cache
let _repositionScheduled = false;

// Throttle repositions to at most once per animation frame so rapid adds/removes
// (e.g. several train events firing together) don't cause mid-transition layout thrash.
function _scheduleRepositionToasts() {
  if (_repositionScheduled) return;
  _repositionScheduled = true;
  requestAnimationFrame(() => {
    _repositionScheduled = false;
    _repositionToasts();
  });
}

function _repositionToasts() {
  // Batch all height reads before writing positions to avoid interleaved
  // forced reflows (layout thrash). Heights are cached on first measurement;
  // adding city-toast--visible only changes transform/opacity — not layout
  // dimensions — so the cached value remains valid for the toast's lifetime.
  for (const t of _activeToasts) {
    if (_toastHeights.get(t) === undefined) {
      const h = t.getBoundingClientRect().height;
      if (h > 0) _toastHeights.set(t, h);
    }
  }
  let bottom = TOAST_BOTTOM_BASE;
  for (let i = _activeToasts.length - 1; i >= 0; i--) {
    const t = _activeToasts[i];
    t.style.bottom = `${bottom}px`;
    const h = _toastHeights.get(t) ?? TOAST_HEIGHT_ESTIMATE;
    bottom += h + TOAST_GAP;
  }
}

function showToast(title: string, body: string, durationMs = 10000) {
  if (!_cityInfoEnabled) return;
  const el = document.createElement('div');
  el.className = 'city-toast';
  el.innerHTML = `<div class="toast-title">${title}</div><div>${body}</div>`;

  // FIX: set style.bottom BEFORE appending to the DOM so the element never
  // renders at the browser's default "auto" position for position:fixed
  // (which resolves to the static-flow position — typically the top of the
  // viewport).  Setting the inline value here suppresses any CSS bottom
  // transition because the element has no prior DOM state to interpolate from;
  // the transition only fires for subsequent changes while the element is live.
  el.style.bottom = `${TOAST_BOTTOM_BASE}px`;

  document.body.appendChild(el);
  _activeToasts.push(el);

  // Reposition all toasts: heights are read and cached here, then bottom
  // values are written.  Existing visible toasts slide smoothly upward via
  // the CSS bottom transition instead of jumping.
  _scheduleRepositionToasts();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('city-toast--visible');

      // Schedule one more reposition in case the first measurement occurred
      // before font metrics were fully resolved on this element (rare on first
      // paint).  Heights are cached by _repositionToasts so this is a no-op
      // when nothing has changed.
      _scheduleRepositionToasts();
    });
  });

  setTimeout(() => {
    el.classList.remove('city-toast--visible');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      el.remove();
      _toastHeights.delete(el);
      const idx = _activeToasts.indexOf(el);
      if (idx !== -1) _activeToasts.splice(idx, 1);
      _scheduleRepositionToasts();
    };

    el.addEventListener('transitionend', cleanup, { once: true });

    // Fallback: if transitionend never fires (browser quirk), force cleanup after ~600ms
    setTimeout(cleanup, 600);
  }, durationMs);
}

// --- Weather change alerts ---
let _lastWeatherType = weather.type;

function _checkWeatherChange() {
  const current = weather.type;
  if (current === _lastWeatherType) return;
  const prev = _lastWeatherType;
  _lastWeatherType = current;

  const weatherLabels: Record<string, string> = {
    clear:       '☀️ Clearing up',
    cloudy:      '☁️ Clouds rolling in',
    rain:        '🌧 Rain moving in',
    thunderstorm:'⛈ Storm approaching',
    snow:        '❄️ Snow falling',
    fog:         '🌫 Fog settling in',
  };

  const weatherDesc: Record<string, string> = {
    clear:       'Skies are clearing. A good time to head outside.',
    cloudy:      'Overcast skies. Rain possible later.',
    rain:        'Umbrellas out — steady rain expected.',
    thunderstorm:'Heavy rain and thunder. Stay sheltered.',
    snow:        'Snowfall across the city. Roads may be slow.',
    fog:         'Low visibility across the district.',
  };

  const title = weatherLabels[current] ?? `🌡 Weather: ${current}`;
  const body = weatherDesc[current] ?? `Conditions changing from ${prev}.`;
  // Weather alerts always show regardless of city info toggle
  const wasEnabled = _cityInfoEnabled;
  _cityInfoEnabled = true;
  showToast(title, body, 10000);
  _cityInfoEnabled = wasEnabled;
}

// --- City fact toasts ---
const CITY_FACTS = [
  ['📍 City founded', "This city's grid was laid out in 1887 by engineer Clara Mott on a former marshland."],
  ['🏛 City Hall', 'The clock tower above City Hall has kept time since 1923 — hand-wound until 1971.'],
  ['🌳 Central Park', "The park's elm trees were planted in 1952 and are now a protected heritage grove."],
  ['🚋 Transport history', 'Horse-drawn trams once ran along Riverside Road until 1934.'],
  ['🏗 Skyline', 'The tallest building on the east block was originally a grain silo, converted in 1988.'],
  ['☕ Café culture', 'More coffee is consumed per capita here than any other city in the region.'],
  ['🎵 Live music', 'The bandstand in Civic Plaza has hosted free concerts every summer since 1961.'],
  ['🌧 Rainfall', 'Average rainfall: 890 mm per year — most falls between October and February.'],
  ['🚴 Cycling', 'The city added 42 km of protected bike lanes between 2015 and 2022.'],
  ['🦆 Wildlife', 'The riverside corridor supports 34 species of birds recorded by local naturalists.'],
  ['📬 Postal routes', 'The central post office processes over 12,000 items daily, down from 80,000 in 1995.'],
  ['🌉 River bridge', 'The main bridge was designed to flex up to 18 cm in high winds — by design.'],
];

let _nextFactTime = Date.now() + (3 + Math.random() * 5) * 60_000; // 3–8 min from load

function _checkCityFact() {
  if (Date.now() < _nextFactTime) return;
  const [title, body] = CITY_FACTS[Math.floor(Math.random() * CITY_FACTS.length)];
  showToast(title, body, 12000);
  _nextFactTime = Date.now() + (3 + Math.random() * 5) * 60_000;
}

// --- Time-of-day event toasts ---
// Each entry fires once when the clock passes the target hour (checked per minute).
const TIME_EVENTS: { hour: number; title: string; body: string }[] = [
  { hour: 7.0,  title: '☕ Morning rush starting', body: 'Coffee queues forming. Foot traffic picking up across the district.' },
  { hour: 8.5,  title: '🚌 Peak commute', body: 'Buses running at capacity. Extra services deployed on the main corridor.' },
  { hour: 12.0, title: '🍱 Lunch hour', body: 'Cafés and food trucks at full swing. Expect queues near the plaza.' },
  { hour: 13.5, title: '🏙 Afternoon settling in', body: 'Post-lunch lull. The city slows for about an hour.' },
  { hour: 17.5, title: '🌆 Evening rush', body: 'Offices emptying out. Train platforms filling up.' },
  { hour: 20.0, title: '🍽 Dinner time', body: 'Restaurant reservations peaking. The plaza fills with evening strollers.' },
  { hour: 23.0, title: '🌙 Night quiet', body: 'The city winds down. Only the night owls remain.' },
];

let _lastEventMinute = -1;
let _firedEventHours = new Set<number>();

function _checkTimeEvents() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const minute = now.getHours() * 60 + now.getMinutes();

  if (minute === _lastEventMinute) return;
  _lastEventMinute = minute;

  // Reset fired set at midnight
  if (now.getHours() === 0 && now.getMinutes() === 0) _firedEventHours.clear();

  for (const ev of TIME_EVENTS) {
    if (!_firedEventHours.has(ev.hour) && hour >= ev.hour && hour < ev.hour + 0.25) {
      _firedEventHours.add(ev.hour);
      showToast(ev.title, ev.body, 10000);
      break; // one event per minute check
    }
  }
}

// --- Flash mob ---
let _flashMobActive = false;
let _nextFlashMobTime = Date.now() + (20 + Math.random() * 40) * 60_000; // 20–60 min from load
let _flashMobEndTime = 0;
const FLASH_MOB_DURATION_MS = (2 + Math.random()) * 60_000; // 2–3 min

function _checkFlashMob() {
  const now = Date.now();

  if (!_flashMobActive && now >= _nextFlashMobTime && !isAlarmActive) {
    _flashMobActive = true;
    _flashMobEndTime = now + FLASH_MOB_DURATION_MS;
    isDancing = true;
    layout.startBandstand();
    showToast('🕺 Flash Mob!', 'A flash mob has broken out in the plaza. Everyone is dancing!', 6000);
    _nextFlashMobTime = now + (20 + Math.random() * 40) * 60_000;
  }

  if (_flashMobActive && now >= _flashMobEndTime && !isAlarmActive) {
    _flashMobActive = false;
    isDancing = false;
    layout.stopBandstand();
    showToast('🏙 Flash mob dispersing', 'The crowd returns to their day.', 4000);
  }
}

// --- Ice cream van arrival toast ---
let _iceCreamWasActive = false;

function _checkIceCreamVan() {
  const active = layout.iceCreamActive;
  if (active && !_iceCreamWasActive) {
    showToast('🍦 Ice cream van!', 'The van has parked up near the plaza. Queue forming.', 5000);
  }
  _iceCreamWasActive = active;
}

// --- Sunday market toast ---
let _sundayMarketToastFired = false;

function _checkSundayMarket() {
  const now = new Date();
  if (now.getDay() !== 0) { _sundayMarketToastFired = false; return; }
  const hour = now.getHours();
  if (hour === 9 && !_sundayMarketToastFired) {
    _sundayMarketToastFired = true;
    showToast('🛍 Sunday Market', 'The Sunday market is open in the plaza. Extra stalls today until 6pm.', 7000);
  }
}

// Hook all checks into the weather.update call site
const _origWeatherUpdate = weather.update.bind(weather);
(weather as any).update = function () {
  _origWeatherUpdate();
  _checkWeatherChange();
  _checkCityFact();
  _checkTimeEvents();
  _checkFlashMob();
  _checkIceCreamVan();
  _checkSundayMarket();
};

createOptionsUI();
resize();
requestAnimationFrame(loop);
