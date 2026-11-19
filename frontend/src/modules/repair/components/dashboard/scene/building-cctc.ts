import * as THREE from "three";
import { bg, canvasTex, merged, mesh, rng, worldUV, type Textures } from "./kit";
import type { BuildingModel, BuildingSize, FloorEntry } from "./model";
import { acUnit, apron, pane } from "./lowrise";
import { finishFloor, floorMats, newParts, type Parts } from "./parts";

// อาคาร CCTC (CR-031; reshaped 2026-11-17 from the owner's photo and `10-อาคาร CCTC.pdf` p.1–3): two storeys under
// one big mono-pitch "hat". Its top rises from the back (row A) to a knife-edge eave 4.8 m out over the front
// (row D, the plan's roof line); the dark soffit slopes from that eave back down to the wall top; the end faces
// lean out and are clad in light grey panels, with a railing round the top. Entrance end = grid 1 (−x): wide
// steps, the half-round fabric canopy, the CPAC sign on the dark upper wall, and the red perforated screen at the
// row-A corner, widening upwards. A glass curtain wall at the front corner; light grey ground floor, dark grey
// upper floor. 48 × 17.7 m on 6 m bays (rows 5.7 + 6.3 + 5.7). Origin = footprint centre, Y up, metres, front = +z.

const FH = 4.2;
/** Roof overhangs (plan roof line), heights above the wall top and the eave edge thickness. */
const HAT = { back: 1.6, front: 4.8, endL: 2.2, endR: 1.6, low: 1.2, high: 5.5, tip: 0.25 };
// The hat's panels share the ground-floor colour, its top the upper-floor colour, rails and steps the floors' light
// metal (0xd2d5d3, parts.ts): the site's light version (simplifyForSite) merges same-looking materials into one draw call.
const COL = { lower: 0xdcdedf, upper: 0x676c72, frame: 0x2f3439, light: 0xd2d5d3, soffit: 0x4a5056 };
/** Entrance (−x end) along z: doors, canopy and sign centred here; the screen reaches zb at the ground, zt at the roof. */
const ENTRY = { z: 3.6, doors: 4, canopyR: 3.3, canopyOut: 4, canopyY: 3.9 };

let own: { screen: THREE.Texture; logo: THREE.Texture } | null = null;

