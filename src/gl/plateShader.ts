// Full-screen "living still" compositor: two plates (A, B), camera per plate, flow-map
// animation, zoom blur + twist transitions, outline word behind bright objects, reveal mask, grade.
export const plateVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const plateFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D uTexA, uTexB, uWord;
uniform vec2  uRes;
uniform float uTime, uImgAspect;
uniform vec4  uCamA, uCamB;          // anchor.xy, zoom, twist
uniform vec2  uFocA, uFocB;          // focus points
uniform float uRoll, uSpeed, uWarp;  // camera roll, flow speed boost, hand-over liquid warp
uniform vec4  uFlA[4], uFsA[4], uFlB[4], uFsB[4];
uniform float uMix, uBlur, uFlowAmt, uFade, uGrain;
uniform vec3  uReveal;               // px centre (y down), radius px (>=1e5 = off)
uniform float uRevealSoft;
uniform float uWordAlpha, uWordScale, uWordY, uWordAspect;
uniform float uWipe;                 // >= 0: water-line hand-over, line y position (screen, y down)
uniform vec3  uHole;                 // portal: px centre (y down), radius px (< 0 = off)

vec3 tex(sampler2D t, vec2 uv) { return texture2D(t, vec2(uv.x, 1.0 - uv.y)).rgb; }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// cam = (anchor.xy: where the focus point sits on screen, zoom, twist). foc = focus point in image uv.
vec2 viewUV(vec2 s, vec4 cam, vec2 foc, float zoomMul) {
  float a = uRes.x / uRes.y;
  vec2 sc = a > uImgAspect ? vec2(1.0, uImgAspect / a) : vec2(a / uImgAspect, 1.0);
  float z = cam.z * zoomMul;
  // camera roll + handheld sway around the anchor
  vec2 ss = s - cam.xy;
  ss = vec2(ss.x * a, ss.y);
  ss = rot(uRoll) * ss;
  ss = vec2(ss.x / a, ss.y);
  vec2 d = ss * sc / z;
  if (abs(cam.w) > 0.0001) {
    vec2 q = d * vec2(uImgAspect, 1.0);
    float r = length(q);
    float ang = cam.w * pow(max(0.0, 1.0 - r / 0.8), 2.0);
    q = rot(ang) * q;
    d = q / vec2(uImgAspect, 1.0);
  }
  // keep the frame inside the image (continuous: zoomed out past cover = centred)
  vec2 hs = 0.5 * sc / z;
  vec2 c = foc - (cam.xy - 0.5) * sc / z;
  vec2 ce = clamp(c, min(hs, vec2(0.5)), max(1.0 - hs, vec2(0.5)));
  return foc + d + (ce - c);
}

vec2 flowField(vec2 uv, vec4 F[4], vec4 S[4]) {
  vec2 v = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float type = F[i].x;
    if (type < 0.5) continue;
    vec2 c = F[i].yz; float k = F[i].w; vec2 sz = S[i].xy;
    vec2 q = (uv - c) / sz;
    float r = length(q);
    if (type < 1.5) {                       // stream
      float m = smoothstep(1.0, 0.25, abs(q.x)) * smoothstep(0.0, -0.015, uv.y - c.y);
      v += vec2(0.0, k) * m;
    } else if (type < 2.5) {                // swirl
      float m = smoothstep(1.0, 0.35, r) * smoothstep(0.0, 0.12, r);
      vec2 tng = vec2(-q.y * sz.x, q.x * sz.y) / max(r, 0.001);
      v += (tng / max(sz.x, sz.y)) * k * m - (q * sz) * 0.12 * k * m / max(sz.x, sz.y);
    } else if (type < 3.5) {                // steam
      float m = smoothstep(1.0, 0.0, r);
      float w = sin(uv.y * 34.0 + uTime * 1.4) * 0.5 + sin(uv.y * 13.0 - uTime * 0.9) * 0.5;
      v += vec2(w * k * 0.45, -k) * m;
    }
  }
  return v;
}

