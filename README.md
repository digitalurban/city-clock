# City Clock

A procedurally generated top-down city where pedestrians form a digital clock in the central plaza.

**[Live Demo](https://digitalurban.github.io/city-clock/)**

![Pedestrians forming the current time in the plaza](screenshots/clock-mode.jpg)
*Pedestrians assemble into a 4-digit time display each minute. Zoom in/out with scroll wheel or pinch.*

![City life around the plaza](screenshots/city-life.jpg)
*Between clock formations, pedestrians wander the city — visiting venues, riding bicycles, and heading home.*

## Holidays & Seasonal Events

The plaza automatically decorates itself based on the real-world date. Decorations are drawn in the dynamic layer, beneath pedestrians, so city life continues normally around them. All decorations respect the day/night cycle — colours dim at night, and anything with a light source (candles, fairy lights, bonfire glow) intensifies after dark.

When multiple events overlap, higher-priority events take precedence (e.g. New Year overrides Christmas on Dec 31).

---

### 🎆 New Year — Dec 31 & Jan 1
Forty-five confetti pieces spin and flutter across the plaza, each rotating at a unique speed and flickering in gold, silver, red, teal, and pink. Gold and silver bunting is strung between all lamp posts.

### 🎄 Christmas — Dec 1 – Jan 6
A Christmas tree sits in the upper-left corner of the plaza (clear of the clock digit area), built from three triangular tiers of dark green with a yellow five-pointed star on top and seven twinkling coloured baubles (red, blue, yellow, pink, orange, purple). Fairy lights are strung between each pair of adjacent plaza lamp posts — small coloured dots that blink on and off independently on a per-segment sine phase, brightening at night. Red and green bunting circuits the lamp posts.

### 🎃 Halloween — Oct 25 – 31
Six jack-o'-lanterns are placed around the plaza perimeter — at each corner and at the left and right edges. Each has an orange body with vertical ribbing, triangular eyes, and a curved grin. At night a candle glow pulses inside each one with a fast flicker. Orange and black bunting is strung between lamp posts.

### 🔥 Bonfire Night — Nov 4 – 6
An animated bonfire burns in the upper-right corner of the plaza. A crossed log pile sits at the base; three flame layers (red outer, orange mid, yellow core) jitter with independent quadratic-curve wobble driven by sine/cosine offsets. Seven rising sparks orbit upward on a looping phase, fading as they climb. At night a radial orange glow pool spreads from the fire. Orange and yellow bunting between lamp posts.

### 💝 Valentine's Day — Feb 13 – 15
A small red heart pulses on every plaza lamp post, scaling with a slow heartbeat rhythm. Six larger pink hearts drift gently side-to-side at the plaza edges (corners and mid-edges). Pink and crimson bunting between lamp posts.

### ☘️ St Patrick's Day — Mar 16 – 18
A three-leaf shamrock and short stem is drawn above each plaza lamp post head. Irish tricolour bunting (green / white / orange) circuits the lamp posts.

### 🥚 Easter — Palm Sunday to Easter Monday
Ten pastel Easter eggs are placed around the plaza perimeter. Each is a tall ellipse in a unique pastel colour (pink, yellow, sky blue, mint, peach, plum, turquoise, bisque, rose, powder blue) with two horizontal stripe bands and a centre dot clipped to the egg shape. Pastel rainbow bunting (pink / lemon / sky blue / mint / salmon / plum) between lamp posts. The Easter date is calculated each year using the Anonymous Gregorian algorithm.

### 🎀 May Day — First Monday in May (±1 day)
A maypole stands on the left edge of the plaza with a wooden pole and eight coloured ribbons (red, orange, yellow, green, blue, purple, pink, cyan) that slowly rotate and drape in a quadratic curve from the pole top to the ground around it. Rainbow bunting between lamp posts.

### ☀️ Summer Solstice — Jun 20 – 22
Twelve faint sun-ray lines radiate outward from the plaza centre across the paving (visible in daylight, nearly invisible at night). Five flower petals slowly orbit each plaza lamp post in a slowly rotating garland (pink, yellow, coral, violet, mint). A small golden centre dot sits at the lamp head. Gold and amber bunting between lamp posts.

### 🎊 Weekend — Every Saturday & Sunday
Full rainbow bunting (red / orange / yellow / green / blue / purple / pink / cyan) is strung between all plaza lamp posts. No other decorations — just a bit of weekend colour.

---

**Bunting** is drawn as triangular flags along the string connecting adjacent lamp posts sorted clockwise around the plaza, with a natural catenary droop (sine arc). Spans wider than 150 px are skipped to avoid crossing the plaza interior. All flag colours dim proportionally with `nightAlpha`.

## Features

- **Live clock** - 112 pedestrians form seven-segment digits showing the current time (HH:MM) for 15 seconds each minute
- **Alarm System** - Set a custom time via the Options menu to trigger an alarm, causing the entire city population to dance in the plaza. A bandstand with a 5-piece band (singer, guitar, bass, drums, keys) appears in the upper plaza facing south toward the audience, with floating musical notes. Alarm audio is loaded via the Web Audio API (`fetch` + `decodeAudioData` + `AudioBufferSourceNode`) on first user interaction, guaranteeing playback on all browsers including iOS Safari without autoplay restrictions. Snooze for 9 minutes or dismiss to stop the performance
- **Double-tap to show time** - Double-tap or double-click anywhere to force the clock formation immediately
- **Procedural city** - grid of city blocks, roads, crosswalks, trees, parks and coloured buildings generated to fill the world
- **Central plaza** - ringed by named venues (cafes, bars, bookshops, flower shops) with outdoor seating, benches, and lamp posts
- **Plaza fountains** - two small stone-rimmed basins act as the colon dots in the clock display, positioned to align with the HH:MM digit geometry. Each basin is ringed by 6 small rounded shrubs with 3D shading. Three water jets per basin activate every ~5 minutes (running for 30–45 s), spraying arcing particles with gravity. Pedestrians naturally walk around and between both basins
- **Pedestrian life** - pedestrians wander sidewalks, visit venues, queue and sit outside, go home to their assigned houses via garden paths, and ride bicycles (~15%). Each has simulated Needs (Energy, Hunger, Social) with thought bubbles guiding their routines
- **Home life** - every pedestrian (including clock performers) is assigned a specific house. During the day they make 20–40 second home visits; at night (22:00–07:00) their schedule keeps them home until morning. While at home they occasionally step into their garden to putter around — moving slowly between spots, fully visible — before going back inside. House windows glow warm amber at night, baked into the static lighting layer so they are stable light sources
- **Dog walkers** - ~10% of pedestrians walk dogs on leashes; dogs pull ahead with animated trotting legs, floppy ears, wagging tails, and side-to-side sniffing wander
- **City birds** - two species share the skies: seagull flocks sweep high across the city and sparrow flocks dart at lower altitude with rapid wing beats and tighter formations. Both use boid flocking (separation, alignment, cohesion) and are drawn with parallax height — shadows on the ground separate from birds soaring above rooftops. Seagulls glide with slow wingbeats and dark wingtips; sparrows are smaller, browner, and flutter continuously. Occasionally a bird feeder event draws both species down to the plaza
- **Chimney smoke** - soft grey particles drift upward from residential chimneys. Emission rate responds to the season (more smoke in cold months Oct–Mar) and time of day (morning warm-up and evening heating peaks produce denser plumes)
- **Fruit & veg market** - a colourful street market sets up in the plaza on weekends and roughly 30% of weekdays. Eight stalls with striped awnings and produce displays are arranged as a perimeter market — four along the north inner edge and four along the south inner edge — keeping the central clock formation area clear. Pedestrians wander over to browse and stand in front of stalls
- **Cafe rush hours** - outdoor seating fills up noticeably during morning coffee (8–9:30am) and lunch (12–1:30pm). Pedestrians stay seated 1.4–1.8× longer, and more people spontaneously head to cafes and restaurants during these windows
- **Rain sheltering** - during rain, heavy rain, thunderstorms, and hail, pedestrians in the plaza dash for the nearest venue awning and wait under it until the weather eases, then resume their normal routines
- **Canal** - a narrow canal runs the full height of the city along the right edge, separated from the city blocks by a stone towpath. Narrowboats (canal boats with cabins, portholes, and tiller) travel slowly north and south, slowing near road bridges and giving way to each other. The water is a calm flat colour with a subtle moonlight glint at night
- **Train station & railway** - Central Station occupies the bottom-centre of the city. A steam locomotive (drawn top-down) slowly arrives from the right, stops at the platform, then departs left. Passengers gather on the platform and board as the train departs (fading out as they step onto the carriages); new arrivals alight from the carriages and fade into view before walking into the city. A departure toast appears just after the train leaves. West St station on the branch line (column 0, vertical track) follows the same boarding and alighting cycle — pedestrians walk to the platform when the branch train arrives, wait, then board and fade out as it departs, while fresh arrivals fade in and disperse into the city. The entire bottom row is a railway corridor — left side has allotment plots (crop rows, sheds, fenced beds) and right side has small terraced houses matching the city style. Two close-set rails run the full width of the map
- **Construction site** - one city block is a construction zone with dirt ground, a partial concrete frame, orange/white safety barriers, material piles, and a slowly rotating crane
- **Directional shadows** - buildings and trees cast ground shadows whose direction sweeps from west (dawn) through a short northward stub at solar noon to east (dusk), with length and opacity scaling with sun angle
- **Time-of-day atmosphere** - three subtle world-space overlays: a gradient morning mist that burns off between 5–9am; a warm amber golden-hour wash that peaks around 6pm and fades into dusk; a barely-there cool blue Sunday-morning tint that gives the city a distinctly quieter feel on Sundays before noon
- **Busker pitch** - a street musician (rendered as a full pedestrian character with guitar and open case) sets up in the plaza between 9am–9pm, appearing for 40 seconds to 2 minutes at a time. Floating ♪ ♫ music notes drift upward from the pitch. Pedestrians who pass within earshot stop to listen, face the musician, and periodically toss coins — rendered as arcing gold particles landing in the case
- **Newspaper stand** - a metal kiosk with a blue masthead banner and stacked papers appears in the lower plaza from 6am, fading out by 1pm. Morning pedestrians nearby stop briefly to buy a paper then walk away with a happy thought bubble
- **Dynamic City Events** - street protests and performances occasionally spawn in the plaza, drawing nearby crowds of pedestrians to watch and interact. Event characters are rendered as regular pedestrians with contextual overlays (banners, instruments, etc.)
- **Click to inspect** - tap or click any pedestrian to reveal a frosted-glass pop-up showing their name, current activity, daily schedule phase, and assigned home. Distinguished from a drag by a 4px movement threshold; auto-dismisses after 5 seconds
- **Follow mode** - the inspector pop-up includes a Follow button. Tapping it hides the pop-up and shows a compact pill chip at the top of the screen (`➤ Name · Activity  ✕`) that updates the pedestrian's activity in real time. Clicking the chip re-opens the full pop-up; dragging the canvas cancels following. Tap ✕ on the chip to stop at any time
- **Roadside wheelie bins** - ~70% of houses put a small colour-coded wheelie bin on the kerb strip beside their garden path (each house has its own lid colour). The garbage truck pulls over periodically to collect nearby bins; bins reappear ~5 minutes later once residents wheel them back in
- **Service & Delivery Vehicles** - orange delivery vans enter the plaza, park outside a venue to drop off packages. City buses (red/blue) and garbage trucks (green) navigate the road network with unique behaviours.
- **Emergency vehicles** - police cars, ambulances, and fire trucks with flashing light bars and wailing sirens
- **Traffic system** - cars navigate the road network with traffic lights, braking for pedestrians and each other, smooth quadratic Bézier arc turns at junctions, and anti-gridlock logic.
- **Day/night cycle** - real-time lighting based on system clock; deep dark-blue night sky; street lights and plaza lamps cast distinct warm pools through the darkness; building windows glow warm amber at night; car headlight beams cut through the night; all rendered in correct depth order so light sources punch through the darkness rather than being dimmed by it.
- **Weather** - procedural clouds with realistic multi-lobe shapes, 3D shading, and ground shadows drifting across the city. Fog renders as animated layered noise tendrils that drift in opposite directions rather than a flat overlay. Roads develop a specular wet sheen during rain that pulses slowly with shifting highlights
- **Zoom and pan** - scroll-wheel zoom, click-drag pan, touch pinch and drag on mobile. The static city layer rebuilds at the current zoom level 300 ms after each gesture settles, so the background is always sharp at any magnification
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
- **Separation** - repel nearby pedestrians to avoid clumping (via spatial grid for O(n) performance)
- **Venue visits** - queue outside cafes and shops, sit at outdoor seating
- **Going home** - every pedestrian (including the 112 clock performers) has an assigned house. When heading home, each pedestrian follows an A* path computed on a 9px obstacle-aware walkability grid that covers the whole city — routes go around all buildings, houses and venues rather than through them, walking along roads and sidewalks. They arrive via the garden path, step through the front door, and stay inside (fading to near-invisible). During the day visits last 20–40 s; the sleeping schedule (22:00–07:00) keeps them home until morning. While home they occasionally step outside to potter in the garden before returning indoors. When summoned to form the clock, performers cleanly snap out of any home, sitting, or queuing state
- **House lights** - windows glow warm amber at night; baked into the static canvas so they are stable light sources rather than toggling per-frame
- **Bicycle riding** - ~15% of pedestrians ride bicycles at 2.5x walking speed
- **Fountain avoidance** - a two-zone radial repulsion force keeps pedestrians from walking into either basin; a hard inner zone at the stone rim pushes strongly, a soft outer zone fades to zero at ~20px, allowing pedestrians to flow naturally around and between the two closely-spaced basins
- **Building and venue avoidance** - steering forces keep pedestrians on sidewalks and paths with velocity damping to prevent oscillation at road edges
- **Pathfinding** - a 9px walkability grid is precomputed at startup by testing every cell against all buildings, houses and venues. When a pedestrian needs to navigate home, an 8-directional A* search (cardinal + diagonal, no corner-cutting) finds the shortest clear route through the city. Collinear waypoints are thinned so the pedestrian walks in long straight stretches rather than micro-stepping

### City Generation

The city world is 2x the viewport in each dimension, so zooming out reveals the wider city while the plaza stays centred.

- **Grid layout**: 12×7 grid of 120px blocks + 36px roads
- **Central plaza**: rectangular plaza occupying the central grid area with venues on all sides and two fountains positioned as the clock's colon separator
- **Residential areas**: houses with gardens and garden paths connecting to sidewalks
- **Parks**: green spaces with trees scattered through the city
- **Road network**: roads at every grid edge with lane markings, crosswalks, and traffic lights at intersections
- **Venues**: cafes, bars, bookshops, restaurants and flower shops around the plaza perimeter with striped awnings and parasol seating
- **Railway corridor**: the entire bottom row is reserved for the railway — Central Station in the centre, allotment gardens on the left (fenced plots with crops, sheds, paths), and terraced houses on the right. Two rails run the full city width; houses are clipped to stay above the track line
- **Canal corridor**: the rightmost column is a canal — buildings and parks occupy the inner portion, a stone towpath runs beside the water, and horizontal roads bridge over the canal at each grid row. Narrowboats navigate the water, bridging is handled by speed-reduction logic so boats slow as they approach crossings

### Cars and Delivery Vehicles

Configurable from 10 to 300 vehicles including delivery vans and emergency services:

- **Normal cars** - scan ahead for pedestrians and other cars, brake proportionally; smooth Bézier curve turns at junctions; headlight beams at night
- **Delivery vans** - navigate to the plaza via a dedicated entry stub road, drive around the plaza perimeter in front of shops, drop visible packages at venue fronts, then exit and rejoin the main road network. Pedestrians flee from delivery trucks inside the plaza.
- **Specialized Service Vehicles** - city buses that pause at intersections to simulate pickups, and garbage trucks that slowly traverse the city stopping to collect roadside bins.
- **Emergency vehicles** - police, ambulance and fire trucks with flashing light bars and sirens
- **Traffic lights** - alternating red/green phases at intersections; cars clear intersections before stopping
- **Anti-gridlock** - cross-traffic detection prevents deadlocks; stuck vehicles teleport to clear roads after timeout

### Day/Night Cycle

Real-time based on system clock:
- **8am-5pm**: Full daylight
- **5pm-9pm**: Gradual dusk
- **9pm-5am**: Night (60% darkness)
- **5am-8am**: Dawn

At night: a deep blue-black sky. Buildings darken significantly with warm amber windows glowing consistently. Street lights and plaza lamps cast focused warm pools through the darkness. Car headlight beams sweep ahead of each vehicle. All light sources are composited after the dark overlay so they genuinely cut through the night rather than being muted by it.

### Weather

Dynamic live weather powered by the Open-Meteo API, with all 10 weather types fully implemented end-to-end:

| Type | Chance (demo mode) | Notes |
|------|--------------------|-------|
| Clear | 28% | |
| Cloudy | 22% | |
| Drizzle | 14% | |
| Rain | 12% | |
| Fog | 8% | |
| Heavy rain | 6% | |
| Snow | 4% | falling particles only |
| Thunderstorm | 3% | lightning flashes |
| Heavy snow | 2% | |
| Hail | 1% | bouncing ice particles |

- **Two modes:** set a real city in Options to pull live WMO weather codes from Open-Meteo (refreshed every 30 minutes to stay within API limits); without a city the system cycles through all 10 types with the weighted distribution above
- **Smooth cross-fade transitions:** weather never cuts harshly between types. When a change is due, the current weather fades out first (particles thin gradually over ~7 s) before the new type fades in at its own pace — so rain doesn't vanish mid-drop and fog doesn't snap off. The next-cycle timer is paused during the fade to prevent transitions from being interrupted
- **Atmospheric Effects:**
  - Procedural parallax clouds darken dynamically into storm clouds and drift over the city in top-down volumetric rendering
  - Rain and hail particles fall visibly below the cloud layer, dynamically bouncing and melting on the plaza
  - Widespread reflective puddles with sky and building silhouette reflections, ripple rings, and splash effects that dry gradually over time
  - Snow particles fall visibly from the cloud layer with a gentle side-to-side drift
  - Jagged lightning flash overlays during thunderstorms and hail
  - Animated fog tendrils — two sin-wave noise layers scroll in opposite directions, creating organic wisps rather than a flat grey overlay
  - Wet road sheen — a specular gradient scales with puddle level, giving roads a convincing reflective quality during and after rain
- **Responsive Pedestrians:** 100% of pedestrians deploy colourful umbrellas in rain or snow, sprint for venue awnings in heavy rain, and adjust walking pace by condition (drizzle slows slightly; hail triggers a full sprint; snow causes careful shuffling)

### Day/Night Atmosphere

Beyond the core day/night cycle, three time-of-day atmosphere overlays run in world space each frame:

- **Morning mist (5–9am)** — a gradient fog layer, densest at ground level, that burns off quadratically as dawn progresses
- **Golden hour (17–20h)** — a warm amber wash peaking around 18:00; respects the dusk system so it doesn't compete with the night overlay
- **Sunday quiet (7–12h on Sundays)** — a cool blue-grey tint so faint it only becomes noticeable side-by-side, giving Sunday mornings a distinctly slower feel

### Aesthetics & Lighting

Several passes work together to give the city depth and visual polish:

- **Warm colour palette** — building colours, the daytime sky, road surfaces, and station structures all use a warm neutral palette (sandy stones, warm greys, ochres, muted sage) rather than blue-grey tones, giving the city a coherent earthy feel rather than a cold cast
- **Building parapet walls** — commercial buildings and venues have proper flat-roofed parapet construction: a lighter rim on the north and west edges (sky-lit parapet top), a recessed darker roof interior behind the walls, a dark south face (exterior wall visible from the elevated viewpoint), and an east face shadow. Buildings read as genuine 3D flat-roofed structures rather than flat rectangles
- **Rooftop variety** — every commercial building has 1–2 raised stairwell/access shaft boxes with SE cast-shadow, south-face darkness, door hatch, and N/W highlight; plus 0–2 optional features: water towers (circular tank with hoop rings, stave lines, support legs, conical cap), AC/HVAC units (raised box with horizontal louver slats, fan housing with blades), or satellite dishes (round bowl with thick rim, concave interior highlight, feed arm, LNB receiver, mounting pad)
- **Residential roof styles** — houses are generated with a maximum of 3 per block (ensuring each is wide enough to be recognisable), and draw one of three roof styles: gabled (ridge runs left↔right with light/dark slope shading and tile lines), hip roof (all four edges slope to a flat centre with four distinct shaded faces), or rotated gabled (ridge runs top↔bottom)
- **Directional shadows** — buildings and trees cast ground shadows whose direction sweeps from west (dawn) through a short stub at solar noon to east (dusk), with length and opacity scaling with sun angle; computed once per frame and shared across all draw calls
- **Fountain shrubs** — each plaza fountain basin is ringed by 6 small rounded shrubs (replacing the previous flower ring), each with a shadow, dark base mass, mid-green highlight lobe, and specular dot for a 3D topiary look
- **Rush-hour density** — pedestrian and car counts automatically scale with the real time of day: sparse at night (22%), building through the morning commute, peaking at rush hours (130% pedestrians / 140% cars at 8am and 5–6pm), and tapering back overnight. Counts adjust every 10 minutes
- **Outdoor café seating** — café and restaurant venues draw tables, chairs, coloured umbrellas (cafés only, daytime), and seated figures outside. Occupancy is time-bucketed (5-minute slots) so figures appear and disappear gradually rather than every frame; only rendered in fair weather during opening hours (07:30–22:30)
- **Rain puddles** — elliptical puddles form on road segments during wet weather and evaporate slowly when dry. They show a sky-reflection tint, specular highlight, and animated ripple rings when intensity is high enough
- **Window lights** — commercial buildings have sparse lit windows at night (3–10% of positions depending on hour), using time-quantised seeds so lights shift gradually every 20 minutes. Three colour temperatures: warm incandescent, cool office daylight, and blue screen glow. Unlit windows show a subtle dark recess. Deep night (11pm–6am) leaves almost all offices dark; end-of-day (5–8pm) has the most activity
- **Plaza paving** — a two-tone checkerboard floor (40px tiles), visible grout lines, a double inset perimeter border, and a central compass rose (concentric rings, 8 spokes, 4 cardinal lines) baked into the static canvas at zero runtime cost
- **Road kerb lines** — a thin white edge stroke around every road rectangle defines the curb/gutter boundary and gives the road network visual structure
- **Procedural audio** — all sounds are synthesised via the Web Audio API (no MP3s): rain (pink noise filtered to match drizzle → thunderstorm intensity), fountain spray (white noise highpass), bird song (sparrow chirps, pigeon coos, robin sequences), thunder, and wailing police/fire sirens (LFO-modulated oscillator). Starts muted; toggle on/off via the Sound button in Settings. AudioContext is created lazily on first user interaction to satisfy browser autoplay policies. Lamp glow halos use `screen` compositing so overlapping lights stay crisp at night on all browsers including Safari
- **Time-of-day atmosphere** — morning mist (5–9am), golden hour amber (17–20h), and Sunday quiet blue tint, all composited in world space before the main dynamic layer

### Rendering Architecture

1. **Static canvas** - roads, sidewalks, crosswalks, plaza (with decorative paving and two fountain basins), building shadows, buildings with parapet walls, building rooftop features (stairwell boxes, water towers, AC units, satellite dishes), houses, house windows (all lit at night), venues, and parks pre-rendered to an offscreen canvas. Rebuilt when lighting changes *or* when zoom drifts more than 0.18 from the level it was last rendered at (debounced 300 ms after gesture settles). Canvas size is capped to stay within browser/iOS texture limits (~4096 px per dimension)
2. **Dynamic layer** - venue name labels, atmosphere overlays, holiday decorations, chimney smoke, roadside bins, market stalls, newspaper stand, busker pitch, fountain spray particles, cars, pedestrians, dogs, dropped packages, construction crane, bird shadows, animated tree sway, and birds (drawn above weather with parallax height)
3. **Light pass** - street lights, plaza lamp glows, and car headlight beams drawn after the night overlay using `screen` compositing so overlapping halos brighten toward white rather than accumulating into an opaque fog wash (fixes a Safari-specific rendering artefact)
4. **Atmosphere pass** - fog tendrils (two drifting noise layers) and wet road sheen composited in screen space after world-space weather
7. **DPR-aware** - canvas resolution scales with devicePixelRatio (capped at 2x) for crisp rendering on Retina displays; static canvas uses `imageSmoothingQuality = 'medium'` during zoom gestures

### Battery & Performance

City Clock is designed to run efficiently as an always-on wallpaper or bedside clock:

- **Native 60fps** - the render loop runs at the display's native refresh rate for smooth animation; all timers and speeds are tuned for 60fps
- **Visibility pause** - the loop stops entirely when the tab is hidden or the screen is off (via the Page Visibility API), dropping power draw to near zero when no one is watching
- **Cloud caching** - each cloud is pre-rendered to an offscreen canvas and cached; only rebuilt when storm intensity changes the cloud colour. Eliminates ~200 `createRadialGradient` calls per frame
- **Gradient caching** - wet-sheen gradient is created once and reused every frame; rebuilt only on canvas resize. Eliminates GC objects per minute that previously caused Safari to slow down over time
- **Spatial grid** - pedestrian separation checks use a `SpatialGrid` structure for O(n) neighbour queries instead of O(n²) brute-force iteration
- **In-place array cleanup** - all particle and entity arrays are compacted with reverse-splice rather than `.filter()`, avoiding per-frame array allocations
- **Idle particle skip** - the 2000-particle rain pool is only iterated while `alpha > 0.01`; fully settled clear weather skips the loop entirely. During cross-fade transitions the pool keeps animating so particles fade out naturally rather than disappearing mid-fall
- **Single `Date.now()` per frame** - shared time value computed once before the particle loop rather than per-particle

## Tech Stack

- **TypeScript** + **Vite** for development and bundling
- **HTML Canvas 2D** for all city rendering — roads, buildings, pedestrians, weather, lighting
- **Web Audio API** for procedural ambient sound
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
