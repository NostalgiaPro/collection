/* Tracks real keyboard and touch state for the driving scene.
   Godot's web export can miss a keyup or a touchcancel. The car reads this
   object and stops steering when the browser says nothing is held. */
(function () {
  var keys = {};
  var pointers = {};
  var touches = 0;
  function publish() {
    var n = 0;
    for (var id in pointers) if (pointers[id]) n++;
    window.__np2input = {
      keys: keys,
      contacts: Math.max(n, touches),
      blur: (document.hidden || !document.hasFocus()) ? 1 : 0
    };
  }
  window.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    keys[e.code] = 1;
    publish();
  }, true);
  window.addEventListener("keyup", function (e) {
    keys[e.code] = 0;
    publish();
  }, true);
  function clearAll() {
    keys = {};
    pointers = {};
    touches = 0;
    publish();
  }
  window.addEventListener("blur", clearAll, true);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearAll();
    else publish();
  }, true);
  window.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse") return;
    pointers[e.pointerId] = 1;
    publish();
  }, true);
  function pointerEnd(e) {
    if (e.pointerType === "mouse") return;
    delete pointers[e.pointerId];
    publish();
  }
  window.addEventListener("pointerup", pointerEnd, true);
  window.addEventListener("pointercancel", pointerEnd, true);
  window.addEventListener("touchstart", function (e) {
    touches = e.touches.length;
    publish();
  }, true);
  window.addEventListener("touchend", function (e) {
    touches = e.touches.length;
    if (touches === 0) pointers = {};
    publish();
  }, true);
  window.addEventListener("touchcancel", function (e) {
    touches = e.touches ? e.touches.length : 0;
    pointers = {};
    publish();
  }, true);
  publish();
})();