/** The red perforated screen and the CPAC sign, drawn once (kept for the next build, like the kit textures). */
function ownTextures() {
  if (own) return own;
  const screen = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#a8302b";
    g.fillRect(0, 0, w, h);
    const r = rng(41);
    g.fillStyle = "#3b1513";
    for (let y = 10; y < h; y += 26) for (let x = (y / 26) % 2 ? 22 : 9; x < w; x += 26) {
      const rad = 3 + r() * 9;
      g.beginPath();
      g.arc(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, rad, 0, Math.PI * 2);
      g.fill();
    }
  });
  const logo = canvasTex(128, 128, (g, w, h) => {
    const font = getComputedStyle(document.body).fontFamily || "sans-serif";
    g.fillStyle = "#2a9fd8";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 5;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 34px ${font}`;
    g.fillText("CPAC", w / 2, h / 2 + 2);
  });
  logo.wrapS = logo.wrapT = THREE.ClampToEdgeWrapping;
  own = { screen, logo };
  return own;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A flat convex polygon (fan) facing `out`, with position / normal / uv (world-scaled). */
function face(pts: THREE.Vector3[], out: THREE.Vector3, uvScale = 0.25) {
  const n = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0]));
  const p = n.dot(out) < 0 ? [...pts].reverse() : pts;
  const pos: number[] = [];
  for (let i = 1; i < p.length - 1; i++) for (const q of [p[0], p[i], p[i + 1]]) pos.push(q.x, q.y, q.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return worldUV(g, uvScale);
}

/** A thin box from a to b (rails). */
function rod(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)).setPosition(a.clone().add(b).multiplyScalar(0.5));
  return new THREE.BoxGeometry(t, t, a.distanceTo(b)).applyMatrix4(m);
}

/**
 * The hat over a W × D footprint, bottom at the wall top y0. Cross-section back → front (z, height above y0):
 * back eave, its top, the front eave top, the eave's lower edge, the soffit's foot at the front wall. Each end leans
 * out with height (−x end endL, +x end endR at the top of the eave).
 */
function hat(W: number, D: number, y0: number, tex: Textures) {
  const sec: [number, number][] = [[-D / 2 - HAT.back, 0], [-D / 2 - HAT.back, HAT.low], [D / 2 + HAT.front, HAT.high], [D / 2 + HAT.front, HAT.high - HAT.tip], [D / 2, 0]];
  const at = (side: -1 | 1, [z, h]: [number, number]) => v3(side * (W / 2 + ((side < 0 ? HAT.endL : HAT.endR) * h) / HAT.high), y0 + h, z);
  const L = sec.map((s) => at(-1, s)), R = sec.map((s) => at(1, s));
  const quad = (i: number, out: THREE.Vector3) => face([L[i], R[i], R[(i + 1) % 5], L[(i + 1) % 5]], out);
  const panels = [face(L, v3(-1, 0, 0), 0.42), face(R, v3(1, 0, 0), 0.42), quad(0, v3(0, 0, -1)), quad(2, v3(0, 0, 1))];
  const top = quad(1, v3(0, 1, 0)), soffit = [quad(3, v3(0, -1, 0.6)), quad(4, v3(0, -1, 0))];

  // railing: posts and a top rail along the four top edges (back eave, front eave, both sloped ends)
  const rails: THREE.BufferGeometry[] = [], up = v3(0, 1.05, 0);
  for (const [a, b] of [[L[1], R[1]], [L[2], R[2]], [L[1], L[2]], [R[1], R[2]]]) {
    rails.push(rod(a.clone().add(up), b.clone().add(up), 0.07));
    const n = Math.max(1, Math.round(a.distanceTo(b) / 3));
    for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); rails.push(bg(0.06, 1.05, 0.06, p.x, p.y, p.z)); }
  }

  const g = new THREE.Group();
  g.add(merged(panels, new THREE.MeshStandardMaterial({ map: tex.concrete, color: COL.lower, metalness: 0.3, roughness: 0.5, envMapIntensity: 0.8 })));
  g.add(merged([top], new THREE.MeshStandardMaterial({ map: tex.concrete, color: COL.upper, metalness: 0.4, roughness: 0.55, envMapIntensity: 0.6 })));
  // the soffit faces away from the sun: a little self-light keeps it charcoal (photo) instead of black
  g.add(merged(soffit, new THREE.MeshStandardMaterial({ map: tex.concrete, color: COL.soffit, emissive: COL.soffit, emissiveIntensity: 0.55, roughness: 0.7, envMapIntensity: 1 })));
  g.add(merged(rails, new THREE.MeshStandardMaterial({ color: COL.light, metalness: 0.6, roughness: 0.4 }), false));
  return g;
}

/** The part of the red screen between heights a and b (it widens from zb at the ground to zt at the wall top). */
function screenPart(W: number, D: number, a: number, b: number, top: number) {
  const zb = -D / 2 + 5.6, zt = -D / 2 + 10.6, z = (h: number) => zb + ((zt - zb) * h) / top, z0 = -D / 2 - 0.25;
  const sh = new THREE.Shape([new THREE.Vector2(z0, a), new THREE.Vector2(z(a), a), new THREE.Vector2(z(b), b), new THREE.Vector2(z0, b)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(-W / 2 - 0.35, 0, 0);
  return worldUV(g, 0.2);
}

/** Windows with mullions on the front or back face, from x a to b. */
function band(W: number, D: number, face: "front" | "back", a: number, b: number, y: number, h: number, step: number, p: Parts) {
  pane(W, D, face, a, b, y, h, p.G);
  const z = face === "front" ? D / 2 + 0.05 : -D / 2 - 0.05;
  for (let x = a; x <= b + 1e-3; x += step) p.T.push(bg(0.07, h, 0.1, x, y, z));
  p.T.push(bg(b - a, 0.07, 0.1, (a + b) / 2, y - 0.07, z));
}

function build(tex: Textures, size: BuildingSize, surroundings = true) {
  const { width: W, depth: D, floors: NF } = size;
  const root = new THREE.Group();
  if (surroundings) {
    const t = D / 2 + HAT.front + 3;
    root.add(apron(tex, W, D, [[-14, t, 1], [-4, t, 1.05], [6, t, 0.95], [16, t, 1], [W / 2 + 7, -5, 1], [-W / 2 - 9, -D / 2 - 2, 0.9]]));
  }
  const T = ownTextures();
  const screenMat = new THREE.MeshStandardMaterial({ map: T.screen, roughness: 0.75, envMapIntensity: 0.5 });
  const stepMat = new THREE.MeshStandardMaterial({ color: COL.light, roughness: 0.9, envMapIntensity: 0.4 });
  const top = NF * FH, cw = [-W / 2 + 2.4, -W / 2 + 12.4] as const, run = [-W / 2 + 13.6, W / 2 - 1.4] as const;
  const floors: FloorEntry[] = [];

  for (let f = 1; f <= NF; f++) {
    const M = floorMats(tex, f === 1 ? COL.lower : COL.upper, COL.frame), g = new THREE.Group(), p = newParts(), y0 = (f - 1) * FH;
    p.C.push(bg(W + 0.3, 0.3, D + 0.3, 0, y0, 0), bg(W, FH - 0.3, D, 0, y0 + 0.3, 0));

    // glass curtain wall at the front corner of the entrance end (full height, mullion grid)
    const gy = y0 + (f === 1 ? 0.35 : 0.1), gh = y0 + FH - 0.1 - gy;
    pane(W, D, "front", cw[0], cw[1], gy, gh, p.G, 0.04);
    for (let x = cw[0]; x <= cw[1] + 1e-3; x += 2) p.T.push(bg(0.08, gh, 0.12, x, gy, D / 2 + 0.07));
    for (const k of [0, 0.5, 1]) p.T.push(bg(cw[1] - cw[0], 0.08, 0.12, (cw[0] + cw[1]) / 2, gy + k * (gh - 0.08), D / 2 + 0.07));
    // light grey corner pilaster beside it (both faces)
    p.L.push(bg(2.4, FH - 0.3, 0.25, -W / 2 + 1.2, y0 + 0.3, D / 2 + 0.12), bg(0.25, FH - 0.3, 2, -W / 2 - 0.12, y0 + 0.3, D / 2 - 1));

    // window bands: front run, the whole back, the +x end
    band(W, D, "front", run[0], run[1], y0 + 1.1, 1.5, 2.4, p);
    band(W, D, "back", -W / 2 + 1.2, W / 2 - 1.2, y0 + 1.1, 1.5, 3, p);
    pane(W, D, "right", -D / 2 + 1.2, D / 2 - 1.2, y0 + 1.1, 1.5, p.G);

    const extra = new THREE.Group();
    if (f === 1) {
      // entrance: glass doors under the canopy, steps across the end, the half-round canopy with two tie rods
      pane(W, D, "left", ENTRY.z - ENTRY.doors / 2, ENTRY.z + ENTRY.doors / 2, 0.45, 2.9, p.G, 0.04);
      for (const z of [-2, -1, 0, 1, 2]) p.T.push(bg(0.12, 2.9, 0.08, -W / 2 - 0.07, 0.45, ENTRY.z + z));
      p.T.push(bg(0.12, 0.1, ENTRY.doors, -W / 2 - 0.07, 3.35, ENTRY.z));
      const s0 = -2.6, s1 = D / 2 + 1;
      const steps = [4.6, 3.8, 3].map((d, i) => bg(d, 0.15, s1 - s0 - i * 0.8, -W / 2 - d / 2, i * 0.15, (s0 + s1) / 2));
      extra.add(merged(steps, stepMat));
      const r = ENTRY.canopyR;
      p.L.push(new THREE.CylinderGeometry(r, r, 0.2, 24, 1, false, Math.PI, Math.PI).scale(ENTRY.canopyOut / r, 1, 1).translate(-W / 2, ENTRY.canopyY, ENTRY.z));
      for (const s of [-1, 1]) p.T.push(rod(v3(-W / 2 - 2.7, ENTRY.canopyY + 0.1, ENTRY.z + s * 1.9), v3(-W / 2, ENTRY.canopyY + 2.4, ENTRY.z + s * 1), 0.06));
      // condensers along the front ground floor
      for (let x = run[0] + 1; x < run[1] - 1; x += 4.8) acUnit(x, 0.3, D / 2 + 0.2, p.L);
    }
    if (f === 2) {
      // CPAC sign on the dark upper wall above the canopy, a dark ledge below it
      const logo = new THREE.PlaneGeometry(1.7, 1.7).rotateY(-Math.PI / 2).translate(-W / 2 - 0.06, y0 + 2.1, ENTRY.z);
      extra.add(mesh(logo, new THREE.MeshStandardMaterial({ map: T.logo, roughness: 0.4, envMapIntensity: 0.6 }), false));
      p.T.push(bg(0.6, 0.45, 4.4, -W / 2 - 0.3, y0 + 0.65, ENTRY.z));
    }
    if (f <= 2) extra.add(merged([screenPart(W, D, y0, Math.min(y0 + FH, top), top)], screenMat));
    g.add(extra);

    const e = finishFloor({ width: W, depth: D, floorHeight: FH, overhang: model.overhang }, f, y0, g, M, p);
    floors.push(e);
    root.add(e.group);
  }

  const roof = new THREE.Group();
  roof.add(hat(W, D, top, tex));
  root.add(roof);
  return { root, floors, roof };
}

/** CR-031 registry entry `b10`. */
export const model: BuildingModel = {
  floorHeight: FH,
  overhang: 2,
  plan: { bay: 6, rows: [5.7, 6.3, 5.7], core: () => [{ label: "บันได", x: 12.2, z: 12.2, w: 2.6, d: 5.2, kind: "stairs" }], entrance: null, reception: null, plants: [] },
  build: (tex, size, opts) => build(tex, size, opts?.surroundings ?? true),
};
