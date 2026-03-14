# City Clock

A procedurally generated top-down city where pedestrians form a digital clock in the central plaza.

**[Live Demo](https://digitalurban.github.io/city-clock/)**

![Pedestrians forming a clock display in the plaza](screenshots/clock-mode.jpg)
*At the start of each minute, pedestrians assemble into a 4-digit time display*

![Normal city life between clock formations](screenshots/city-life.jpg)
*Between formations, pedestrians wander freely through the city*

## How It Works

### The Clock Mechanism

The core concept: 160 autonomous pedestrians go about their daily routines in a miniature city, but at the start of every minute, 112 of them are summoned to form a seven-segment digital clock display in the central plaza.

**Timing cycle (each minute):**
- **Seconds 0-15**: Clock-eligible pedestrians move to their assigned segment positions, forming the current time (HH:MM) as four large digits
- **Seconds 15-59**: All pedestrians are released back to autonomous wandering

**Seven-segment display**: Each digit is composed of 7 segments (like a classic digital watch). Each segment is assigned 4 pedestrians (`PEDS_PER_SEGMENT`), meaning each digit needs up to 28 pedestrians. Four digits = 112 clock-eligible pedestrians total.

**Digit formation**: When a segment is active, its 4 pedestrians spread evenly along the segment line. When inactive, those pedestrians are dismissed to the edges of the plaza with stable, deterministic positions (so they don't jitter between frames).

**Responsive scaling**: The digit dimensions are calculated dynamically from the plaza size (55% width, 45% height), so the clock fits comfortably at any screen resolution. Proportions are preserved using ratios derived from the ideal layout.

### Pedestrian Behaviour

Pedestrians use a steering-behaviours model with several forces combined each frame:

1. **Waypoint following** - Each pedestrian picks random sidewalk/plaza waypoints and walks toward them. On arrival (or timeout), a new waypoint is chosen
2. **Separation** - Pedestrians within 15px repel each other to avoid clumping
3. **Wander noise** - Sinusoidal perturbation gives natural-looking meandering
4. **Boundary avoidance** - Forces push pedestrians away from canvas edges
5. **Venue sitting** - Non-clock pedestrians occasionally sit at outdoor cafe/restaurant seating for 5-13 seconds before resuming their walk

When the clock activates, eligible pedestrians switch to a strong attraction force toward their target position, with higher speed limits so they converge quickly. A lerp-based settling kicks in at close range to prevent oscillation.

### City Generation

The city is procedurally generated on a grid:

- **Grid layout**: The screen is divided into cells (120px blocks + 36px roads). The number of cells adapts to the viewport size
- **Central plaza**: Occupies ~60% of the grid cells in each dimension, always centered. Contains scattered trees, tiled ground, and venue buildings around its perimeter
- **City blocks**: Non-plaza cells contain 1-4 buildings each, randomly split horizontally or vertically with seeded randomness for consistent layouts
- **Road network**: Roads run between every grid cell with dashed lane markings and zebra crosswalks at intersections
- **Venues**: Cafes, bars, bookshops, restaurants, and flower shops line the plaza edges with striped awnings and outdoor seating (tables, chairs, parasols)

### Cars

10 cars drive along the road network. Each car:
- Picks a random road segment and direction at spawn
- Scans ahead for pedestrians and other cars, braking proportionally to distance
- Shows brake lights when decelerating, headlight beams at night
- Wraps around screen edges

### Day/Night Cycle

A real-time day/night cycle based on the system clock:
- **8am-5pm**: Full daylight
- **5pm-9pm**: Gradual dusk transition
- **9pm-5am**: Night mode (60% darkness)
- **5am-8am**: Dawn transition

At night: buildings show lit windows (warm yellow and cool blue), street lights emit radial glows, venue doorways glow warmly, and all colours darken.

### Rendering Architecture

Performance is maintained through a layered rendering approach:

1. **Static canvas** - Roads, sidewalks, crosswalks, plaza tiles, buildings, and venues are pre-rendered to an offscreen canvas. This is only rebuilt when the lighting level changes (quantized to 20 steps)
2. **Dynamic layer** - Cars, pedestrians, and tree canopy sway are drawn fresh each frame on top of the cached static layer
3. **DPR-aware** - Canvas resolution scales with `devicePixelRatio` (capped at 2x) for crisp rendering on Retina displays

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
