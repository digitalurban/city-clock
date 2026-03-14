# City Clock

A procedurally generated top-down city where pedestrians form a digital clock in the central plaza.

**[Live Demo](https://digitalurban.github.io/city-clock/)**

![Pedestrians forming the current time in the plaza](screenshots/clock-mode.jpg)
*Pedestrians assemble into a 4-digit time display each minute. Zoom in/out with scroll wheel or pinch.*

## Features

- **Live clock** — 112 pedestrians form seven-segment digits showing the current time (HH:MM) for 15 seconds each minute
- **Procedural city** — grid of city blocks, roads, crosswalks, trees and coloured buildings generated to fill the world
- **Central plaza** — ringed by named venues (cafes, bars, bookshops, flower shops) with outdoor seating, benches, and lamp posts
- **Delivery trucks** — orange delivery vans enter the plaza via a dedicated lane, park outside a venue, then return to the road
- **Traffic** — cars navigate the road network, braking for pedestrians and each other, turning at junctions
- **Day/night cycle** — real-time lighting based on system clock; street lights and lamp posts glow at night with radial halos
- **Zoom & pan** — scroll-wheel zoom and touch pinch; zoom out to see the wider city, zoom in for detail

## How It Works

### The Clock Mechanism

160 autonomous pedestrians wander the city, but at the start of every minute 112 are summoned to form a seven-segment digital clock in the central plaza.

**Timing cycle (each minute):**
- **Seconds 0–15**: Clock-eligible pedestrians move to their assigned segment positions, forming the current time (HH:MM) as four large digits
- **Seconds 15–59**: All pedestrians are released back to autonomous wandering

**Seven-segment display**: Each digit uses 7 segments (like a classic digital watch). Each segment is assigned 4 pedestrians (`PEDS_PER_SEGMENT`), so each digit needs up to 28 pedestrians. Four digits = 112 clock-eligible pedestrians total.

**Digit formation**: When a segment is active, its 4 pedestrians spread evenly along the segment line. When inactive, they are dismissed to stable, deterministic edge positions so they don't jitter between frames.

**Responsive scaling**: Digit dimensions are calculated dynamically from the plaza size (55% width, 45% height) so the clock fits comfortably at any screen resolution.

### Pedestrian Behaviour

Pedestrians use a steering-behaviours model:

1. **Waypoint following** — Each pedestrian picks random sidewalk/plaza waypoints and walks toward them
2. **Separation** — Pedestrians within 15 px repel each other to avoid clumping
3. **Wander noise** — Sinusoidal perturbation gives natural-looking meandering
4. **Boundary avoidance** — Forces push pedestrians away from canvas edges
5. **Venue sitting** — Non-clock pedestrians occasionally sit at outdoor seating for 5–13 seconds

When the clock activates, eligible pedestrians switch to a strong attraction force toward their target position. A lerp-based settling kicks in at close range to prevent oscillation.

### City Generation

The city world is **2× the viewport** in each dimension, so zooming out (scroll wheel / pinch) reveals the wider city while the plaza stays centred.

- **Grid layout**: Cells of 120 px blocks + 36 px roads, sized to fill the 2× world
- **Central plaza**: Occupies ~60% of the grid in each dimension, always pixel-perfectly centred
- **City blocks**: Non-plaza cells contain 1–4 buildings each with seeded randomness for consistent layouts
- **Road network**: Roads at every grid edge with dashed lane markings and zebra crosswalks; clipped around the plaza
- **Venues**: Cafes, bars, bookshops, restaurants, and flower shops around the plaza perimeter with striped awnings and parasol seating

### Cars & Delivery Vehicles

20 cars drive the road network (4 are orange delivery vans):

- **Normal cars** — scan ahead for pedestrians and other cars, braking proportionally; turn at junctions via connecting-road detection; show brake lights and headlight beams at night
- **Delivery vans** — enter the plaza via a dedicated lane at the centre of the top/bottom road, pause outside a venue (~5 s), then exit and rejoin traffic

### Day/Night Cycle

Real-time based on system clock:
- **8 am–5 pm**: Full daylight
- **5 pm–9 pm**: Gradual dusk
- **9 pm–5 am**: Night (60% darkness)
- **5 am–8 am**: Dawn

At night: buildings show lit windows, street lights and plaza lamp posts emit radial glows, venue doorways warm up, all colours darken.

### Rendering Architecture

1. **Static canvas** — Roads, sidewalks, crosswalks, plaza, buildings, and venues pre-rendered to an offscreen canvas; rebuilt only when the lighting level changes (quantized to 20 steps)
2. **Dynamic layer** — Cars, pedestrians, and animated tree sway drawn fresh each frame on top of the cached static layer
3. **DPR-aware** — Canvas resolution scales with `devicePixelRatio` (capped at 2×) for crisp rendering on Retina displays

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
