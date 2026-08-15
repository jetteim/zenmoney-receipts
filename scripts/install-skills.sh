#!/bin/zsh
set -eu

codex_root="${CODEX_HOME:-$HOME/.codex}"
installer="$codex_root/skills/.system/skill-installer/scripts/install-skill-from-github.py"

if [[ ! -f "$installer" ]]; then
  print -u2 "Codex skill installer was not found at $installer"
  print -u2 "Install the MCP normally; then ask Codex to install this repository's three skills."
  exit 2
fi

missing_paths=()
for skill_name in categorize-zenmoney-receipts review-zenmoney-categories find-zenmoney-savings; do
  if [[ ! -d "$codex_root/skills/$skill_name" ]]; then
    missing_paths+=("skills/$skill_name")
  fi
done

if (( ${#missing_paths[@]} == 0 )); then
  print "ZenMoney agent skills are already installed."
  exit 0
fi

python3 "$installer" \
  --repo jetteim/zenmoney-receipts \
  --path "${missing_paths[@]}"

print "ZenMoney agent skills installed. Start a new Codex session to load them."
