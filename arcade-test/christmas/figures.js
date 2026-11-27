/* People in Mall Santa Dash are 16-bit sprites (see pixels.js), not meshes.
   pose() flips the nearest-filtered frame. Props can share the same billboards. */
export function createCast(T) {
  const Pix = window.MSDPix;
  const N = 11;
  const texCache = new Map();

  function texOf(canvas) {
    if (texCache.has(canvas)) return texCache.get(canvas);
    const t = new T.CanvasTexture(canvas);
    t.magFilter = T.NearestFilter;
    t.minFilter = T.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = T.SRGBColorSpace;
    t.needsUpdate = true;
    texCache.set(canvas, t);
    return t;
  }

  function billboard(canvas, height, anchor) {
    const mat = new T.SpriteMaterial({
      map: texOf(canvas), transparent: true, alphaTest: 0.45, depthWrite: true, fog: true
    });
    const s = new T.Sprite(mat);
    const aspect = canvas.width / canvas.height;
    s.scale.set(height * aspect, height, 1);
    s.center.set(0.5, anchor === "mid" ? 0.5 : 0);
    s.userData.h = height;
    return s;
  }

  function framesFor(o) {
    const out = [];
    for (let i = 0; i < N; i++) out.push(texOf(Pix.frame(o, i)));
    return out;
  }

  function person(o) {
    o = Object.assign({}, o || {});
    const role = Pix.roleOf(o);
    const tall = role === "santa";
    const baseH = tall ? 2.02 : 1.82;
    const h = baseH * (o.scale || 1) * (o.bulk || 1);
    const aspect = tall ? Pix.SW / Pix.SH : Pix.W / Pix.H;
    let frames = framesFor(o);
    const mat = new T.SpriteMaterial({
      map: frames[0], transparent: true, alphaTest: 0.4, depthWrite: true, fog: true
    });
    const sprite = new T.Sprite(mat);
    sprite.scale.set(h * aspect, h, 1);
    sprite.center.set(0.5, 0);
    const root = new T.Group();
    root.add(sprite);
    const emissive = new T.Color(0x2fd0ff);
    const dummyQ = { copy: function () {} };
    const P = {
      g: root, sprite: sprite, frames: frames, opts: o, phase: Math.random() * 6,
      shoeId: "plain",
      shoeL: { material: [{ emissive: emissive }] },
      shoeR: { material: [{ emissive: emissive }] },
      wheels: [{ visible: false }, { visible: false }, { visible: false }],
      grip: new T.Group(),
      head: new T.Group(),
      F: {
        hand: [
          { position: { x: -0.2, y: 0.9, z: 0.1 }, quaternion: dummyQ },
          { position: { x: 0.22, y: 0.9, z: 0.15 }, quaternion: dummyQ }
        ],
        body: { scale: { x: 1 } }
      }
    };
    root.add(P.grip);
    P.setShoes = function (id) {
      P.shoeId = id || "plain";
      const col = id === "strap" ? "#ff3fa4" : id === "skates" ? "#9bff3f" : id === "lightup" ? "#3ff0ff" : "#eceae2";
      const sole = id === "plain" ? "#c2304a" : "#241c16";
      function bake(color, skates) {
        return framesFor(Object.assign({}, o, { shoes: color, sole: sole, skates: !!skates }));
      }
      if (id === "lightup") {
        P.lightA = bake("#3ff0ff", false);
        P.lightB = bake("#ff3fa4", false);
        P.frames = P.lightA;
      } else {
        P.lightA = P.lightB = null;
        P.frames = bake(col, id === "skates");
      }
      sprite.material.map = P.frames[0];
    };
    return P;
  }

  function pose(P, kind, ph, t) {
    if (!P || !P.frames) return;
    const map = {
      idle: [0, 1], stand: [0, 1],
      walk: [2, 3, 4, 5], run: [2, 3, 4, 5], skate: [2, 3, 4, 5], mop: [2, 3, 4, 5],
      jump: [6], cheer: [7], wave: [7], spray: [7],
      start: [8], slump: [9], sit: [10], throne: [10]
    };
    let idx;
    if (!kind || kind === "idle" || kind === "stand") {
      idx = Math.sin((t || 0) * 1.4 + (P.phase || 0)) > 0.93 ? 1 : 0;
    } else {
      const a = map[kind] || map.idle;
      if (a.length === 1) idx = a[0];
      else {
        const u = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        idx = a[Math.floor((u / (Math.PI * 2)) * a.length) % a.length];
      }
    }
    let set = P.frames;
    if (P.shoeId === "lightup" && P.lightA) {
      set = P.shoeL.material[0].emissive.getHex() === 0xff3fa4 ? P.lightB : P.lightA;
    }
    if (P.sprite.material.map !== set[idx]) P.sprite.material.map = set[idx];
  }

  function pho(col) { return new T.MeshBasicMaterial({ color: new T.Color(col) }); }
  function wear(col) { return pho(col); }
  function rb(w, h, d) { return new T.BoxGeometry(w, h, d); }
  function chunk(parent, geo, mat, x, y, z) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }

  return { person: person, pose: pose, pho: pho, wear: wear, rb: rb, chunk: chunk, billboard: billboard };
}
