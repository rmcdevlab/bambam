import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "./kit";

// S29 site view ground (CR-033, re-traced from CR-032): per side the paved site, roads with kerbs (the main
// road with a dashed centre line), parking stall rows with parked cars, landscape, trees and the small
// structures that are not site blocks (store, food courts, shops). Decorative only: no business data.
// 2026-11-17 map detail (owner: "look more like a real map"), generic street furniture, not surveyed: lane edge
// lines on the main road, zebra crossings where a site road meets it, street lights, the property boundary line.
//
// - ฝั่งสำนักงานใหญ่ from the site plan `attachments/building plan/5-อาคารTrialmix และ ห้องทดสอบหินทราย.pdf` p.4
//   (MAR 2025, A3 1:750), in pixels of that page rendered at 200 dpi and turned north up (2339 × 1653);
//   site metres = 0.1625 · R(−8.13°) · (px − อาคาร 1 at (1144, 499.9)) — the fit of migration 20261101000001.
// - ฝั่ง Riverside from OpenStreetMap (© OpenStreetMap contributors, ODbL — openstreetmap.org/copyright): the
//   CPAC landuse outline, roads, the parking lot and its aisles, already in site metres (fitted on the office
//   blocks 1–3, then shifted so OSM's Warehouse 1 lies on its block — same size and angle). Simplified to 1 m.
//
// Budget (D-130): everything flat is ONE unlit vertex-coloured mesh; cars, trees, street lights and the small
// structures are one mesh each (instanced where repeated) — five draw calls and a few thousand triangles per side,
// no textures, no shadows, nothing animated.

type Pt = readonly [number, number];
type Line = readonly Pt[];
/** A row of stalls along a → b; `side` 1 = right of a → b (seen from above, north up), −1 = left. */
type Row = { a: Pt; b: Pt; side: 1 | -1; deg: number };
type Shed = { at: Pt; w: number; d: number; deg: number; h: number };
type Ground = {
  property: Line;
  green: Line[];
  roads: { line: Line; w: number; main?: boolean }[];
  /** Parking aisles: a stall row on both sides. */
  aisles: Line[];
  lots: Line[];
  rows: Row[];
  trees: Pt[];
  sheds: Shed[];
};

export type SideCrossing = { at: Pt; to: 1 | 2; road: string };

const PLAN = { s: 0.1625, ox: 1144, oy: 499.9, c: Math.cos((-8.13 * Math.PI) / 180), n: Math.sin((-8.13 * Math.PI) / 180) };
/** Plan page px → site metres (office side). */
const plan = ([px, py]: Pt): Pt => {
  const dx = px - PLAN.ox, dy = py - PLAN.oy;
  return [PLAN.s * (PLAN.c * dx - PLAN.n * dy), PLAN.s * (PLAN.n * dx + PLAN.c * dy)];
};
const planLine = (l: Line): Line => l.map(plan);
/** A plan angle (degrees, px space) as a site rotation. */
const planDeg = (deg: number) => deg - 8.13;

