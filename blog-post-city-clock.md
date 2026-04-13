# City Clock: The City Where People Tell the Time

**April 2026** | *making* | *ai, vibe-coding, canvas, ios, clock*

---

Regular readers will know I have a thing about clocks. Not the telling-of-time part specifically — more the question of what *else* can tell the time. What non-clock things can be made to function as a clock if you look at them sideways and ask nicely?

Aqua Clock answered that question with fish. Boids, specifically — the emergent flocking algorithm from Craig Reynolds (1987) — arranged into seven-segment digits once a minute before scattering back into the water. The fish have no idea they're a clock. They're just swimming. The clock is an emergent property of their behaviour, noticed from above.

City Clock asks the same question of a city.

---

## From Fish to People

The seed for City Clock is right there at the end of the Aqua Clock post — a single screenshot, a passing thought: *what if the pedestrians in a city did the same thing?* The fish disperse from their formation and go back to being fish. Could pedestrians form digits in a plaza, then disperse back into the city and just... get on with their day?

It turned out to be a much larger question than it first appeared.

Fish exist in a contained volume of water. They have no destinations, no routines, no reason to be anywhere in particular. A city is the opposite. A city is almost entirely made of reasons to be places. Shops to visit, homes to return to, friends to meet, a coffee to get before 9am. If you're going to build a city that also happens to tell the time, you need to build the city first — properly, with all of its rhythms and routines — and then add the clock on top.

That's what this became.

![City Clock — full city view with clock formation in the central plaza](screenshot-full-city.jpg)
*The full city, zoomed out. 112 pedestrians form the current time in the central plaza every minute, before dispersing back to their daily routines.*

---

## The Clock Mechanism

At the start of every minute, 112 pedestrians are summoned to the central plaza to form a four-digit digital clock — HH:MM — using seven-segment geometry. Each digit uses up to 28 people, four per segment. They walk in from wherever they are in the city, take their positions, hold for 15 seconds, then scatter.

For the remaining 45 seconds of every minute, those same 112 people — along with hundreds of others — just live their lives.

They have homes. Assigned houses with garden paths and front doors. They visit cafes and queue outside at rush hour. They sit on benches. They go home at 10pm. Some of them have dogs. A few ride bicycles. One of them is always trying to find somewhere to sit with their coffee.

Double-tap anywhere to force the formation immediately, without waiting for the next minute. It's oddly satisfying — a whole city dropping what it's doing to spell out the time.

![Clock formation close-up — pedestrians forming digits in the plaza](screenshot-clock-formation.jpg)
*Pedestrians mid-formation. Each coloured dot is a person walking to their assigned position within a digit segment. The fountains serve as the colon separator.*

---

## A Living City

What makes this more than a clock-with-scenery is that the city actually runs. It's not decorative background — it has systems.

**Traffic** navigates junctions with working traffic lights, brakes for pedestrians, and takes smooth Bézier-curve turns at corners. Emergency vehicles push through with flashing lights and sirens. Delivery vans park outside venues and drop packages. Garbage trucks do their rounds, collecting wheelie bins that reappear a few minutes later once residents wheel them back in.

**Pedestrians** use a needs-based model — Energy, Hunger, Social — with thought bubbles indicating their current priority. They shelter under awnings when it rains. They queue longer at cafes on weekday mornings. They stay home at night.

**Weather** is live, pulled from Open-Meteo, or cycles through all ten types in demo mode — drizzle, snow, fog, thunderstorms, hail. Roads get wet and reflective. Puddles form and slowly evaporate. Fog rolls in as animated layered tendrils rather than a flat grey wash.

**The day/night cycle** runs in real time. At dusk, street lamps flicker on and cast warm pools across pavements. Building windows glow amber. Car headlights sweep the roads. By 2am the city is almost dark, with just a few lit windows where someone is working late.

A street musician sets up in the plaza between 9am and 9pm. Passers-by stop to listen and occasionally throw coins. A newspaper kiosk opens at dawn and folds away by lunchtime. Steam trains run to Central Station and the branch line at West St. — more on that below.