vec2 bobOffset(vec2 uv, vec4 F[4], vec4 S[4]) {
  vec2 o = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    if (abs(F[i].x - 4.0) > 0.5) continue;
    vec2 q = (uv - F[i].yz) / S[i].xy;
    float m = smoothstep(1.4, 0.6, length(q));
    o.y += sin(uTime * 1.7) * F[i].w * m;
  }
  return o;
}

float smoothNoise(vec2 p) {
  return 0.5 + 0.25 * sin(p.x * 17.0 + sin(p.y * 11.0) * 2.0) + 0.25 * sin(p.y * 19.0 + sin(p.x * 7.0) * 2.5);
}

// fade to black outside the image (only reachable when zoomed out on phones)
float edgeMask(vec2 uv) {
  return smoothstep(0.0, 0.07, uv.y) * smoothstep(1.0, 0.93, uv.y) * smoothstep(0.0, 0.03, uv.x) * smoothstep(1.0, 0.97, uv.x);
}

// underwater caustic light web (tileable, after the classic "water caustic" iteration)
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.2831 * 1.6, 6.2831) - 250.0;
  vec2 i = p;
  float c = 1.0, inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.5);
}

// type-5 regions: ripple offset (x,y) and caustic weight (z)
vec3 causticRegion(vec2 uv, vec4 F[4], vec4 S[4]) {
  vec3 r = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (abs(F[i].x - 5.0) > 0.5) continue;
    vec2 q = (uv - F[i].yz) / S[i].xy;
    float m = smoothstep(1.0, 0.4, length(q)) * F[i].w;
    r.xy += vec2(sin(uv.y * 38.0 + uTime * 1.6) + sin(uv.x * 23.0 - uTime * 1.1),
                 cos(uv.x * 31.0 - uTime * 1.3) + cos(uv.y * 19.0 + uTime * 0.9)) * 0.0022 * m;
    r.z += m;
  }
  return r;
}

vec3 samplePlate(sampler2D t, vec2 uv, vec4 F[4], vec4 S[4], bool flow) {
  float em = edgeMask(uv);
  uv += bobOffset(uv, F, S);
  vec3 cr = causticRegion(uv, F, S);
  uv += cr.xy * uSpeed;
  vec3 col;
  if (!flow || uFlowAmt <= 0.0) col = tex(t, uv);
  else {
    vec2 v = flowField(uv, F, S) * uFlowAmt * uSpeed;
    float per = 1.4 / sqrt(uSpeed);
    float ph = uTime / per + smoothNoise(uv * 3.0) * 0.6;
    float p0 = fract(ph), p1 = fract(ph + 0.5);
    vec3 c0 = tex(t, uv - v * (p0 - 0.5) * per);
    vec3 c1 = tex(t, uv - v * (p1 - 0.5) * per);
    col = mix(c0, c1, abs(1.0 - 2.0 * p0));
  }
  if (cr.z > 0.001) {
    // light lines brighten what is already lit (amber), barely touch the dark
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float c = caustic(uv * vec2(uImgAspect, 1.0) * 0.7, uTime * 0.45 * (0.7 + 0.3 * uSpeed));
    col += vec3(1.0, 0.62, 0.24) * c * cr.z * (0.18 + 0.9 * lum);
  }
  return col * em;
}

