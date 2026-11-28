#!/usr/bin/env bash
# Disable internal input devices while external ones are connected:
#   touchpad  <- external mouse
#   keyboard  <- external keyboard
EXT_MOUSE="atk-mouse-bt-mouse"
TOUCHPAD="dell0b20:00-04f3:3146-touchpad"
EXT_KEYBOARD="melgeek-mg-dongle-keyboard"
INT_KEYBOARD="at-translated-set-2-keyboard"

set_enabled() { hyprctl eval "hl.device({ name = \"$1\", enabled = $2 })" >/dev/null; }

mstate=""; kstate=""
while sleep 2; do
  devs=$(hyprctl devices -j)
  if grep -q "\"name\": \"$EXT_MOUSE\"" <<<"$devs"; then m=false; else m=true; fi
  if grep -q "\"name\": \"$EXT_KEYBOARD\"" <<<"$devs"; then k=false; else k=true; fi
  [ "$m" != "$mstate" ] && { set_enabled "$TOUCHPAD" "$m"; mstate=$m; }
  [ "$k" != "$kstate" ] && { set_enabled "$INT_KEYBOARD" "$k"; kstate=$k; }
done
