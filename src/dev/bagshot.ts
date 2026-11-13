// Dev-only: renders every 3D bag to a transparent PNG for the Range grid (and the no-WebGL fallback).
// Opened by tools/bagshots.mjs via /tools/bagshot.html. Never part of the site bundle.
import "@fontsource/fraunces/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/tiro-bangla/400.css";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { products } from "../data/products";
import { makeBag } from "../gl/Bag";

const W = 640, H = 860;
const out: Record<string, string> = {};
(window as unknown as { __bags: typeof out; __bagsDone: boolean }).__bags = out;

await document.fonts.ready;
await Promise.all([
  ...['700 80px "Fraunces"', '700 80px "DM Sans"', '600 40px "DM Sans"', '400 40px "DM Sans"'].map((f) => document.fonts.load(f)),
  document.fonts.load('400 70px "Tiro Bangla"', "চুমুক"),
]);

const canvas = document.createElement("canvas");
document.body.append(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// same light rig as the stage
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.45;
const key = new THREE.DirectionalLight(0xffe2bf, 1.8); key.position.set(-3, 3, 6);
const rimR = new THREE.DirectionalLight(0xffb45a, 3.0); rimR.position.set(5, 2, -4);
const rimL = new THREE.DirectionalLight(0xffc98a, 1.4); rimL.position.set(-5, 1, -3);
scene.add(key, rimR, rimL, new THREE.AmbientLight(0x3a2414, 0.7));

const camera = new THREE.PerspectiveCamera(24, W / H, 0.1, 100);
camera.position.set(0, 0.1, 6.6);
camera.lookAt(0, -0.02, 0);

// soft contact shadow baked into the PNG (a CSS drop-shadow filter costs ~110 ms of GPU raster on first paint)
const sc = document.createElement("canvas");
sc.width = 256; sc.height = 64;
const sg = sc.getContext("2d")!;
sg.setTransform(1, 0, 0, 0.25, 0, 0); // squash a circle into an ellipse that fits the canvas
const grad = sg.createRadialGradient(128, 128, 0, 128, 128, 126);
grad.addColorStop(0, "rgba(0,0,0,0.7)"); grad.addColorStop(0.45, "rgba(0,0,0,0.35)"); grad.addColorStop(1, "rgba(0,0,0,0)");
sg.fillStyle = grad; sg.fillRect(0, 0, 256, 256);
const shadowTex = new THREE.CanvasTexture(sc);
shadowTex.colorSpace = THREE.SRGBColorSpace;
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.42), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
shadow.position.set(0.06, -1.0, -0.35);
shadow.renderOrder = -1;
scene.add(shadow);

// ?turn=<id>: front, side, back, side views of one bag (for reviewing the material), else every bag 3/4 front
const turn = new URLSearchParams(location.search).get("turn");
const jobs = turn
  ? [0, 1.57, 3.14, 4.71].map((a, i) => ({ p: products.find((x) => x.id === turn)!, key: `${turn}-${i}`, a }))
  : products.map((p) => ({ p, key: p.id, a: -0.32 })); // three-quarter turn so the gusset and foil read
for (const { p, key, a } of jobs) {
  const { mesh } = makeBag(p);
  mesh.rotation.y = a;
  mesh.rotation.x = 0.04;
  scene.add(mesh);
  renderer.render(scene, camera);
  out[key] = canvas.toDataURL("image/png");
  scene.remove(mesh);
}
(window as unknown as { __bagsDone: boolean }).__bagsDone = true;
