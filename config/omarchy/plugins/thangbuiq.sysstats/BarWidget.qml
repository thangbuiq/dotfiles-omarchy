import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// CPU and memory usage in the bar:  󰻠 12%  󰍛 43%
// Left click opens btop. Reads /proc/stat and /proc/meminfo every few seconds.
BarWidget {
  id: root
  moduleName: "thangbuiq.sysstats"

  readonly property bool showCpu: setting("showCpu", true) !== false
  readonly property bool showMemory: setting("showMemory", true) !== false
  readonly property bool showTemp: setting("showTemp", true) !== false
  readonly property int intervalSec: Math.max(1, Math.min(30, Math.round(Number(setting("interval", 2))) || 2))

  readonly property color foreground: bar ? bar.barForeground : Commons.Color.foreground
  readonly property string fontFamily: bar && bar.fontFamily ? bar.fontFamily : Style.font.family

  property var lastCpu: null
  property int cpu: -1
  property var memory: null
  // Degrees Celsius, or -1 when no CPU sensor was found.
  property int temp: -1

  readonly property string cpuText: cpu >= 0 ? Commons.I18n.formatNumber(cpu) + "%" : "–"
  readonly property string memoryText: memory ? Commons.I18n.formatNumber(memory.percent) + "%" : "–"

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  function tooltipText() {
    var lines = []
    if (showCpu) lines.push(strings.t("tooltip.cpu").arg(cpu >= 0 ? Commons.I18n.formatNumber(cpu) : "–"))
    if (showTemp && temp >= 0) lines.push(strings.t("tooltip.temp").arg(Commons.I18n.formatNumber(temp)))
    if (showMemory && memory) lines.push(strings.t("tooltip.memory")
      .arg(Commons.I18n.formatNumber(memory.percent))
      .arg(Commons.I18n.formatNumber(Model.gib(memory.usedKiB), 1))
      .arg(Commons.I18n.formatNumber(Model.gib(memory.totalKiB), 1)))
    lines.push(strings.t("tooltip.open"))
    return lines.join("\n")
  }

  function sample(text) {
    var cur = Model.parseCpu(text)
    var pct = Model.cpuPercent(lastCpu, cur)
    if (cur) lastCpu = cur
    if (pct >= 0) cpu = pct
    var mem = Model.parseMemory(text)
    if (mem) memory = mem
    temp = Model.parseTemp(text)
    if (mouse.containsMouse && bar) bar.showTooltip(root, tooltipText())
  }

  visible: (showCpu || showMemory || showTemp) && !vertical
  implicitWidth: visible ? row.implicitWidth + Style.space(14) : 0
  implicitHeight: barSize

  Process {
    id: reader
    // A fixed script, no interpolated values. hwmon numbers change between
    // boots, so the CPU sensor is found by driver name; the package-level
    // thermal zone is the fallback.
    command: ["bash", "-c",
      'cat /proc/stat /proc/meminfo; '
      + 'for h in /sys/class/hwmon/hwmon*; do n=$(<"$h/name"); '
      + 'case $n in coretemp|k10temp|zenpower|cpu_thermal) echo "cputemp: $(<"$h/temp1_input")"; exit 0;; esac; done 2>/dev/null; '
      + 'for z in /sys/class/thermal/thermal_zone*; do [[ $(<"$z/type") == x86_pkg_temp ]] && echo "cputemp: $(<"$z/temp")" && exit 0; done 2>/dev/null; true']
    stdout: StdioCollector {
      onStreamFinished: root.sample(text)
    }
  }

  Timer {
    interval: root.intervalSec * 1000
    repeat: true
    running: root.visible
    triggeredOnStart: true
    onTriggered: if (!reader.running) reader.running = true
  }

  // Two-digit slots so the widget holds still as the numbers change; 100% grows it.
  TextMetrics {
    id: numberMetrics
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    text: "00%"
  }

  Row {
    id: row
    anchors.centerIn: parent
    spacing: Style.space(6)

    Row {
      visible: root.showCpu
      spacing: Style.space(4)
      anchors.verticalCenter: parent.verticalCenter

      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        text: Model.GLYPH_CPU
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.icon
      }
      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(implicitWidth, Math.ceil(numberMetrics.advanceWidth))
        text: root.cpuText
        color: root.cpu >= 90 && root.bar ? root.bar.urgent : root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }
    }

    Row {
      visible: root.showTemp && root.temp >= 0
      spacing: Style.space(4)
      anchors.verticalCenter: parent.verticalCenter

      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        text: Model.GLYPH_TEMP
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.icon
      }
      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(implicitWidth, Math.ceil(numberMetrics.advanceWidth))
        text: Commons.I18n.formatNumber(root.temp) + "°"
        color: root.temp >= 85 && root.bar ? root.bar.urgent : root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }
    }

    Row {
      visible: root.showMemory
      spacing: Style.space(4)
      anchors.verticalCenter: parent.verticalCenter

      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        text: Model.GLYPH_MEMORY
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.icon
      }
      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(implicitWidth, Math.ceil(numberMetrics.advanceWidth))
        text: root.memoryText
        color: root.memory && root.memory.percent >= 90 && root.bar ? root.bar.urgent : root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }
    }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: Quickshell.execDetached(["omarchy-launch-or-focus-tui", "btop"])
    onEntered: if (root.bar) root.bar.showTooltip(root, root.tooltipText())
    onExited: if (root.bar) root.bar.hideTooltip(root)
  }
}
