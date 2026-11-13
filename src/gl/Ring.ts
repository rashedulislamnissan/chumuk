import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Spiral shared by loader and burst. Pixels, origin at screen centre, y UP. */
export function spiral(minDim: number, n = 520) {
  const k = minDim / 1080;
  const a0 = (245 * Math.PI) / 180, a1 = (-55 * Math.PI) / 180;
  const pts: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + (a1 - a0) * u;
    const r = (250 - 105 * u) * k;
    pts.push({ x: r * Math.cos(a), y: -r * Math.sin(a), w: (3 + 17 * Math.pow(u, 0.8)) * k });
  }
  return { pts, k };
}

const RADIAL = 22;

function tubeGeometry(minDim: number) {
  const { pts } = spiral(minDim);
  const N = pts.length;
  const pos = new Float32Array(N * (RADIAL + 1) * 3);
  const nrm = new Float32Array(N * (RADIAL + 1) * 3);
  const ctr = new Float32Array(N * (RADIAL + 1) * 3);
  const wid = new Float32Array(N * (RADIAL + 1));
  let o = 0;
  for (let i = 0; i < N; i++) {
    const p = pts[i], q = pts[Math.min(N - 1, i + 1)], r = pts[Math.max(0, i - 1)];
    let tx = q.x - r.x, ty = q.y - r.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx; // in-plane normal
    for (let j = 0; j <= RADIAL; j++) {
      const th = (j / RADIAL) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const ox = nx * c, oy = ny * c, oz = s;
      pos[o * 3] = p.x + ox * p.w; pos[o * 3 + 1] = p.y + oy * p.w; pos[o * 3 + 2] = oz * p.w;
      nrm[o * 3] = ox; nrm[o * 3 + 1] = oy; nrm[o * 3 + 2] = oz;
      ctr[o * 3] = p.x; ctr[o * 3 + 1] = p.y; ctr[o * 3 + 2] = 0;
      wid[o] = p.w;
      o++;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < N - 1; i++)
    for (let j = 0; j < RADIAL; j++) {
      const a = i * (RADIAL + 1) + j, b = a + RADIAL + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1); // CCW seen from outside

    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("aC", new THREE.BufferAttribute(ctr, 3));
  g.setAttribute("aW", new THREE.BufferAttribute(wid, 1));
  g.setIndex(idx);
  return { g, pts, segIdx: RADIAL * 6 };
}

export class Ring {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  private group = new THREE.Group();
  private mat: THREE.MeshPhysicalMaterial;
  private uniforms = { uTime: { value: 0 }, uThick: { value: 1 } };
  private tube?: THREE.Mesh;
  private head: THREE.Mesh;
  private tail: THREE.Mesh;
  private pts: { x: number; y: number; w: number }[] = [];
  private segIdx = 0;
  private drops: THREE.InstancedMesh;
  private dropData: { x: number; y: number; vx: number; vy: number; s: number; born: number }[] = [];
  private minDim = 1080;
  private dummy = new THREE.Object3D();

  constructor(renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4); key.position.set(-0.5, 0.8, 1);
    const fill = new THREE.DirectionalLight(0xffa040, 1.2); fill.position.set(0.7, -0.6, 0.6);
    this.scene.add(key, fill);

    const params: THREE.MeshPhysicalMaterialParameters = {
      color: 0xd47f22, roughness: 0.2, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05,
      emissive: 0x6a2e06, emissiveIntensity: 0.5, sheen: 0.15, sheenColor: new THREE.Color(0xffc070),
    };
    this.mat = new THREE.MeshPhysicalMaterial(params);
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uThick = this.uniforms.uThick;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aC; attribute float aW; uniform float uTime; uniform float uThick;")
        .replace("#include <begin_vertex>", `
          vec3 transformed = aC + (position - aC) * uThick;
          float wob = sin(aC.x * 0.045 + uTime * 2.6) * cos(aC.y * 0.05 - uTime * 2.1) + 0.5 * sin(aC.x * 0.11 - aC.y * 0.07 + uTime * 3.7);
          transformed += normal * wob * aW * uThick * 0.16;`);
    };
    // caps and droplets share the material (without the tube attributes)
    const capMat = new THREE.MeshPhysicalMaterial(params);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), capMat);
    this.tail = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), capMat);
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), capMat, 30);
    this.drops.count = 0;
    this.group.add(this.head, this.tail);
    this.scene.add(this.group, this.drops);
  }

  resize(w: number, h: number) {
    this.camera.left = -w / 2; this.camera.right = w / 2; this.camera.top = h / 2; this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
    const md = Math.min(w, h);
    if (Math.abs(md - this.minDim) > 1 || !this.tube) {
      this.minDim = md;
      if (this.tube) { this.group.remove(this.tube); this.tube.geometry.dispose(); }
      const { g, pts, segIdx } = tubeGeometry(md);
      this.tube = new THREE.Mesh(g, this.mat);
      this.pts = pts; this.segIdx = segIdx;
      this.group.add(this.tube);
    }
  }

  /** draw: 0..1 how much of the spiral is drawn. */
  setDraw(draw: number) {
    if (!this.tube) return;
    const n = this.pts.length - 1;
    const segs = Math.max(1, Math.floor(draw * n));
    this.tube.geometry.setDrawRange(0, segs * this.segIdx);
    const h = this.pts[Math.min(n, segs)], t = this.pts[0];
    const th = this.uniforms.uThick.value;
    this.head.position.set(h.x, h.y, 0); this.head.scale.setScalar(h.w * th * 1.02);
    this.tail.position.set(t.x, t.y, 0); this.tail.scale.setScalar(t.w * th);
    this.head.visible = this.tail.visible = draw > 0.004;
    this.tube.visible = draw > 0.004;
  }

  /** scale of the whole ring, extra thickness, rotation (rad), visibility. */
  setTransform(scale: number, thick: number, rot: number, visible: boolean) {
    this.group.scale.setScalar(scale);
    this.group.rotation.z = rot;
    this.uniforms.uThick.value = thick;
    this.group.visible = visible;
  }

  /** Throws liquid droplets off the ring (called once at burst). */
  splash(now: number, scale: number) {
    this.dropData = [];
    const n = this.pts.length;
    for (let i = 0; i < 30; i++) {
      const p = this.pts[Math.floor(n * (0.15 + Math.random() * 0.85)) % n];
      const r = Math.hypot(p.x, p.y) || 1;
      const sp = (260 + Math.random() * 900) * (this.minDim / 1080);
      const tang = (Math.random() - 0.5) * 0.9;
      this.dropData.push({
        x: p.x * scale, y: p.y * scale,
        vx: (p.x / r + tang * -p.y / r) * sp, vy: (p.y / r + tang * p.x / r) * sp,
        s: (3 + Math.random() * 11) * (this.minDim / 1080), born: now + Math.random() * 0.12,
      });
    }
    this.drops.count = this.dropData.length;
  }

  update(time: number) {
    this.uniforms.uTime.value = time;
    if (!this.dropData.length) return;
    const g = -1300 * (this.minDim / 1080);
    let alive = 0;
    this.dropData.forEach((d, i) => {
      const t = time - d.born;
      const life = 1.1;
      const k = t < 0 ? 0 : Math.max(0, 1 - t / life);
      this.dummy.position.set(d.x + d.vx * Math.max(0, t), d.y + d.vy * Math.max(0, t) + 0.5 * g * Math.max(0, t) ** 2, 40);
      this.dummy.scale.set(d.s * k, d.s * k * (1 + Math.min(1.2, Math.hypot(d.vx, d.vy) / 900) * k), d.s * k);
      this.dummy.rotation.z = Math.atan2(d.vy + g * Math.max(0, t), d.vx) - Math.PI / 2;
      this.dummy.updateMatrix();
      this.drops.setMatrixAt(i, this.dummy.matrix);
      if (k > 0) alive++;
    });
    this.drops.instanceMatrix.needsUpdate = true;
    if (!alive && time > this.dropData[0].born + 1.5) { this.dropData = []; this.drops.count = 0; }
  }
}