const OFFICE: Ground = {
  property: planLine([[540, 595], [577, 500], [1000, 318], [1280, 432], [1382, 215], [1897, 420], [1752, 1055], [1340, 960], [1050, 842]]),
  green: [
    // landscape strips along Phiboonsongkram Road and between อาคาร 1 and the food courts
    planLine([[560, 600], [1050, 842], [1060, 822], [575, 585]]),
    planLine([[1000, 650], [1200, 705], [1205, 690], [1005, 636]]),
  ],
  roads: [
    // Phiboonsongkram Road (to Nonthaburi) curving south at the junction, and the branch along the shops
    { line: planLine([[60, 578], [400, 660], [650, 728], [830, 790], [925, 860], [975, 960], [992, 1100], [985, 1300]]), w: 20, main: true },
    { line: planLine([[930, 865], [1080, 962], [1230, 1088], [1420, 1190], [1560, 1260]]), w: 10 },
  ],
  aisles: [],
  lots: [],
  rows: [
    // the five islands of the main car park (stalls on their south side)
    { a: plan([1405, 382]), b: plan([1655, 435]), side: 1, deg: 60 },
    { a: plan([1365, 452]), b: plan([1580, 512]), side: 1, deg: 60 },
    { a: plan([1330, 540]), b: plan([1560, 603]), side: 1, deg: 60 },
    { a: plan([1282, 622]), b: plan([1540, 685]), side: 1, deg: 60 },
    { a: plan([1262, 715]), b: plan([1530, 770]), side: 1, deg: 60 },
    // double row west of อาคาร 4, the column east of อาคาร 1, the row above the tree strip
    { a: plan([1676, 605]), b: plan([1612, 830]), side: 1, deg: 60 },
    { a: plan([1676, 605]), b: plan([1612, 830]), side: -1, deg: 60 },
    { a: plan([1258, 488]), b: plan([1278, 612]), side: -1, deg: 90 },
    { a: plan([1005, 640]), b: plan([1195, 690]), side: -1, deg: 90 },
    // around อาคาร 2 and along the west fence
    { a: plan([790, 478]), b: plan([905, 530]), side: -1, deg: 60 },
    { a: plan([700, 465]), b: plan([655, 600]), side: 1, deg: 60 },
    { a: plan([925, 540]), b: plan([905, 625]), side: 1, deg: 60 },
    { a: plan([885, 612]), b: plan([860, 725]), side: 1, deg: 60 },
    { a: plan([580, 505]), b: plan([548, 590]), side: -1, deg: 90 },
  ],
  trees: [
    [800, 700], [822, 706], [845, 712], [868, 720], [972, 775], [995, 785], [1018, 795], [1040, 805], [1062, 812],
    [1030, 668], [1060, 676], [1090, 684], [1120, 692], [1150, 700], [1180, 707], [1065, 770], [1095, 778],
  ].map((p) => plan(p as unknown as Pt)),
  sheds: [
    { at: plan([918, 708]), w: 11, d: 5.5, deg: planDeg(107), h: 3.5 }, // guard house 1-SC-F
    { at: plan([1152, 795]), w: 17, d: 5.5, deg: planDeg(12), h: 3.5 }, // PAYTONG COURT
    { at: plan([1150, 830]), w: 17, d: 5.5, deg: planDeg(12), h: 3.5 },
    { at: plan([1292, 855]), w: 14, d: 11, deg: planDeg(12), h: 4 }, // STORE
    { at: plan([1185, 918]), w: 13, d: 7, deg: planDeg(37), h: 3.5 }, // shops outside the fence: food, book (3), Soonchai (4), S.Kitchen (3)
    { at: plan([1257, 958]), w: 13, d: 7, deg: planDeg(37), h: 10.5 },
    { at: plan([1325, 1015]), w: 13, d: 7, deg: planDeg(37), h: 14 },
    { at: plan([1392, 1068]), w: 13, d: 7, deg: planDeg(37), h: 10.5 },
    { at: plan([1797, 548]), w: 16, d: 15, deg: planDeg(12), h: 7 }, // building by the steel tower
  ],
};

