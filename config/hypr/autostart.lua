-- Extra autostart processes.
-- o.launch_on_start("my-service")

-- Vicinae launcher (Super+Space)
o.launch_on_start("vicinae server")

-- Disable the touchpad while the external mouse is connected.
o.launch_on_start("$HOME/.config/hypr/scripts/touchpad-auto.sh")
