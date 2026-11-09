// Shared intro handoff rules for the private web wrapper.
// The cutscene posts np2intro:finished when playback ends or the player skips,
// and np2intro:start only after that, when they press through the end card.
// A start message before finished must not remove the intro.
function np2CreateHandoffState() {
  return { finished: false, skipped: false, handoff: "", rejectedEarlyStart: 0 };
}

function np2HandoffDecide(state, data, fromIntro) {
  if (!fromIntro || !data || typeof data !== "object") {
    return state;
  }
  if (data.type === "np2intro:finished") {
    state.finished = true;
    state.skipped = !!data.skipped;
    if (data.skipped) {
      state.handoff = state.handoff || "skip";
    }
    return state;
  }
  if (data.type === "np2intro:start") {
    if (state.finished) {
      state.handoff = state.handoff || "press";
    } else {
      state.rejectedEarlyStart += 1;
    }
    return state;
  }
  return state;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { np2CreateHandoffState: np2CreateHandoffState, np2HandoffDecide: np2HandoffDecide };
}
