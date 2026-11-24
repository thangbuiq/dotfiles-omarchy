---
name: update-dotfiles
description: Sync this machine's live config back into the dotfiles-omarchy repo and report what changed. Manual only, run with /update-dotfiles.
disable-model-invocation: true
---

# Update dotfiles

Pull the current state of this machine into the repo (live system is the source of truth). Never commit or push.

Use the mapping table in `AGENTS.md` ("Layout") to know which live path backs each repo path.

1. For each tracked path in the repo, compare it with its live counterpart (`diff -rq`):
   - `config/<name>` vs `~/.config/<name>` (for `config/omarchy`, compare only tracked entries and `plugins/thangbuiq.*`)
   - `home/*` vs `~/.bashrc`, `~/.bash_profile`
   - `config/superwhisper/preferences.json` vs `~/.config/superwhisper/preferences.json`
   - `claude/claude-code-budget-status.js` vs `~/.claude/claude-code-budget-status.js`
   - `claude/settings.json`: only the keys it already contains (`model`, `theme`, `statusLine`) vs `~/.claude/settings.json`
   - `fonts/*.ttf` vs `~/.local/share/fonts`
2. If a live path is a symlink into this repo, it is already in sync, skip it.
3. Copy changed live files into the repo (`rsync -a`, no `--delete` unless the user asks). Skip generated or
   sensitive files: `*.bak*`, logs, caches, `superwhisper/cloud-*.json`, `*.lock`, device ids, tokens, anything that looks like a credential.
4. List live entries that are not tracked yet (new `~/.config/<name>` dirs, new `thangbuiq.*` plugins) and ask the user which to add. Do not add them silently.
5. Report a short summary: updated, unchanged, skipped (with reason), candidates to add. Then show `git status --short` and stop.
6. If the sync changes the layout (a new tracked path or a new rule), update the Layout section of `AGENTS.md` and `CLAUDE.md` too.

Style: no em dashes in anything written to the repo.
