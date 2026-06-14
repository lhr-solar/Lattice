#!/usr/bin/env bash
# setup-obsidian-vault.sh — bootstrap / refresh lattice-agent-vault for Cursor
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="$REPO_ROOT/lattice-agent-vault"
VENDOR="$VAULT/_vendor"

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

step "1. Ensure vault exists"
mkdir -p "$VAULT"

step "2. Init vault git + submodules (if missing)"
if [[ ! -d "$VAULT/.git" ]]; then
  git -C "$VAULT" init
fi
mkdir -p "$VENDOR"
for spec in \
  "obsidian-mind https://github.com/breferrari/obsidian-mind.git" \
  "obsidian-skills https://github.com/kepano/obsidian-skills.git" \
  "obsidian-second-brain https://github.com/eugeniughelbur/obsidian-second-brain.git"
do
  name="${spec%% *}"
  url="${spec#* }"
  if [[ ! -d "$VENDOR/$name/.git" ]]; then
    git -C "$VAULT" submodule add "$url" "_vendor/$name" 2>/dev/null || \
      git -C "$VAULT" submodule update --init "_vendor/$name"
  fi
done
git -C "$VAULT" submodule update --init --recursive

step "3. Refresh obsidian-mind scaffold (preserves brain/, work/, wiki/, reference/)"
rsync -a \
  --exclude='.git' \
  --exclude='brain/' --exclude='work/' --exclude='wiki/' --exclude='reference/' \
  --exclude='index.md' --exclude='log.md' --exclude='CRITICAL_FACTS.md' \
  --exclude='SECOND-BRAIN.md' --exclude='VAULT.md' --exclude='vault-manifest.json' \
  --exclude='README*.md' --exclude='*.gif' --exclude='*.png' \
  --exclude='ARCHITECTURE.md' --exclude='CHANGELOG.md' --exclude='CONTRIBUTING.md' \
  "$VENDOR/obsidian-mind/" "$VAULT/"

step "4. Build obsidian-second-brain for Cursor"
bash "$VENDOR/obsidian-second-brain/scripts/build.sh" --platform opencode
rm -rf "$VAULT/.second-brain"
cp -R "$VENDOR/obsidian-second-brain/dist/opencode/.opencode" "$VAULT/.second-brain"
sed 's/\.opencode/\.second-brain/g; s/OpenCode/Cursor/g' \
  "$VENDOR/obsidian-second-brain/dist/opencode/AGENTS.md" > "$VAULT/SECOND-BRAIN.md"

step "5. Sync Cursor skills to .cursor/skills/"
mkdir -p "$REPO_ROOT/.cursor/skills"
for skill in obsidian-markdown obsidian-cli obsidian-bases json-canvas defuddle; do
  rm -rf "$REPO_ROOT/.cursor/skills/$skill"
  cp -R "$VENDOR/obsidian-skills/skills/$skill" "$REPO_ROOT/.cursor/skills/$skill"
done
rm -rf "$REPO_ROOT/.cursor/skills/obsidian-second-brain"
mkdir -p "$REPO_ROOT/.cursor/skills/obsidian-second-brain"
cp "$VENDOR/obsidian-second-brain/SKILL.md" "$REPO_ROOT/.cursor/skills/obsidian-second-brain/"
cp -R "$VENDOR/obsidian-second-brain/references" "$REPO_ROOT/.cursor/skills/obsidian-second-brain/"
mkdir -p "$REPO_ROOT/.cursor/skills/qmd"
cp "$VAULT/.claude/skills/qmd/SKILL.md" "$REPO_ROOT/.cursor/skills/qmd/" 2>/dev/null || true

step "6. Optional QMD bootstrap"
export PATH="$HOME/.npm-global/bin:$PATH"
if command -v qmd >/dev/null 2>&1; then
  (cd "$VAULT" && node --experimental-strip-types scripts/qmd-bootstrap.ts) || true
  green "QMD index updated (index: lattice-agent-vault)"
else
  echo "   qmd not installed — skip or: npm install -g @tobilu/qmd"
fi

green "Done. Open $VAULT in Obsidian. Vault is gitignored from Lattice repo."