const RIVERSIDE: Ground = {
  // 2026-11-17 (owner: "too many road lines"): only ถนนพิบูลสงคราม and the site's own roads. The two carriageways are
  // OSM's ways joined end to end (west → the bend → south); the junction stubs, the neighbourhood streets north and
  // west of the road, and the OSM ways that ran under a block (they predate the CR-031 plan sizes) are left out.
  roads: [
    { line: [[-423.6, -34.2], [-308.4, 4.7], [-274.3, 16], [-83.8, 77.5], [-65.9, 85], [-54, 94.2], [-49, 104.4], [-47.8, 115.3], [-49.4, 129.5], [-53.3, 144.7], [-70.2, 178.3], [-93.3, 229.9], [-98.6, 253], [-99.5, 271], [-94.3, 307.7], [-88.3, 322.7], [-77.5, 341]], w: 9, main: true },
    { line: [[-420.6, -44.6], [-297.7, -4.9], [-263.2, 6.3], [-177.2, 33.6], [-133.4, 48.7], [-56.4, 75], [-42.1, 88.1], [-38, 95.9], [-35.2, 115.6], [-38, 139.6], [-53.4, 178.1], [-73.9, 216.7], [-80.9, 234.5], [-86.3, 259.8], [-86.5, 274.2], [-83.3, 297.5], [-79.3, 309.9], [-68.5, 331.5]], w: 9, main: true },
    // site entrances from the main road (north, east)
    { line: [[-269.7, 154.2], [-266.7, 148.6], [-235.4, 133.8], [-119.1, 66.3]], w: 5 },
    { line: [[-98.6, 253], [-119.1, 249.6]], w: 5 },
    // round the warehouses (ends before Warehouse 3), the link to the centre, the centre loop and the CCTC street
    { line: [[-220.9, 228.9], [-202.2, 180.4], [-269.7, 154.2], [-299.2, 138.9], [-305.4, 138.5], [-309.7, 139.7], [-312.7, 142.6], [-354.2, 212.1], [-361.4, 228.4], [-361.4, 234.3]], w: 5 },
    { line: [[-235.4, 133.8], [-219.4, 165], [-218.2, 174.3]], w: 5 },
    { line: [[-202.2, 180.4], [-175.7, 186.7], [-168.6, 189.5], [-165.9, 193.2], [-163.8, 197.8], [-164.2, 203.5], [-171.9, 221.6], [-176.3, 226.9], [-184.5, 232.9], [-196, 235.8], [-204.7, 235.2], [-220.9, 228.9], [-233.2, 226.8], [-254.3, 230.6], [-260, 233.1], [-263.6, 236.8], [-277.2, 264.1]], w: 5 },
    { line: [[-218.2, 174.3], [-240.8, 227.6]], w: 5 },
    // south perimeter, the road south of Warehouse 3, the east car park road and its link to the centre loop
    { line: [[-119.1, 249.6], [-121.1, 259.6], [-131.2, 276.1], [-174.9, 309.7], [-204.4, 325.3], [-210.2, 326], [-219.1, 323.2], [-255.1, 301.2], [-298.2, 278.9]], w: 5 },
    { line: [[-298.2, 278.9], [-303.3, 284.8], [-308.8, 289], [-318.7, 293.3], [-339, 296.2], [-354.6, 292.8], [-382.8, 282.8]], w: 5 },
    { line: [[-142.8, 149.6], [-118.7, 136.6], [-103.6, 133.3], [-91.9, 134.7], [-81.2, 138.5], [-77.2, 142.6], [-77.1, 147.1], [-113.3, 225.3], [-119.1, 249.6]], w: 5 },
    { line: [[-119.1, 249.6], [-171.9, 221.6]], w: 5 },
  ],
  // parking lot by the main road and its aisles
  // + the OSM way between the CCTC street and the loop as a parking aisle (decorative; the two OSM aisles east of the main road dropped)
  aisles: [[[-123.9, 190.9], [-136.5, 223.2], [-132.7, 226.8], [-126.5, 228.9], [-123.4, 226.7], [-111.6, 195.7]], [[-103.6, 133.3], [-123.9, 190.9], [-102.4, 199.4]], [[-184.6, 185.1], [-204.7, 235.2]]],
  lots: [[[-142.2, 230.3], [-98.1, 128.8], [-70.6, 140.6], [-114.7, 242.1]]],
  // CPAC landuse outline
  property: [[-367.4, 305.9], [-377.9, 307.1], [-381.1, 312], [-376.5, 314.3], [-385.4, 341.1], [-399.5, 336.3], [-390.2, 309.3], [-385.4, 311.1], [-383.4, 306.2], [-385.7, 305], [-384.4, 302.8], [-403.4, 293.8], [-310, 136.6], [-296.9, 123], [-171.7, 59.1], [-112.1, 76.6], [-127.6, 80.1], [-222.2, 132.3], [-205.6, 169.7], [-149.1, 151.2], [-103.8, 124.8], [-80.3, 114.2], [-93.5, 85.6], [-72, 92], [-63.6, 95.7], [-57.8, 102.9], [-53.8, 111.1], [-53.9, 120.5], [-56.7, 133.5], [-61.6, 145.4], [-104.3, 232.1], [-108.5, 259.7], [-106.6, 297.3], [-102.4, 307.4], [-171.2, 372.6], [-215.9, 368.7], [-236.3, 363.4], [-238.5, 368.9], [-257.8, 362.6], [-255.1, 356.3], [-266.5, 350.1], [-283.3, 337.3], [-307, 326.1]],
  // the landscape around Riverside 1–3 / อเนกประสงค์ (a hole in the OSM outline)
  green: [[[-112.1, 76.6], [-127.6, 80.1], [-222.2, 132.3], [-205.6, 169.7], [-149.1, 151.2], [-103.8, 124.8], [-80.3, 114.2], [-93.5, 85.6]]],
  // cars along the street east of the CCTC (decorative)
  rows: [{ a: [-216.8, 181.4], b: [-234.8, 223.7], side: -1, deg: 90 }],
  trees: [],
  sheds: [],
};

