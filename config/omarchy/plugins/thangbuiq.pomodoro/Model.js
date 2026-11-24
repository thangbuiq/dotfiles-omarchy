.pragma library

// Pure helpers for the Pomodoro timer, kept free of QML so they are easy to test.

var PHASES = ["focus", "short", "long"]

var GLYPH_FOCUS = String.fromCodePoint(0xF051B)   // timer-outline
var GLYPH_BREAK = String.fromCodePoint(0xF0176)   // coffee
var GLYPH_PLAY = String.fromCodePoint(0xF040A)    // play
var GLYPH_PAUSE = String.fromCodePoint(0xF03E4)   // pause
var GLYPH_RESET = String.fromCodePoint(0xF0450)   // refresh
var GLYPH_SKIP = String.fromCodePoint(0xF04AD)    // skip-next

function isPhase(value) {
  return PHASES.indexOf(String(value)) !== -1
}

function clampInt(value, min, max, fallback) {
  var n = Math.round(Number(value))
  if (!isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

// mm:ss, or h:mm:ss past an hour. Rounds up so 0:00 only shows at the end.
function formatClock(ms) {
  var total = Math.max(0, Math.ceil(Number(ms) / 1000))
  if (!isFinite(total)) total = 0
  var h = Math.floor(total / 3600)
  var m = Math.floor((total % 3600) / 60)
  var s = total % 60
  var ss = (s < 10 ? "0" : "") + s
  if (h > 0) return h + ":" + (m < 10 ? "0" : "") + m + ":" + ss
  return m + ":" + ss
}

// The phase that follows `phase`, given how many focus sessions are done
// in this cycle (already counting the one that just ended).
function nextPhase(phase, completed, every) {
  if (phase !== "focus") return "focus"
  return completed > 0 && completed % Math.max(1, every) === 0 ? "long" : "short"
}

function glyphFor(phase) {
  return phase === "focus" ? GLYPH_FOCUS : GLYPH_BREAK
}

// Validate persisted state: everything read from disk is untrusted.
function parseState(text, nowMs) {
  var fallback = { phase: "focus", running: false, endsAt: 0, pausedRemaining: -1, completed: 0 }
  var data
  try { data = JSON.parse(String(text || "")) } catch (e) { return fallback }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback
  var day = 24 * 3600 * 1000
  var endsAt = Number(data.endsAt)
  var paused = Number(data.pausedRemaining)
  var state = {
    phase: isPhase(data.phase) ? String(data.phase) : "focus",
    running: data.running === true,
    endsAt: isFinite(endsAt) && endsAt > 0 && endsAt < nowMs + day ? endsAt : 0,
    pausedRemaining: isFinite(paused) && paused >= 0 && paused <= 3 * 3600 * 1000 ? paused : -1,
    completed: clampInt(data.completed, 0, 99, 0)
  }
  if (state.running && state.endsAt === 0) state.running = false
  return state
}
