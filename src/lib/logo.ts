/** Alpona spiral mark (SPEC.md section 3). */
export function logoSVG(size = 120, color = "#D4A24C") {
  const turns = 3.2, rMax = 64, rMin = 5, steps = 260;
  const k = (rMax - rMin) / (turns * 2 * Math.PI);
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI, r = rMin + k * t;
    d += (i ? "L" : "M") + (r * Math.cos(t)).toFixed(1) + "," + (r * Math.sin(t)).toFixed(1);
  }
  let petals = "";
  for (let i = 0; i < 16; i++) {
    petals += `<ellipse cx="0" cy="-86" rx="4.2" ry="9" transform="rotate(${i * 22.5})" fill="${color}"/>`;
    petals += `<circle cx="0" cy="-76" r="2.2" transform="rotate(${(i + 0.5) * 22.5})" fill="${color}" opacity=".7"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="-100 -100 200 200" aria-hidden="true">${petals}<path d="${d}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/><circle r="6.5" fill="${color}"/></svg>`;
}