The plaza itself has a compass rose picked out in the paving. Two fountain basins serve as the colon in the clock display, which is either very elegant design or a very happy accident, depending on when you noticed it.

![The plaza between clock formations — pedestrians going about their day](screenshot-plaza-life.jpg)
*Between formations the plaza is just a plaza. Outdoor seating, market stalls on weekends, a busker, benches. The city information stream (bottom left) reports events as they happen.*

---

## The Canal and the Mills

Somewhere mid-development, the city acquired a canal.

It runs the full height of the map along the right edge — a narrow waterway separated from the city blocks by a stone towpath. Three narrowboats travel up and down, slowing near bridges, giving way to each other, the way narrowboats do. The water is calm and flat with a moonlight glint at night.

What the canal needed, it turned out, was something to be *next to*. Canals don't make sense without industry.

So the canalside blocks became Northern mill buildings — proper ones, not generic rectangles. Each is individually generated with a choice of brick palette (dark Victorian red, sooty weathered, newer orange-red), one of three roof styles (horizontal sawtooth northlight, vertical sawtooth, monitor/clerestory ridge), two or three chimney stacks, and varying heights leaving cobbled goods yards between buildings. Some have small counting-house annexes. A few have exterior cast-iron drainpipes running down the wall.

The factories work. Goods accumulate in the yards over time — wooden crates, metal drums, canvas sacks — until a narrowboat passes the loading bay, slows, and moors up to take them on. The cargo appears on the boat's deck and slowly fades as it's delivered further down the canal. The city information stream reports each loading event.

The chimneys smoke independently. Each factory has its own cycle — active for 30 to 120 seconds, then quiet for a shift change or a stoking break, then active again. They don't synchronise. Standing at the right zoom level you can watch them come and go across the row of mills, which is unexpectedly hypnotic.

![Canalside factories with goods yards, narrowboat, and chimney smoke](screenshot-canal-factories.jpg)
*The canalside mills — varied brick, sawtooth roofs, chimney stacks, goods in the yard. A narrowboat is collecting the latest batch. The city information stream has logged the event.*

---

## Two Lines, Two Stations

The bottom of the city is given over entirely to the railway. A full-width corridor of track, signal infrastructure, allotment gardens on the left — proper fenced plots with crop rows, sheds, and water butts — and terraced housing on the right. Central Station sits at the centre, a stone-fronted building with a clock above the entrance and a platform that fills with waiting passengers.

Every few minutes, a steam locomotive arrives from the right edge of the map. It slows as it approaches the platform, stops, and waits. While it's stationary, new arrivals step out of the carriages and fade into view on the platform before making their way into the city — heading for the bus stop, the plaza, wherever they're going. Passengers who have been waiting on the platform board as the train prepares to depart, fading out as they step onto the carriages. Then the locomotive pulls away to the left and disappears. The city information stream logs the departure: *Central Station: The service to Harbour View is now departing. Next service in 3–5 min.*

What makes this more than a visual loop is that passengers are real pedestrians. Arrivals are spawned from the train and immediately join the city's population — they need somewhere to go, they have the same needs and routines as everyone else. Departing passengers were walking around the city moments before; they received a summons, walked to the platform, and waited. The train is connected to the city's social fabric, not just painted onto it.

The branch line adds another layer. West St. station sits at the far left of the map, served by a vertical track running the full height of that column. A smaller locomotive — a branch service — runs independently on its own schedule, arriving from the south and departing northward. The same boarding and alighting cycle plays out on its own platform. Two lines, two departure toasts, two streams of arrivals filtering into the city from different directions.

Between the main line and the branch line, the bottom of the city has a texture you don't find in the rest of the grid — slower, more industrial, with the allotment plots adding an unexpected patch of green alongside the track.

![Railway corridor — branch line track, West St. station, allotments, and main line](screenshot-railway.jpg)
*The railway corridor at the bottom of the city. The branch line track runs vertically on the left past West St. station. Allotment plots line the bottom. The main line locomotive is just visible bottom-right, pulling into Central Station.*

---

## The City Information Stream