const GROUNDS: Record<1 | 2, Ground> = { 1: OFFICE, 2: RIVERSIDE };

/** The in-map button of each side (CR-033): a point on Phiboonsongkram Road at the side's edge. */
export const SIDE_CROSSING: Record<1 | 2, SideCrossing> = {
  1: { at: plan([760, 770]), to: 2, road: "ถนนพิบูลสงคราม" },
  2: { at: [-160, 46], to: 1, road: "ถนนพิบูลสงคราม" },
};

const C = { pave: 0xb4b8ba, green: 0xc4d4ad, kerb: 0xd2d3cd, road: 0x7e848a, line: 0xf4f3ee, lot: 0x9da2a6, fence: 0x7d8388 };
// heights keep the flat layers apart without z-fighting from far away
const Y = { pave: 0.03, green: 0.06, fence: 0.07, kerb: 0.08, road: 0.12, lot: 0.1, line: 0.18 };
const STALL = { w: 2.5, d: 5 };
/** Street lights: spacing along main / site roads and the gap from the road edge (m). */
const LIGHT = { main: 36, site: 42, gap: 1.6 };

const v3 = ([x, z]: Pt) => new THREE.Vector3(x, 0, z);

/** A road's smoothed centre line, sampled about every 4 m, with the unit tangent at each sample. */
type Track = { curve: THREE.CatmullRomCurve3; len: number; p: THREE.Vector3[]; t: THREE.Vector3[]; w: number };

function track(pts: THREE.Vector3[], w: number): Track {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const len = curve.getLength(), n = Math.max(2, Math.ceil(len / 4)), p = curve.getSpacedPoints(n);
  const t = p.map((_, i) => p[Math.min(i + 1, n)].clone().sub(p[Math.max(i - 1, 0)]).normalize());
  return { curve, len, p, t, w };
}

