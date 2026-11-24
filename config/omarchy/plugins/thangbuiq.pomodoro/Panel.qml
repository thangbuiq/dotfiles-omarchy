import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// Bar widget and panel. The countdown itself lives in Service.qml, shared by
// the widget on every monitor.
//   Left click: open the panel.  Right click: start/pause.  Middle click: reset.
Panel {
  id: root
  moduleName: "thangbuiq.pomodoro"
  manageIpc: false

  property var timer: null

  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property color accent: Commons.Color.accent
  readonly property string fontFamily: bar && bar.fontFamily ? bar.fontFamily : Style.font.family

  readonly property bool ready: timer !== null
  readonly property string phase: ready ? timer.phase : "focus"
  readonly property bool running: ready && timer.running
  readonly property bool started: ready && timer.started
  readonly property string phaseLabel: strings.t("phase." + phase)
  readonly property string stateLabel: running ? strings.t("state.running")
    : (started ? strings.t("state.paused") : strings.t("state.ready"))
  readonly property bool showWhenIdle: setting("showWhenIdle", true) !== false

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  // The service may register after this widget loads; look again until it is there.
  function resolveService() {
    if (timer) return
    var s = bar && bar.shell && typeof bar.shell.serviceFor === "function"
      ? bar.shell.serviceFor("thangbuiq.pomodoro") : null
    if (s) {
      timer = s
      timer.configure(settings)
    }
  }

  onBarChanged: resolveService()
  onSettingsChanged: if (timer) timer.configure(settings)
  Component.onCompleted: resolveService()

  Timer {
    interval: 500
    repeat: true
    running: root.timer === null
    onTriggered: root.resolveService()
  }

  // Centred under the bar when it sits beside the clock, as Omarchy's own
  // middle-of-bar panels do.
  property bool centredOnBar: false

  function inMiddleOfBar() {
    var window = root.QsWindow.window
    if (!window) return false
    var vertical = root.bar && root.bar.vertical
    var at = root.mapToItem(null, root.width / 2, root.height / 2)
    var span = vertical ? window.height : window.width
    var middle = vertical ? at.y : at.x
    return span > 0 && middle > span / 3 && middle < span * 2 / 3
  }

  function openPanel() {
    root.centredOnBar = root.inMiddleOfBar()
    root.open()
    if (root.centredOnBar) Qt.callLater(function() {
      if (root.opened && root.bar) root.bar.setCenterHoverRevealSuppressed(true)
    })
  }

  function togglePanel() {
    if (root.opened) root.close()
    else root.openPanel()
  }

  onOpenedChanged: {
    if (!opened && centredOnBar && bar) bar.setCenterHoverRevealSuppressed(false)
    else if (opened) Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  visible: showWhenIdle || started
  implicitWidth: visible ? button.implicitWidth : 0
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: Model.glyphFor(root.phase)
    labelText: root.started && !(root.bar && root.bar.vertical) ? root.timer.remainingText : ""
    active: root.running
    // The bar gives a fixed icon-sized slot; widen it to fit the countdown
    // (measured with zeros so the width holds still as the digits change).
    slotSize: labelText !== ""
      ? Math.ceil(Math.max(Style.bar.iconSlot, button.canvasSize + labelMetrics.advanceWidth + Style.space(4) + Style.space(24)))
      : Style.bar.iconSlot
    tooltipText:root.opened ? "" : (root.ready
      ? strings.t("tooltip").arg(root.phaseLabel).arg(root.timer.remainingText)
      : strings.t("name"))

    onPressed: function(b) {
      if (!root.timer) return
      if (b === Qt.RightButton) root.timer.toggle()
      else if (b === Qt.MiddleButton) root.timer.reset()
      else root.togglePanel()
    }
  }

  TextMetrics {
    id: labelMetrics
    font.family: button.fontFamily
    font.pixelSize: button.fontSize
    text: button.labelText.replace(/[0-9]/g, "0")
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    centerOnBar: root.centredOnBar
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(300))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(420))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onActivateRequested: if (root.timer) root.timer.toggle()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (!root.timer) return
        var key = t.toLowerCase()
        if (key === " " || key === "p") root.timer.toggle()
        else if (key === "r") root.timer.reset()
        else if (key === "s") root.timer.skip()
      }

      Column {
        id: column
        x: Style.space(2)
        width: parent.width - Style.space(4)
        spacing: Style.space(12)

        PanelHero {
          width: parent.width
          foreground: root.foreground
          fontFamily: root.fontFamily
          title: root.phaseLabel
          meta: root.stateLabel
          detail: root.ready
            ? strings.t("session").arg(Commons.I18n.formatNumber(root.timer.sessionNumber))
                .arg(Commons.I18n.formatNumber(root.timer.sessionsBeforeLong))
            : ""
          iconComponent: Component {
            Text {
              textFormat: Text.PlainText
              text: Model.glyphFor(root.phase)
              color: root.running ? root.accent : root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.display
            }
          }
        }

        PanelSeparator { foreground: root.foreground }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          text: root.ready ? root.timer.remainingText : "--:--"
          color: root.running ? root.foreground : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.displayLarge * 2
          font.bold: true
          font.features: { "tnum": 1 }
          Behavior on color { ColorAnimation { duration: Style.duration(160); easing.type: Easing.OutCubic } }
        }

        // Progress through the current phase.
        Rectangle {
          width: parent.width
          height: Style.space(4)
          radius: height / 2
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)

          Rectangle {
            width: parent.width * (root.ready ? root.timer.progress : 0)
            height: parent.height
            radius: parent.radius
            color: root.accent
            Behavior on width { NumberAnimation { duration: Style.duration(250); easing.type: Easing.OutCubic } }
          }
        }

        Row {
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(8)

          Button {
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconText: root.running ? Model.GLYPH_PAUSE : Model.GLYPH_PLAY
            text: root.running ? strings.t("action.pause")
              : (root.started ? strings.t("action.resume") : strings.t("action.start"))
            selected: root.running
            onClicked: if (root.timer) root.timer.toggle()
          }

          Button {
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconText: Model.GLYPH_RESET
            text: strings.t("action.reset")
            enabled: root.started
            onClicked: if (root.timer) root.timer.reset()
          }

          Button {
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconText: Model.GLYPH_SKIP
            text: strings.t("action.skip")
            onClicked: if (root.timer) root.timer.skip()
          }
        }

        PanelSeparator { foreground: root.foreground }

        Item {
          width: parent.width
          height: restartButton.implicitHeight

          Text {
            textFormat: Text.PlainText
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - restartButton.width - Style.space(8)
            elide: Text.ElideRight
            text: root.ready
              ? strings.tn("completedToday", root.timer.completed).arg(Commons.I18n.formatNumber(root.timer.completed))
              : ""
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
          }

          Button {
            id: restartButton
            anchors.right: parent.right
            foreground: root.foreground
            fontFamily: root.fontFamily
            text: strings.t("action.restartCycle")
            onClicked: if (root.timer) root.timer.restartCycle()
          }
        }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          text: strings.t("hint.keys")
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }
}
