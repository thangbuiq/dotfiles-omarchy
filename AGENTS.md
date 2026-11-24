# Agent setup guide

Goal: reproduce this Omarchy desktop on any new Omarchy machine. There is no install script: you (the agent) perform
the steps below directly, using the Layout as the mapping. Do not push or commit for the user. Before replacing any
existing file, move it to `<name>.bak.<timestamp>` and tell the user. Ask before overwriting anything unexpected.
To pull the machine's current config back into this repo, the user runs `/update-dotfiles` (repo-local, only available when Claude Code is started in this repo).

## Setup procedure
1. Clone this repo to `~/dotfiles-omarchy` if it is not there yet. Work from the repo root.
2. For every entry in `config/` except `omarchy` and `superwhisper`: symlink it to `~/.config/<name>`.
3. For every entry in `config/omarchy/` except `plugins`: symlink it to `~/.config/omarchy/<name>`. Symlink each
   `config/omarchy/plugins/*` to `~/.config/omarchy/plugins/<name>`. Never replace `~/.config/omarchy` itself.
4. Copy `config/superwhisper/preferences.json` to `~/.config/superwhisper/` only if it does not exist.
5. Symlink `home/bashrc` and `home/bash_profile` to `~/.bashrc` and `~/.bash_profile`, `home/zshrc` to `~/.zshrc`, and `home/zimrc` to `~/.zimrc`.
   Then run `zsh -ic 'zimfw install'` to fetch the Zim modules (Pure prompt). `~/.zshrc` must source Zim's `init.zsh`.
6. Copy `fonts/*.ttf` to `~/.local/share/fonts` without overwriting, then run `fc-cache -f`.
7. Copy `claude/claude-code-budget-status.js` to `~/.claude/`. Merge `claude/settings.json` into
   `~/.claude/settings.json`: add missing keys, keep existing values, always set `statusLine`.
8. Manual steps to hand to the user: install packages (Hyprland/Omarchy, vicinae, superwhisper), run `hyprctl reload`
   and `systemctl --user restart superwhisper`, set the wallpaper with
   `omarchy-theme-bg-set ~/.config/omarchy/backgrounds/catppuccin/2-totoro-omarchy-gradient.webp`, and fully quit and
   reopen Chrome so `chrome-flags.conf` applies.
9. Run the Verify commands below and report what passed or failed.

## Layout
- `config/`: mirrors `~/.config`. Each entry is symlinked (see Setup procedure): `hypr`, `nvim`, `tmux`, `alacritty`, `foot`, `ghostty`, `kitty`,
  `btop`, `git`, `herdr`, `fcitx5`, `fontconfig`, `vicinae`, `starship.toml`, `chrome-flags.conf`, and so on.
- `config/omarchy/`: `shell.json`, `shell.toml`, `themes/`, `themed/`, `hooks/`, `backgrounds/`, and `plugins/thangbuiq.*`
  (the custom status bar, pomodoro, sysstats and system-button plugins). Entries are linked one by one because
  `~/.config/omarchy` also holds generated files and the `superwhisper-panel` symlink.
- `config/superwhisper/preferences.json`: copied once, never linked (the app rewrites it). It is the only Superwhisper
  file kept: `cloud-credentials.json` and device ids are intentionally not backed up.
- `home/`: `bashrc`, `bash_profile`, `zshrc`, `zimrc`, linked to `~/.bashrc`, `~/.bash_profile`, `~/.zshrc`, `~/.zimrc`.
- `fonts/`: Inter Variable, copied to `~/.local/share/fonts`. `config/fontconfig/fonts.conf` puts it in front of
  Liberation Sans because Omarchy rewrites `sans-serif` to Liberation Sans.
- `claude/`: `claude-code-budget-status.js` goes to `~/.claude/`; `settings.json` is merged into `~/.claude/settings.json`
  (statusLine added, existing keys kept). The script keeps its original dark-terminal colors.

## Notes
- Chrome scale: `config/chrome-flags.conf` has `--force-device-scale-factor=0.9` for a 1366x768 screen. Adjust per machine.
  Chrome must be fully quit and reopened for it to apply.
- Hotkeys: `Alt+Space` opens Vicinae (override in `config/hypr/bindings.lua`, replacing Omarchy's dictation toggle).
  Superwhisper toggle is `Ctrl+Alt+Shift+F12`.
- Wallpapers: the shell caches by path. Save an edited wallpaper under a new filename, then `omarchy-theme-bg-set <path>`.
- Style: Catppuccin Mocha. No em dashes in code, comments or docs.

## Verify
- `hyprctl binds -j | grep -c Vicinae`
- `fc-match sans-serif` prints Inter Variable
- `pgrep -af chrome | grep -c force-device-scale-factor`
- `grep statusLine ~/.claude/settings.json`