/** A flat strip of width w along a track, `off` metres to one side of its centre line, at height y. */
function strip(k: Track, w: number, y: number, off = 0) {
  const pos: number[] = [], idx: number[] = [], n = k.p.length - 1;
  for (let i = 0; i <= n; i++) {
    const { x, z } = k.p[i], nx = -k.t[i].z, nz = k.t[i].x;
    pos.push(x + nx * (off + w / 2), y, z + nz * (off + w / 2), x + nx * (off - w / 2), y, z + nz * (off - w / 2));
    if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const quad = (w: number, d: number, x: number, z: number, y: number, rot = 0) =>
  new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(rot).translate(x, y, z);

/** A flat polygon (site metres) at height y. */
const area = (pts: Line, y: number) =>
  new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2).translate(0, y, 0);

function paint(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  return g.index ? g.toNonIndexed() : g;
}

type Spot = { p: THREE.Vector3; rot: number };

/** One stall row: a line per stall edge at `deg` to the row, the row's base line; returns the stall centres. */
function stallRow(a: THREE.Vector3, b: THREE.Vector3, side: 1 | -1, deg: number, lines: THREE.BufferGeometry[]) {
  const len = a.distanceTo(b), t = b.clone().sub(a).normalize();
  const nrm = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(side); // right of a → b with z pointing south
  const al = (deg * Math.PI) / 180, s = t.clone().multiplyScalar(Math.cos(al)).addScaledVector(nrm, Math.sin(al));
  const pitch = STALL.w / Math.sin(al), n = Math.floor((len - 1) / pitch), off = (len - n * pitch) / 2;
  const sRot = Math.atan2(s.x, s.z), spots: Spot[] = [];
  for (let i = 0; i <= n; i++) {
    const p = a.clone().addScaledVector(t, off + i * pitch).addScaledVector(s, STALL.d / 2);
    lines.push(quad(0.15, STALL.d, p.x, p.z, Y.line, sRot));
    if (i < n) spots.push({ p: p.clone().addScaledVector(t, pitch / 2), rot: Math.atan2(-s.z, s.x) });
  }
  const m = a.clone().add(b).multiplyScalar(0.5);
  lines.push(quad(0.15, len, m.x, m.z, Y.line, Math.atan2(t.x, t.z)));
  return spots;
}

/** Distance from p to a track's sampled centre line (x / z only). */
function distTo(k: Track, p: THREE.Vector3) {
  let d = Infinity;
  for (let i = 1; i < k.p.length; i++) {
    const a = k.p[i - 1], b = k.p[i], abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
    const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2)) : 0;
    d = Math.min(d, Math.hypot(p.x - a.x - u * abx, p.z - a.z - u * abz));
  }
  return d;
}

/** Zebra crossings across a site road, just in from each end that meets a main road. */
function zebras(k: Track, mains: Track[], out: THREE.BufferGeometry[]) {
  for (const end of [0, 1] as const) {
    const tip = k.p[end ? k.p.length - 1 : 0], main = mains.find((m) => distTo(m, tip) < m.w / 2 + 3);
    if (!main) continue;
    const at = main.w / 2 + 4;
    if (k.len < at + 4) continue;
    const u = (end ? k.len - at : at) / k.len, p = k.curve.getPointAt(u), t = k.curve.getTangentAt(u);
    const rot = Math.atan2(t.x, t.z), nx = -t.z, nz = t.x;
    for (let o = -k.w / 2 + 0.6; o <= k.w / 2 - 0.5; o += 1) out.push(quad(0.5, 2.6, p.x + nx * o, p.z + nz * o, Y.line, rot));
  }
}

