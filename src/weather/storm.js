import * as THREE from 'three';
import { Tornado } from './tornado.js';
import { Rain, Lightning } from './rain.js';
import { STORM } from '../config.js';
import { clamp, lerp, TAU } from '../core/math.js';

// A single thunderstorm: drifting mesocyclone + its tornado.
export class Supercell {
  constructor(terrain, rng, opts = {}) {
    this.terrain = terrain;
    this.rng = rng;
    this.center = { x: opts.x || 0, z: opts.z || 0 };
    this.driftAngle = opts.driftAngle !== undefined ? opts.driftAngle : 0;
    this.driftDir = { x: Math.cos(this.driftAngle), z: Math.sin(this.driftAngle) };
    this.speed = opts.speed || 14;
    this.life = opts.life || 140;
    this.age = 0;
    this.intensity = 0;
    this.dead = false;
    this.state = 'organizing';

    this.hookOffset = rng.range(520, 900);
    this.hookAngle = rng.range(0, TAU);

    this.tornado = new Tornado(terrain, rng, {
      x: this.center.x,
      z: this.center.z,
      heading: this.driftAngle,
      speed: this.speed,
      life: opts.tornadoLife,
      delay: opts.tornadoDelay,
      peakVmax: opts.peakVmax,
    });

    this._strikeTimer = rng.range(2, 8);
  }

  get peakNote() {
    return this.tornado.vmax;
  }

  update(dt) {
    this.age += dt;

    // intensity envelope over the storm lifetime
    const rampUp = 45;
    const rampDown = 45;
    if (this.age < rampUp) {
      this.intensity = clamp(this.age / rampUp, 0, 1) ** 0.8;
    } else if (this.age < this.life - rampDown) {
      this.intensity = 1;
    } else {
      this.intensity = clamp((this.life - this.age) / rampDown, 0, 1) ** 1.3;
    }
    if (this.age >= this.life) this.dead = true;

    this.state = this.age < rampUp ? 'organizing' : this.age > this.life - rampDown ? 'decaying' : 'mature';

    // drift the mesocyclone with the mean flow
    this.center.x += this.driftDir.x * this.speed * dt;
    this.center.z += this.driftDir.z * this.speed * dt;

    // tornado orbits slowly around the mesocyclone centre (the hook echo)
    this.hookAngle += dt * 0.04;
    const hx = this.center.x + Math.cos(this.hookAngle) * this.hookOffset;
    const hz = this.center.z + Math.sin(this.hookAngle) * this.hookOffset;

    if (this.age > this.life - 20) {
      // tornado dissipates with the parent storm
      const touchdownAge = this.tornado.age - this.tornado.delay;
      this.tornado.life = Math.min(this.tornado.life, Math.max(0, touchdownAge) + 1);
    }

    this.tornado.speed = this.speed;
    this.tornado.update(dt);

    // spring the tornado back toward its hook point so the pair stays coupled
    const k = 1 - Math.exp(-0.2 * dt);
    this.tornado.x += (hx - this.tornado.x) * k;
    this.tornado.z += (hz - this.tornado.z) * k;
    this.tornado._layout();
  }

  windAt(x, z) {
    return this.tornado.windAt(x, z);
  }

  dispose(scene) {
    scene.remove(this.tornado.group);
    this.tornado.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
  }
}

// Manages the outbreak: spawning, weather effects, the composite wind field.
export class StormSystem {
  constructor(scene, terrain, sky, audio, seedRng) {
    this.scene = scene;
    this.terrain = terrain;
    this.sky = sky;
    this.audio = audio;
    this.rng = seedRng;

    this.storms = [];
    this.outbreakAngle = seedRng.range(-1.15, -0.45);
    this.bgWind = { x: 0, z: 0 };
    this.timer = seedRng.range(2, 6);
    this.flashBoost = 0;

    this.rain = new Rain(seedRng.next);
    scene.add(this.rain.mesh);

    this.lightning = new Lightning(terrain);
    scene.add(this.lightning.mesh, this.lightning.light);
    this._thunderQueue = [];
  }

  get strongest() {
    let best = null;
    for (const s of this.storms) {
      if (!best || s.tornado.vmax > best.tornado.vmax) best = s;
    }
    return best;
  }

  get tornado() {
    const s = this.strongest;
    return s && s.tornado.active ? s.tornado : null;
  }

  spawn(playerPos) {
    const angle = this.outbreakAngle + this.rng.range(-0.22, 0.22);
    const dir = { x: Math.cos(angle), z: Math.sin(angle) };
    const dist = this.rng.range(2100, 3400);
    const x = playerPos.x - dir.x * dist + this.rng.range(-400, 400);
    const z = playerPos.z - dir.z * dist + this.rng.range(-400, 400);
    const storm = new Supercell(this.terrain, this.rng, {
      x,
      z,
      driftAngle: angle,
      speed: this.rng.range(12, 17),
      life: this.rng.range(STORM.lifeRange[0], STORM.lifeRange[1]),
      tornadoDelay: this.rng.range(STORM.tornadoDelay[0], STORM.tornadoDelay[1]),
      tornadoLife: this.rng.range(STORM.tornadoLife[0], STORM.tornadoLife[1]),
      peakVmax: this.rng.range(38, STORM.maxVmax),
    });
    this.storms.push(storm);
    this.scene.add(storm.tornado.group);
    return storm;
  }

