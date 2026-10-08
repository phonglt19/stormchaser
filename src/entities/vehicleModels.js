// Procedural player-vehicle models. Each builder populates the Vehicle's
// `body`/`group` with meshes and records its dimensions on `vehicle.dims`.
// Physics tuning lives in config.js (VEHICLE_MODELS); only geometry is here.
import * as THREE from 'three';
import { TAU } from '../core/math.js';

function makeMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.62, metalness: 0.12, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.85, metalness: 0.08, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: 0xe0621f, roughness: 0.6, metalness: 0.05, flatShading: true }),
    tire: new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xaab3bb, roughness: 0.42, metalness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.18, metalness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x878f97, roughness: 0.5, metalness: 0.25 }),
    spike: new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.4, metalness: 0.7, flatShading: true }),
  };
}

// Positions are [x (forward), z (right), isFront]. Adds steered pivot groups.
function buildWheels(vehicle, positions, wheelR, wheelWidth, mat) {
  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelWidth, 16);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelWidth + 0.02, 8);
  rimGeo.rotateX(Math.PI / 2);
  for (const [x, z, isFront] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelR, z);
    const tire = new THREE.Mesh(tireGeo, mat.tire);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, mat.rim);
    tire.add(rim);
    pivot.add(tire);
    vehicle.group.add(pivot);
    vehicle.wheels.push({ pivot, tire, isFront });
  }
}

// ----------------------------------------------------------------- intercept
function buildIntercept(vehicle) {
  const m = makeMaterials();
  vehicle.dims = {
    wheelR: 0.58,
    colliderPad: 2.4,
    cam: { dist: 9.5, height: 3.6, hoodHeight: 2.62, lookHeight: 2.1 },
  };

  const length = 5.4;
  const width = 2.4;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(length, 1.15, width), m.body);
  chassis.position.y = 0.95;
  chassis.castShadow = true;
  vehicle.body.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, width * 0.92), m.accent);
  nose.position.set(length / 2 + 0.4, 0.78, 0);
  nose.rotation.z = -0.16;
  nose.castShadow = true;
  vehicle.body.add(nose);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, width * 1.04), m.dark);
  bumper.position.set(length / 2 + 0.2, 0.62, 0);
  bumper.castShadow = true;
  vehicle.body.add(bumper);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.95, width * 0.88), m.dark);
  cabin.position.set(-0.35, 1.95, 0);
  cabin.castShadow = true;
  vehicle.body.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, width * 0.76), m.glass);
  windshield.position.set(0.95, 1.98, 0);
  windshield.rotation.z = -0.42;
  vehicle.body.add(windshield);

  const rack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, width * 0.9), m.dark);
  rack.position.set(-0.4, 2.48, 0);
  vehicle.body.add(rack);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), m.rim);
  mast.position.set(-1.3, 3.2, 0.6);
  vehicle.body.add(mast);
  const cups = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.28, 8), m.accent);
  cups.position.set(-1.3, 3.95, 0.6);
  vehicle.body.add(cups);

  const radar = new THREE.Group();
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 14, 8, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x878f97, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide })
  );
  dish.rotation.x = -1.15;
  radar.add(dish);
  radar.position.set(-1.1, 2.75, -0.65);
  vehicle.body.add(radar);
  vehicle.radar = radar;

  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.34), m.dark);
  bar.position.set(0.75, 2.65, 0);
  vehicle.body.add(bar);
  for (let i = 0; i < 2; i++) {
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: i === 0 ? 0x220505 : 0x05051f, emissive: i === 0 ? 0xff2200 : 0x2255ff, emissiveIntensity: 1.6 })
    );
    lens.position.set(0.5 + i * 0.55, 2.67, 0);
    vehicle.body.add(lens);
    vehicle.strobes.push(lens);
  }

  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.62, 0.16), m.accent);
    plate.position.set(-0.1, 1.1, (width / 2) * s);
    plate.castShadow = true;
    vehicle.body.add(plate);
  }

  const band = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.52, width * 0.9), m.glass);
  band.position.set(-0.35, 1.98, 0);
  vehicle.body.add(band);

  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0x330606, emissive: 0xff2a2a, emissiveIntensity: 1.1 }));
    tl.position.set(-length / 2 - 0.08, 1.0, s * 0.7);
    vehicle.body.add(tl);
  }

  buildWheels(vehicle, [
    [1.72, -1.22, true],
    [1.72, 1.22, true],
    [-1.72, -1.22, false],
    [-1.72, 1.22, false],
  ], 0.58, 0.44, m);
}

