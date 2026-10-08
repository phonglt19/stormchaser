import * as THREE from 'three';
import { VEHICLE_MODELS, DEFAULT_VEHICLE, CAMERA_MODES } from '../config.js';
import { clamp, damp, msToMph } from '../core/math.js';
import { buildVehicleModel } from './vehicleModels.js';

export class Vehicle {
  constructor(terrain, scenery, modelId = DEFAULT_VEHICLE) {
    this.terrain = terrain;
    this.scenery = scenery;
    this.colliders = scenery ? scenery.colliders : [];
    this.modelId = VEHICLE_MODELS[modelId] ? modelId : DEFAULT_VEHICLE;
    this._applyModelConfig();

    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = -Math.PI / 2;
    this.speed = 0;
    this.lateralVel = 0;
    this.windVel = new THREE.Vector2();
    this.steerSmooth = 0;
    this.integrity = this.tuning.integrityMax;
    this.disabled = false;
    this.throttleInput = 0;
    this.strobe = 0;
    this.pitchVis = 0;
    this.rollVis = 0;
    this.wheelSpin = 0;
    this.shake = 0;
    this.camMode = 0;
    this.camYaw = 0;
    this.camPitch = 0;
    this.camDist = 11;
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._speedVec = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.wheels = [];
    this.strobes = [];
    this.spikes = [];
    this.radar = null;
    this.anemometer = null;
    this.spikeDeploy = 0;
    this._build();
  }

  _applyModelConfig() {
    const def = VEHICLE_MODELS[this.modelId] || VEHICLE_MODELS[DEFAULT_VEHICLE];
    this.tuning = def.tuning;
    this.modelLabel = def.label;
    this.hasSpikes = def.hasSpikes;
  }