/** Builds the ground of one side; `blocks` (oriented footprints) keep cars, trees and structures off the buildings. */
export function buildGround(side: 1 | 2, blocks: { x: number; z: number; rotDeg: number; width: number; depth: number }[]) {
  const G = GROUNDS[side];
  const free = (p: THREE.Vector3, pad: number) => blocks.every((b) => {
    const r = (b.rotDeg * Math.PI) / 180, dx = p.x - b.x, dz = p.z - b.z;
    const u = dx * Math.cos(r) + dz * Math.sin(r), v = -dx * Math.sin(r) + dz * Math.cos(r);
    return Math.abs(u) > b.width / 2 + pad || Math.abs(v) > b.depth / 2 + pad;
  });
  const flat: THREE.BufferGeometry[] = [paint(area(G.property, Y.pave), C.pave)];
  for (const g of G.green) flat.push(paint(area(g, Y.green), C.green));
  for (const l of G.lots) flat.push(paint(area(l, Y.lot), C.lot));
  // the property boundary: a planted verge along it and a thin line on top (roads crossing it draw over both)
  const ring = [...G.property, G.property[0]].map(v3);
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], m = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b), rot = Math.atan2(b.x - a.x, b.z - a.z);
    flat.push(paint(quad(7, len, m.x, m.z, Y.green, rot), C.green), paint(quad(0.35, len, m.x, m.z, Y.fence, rot), C.fence));
  }

  const tracks = G.roads.map((r) => ({ main: !!r.main, k: track(r.line.map(v3), r.w) }));
  const mains = tracks.filter((x) => x.main).map((x) => x.k);
  const marks: THREE.BufferGeometry[] = [];
  for (const { main, k } of tracks) {
    flat.push(paint(strip(k, k.w + 2.5, Y.kerb), C.kerb), paint(strip(k, k.w, Y.road), C.road));
    if (!main) {
      zebras(k, mains, marks);
      continue;
    }
    for (let s = 3; s < k.len - 3; s += 8) { // dashed centre line
      const p = k.curve.getPointAt(s / k.len), t = k.curve.getTangentAt(s / k.len);
      marks.push(quad(0.18, 3, p.x, p.z, Y.line, Math.atan2(t.x, t.z)));
    }
    for (const o of [-1, 1]) marks.push(strip(k, 0.15, Y.line, o * (k.w / 2 - 0.5))); // solid edge lines
  }

  const lines: THREE.BufferGeometry[] = [];
  const spots: Spot[] = [];
  for (const r of G.rows) spots.push(...stallRow(v3(r.a), v3(r.b), r.side, r.deg, lines));
  for (const aisle of G.aisles) for (let i = 1; i < aisle.length; i++) {
    const a = v3(aisle[i - 1]), b = v3(aisle[i]);
    if (a.distanceTo(b) < 8) continue;
    // stalls start beside the 6 m aisle
    const t = b.clone().sub(a).normalize(), off = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(3);
    spots.push(...stallRow(a.clone().sub(off), b.clone().sub(off), -1, 90, lines), ...stallRow(a.clone().add(off), b.clone().add(off), 1, 90, lines));
  }
  for (const g of [...lines, ...marks]) flat.push(paint(g, C.line));

  const group = new THREE.Group();
  const g = mergeGeometries(flat);
  for (const f of flat) f.dispose();
  // all flat: unlit (cheapest, and no dark faces whatever the winding), still fogged like the rest
  group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  const rnd = rng(side * 7);
  const parked = spots.filter((s) => free(s.p, 1) && rnd() < 0.55);
  if (parked.length) group.add(cars(parked, rnd));
  const offRoad = (p: THREE.Vector3, pad: number) => tracks.every(({ k }) => distTo(k, p) > k.w / 2 + pad);
  const trees = [...G.trees.map(v3), ...edgeTrees(G, rnd)].filter((p) => free(p, 3) && offRoad(p, 2));
  if (trees.length) group.add(treeMesh(trees, rnd));
  // a divided main road keeps its lights on the outer edges (none in the median)
  const median = (l: Pole) => tracks.some(({ main, k }) => main && k !== l.k && distTo(k, l.p) < 12);
  const poles = lights(tracks).filter((l) => free(l.p, 1.5) && offRoad(l.p, 0.8) && !(l.main && median(l)));
  if (poles.length) group.add(lightMesh(poles));
  const sheds = G.sheds.filter((s) => free(v3(s.at), 0));
  if (sheds.length) group.add(shedMesh(sheds));
  return group;
}

/** A street light: where, its turn (arm towards the road), and the road it lights. */
type Pole = { p: THREE.Vector3; rot: number; k: Track; main: boolean };

/** Street lights beside the road: both sides of a main road, one side of a site road; the arm reaches over the road. */
function lights(list: { k: Track; main: boolean }[]) {
  const out: Pole[] = [];
  for (const { k, main } of list) {
    const step = main ? LIGHT.main : LIGHT.site, off = k.w / 2 + LIGHT.gap;
    for (let s = step / 2; s < k.len - 4; s += step) {
      const p = k.curve.getPointAt(s / k.len), t = k.curve.getTangentAt(s / k.len);
      for (const o of main ? [-1, 1] : [1]) {
        const nx = -t.z * o, nz = t.x * o; // away from the road; the arm points back along −n
        out.push({ p: new THREE.Vector3(p.x + nx * off, 0, p.z + nz * off), rot: Math.atan2(nz, -nx), k, main });
      }
    }
  }
  return out;
}

