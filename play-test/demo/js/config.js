// Nostalgia Pro: settings. Fill in the REPLACE-ME / empty values before launch.
//
// Builds: run `node build.js` from the project folder. It writes dist/demo and dist/full from these same files.
// The demo build has DEMO hard-coded on in game.js, intro.js and character.js, so editing this file
// cannot unlock the full game. DEMO below only matters when you run the source folder directly.
//
var NP = window.NP || {};
window.NP = NP;

NP.CONFIG = {
  DEMO: true,

  // The full game is not out yet. While this is true, every "get the full game" spot says
  // "Full game coming soon" and points to FOLLOW_URL instead of FULL_GAME_URL.
  COMING_SOON: true,
  FULL_GAME_URL: 'https://REPLACE-ME.itch.io/nostalgia-pro', // unused while COMING_SOON is true
  FOLLOW_URL: 'https://x.com/NostalgiaPro',
  SITE_URL: 'https://thenostalgiapro.com',
  PRICE: '$0.99',

  // Feedback form (Tally). The feedback buttons stay hidden until this is filled in.
  FEEDBACK_URL: 'https://tally.so/r/rDDJJl',

  // Real merch store, plugged by one button on the demo's end infomercial. Leave empty to hide the button.
  MERCH_URL: 'https://nostalgiapro-shop.fourthwall.com/',

  // GoatCounter site code, the part before .goatcounter.com (for example 'nostalgiapro').
  // Leave empty to turn analytics off completely.
  ANALYTICS_CODE: 'nostalgiapro',

  // Where the game is running: '' = detect automatically, or force one of
  // 'itch', 'newgrounds', 'crazygames', 'site', 'file'. CrazyGames hides outside links and the fullscreen button.
  PLATFORM: '',

  // The one Saturday the demo always plays. Changing it reshuffles the demo's items.
  DEMO_SEED: 'demo-saturday-1',

  // Creator items you can see in the demo but cannot pick. They are sold separately.
  LOCKED_LOOK: { hat: ['npcap', 'bucket'], glasses: ['3d'], shirt: ['hawaii'] }
};

// Which site are we on? Used for analytics tags and for platform rules.
NP.platform = (function () {
  var forced = NP.CONFIG.PLATFORM;
  if (forced) return forced;
  try {
    if (location.protocol === 'file:') return 'file';
    var h = (location.hostname || '').toLowerCase(), r = (document.referrer || '').toLowerCase(), both = h + ' ' + r;
    if (/crazygames/.test(both)) return 'crazygames';
    if (/newgrounds|ungrounded\.net/.test(both)) return 'newgrounds';
    if (/itch\.io|itch\.zone|hwcdn\.net/.test(both)) return 'itch';
    if (/thenostalgiapro\.com/.test(h)) return 'site';
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(h)) return 'dev';
  } catch (e) {}
  return 'other';
})();

// CrazyGames does not allow links to other platforms or a custom fullscreen button.
NP.CONFIG.ALLOW_LINKS = NP.platform !== 'crazygames';
NP.CONFIG.ALLOW_FULLSCREEN = NP.platform !== 'crazygames';
