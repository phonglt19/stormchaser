import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

// Instanced rural set-dressing: trees, fence posts, telephone poles + wires,
// farmsteads (house/barn/silo), wind turbines, hay bales and a grain elevator.
export class Scenery {
  constructor(terrain, seed = 777) {
    this.terrain = terrain;
    this.rng = makeRng(seed);
    this.group = new THREE.Group();
    this.group.name = 'scenery';
    this.rotors = [];
    this.colliders = []; // {x, z, r} for vehicle collision
  }

  build() {
    this._fencePosts();
    this._trees();
    this._hayBales();
    this._polesAndWires();
    this._farmsteads();
    this._turbines();
    this._grainElevator();
    return this.group;
  }

  update(dt, windSpeed) {
    const spin = Math.min(3.2, 0.25 + windSpeed * 0.05);
    for (const r of this.rotors) r.rotation.z += spin * dt;
  }

  // ------------------------------------------------------------------
  _spot(minRoadDist, margin = 140, maxSlope = 0.4, tries = 24) {
    const t = this.terrain;
    for (let i = 0; i < tries; i++) {
      const x = this.rng.range(-t.half + margin, t.half - margin);
      const z = this.rng.range(-t.half + margin, t.half - margin);
      if (t.distanceToRoad(x, z) < minRoadDist) continue;
      if (t.slope(x, z) > maxSlope) continue;
      return { x, z };
    }
    return null;
  }

  _spotNearRoad(minDist, maxDist, margin = 140) {
    const t = this.terrain;
    for (let i = 0; i < 30; i++) {
      const x = this.rng.range(-t.half + margin, t.half - margin);
      const z = this.rng.range(-t.half + margin, t.half - margin);
      const d = t.distanceToRoad(x, z);
      if (d < minDist || d > maxDist) continue;
      if (t.slope(x, z) > 0.35) continue;
      return { x, z };
    }
    return null;
  }

  // ------------------------------------------------------------------
  _fencePosts() {
    const t = this.terrain;
    const geo = new THREE.CylinderGeometry(0.09, 0.11, 1.35, 5);
    geo.translate(0, 0.67, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1 });
    const spots = [];
    const spacing = 12;
    const off = 13;