One of the things that emerged fairly naturally was a notification layer — a running feed of city events displayed as toasts in the bottom-left corner. Not intrusive, not demanding attention, just quietly reporting what's happening.

Train departing. Canal loading. Ice cream van parked near the plaza. Fog settling in. Flash mob in progress. The Sunday market is open.

The ice cream van deserves a mention of its own. On warm afternoons between April and September, a white-and-pink van parks near the plaza — drawn top-down like every other vehicle, with a serving hatch window, a pink stripe along its length, and a small scoop sign on the roof. Its jingle plays when it arrives. A queue forms outside. It stays for a while, then leaves when the weather turns or the afternoon ends.

It's on by default and can be turned off in settings. When it's running it gives the city a texture of ongoing activity — a sense that things are happening slightly beyond the edge of the screen, and have been happening all along.

---

## City Stats

One of the more quietly satisfying additions is a daily stats panel. Toggle it on in Settings and a small overlay appears showing what the city has actually done today: how many people are currently in the plaza, how many are at home, how many train passengers have arrived, how many coffees have been sold, pints pulled, books bought, flowers purchased. The market veg stock percentage ticks down through the day as pedestrians browse the stalls. The number of mills operating updates as factories cycle on and off.

The counts reset at midnight. They're gated per-person — each pedestrian can buy one coffee in the morning and one in the afternoon, one round at the bar in the evening, one book — so the numbers stay in a believable range over a full day rather than spiralling upward. By 9pm you might have 40 coffees sold, 12 pints, a few books, a couple of bunches of flowers. It's a snapshot of a day in the life of a city that's been quietly going about its business the whole time.

---

## Special Events: Buskers, Flash Mobs and the Alarm

Some of the most characterful moments in City Clock are the ones you don't schedule.

A street musician appears in the plaza between 9am and 9pm, setting up for 40 seconds to two minutes at a time. There's a guitar case on the ground. Floating ♪ ♫ music notes drift upward. Pedestrians who wander into earshot stop, turn to face the musician, and stand and listen. Occasionally one of them walks forward and throws a coin — rendered as a little arcing gold particle landing in the open case. The busker has a star rating below them. You can zoom in close enough to read it.

Flash mobs erupt occasionally without warning. A crowd gathers, the event unfolds — a protest with banners, or a spontaneous performance — and then disperses. Nearby pedestrians are drawn in, stop to watch, and drift away again when it's over. The city information stream announces it quietly: *A flash mob has broken out in the plaza. Everyone is dancing.*

The alarm clock is something else entirely.

Set a time in Settings and when the clock reaches it, the entire city population converges on the plaza and dances. Not a polite shuffle — a full celebration, everyone streaming in from wherever they are, umbrellas and hats and the whole chromatic range of pedestrian clothing swirling in loose spirals. A bandstand appears in the upper plaza with a five-piece band: singer, guitar, bass, drums, keys. Musical notes float upward from the stage. The fountains keep going. The trains keep running. The canal boats keep moving. But the plaza becomes a party.

Snooze for nine minutes or dismiss entirely. When the alarm ends, the bandstand fades and everyone disperses back to their routines — home, the café, the park bench, wherever they were going before the music started.

![The alarm event — the entire city dancing in the plaza](screenshot-alarm-dance.jpg)
*The alarm clock triggers a city-wide dance in the plaza. Every pedestrian streams in from across the city. The bandstand is visible near Night Owl. The busker's five-star rating can be seen just below.*

---

## The Calendar: Seasons, Holidays and Quiet Sundays

The city is aware of the calendar in a way that accumulates gently over time rather than announcing itself.

The plaza decorates itself for major events: a Christmas tree with twinkling baubles and fairy lights strung between lamp posts from December through early January; jack-o'-lanterns at the plaza corners for Halloween with candlelight flickering inside at night; a bonfire in the upper plaza for Bonfire Night with rising sparks and an orange glow spreading across the paving; confetti for New Year, a maypole for May Day, shamrocks for St Patrick's Day, pastel eggs for Easter. Each event is drawn in the dynamic layer beneath pedestrians, so life continues normally around the decorations — people walk through the Christmas scene, queue outside the café beside the Halloween lanterns.

