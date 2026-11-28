# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal dotfiles for an Omarchy desktop (Arch + Hyprland, Catppuccin Mocha). There is no build or test suite. `AGENTS.md` is the full setup guide for new machines; read it before changing install behavior.

## Commands
- There is no install script. New-machine setup is agent-driven: follow the "Setup procedure" in `AGENTS.md`. Existing targets are moved to `<name>.bak.<timestamp>`, never deleted.
- `/update-dotfiles` (`.claude/skills/update-dotfiles/`, manual only): sync live machine config back into this repo, never commits.
- `hyprctl reload`: apply Hyprland changes (`config/hypr/*.lua`).
- `systemctl --user restart superwhisper`: apply Superwhisper changes.
- Verify (from AGENTS.md):
  - `hyprctl binds -j | grep -c Vicinae`
  - `fc-match sans-serif` (should print Noto Sans)
  - `pgrep -af chrome | grep -c force-device-scale-factor`
  - `grep statusLine ~/.claude/settings.json`

## Architecture
- `config/` mirrors `~/.config`. setup symlinks each top-level entry, so editing a file here edits the live config. Two entries are special-cased:
  - `config/omarchy/` is linked entry by entry (and `plugins/*` one by one), because `~/.config/omarchy` also holds generated files and symlinks.
  - `config/superwhisper/preferences.json` is copied once and never linked, because the app rewrites it. Change it with the `superwhisper` CLI instead. Credentials and device ids are deliberately not tracked (see `.gitignore`).
- `config/omarchy/plugins/thangbuiq.*` are custom Omarchy shell plugins (QML plus JS models): bar, pomodoro, sysstats, system-button. `config/omarchy/themed/*.tpl` are theme templates and `hooks/theme-set.d/` holds theme-change hooks.
- `config/hypr/` is Lua-based Hyprland config (`hyprland.lua` plus bindings, input, looknfeel, monitors, autostart). `Alt+Space` opens Vicinae, overriding Omarchy's dictation toggle.
- `claude/`: `claude-code-budget-status.js` is copied to `~/.claude/`, and `settings.json` is merged into `~/.claude/settings.json` (only `statusLine` is forced, existing keys win).
- `config/fontconfig/fonts.conf` puts Noto Sans ahead of Liberation Sans, since Omarchy rewrites `sans-serif`.
- `home/` holds `bashrc`, `bash_profile`, `zshrc` and `zimrc` (Zim with the Pure prompt), linked to the matching dotfiles in `~`.

## Conventions
- Catppuccin Mocha palette throughout. No em dashes in code, comments or docs.
- Do not commit or push unless asked.
- A new top-level `config/<name>` is linked by the setup procedure automatically. Anything that must not be linked needs an exception in the `AGENTS.md` Setup procedure.
- Wallpapers are cached by path in the shell. Save an edited wallpaper under a new filename, then run `omarchy-theme-bg-set <path>`.
- `config/chrome-flags.conf` sets `--force-device-scale-factor=1` for a 1366x768 screen. It is machine-specific, and Chrome must be fully restarted to apply it.
