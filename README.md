# City Clock

A procedurally generated top-down city where pedestrians form a digital clock in the central plaza.

**[Live Demo](https://digitalurban.github.io/city-clock/)**

![Pedestrians forming the current time in the plaza](screenshots/clock-mode.jpg)
*Pedestrians assemble into a 4-digit time display each minute. Zoom in/out with scroll wheel or pinch.*

![City life around the plaza](screenshots/city-life.jpg)
*Between clock formations, pedestrians wander the city — visiting venues, riding bicycles, and heading home.*

## Features

- **Live clock** - 112 pedestrians form seven-segment digits showing the current time (HH:MM) for 15 seconds each minute
- **Alarm System** - Set a custom time via the Options menu to trigger an alarm `mp3`, causing the entire city population to dance in the plaza, complete with a 9-minute snooze button
- **Double-tap to show time** - Double-tap or double-click anywhere to force the clock formation immediately
- **Procedural city** - grid of city blocks, roads, crosswalks, trees, parks and coloured buildings generated to fill the world
- **Central plaza** - ringed by named venues (cafes, bars, bookshops, flower shops) with outdoor seating, benches, and lamp posts
- **Pedestrian life** - pedestrians wander sidewalks, visit venues, queue and sit outside, go home to their assigned houses via garden paths, and ride bicycles (~15%). They now also have simulated Needs (Energy, Hunger, Social) with thought bubbles guiding their routines.
- **Dog walkers** - ~10% of pedestrians walk dogs on leashes; dogs pull ahead with animated trotting legs, floppy ears, wagging tails, and side-to-side sniffing wander
- **City birds** - seagull flocks sweep across the city using boid flocking (separation, alignment, cohesion); birds perch on trees and benches, scatter when pedestrians approach, and are drawn with parallax height — shadows on the ground separate from birds soaring above rooftops. Wings attach at the shoulder for anatomically correct flight silhouettes. Occasionally a bird feeder event attracts the flock to the plaza
- **Construction site** - one city block is a construction zone with dirt ground, a partial concrete frame, orange/white safety barriers, material piles, and a slowly rotating crane
- **Dynamic City Events** - street musicians and protests occasionally spawn in the plaza, drawing nearby crowds of pedestrians to watch and interact
- **Service & Delivery Vehicles** - orange delivery vans enter the plaza, park outside a venue to drop off packages. City buses (red/blue) and garbage trucks (green) navigate the road network with unique behaviours.
- **Emergency vehicles** - police cars, ambulances and fire trucks with flashing sirens.
- **Traffic system** - cars navigate the road network with traffic lights, braking for pedestrians and each other, smooth quadratic Bézier arc turns at junctions, and anti-gridlock logic.
- **Day/night cycle** - real-time lighting based on system clock; deep dark-blue night sky with procedural stars and a crescent moon; street lights and plaza lamps cast distinct warm pools through the darkness; building windows glow in three colour temperatures (incandescent, daylight, TV-blue) on realistic occupancy schedules; car headlight beams cut through the night; all rendered in a correct depth order so light sources punch through the darkness rather than being dimmed by it.
- **Weather** - procedural clouds with realistic multi-lobe shapes, 3D shading, and ground shadows drifting across the city.
- **Zoom and pan** - scroll-wheel zoom, click-drag pan, touch pinch and drag on mobile
- **Adjustable population** - settings panel to control traffic (10-300) and people (112-500) counts live
- **iOS PWA** - add to home screen on Safari for fullscreen standalone experience; handles orientation changes and visualViewport resizing

## How It Works

### The Clock Mechanism

Pedestrians wander the city autonomously, but at the start of every minute 112 clock-eligible pedestrians are summoned to form a seven-segment digital clock in the central plaza. Double-tap or double-click anywhere to trigger the formation immediately without waiting for the next minute.

**Timing cycle (each minute):**
- **Seconds 0-15**: Clock-eligible pedestrians move to their assigned segment positions, forming the current time (HH:MM) as four large digits
- **Seconds 15-59**: All pedestrians are released back to autonomous wandering

**Seven-segment display**: Each digit uses 7 segments (like a classic digital watch). Each segment is assigned 4 pedestrians, so each digit needs up to 28 pedestrians. Four digits = 112 clock-eligible pedestrians total.

### Pedestrian Behaviour

Pedestrians use a steering-behaviours model with multiple activity types:

- **Waypoint following** - pick random sidewalk and plaza waypoints and walk toward them
- **Separation** - repel nearby pedestrians to avoid clumping
- **Venue visits** - queue outside cafes and shops, sit at outdoor seating
- **Going home** - each pedestrian has an assigned house; they walk to the garden path, enter through the front door, stay inside, then leave
- **Bicycle riding** - ~15% of pedestrians ride bicycles at 2.5x walking speed
- **Building and venue avoidance** - steering forces keep pedestrians on sidewalks and paths with velocity damping to prevent oscillation at road edges

### City Generation

The city world is 2x the viewport in each dimension, so zooming out reveals the wider city while the plaza stays centred.

- **Grid layout**: 12×7 grid of 120px blocks + 36px roads
- **Central plaza**: rectangular plaza occupying the central grid area with venues on all sides
- **Residential areas**: houses with gardens and garden paths connecting to sidewalks
- **Parks**: green spaces with trees scattered through the city
- **Road network**: roads at every grid edge with lane markings, crosswalks, and traffic lights at intersections
- **Venues**: cafes, bars, bookshops, restaurants and flower shops around the plaza perimeter with striped awnings and parasol seating

### Cars and Delivery Vehicles

Configurable from 10 to 300 vehicles including delivery vans and emergency services:

- **Normal cars** - scan ahead for pedestrians and other cars, brake proportionally; smooth Bézier curve turns at junctions; headlight beams at night
- **Delivery vans** - navigate to the plaza via a dedicated entry stub road, drive around the plaza perimeter in front of shops, drop visible packages at venue fronts, then exit and rejoin the main road network. Pedestrians flee from delivery trucks inside the plaza.
- **Specialized Service Vehicles** - city buses that pause at intersections to simulate pickups, and garbage trucks that slowly traverse the city.
- **Emergency vehicles** - police, ambulance and fire trucks with flashing light bars and sirens
- **Traffic lights** - alternating red/green phases at intersections; cars clear intersections before stopping
- **Anti-gridlock** - cross-traffic detection prevents deadlocks; stuck vehicles teleport to clear roads after timeout

### Day/Night Cycle

Real-time based on system clock:
- **8am-5pm**: Full daylight
- **5pm-9pm**: Gradual dusk
- **9pm-5am**: Night (60% darkness)
- **5am-8am**: Dawn

At night: a deep blue-black sky reveals procedural stars and a crescent moon above the rooftops. Buildings darken significantly with scattered lit windows in three colour temperatures (warm incandescent, cool daylight, blue TV glow) on realistic occupancy schedules. Street lights and plaza lamps cast focused warm pools through the darkness. Car headlight beams sweep ahead of each vehicle. All light sources are composited after the dark overlay so they genuinely cut through the night rather than being muted by it.

### Weather

Dynamic live weather powered by the Open-Meteo API:
- **Location Setting:** Allows testing specific weather conditions manually globally
- **Rich Conditions:** Supports clear, cloudy, fog, drizzle, rain, heavy rain, thunderstorms, snow, heavy snow, and hail based on realtime WMO codes
- **Atmospheric Effects:**
  - Procedural parallax clouds darken dynamically into storm clouds and drift over the city in top-down volumetric rendering
  - Rain and hail particles fall visibly below the cloud layer, dynamically bouncing and melting on the plaza
  - Widespread reflective puddles with sky and building silhouette reflections, ripple rings, and splash effects that dry gradually over time
  - Ground accumulative snow cover creates spreading white patches
  - Jagged lightning flash overlays during thunderstorms
- **Responsive Pedestrians:** 100% of pedestrians deploy colorful umbrellas in the rain or snow, and dynamically sprint for cover or adjust walking pace depending on the weather intensity (drizzle, heavy rain, hail, slippery snow).

### Rendering Architecture

1. **Static canvas** - roads, sidewalks, crosswalks, plaza, buildings, houses, venues, parks, stars and moon pre-rendered to an offscreen canvas; rebuilt only when the lighting level changes
2. **Dynamic layer** - cars, pedestrians, dogs, dropped packages, construction crane, bird shadows, animated tree sway, and birds (drawn above weather with parallax height) rendered fresh each frame
3. **Light pass** - street lights, plaza lamp glows, and car headlight beams drawn after the night overlay so they punch through the darkness correctly
3. **DPR-aware** - canvas resolution scales with devicePixelRatio (capped at 2x) for crisp rendering on Retina displays

### Battery & Performance

City Clock is designed to run efficiently as a always-on wallpaper or bedside clock:

- **Native 60fps** - the render loop runs at the display's native refresh rate for smooth animation; all timers and speeds are tuned for 60fps
- **Visibility pause** - the loop stops entirely when the tab is hidden or the screen is off (via the Page Visibility API), dropping power draw to near zero when no one is watching
- **Cloud caching** - each cloud is pre-rendered to an offscreen canvas and cached; only rebuilt when storm intensity changes the cloud colour. Eliminates ~200 `createRadialGradient` calls per frame
- **Idle particle skip** - the 2000-particle rain pool is only iterated during active precipitation; clear weather skips the loop entirely
- **Single `Date.now()` per frame** - shared time value computed once before the particle loop rather than per-particle

## Tech Stack

- **TypeScript** + **Vite** for development and bundling
- **HTML Canvas 2D** for all rendering (no WebGL, no libraries)
- Zero runtime dependencies

## Running Locally

```bash
git clone https://github.com/digitalurban/city-clock.git
cd city-clock
npm install
npm run dev
```

## Building

```bash
npm run build
```

Output goes to `dist/`.
