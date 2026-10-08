# KEYSOTA — Storm Chaser

A 3D tornado-chasing game built with **Three.js**. You drive an armored intercept
vehicle across the Keysota plains, hunt down supercells, drop instrument probes in
the tornado's path, film the vortex, and try not to get blown off the road.

Inspired by the storm-chasing loop of Roblox's *Twisted* — chase, intercept,
deploy, survive.

Everything is generated procedurally at runtime. There are no art assets, no
textures on disk and no audio files — terrain, clouds, the tornado, rain and the
soundtrack are all synthesized.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # production bundle into dist/
npm run preview  # serve the production build
```

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake, then reverse |
| `A` `D` / `←` `→` | Steer |
| `Shift` | Boost |
| `Space` | Handbrake (kicks the back out) |
| `E` | Deploy instrument probe |
| `F` | Film the tornado (hold) |
| `C` | Cycle camera: chase → hood → cinema → free |
| `R` | Recover the vehicle |
| Mouse drag | Look around (free camera: scroll to zoom) |
| `Esc` / `P` | Pause |
| `M` | Mute audio |

## Vehicles

Two rigs can be chosen from the main menu (the pick persists across restarts):

| Rig | Handling |
| --- | --- |
| **Intercept** | Balanced reinforced chase rig — quick and nimble. |
| **Joker II** | A spiked ~30,000 lb interceptor: slower and heavier, but it shrugs off the tornado's wind push. Hold the handbrake while stopped to deploy its eight ground-anchor spikes. |

`?vehicle=joker2` starts a run with the Joker II.

## How you score

- **Footage** — hold `F` with the tornado framed and in range. The stronger the
  tornado, the faster the meter fills.
- **Probe intercepts** — deploy probes into the tornado's path. A direct hit pays
  out big, scaled by the EF rating.
- **Close intercept** — get within ~110 m of the core for a one-off bonus.
- **Tornado dissipated** — bank an EF-scaled bonus for every tornado you tracked
  through its whole life cycle.
- **Survival** — a small trickle for staying alive.

Wind is modeled as a Rankine vortex: tangential speed peaks at the core radius and
decays outward, plus a radial inflow. That field pushes the vehicle around and
starts chewing through your chassis above ~30 m/s. The tornado also pushes you
*away* as you close in, so intercepting takes deliberate driving.

## Project layout

```
index.html            HUD markup + overlay screens
styles.css
src/
  main.js             bootstrap, staged world build, state machine, frame loop
  config.js           all gameplay/visual tuning constants
  core/
    noise.js          seeded Perlin 2D + fbm, and the shared GLSL noise/fog chunk
    rng.js            mulberry32 seeded PRNG
    math.js           damp/clamp/bearing/EF-scale helpers
    input.js          keyboard + drag-look
  world/
    terrain.js        heightfield, procedural ground texture, road ribbons
    scenery.js        instanced trees, fences, poles + wires, farms, turbines
    sky.js            sky dome and the swirling storm cloud deck
  weather/
    tornado.js        funnel shader, debris field, dust ring, lifecycle, wind field
    storm.js          supercell + outbreak manager, lightning scheduling
    rain.js           camera-anchored rain streaks and forked lightning
  entities/
    vehicle.js        arcade car physics, chase-vehicle model, camera rig
    vehicleModels.js  procedural vehicle models (Intercept, Joker II) + dimensions
    probes.js         probe meshes, deployment, measurement, intercept detection
  gameplay/
    game.js           objective, scoring, storm warnings, damage, mission stats
  ui/
    hud.js            DOM HUD updates
    radar.js          canvas doppler minimap
    menu.js           loading / main / pause / game-over overlays
  audio/
    audio.js          WebAudio wind, engine, rumble, rain and thunder
tools/
  smoke.mjs           headless Chrome smoke test + screenshot (see below)
```

## Headless smoke test

`tools/smoke.mjs` drives the dev server in headless Chrome over CDP, steps the
simulation deterministically and reports console errors.

```bash
# boot the dev server first, then:
node tools/smoke.mjs "http://localhost:5173/?autostart=1&quick=1&close=1" shot.png 600 \
  "k.input.down.add('KeyW')"
```

Arguments: `<url> <out.png> [frames] [setupJs] [postJs]`. `setupJs` runs in the
page with `k` bound to the dev handle (`k.input`, `k.vehicle`, `k.storms`,
`k.press('KeyE')`, `await k.step(120)`, `k.pause()`, …).

### Dev URL parameters

| Param | Effect |
| --- | --- |
| `?autostart=1` | Skip the menu and start the chase immediately |
| `?quick=1` | Tornado touches down ~2 s after spawn |
| `?close=1` | Place the storm right ahead of the vehicle |
| `?seed=N` | Seed the outbreak generator |
| `?vehicle=joker2` | Start with the Joker II interceptor instead of the default rig |

These only exist in the dev build; `window.__keysota` is stripped from production.
