import * as THREE from 'three';
import { VEHICLE, CAMERA_MODES } from '../config.js';
import { clamp, damp, msToMph, TAU } from '../core/math.js';

const WHEEL_R = 0.58;
const TRACK = 1.22;
const WHEELBASE = 1.72;

export class Vehicle {
  constructor(terrain, scenery) {
    this.terrain = terrain;
    this.scenery = scenery;
    this.colliders = scenery ? scenery.colliders : [];

    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = -Math.PI / 2;
    this.speed = 0;
    this.lateralVel = 0;
    this.windVel = new THREE.Vector2();
    this.steerSmooth = 0;
    this.integrity = VEHICLE.integrityMax;
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
    this._build();
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
    const matBody = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.62, metalness: 0.12, flatShading: true });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.85, metalness: 0.08, flatShading: true });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0xe0621f, roughness: 0.6, metalness: 0.05, flatShading: true });
    const matTire = new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.95 });
    const matRim = new THREE.MeshStandardMaterial({ color: 0xaab3bb, roughness: 0.42, metalness: 0.55 });

    const length = 5.4;
    const width = 2.4;

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(length, 1.15, width), matBody);
    chassis.position.y = 0.95;
    chassis.castShadow = true;
    this.body.add(chassis);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, width * 0.92), matAccent);
    nose.position.set(length / 2 + 0.4, 0.78, 0);
    nose.rotation.z = -0.16;
    nose.castShadow = true;
    this.body.add(nose);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, width * 1.04), matDark);
    bumper.position.set(length / 2 + 0.2, 0.62, 0);
    bumper.castShadow = true;
    this.body.add(bumper);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.95, width * 0.88), matDark);
    cabin.position.set(-0.35, 1.95, 0);
    cabin.castShadow = true;
    this.body.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, width * 0.76), new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.18, metalness: 0.25 }));
    windshield.position.set(0.95, 1.98, 0);
    windshield.rotation.z = -0.42;
    this.body.add(windshield);

    // roof rack + instrument mast
    const rack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, width * 0.9), matDark);
    rack.position.set(-0.4, 2.48, 0);
    this.body.add(rack);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), matRim);
    mast.position.set(-1.3, 3.2, 0.6);
    this.body.add(mast);
    const cups = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.28, 8), matAccent);
    cups.position.set(-1.3, 3.95, 0.6);
    this.body.add(cups);

    // spinning radar dish
    this.radar = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x878f97, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }));
    dish.rotation.x = -1.15;
    this.radar.add(dish);
    this.radar.position.set(-1.1, 2.75, -0.65);
    this.body.add(this.radar);

    // light bar with strobes
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.34), matDark);
    bar.position.set(0.75, 2.65, 0);
    this.body.add(bar);
    this.strobes = [];
    for (let i = 0; i < 2; i++) {
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.2, 0.3),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0x220505 : 0x05051f, emissive: i === 0 ? 0xff2200 : 0x2255ff, emissiveIntensity: 1.6 })
      );
      lens.position.set(0.5 + i * 0.55, 2.67, 0);
      this.body.add(lens);
      this.strobes.push(lens);
    }

    // armor plating
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.62, 0.16), matAccent);
      plate.position.set(-0.1, 1.1, (width / 2) * s);
      plate.castShadow = true;
      this.body.add(plate);
    }

    // windows band
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.52, width * 0.9), new THREE.MeshStandardMaterial({ color: 0x141c24, roughness: 0.16, metalness: 0.3 }));
    band.position.set(-0.35, 1.98, 0);
    this.body.add(band);

    // tail lights
    for (const s of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0x330606, emissive: 0xff2a2a, emissiveIntensity: 1.1 }));
      tl.position.set(-length / 2 - 0.08, 1.0, s * 0.7);
      this.body.add(tl);
    }

    // wheels
    const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.44, 14);
    tireGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, 0.46, 8);
    rimGeo.rotateX(Math.PI / 2);
    const positions = [
      [WHEELBASE, -TRACK, true],
      [WHEELBASE, TRACK, true],
      [-WHEELBASE, -TRACK, false],
      [-WHEELBASE, TRACK, false],
    ];
    for (const [x, z, isFront] of positions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_R, z);
      const tire = new THREE.Mesh(tireGeo, matTire);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, matRim);
      tire.add(rim);
      pivot.add(tire);
      this.group.add(pivot);
      this.wheels.push({ pivot, tire, isFront });
    }

    this.group.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
  }

  // -----------------------------------------------------------------
  reset(pos) {
    if (pos) this.pos.set(pos.x, 0, pos.z);
    this.pos.y = this.terrain.height(this.pos.x, this.pos.z);
    this.speed = 0;
    this.lateralVel = 0;
    this.windVel.set(0, 0);
    this.integrity = VEHICLE.integrityMax;
    this.disabled = false;
    this.heading = -Math.PI / 2;
    this.camYaw = 0;
  }

  damage(amount) {
    this.integrity = clamp(this.integrity - amount, 0, VEHICLE.integrityMax);
    if (this.integrity <= 0) this.disabled = true;
  }

  repair(amount) {
    this.integrity = clamp(this.integrity + amount, 0, VEHICLE.integrityMax);
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

    const maxSpeed = this.boost ? VEHICLE.boostSpeed : VEHICLE.maxSpeed;

    // ---- longitudinal ----
    if (!this.disabled) {
      let accel = 0;
      if (throttleRaw > 0) {
        accel = throttleRaw * VEHICLE.accel * (1 - clamp(Math.abs(this.speed) / maxSpeed, 0, 1));
      } else if (throttleRaw < 0) {
        accel = this.speed > 2 ? throttleRaw * VEHICLE.brakeForce : throttleRaw * VEHICLE.accel * 0.5;
      }
      this.speed += accel * dt;
    }

    const dragAccel =
      VEHICLE.rollResist +
      VEHICLE.engineDrag * this.speed * this.speed +
      (handbrake ? 16 : 0);
    const dv = dragAccel * dt;
    if (Math.abs(this.speed) <= dv) this.speed = 0;
    else this.speed -= Math.sign(this.speed) * dv;

    this.speed = clamp(this.speed, -VEHICLE.reverseSpeed, maxSpeed);

    // ---- steering ----
    const steerTarget = this.disabled ? 0 : steerRaw;
    this.steerSmooth = damp(this.steerSmooth, steerTarget, 9, dt);
    const speedFactor = clamp(Math.abs(this.speed) / 11, 0, 1);
    const falloff = 1 - VEHICLE.steerFalloff * clamp(Math.abs(this.speed) / VEHICLE.maxSpeed, 0, 1);
    const yawRate = this.steerSmooth * VEHICLE.steerRate * speedFactor * falloff * Math.sign(this.speed || 1);
    this.heading += yawRate * dt;

    // ---- lateral slip (drift) ----
    const grip = handbrake ? 2.2 : VEHICLE.grip;
    const gripFactor = clamp(grip / VEHICLE.grip, 0, 1);
    this.lateralVel -= yawRate * this.speed * dt * (1 - gripFactor) * 0.5;
    this.lateralVel -= this.lateralVel * grip * dt;
    this.lateralVel = clamp(this.lateralVel, -14, 14);

    // ---- vortex wind push ----
    if (vortexWind) {
      this.windVel.x += vortexWind.x * 0.55 * dt;
      this.windVel.y += vortexWind.z * 0.55 * dt;
    }
    const windDamp = 1 - Math.exp(-1.1 * dt);
    this.windVel.x -= this.windVel.x * windDamp;
    this.windVel.y -= this.windVel.y * windDamp;
    const windMag = Math.hypot(this.windVel.x, this.windVel.y);
    if (windMag > 22) {
      this.windVel.x *= 22 / windMag;
      this.windVel.y *= 22 / windMag;
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

    this.wheelSpin += (this.speed / WHEEL_R) * dt;
    for (const w of this.wheels) {
      w.tire.rotation.z = this.wheelSpin;
      w.pivot.rotation.y = damp(w.pivot.rotation.y, w.isFront ? this.steerSmooth * 0.42 : 0, 10, dt);
    }

    // ---- strobes + radar ----
    this.strobe += dt;
    const phase = Math.floor((this.strobe * 4) % 2);
    this.strobes[0].material.emissiveIntensity = phase === 0 ? 3.2 : 0.15;
    this.strobes[1].material.emissiveIntensity = phase === 1 ? 3.2 : 0.15;
    this.radar.rotation.y += dt * 1.6;

    // ---- audio ----
    if (audio) {
      audio.setEngine(clamp(Math.abs(this.speed) / VEHICLE.maxSpeed, 0, 1), Math.abs(this.throttleInput));
    }
  }

  _resolveCollisions(prevX, prevZ) {
    for (const c of this.colliders) {
      const dx = this.pos.x - c.x;
      const dz = this.pos.z - c.z;
      const minDist = c.r + 2.4;
      const d = Math.hypot(dx, dz);
      if (d < minDist && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        this.pos.x = c.x + nx * minDist;
        this.pos.z = c.z + nz * minDist;
        const impact = Math.abs((this.pos.x - prevX) * nx + (this.pos.z - prevZ) * nz);
        const closing = (this.speed * (Math.cos(this.heading) * nx + Math.sin(this.heading) * nz));
        if (closing < -VEHICLE.crashSpeed * 0.5) {
          this.damage(clamp((-closing - VEHICLE.crashSpeed * 0.5) * 1.6, 0, 28));
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
    const speedNorm = clamp(Math.abs(this.speed) / VEHICLE.maxSpeed, 0, 1);

    let desired = this._tmp;
    let lookAt = this._camLook;

    switch (CAMERA_MODES[this.camMode]) {
      case 'HOOD': {
        const hx = this.pos.x + fx * 0.35;
        const hz = this.pos.z + fz * 0.35;
        desired.set(hx, groundY + 2.62, hz);
        lookAt.set(this.pos.x + fx * 40, groundY + 2.0 + Math.sin(this.camPitch) * 24, this.pos.z + fz * 40);
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
        const dist = 9.5 + speedNorm * 2.6;
        const ang = yaw + Math.PI;
        const height = 3.6 + speedNorm * 0.7;
        desired.set(this.pos.x + Math.cos(ang) * dist, groundY + height, this.pos.z + Math.sin(ang) * dist);
        lookAt.set(this.pos.x + bx * 7, groundY + 2.1, this.pos.z + bz * 7);
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