// ------------------------------------------------------------------- joker II
// The heavy spike-anchored interceptor: ~7.6 m, six wheels, reinforced cab,
// a rear radar room with a rapid-scan X-band dish, triple anemometers and
// eight deployable ground-anchor spikes.
function buildJoker2(vehicle) {
  const m = makeMaterials();
  m.body = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.68, metalness: 0.18, flatShading: true });
  m.accent = new THREE.MeshStandardMaterial({ color: 0xd23c2b, roughness: 0.55, metalness: 0.1, flatShading: true });

  const length = 7.6;
  const width = 3.0;
  const hw = width / 2;

  vehicle.dims = {
    wheelR: 0.82,
    colliderPad: 3.0,
    cam: { dist: 13.5, height: 5.4, hoodHeight: 3.7, lookHeight: 2.9 },
  };

  // Heavy main hull.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(length, 1.7, width), m.body);
  hull.position.y = 1.55;
  hull.castShadow = true;
  vehicle.body.add(hull);

  // Lower armor skirt over the drivetrain.
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(length * 0.98, 0.75, width * 1.02), m.dark);
  skirt.position.y = 0.85;
  skirt.castShadow = true;
  vehicle.body.add(skirt);

  // Cab (front) with glazing.
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.6, width * 0.94), m.body);
  cab.position.set(length / 2 - 1.7, 3.1, 0);
  cab.castShadow = true;
  vehicle.body.add(cab);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, width * 0.82), m.glass);
  windshield.position.set(length / 2 - 0.5, 3.05, 0);
  windshield.rotation.z = -0.34;
  vehicle.body.add(windshield);

  const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, width * 0.95), m.glass);
  cabGlass.position.set(length / 2 - 1.75, 3.35, 0);
  vehicle.body.add(cabGlass);

  // Reinforced roll cage bars over the cab.
  for (const s of [-1, 1]) {
    const barX = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), m.steel);
    barX.position.set(length / 2 - 1.7, 3.95, s * (width * 0.42));
    vehicle.body.add(barX);
  }

  // Front brush guard, bumper and winch.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.3, width * 0.9), m.dark);
  guard.position.set(length / 2 + 0.25, 1.5, 0);
  guard.castShadow = true;
  vehicle.body.add(guard);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, width * 1.04), m.dark);
  bumper.position.set(length / 2 + 0.1, 0.75, 0);
  vehicle.body.add(bumper);
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 10), m.steel);
  winch.rotation.z = Math.PI / 2;
  winch.position.set(length / 2 + 0.4, 1.1, 0);
  vehicle.body.add(winch);
  for (const s of [-1, 1]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xffb347, emissiveIntensity: 1.2 }));
    light.position.set(length / 2 + 0.45, 2.1, s * 0.9);
    vehicle.body.add(light);
  }

  // Mirrors + exhaust stacks.
  for (const s of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), m.steel);
    mirror.position.set(length / 2 - 2.5, 3.4, s * (hw + 0.28));
    vehicle.body.add(mirror);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 8), m.steel);
    stack.position.set(length / 2 - 3.2, 3.3, s * (hw - 0.35));
    stack.castShadow = true;
    vehicle.body.add(stack);
  }

  // Roof light bar with strobes.
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.24, 0.4), m.dark);
  bar.position.set(length / 2 - 1.7, 4.0, 0);
  vehicle.body.add(bar);
  for (let i = 0; i < 2; i++) {
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.22, 0.34),
      new THREE.MeshStandardMaterial({ color: i === 0 ? 0x220505 : 0x05051f, emissive: i === 0 ? 0xff2200 : 0x2255ff, emissiveIntensity: 1.6 })
    );
    lens.position.set(length / 2 - 1.7 + (i === 0 ? -0.45 : 0.45), 4.02, 0);
    vehicle.body.add(lens);
    vehicle.strobes.push(lens);
  }

  // Rear radar room.
  const room = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.7, width * 0.96), m.body);
  room.position.set(-length / 2 + 1.9, 3.15, 0);
  room.castShadow = true;
  vehicle.body.add(room);
  const roomGlass = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.55, width * 0.98), m.glass);
  roomGlass.position.set(-length / 2 + 1.9, 3.5, 0);
  vehicle.body.add(roomGlass);

  // Rapid-scan X-band dish on the radar room roof (spins in update()).
  const radar = new THREE.Group();
  const radarBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 10), m.steel);
  radar.add(radarBase);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 10, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide })
  );
  dish.rotation.x = -1.1;
  dish.position.y = 0.28;
  radar.add(dish);
  radar.position.set(-length / 2 + 1.9, 4.05, 0);
  vehicle.body.add(radar);
  vehicle.radar = radar;

  // Triple-redundant anemometer on a mast (spins in update()).
  const anemometer = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), m.steel);
  mast.position.y = 0.8;
  anemometer.add(mast);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), m.steel);
    arm.position.set(Math.cos(a) * 0.25, 1.6, Math.sin(a) * 0.25);
    arm.rotation.y = -a;
    anemometer.add(arm);
    const cup = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 8), m.accent);
    cup.rotation.z = Math.PI;
    cup.position.set(Math.cos(a) * 0.5, 1.6, Math.sin(a) * 0.5);
    anemometer.add(cup);
  }
  anemometer.position.set(-length / 2 + 0.9, 4.0, 0.85);
  vehicle.body.add(anemometer);
  vehicle.anemometer = anemometer;

  // Fenders over each wheel.
  const fenderXs = [2.5, -1.7, -3.1];
  for (const fx of fenderXs) {
    for (const s of [-1, 1]) {
      const fender = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.5), m.dark);
      fender.position.set(fx, 1.62, s * (hw - 0.05));
      vehicle.body.add(fender);
    }
  }

  // Tail lights + rear plate.
  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.6), new THREE.MeshStandardMaterial({ color: 0x330606, emissive: 0xff2a2a, emissiveIntensity: 1.2 }));
    tl.position.set(-length / 2 - 0.1, 1.3, s * 0.9);
    vehicle.body.add(tl);
  }

  // Eight deployable ground-anchor spikes: four exterior corner spikes angled
  // out/into the ground, four auxiliary spikes driving straight down.
  const spikeGeo = new THREE.ConeGeometry(0.17, 1.3, 8);
  const addSpike = (x, z, rotX, rest, out) => {
    const mesh = new THREE.Mesh(spikeGeo, m.spike);
    mesh.rotation.x = rotX;
    mesh.position.copy(rest);
    mesh.castShadow = true;
    vehicle.body.add(mesh);
    vehicle.spikes.push({ mesh, rest: rest.clone(), out: out.clone() });
  };
  const corner = Math.PI * 0.75;
  for (const s of [-1, 1]) {
    addSpike(2.3, s * hw, s * corner,
      new THREE.Vector3(2.3, 1.05, s * hw),
      new THREE.Vector3(2.3, 0.55, s * (hw + 0.5)));
    addSpike(-2.4, s * hw, s * corner,
      new THREE.Vector3(-2.4, 1.05, s * hw),
      new THREE.Vector3(-2.4, 0.55, s * (hw + 0.5)));
    addSpike(0.2, s * hw, Math.PI,
      new THREE.Vector3(0.2, 0.95, s * hw),
      new THREE.Vector3(0.2, 0.25, s * hw));
    addSpike(-0.9, s * hw, Math.PI,
      new THREE.Vector3(-0.9, 0.95, s * hw),
      new THREE.Vector3(-0.9, 0.25, s * hw));
  }

  // Six wheels: front pair + dual rear axle.
  buildWheels(vehicle, [
    [2.5, -1.5, true],
    [2.5, 1.5, true],
    [-1.7, -1.5, false],
    [-1.7, 1.5, false],
    [-3.1, -1.5, false],
    [-3.1, 1.5, false],
  ], 0.82, 0.6, m);
}

export const BUILDERS = { intercept: buildIntercept, joker2: buildJoker2 };

export function buildVehicleModel(vehicle, modelId) {
  vehicle.wheels = [];
  vehicle.strobes = [];
  vehicle.spikes = [];
  vehicle.radar = null;
  vehicle.anemometer = null;
  (BUILDERS[modelId] || BUILDERS.intercept)(vehicle);
  vehicle.group.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
}
