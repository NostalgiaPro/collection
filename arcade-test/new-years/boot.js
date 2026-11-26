/* Before the Ball: trophy rows for this hidden test page.
   Loaded after shared/trophy-list.js and before shared/trophies.js, so the
   existing trophy script picks them up. Slots 253-261 were free (live list
   ended at 252). Do not reuse them. seasonal keeps this game out of the
   arcade-wide "every live game" trophies. */
(function () {
  "use strict";
  var L = window.NP_TROPHIES_ARCADE;
  if (!L || !L.games) return;
  var slug = "before-the-ball";
  for (var i = 0; i < L.games.length; i++) if (L.games[i].slug === slug) return;

  function T(n, id, name, how, tier, extra) {
    var t = { n: n, id: id, name: name, how: how, tier: tier, secret: false, slug: slug };
    if (extra) for (var k in extra) t[k] = extra[k];
    return t;
  }
  function end(f) { return { end: f }; }

  L.games.push({
    slug: slug,
    name: "Before the Ball",
    status: "live",
    seasonal: "newyear",
    trophies: [
      T(253, "nye-tape", "Tape's Ready", "Rewind the camcorder before midnight.", "loose", end(function (s) { return !!s.tape; })),
      T(254, "nye-vcr", "The Clock Is Set", "Stop the VCR from blinking 12:00.", "loose", end(function (s) { return !!s.vcr; })),
      T(255, "nye-modem", "Handshake Complete", "Get the computer through the dial-up handshake.", "loose", end(function (s) { return !!s.pc; })),
      T(256, "nye-stash", "Party Stash", "Grab all 3 noisemakers and the confetti popper in one run.", "boxed", {
        goal: { stat: "noise", at: 3, unit: "noisemakers", one: "noisemaker", margin: 2 },
        end: function (s) { return s.noise >= 3 && !!s.popper; }
      }),
      T(257, "nye-clean", "Quiet Room", "Clear any room without a glitch hit.", "boxed"),
      T(258, "nye-mom", "She's On the Phone", "Get past Mom without bumping her.", "boxed", end(function (s) { return !!s.passedMom && !s.momBump; })),
      T(259, "nye-win", "Before the Ball", "Reach the window with all five jobs done before midnight.", "sealed", end(function (s) { return !!s.won; })),
      T(260, "nye-perfect", "Clean Midnight", "Win with every confetti scrap, no glitch hits, and at least 20 seconds left.", "slabbed", end(function (s) {
        return !!s.won && s.hits === 0 && s.bitsAll > 0 && s.bitsGot === s.bitsAll && s.left >= 20;
      })),
      T(261, "nye-hold", "Hold, Please", "Leave the title screen alone for 45 seconds while the VCR blinks 12:00.", "loose", { secret: true })
    ]
  });
})();