  _disposeModel() {
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) m.dispose();
    });
  }

  setModel(id) {
    if (!VEHICLE_MODELS[id] || id === this.modelId) return false;
    this.modelId = id;
    this._disposeModel();
    this.group.clear();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this._applyModelConfig();
    this.integrity = Math.min(this.integrity, this.tuning.integrityMax);
    this._build();
    return true;
  }

  get position() {
    return this.pos;
  }

  get forward() {
    return { x: Math.cos(this.heading), z: Math.sin(this.heading) };
  }

  get speedMph() {
    return msToMph(this.speed);
  }

  get isBoosting() {
    return this.boost;
  }

  // -----------------------------------------------------------------
  _build() {
    buildVehicleModel(this, this.modelId);
  }

  // -----------------------------------------------------------------
  reset(pos) {
    if (pos) this.pos.set(pos.x, 0, pos.z);
    this.pos.y = this.terrain.height(this.pos.x, this.pos.z);
    this.speed = 0;
    this.lateralVel = 0;
    this.windVel.set(0, 0);
    this.integrity = this.tuning.integrityMax;
    this.disabled = false;
    this.heading = -Math.PI / 2;
    this.camYaw = 0;
  }

  damage(amount) {
    this.integrity = clamp(this.integrity - amount, 0, this.tuning.integrityMax);
    if (this.integrity <= 0) this.disabled = true;
  }

  repair(amount) {
    this.integrity = clamp(this.integrity + amount, 0, this.tuning.integrityMax);
  }

  update(dt, input, vortexWind, audio) {
    // ---- inputs ----
    const throttleRaw = input.axis('KeyS', 'KeyW') || input.axis('ArrowDown', 'ArrowUp');
    const steerRaw = input.axis('KeyA', 'KeyD') || input.axis('ArrowLeft', 'ArrowRight');
    const handbrake = input.isDown('Space');
    this.boost = input.isDown('ShiftLeft', 'ShiftRight') && this.speed > 0;
    this.throttleInput = throttleRaw;

    if (this.disabled) {
      this.speed = damp(this.speed, 0, 1.2, dt);
      this.lateralVel = damp(this.lateralVel, 0, 1.2, dt);
    }

    const maxSpeed = this.boost ? this.tuning.boostSpeed : this.tuning.maxSpeed;

    // ---- longitudinal ----
    if (!this.disabled) {
      let accel = 0;
      if (throttleRaw > 0) {
        accel = throttleRaw * this.tuning.accel * (1 - clamp(Math.abs(this.speed) / maxSpeed, 0, 1));
      } else if (throttleRaw < 0) {
        accel = this.speed > 2 ? throttleRaw * this.tuning.brakeForce : throttleRaw * this.tuning.accel * 0.5;
      }
      this.speed += accel * dt;
    }

    const dragAccel =
      this.tuning.rollResist +
      this.tuning.engineDrag * this.speed * this.speed +
      (handbrake ? 16 : 0);
    const dv = dragAccel * dt;
    if (Math.abs(this.speed) <= dv) this.speed = 0;
    else this.speed -= Math.sign(this.speed) * dv;

    this.speed = clamp(this.speed, -this.tuning.reverseSpeed, maxSpeed);

    // ---- steering ----
    const steerTarget = this.disabled ? 0 : steerRaw;
    this.steerSmooth = damp(this.steerSmooth, steerTarget, 9, dt);
    const speedFactor = clamp(Math.abs(this.speed) / 11, 0, 1);
    const falloff = 1 - this.tuning.steerFalloff * clamp(Math.abs(this.speed) / this.tuning.maxSpeed, 0, 1);
    const yawRate = this.steerSmooth * this.tuning.steerRate * speedFactor * falloff * Math.sign(this.speed || 1);
    this.heading += yawRate * dt;

    // ---- lateral slip (drift) ----
    const grip = handbrake ? 2.2 : this.tuning.grip;
    const gripFactor = clamp(grip / this.tuning.grip, 0, 1);
    this.lateralVel -= yawRate * this.speed * dt * (1 - gripFactor) * 0.5;
    this.lateralVel -= this.lateralVel * grip * dt;
    this.lateralVel = clamp(this.lateralVel, -14, 14);

    // ---- vortex wind push ----
    if (vortexWind) {
      this.windVel.x += vortexWind.x * this.tuning.windPush * dt;
      this.windVel.y += vortexWind.z * this.tuning.windPush * dt;
    }
    const windDamp = 1 - Math.exp(-1.1 * dt);
    this.windVel.x -= this.windVel.x * windDamp;
    this.windVel.y -= this.windVel.y * windDamp;
    const windMag = Math.hypot(this.windVel.x, this.windVel.y);
    if (windMag > this.tuning.windClamp) {
      this.windVel.x *= this.tuning.windClamp / windMag;
      this.windVel.y *= this.tuning.windClamp / windMag;
    }
    this.shake = damp(this.shake, clamp((windMag - 6) / 16, 0, 1), 4, dt);

    // ---- integrate position ----
    const fx = Math.cos(this.heading);
    const fz = Math.sin(this.heading);
    const rx = -fz;
    const rz = fx;
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.x += (fx * this.speed + rx * this.lateralVel + this.windVel.x) * dt;
    this.pos.z += (fz * this.speed + rz * this.lateralVel + this.windVel.y) * dt;

    this._resolveCollisions(prevX, prevZ);

    const limit = this.terrain.half - 40;
    this.pos.x = clamp(this.pos.x, -limit, limit);
    this.pos.z = clamp(this.pos.z, -limit, limit);

    if (dt > 0) {
      this.velocity.set((this.pos.x - prevX) / dt, 0, (this.pos.z - prevZ) / dt);
    }

    const groundY = this.terrain.height(this.pos.x, this.pos.z);
    this.pos.y = groundY;

    // ---- visual attitude from terrain ----
    const hFront = this.terrain.height(this.pos.x + fx * 1.8, this.pos.z + fz * 1.8);
    const hBack = this.terrain.height(this.pos.x - fx * 1.8, this.pos.z - fz * 1.8);
    const hRight = this.terrain.height(this.pos.x + rx * 1.1, this.pos.z + rz * 1.1);
    const hLeft = this.terrain.height(this.pos.x - rx * 1.1, this.pos.z - rz * 1.1);
    const pitch = Math.atan2(hFront - hBack, 3.6);
    const roll = Math.atan2(hRight - hLeft, 2.2) * -1;

    this._orient(roll, pitch);

    // ---- body lean + wheels ----
    const targetPitchVis = clamp(-this.throttleInput * 0.035, -0.05, 0.05);
    const targetRollVis = clamp(-this.steerSmooth * speedFactor * 0.07 - this.lateralVel * 0.006, -0.16, 0.16);
    this.pitchVis = damp(this.pitchVis, targetPitchVis, 6, dt);
    this.rollVis = damp(this.rollVis, targetRollVis, 6, dt);
    this.body.rotation.set(0, 0, this.pitchVis);
    this.body.rotation.z = this.rollVis;
    this.body.position.y = damp(this.body.position.y, Math.abs(this.speed) * 0.0016, 5, dt);

    this.wheelSpin += (this.speed / this.dims.wheelR) * dt;
    for (const w of this.wheels) {
      w.tire.rotation.z = this.wheelSpin;
      w.pivot.rotation.y = damp(w.pivot.rotation.y, w.isFront ? this.steerSmooth * 0.42 : 0, 10, dt);
    }

    // ---- strobes, radar + ground anchors ----
    this.strobe += dt;
    const phase = Math.floor((this.strobe * 4) % 2);
    this.strobes[0].material.emissiveIntensity = phase === 0 ? 3.2 : 0.15;
    this.strobes[1].material.emissiveIntensity = phase === 1 ? 3.2 : 0.15;
    this.radar.rotation.y += dt * 1.6;
    if (this.anemometer) this.anemometer.rotation.y += dt * 2.4;

    if (this.hasSpikes) {
      const anchored = handbrake && Math.abs(this.speed) < 1;
      this.spikeDeploy = damp(this.spikeDeploy, anchored ? 1 : 0, 5, dt);
      for (const s of this.spikes) s.mesh.position.lerpVectors(s.rest, s.out, this.spikeDeploy);
    }

    // ---- audio ----
    if (audio) {
      audio.setEngine(clamp(Math.abs(this.speed) / this.tuning.maxSpeed, 0, 1), Math.abs(this.throttleInput));
    }
  }

  _resolveCollisions(prevX, prevZ) {
    for (const c of this.colliders) {
      const dx = this.pos.x - c.x;
      const dz = this.pos.z - c.z;
      const minDist = c.r + this.dims.colliderPad;
      const d = Math.hypot(dx, dz);
      if (d < minDist && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        this.pos.x = c.x + nx * minDist;
        this.pos.z = c.z + nz * minDist;
        const impact = Math.abs((this.pos.x - prevX) * nx + (this.pos.z - prevZ) * nz);
        const closing = (this.speed * (Math.cos(this.heading) * nx + Math.sin(this.heading) * nz));
        if (closing < -this.tuning.crashSpeed * 0.5) {
          this.damage(clamp((-closing - this.tuning.crashSpeed * 0.5) * 1.6, 0, 28));
          this.shake = 1;
        }
        this.speed *= -0.18;
        this.lateralVel *= 0.4;
        void impact;
      }
    }
  }

  _orient(roll, pitch) {
    const fx = Math.cos(this.heading);
    const fz = Math.sin(this.heading);
    const right = new THREE.Vector3(-fz, 0, fx);
    const forward = new THREE.Vector3(fx, 0, fz);
    // apply pitch/roll by rotating the forward axis around the right axis
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -roll * 0);
    const up = new THREE.Vector3(0, 1, 0);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(forward, roll);
    const rightAfter = right.clone().applyQuaternion(qRoll);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(rightAfter, pitch);
    const q = qRoll.multiply(qPitch).multiply(qYaw);
    const f = forward.clone().applyQuaternion(q);
    const u = up.clone().applyQuaternion(q);
    const r = f.clone().cross(u).normalize();
    const m = new THREE.Matrix4().makeBasis(f, u, r);
    this.group.position.copy(this.pos);
    this.group.quaternion.setFromRotationMatrix(m);
  }

  // -----------------------------------------------------------------
  cycleCamera() {
    this.camMode = (this.camMode + 1) % CAMERA_MODES.length;
    return CAMERA_MODES[this.camMode];
  }

  cameraUpdate(dt, camera, input) {
    if (input.mouse.down) {
      this.camYaw -= input.mouse.dx * 0.004;
      this.camPitch = clamp(this.camPitch + input.mouse.dy * 0.003, -0.5, 0.85);
    }
    if (input.wheel) {
      this.camDist = clamp(this.camDist + input.wheel * 1.4, 4, 40);
    }
    this.camYaw = damp(this.camYaw, 0, 0.7, dt);

    const fx = Math.cos(this.heading);
    const fz = Math.sin(this.heading);
    const yaw = this.heading + this.camYaw;
    const bx = Math.cos(yaw);
    const bz = Math.sin(yaw);
    const groundY = this.terrain.height(this.pos.x, this.pos.z);
    const speedNorm = clamp(Math.abs(this.speed) / this.tuning.maxSpeed, 0, 1);

    let desired = this._tmp;
    let lookAt = this._camLook;

    switch (CAMERA_MODES[this.camMode]) {
      case 'HOOD': {
        const hx = this.pos.x + fx * 0.35;
        const hz = this.pos.z + fz * 0.35;
        desired.set(hx, groundY + this.dims.cam.hoodHeight, hz);
        lookAt.set(this.pos.x + fx * 40, groundY + this.dims.cam.lookHeight + Math.sin(this.camPitch) * 24, this.pos.z + fz * 40);
        camera.position.lerp(desired, 1 - Math.exp(-22 * dt));
        break;
      }
      case 'CINEMA': {
        const t = performance.now() * 0.00016;
        const ang = yaw + Math.PI * 0.72 + Math.sin(t) * 0.4;
        const dist = 17 + Math.sin(t * 0.7) * 4;
        desired.set(this.pos.x + Math.cos(ang) * dist, groundY + 3.2 + Math.sin(t * 0.9) * 1.4, this.pos.z + Math.sin(ang) * dist);
        lookAt.set(this.pos.x + fx * 6, groundY + 2.1, this.pos.z + fz * 6);
        camera.position.lerp(desired, 1 - Math.exp(-4 * dt));
        break;
      }
      case 'FREE': {
        const dist = this.camDist;
        const ang = yaw + Math.PI;
        desired.set(
          this.pos.x + Math.cos(ang) * dist * Math.cos(this.camPitch),
          groundY + 2.4 + dist * Math.sin(this.camPitch) + 2,
          this.pos.z + Math.sin(ang) * dist * Math.cos(this.camPitch)
        );
        lookAt.set(this.pos.x, groundY + 1.9, this.pos.z);
        camera.position.lerp(desired, 1 - Math.exp(-12 * dt));
        break;
      }
      default: {
        const dist = this.dims.cam.dist + speedNorm * 2.6;
        const ang = yaw + Math.PI;
        const height = this.dims.cam.height + speedNorm * 0.7;
        desired.set(this.pos.x + Math.cos(ang) * dist, groundY + height, this.pos.z + Math.sin(ang) * dist);
        lookAt.set(this.pos.x + bx * 7, groundY + this.dims.cam.lookHeight, this.pos.z + bz * 7);
        camera.position.lerp(desired, 1 - Math.exp(-9 * dt));
        break;
      }
    }

    if (CAMERA_MODES[this.camMode] !== 'HOOD') {
      const minY = this.terrain.height(camera.position.x, camera.position.z) + 1.2;
      if (camera.position.y < minY) camera.position.y = minY;
    }

    // camera shake from wind + speed + ground bumps
    const amp = this.shake * 0.5 + speedNorm * 0.045;
    const tsec = performance.now() * 0.001;
    camera.position.x += Math.sin(tsec * 23.1) * amp;
    camera.position.y += Math.sin(tsec * 31.7) * amp;
    camera.position.z += Math.cos(tsec * 19.3) * amp;

    this._camLookCur = this._camLookCur || lookAt.clone();
    this._camLookCur.lerp(lookAt, 1 - Math.exp(-(CAMERA_MODES[this.camMode] === 'HOOD' ? 25 : 10) * dt));
    camera.lookAt(this._camLookCur);

    const targetFov = 62 + speedNorm * 12 + this.shake * 6;
    camera.fov = damp(camera.fov, targetFov, 4, dt);
    camera.updateProjectionMatrix();

    // subtle roll with drift
    camera.rotateZ(-this.lateralVel * 0.006 - this.steerSmooth * speedNorm * 0.02);
  }

  get worldSpeedVector() {
    return this._speedVec.set(this.velocity.x, 0, this.velocity.z);
  }
}
