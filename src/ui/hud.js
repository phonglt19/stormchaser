import * as THREE from 'three';
import { efScale, bearingLabel, formatClock, mToMiles, msToMph, clamp } from '../core/math.js';

// DOM heads-up display. Polls game state each frame and writes it into the overlay.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      score: document.getElementById('scoreVal'),
      objective: document.getElementById('objective'),
      timer: document.getElementById('missionTimer'),
      speed: document.getElementById('speedVal'),
      speedFill: document.getElementById('speedFill'),
      integrity: document.getElementById('integrityVal'),
      integrityFill: document.getElementById('integrityFill'),
      camMode: document.getElementById('camMode'),
      rig: document.getElementById('rigName'),
      stormStatus: document.getElementById('stormStatus'),
      efBadge: document.getElementById('efBadge'),
      wind: document.getElementById('windVal'),
      dist: document.getElementById('distVal'),
      bearing: document.getElementById('bearingVal'),
      bearingArrow: document.getElementById('bearingArrow'),
      probes: document.getElementById('probeVal'),
      footage: document.getElementById('footageVal'),
      footageFill: document.getElementById('footageFill'),
      toasts: document.getElementById('toasts'),
      banner: document.getElementById('stormBanner'),
      bannerSub: document.getElementById('bannerSub'),
      damage: document.getElementById('damageFlash'),
      filmDot: document.getElementById('filmDot'),
      prompt: document.getElementById('probePrompt'),
    };
    this.activeToasts = [];
    this._damage = 0;
    this._fwd = new THREE.Vector3();
  }

  show() {
    this.el.hud.classList.remove('hidden');
  }

  hide() {
    this.el.hud.classList.add('hidden');
  }

  toast(text, kind = '') {
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.textContent = text;
    this.el.toasts.appendChild(div);
    this.activeToasts.push({ el: div, life: 2.8 });
    while (this.activeToasts.length > 5) {
      const old = this.activeToasts.shift();
      old.el.remove();
    }
  }

  stormBanner(show, text) {
    this.el.banner.classList.toggle('hidden', !show);
    if (text) this.el.bannerSub.textContent = text;
  }

  damageFlash(amount) {
    this._damage = Math.max(this._damage * 0.9, amount);
    this.el.damage.style.opacity = String(clamp(this._damage, 0, 0.9));
  }

  update(dt, game, vehicle, storms, camera) {
    for (let i = this.activeToasts.length - 1; i >= 0; i--) {
      const t = this.activeToasts[i];
      t.life -= dt;
      if (t.life <= 0) {
        t.el.remove();
        this.activeToasts.splice(i, 1);
      } else if (t.life < 0.6) {
        t.el.style.opacity = String(t.life / 0.6);
      }
    }

    const speedMph = Math.abs(vehicle.speedMph);
    this.el.speed.textContent = String(Math.round(speedMph));
    this.el.speedFill.style.width = `${clamp(speedMph / 145, 0, 1) * 100}%`;

    const integrityMax = vehicle.tuning ? vehicle.tuning.integrityMax : 100;
    const integrity = clamp((vehicle.integrity / integrityMax) * 100, 0, 100);
    this.el.integrity.textContent = String(Math.round(integrity));
    this.el.integrityFill.style.width = `${integrity}%`;
    this.el.integrityFill.style.background =
      integrity > 55 ? 'linear-gradient(90deg,#2b6a4a,#7dff9b)' : integrity > 25 ? 'linear-gradient(90deg,#7a3a12,#ffb347)' : 'linear-gradient(90deg,#6a1010,#ff4d4d)';

    this.el.score.textContent = String(Math.round(game.score));
    this.el.objective.textContent = game.objective;
    this.el.timer.textContent = formatClock(game.elapsed);
    this.el.camMode.textContent = vehicle.camModeName || 'CHASE';
    this.el.rig.textContent = vehicle.modelLabel || 'INTERCEPT';
    this.el.probes.textContent = String(game.probes.count);
    this.el.footage.textContent = String(Math.floor(game.footage));
    this.el.footageFill.style.width = `${clamp(game.filmTime / 4, 0, 1) * 100}%`;
    this.el.filmDot.classList.toggle('rec', game.filming);

    const tornado = storms.tornado;
    const windHere = storms.speedAt(vehicle.pos.x, vehicle.pos.z);
    this.el.wind.textContent = String(Math.round(msToMph(windHere)));

    if (tornado) {
      const ef = efScale(tornado.vmax);
      const efn = ef < 0 ? 0 : ef;
      this.el.efBadge.textContent = `EF${efn}`;
      this.el.efBadge.className = `ef ef-${efn}`;
      this.el.stormStatus.textContent =
        tornado.phase === 'genesis' ? 'TORNADOGENESIS' : tornado.phase === 'rope' ? 'ROPING OUT' : 'TORNADO ON GROUND';
      const dist = tornado.distanceTo(vehicle.pos.x, vehicle.pos.z);
      this.el.dist.textContent = dist > 500 ? mToMiles(dist).toFixed(1) : Math.round(dist);
      const dx = tornado.x - vehicle.pos.x;
      const dz = tornado.z - vehicle.pos.z;
      const b = bearingLabel(dx, dz);
      this.el.bearing.textContent = b.label;
      const fwd = camera.getWorldDirection(this._fwd);
      const camYaw = Math.atan2(fwd.z, fwd.x);
      const bearingRad = Math.atan2(dz, dx);
      const rel = (bearingRad - camYaw) * 180 / Math.PI + 90;
      this.el.bearingArrow.style.transform = `rotate(${rel.toFixed(1)}deg)`;
    } else {
      this.el.efBadge.textContent = '—';
      this.el.efBadge.className = 'ef ef-none';
      this.el.stormStatus.textContent = storms.strongest ? 'SUPERCELL WARNED' : 'SCANNING';
      this.el.dist.textContent = '--';
      this.el.bearing.textContent = '--';
    }
  }

  setPromptVisible(v) {
    this.el.prompt.classList.toggle('hidden', !v);
  }
}
