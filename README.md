# City Clock

A procedurally generated top-down city where pedestrians form a digital clock in the central plaza.

**[Live Demo](https://digitalurban.github.io/city-clock/)**

![Pedestrians forming the current time in the plaza](screenshots/clock-mode.jpg)
*Pedestrians assemble into a 4-digit time display each minute. Zoom in/out with scroll wheel or pinch.*

![City life around the plaza](screenshots/city-life.jpg)
*Between clock formations, pedestrians wander the city — visiting venues, riding bicycles, and heading home.*

## Features

- **Live clock** - 112 pedestrians form seven-segment digits showing the current time (HH:MM) for 15 seconds each minute
- **Double-tap to show time** - Double-tap or double-click anywhere to force the clock formation immediately
- **Procedural city** - grid of city blocks, roads, crosswalks, trees, parks and coloured buildings generated to fill the world
- **Central plaza** - ringed by named venues (cafes, bars, bookshops, flower shops) with outdoor seating, benches, and lamp posts
- **Pedestrian life** - pedestrians wander sidewalks, visit venues, queue and sit outside, go home to their assigned houses via garden paths, and ride bicycles (~15%)
- **Delivery trucks** - orange delivery vans enter the plaza, park outside a venue to drop off packages, then return to the road
- **Emergency vehicles** - police cars, ambulances and fire trucks with flashing sirens
- **Traffic system** - cars navigate the road network with traffic lights, braking for pedestrians and each other, smooth turning at junctions, and anti-gridlock logic
- **Day/night cycle** - real-time lighting based on system clock; street lights, lamp posts, building windows and headlights glow at night
- **Weather** - procedural clouds with realistic multi-lobe shapes, 3D shading, and ground shadows drifting across the city
- **Zoom and pan** - scroll-wheel zoom, click-drag pan, touch pinch and drag on mobile
- **Adjustable population** - settings panel to control traffic (10-300) and people (112-500) counts live
- **iOS PWA** - add to home screen on Safari for fullscreen standalone experience

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
- **Building and venue avoidance** - steering forces keep pedestrians on sidewalks and paths

### City Generation

The city world is 2x the viewport in each dimension, so zooming out reveals the wider city while the plaza stays centred.

- **Grid layout**: cells of 120px blocks + 36px roads, sized to fill the world
- **Central plaza**: rectangular plaza occupying the central grid area with venues on all sides
- **Residential areas**: houses with gardens and garden paths connecting to sidewalks
- **Parks**: green spaces with trees scattered through the city
- **Road network**: roads at every grid edge with lane markings, crosswalks, and traffic lights at intersections
- **Venues**: cafes, bars, bookshops, restaurants and flower shops around the plaza perimeter with striped awnings and parasol seating

### Cars and Delivery Vehicles

Configurable from 10 to 300 vehicles including delivery vans and emergency services:

- **Normal cars** - scan ahead for pedestrians and other cars, brake proportionally; smooth arc turns at junctions; headlight beams at night
- **Delivery vans** - navigate to the plaza via road network, enter through plaza entrances, deliver packages to venue fronts, then exit and rejoin traffic
- **Emergency vehicles** - police, ambulance and fire trucks with flashing light bars and sirens
- **Traffic lights** - alternating red/green phases at intersections; cars clear intersections before stopping
- **Anti-gridlock** - cross-traffic detection prevents deadlocks; stuck vehicles teleport to clear roads after timeout

### Day/Night Cycle

Real-time based on system clock:
- **8am-5pm**: Full daylight
- **5pm-9pm**: Gradual dusk
- **9pm-5am**: Night (60% darkness)
- **5am-8am**: Dawn

At night: buildings show lit windows, street lights and plaza lamp posts emit radial glows, car headlights illuminate the road, venue doorways glow warmly, all colours darken.

### Weather

Procedural cloud system with three depth layers (far, mid, near):
- Seeded random number generator for consistent cloud shapes
- Multi-lobe cumulus and stratus cloud types
- Three-pass rendering: shadow underlayer, main body, highlight tops
- Ground shadows drift beneath the clouds

### Rendering Architecture

1. **Static canvas** - roads, sidewalks, crosswalks, plaza, buildings, houses, venues and parks pre-rendered to an offscreen canvas; rebuilt only when the lighting level changes
2. **Dynamic layer** - cars, pedestrians, dropped packages and animated tree sway drawn fresh each frame
3. **DPR-aware** - canvas resolution scales with devicePixelRatio (capped at 2x) for crisp rendering on Retina displays

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