Bunting is strung between lamp posts for every event, colour-coded to the occasion — green and orange for St Patrick's, red and green for Christmas, rainbow for weekends. Flags hang in a natural catenary droop, individual triangles in the correct colours, dimming proportionally at night.

Three atmosphere overlays run continuously. A gradient morning mist sits at ground level from 5am and burns off by 9am. A warm amber wash builds through the afternoon and peaks at golden hour around 6pm. On Sunday mornings, a barely perceptible cool blue tint settles over the city before noon — so faint you might not consciously notice it, but the city feels slower.

The residential chimneys smoke more in cold months and at morning and evening heating peaks. Gardens look the same year-round but the quality of light shifts across the day in a way that makes the city feel genuinely different at 7am on a Tuesday in February versus 6pm on a Saturday in July.

---

## Under the Hood

Everything is rendered on an HTML5 Canvas using TypeScript, built with Vite. There are no runtime dependencies. No React, no game engine, no physics library.

The city is split into a static canvas layer — roads, buildings, houses, parks, the plaza — pre-rendered at startup and rebuilt only when lighting changes or zoom drifts significantly. This is composited each frame with a dynamic layer containing everything that moves or changes: pedestrians, cars, weather, canal boats, chimney smoke, market stalls, the train.

Pedestrian pathfinding uses a 9px walkability grid covering the whole city, with 8-directional A* for routing home. Traffic runs on a node graph with Bézier curve turns at junctions. The weather system cross-fades between states — rain doesn't vanish mid-drop when conditions change, it tapers out naturally over about 7 seconds before the new weather fades in.

The clock geometry is a standard seven-segment layout scaled to fill the plaza, with each segment subdivided into four pedestrian positions. At summons time, eligible pedestrians compute their target position, cancel whatever they were doing, and walk there. When released, they don't teleport back — they just resume normal wandering from wherever they're standing in the plaza.

Sound is a mix of authentic recordings and procedural synthesis via the Web Audio API. A narrow-gauge train whistle plays on each departure — a real recording, fetched and decoded into an `AudioBuffer` on first interaction so it's ready without any autoplay restriction. A genuine thunder crack fires during storms. A UK police siren plays once per emergency vehicle (a `WeakSet` ensures it never repeats for the same car object). When an ice cream van parks near the plaza, its jingle plays. Everything else — rain, the fountain spray, bird calls, the ambulance wail — is procedurally synthesised. Everything starts muted and can be toggled in settings.

---

## Vibe Coding a City

The Aqua Clock post described vibe coding as "a process of iterating through ideas, accepting suggestions, discarding others, and allowing the final artefact to emerge from the generative process itself." City Clock is that, at considerably larger scale.

The canal wasn't planned. Neither were the mills, or the goods system, or the independent smoke cycles, or the city information stream. They emerged from the question each version of the city was implicitly asking: *what would make this feel more real?*

What surprised me most was how often the answer was *more consequence*. The canal needed something to carry. The factories needed to be doing something. The narrowboats needed a reason to slow down. Once goods appeared in the yards, a reason for them to be collected followed naturally. Once boats collected goods, a notification followed naturally. Consequence accumulates.

The human role in this process wasn't writing code — it was aesthetic and editorial judgment. Deciding that the smoke was too black. That the factories needed varied heights rather than uniform blocks. That the water looked better without the animated ripple lines. That the city information stream should be on by default. These are not decisions that can be specified in advance. They're responses to what's actually in front of you.

---

## Available for iOS

City Clock is a free iOS app, available now on the App Store.

It also runs in any browser at [digitalurban.github.io/city-clock](https://digitalurban.github.io/city-clock/) — add to your home screen on Safari for a fullscreen standalone experience with full orientation and viewport handling.

The source is on [GitHub](https://github.com/digitalurban/city-clock) — TypeScript, Vite, zero dependencies.

The time is always correct. The people have no idea they're a clock.

---

*Andrew Hudson-Smith, April 2026*
