/* Sculpted people for Before the Ball, the same rig as the live arcade figures
   (Creature Feature KO, and Mall Santa Dash): lathed limbs with a shoulder, elbow,
   wrist, hip, knee and ankle, a torso with a chest and shoulder blades, a head with
   a brow, jaw and chin, and a face of eyes, brows, nose, mouth and ears.
   Poses are a short list of numbers. Lengths inside a figure are feet. */
const DEG = Math.PI / 180;
const HS = [0.44, 0.47, 0.46];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
function gauss(v, w) { return Math.exp(-(v * v) / (w * w)); }
function num(c) {
  if (typeof c === "number") return c;
  if (typeof c === "string") return parseInt(c.replace("#", ""), 16);
  return 0xffffff;
}

/* y = 0 is the root of the bone (shoulder or hip), y = 1 is the far joint.
   Upper arm and thigh stay thick; wrist and ankle narrow. A radius spike is a cuff or a hem. */
const PROF = {
  upSleeve: [[0, -0.05], [1.4, 0.0], [1.22, 0.28], [1.0, 0.55], [0.78, 0.8], [0.62, 0.9], [1.02, 0.98], [0.4, 1.06], [0, 1.1]],
  upPuff: [[0, -0.05], [1.75, 0.02], [1.6, 0.35], [1.35, 0.65], [1.05, 0.86], [0.85, 0.92], [1.2, 0.99], [0.45, 1.07], [0, 1.12]],
  foreSkin: [[0, -0.04], [0.78, 0.0], [0.66, 0.35], [0.5, 0.7], [0.36, 0.95], [0, 1.04]],
  foreSleeve: [[0, -0.04], [0.92, 0.0], [0.78, 0.4], [0.58, 0.72], [0.46, 0.86], [0.85, 0.96], [0.32, 1.05], [0, 1.1]],
  thighShort: [[0, -0.04], [1.5, 0.0], [1.28, 0.35], [1.05, 0.68], [0.82, 0.86], [1.2, 0.96], [0.45, 1.05], [0, 1.1]],
  thighPant: [[0, -0.04], [1.48, 0.0], [1.22, 0.4], [0.95, 0.72], [0.7, 1.0], [0, 1.05]],
  shinSkin: [[0, -0.04], [0.95, 0.02], [0.78, 0.35], [0.52, 0.7], [0.34, 0.98], [0, 1.04]],
  shinPant: [[0, -0.04], [0.98, 0.02], [0.8, 0.4], [0.55, 0.75], [0.42, 0.88], [0.72, 0.97], [0.28, 1.05], [0, 1.1]],
  neck: [[0, 0], [1.15, 0], [1.0, 0.25], [0.85, 0.6], [0.8, 1.0], [0, 1.0]],
  coat: [[0, 0.0], [0.95, 0.08], [1.05, 0.45], [0.98, 1.05], [1.12, 1.45], [1.28, 1.75], [0.85, 1.98], [0.35, 2.12], [0, 2.18]],
  robe: [[0, -0.2], [0.62, -0.12], [0.78, 0.15], [0.7, 0.7], [0.66, 1.15], [0.74, 1.55], [0.7, 1.85], [0.42, 2.02], [0, 2.1]]
};

function roundBox(T, w, h, d, r) {
  const s = 3, per = (s + 1) * (s + 1), half = 0.5 / s;
  r = Math.min(r == null ? 0.08 : r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let nx = px - Math.sign(px) * half, ny = py - Math.sign(py) * half, nz = pz - Math.sign(pz) * half;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    pos.setXYZ(i, bx * Math.sign(px) + nx * r, by * Math.sign(py) + ny * r, bz * Math.sign(pz) + nz * r);
    nor.setXYZ(i, nx, ny, nz);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}
function lathe(T, prof, seg) {
  return new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(Math.max(0, p[0]), p[1]); }), seg || 12);
}
function placed(T, geo, p, r, s) {
  const g = geo.clone(), m = new T.Matrix4();
  const q = r && r.isQuaternion ? r : new T.Quaternion().setFromEuler(new T.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
  m.compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
  g.applyMatrix4(m);
  return g;
}
function mergeGeos(T, parts) {
  const pos = [], nor = [], uv = [], idx = [], groups = [];
  let base = 0;
  parts.forEach(function (pt) {
    const g = pt[0], p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    const start = idx.length;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    groups.push([start, idx.length - start, pt[1] || 0]);
    base += p.count;
  });
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  groups.forEach(function (gr) { out.addGroup(gr[0], gr[1], gr[2]); });
  out.computeBoundingSphere();
  return out;
}
function segment(T, a, b, r0, r1) {
  const A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]), d = B.clone().sub(A), len = d.length() || 1e-4;
  const g = lathe(T, [[0, -r0], [r0 * 0.7, -r0 * 0.7], [r0, 0], [r1, len], [r1 * 0.7, len + r1 * 0.7], [0, len + r1]], 8);
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.multiplyScalar(1 / len));
  return placed(T, g, a, q);
}

