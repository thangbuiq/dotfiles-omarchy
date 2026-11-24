.pragma library

var GLYPH_CPU = String.fromCodePoint(0xF0EE0)     // cpu-64-bit
var GLYPH_MEMORY = String.fromCodePoint(0xF035B)  // memory

// First line of /proc/stat -> { idle, total } jiffies, or null.
function parseCpu(text) {
  var line = String(text || "").split("\n")[0]
  if (line.indexOf("cpu ") !== 0) return null
  var f = line.trim().split(/\s+/).slice(1).map(Number)
  if (f.length < 4 || f.some(function(n) { return !isFinite(n) })) return null
  var total = 0
  // user nice system idle iowait irq softirq steal (guest is inside user).
  for (var i = 0; i < Math.min(8, f.length); i++) total += f[i]
  var idle = f[3] + (f.length > 4 ? f[4] : 0)
  return { idle: idle, total: total }
}

// Busy share between two samples, 0..100, or -1 when unknown.
function cpuPercent(prev, cur) {
  if (!prev || !cur) return -1
  var dt = cur.total - prev.total
  var di = cur.idle - prev.idle
  if (dt <= 0) return -1
  return Math.max(0, Math.min(100, Math.round(100 * (dt - di) / dt)))
}

// /proc/meminfo -> { percent, usedKiB, totalKiB }, or null.
function parseMemory(text) {
  var total = NaN, available = NaN
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = /^(MemTotal|MemAvailable):\s+(\d+)/.exec(lines[i])
    if (!m) continue
    if (m[1] === "MemTotal") total = Number(m[2])
    else available = Number(m[2])
  }
  if (!(total > 0) || !(available >= 0)) return null
  var used = Math.max(0, total - available)
  return { percent: Math.round(100 * used / total), usedKiB: used, totalKiB: total }
}

function gib(kib) {
  return kib / 1048576
}

var GLYPH_TEMP = String.fromCodePoint(0xF050F)    // thermometer

// "cputemp: <millidegrees>" line from the reader -> whole degrees C, or -1.
function parseTemp(text) {
  var m = /^cputemp:\s*(-?\d+)\s*$/m.exec(String(text || ""))
  if (!m) return -1
  var c = Math.round(Number(m[1]) / 1000)
  return isFinite(c) && c > 0 && c < 150 ? c : -1
}