void main() {
  vec2 s0 = vec2(vUv.x, 1.0 - vUv.y);
  // liquid refraction while one image hands over to the next
  vec2 s = s0 + vec2(sin(s0.y * 13.0 + uTime * 2.1) + 0.5 * sin(s0.x * 21.0 - uTime * 1.3),
                     cos(s0.x * 11.0 - uTime * 1.7) + 0.5 * cos(s0.y * 17.0 + uTime * 2.4)) * uWarp * 0.011;
  vec3 col;

  // the next plate grows out of the current one: feathered edges while it is smaller than the screen
  float mixB = 0.0, waterLine = 0.0;
  vec2 ub0 = viewUV(s, uCamB, uFocB, 1.0);
  if (uWipe >= 0.0) {
    // plunge: the water surface sweeps up the screen; below it we are under water (plate B)
    float wy = uWipe + 0.028 * sin(s0.x * 8.0 + uTime * 2.2) + 0.012 * sin(s0.x * 21.0 - uTime * 3.1);
    mixB = smoothstep(wy - 0.012, wy + 0.025, s.y);
    waterLine = exp(-abs(s.y - wy) * 70.0);
    s += vec2(0.0, 0.03) * waterLine;            // refraction kink along the surface
    ub0 = viewUV(s, uCamB, uFocB, 1.0);
  } else if (uMix > 0.001) {
    vec2 f = smoothstep(vec2(0.0), vec2(0.14), ub0) * smoothstep(vec2(1.0), vec2(0.86), ub0);
    mixB = uMix * mix(f.x * f.y, 1.0, uMix * uMix);
  }

  if (uBlur > 0.002) {
    vec3 a = vec3(0.0), b = vec3(0.0);
    float jit = hash(s0 * uRes);              // per-pixel jitter hides sample steps
    for (int i = 0; i < 8; i++) {
      float zm = 1.0 + uBlur * (float(i) + jit) / 8.0;
      vec2 ua = viewUV(s, uCamA, uFocA, zm);
      a += tex(uTexA, ua) * edgeMask(ua);
      if (mixB > 0.001) { vec2 ub = viewUV(s, uCamB, uFocB, zm); b += tex(uTexB, ub) * edgeMask(ub); }
    }
    col = mix(a, b, mixB) / 8.0;
  } else {
    vec3 a = samplePlate(uTexA, viewUV(s, uCamA, uFocA, 1.0), uFlA, uFsA, true);
    if (mixB > 0.001) col = mix(a, samplePlate(uTexB, ub0, uFlB, uFsB, true), mixB);
    else col = a;
  }

  col += vec3(1.0, 0.78, 0.45) * waterLine * 0.55;   // glowing meniscus

  // giant outline word, only visible over dark background (so cup, steam, beans sit in front of it)
  if (uWordAlpha > 0.001) {
    float aspect = uRes.x / uRes.y;
    vec2 w = vec2((s.x - 0.5) / (0.94 * uWordScale) + 0.5,
                  (s.y - uWordY) / aspect * uWordAspect / (0.94 * uWordScale) + 0.5);
    if (w.x > 0.0 && w.x < 1.0 && w.y > 0.0 && w.y < 1.0) {
      float wa = texture2D(uWord, vec2(w.x, 1.0 - w.y)).a;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float behind = 1.0 - smoothstep(0.06, 0.2, lum);
      col = mix(col, vec3(0.957, 0.929, 0.878), wa * uWordAlpha * behind * 0.6);
    }
  }

  // grade: a touch of contrast and warmth, vignette
  col = pow(max(col, 0.0), vec3(1.04, 1.06, 1.1));
  float vig = smoothstep(0.98, 0.32, length((s - 0.5) * vec2(1.0, 0.9)));
  col *= mix(0.68, 1.0, vig);

  // reveal mask (ring burst)
  if (uReveal.z < 1e5) {
    float d = length(s0 * uRes - uReveal.xy);
    col *= 1.0 - smoothstep(uReveal.z - uRevealSoft, uReveal.z, d);
  }

  col *= uFade;
  col += (hash(s * uRes + fract(uTime) * 91.0) - 0.5) * uGrain;

  // portal: a hole opens in the liquid, its rim glows like molten gold
  float alpha = 1.0;
  if (uHole.z >= 0.0) {
    vec2 hp = s0 * uRes - uHole.xy;
    float ang = atan(hp.y, hp.x);
    float r = uHole.z * (1.0 + 0.035 * sin(ang * 5.0 + uTime * 1.8) + 0.02 * sin(ang * 11.0 - uTime * 2.6));
    float dd = length(hp) - r;
    alpha = smoothstep(-1.5, 2.5, dd);
    float rim = exp(-abs(dd) / (6.0 + 0.012 * uHole.z));
    col += vec3(1.0, 0.66, 0.26) * rim * 1.1 * smoothstep(0.0, 30.0, uHole.z);
    alpha = max(alpha, rim * 0.9);
  }
  gl_FragColor = vec4(col, alpha);
}
`;
