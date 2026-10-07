import * as THREE from 'three';
import { SCORE } from '../config.js';
import { clamp, efScale, formatClock, msToMph } from '../core/math.js';

// Mission logic: scoring, storm warnings, footage tracking, risk/damage.
export class Game {
  constructor(vehicle, storms, probes, hud, audio) {
    this.vehicle = vehicle;
    this.storms = storms;
    this.probes = probes;
    this.hud = hud;
    this.audio = audio;
    this.reset();
  }

  reset() {
    this.score = 0;
    this.footage = 0;
    this.elapsed = 0;
    this.state = 'playing';
    this.filming = false;
    this.filmTime = 0;
    this.engaged = new Map();
    this.warned = new Set();
    this.intercepts = 0;
    this.deploys = 0;
    this.tornadoesSurvived = 0;
    this.objective = '';
    this.lastTornado = null;
    this.peakWindFelt = 0;
    this.destroyedCount = 0;
    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
  }

  addScore(amount, reason, kind = 'good') {
    this.score += amount;
    if (reason && this.hud) this.hud.toast(`${reason}  +${Math.round(amount)}`, kind);
  }

  // -----------------------------------------------------------------
  update(dt, input, camera) {
    if (this.state !== 'playing') return;
    this.elapsed += dt;
    this.addScore(SCORE.survivalPerSecond * dt, null);

    const tornado = this.storms.tornado;

    // ---- warn on new tornadoes ----
    for (const s of this.storms.storms) {
      const t = s.tornado;
      if (t.active && !this.warned.has(t)) {
        this.warned.add(t);
        if (this.hud) this.hud.stormBanner(true, this._bannerText(t));
        this.hud && this.hud.toast('TORNADO WARNING — touchdown confirmed', 'bad');
        this.audio && this.audio.chime(false);
      }
      if (!t.active && this.warned.has(t)) {
        this.warned.delete(t);
        this.hud && this.hud.stormBanner(false);
      }
    }

    // ---- filming ----
    this.filming = input.isDown('KeyF');
    if (this.filming && tornado && this._tornadoInFrame(tornado, camera)) {
      const inten = tornado.intensity01;
      const gain = SCORE.footagePerSecond * (0.6 + 1.6 * inten) * dt;
      this.footage += dt;
      this.filmTime += dt;
      this.addScore(gain, null);
    } else {
      this.filmTime = Math.max(0, this.filmTime - dt * 2);
    }

    // ---- per-tornado engagement tracking ----
    for (const s of this.storms.storms) {
      const t = s.tornado;
      if (!t.active) continue;
      let rec = this.engaged.get(t);
      if (!rec) {
        rec = { filmed: 0, closePassed: false, bonusGiven: false };
        this.engaged.set(t, rec);
      }
      if (this.filming && this._tornadoInFrame(t, camera)) rec.filmed += dt;

      const dist = t.distanceTo(this.vehicle.pos.x, this.vehicle.pos.z);
      const effective = dist - t.coreRadius;
      if (!rec.closePassed && effective < 110) {
        rec.closePassed = true;
        this.addScore(SCORE.closePass, `CLOSE INTERCEPT ${Math.round(effective)} m`, 'good');
        this.lastTornado = t;
      }
    }

    // ---- award bonus when a tornado ropes out ----
    for (const [t, rec] of this.engaged) {
      if (t.active || rec.bonusGiven) continue;
      rec.bonusGiven = true;
      const ef = efScale(t.peakVmax);
      const idx = ef < 0 ? 1 : clamp(ef, 0, 5);
      const bonus = SCORE.efBonus[idx] * (rec.filmed > 3 ? 1 : 0.35);
      this.tornadoesSurvived++;
      this.addScore(bonus, `TORNADO DISSIPATED — EF${ef < 0 ? 0 : ef} ${Math.round(msToMph(t.peakVmax))} mph`, 'info');
      this.hud && this.hud.stormBanner(false);
      this.audio && this.audio.chime(false);
    }

    // ---- chassis damage from the wind field ----
    const vortexWind = this.storms.vortexWindAt(this.vehicle.pos.x, this.vehicle.pos.z);
    const windSpeed = Math.hypot(vortexWind.x, vortexWind.z);
    const felt = this.storms.speedAt(this.vehicle.pos.x, this.vehicle.pos.z);
    this.peakWindFelt = Math.max(this.peakWindFelt, felt);
    if (!this.vehicle.disabled && windSpeed > 30) {
      const dmg = (windSpeed - 30) * 0.20 * dt;
      this.vehicle.damage(dmg);
      this.hud && this.hud.damageFlash(clamp((windSpeed - 30) / 40, 0, 0.7));
      if (this.vehicle.disabled) this._destroyed();
    } else {
      this.hud && this.hud.damageFlash(0);
    }

    // ---- objective text ----
    this.objective = this._objective(tornado);

    // ---- audio ----
    if (this.audio) {
      const nearest = this.storms.nearestTornado(this.vehicle.pos);
      const prox = nearest ? clamp(1 - nearest.dist / 1600, 0, 1) : 0;
      const rumble = nearest ? clamp(nearest.tornado.intensity01 * (0.35 + 0.65 * prox), 0, 1) : 0;
      this.audio.setRumble(rumble, prox);
      this.audio.setWind(clamp(felt / 45, 0, 1));
      this.audio.setRain(this.storms.rainIntensity || 0);
    }
  }

  _destroyed() {
    this.destroyedCount++;
    this.state = 'over';
    this.hud && this.hud.damageFlash(1);
    this.audio && this.audio.chime(false);
  }

  _tornadoInFrame(tornado, camera) {
    const dist = Math.hypot(tornado.x - camera.position.x, tornado.z - camera.position.z);
    if (dist > 2800) return false;
    this._tmp.set(tornado.x, this.terrainHeightSafe(tornado), tornado.z);
    camera.getWorldDirection(this._fwd);
    const to = this._tmp.sub(camera.position).normalize();
    const dot = to.dot(this._fwd);
    return dot > 0.55;
  }

  terrainHeightSafe(tornado) {
    return tornado.terrain.height(tornado.x, tornado.z) + 130;
  }

  _bannerText(t) {
    const ef = efScale(t.vmax);
    return `${ef < 0 ? 'EF0' : 'EF' + ef} · ${Math.round(msToMph(t.vmax))} mph · moving`;
  }

  _objective(tornado) {
    if (!tornado) {
      const s = this.storms.strongest;
      return s ? 'Close on the supercell — tornado warned' : 'Intercept the developing storm';
    }
    const d = tornado.distanceTo(this.vehicle.pos.x, this.vehicle.pos.z);
    if (this.probes.count === 0) return 'Deploy a probe in the tornado path (E)';
    if (this.probes.probes.every((p) => p.intercepted)) return 'Film the vortex — keep it framed (F)';
    if (d > 1500) return `Close the gap — ${(d / 1000).toFixed(1)} km to the core`;
    const near = this.probes.probes.reduce((m, p) => Math.min(m, Math.hypot(p.x - tornado.x, p.z - tornado.z)), Infinity);
    if (near > 400) return 'Reposition probes closer to the core';
    return 'Film the vortex and survive';
  }

  stats() {
    return {
      score: Math.round(this.score),
      time: formatClock(this.elapsed),
      footage: `${Math.floor(this.footage)}s`,
      probes: this.probes.count,
      intercepts: this.intercepts,
      peakWind: `${Math.round(msToMph(this.peakWindFelt))} mph`,
      tornadoes: this.tornadoesSurvived,
    };
  }
}