  update(dt, playerPos, camera, cameraVel) {
    // spawn / expire
    this.timer -= dt;
    if (this.timer <= 0 && this.storms.length < STORM.maxActive) {
      this.spawn(playerPos);
      this.timer = this.rng.range(STORM.spawnInterval[0], STORM.spawnInterval[1]);
    }

    for (let i = this.storms.length - 1; i >= 0; i--) {
      const s = this.storms[i];
      s.update(dt);
      if (s.dead) {
        s.dispose(this.scene);
        this.storms.splice(i, 1);
      }
    }

    // composite background wind from the mean storm motion
    const strongest = this.strongest;
    const speed = strongest ? strongest.speed * 1.15 : 12;
    const dir = strongest ? strongest.driftDir : { x: Math.cos(this.outbreakAngle), z: Math.sin(this.outbreakAngle) };
    this.bgWind.x = dir.x * speed;
    this.bgWind.z = dir.z * speed;

    // lightning
    this._strikeTimer = (this._strikeTimer || this.rng.range(3, 9)) - dt;
    if (strongest && this._strikeTimer <= 0) {
      const t = strongest.tornado;
      const a = this.rng.range(0, TAU);
      const r = this.rng.range(200, 2200);
      const lx = strongest.center.x + Math.cos(a) * r;
      const lz = strongest.center.z + Math.sin(a) * r;
      this.lightning.strike(lx, lz, () => {
        this.sky.flash(this.rng.range(0.5, 1.3) * (0.4 + 0.6 * strongest.intensity));
      });
      const d = Math.hypot(lx - playerPos.x, lz - playerPos.z);
      this._thunderQueue.push(Math.min(3.2, d / 343));
      this._strikeTimer = this.rng.range(2.5, 9) * (1.5 - 0.7 * strongest.intensity);
      void t;
    }

    // delayed thunder
    for (let i = this._thunderQueue.length - 1; i >= 0; i--) {
      this._thunderQueue[i] -= dt;
      if (this._thunderQueue[i] <= 0) {
        this._thunderQueue.splice(i, 1);
        this.audio.thunder(0.7);
      }
    }

    this.lightning.update(dt);
    this.flashBoost = this.lightning.boost;

    // rain intensity from proximity to the strongest storm
    let rainIntensity = 0;
    for (const s of this.storms) {
      const d = Math.hypot(s.center.x - playerPos.x, s.center.z - playerPos.z);
      const local = clamp(1 - (d - 600) / 2600, 0, 1) * (0.35 + 0.65 * s.intensity);
      rainIntensity = Math.max(rainIntensity, local);
    }
    const wind = this.windAt(playerPos.x, playerPos.z);
    const relWind = {
      x: wind.x - (cameraVel ? cameraVel.x : 0),
      z: wind.z - (cameraVel ? cameraVel.z : 0),
    };
    this.rain.update(dt, camera, relWind, rainIntensity);
    this.rainIntensity = rainIntensity;

    this.sky.update(dt, camera, strongest ? { center: strongest.center, intensity: strongest.intensity, driftDir: strongest.driftDir } : null);

    // pass the flash to the tornado materials
    for (const s of this.storms) s.tornado.flashValue(this.lightning.boost * 0.9);
  }

  windAt(x, z) {
    let vx = this.bgWind.x;
    let vz = this.bgWind.z;
    for (const s of this.storms) {
      const w = s.tornado.windAt(x, z);
      vx += w.x;
      vz += w.z;
    }
    return { x: vx, z: vz };
  }

  // Only the tornadic circulation (no ambient flow) — used for vehicle push + damage.
  vortexWindAt(x, z) {
    let vx = 0;
    let vz = 0;
    for (const s of this.storms) {
      const w = s.tornado.windAt(x, z);
      vx += w.x;
      vz += w.z;
    }
    return { x: vx, z: vz };
  }

  reset(playerPos) {
    for (const s of this.storms) s.dispose(this.scene);
    this.storms.length = 0;
    this.timer = this.rng.range(1, 3);
    this._thunderQueue.length = 0;
    this.spawn(playerPos);
  }

  speedAt(x, z) {
    const w = this.windAt(x, z);
    return Math.hypot(w.x, w.z);
  }

  // Nearest active tornado to a point (for HUD + radar).
  nearestTornado(playerPos) {
    let best = null;
    let bestDist = Infinity;
    for (const s of this.storms) {
      if (!s.tornado.active) continue;
      const d = Math.hypot(s.tornado.x - playerPos.x, s.tornado.z - playerPos.z);
      if (d < bestDist) {
        bestDist = d;
        best = s.tornado;
      }
    }
    return best ? { tornado: best, dist: bestDist } : null;
  }
}
