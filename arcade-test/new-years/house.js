/* 3D house for Before the Ball. People come from figures.js (the Creature Feature KO /
   Mall Santa Dash rig). Rooms are a 1999 house: den, hall computer, stairs, living room
   window with the city and the ball. */
const SCALE = 46;
const VSCALE = 88;
const CAST = /[?&]cast=1(?:&|$)/.test(location.search);
const CAST_HERO = /[?&]cast=hero(?:&|$)/.test(location.search);

export function createHouse(T, Cast, ROOMS, FLOOR) {
  const px = function (x) { return (x - 180) / SCALE; };
  const py = function (y) { return (FLOOR - y) / VSCALE; };

  const gl = document.createElement("canvas");
  gl.setAttribute("aria-hidden", "true");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const renderer = new T.WebGLRenderer({
    canvas: gl, antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true
  });
  renderer.setClearColor(0x100c18, 1);
  if (T.SRGBColorSpace && "outputColorSpace" in renderer) renderer.outputColorSpace = T.SRGBColorSpace;

  const scene = new T.Scene();
  scene.background = new T.Color(0x241c2e);
  scene.fog = new T.Fog(0x241c2e, 18, 36);
  const cam = new T.PerspectiveCamera(46, 360 / 540, 0.08, 50);

  scene.add(new T.HemisphereLight(0xfff6ea, 0x4a3458, 1.55));
  const key = new T.DirectionalLight(0xffe2b8, 2.4); key.position.set(-2.2, 5.2, 4.2); scene.add(key);
  const fill = new T.DirectionalLight(0xc5dcff, 0.85); fill.position.set(3.2, 2.6, 3); scene.add(fill);
  const lamp = new T.PointLight(0xffc56a, 0, 12, 1.4); scene.add(lamp);
  const tvGlow = new T.PointLight(0x9ec4ff, 0, 6, 1.6); scene.add(tvGlow);

  const mats = {};
  function M(col, o) {
    const key = col + (o ? JSON.stringify(o) : "");
    if (mats[key]) return mats[key];
    const p = { color: new T.Color(col) };
    if (o && o.emissive) { p.emissive = new T.Color(o.emissive); p.emissiveIntensity = o.em || 0.8; }
    mats[key] = new T.MeshLambertMaterial(p);
    return mats[key];
  }
  const stageFloor = new T.Mesh(new T.CircleGeometry(4.2, 28), M("#241c30"));
  stageFloor.rotation.x = -Math.PI / 2; stageFloor.position.y = -0.02; scene.add(stageFloor);
  function box(parent, w, h, d, mat, x, y, z) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  }
  function cyl(parent, rt, rb, h, mat, x, y, z) {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, 12), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  }

  function screenTex(paint) {
    const cv = document.createElement("canvas"); cv.width = 160; cv.height = 100;
    const g = cv.getContext("2d");
    const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
    tx.userData = { paint: paint, g: g, cv: cv };
    return tx;
  }
  function paintScreen(tx) { tx.userData.paint(tx.userData.g, tx.userData.cv); tx.needsUpdate = true; }

  const kid = Cast.person({
    party: true, pants: "#243456", sleeves: "long", hat: "party", hatc: "#ffd23f", collar: "#f6f1e6",
    skin: "#f1c28e", hair: "#4a2f1c", hairStyle: "short", shoes: "#f7f4ee", sole: "#1a140e",
    scale: 1.05, mouth: "smile"
  });
  const mom = Cast.person({
    coat: true, robe: true, shirt: "#7a2844", sleeves: "long", hair: "#6b3418", hairStyle: "bun",
    skin: "#f1c28e", phone: true, horn: true, slippers: true, shoes: "#e7b3c0", sole: "#b56d80", belt: 0xe7c9a2,
    scale: 1.12, bulk: 1.02, armBulk: 0.86, legBulk: 1.34, mouth: "smile", browTilt: 0.04
  });
  const guestA = Cast.person({
    shirt: "#c46a32", pants: "#241c18", sleeves: "short", collar: "#f4e6d4",
    hair: "#2a160e", hairStyle: "bun", skin: "#a86b45",
    shoes: "#1b1b22", sole: "#3a2418", scale: 0.98, bulk: 0.94, mouth: "smile"
  });
  const guestB = Cast.person({
    shirt: "#14343c", pants: "#1c2a44", hat: "party", hatc: "#3ec8e0", collar: "#efe8dc",
    hair: "#1b1b22", hairStyle: "short", skin: "#c68642", shoes: "#eceae2", sole: "#1a140e",
    sleeves: "long", scale: 1.04, mouth: "smile"
  });
  const collector = Cast.person({
    tee: true, pants: "#2a3a62", shorts: true, sleeves: "short", hat: "cap", capc: "#1d2b53",
    skin: "#f1c28e", hair: "#4a2f1c", hairStyle: "short", pockets: true,
    shoes: "#f7f4ee", sole: "#1a140e", scale: 1.05, mouth: "smile"
  });
  [kid, mom, guestA, guestB, collector].forEach(function (p) { scene.add(p.g); p.g.visible = false; });

  const shadowGeo = new T.CircleGeometry(0.32, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  function shadow() { const m = new T.Mesh(shadowGeo, shadowMat); m.position.y = 0.02; scene.add(m); return m; }
  const shKid = shadow(), shMom = shadow(), shA = shadow(), shB = shadow();

  function crt(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    box(g, 1.15, 0.86, 0.42, M("#241c16"), 0, 0.5, 0);
    box(g, 0.96, 0.62, 0.06, M("#070b12"), 0, 0.52, 0.2);
    const tx = screenTex(function (c) {
      c.fillStyle = "#071018"; c.fillRect(0, 0, 160, 100);
      c.strokeStyle = "#1a3048"; c.lineWidth = 2;
      for (let i = 8; i < 100; i += 6) { c.beginPath(); c.moveTo(8, i); c.lineTo(152, i); c.stroke(); }
      c.fillStyle = "#9aa0aa"; c.fillRect(78, 18, 2, 48);
      c.fillStyle = "#ffd23f"; c.beginPath(); c.arc(80, 28, 8, 0, Math.PI * 2); c.fill();
    });
    paintScreen(tx);
    const scr = new T.Mesh(new T.PlaneGeometry(0.9, 0.56), new T.MeshBasicMaterial({ map: tx }));
    scr.position.set(0, 0.52, 0.24); g.add(scr);
    box(g, 0.28, 0.08, 0.22, M("#1a140e"), 0, 0.02, 0.02);
    return g;
  }
  function vcrUnit(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    box(g, 0.72, 0.22, 0.36, M("#14141c"), 0, 0.12, 0);
    box(g, 0.28, 0.1, 0.02, M("#0a0a10"), -0.14, 0.12, 0.18);
    const led = new T.Mesh(new T.PlaneGeometry(0.28, 0.08), new T.MeshBasicMaterial({ color: 0xff2a22 }));
    led.position.set(0.16, 0.13, 0.185); g.add(led);
    g.userData.led = led;
    return g;
  }
  function pcSet(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    box(g, 0.78, 0.58, 0.5, M("#d9d0be"), -0.15, 0.42, 0);
    box(g, 0.62, 0.4, 0.04, M("#1a1408"), -0.15, 0.44, 0.26);
    const tx = screenTex(function (c, cv) {
      const label = g.userData.label || "OFF";
      c.fillStyle = "#1a1206"; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = "#e6a23c"; c.font = "700 28px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(label, cv.width / 2, cv.height / 2);
    });
    paintScreen(tx);
    const scr = new T.Mesh(new T.PlaneGeometry(0.56, 0.34), new T.MeshBasicMaterial({ map: tx }));
    scr.position.set(-0.15, 0.44, 0.29); g.add(scr); g.userData.tx = tx;
    box(g, 0.22, 0.06, 0.16, M("#b7ad98"), -0.15, 0.1, 0.08);
    box(g, 0.28, 0.62, 0.42, M("#e4dcc8"), 0.48, 0.36, 0);
    box(g, 0.16, 0.08, 0.02, M("#1b1b22"), 0.48, 0.5, 0.22);
    const modem = new T.Group(); modem.position.set(0.48, 0.02, 0.36); g.add(modem);
    box(modem, 0.42, 0.1, 0.28, M("#cfc6b4"), 0, 0.06, 0);
    [-0.1, 0, 0.1].forEach(function (ox, i) {
      const led = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), new T.MeshBasicMaterial({ color: i === 2 ? 0x3fd07a : 0xffd23f }));
      led.position.set(ox, 0.08, 0.14); modem.add(led);
    });
    return g;
  }
  function camCorder(parent, x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
    box(g, 0.28, 0.16, 0.16, M("#2a2d38"), 0, 0.1, 0);
    cyl(g, 0.05, 0.06, 0.1, M("#1a1c22"), 0.16, 0.1, 0).rotation.z = Math.PI / 2;
    const led = new T.Mesh(new T.SphereGeometry(0.02, 8, 6), new T.MeshBasicMaterial({ color: 0xff3a30 }));
    led.position.set(-0.08, 0.16, 0.06); g.add(led); g.userData.led = led;
    return g;
  }
  function city(parent) {
    const g = new T.Group(); parent.add(g);
    const sky = new T.Mesh(new T.PlaneGeometry(8, 3.2), M("#1a2748"));
    sky.position.set(0, 1.5, -0.4); g.add(sky);
    const heights = [0.7, 1.15, 0.85, 1.45, 0.6, 1.05, 0.9, 1.3];
    let x = -3.2;
    for (let i = 0; i < heights.length; i++) {
      const w = 0.55 + (i % 3) * 0.12, h = heights[i];
      const b = box(g, w, h, 0.3, M(i % 2 ? "#2c3a62" : "#243456"), x, h / 2, 0);
      const cv = document.createElement("canvas"); cv.width = 32; cv.height = 64;
      const c = cv.getContext("2d"); c.fillStyle = "#243456"; c.fillRect(0, 0, 32, 64);
      for (let yy = 4; yy < 60; yy += 7) for (let xx = 3; xx < 28; xx += 6) {
        c.fillStyle = ((xx + yy + i) % 9 > 4) ? "#ffe08a" : "#1a2744";
        c.fillRect(xx, yy, 2, 3);
      }
      const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
      const face = new T.Mesh(new T.PlaneGeometry(w * 0.92, h * 0.92), new T.MeshBasicMaterial({ map: tx }));
      face.position.set(0, 0, 0.16); b.add(face);
      x += w + 0.12;
    }
    const pole = cyl(g, 0.03, 0.03, 1.5, M("#9aa0aa"), 0.2, 1.7, 0.2);
    const ball = new T.Mesh(new T.SphereGeometry(0.34, 20, 14), new T.MeshPhongMaterial({ color: 0xffd23f, shininess: 90, specular: 0xfff6c8, emissive: 0xffd23f, emissiveIntensity: 0.45 }));
    ball.position.set(-0.95, 2.45, 0.15); g.add(ball);
    g.userData.ball = ball; g.userData.pole = pole;
    return g;
  }

  const lookMat = {
    wood: M("#8a5a32"), couch: M("#8a3050"), stand: M("#3a3228"),
    shelf: M("#6a4a30"), desk: M("#d9cbb0"), table: M("#7a4e32")
  };
  const rooms = {};
  ROOMS.forEach(function (R) {
    const g = new T.Group(); g.visible = false; scene.add(g);
    const wall = R.id === "den" ? "#6e4c32" : R.id === "kitchen" ? "#4a3860" : R.id === "hall" ? "#3a3450" : R.id === "stairs" ? "#3a281c" : "#2a2244";
    const floor = R.id === "den" ? "#5a4638" : R.id === "kitchen" ? "#7a5a3c" : "#4a382e";
    box(g, 9.2, 0.12, 3.4, M(floor), 0, -0.06, 0.2);
    box(g, 9.2, 3.4, 0.12, M(wall), 0, 1.7, -1.7);
    box(g, 0.12, 3.4, 3.2, M(wall), -4.5, 1.7, 0);
    box(g, 0.12, 3.4, 3.2, M(wall), 4.5, 1.7, 0);
    R.platforms.forEach(function (p) {
      const w = p.w / SCALE, h = 0.16, y = py(p.y) - h / 2;
      box(g, w, h, 0.55, lookMat[p.look] || lookMat.wood, px(p.x + p.w / 2), y, -0.78);
      const top = new T.Mesh(new T.BoxGeometry(w, 0.03, 0.55), M("#e6d2a8"));
      top.position.set(px(p.x + p.w / 2), py(p.y) - 0.01, -0.78); g.add(top);
    });
    if (R.id === "kitchen") {
      box(g, 0.7, 1.5, 0.55, M("#f4f1ea"), px(320), 0.75, -1.15);
      box(g, 0.5, 0.7, 0.04, M("#d0cbc0"), px(320), 0.9, -0.86);
      box(g, 8.4, 0.42, 0.35, M("#5a4030"), 0, 2.55, -1.4);
    }
    if (R.id === "den") {
      crt(g, px(190), py(310), -0.85);
      const v = vcrUnit(g, px(210), py(310) - 0.28, -0.55);
      g.userData.vcr = v;
      const shade = new T.Mesh(new T.SphereGeometry(0.22, 16, 12), new T.MeshBasicMaterial({ color: 0xffe2a8 }));
      shade.position.set(px(318), 1.7, -1.1); g.add(shade);
      cyl(g, 0.04, 0.05, 0.7, M("#6b5030"), px(318), 1.15, -1.1);
    }
    if (R.id === "hall") {
      const pc = pcSet(g, px(300), py(362), -0.35);
      g.userData.pc = pc;
    }
    if (R.id === "stairs") {
      box(g, 1.1, 0.7, 0.08, M("#9fd7ff"), px(300), 2.15, -1.55);
      box(g, 0.9, 0.5, 0.02, M("#0c1428"), px(300), 2.15, -1.5);
    }
    if (R.id === "living") {
      const frame = new T.Group(); frame.position.set(px(305), 1.5, -1.4); g.add(frame);
      const wood = M("#cbb892");
      box(frame, 2.7, 0.16, 0.1, wood, 0, 0.78, 0);
      box(frame, 2.7, 0.16, 0.1, wood, 0, -0.78, 0);
      box(frame, 0.16, 1.72, 0.1, wood, -1.27, 0, 0);
      box(frame, 0.16, 1.72, 0.1, wood, 1.27, 0, 0);
      const win = city(frame);
      win.position.set(0, -0.55, -0.28);
      win.scale.set(0.46, 0.46, 0.46);
      g.userData.city = win;
      for (let i = 0; i < 10; i++) {
        const bulb = new T.Mesh(new T.SphereGeometry(0.045, 8, 6), new T.MeshBasicMaterial({ color: [0xffd23f, 0xff3fa4, 0x3ff0ff, 0x9bff3f][i % 4] }));
        bulb.position.set(-3.2 + i * 0.7, 2.55, -0.8); g.add(bulb);
      }
      const cam = camCorder(g, px(50), py(370), 0.15);
      g.userData.cam = cam;
    }
    const door = new T.Mesh(new T.BoxGeometry(0.18, 1.7, 0.08), M("#4a301c"));
    door.position.set(px(340), 0.85, 0.2); g.add(door); g.userData.door = door;
    rooms[R.id] = g;
  });

  const hornGeo = new T.LatheGeometry([0, 0.02, 0.08, 0.16, 0.22].map(function (y, i) {
    const r = [0.02, 0.035, 0.05, 0.09, 0.12][i];
    return new T.Vector2(r, y);
  }), 10);
  const popGeo = new T.CylinderGeometry(0.04, 0.05, 0.22, 8);
  const bitGeo = new T.BoxGeometry(0.08, 0.035, 0.02);
  const bulbGeo = new T.SphereGeometry(0.07, 10, 8);
  const itemRoot = new T.Group(); scene.add(itemRoot);
  const hazardRoot = new T.Group(); scene.add(hazardRoot);
  const confetti = [];
  const colors = [0xffd23f, 0xff3fa4, 0x3ff0ff, 0x9bff3f, 0xff4b3e];
  for (let i = 0; i < 48; i++) {
    const m = new T.Mesh(bitGeo, new T.MeshBasicMaterial({ color: colors[i % colors.length] }));
    m.visible = false; scene.add(m); confetti.push(m);
  }
  const zeroPool = [], dropPool = [], barPool = [];
  function zeroMesh() {
    const g = new T.Group();
    const mat = new T.MeshBasicMaterial({ color: 0xff3a30 });
    const a = new T.Mesh(new T.TorusGeometry(0.09, 0.028, 6, 12), mat);
    const b = new T.Mesh(new T.TorusGeometry(0.09, 0.028, 6, 12), mat);
    a.position.x = -0.12; b.position.x = 0.12; g.add(a); g.add(b);
    const spark = new T.Mesh(new T.BoxGeometry(0.06, 0.03, 0.02), new T.MeshBasicMaterial({ color: 0x3ff0ff }));
    spark.position.set(0.18, 0.08, 0); g.add(spark); g.userData.spark = spark;
    hazardRoot.add(g); return g;
  }
  function dropMesh() {
    const g = new T.Group();
    box(g, 0.42, 0.28, 0.06, M("#1c3c8a"), 0, 0, 0);
    box(g, 0.42, 0.06, 0.02, M("#9ec0ff"), 0, 0.11, 0.03);
    const face = new T.Mesh(new T.PlaneGeometry(0.2, 0.08), new T.MeshBasicMaterial({ color: 0xe8eeff }));
    face.position.set(0, -0.04, 0.04); g.add(face);
    hazardRoot.add(g); return g;
  }
  function barMesh() {
    const m = new T.Mesh(new T.BoxGeometry(8.6, 0.16, 0.08), new T.MeshBasicMaterial({ color: 0xd8fff8, transparent: true, opacity: 0.55 }));
    hazardRoot.add(m); return m;
  }

  function placePerson(p, sh, x, feetY, face, kind, t) {
    p.g.visible = true;
    const wx = px(x), wy = py(feetY);
    p.g.position.set(wx, wy, 0.2);
    p.g.rotation.y = face > 0 ? -0.55 : 0.55;
    Cast.pose(p, kind, t * (kind === "run" || kind === "walk" ? 8 : 2), t);
    if (sh) { sh.visible = true; sh.position.set(wx, wy + 0.02, 0.2); }
  }
  function placeCast(p, sh, x, rot, kind, t) {
    p.g.visible = true;
    p.g.position.set(x, 0, 0);
    p.g.rotation.y = rot;
    Cast.pose(p, kind, t * 2, t);
    if (sh) { sh.visible = true; sh.position.set(x, 0.02, 0); }
  }

  let builtItems = "";
  function syncItems(S, R) {
    const key = R.id + ":" + S.items.length + ":" + (S.bulbs ? S.bulbs.length : 0);
    if (builtItems !== key) {
      builtItems = key;
      while (itemRoot.children.length) itemRoot.remove(itemRoot.children[0]);
      S.items.forEach(function (it) {
        const m = new T.Mesh(it.kind === "horn" ? hornGeo : popGeo, M(it.kind === "horn" ? "#ffd23f" : "#ff3fa4"));
        if (it.kind === "horn") m.rotation.z = -0.6;
        m.userData.ref = it; itemRoot.add(m);
      });
      (S.bits || []).forEach(function (b, i) {
        const m = new T.Mesh(bitGeo, new T.MeshBasicMaterial({ color: colors[i % colors.length] }));
        m.userData.ref = b; itemRoot.add(m);
      });
      (S.bulbs || []).forEach(function (b, i) {
        const m = new T.Mesh(bulbGeo, new T.MeshBasicMaterial({ color: colors[i % colors.length] }));
        m.userData.ref = b; m.userData.bulb = 1; itemRoot.add(m);
      });
    }
    for (let i = 0; i < itemRoot.children.length; i++) {
      const m = itemRoot.children[i], ref = m.userData.ref;
      if (!ref) continue;
      m.visible = !ref.got;
      m.position.set(px(ref.x), py(ref.y) + (m.userData.bulb ? 0.05 : 0.12), 0.2);
      m.rotation.y += 0.02;
    }
  }

  function syncHazards(S, t) {
    while (zeroPool.length < S.glitches.length) zeroPool.push(zeroMesh());
    while (dropPool.length < S.drops.length) dropPool.push(dropMesh());
    while (barPool.length < S.bars.length) barPool.push(barMesh());
    zeroPool.forEach(function (m, i) { m.visible = i < S.glitches.length; });
    dropPool.forEach(function (m, i) { m.visible = i < S.drops.length; });
    barPool.forEach(function (m, i) { m.visible = i < S.bars.length; });
    S.glitches.forEach(function (g, i) {
      const m = zeroPool[i];
      m.position.set(px(g.x), py(g.y) + 0.18, 0.35);
      m.userData.spark.position.x = 0.18 + Math.sin(t * 20 + g.x) * 0.05;
    });
    S.drops.forEach(function (d, i) {
      const m = dropPool[i];
      const y = d.warn > 0 ? py(80) : py(d.y);
      m.position.set(px(d.x + 18), y + 0.14, 0.4);
      m.visible = d.splat ? d.splat > 0.05 : true;
    });
    S.bars.forEach(function (b, i) {
      const m = barPool[i];
      m.position.set(0, py(b.y) , 0.3);
      m.material.opacity = b.t > b.warn ? 0.72 : 0.28;
    });
  }

  function sync(state, t, S) {
    const castMode = CAST || CAST_HERO;
    kid.g.visible = mom.g.visible = guestA.g.visible = guestB.g.visible = collector.g.visible = false;
    shKid.visible = shMom.visible = shA.visible = shB.visible = false;
    Object.keys(rooms).forEach(function (id) { rooms[id].visible = false; });
    itemRoot.visible = !castMode;
    hazardRoot.visible = !castMode;

    if (castMode) {
      scene.fog.near = 12; scene.fog.far = 24;
      if (CAST_HERO) {
        placeCast(kid, shKid, -0.78, 0.08, "idle", t);
        placeCast(collector, null, 0.78, -0.08, "idle", t);
        cam.fov = 36; cam.position.set(0, 1.15, 5.5); cam.lookAt(0, 1.05, 0);
      } else {
        placeCast(kid, shKid, -1.05, 0, "waveR", t);
        placeCast(mom, shMom, 0, 0, "horn", t);
        placeCast(guestA, shA, 1.05, 0, "hips", t);
        guestB.g.visible = false;
        cam.fov = 38; cam.position.set(0, 1.15, 8.9); cam.lookAt(0, 1.02, 0);
      }
      cam.updateProjectionMatrix();
      return;
    }

    if (!S) return;
    const R = ROOMS[S.room];
    const roomG = rooms[R.id];
    if (roomG) roomG.visible = true;
    const playing = state === "playing" || state === "paused" || state === "over";
    const finale = S.phase === "finale" || (S.won && state !== "playing" && state !== "paused");
    let kind = "idle";
    if (playing && S.phase === "play") {
      if (!S.ground) kind = "jump";
      else if (Math.abs(S.vx) > 20) kind = "run";
    } else if (finale) kind = "cheer";
    if (S.inv > 0 && Math.sin(t * 40) > 0 && S.phase === "play") kid.g.visible = false;
    else placePerson(kid, shKid, S.x, S.phase === "finale" ? FLOOR - Math.abs(Math.sin(S.finT * 8)) * 10 : S.y, S.face || 1, kind, t + S.walk);

    if (S.mom && S.phase !== "finale") {
      const moving = Math.abs(S.mom.vx) > 1;
      placePerson(mom, shMom, S.mom.x, FLOOR, S.mom.vx >= 0 ? 1 : -1, "phone", t);
      if (moving) mom.g.rotation.y = S.mom.vx >= 0 ? -1.2 : 1.2;
    }
    if (R.id === "living") {
      const bob = finale ? Math.abs(Math.sin(t * 8)) * 8 : 2;
      placePerson(guestA, shA, 78, FLOOR - bob, 1, finale ? "cheer" : "idle", t);
      placePerson(guestB, shB, 148, FLOOR - bob * 0.7, -1, finale ? "cheer" : "wave", t);
    }
    syncItems(S, R);
    syncHazards(S, t);

    if (roomG && roomG.userData.vcr) {
      const led = roomG.userData.vcr.userData.led;
      const on = S.jobs.vcr || Math.floor(t * 2) % 2 === 0;
      led.visible = !!on;
    }
    if (roomG && roomG.userData.pc) {
      const label = S.jobs.pc ? "OK!" : (S.jobs.pcOn ? "DIAL" : "OFF");
      if (roomG.userData.pc.userData.label !== label) {
        roomG.userData.pc.userData.label = label;
        paintScreen(roomG.userData.pc.userData.tx);
      }
    }
    if (roomG && roomG.userData.cam) {
      roomG.userData.cam.userData.led.material.color.set(S.jobs.tape ? 0x9bff3f : 0xff3a30);
    }
    if (roomG && roomG.userData.city) {
      const ball = roomG.userData.city.userData.ball;
      const drop = finale ? Math.min(1, (S.finT || 0) / 2.3) : 0;
      ball.position.y = 2.55 - drop * 1.35 + (finale ? 0 : Math.sin(t) * 0.04);
    }
    if (roomG && roomG.userData.door) {
      const open = R.door && (R.id === "stairs" ? (S.ground && S.y <= 280) : (R.id === "kitchen" ? S.jobs.noise >= 3 : R.id === "den" ? S.jobs.vcr : S.jobs.pc));
      roomG.userData.door.material = open ? M("#ffd23f", { emissive: "#8a6a10", em: 0.5 }) : M("#4a301c");
      roomG.userData.door.visible = !!R.door;
    }
    const inDen = R.id === "den";
    lamp.intensity = inDen ? 48 : R.id === "living" ? 18 : 8;
    lamp.position.set(px(inDen ? 300 : 70), inDen ? 1.75 : 2.05, 0.85);
    tvGlow.intensity = inDen ? 28 : (R.id === "living" ? 8 : 0);
    tvGlow.position.set(inDen ? px(190) : px(220), inDen ? py(310) + 0.55 : 1.45, inDen ? 0.15 : 0.5);

    confetti.forEach(function (m, i) {
      if (!finale) { m.visible = false; return; }
      m.visible = true;
      const u = ((t * 0.35 + i * 0.07) % 1);
      m.position.set(px(40 + (i * 37) % 280), 2.6 - u * 2.8, 0.4 + (i % 5) * 0.08);
      m.rotation.z = t + i;
    });

    const fx = px(S.x), fy = py(Math.min(S.y, FLOOR));
    if (finale) {
      cam.fov = 42;
      cam.position.set(px(200), 1.65, 7.8);
      cam.lookAt(px(270), 1.2, -0.7);
    } else {
      const face = S.face || 1;
      cam.fov = 46;
      cam.position.set(fx, fy + 1.7, 8.2);
      cam.lookAt(fx + face * 0.45, fy + 1.05, -0.35);
    }
    cam.updateProjectionMatrix();
  }

  return { gl: gl, renderer: renderer, scene: scene, cam: cam, sync: sync, cast: CAST || CAST_HERO };
}
