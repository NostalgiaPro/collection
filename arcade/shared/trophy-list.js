/* Arcade trophy list. Names and unlock text live only here.
   ids and n (code slot) never change; append new ones with the next n; retire with retired: true. */
(function () {
  "use strict";
  function T(n, id, name, how, tier, extra) {
    var t = { n: n, id: id, name: name, how: how, tier: tier, secret: false };
    if (extra) for (var k in extra) t[k] = extra[k];
    return t;
  }
  function end(f) { return { end: f }; }
  function every(a, f) { for (var i = 0; i < a.length; i++) if (!f(a[i], i)) return false; return a.length > 0; }

  var games = [
    { slug: "shelf-links", name: "Shelf Links", status: "live", trophies: [
      T(0, "sl-round", "Nine Holes, No Refunds", "Finish a full 9-hole round.", "loose", end(function (s) { return s.holes >= 9; })),
      T(1, "sl-ace", "Ace, Still in Shrink Wrap", "Get a hole-in-one (ACE!) on any hole.", "boxed"),
      T(2, "sl-par", "Priced at Par", "Finish a round at E or better (28 strokes or fewer).", "boxed", { goal: { stat: "rel", at: 0, low: true, margin: 3, unit: "strokes", one: "stroke", fromBest: true }, end: function (s) { return s.holes >= 9 && s.rel <= 0; } }),
      T(3, "sl-peanut", "Peanut Free", "Finish Packing Peanut Pit (hole 3) without the ball touching the packing peanuts.", "boxed"),
      T(4, "sl-dry", "Kept the Box Dry", "Finish a full round without one spilled soda splash.", "boxed", end(function (s) { return s.holes >= 9 && s.splashes === 0; })),
      T(5, "sl-gauntlet", "Ran the Gauntlet, Box Still Mint", "Make par or better on Mint Condition Gauntlet (hole 9).", "sealed"),
      T(6, "sl-under3", "Under Sticker Price", "Finish a round at -3 or better.", "sealed", { goal: { stat: "rel", at: -3, low: true, margin: 3, unit: "strokes", one: "stroke", fromBest: true }, end: function (s) { return s.holes >= 9 && s.rel <= -3; } }),
      T(7, "sl-clean", "Clean Scorecard", "Finish a round with no hole over par.", "slabbed", end(function (s) {
        return s.holes >= 9 && every(s.card || [], function (v, i) { return v <= s.par[i]; });
      }))
    ] },
    { slug: "bargain-bin-buckets", name: "Bargain Bin Buckets", status: "live", trophies: [
      T(8, "bbb-ten", "Twenty-Five Cents Well Spent", "Make 10 baskets in one game.", "loose", { goal: { stat: "makes", at: 10, unit: "baskets", one: "basket" }, end: function (s) { return s.makes >= 10; } }),
      T(9, "bbb-swish", "Nothing But Net Worth", "Make a swish (ball touches nothing but net).", "loose"),
      T(10, "bbb-fire", "Pilot Light", "Go ON FIRE (3 makes in a row).", "boxed"),
      T(11, "bbb-bonus", "Overtime, No Extra Charge", "Unlock the bonus round (20 makes in the first 60 seconds).", "boxed"),
      T(12, "bbb-swish5", "Swish List", "Make 5 swishes in one game.", "sealed", { goal: { stat: "swishes", at: 5, unit: "swishes", one: "swish" }, end: function (s) { return s.swishes >= 5; } }),
      T(13, "bbb-streak10", "Ten Straight, No Returns", "Make 10 baskets in a row without a miss.", "sealed"),
      T(14, "bbb-thirty", "The Whole Bin", "Make 30 baskets in one game, bonus round included.", "slabbed", { goal: { stat: "makes", at: 30, unit: "baskets", one: "basket" }, end: function (s) { return s.makes >= 30; } }),
      T(15, "bbb-clock", "Nobody Set the Clock", "Leave the title screen alone for 60 seconds while the VCR clock blinks 12:00.", "loose", { secret: true })
    ] },
    { slug: "bleacher-carts", name: "Bleacher Carts", status: "live", trophies: [
      T(16, "bc-hr", "Cart Launched", "Hit a home run.", "loose"),
      T(18, "bc-board", "Scoreboard Trade-In", "Hit the scoreboard for a bonus pitch.", "loose"),
      T(17, "bc-sign", "Is It On the Sign?", "Hit the \"Is it on the shelf?\" billboard for a bonus pitch.", "boxed"),
      T(19, "bc-feature", "Bleacher Feature Presentation", "Hit 3 home runs in a row (BLEACHER FEATURE).", "boxed"),
      T(20, "bc-moon", "Moonshot, Free Shipping", "Hit a MOONSHOT (470 FT or more).", "boxed"),
      T(21, "bc-bonus3", "Extended Warranty", "Earn 3 bonus pitches in one derby.", "sealed", { retired: true, end: function (s) { return s.bonusEarned >= 3; } }),
      T(22, "bc-double", "Double Feature, One Ticket", "Get 2 Bleacher Features in one derby.", "sealed", { retired: true, end: function (s) { return s.features >= 2; } }),
      T(23, "bc-5000", "Five Thousand Feet of Carts", "Finish a derby with 5,000 FT or more.", "slabbed", { retired: true, end: function (s) { return s.total >= 5000; } }),
      // Retuned Oct 28, 2026 from simulated derbies at human timing spreads (see arcade-build/tune/).
      // Added Oct 28, 2026 (RC): a 6,000 FT stretch goal one notch above a mile (RC best 5,280). Sims: tune/bc6000.js.
      T(70, "bc-6000", "A Mile of Carts, Plus Tax", "Finish a derby with 6,000 FT or more.", "boxed", { goal: { stat: "total", at: 6000, unit: "FT", fromBest: true }, end: function (s) { return s.total >= 6000; } }),
      T(66, "bc-7500", "Seventy-Five Hundred Feet of Carts", "Finish a derby with 7,500 FT or more.", "sealed", { goal: { stat: "total", at: 7500, unit: "FT", fromBest: true }, end: function (s) { return s.total >= 7500; } }),
      T(67, "bc-feat4", "Four Features, No Intermission", "Get 4 Bleacher Features in one derby.", "sealed", { goal: { stat: "features", at: 4, unit: "features", one: "feature" }, end: function (s) { return s.features >= 4; } }),
      T(68, "bc-13000", "Thirteen Thousand Feet of Carts", "Finish a derby with 13,000 FT or more.", "slabbed", { goal: { stat: "total", at: 13000, unit: "FT", fromBest: true }, end: function (s) { return s.total >= 13000; } })
    ] },
    { slug: "tape-pin-lanes", name: "Tape Pin Lanes", status: "live", trophies: [
      T(24, "tpl-strike", "Rewound", "Roll a strike.", "loose"),
      T(25, "tpl-spare", "Picked It Clean", "Pick up a spare.", "loose"),
      T(26, "tpl-latefee", "Paid the Late Fee", "Roll a gutter ball after the bumpers come down (frame 6 or later).", "loose"),
      T(27, "tpl-turkey", "Turkey, Ex-Rental", "Roll 3 strikes in a row (TURKEY!).", "boxed"),
      T(28, "tpl-split", "Split, Then Fixed", "Turn a SPLIT into a spare.", "boxed"),
      T(29, "tpl-150", "Weekend Rental", "Score 150 or more in one game.", "sealed", { goal: { stat: "total", at: 150, unit: "pins", one: "pin", fromBest: true }, end: function (s) { return s.total >= 150; } }),
      T(30, "tpl-clean", "No Open Frames", "Finish a game with a strike or spare in every frame.", "slabbed", end(function (s) {
        var f = s.frames || [];
        return f.length >= 10 && every(f.slice(0, 10), function (fr) { return fr[0] === 10 || fr[0] + fr[1] === 10; });
      })),
      T(31, "tpl-300", "Every Tape Rewound", "Bowl a PERFECT GAME (300).", "slabbed", { secret: true, end: function (s) { return s.total === 300; } })
    ] },
    { slug: "ticket-roll-alley", name: "Ticket Roll Alley", status: "live", trophies: [
      T(65, "tra-ticket", "First One Off the Spool", "Earn your first ticket.", "loose", end(function (s) { return s.tickets >= 1 || s.score >= 10; })),
      T(36, "tra-nine", "Nine for Nine", "Finish a game where all 9 balls score (no SHORT, no 0).", "loose", end(function (s) { return s.balls >= 9 && s.zeroBalls === 0; })),
      T(32, "tra-cup", "Corner Office", "Sink a ball in a 100 cup.", "loose"),
      T(33, "tra-rattle", "Rattled In. It Counts.", "Score a 100 that rattles in off the lip.", "boxed"),
      T(34, "tra-both", "Both Corners, One Game", "Sink the left 100 cup and the right 100 cup in the same game.", "boxed", end(function (s) { return s.cupL > 0 && s.cupR > 0; })),
      T(35, "tra-jar150", "Strategy Guide Money", "Get the ticket jar (all games) to 150 tickets.", "boxed", end(function (s) { return s.jar >= 150; })),
      T(37, "tra-corner4", "Corner Store", "Sink 4 corner cups in one game.", "sealed", { goal: { stat: "hundreds", at: 4, unit: "corner cups", one: "corner cup" }, end: function (s) { return s.hundreds >= 4; } }),
      T(38, "tra-jar900", "Mystery Box Lot Money", "Get the ticket jar (all games) to 900 tickets.", "sealed", end(function (s) { return s.jar >= 900; })),
      T(39, "tra-500", "Complete in Box Score", "Score 500 or more in one game.", "slabbed", { retired: true, end: function (s) { return s.score >= 500; } }),
      T(69, "tra-600", "Complete in Box Score", "Score 600 or more in one game.", "slabbed", { goal: { stat: "score", at: 600, unit: "PTS", fromBest: true }, end: function (s) { return s.score >= 600; } })
    ] },
    { slug: "fourth-and-collect", name: "Fourth and Collect", status: "live", trophies: [
      T(40, "fac-good", "It's Good, Allegedly", "Make a field goal.", "loose"),
      T(41, "fac-hook", "Overkicked It", "Miss a kick by overkicking it (\"Overkicked it. It hooked.\").", "loose"),
      T(42, "fac-doink", "Doink, Still Counts", "Make a kick off the upright (DOINK... GOOD!).", "boxed"),
      T(43, "fac-50", "Mint Condition, 50 Yards", "Make a kick from 50 yards or more.", "boxed", { goal: { stat: "longest", at: 50, unit: "YDS" } }),
      T(44, "fac-clean50", "No Strikes at the Swap Meet", "Make a kick from 50 yards with zero strikes in that game.", "sealed"),
      T(45, "fac-60", "The Narrow Part", "Make a kick from 60 yards or more.", "sealed", { goal: { stat: "longest", at: 60, unit: "YDS" } }),
      T(46, "fac-70", "Booth Rental Leg", "Make a kick from 70 yards or more.", "slabbed", { goal: { stat: "longest", at: 70, unit: "YDS" } })
    ] },
    // Seasonal (Halloween 2026). seasonal: true keeps it out of the arcade-wide "every live game" trophies,
    // so they do not get harder once the season ends and the game moves to the Seasonal Vault.
    // Slots 71-82 were briefly used on /arcade-test/ only by a first draft (Pillowcase Panic); never live.
    { slug: "creature-feature-ko", name: "Creature Feature KO", status: "live", seasonal: "halloween", trophies: [
      T(71, "cfk-pumpkin", "Carved Out", "K.O. Sir Gourdsworth, the Pumpkin Knight.", "loose", end(function (s) { return s.beaten >= 1; })),
      T(72, "cfk-count", "Past His Bedtime", "K.O. Count Fangworth.", "loose", end(function (s) { return s.beaten >= 2; })),
      T(73, "cfk-wolf", "Bad Dog, No Treat", "K.O. Wolfgang Howlbert.", "loose", end(function (s) { return s.beaten >= 3; })),
      T(74, "cfk-nohit", "Not a Scratch", "K.O. any monster without getting hit.", "loose"),
      T(75, "cfk-mummy", "Unwrapped", "K.O. Pharaoh Wrapsody.", "boxed", { goal: { stat: "beaten", at: 4, unit: "monsters", one: "monster", margin: 1 }, end: function (s) { return s.beaten >= 4; } }),
      T(76, "cfk-giant", "Out of Warranty", "K.O. Lugnut, the Patchwork Giant.", "boxed", end(function (s) { return s.beaten >= 5; })),
      T(77, "cfk-fast", "Fast Forward", "K.O. any monster after the Pumpkin Knight in under 15 seconds.", "boxed"),
      T(78, "cfk-witch", "Broom Repo", "K.O. Hagatha Brewsworth.", "sealed", end(function (s) { return s.beaten >= 6; })),
      T(79, "cfk-horse", "Head of the Class", "K.O. the Headless Hayrider and finish the whole marathon.", "sealed", end(function (s) { return s.beaten >= 7; })),
      T(80, "cfk-nohit3", "Mint in Box", "K.O. 3 monsters in a row without getting hit.", "sealed", { goal: { stat: "noHitBest", at: 3, unit: "no-hit K.O.s in a row", one: "no-hit K.O.", margin: 1 }, end: function (s) { return s.noHitBest >= 3; } }),
      T(81, "cfk-rewind", "Be Kind, Rewind", "Finish the whole marathon in under 2:45.", "slabbed", { goal: { stat: "clearTime", at: 165, low: true, margin: 25, unit: "seconds", one: "second" }, end: function (s) { return s.cleared && s.clearTime < 165; } }),
      T(82, "cfk-horse-clean", "Director's Cut", "K.O. the Headless Hayrider without getting hit.", "slabbed")
    ] },
    { slug: "pawn-shop-pool", name: "Pawn Shop Pool", status: "soon", trophies: [
      T(47, "psp-scratch", "That Cue Ball Was Not for Sale", "Scratch the cue ball.", "loose"),
      T(48, "psp-combo", "Two for One Special", "Sink 2 or more balls with one shot.", "boxed"),
      T(49, "psp-close", "Out Before Closing", "Clear all 3 racks in 3:00 or less (penalties included).", "sealed")
    ] },
    { slug: "rink-rat-shootout", name: "Rink Rat Shootout", status: "soon", trophies: [
      T(50, "rrs-ding", "Ding!", "Hit the post.", "loose"),
      T(51, "rrs-top", "Top Shelf Item", "Score a top-corner goal.", "boxed"),
      T(52, "rrs-ten", "Past the Shelf Guardian", "Score 10 goals in one game (top corners count once each).", "sealed")
    ] },
    { slug: "powder-day-haul", name: "Powder Day Haul", status: "soon", trophies: [
      T(53, "pdh-guide", "Should've Bought the Strategy Guide", "Crash into anything.", "loose"),
      T(54, "pdh-bottom", "Bottom of Mount Backlog", "Reach the finish line.", "boxed"),
      T(55, "pdh-discs", "Loose Disc Avalanche", "Collect 30 discs in one run.", "sealed")
    ] },
    { slug: "table-rink-rumble", name: "Table Rink Rumble", status: "soon", trophies: [
      T(56, "trr-boxlot", "Beat the Box Lot Guy", "Win a match against The Box Lot Guy.", "loose"),
      T(57, "trr-shutout", "Clearance Shutout", "Win a match 7 to 0.", "boxed"),
      T(58, "trr-purist", "Opened the Mint Sealed Purist", "Beat The Mint Sealed Purist.", "sealed")
    ] }
  ];

  function live() { var a = []; for (var i = 0; i < games.length; i++) if (games[i].status === "live" && !games[i].seasonal) a.push(games[i]); return a; }

  var meta = [
    T(59, "arc-regular", "Arcade Regular", "Finish at least one run in every live arcade game.", "boxed", { check: function (sv) {
      return every(live(), function (g) { return (sv.c.played[g.slug] || 0) >= 1; });
    } }),
    T(60, "arc-runs", "No Quarters Required", "Finish 50 runs across the arcade.", "boxed", { check: function (sv) { return sv.c.runs >= 50; } }),
    T(61, "arc-days", "Seven Day Rental", "Finish a run on 7 different days.", "sealed", { check: function (sv) { return Math.max(sv.c.days.length, sv.c.di || 0) >= 7; } }),
    T(62, "arc-bests", "New Best, Again", "Set a NEW BEST 15 times across the arcade.", "sealed", { check: function (sv) { return sv.c.bests >= 15; } }),
    T(63, "arc-row", "Full Cabinet Row", "Own a Boxed or better trophy from every live arcade game.", "slabbed", { check: function (sv) {
      return every(live(), function (g) {
        for (var i = 0; i < g.trophies.length; i++) { var t = g.trophies[i]; if (t.tier !== "loose" && sv.u[t.id]) return true; }
        return false;
      });
    } }),
    T(64, "arc-night", "Up Past the Infomercials", "Finish a run between midnight and 4 AM, device time.", "loose", { secret: true, check: function (sv, ctx) {
      return !!ctx && ctx.hour != null && ctx.hour >= 0 && ctx.hour < 4;
    } })
  ];
  for (var m = 0; m < meta.length; m++) meta[m].slug = "meta";
  for (var g = 0; g < games.length; g++) for (var j = 0; j < games[g].trophies.length; j++) games[g].trophies[j].slug = games[g].slug;

  window.NP_TROPHIES_ARCADE = {
    tiers: {
      loose: { word: "Loose", value: 1 },
      boxed: { word: "Boxed", value: 5 },
      sealed: { word: "Sealed", value: 20 },
      slabbed: { word: "Slabbed", value: 50 }
    },
    games: games,
    meta: meta
  };
})();