/** A pole with one arm and lamp head (local +x = arm), instanced; 22 triangles each. */
function lightMesh(poles: Pole[]) {
  const pole = paint(new THREE.CylinderGeometry(0.09, 0.13, 7, 5, 1, true).translate(0, 3.5, 0), 0x6f757b);
  const arm = paint(new THREE.BoxGeometry(1.5, 0.14, 0.24).translate(0.65, 6.95, 0), 0x8a9096);
  const geo = mergeGeometries([pole, arm]);
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), poles.length);
  const o = new THREE.Object3D();
  poles.forEach(({ p, rot }, i) => {
    o.position.copy(p);
    o.rotation.set(0, rot, 0);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  return mesh;
}

/** Trees along the site boundary and on the landscape areas (Riverside, which the OSM data does not list). */
function edgeTrees(G: Ground, rnd: () => number) {
  if (G.trees.length) return [];
  const out: THREE.Vector3[] = [];
  const ring = [...G.property, G.property[0]].map(v3);
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], len = a.distanceTo(b), n = Math.floor(len / 14);
    for (let k = 0; k < n; k++) out.push(a.clone().lerp(b, (k + 0.5) / n));
  }
  for (const g of G.green) {
    const box = new THREE.Box2().setFromPoints(g.map(([x, z]) => new THREE.Vector2(x, z)));
    for (let x = box.min.x + 6; x < box.max.x; x += 16) for (let z = box.min.y + 6; z < box.max.y; z += 16) {
      const p = new THREE.Vector2(x + (rnd() - 0.5) * 8, z + (rnd() - 0.5) * 8);
      if (inside(p, g)) out.push(new THREE.Vector3(p.x, 0, p.y));
    }
  }
  return out;
}

function inside(p: THREE.Vector2, poly: Line) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p.y) !== (zj > p.y) && p.x < ((xj - xi) * (p.y - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Parked cars: a body and a darker cabin, one instanced mesh with a colour per car. */
function cars(spots: Spot[], rnd: () => number) {
  const body = paint(new THREE.BoxGeometry(4.3, 0.75, 1.8).translate(0, 0.55, 0), 0xffffff);
  const cabin = paint(new THREE.BoxGeometry(2.3, 0.6, 1.6).translate(-0.2, 1.2, 0), 0x55595e);
  const geo = mergeGeometries([body, cabin]);
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
  const palette = [0xf2f2f0, 0xf2f2f0, 0xb8bcc0, 0x2d3136, 0x7a1f24, 0x2f4f7a, 0x9a9da0];
  const o = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach(({ p, rot }, i) => {
    o.position.copy(p).setY(Y.lot);
    o.rotation.set(0, rot, 0);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, col.setHex(palette[Math.floor(rnd() * palette.length)]));
  });
  return mesh;
}

/** Low-poly trees: a trunk and a 20-face crown, one instanced mesh. */
function treeMesh(points: THREE.Vector3[], rnd: () => number) {
  const trunk = paint(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 5, 1, true).translate(0, 1.3, 0), 0x6b5843);
  const crown = paint(new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4, 0), 0x6f9150);
  const geo = mergeGeometries([trunk, crown]);
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), points.length);
  const o = new THREE.Object3D();
  points.forEach((p, i) => {
    o.position.copy(p);
    o.rotation.set(0, rnd() * Math.PI, 0);
    o.scale.setScalar(0.8 + rnd() * 0.5);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  return mesh;
}

/** Small structures that are not site blocks: plain boxes with a roof slab, merged. */
function shedMesh(sheds: Shed[]) {
  const geos = sheds.flatMap((s) => {
    const m = new THREE.Matrix4().makeRotationY((-s.deg * Math.PI) / 180).setPosition(s.at[0], 0, s.at[1]);
    return [
      paint(new THREE.BoxGeometry(s.w, s.h, s.d).translate(0, s.h / 2, 0).applyMatrix4(m), 0xe6e3dc),
      paint(new THREE.BoxGeometry(s.w + 0.3, 0.3, s.d + 0.3).translate(0, s.h, 0).applyMatrix4(m), 0x9aa0a6),
    ];
  });
  const geo = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}
