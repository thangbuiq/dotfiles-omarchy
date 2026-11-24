import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Power icon that opens the Omarchy System menu.
BarWidget {
  id: root
  moduleName: "thangbuiq.system-button"

  readonly property color foreground: bar ? bar.barForeground : Commons.Color.foreground
  readonly property string fontFamily: bar && bar.fontFamily ? bar.fontFamily : Style.font.family

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  implicitWidth: label.implicitWidth + Style.space(14)
  implicitHeight: barSize

  Text {
    id: label
    textFormat: Text.PlainText
    anchors.centerIn: parent
    text: "⏻"
    color: mouse.containsMouse ? Commons.Color.foreground : root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.icon
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: Quickshell.execDetached(["omarchy", "menu", "toggle", "system"])
    onEntered: if (root.bar) root.bar.showTooltip(root, strings.t("tooltip"))
    onExited: if (root.bar) root.bar.hideTooltip(root)
  }
}