function robeGeo(T) {
  const g = lathe(T, PROF.robe, 16), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    z *= 0.78;
    if (z > 0.02) {
      const open = Math.min(1, (z - 0.02) / 0.35) * (y < 1.7 ? 1 : 0.35);
      x += Math.sign(x || 1) * 0.16 * open;
      z *= 1 - 0.45 * open;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function torsoGeo(T) {
  const g = lathe(T, [[0, -0.16], [0.46, -0.14], [0.57, 0.05], [0.56, 0.35], [0.52, 0.62], [0.58, 0.95], [0.68, 1.3], [0.74, 1.6], [0.75, 1.8], [0.66, 1.98], [0.42, 2.1], [0.22, 2.18], [0, 2.2]], 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i) * 0.72;
    x *= 1 + 0.34 * ease((y - 1.25) / 0.55) * (y < 2.05 ? 1 : 0.45);
    if (z > 0) {
      const pec = gauss(y - 1.55, 0.24) * (1 - Math.min(1, Math.abs(x) / 0.78));
      z += pec * 0.1 - 0.03 * gauss(x, 0.07) * pec;
      z += 0.025 * gauss(y - 0.7, 0.25) * gauss(x, 0.35);
    } else z -= 0.06 * gauss(y - 1.55, 0.3) * (1 - gauss(x, 0.12) * 0.6);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function headGeo(T, o) {
  o = o || {};
  const g = new T.SphereGeometry(1, 22, 16), p = g.attributes.position;
  const jaw = o.jaw == null ? 0.32 : o.jaw, chin = o.chin == null ? 0.06 : o.chin;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i) * 1.12, z = p.getZ(i);
    if (y < -0.1) { const k = (-0.1 - y) / 1.02; x *= 1 - jaw * k; z *= z > 0 ? 1 - 0.1 * k : 1 - 0.38 * k; }
    if (z < 0 && y > -0.25) z *= 1.08;
    if (z > 0) {
      z += (o.brow == null ? 0.08 : o.brow) * gauss(y - 0.32, 0.12) * gauss(x, 0.62);
      z -= 0.07 * (gauss(x - 0.36, 0.17) + gauss(x + 0.36, 0.17)) * gauss(y - 0.12, 0.13);
      z += 0.05 * gauss(Math.abs(x) - 0.52, 0.17) * gauss(y + 0.02, 0.15);
      z += chin * gauss(x, 0.26) * gauss(y + 0.95, 0.2);
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function handGeo(T, curl) {
  curl = curl == null ? 0.35 : curl;
  const fr = 0.034, parts = [];
  parts.push([placed(T, roundBox(T, 0.11, 0.3, 0.27, 0.05), [0, 0.17, 0]), 0]);
  parts.push([placed(T, new T.SphereGeometry(1, 8, 6), [-0.01, 0.27, 0], null, [0.065, 0.06, 0.15]), 0]);
  [[-0.095, 0.82], [-0.032, 1.0], [0.032, 0.96], [0.095, 0.74]].forEach(function (f) {
    const L = 0.15 * f[1], z = f[0];
    let a = [0, 0.3, z], ang = 0.25 + curl * 0.6;
    for (let k = 0; k < 2; k++) {
      const len = k ? L * 0.8 : L, b = [a[0] - Math.sin(ang) * len, a[1] + Math.cos(ang) * len, z];
      parts.push([segment(T, a, b, fr * (k ? 0.88 : 1), fr * (k ? 0.78 : 0.9)), 0]);
      a = b; ang += 0.35 + curl * 1.0;
    }
  });
  const t0 = [-0.02, 0.09, 0.12], t1 = [-0.07, 0.2, 0.2], t2 = [-0.11 - curl * 0.04, 0.29, 0.2 - curl * 0.05];
  parts.push([segment(T, t0, t1, fr * 1.25, fr * 1.05), 0]);
  parts.push([segment(T, t1, t2, fr * 1.05, fr * 0.9), 0]);
  return mergeGeos(T, parts);
}
function footGeo(T, kind) {
  const g = new T.SphereGeometry(1, 16, 12), p = g.attributes.position, boot = kind === "boot";
  for (let i = 0; i < p.count; i++) {
    const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
    const z = z0 * 0.55 + 0.26, u = clamp((z + 0.2) / 1.05, 0, 1);
    const w = 0.2 + 0.045 * Math.sin(u * Math.PI * 0.9);
    const top = 0.42 - 0.2 * ease((z - 0.1) / 0.6);
    const y = y0 >= 0 ? -0.08 + y0 * top : -0.1 + y0 * 0.06;
    p.setXYZ(i, x0 * w, y, z);
  }
  g.computeVertexNormals();
  const parts = [[g, 0], [placed(T, roundBox(T, 0.4, 0.09, 1.02, 0.04), [0, -0.14, 0.26]), 1]];
  parts.push([placed(T, lathe(T, [[0, -0.02], [0.2, 0], [0.22, 0.16], [0.16, 0.32], [0, 0.34]], 10), [0, -0.02, -0.02]), 0]);
  parts.push([placed(T, new T.SphereGeometry(1, 8, 6), [0, 0.06, 0.7], null, [0.16, 0.1, 0.18]), 0]);
  if (boot) parts.push([placed(T, lathe(T, [[0, 0.1], [0.2, 0.12], [0.21, 0.4], [0.18, 0.62], [0, 0.64]], 10), [0, 0.05, -0.02]), 0]);
  return mergeGeos(T, parts);
}

function faceKit(T) {
  const G = {};
  G.sph = new T.SphereGeometry(1, 10, 8);
  G.nose = mergeGeos(T, [
    [segment(T, [0, 0.09, -0.02], [0, -0.02, 0.06], 0.03, 0.045), 0],
    [placed(T, new T.SphereGeometry(1, 8, 6), [0, -0.035, 0.06], null, [0.05, 0.04, 0.04]), 0],
    [placed(T, new T.SphereGeometry(1, 6, 5), [0.04, -0.05, 0.035], null, [0.03, 0.025, 0.03]), 0],
    [placed(T, new T.SphereGeometry(1, 6, 5), [-0.04, -0.05, 0.035], null, [0.03, 0.025, 0.03]), 0]]);
  G.ear = mergeGeos(T, [
    [placed(T, new T.SphereGeometry(1, 10, 8), [0.02, 0, 0], [0, 0.35, 0], [0.04, 0.11, 0.07]), 0],
    [placed(T, new T.TorusGeometry(0.06, 0.016, 5, 10, Math.PI * 1.4), [0.04, 0.01, 0], [0, Math.PI / 2 + 0.35, Math.PI * 0.8], [1, 1.5, 1]), 0]]);
  return G;
}

function bend(TMP, A, B, pole, l1, l2, out) {
  const t = TMP;
  t.d.subVectors(B, A);
  let d = t.d.length();
  if (d < 1e-4) { t.d.set(0, -1, 0); d = 1e-4; } else t.d.multiplyScalar(1 / d);
  const dm = Math.min(d, (l1 + l2) * 0.999), a = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  t.q.copy(pole).addScaledVector(t.d, -pole.dot(t.d));
  if (t.q.lengthSq() < 1e-6) t.q.set(0, 0, 1);
  t.q.normalize();
  out.copy(A).addScaledVector(t.d, a).addScaledVector(t.q, hgt);
}
function bone(TMP, mesh, A, B, r) {
  const t = TMP;
  t.d.subVectors(B, A);
  const l = t.d.length() || 1e-4;
  mesh.position.copy(A);
  mesh.quaternion.setFromUnitVectors(t.up, t.d.multiplyScalar(1 / l));
  mesh.scale.set(r, l, r);
}
function setLimb(TMP, L, A, B, pole, l1, l2) {
  bend(TMP, A, B, pole, l1, l2, TMP.e);
  bone(TMP, L.up, A, TMP.e, L.r1);
  bone(TMP, L.lo, TMP.e, B, L.r2);
  L.j0.position.copy(A); L.j1.position.copy(TMP.e); L.end.position.copy(B);
  if (L.delt) { L.j0.quaternion.copy(L.up.quaternion); L.j0.position.addScaledVector(TMP.d.subVectors(TMP.e, A).normalize(), 0.1); }
  if (L.cuff) {
    const atElbow = L.cuffAt === "elbow";
    L.cuff.position.copy(atElbow ? L.j1.position : L.end.position);
    L.cuff.quaternion.copy((atElbow ? L.up : L.lo).quaternion);
    L.cuff.scale.setScalar((atElbow ? L.r1 : L.r2) * (atElbow ? 0.9 : 0.72));
  }
}
function placeHand(TMP, P, s) {
  const L = P.arm[s], t = TMP, h = P.hand[s];
  t.d.subVectors(L.end.position, L.j1.position).normalize();
  t.f.set(0, 0.7 * Math.max(0, t.d.z), 1).normalize();
  t.x.crossVectors(t.d, t.f);
  if (t.x.lengthSq() < 1e-6) t.x.set(-1, 0, 0);
  t.x.normalize(); t.z.crossVectors(t.x, t.d);
  t.m.makeBasis(t.x, t.d, t.z);
  h.quaternion.setFromRotationMatrix(t.m);
  h.position.copy(L.end.position);
}
function applyPose(TMP, P, v) {
  const t = TMP, hy = v[3] * DEG, uy = v[4] * DEG, ch = Math.cos(hy), sh = Math.sin(hy), cu = Math.cos(uy), su = Math.sin(uy), bk = P.bulk;
  P.hips.position.set(v[0], v[1], v[2]); P.hips.rotation.y = hy;
  P.upper.position.set(v[0], v[1], v[2]); P.upper.rotation.set(v[5] * DEG, uy, 0, "YXZ");
  P.upper.updateMatrix();
  P.head.rotation.y = (v[18] - v[4]) * DEG;
  for (let s = 0; s < 2; s++) {
    const sg = s ? -1 : 1, px = sg * 0.5, pz = -0.5;
    t.a.set(sg * 0.82 * bk, 1.86, 0).applyMatrix4(P.upper.matrix);
    t.b.set(v[6 + s * 3], v[7 + s * 3], v[8 + s * 3]);
    t.p.set(px * cu + pz * su, -0.8, -px * su + pz * cu);
    setLimb(TMP, P.arm[s], t.a, t.b, t.p, 1.15, 1.12);
    placeHand(TMP, P, s);
    t.a.set(v[0] + sg * 0.4 * bk * ch, v[1] - 0.08, v[2] - sg * 0.4 * bk * sh);
    t.b.set(v[12 + s * 3], v[13 + s * 3] + 0.14, v[14 + s * 3]);
    t.p.set(sh + sg * 0.25 * ch, 0.2, ch - sg * 0.25 * sh);
    setLimb(TMP, P.leg[s], t.a, t.b, t.p, 1.5, 1.48);
    P.shoe[s].position.set(t.b.x, v[13 + s * 3] + 0.02, t.b.z);
    P.shoe[s].rotation.y = hy * 0.6;
  }
}

const STAND = [0, 3.02, 0, 0, 0, 6, 0.82, 3.12, 0.18, -0.82, 3.12, 0.18, 0.38, 0.16, 0.06, -0.38, 0.16, 0.06, 0];

function copy19(v, src) { for (let i = 0; i < 19; i++) v[i] = src[i]; }
function cycle(v, ph, amp) {
  const s = Math.sin(ph), lift = function (x) { return Math.max(0, x); };
  v[1] = 3.02 - Math.abs(Math.cos(ph)) * 0.07 * amp;
  v[0] = s * 0.05 * amp;
  v[5] = 6 + 12 * amp;
  v[4] = -s * 7 * amp;
  v[12] = 0.36; v[13] = 0.16 + lift(s) * 1.0 * amp; v[14] = 0.06 + s * 0.7 * amp;
  v[15] = -0.36; v[16] = 0.16 + lift(-s) * 1.0 * amp; v[17] = 0.06 - s * 0.7 * amp;
  v[6] = 0.7; v[7] = 3.1 - lift(-s) * 0.4 * amp; v[8] = 0.12 - s * 0.95 * amp;
  v[9] = -0.7; v[10] = 3.1 - lift(s) * 0.4 * amp; v[11] = 0.12 + s * 0.95 * amp;
}

export function createCast(T) {
  const TMP = {
    d: new T.Vector3(), q: new T.Vector3(), e: new T.Vector3(), a: new T.Vector3(), b: new T.Vector3(),
    p: new T.Vector3(), f: new T.Vector3(), x: new T.Vector3(), z: new T.Vector3(), up: new T.Vector3(0, 1, 0), m: new T.Matrix4()
  };
  const G = {
    sph: new T.SphereGeometry(1, 12, 9),
    upSleeve: lathe(T, PROF.upSleeve, 10), upPuff: lathe(T, PROF.upPuff, 10),
    foreSkin: lathe(T, PROF.foreSkin, 10), foreSleeve: lathe(T, PROF.foreSleeve, 10),
    thighShort: lathe(T, PROF.thighShort, 10), thighPant: lathe(T, PROF.thighPant, 10),
    shinSkin: lathe(T, PROF.shinSkin, 10), shinPant: lathe(T, PROF.shinPant, 10),
    neck: lathe(T, PROF.neck, 8), coat: lathe(T, PROF.coat, 12),
    torso: torsoGeo(T), head: headGeo(T), hand: handGeo(T, 0.4),
    shoe: footGeo(T, "shoe"), boot: footGeo(T, "boot"),
    cuff: new T.TorusGeometry(1, 0.28, 5, 10)
  };
  G.cuff.rotateX(Math.PI / 2);
  const kit = faceKit(T);
  G.nose = kit.nose; G.ear = kit.ear; G.sphSm = kit.sph;
  const mats = {}, texes = {}, boxes = {};
  function pho(col, shin, extra) {
    const c = num(col), sh = shin == null ? 14 : shin;
    const mapId = extra && extra.map ? extra.map.uuid : "";
    const em = extra && extra.emissive != null ? extra.emissive : "";
    const key = c + "/" + sh + "/" + mapId + "/" + em;
    if (mats[key]) return mats[key];
    const p = { color: mapId ? 0xffffff : c, shininess: sh, specular: 0x333333 };
    if (extra) {
      if (extra.map) p.map = extra.map;
      if (extra.emissive != null) { p.emissive = new T.Color(extra.emissive); p.emissiveIntensity = extra.emissiveIntensity == null ? 0.6 : extra.emissiveIntensity; }
    }
    const m = new T.MeshPhongMaterial(p);
    mats[key] = m;
    return m;
  }
  function cloth(col) {
    const c = num(col), key = c.toString(16);
    if (texes[key]) return texes[key];
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;
    const g = cv.getContext("2d");
    g.fillStyle = "#" + key.padStart(6, "0"); g.fillRect(0, 0, 64, 64);
    let n = c || 1;
    for (let i = 0; i < 220; i++) {
      n = (n * 16807) % 2147483647;
      const x = (n % 64); n = (n * 16807) % 2147483647; const y = n % 64;
      g.fillStyle = i % 2 ? "rgba(0,0,0,.16)" : "rgba(255,255,255,.12)";
      g.fillRect(x, y, 2, 1);
    }
    const tx = new T.CanvasTexture(cv);
    tx.colorSpace = T.SRGBColorSpace; tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(1, 2);
    texes[key] = tx;
    return tx;
  }
  function wear(col, shin) { return pho(0xffffff, shin == null ? 8 : shin, { map: cloth(col) }); }
  function rb(w, h, d, r) {
    const k = w + "," + h + "," + d + "," + (r || 0);
    if (!boxes[k]) boxes[k] = roundBox(T, w, h, d, r);
    return boxes[k];
  }
  function chunk(parent, geo, mat, x, y, z) {
    const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m;
  }

  function face(F, h, o) {
    const skin = o.skin, out = {};
    const fg = new T.Group(); h.add(fg);
    const hm = new T.Mesh(G.head, skin); hm.scale.set(HS[0], HS[1], HS[2]); fg.add(hm); out.head = hm;
    const ey = 0.05, ex = 0.16;
    const white = pho(0xfbf8f0, 80);
    const iris = pho(o.iris || 0x4a2a14, 100);
    out.lids = [-1, 1].map(function (s) {
      const g = new T.Group(); g.position.set(s * ex, ey, 0.5); fg.add(g);
      const w = new T.Mesh(G.sphSm, white); w.scale.set(0.1, 0.078, 0.05); g.add(w);
      const ir = new T.Mesh(G.sphSm, iris); ir.scale.set(0.052, 0.052, 0.03); ir.position.z = 0.03; g.add(ir);
      const pp = new T.Mesh(G.sphSm, pho(0x100e0c, 20)); pp.scale.set(0.024, 0.028, 0.016); pp.position.z = 0.048; g.add(pp);
      const lid = new T.Mesh(G.sphSm, skin); lid.scale.set(0.11, 0.02, 0.04); lid.position.set(0, 0.07, 0.01); g.add(lid);
      return lid;
    });
    const bm = pho(o.brow || 0x3a2414, 12);
    [-1, 1].forEach(function (s) {
      const b = new T.Mesh(rb(0.2, 0.045, 0.05, 0.018), bm);
      b.position.set(s * (ex + 0.01), ey + 0.15, 0.52);
      b.rotation.set(-0.2, s * 0.2, s * (o.browTilt || 0.12));
      fg.add(b);
    });
    const n = new T.Mesh(G.nose, skin); n.position.set(0, ey - 0.1, 0.52); n.scale.setScalar((o.noseK || 1) * 1.35); fg.add(n);
    const mouth = new T.Group(); mouth.position.set(0, -0.24, 0.5); fg.add(mouth);
    const lips = pho(o.lips || 0xb0625a, 24);
    const arc = new T.Mesh(new T.TorusGeometry(0.11, 0.022, 6, 14, Math.PI * 0.85), lips);
    arc.rotation.z = o.mouth === "frown" ? Math.PI * 0.18 : -Math.PI * 0.9;
    arc.position.y = o.mouth === "frown" ? -0.02 : 0.045;
    arc.scale.set(1.2, o.mouth === "flat" ? 0.4 : 0.75, 0.75);
    mouth.add(arc);
    [-1, 1].forEach(function (s) {
      const e = new T.Mesh(G.ear, skin); e.position.set(s * 0.5, 0.0, 0.02); e.scale.set(s * 1.15, 1.15, 1.15); fg.add(e);
    });
    return out;
  }

  function hatOf(F, h, o, red, white) {
    if (o.hat === "santa") {
      const cone = new T.Mesh(new T.ConeGeometry(0.36, 0.78, 12), red);
      cone.position.set(0.1, 0.46, 0.02); cone.rotation.z = -0.55; h.add(cone);
      const fold = new T.Mesh(new T.TorusGeometry(0.36, 0.07, 6, 14), white); fold.rotation.x = Math.PI / 2; fold.position.y = 0.08; h.add(fold);
      const pom = new T.Mesh(G.sph, white); pom.scale.setScalar(0.11); pom.position.set(0.32, 0.72, 0.02); h.add(pom);
    } else if (o.hat === "beanie") {
      const col = pho(o.hatc || 0xc2304a, 12);
      const dome = new T.Mesh(G.sph, col); dome.scale.set(0.5, 0.32, 0.5); dome.position.y = 0.22; h.add(dome);
      const fold = new T.Mesh(new T.TorusGeometry(0.34, 0.065, 6, 14), white); fold.rotation.x = Math.PI / 2; fold.position.y = 0.08; h.add(fold);
      const pom = new T.Mesh(G.sph, white); pom.scale.setScalar(0.09); pom.position.y = 0.5; h.add(pom);
    } else if (o.hat === "cap") {
      const col = pho(o.capc || 0x1d2b53, 16);
      const crown = new T.Mesh(G.sph, col); crown.scale.set(0.48, 0.26, 0.48); crown.position.y = 0.2; h.add(crown);
      const brim = new T.Mesh(rb(0.52, 0.04, 0.28, 0.02), col); brim.position.set(0, 0.12, 0.32); h.add(brim);
    } else if (o.hat === "band") {
      const band = new T.Mesh(new T.TorusGeometry(0.4, 0.045, 6, 16), white); band.rotation.x = Math.PI / 2; band.position.y = 0.12; h.add(band);
    } else if (o.hat === "party") {
      const gold = pho(o.hatc || 0xffd23f, 24);
      const pink = pho(0xff3fa4, 18);
      const cone = new T.Mesh(new T.ConeGeometry(0.36, 0.72, 14), gold);
      cone.position.y = 0.44; h.add(cone);
      const wrap = new T.Mesh(new T.TorusGeometry(0.2, 0.028, 6, 14), pink);
      wrap.rotation.x = Math.PI / 2; wrap.position.y = 0.42; h.add(wrap);
      const brim = new T.Mesh(new T.TorusGeometry(0.36, 0.05, 6, 16), pink);
      brim.rotation.x = Math.PI / 2; brim.position.y = 0.1; h.add(brim);
      const pom = new T.Mesh(G.sph, white); pom.scale.setScalar(0.075); pom.position.y = 0.82; h.add(pom);
    }
  }

  function makeFigure(o) {
    const root = new T.Group(), body = new T.Group();
    root.add(body);
    const sc = 0.3 * (o.scale || 1);
    body.scale.setScalar(sc);
    const bulk = o.bulk || 1;
    function ball(mat, sx, sy, sz, parent) {
      const m = new T.Mesh(G.sph, mat); m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); (parent || body).add(m); return m;
    }
    const hips = ball(o.hips, 0.6 * bulk, 0.42, 0.46 * bulk);
    [-1, 1].forEach(function (s) {
      const gl = ball(o.hips, 0.42, 0.62, 0.45, hips); gl.position.set(s * 0.4, -0.15, -0.5);
    });
    const upper = new T.Group(); body.add(upper);
    const torso = new T.Mesh(o.robeGeo || (o.coat ? G.coat : G.torso), o.torso); torso.scale.set(bulk * (o.coat ? 1.08 : 1), 1, bulk * (o.coat ? 1.12 : 1)); upper.add(torso);
    const trap = ball(o.trap || o.torso, 0.72 * bulk, 0.22, 0.4 * bulk, upper); trap.position.set(0, 1.9, -0.02);
    if (o.belt) {
      const belt = new T.Mesh(new T.TorusGeometry(0.62 * bulk, 0.07, 6, 16), o.belt); belt.rotation.x = Math.PI / 2; belt.scale.set(1, 1, 0.72); belt.position.y = 0.12; upper.add(belt);
      const buck = new T.Mesh(roundBox(T, 0.18, 0.12, 0.04, 0.02), pho(0xe8c56a, 46)); buck.position.set(0, 0.12, 0.52 * bulk); upper.add(buck);
    }
    const neck = new T.Mesh(G.neck, o.skin); neck.scale.set(0.2 * bulk, 0.5, 0.19 * bulk); neck.position.set(0, 1.98, 0.02); upper.add(neck);
    const head = new T.Group(); head.position.y = 2.62; head.scale.setScalar(1.28); upper.add(head);
    function limb(m1, m2, r1, r2, endMat, endR, g1, g2, cuffMat, cuffAt) {
      const L = { up: new T.Mesh(g1, m1), lo: new T.Mesh(g2, m2), j0: ball(m1, r1), j1: ball(m2, r2 * 0.9), end: ball(endMat, endR), r1: r1, r2: r2, cuffAt: cuffAt || "wrist" };
      body.add(L.up); body.add(L.lo);
      if (cuffMat) { L.cuff = new T.Mesh(G.cuff, cuffMat); body.add(L.cuff); }
      return L;
    }
    const ab = o.armBulk || bulk, lb = o.legBulk || bulk;
    const upG = o.puffy ? G.upPuff : G.upSleeve;
    const foreG = o.longSleeve ? G.foreSleeve : G.foreSkin;
    const thighG = o.shorts ? G.thighShort : G.thighPant;
    const shinG = o.shorts ? G.shinSkin : G.shinPant;
    const arm = [0, 1].map(function () { return limb(o.sleeve, o.fore, 0.32 * ab, 0.16 * ab, o.fore, 0.1 * ab, upG, foreG, o.cuff, o.longSleeve ? "wrist" : "elbow"); });
    arm.forEach(function (L) { L.j0.scale.set(0.42 * ab, 0.36 * ab, 0.4 * ab); L.delt = true; });
    const leg = [0, 1].map(function () { return limb(o.thigh, o.shin, 0.38 * lb, 0.18 * lb, o.ankle, 0.1 * lb, thighG, shinG, o.ankleCuff, "wrist"); });
    const hk = ab;
    const hand = [0, 1].map(function (s) {
      const m = new T.Mesh(G.hand, o.hand); m.scale.set(hk * (s ? 1 : -1), hk, hk); body.add(m); return m;
    });
    const shoe = [0, 1].map(function () { const m = new T.Mesh(o.footGeo || G.shoe, o.shoe); m.scale.setScalar(lb); body.add(m); return m; });
    const F = { root: root, body: body, hips: hips, upper: upper, head: head, torso: torso, arm: arm, leg: leg, hand: hand, shoe: shoe, bulk: bulk };
    root.traverse(function (n) { n.frustumCulled = false; });
    return F;
  }

  function shade(col, k) {
    const c = num(col);
    const ch = function (s) { return Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k))); };
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  }
  function jerseyMat() {
    if (texes.jersey) return pho(0xffffff, 14, { map: texes.jersey });
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 256;
    const g = cv.getContext("2d");
    g.fillStyle = "#f7f4ee"; g.fillRect(0, 0, 512, 256);
    const sh = g.createLinearGradient(0, 0, 0, 256);
    sh.addColorStop(0, "rgba(255,255,255,.35)"); sh.addColorStop(0.45, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.18)");
    g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
    g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0, 0, 36, 256); g.fillRect(476, 0, 36, 256);
    g.fillStyle = "#e7e0d2"; g.fillRect(0, 228, 512, 28);
    g.fillStyle = "#d5cbb8"; g.fillRect(0, 226, 512, 4);
    function badge(cx) {
      g.fillStyle = "#1b1b22"; g.fillRect(cx - 54, 78, 108, 78);
      for (let j = 0; j < 2; j++) for (let i = -2; i < 2; i++) { g.fillStyle = (i + j) % 2 ? "#e4343e" : "#fff1d6"; g.fillRect(cx + i * 14, 86 + j * 14, 14, 14); }
      g.fillStyle = "#1f8f4a"; g.fillRect(cx - 28, 116, 56, 8);
      g.fillStyle = "#c2304a"; g.font = "900 42px Arial Black, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("NP", cx, 148);
    }
    badge(0); badge(256); badge(512);
    const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; texes.jersey = tx;
    return pho(0xffffff, 14, { map: tx });
  }
  function band(parent, mat, y, rx, ry, tube) {
    const m = new T.Mesh(new T.TorusGeometry(rx, tube || 0.07, 6, 14), mat);
    m.rotation.x = Math.PI / 2; m.scale.set(1, 1, ry / rx); m.position.y = y; parent.add(m); return m;
  }
  function handset(parent) {
    const g = new T.Group();
    const body = lathe(T, [[0, 0], [0.045, 0.02], [0.055, 0.08], [0.04, 0.14], [0.055, 0.2], [0.04, 0.26], [0, 0.3]], 10);
    g.add(new T.Mesh(body, pho(0xd7dbe4, 36)));
    const ant = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.14, 6), pho(0x8d93a0, 20));
    ant.position.y = 0.34; g.add(ant);
    const ear = new T.Mesh(G.sph, pho(0x2a2d38, 18)); ear.scale.set(0.04, 0.025, 0.02); ear.position.set(0, 0.22, 0.04); g.add(ear);
    const mic = new T.Mesh(G.sph, pho(0x2a2d38, 18)); mic.scale.set(0.03, 0.02, 0.018); mic.position.set(0, 0.04, 0.04); g.add(mic);
    const led = new T.Mesh(G.sph, pho(0x3fd07a, 40, { emissive: 0x146b32, emissiveIntensity: 0.8 }));
    led.scale.setScalar(0.012); led.position.set(0.03, 0.14, 0.04); g.add(led);
    g.scale.setScalar(1.7);
    parent.add(g);
    return g;
  }
  function partyMat() {
    if (texes.party) return pho(0xffffff, 12, { map: texes.party });
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#1d2b53"; g.fillRect(0, 0, 128, 128);
    const dots = ["#ffd23f", "#ff3fa4", "#3ff0ff", "#fff6c8"];
    let n = 19;
    for (let i = 0; i < 36; i++) {
      n = (n * 16807) % 2147483647; const x = n % 120;
      n = (n * 16807) % 2147483647; const y = 8 + (n % 90);
      g.fillStyle = dots[i % 4]; g.fillRect(x, y, 4, 4);
    }
    g.fillStyle = "#3ff0ff"; g.fillRect(0, 108, 128, 8);
    g.fillStyle = "#ffd23f"; g.fillRect(0, 116, 128, 4);
    const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; texes.party = tx;
    return pho(0xffffff, 12, { map: tx });
  }
  function person(o) {
    o = o || {};
    const skin = pho(o.skin || 0xf1c28e, 16);
    const shirtCol = o.tee ? 0xf4f1ea : (o.shirt || 0x355a8a);
    const shirt = o.party ? partyMat() : (o.tee ? jerseyMat() : (o.shirtMat || wear(shirtCol)));
    const rib = wear(shade(shirtCol, o.tee ? 0.82 : 0.72));
    const sleeve = o.party ? shirt : (o.tee ? wear(0xf7f4ee) : shirt);
    const fore = (o.sleeves === "short" || o.bareArm) ? skin : shirt;
    const pants = wear(o.pants || 0x2c3a55, 10);
    const waist = wear(shade(o.pants || 0x2c3a55, 0.62), 12);
    const shoeU = o.shoeMat || pho(o.shoes || 0xf4f1ea, 28);
    const shoeS = pho(o.sole || 0x241c16, 8);
    const hairM = pho(o.hair || 0x4a2f1c, 10);
    const white = pho(0xfff8f0, 12);
    const handMat = o.mittens ? pho(o.mittens, 18) : skin;
    const cuffMat = o.fur ? white : (o.cuff === false ? null : rib);
    const F = makeFigure({
      scale: o.scale, bulk: o.bulk, coat: !!o.coat && !o.robe, robeGeo: o.robe ? robeGeo(T) : null, puffy: !!o.coat && !o.robe, longSleeve: o.sleeves !== "short", shorts: !!o.shorts,
      torso: shirt, trap: o.tee ? sleeve : (o.coat ? shirt : rib), sleeve: sleeve, fore: fore, cuff: cuffMat,
      hand: handMat, skin: skin, hips: pants, thigh: pants, shin: o.shorts ? skin : pants,
      ankle: white, ankleCuff: o.shorts ? null : (o.fur ? white : waist),
      shoe: [shoeU, shoeS], footGeo: o.boots ? G.boot : G.shoe, belt: o.belt ? pho(o.belt, 22) : (o.shorts ? null : null)
    });
    const hemY = o.coat ? 0.2 : 0.16;
    band(F.upper, o.fur ? white : (o.tee ? wear(0xe4dcc8) : shirt), hemY, 0.64 * (o.bulk || 1), 0.42 * (o.bulk || 1), o.fur ? 0.11 : 0.05);
    band(F.upper, o.fur ? white : (o.tee ? wear(0xded6c8) : rib), 1.78, 0.3 * (o.bulk || 1), 0.24 * (o.bulk || 1), o.fur ? 0.09 : 0.045);
    if (!o.coat) band(F.upper, waist, 0.08, 0.7 * (o.bulk || 1), 0.46 * (o.bulk || 1), 0.06);
    if (o.collar) {
      const colr = new T.Mesh(roundBox(T, 0.34, 0.1, 0.16, 0.03), wear(o.collar));
      colr.position.set(0, 1.82, 0.34); F.upper.add(colr);
    }
    if (o.coat) {
      [-1, 1].forEach(function (s) {
        const p = new T.Mesh(G.sph, shirt); p.scale.set(0.38, 0.28, 0.34); p.position.set(s * 0.78, 1.72, 0.02); F.upper.add(p);
      });
      if (o.robe) {
        const lining = wear(0xf6efe6);
        [-1, 1].forEach(function (s) {
          const lap = new T.Mesh(roundBox(T, 0.1, 0.55, 0.04, 0.02), lining);
          lap.position.set(s * 0.16, 1.45, 0.5 * (o.bulk || 1)); lap.rotation.z = s * -0.4; F.upper.add(lap);
        });
        const tie = new T.Mesh(roundBox(T, 0.06, 0.28, 0.03, 0.02), wear(0xc4a574));
        tie.position.set(0.1, 1.15, 0.52); tie.rotation.z = 0.4; F.upper.add(tie);
      }
      if (o.scarf) {
        const sc = pho(o.scarf, 12);
        band(F.upper, sc, 1.7, 0.4, 0.32, 0.09);
        const tail = new T.Mesh(roundBox(T, 0.16, 0.7, 0.06, 0.03), sc); tail.position.set(0.18, 1.25, 0.42); tail.rotation.z = 0.15; F.upper.add(tail);
      }
    }
    if (o.vest) {
      const vest = new T.Mesh(roundBox(T, 0.85, 0.95, 0.12, 0.08), wear(o.vest));
      vest.position.set(0, 1.15, 0.42); F.upper.add(vest);
      const strap = new T.Mesh(roundBox(T, 0.1, 0.45, 0.06, 0.03), wear(shade(o.vest, 0.75)));
      strap.position.set(0, 1.55, 0.4); F.upper.add(strap);
    }
    if (o.belly) {
      const belly = new T.Mesh(G.sph, shirt); belly.scale.set(0.42, 0.36, 0.38); belly.position.set(0, 0.85, 0.42); F.upper.add(belly);
    }
    const h = F.head;
    F.face = face(F, h, { skin: skin, iris: o.iris || 0x3a2414, brow: o.hair || 0x3a2414, lips: o.lips || 0xb0625a, mouth: o.mouth || "smile", browTilt: o.browTilt || 0.06, noseK: o.noseK || 1 });
    if (o.hairStyle !== "bald") {
      const top = new T.Mesh(G.sph, hairM); top.scale.set(0.46, 0.2, 0.42); top.position.set(0, 0.24, 0.02); h.add(top);
      const back = new T.Mesh(G.sph, hairM);
      const bob = o.hairStyle === "bob" || o.hairStyle === "bun";
      back.scale.set(bob ? 0.5 : 0.4, bob ? 0.46 : 0.26, bob ? 0.4 : 0.3);
      back.position.set(0, bob ? -0.1 : 0.02, -0.16);
      h.add(back);
      [-1, 1].forEach(function (s) {
        const sb = new T.Mesh(G.sph, hairM); sb.scale.set(0.09, bob ? 0.22 : 0.14, 0.1); sb.position.set(s * 0.4, bob ? -0.08 : -0.02, 0.04); h.add(sb);
      });
      if (o.hairStyle === "bun") { const bun = new T.Mesh(G.sph, hairM); bun.scale.set(0.16, 0.16, 0.16); bun.position.set(0, 0.28, -0.12); h.add(bun); }
    }
    hatOf(F, h, o, wear(o.hatc || 0xc2304a, 12), white);
    if (o.beard) {
      const fur = pho(0xfff6ee, 18);
      const chin = new T.Mesh(G.sph, fur); chin.scale.set(0.32, 0.28, 0.24); chin.position.set(0, -0.32, 0.16); h.add(chin);
      const stash = new T.Mesh(G.sph, fur); stash.scale.set(0.22, 0.07, 0.1); stash.position.set(0, -0.12, 0.4); h.add(stash);
      [-1, 1].forEach(function (s) { const ck = new T.Mesh(G.sph, pho(0xe4897a, 10)); ck.scale.set(0.07, 0.045, 0.03); ck.position.set(s * 0.16, -0.02, 0.4); h.add(ck); });
    }
    if (o.stripe) { const s = new T.Mesh(rb(0.95, 0.08, 0.16, 0.03), white); s.position.set(0, 1.5, 0.5); F.upper.add(s); }
    if (o.sash) { const s = new T.Mesh(rb(0.16, 0.95, 0.08, 0.04), pho(o.sash, 18)); s.position.set(0.08, 1.15, 0.46); s.rotation.z = 0.55; F.upper.add(s); }
    if (o.cuffs) {
      F.hand.forEach(function (hd) { const c = new T.Mesh(new T.TorusGeometry(0.11, 0.035, 5, 10), white); c.rotation.x = Math.PI / 2; c.position.y = 0.02; hd.add(c); });
      const hem = new T.Mesh(new T.TorusGeometry(0.7 * (o.bulk || 1), 0.08, 6, 14), white); hem.rotation.x = Math.PI / 2; hem.scale.z = 0.7; hem.position.y = 0.15; F.upper.add(hem);
    }
    if (o.pockets) {
      const pk = wear(0x6e6240, 8);
      [-1, 1].forEach(function (s) { const p = new T.Mesh(rb(0.22, 0.18, 0.08, 0.03), pk); p.position.set(s * 0.34, 0.15, 0.46); F.upper.add(p); });
    }
    let phone = null;
    if (o.phone) { phone = handset(F.hand[1]); phone.position.set(0.02, 0.22, 0.08); phone.rotation.z = -0.35; }
    const P = { g: F.root, F: F, shoeL: F.shoe[0], shoeR: F.shoe[1], grip: F.hand[1], head: F.head, phone: phone, v: STAND.slice(), phase: Math.random() * 6, blink: 1 + Math.random() * 3, face: F.face };
    if (o.wheels) {
      P.wheels = [];
      const wm = pho(0x9bff3f, 50, { emissive: 0x3a8a18, emissiveIntensity: 0.85 });
      F.shoe.forEach(function (sh) {
        for (let k = 0; k < 3; k++) {
          const w = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.055, 8), wm);
          w.rotation.z = Math.PI / 2; w.position.set(0, -0.2, 0.18 + k * 0.22); w.visible = false; sh.add(w); P.wheels.push(w);
        }
      });
    }
    pose(P, o.pose || "stand", 0, 0);
    return P;
  }

  function pose(P, kind, ph, t) {
    const v = P.v;
    copy19(v, STAND);
    ph = ph || 0; t = t == null ? ph : t;
    if (kind === "run") cycle(v, ph, 1);
    else if (kind === "skate") { cycle(v, ph, 0.42); v[5] = 16; v[13] = Math.min(v[13], 0.4); v[16] = Math.min(v[16], 0.4); }
    else if (kind === "walk") cycle(v, ph, 0.7);
    else if (kind === "jump") {
      v[5] = 8; v[1] = 3.05;
      v[6] = 0.35; v[7] = 5.25; v[8] = 0.35; v[9] = -0.35; v[10] = 5.25; v[11] = 0.35;
      v[13] = 1.15; v[14] = 0.45; v[16] = 0.85; v[17] = 0.15;
    } else if (kind === "start") {
      v[1] = 2.75; v[5] = 26; v[13] = 0.4; v[14] = -0.4; v[16] = 0.25; v[17] = 0.5;
      v[7] = 2.85; v[8] = -0.15; v[10] = 2.95; v[11] = 0.4;
    } else if (kind === "cheer") {
      const h = Math.abs(Math.sin(ph * 7));
      v[1] = 3.02 + h * 0.2; v[5] = 2;
      v[6] = 0.5; v[7] = 5.4; v[8] = 0.2; v[9] = -0.5; v[10] = 5.4; v[11] = 0.2;
      v[13] = 0.16 + (1 - h) * 0.4; v[16] = 0.16 + (1 - h) * 0.4;
    } else if (kind === "slump") {
      const h = Math.abs(Math.sin(ph * 8));
      v[1] = 2.95 + h * 0.16; v[5] = 16;
      v[6] = 0.32; v[7] = 5.05; v[8] = 0.05; v[9] = -0.32; v[10] = 5.05; v[11] = 0.05;
    } else if (kind === "sit") {
      v[1] = 2.05; v[5] = 8;
      v[12] = 0.4; v[13] = 0.9; v[14] = 1.15; v[15] = -0.4; v[16] = 0.9; v[17] = 1.15;
      v[6] = 0.55; v[7] = 2.5; v[8] = 0.8; v[9] = -0.55; v[10] = 2.5; v[11] = 0.8;
    } else if (kind === "throne") {
      v[1] = 2.02; v[5] = 2;
      v[12] = 0.5; v[13] = 0.82; v[14] = 0.9; v[15] = -0.5; v[16] = 0.82; v[17] = 0.9;
      v[6] = 0.95; v[7] = 2.25; v[8] = 0.25;
      v[9] = -0.95; v[10] = 2.25; v[11] = 0.25;
      v[18] = 0;
    } else if (kind === "wave") {
      const w = Math.sin(ph * 5);
      v[9] = -0.85; v[10] = 4.65 + w * 0.28; v[11] = 0.25;
      v[18] = 8;
    } else if (kind === "phone") {
      v[5] = 4;
      v[9] = -0.42; v[10] = 5.45; v[11] = 0.42;
      v[6] = 0.55; v[7] = 2.7; v[8] = 0.28;
      v[18] = -18;
      v[1] += Math.sin((P.phase + t) * 1.4) * 0.015;
    } else if (kind === "mop") {
      cycle(v, ph * 0.35, 0.2);
      const s = Math.sin(ph * 3);
      v[5] = 12; v[9] = -0.5; v[10] = 1.65 + s * 0.4; v[11] = 1.2;
    } else if (kind === "spray") {
      const s = Math.sin(ph * 6);
      v[5] = 4; v[9] = -0.28; v[10] = 3.3 + s * 0.06; v[11] = 1.5; v[18] = -18;
      v[1] += Math.sin(ph * 1.4) * 0.015;
    } else {
      v[1] += Math.sin((P.phase + t) * 1.6) * 0.02;
      v[8] += Math.sin(t * 1.1) * 0.08; v[11] += Math.sin(t * 1.1 + 1) * 0.08;
      if (kind === "idle" && Math.sin(t * 0.7 + P.phase) > 0.55) { v[9] = -0.85; v[10] = 4.5; v[11] = 0.3; }
    }
    applyPose(TMP, P.F, v);
    if (kind === "slump") P.F.head.rotation.x = 0.35;
    else if (kind === "run" || kind === "skate") P.F.head.rotation.x = 0.12;
    else P.F.head.rotation.x = 0;
    if (P.face) {
      P.blink -= 0.016;
      let lid = 0;
      if (P.blink < 0.12) lid = 1 - Math.abs(P.blink - 0.06) / 0.06;
      if (P.blink < 0) P.blink = 2.2 + Math.random() * 3;
      P.face.lids.forEach(function (l) { l.scale.y = 0.018 + lid * 0.07; });
    }
    if (P.wheels) for (let i = 0; i < P.wheels.length; i++) P.wheels[i].rotation.x = ph * 4;
  }

  return { person: person, pose: pose, pho: pho, wear: wear, rb: rb, chunk: chunk, G: G };
}