    for (let r = -t.half + t.roadSpacing / 2; r <= t.half; r += t.roadSpacing) {
      for (let s = -t.half; s < t.half; s += spacing) {
        if (!this.rng.chance(0.3)) continue;
        const side = this.rng.sign();
        spots.push({ x: r + off * side, z: s });
        spots.push({ x: s, z: r - off * side });
      }
    }

    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (const sp of spots) {
      if (t.slope(sp.x, sp.z) > 0.5) continue;
      dummy.position.set(sp.x, t.height(sp.x, sp.z), sp.z);
      dummy.rotation.set(this.rng.range(-0.06, 0.06), this.rng.range(0, 6.28), this.rng.range(-0.06, 0.06));
      dummy.scale.setScalar(this.rng.range(0.85, 1.15));
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.castShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  _trees() {
    const t = this.terrain;
    const count = 1500;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 4.6, 6);
    trunkGeo.translate(0, 2.3, 0);
    const leafGeo = new THREE.IcosahedronGeometry(2.4, 0);
    leafGeo.translate(0, 5.6, 0);
    leafGeo.scale(1, 1.25, 1);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 1, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let n = 0;

    for (let i = 0; i < count; i++) {
      const spot = this.rng.chance(0.55)
        ? this._spotNearRoad(17, 60)
        : this._spot(20, 160, 0.5);
      if (!spot) continue;
      const y = t.height(spot.x, spot.z);
      const s = this.rng.range(0.7, 1.5);
      dummy.position.set(spot.x, y, spot.z);
      dummy.rotation.set(0, this.rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(s * this.rng.range(0.85, 1.15), s, s * this.rng.range(0.85, 1.15));
      dummy.updateMatrix();
      trunks.setMatrixAt(n, dummy.matrix);
      leaves.setMatrixAt(n, dummy.matrix);
      const hue = 0.24 + this.rng.range(-0.035, 0.045);
      color.setHSL(hue, this.rng.range(0.25, 0.45), this.rng.range(0.13, 0.24));
      leaves.setColorAt(n, color);
      n++;
    }
    trunks.count = n;
    leaves.count = n;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    trunks.castShadow = true;
    leaves.castShadow = true;
    this.group.add(trunks, leaves);
  }

  _hayBales() {
    const t = this.terrain;
    const count = 150;
    const geo = new THREE.CylinderGeometry(1.15, 1.15, 1.7, 10);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a7d3f, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const spot = this._spot(28, 160, 0.3);
      if (!spot) continue;
      dummy.position.set(spot.x, t.height(spot.x, spot.z) + 1.15, spot.z);
      dummy.rotation.set(0, this.rng.range(0, Math.PI * 2), 0);
      dummy.scale.setScalar(this.rng.range(0.85, 1.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.castShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  _polesAndWires() {
    const t = this.terrain;
    const geo = new THREE.CylinderGeometry(0.16, 0.22, 9, 6);
    geo.translate(0, 4.5, 0);
    const armGeo = new THREE.BoxGeometry(2.4, 0.16, 0.16);
    armGeo.translate(0, 8.1, 0);
    const geoMerged = mergeSimple(geo, armGeo);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4e4438, roughness: 1 });

    const lines = [];
    const spacing = 88;
    const off = 15;
    for (let r = -t.half + t.roadSpacing / 2; r <= t.half; r += t.roadSpacing) {
      const vline = [];
      for (let s = -t.half + 40; s < t.half; s += spacing) vline.push({ x: r + off, z: s });
      lines.push(vline);
      const hline = [];
      for (let s = -t.half + 40; s < t.half; s += spacing) hline.push({ x: s, z: r - off });
      lines.push(hline);
    }

    const poles = lines.flat();
    const mesh = new THREE.InstancedMesh(geoMerged, mat, poles.length);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (const p of poles) {
      dummy.position.set(p.x, t.height(p.x, p.z), p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.castShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);

    // Wires with a little sag between consecutive poles on each line.
    const verts = [];
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        const ay = t.height(a.x, a.z) + 8.1;
        const by = t.height(b.x, b.z) + 8.1;
        const segs = 4;
        const sag = (u) => -Math.sin(u * Math.PI) * 1.1;
        for (let s = 0; s < segs; s++) {
          const u0 = s / segs;
          const u1 = (s + 1) / segs;
          verts.push(
            a.x + (b.x - a.x) * u0, ay + (by - ay) * u0 + sag(u0), a.z + (b.z - a.z) * u0,
            a.x + (b.x - a.x) * u1, ay + (by - ay) * u1 + sag(u1), a.z + (b.z - a.z) * u1
          );
        }
      }
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1b1d20 }));
    this.group.add(wires);
  }

  _farmsteads() {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const spot = this._spotNearRoad(26, 90) || this._spot(30, 200, 0.3);
      if (!spot) continue;
      const g = this._makeFarmstead();
      g.position.set(spot.x, this.terrain.height(spot.x, spot.z), spot.z);
      g.rotation.y = this.rng.range(0, Math.PI * 2);
      this.group.add(g);
      this.colliders.push({ x: spot.x, z: spot.z, r: 16 });
    }
  }

  _makeFarmstead() {
    const g = new THREE.Group();
    const rng = this.rng;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfc9bb, roughness: 0.95, flatShading: true });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 1, flatShading: true });
    const barnMat = new THREE.MeshStandardMaterial({ color: 0x7a2b23, roughness: 1, flatShading: true });
    const siloMat = new THREE.MeshStandardMaterial({ color: 0xa9afb3, roughness: 0.75, metalness: 0.15, flatShading: true });

    // house
    const hw = rng.range(7, 10);
    const hd = rng.range(6, 8);
    const hh = rng.range(3.4, 4.4);
    const house = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), wallMat);
    house.position.y = hh / 2;
    house.castShadow = true;
    house.receiveShadow = true;
    g.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(hw, hd) * 0.78, 2.6, 4), roofMat);
    roof.position.y = hh + 1.3;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    // barn
    const bw = rng.range(11, 16);
    const bh = rng.range(6, 8.5);
    const barn = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw * 0.7), barnMat);
    barn.position.set(rng.range(16, 26), bh / 2, rng.range(-8, 8));
    barn.castShadow = true;
    barn.receiveShadow = true;
    g.add(barn);
    const barnRoof = new THREE.Mesh(new THREE.ConeGeometry(bw * 0.62, 3.4, 4), roofMat);
    barnRoof.position.set(barn.position.x, bh + 1.7, barn.position.z);
    barnRoof.rotation.y = Math.PI / 4;
    barnRoof.castShadow = true;
    g.add(barnRoof);

    // silos
    const siloCount = rng.int(1, 2);
    for (let i = 0; i < siloCount; i++) {
      const sh = rng.range(9, 13);
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, sh, 12), siloMat);
      silo.position.set(barn.position.x + 6 + i * 5, sh / 2, barn.position.z + 8);
      silo.castShadow = true;
      g.add(silo);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(2.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), siloMat);
      cap.position.set(silo.position.x, sh, silo.position.z);
      g.add(cap);
    }

    // shelter belt trees
    for (let i = 0; i < rng.int(3, 7); i++) {
      const s = rng.range(0.6, 1.1);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 4, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }));
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), new THREE.MeshStandardMaterial({ color: 0x33502a, roughness: 1, flatShading: true }));
      const tx = rng.range(-16, 16);
      const tz = rng.range(-16, 16);
      trunk.position.set(tx, 2 * s, tz);
      trunk.scale.setScalar(s);
      leaf.position.set(tx, 5 * s, tz);
      leaf.scale.setScalar(s);
      trunk.castShadow = true;
      leaf.castShadow = true;
      g.add(trunk, leaf);
    }

    return g;
  }

  _turbines() {
    const count = 12;
    const mat = new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.6, metalness: 0.1, flatShading: true });
    for (let i = 0; i < count; i++) {
      const spot = this._spot(60, 260, 0.28, 40);
      if (!spot) continue;
      const g = new THREE.Group();
      const h = this.rng.range(58, 82);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.3, h, 10), mat);
      tower.position.y = h / 2;
      tower.castShadow = true;
      g.add(tower);

      const nacelle = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 2.4), mat);
      nacelle.position.set(0, h + 0.6, -0.8);
      nacelle.castShadow = true;
      g.add(nacelle);

      const rotor = new THREE.Group();
      rotor.position.set(0, h + 0.6, 1.6);
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 30, 0.35), mat);
        blade.position.y = 15;
        const holder = new THREE.Group();
        holder.rotation.z = (b / 3) * Math.PI * 2;
        holder.add(blade);
        rotor.add(holder);
      }
      g.add(rotor);
      this.rotors.push(rotor);

      g.position.set(spot.x, this.terrain.height(spot.x, spot.z), spot.z);
      g.rotation.y = 0.6 + i * 0.15;
      this.group.add(g);
      this.colliders.push({ x: spot.x, z: spot.z, r: 3.5 });
    }
  }

  _grainElevator() {
    const spot = this._spotNearRoad(22, 45, 300);
    if (!spot) return;
    const g = new THREE.Group();
    const conc = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.9, flatShading: true });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8f969c, roughness: 0.7, metalness: 0.25, flatShading: true });
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 30, 14), conc);
    base.position.y = 15;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);
    for (let i = 0; i < 4; i++) {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 22, 14), steel);
      silo.position.set(-14 + i * 9.5, 11, 13 + (i % 2) * 6);
      silo.castShadow = true;
      g.add(silo);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(4, 2.6, 14), steel);
      cap.position.set(silo.position.x, 23.3, silo.position.z);
      g.add(cap);
    }
    g.position.set(spot.x, this.terrain.height(spot.x, spot.z), spot.z);
    g.rotation.y = this.rng.range(0, Math.PI);
    this.group.add(g);
    this.colliders.push({ x: spot.x, z: spot.z, r: 24 });
  }
}

// Minimal geometry merge (position + normal + uv) without pulling in addons.
function mergeSimple(a, b) {
  const ga = a.toNonIndexed();
  const gb = b.toNonIndexed();
  const pos = [];
  const nor = [];
  const uv = [];
  for (const g of [ga, gb]) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  ga.dispose();
  gb.dispose();
  return out;
}
