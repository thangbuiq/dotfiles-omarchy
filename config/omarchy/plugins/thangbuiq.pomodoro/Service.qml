import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import "Model.js" as Model

// The one timer. The bar draws a widget per monitor, so the countdown lives
// here, mounted once by the shell, and every widget reads from it. State is
// saved to disk so a shell restart does not lose a running session.
Item {
  id: root

  // Injected by omarchy-shell.
  property var shell: null

  // Durations, pushed in from the bar widget's shell.json settings.
  property int focusMinutes: 25
  property int shortBreakMinutes: 5
  property int longBreakMinutes: 15
  property int sessionsBeforeLong: 4
  property bool autoStart: false

  property string phase: "focus"
  property bool running: false
  property double endsAt: 0
  // Milliseconds left while paused; -1 means the phase has not started.
  property double pausedRemaining: -1
  // Focus sessions finished in the current cycle.
  property int completed: 0
  property double now: Date.now()
  property bool loaded: false

  readonly property double durationMs: minutesFor(phase) * 60000
  readonly property double remainingMs: running
    ? Math.max(0, endsAt - now)
    : (pausedRemaining >= 0 ? Math.min(pausedRemaining, durationMs) : durationMs)
  readonly property bool started: running || pausedRemaining >= 0
  readonly property bool paused: !running && pausedRemaining >= 0
  readonly property real progress: durationMs > 0 ? Math.max(0, Math.min(1, 1 - remainingMs / durationMs)) : 0
  readonly property string remainingText: Model.formatClock(remainingMs)
  readonly property int sessionNumber: Math.min(sessionsBeforeLong, completed + (phase === "focus" ? 1 : 0))

  readonly property string statePath: Quickshell.env("HOME") + "/.local/state/omarchy/pomodoro.json"

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  function minutesFor(p) {
    if (p === "short") return shortBreakMinutes
    if (p === "long") return longBreakMinutes
    return focusMinutes
  }

  function configure(settings) {
    if (!settings) return
    focusMinutes = Model.clampInt(settings.focusMinutes, 1, 180, 25)
    shortBreakMinutes = Model.clampInt(settings.shortBreakMinutes, 1, 60, 5)
    longBreakMinutes = Model.clampInt(settings.longBreakMinutes, 1, 90, 15)
    sessionsBeforeLong = Model.clampInt(settings.sessionsBeforeLongBreak, 1, 12, 4)
    autoStart = settings.autoStart === true
  }

  function start() {
    if (running) return
    now = Date.now()
    endsAt = now + remainingMs
    pausedRemaining = -1
    running = true
    save()
  }

  function pause() {
    if (!running) return
    now = Date.now()
    pausedRemaining = Math.max(0, endsAt - now)
    running = false
    save()
  }

  function toggle() {
    if (running) pause()
    else start()
  }

  // Back to the full length of the current phase, stopped.
  function reset() {
    running = false
    pausedRemaining = -1
    endsAt = 0
    save()
  }

  // Back to the first focus session of a new cycle.
  function restartCycle() {
    phase = "focus"
    completed = 0
    reset()
  }

  function enterPhase(next, autoRun) {
    if (phase === "long") completed = 0
    phase = next
    running = false
    pausedRemaining = -1
    endsAt = 0
    if (autoRun) start()
    else save()
  }

  // Move on without counting the current phase as done.
  function skip() {
    enterPhase(Model.nextPhase(phase, phase === "focus" ? -1 : completed, sessionsBeforeLong), running)
  }

  function finish() {
    var ended = phase
    if (ended === "focus") completed = Math.min(99, completed + 1)
    var next = Model.nextPhase(ended, completed, sessionsBeforeLong)
    notifyEnded(ended, next)
    enterPhase(next, autoStart)
  }

  function notifyEnded(ended, next) {
    var title, body
    if (ended === "focus") {
      title = strings.t("notify.focusDone.title")
      body = next === "long"
        ? strings.t("notify.longBreak.body").arg(longBreakMinutes)
        : strings.t("notify.focusDone.body").arg(shortBreakMinutes)
    } else {
      title = strings.t("notify.breakDone.title")
      body = strings.t("notify.breakDone.body").arg(focusMinutes)
    }
    Quickshell.execDetached(["omarchy-notification-send", "-u", "normal",
      "-g", Model.glyphFor(next), title, body])
  }

  function tick() {
    now = Date.now()
    if (running && now >= endsAt) finish()
  }

  function save() {
    if (!loaded) return
    stateFile.setText(JSON.stringify({
      phase: phase,
      running: running,
      endsAt: endsAt,
      pausedRemaining: pausedRemaining,
      completed: completed
    }) + "\n")
  }

  function load(text) {
    var s = Model.parseState(text, Date.now())
    phase = s.phase
    running = s.running
    endsAt = s.endsAt
    pausedRemaining = s.pausedRemaining
    completed = s.completed
    loaded = true
    tick()
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.running
    triggeredOnStart: true
    onTriggered: root.tick()
  }

  FileView {
    id: stateFile
    path: root.statePath
    atomicWrites: true
    printErrors: false
    onLoaded: root.load(text())
    onLoadFailed: { root.loaded = true }
  }

  // omarchy-shell pomodoro toggle | start | pause | reset | skip | status
  IpcHandler {
    target: "pomodoro"
    function toggle(): void { root.toggle() }
    function start(): void { root.start() }
    function pause(): void { root.pause() }
    function reset(): void { root.reset() }
    function skip(): void { root.skip() }
    function restart(): void { root.restartCycle() }
    function status(): string {
      return root.phase + " " + (root.running ? "running" : (root.paused ? "paused" : "ready")) + " " + root.remainingText
    }
  }
}
