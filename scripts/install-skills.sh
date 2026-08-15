#!/usr/bin/env bash
set -euo pipefail

codex_root="${CODEX_HOME:-$HOME/.codex}"
installer="$codex_root/skills/.system/skill-installer/scripts/install-skill-from-github.py"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(dirname -- "$script_dir")"
refresh=false

if [[ "${1:-}" == "--refresh" ]]; then
  refresh=true
elif [[ -n "${1:-}" ]]; then
  printf '%s\n' "Usage: ./scripts/install-skills.sh [--refresh]" >&2
  exit 2
fi

if [[ ! -f "$installer" ]]; then
  printf '%s\n' "Codex skill installer was not found at $installer" >&2
  printf '%s\n' "Install the MCP normally; then ask Codex to install this repository's three skills." >&2
  exit 2
fi

missing_paths=()
refresh_names=()
for skill_name in categorize-zenmoney-receipts review-zenmoney-categories find-zenmoney-savings; do
  target="$codex_root/skills/$skill_name"
  if [[ ! -d "$target" ]]; then
    missing_paths+=("skills/$skill_name")
  elif [[ "$refresh" == true ]]; then
    if ! grep -q "^name: $skill_name$" "$target/SKILL.md"; then
      printf '%s\n' "Refusing to refresh unrecognized skill directory: $target" >&2
      exit 2
    fi
    refresh_names+=("$skill_name")
  fi
done

if (( ${#missing_paths[@]} == 0 && ${#refresh_names[@]} == 0 )); then
  printf '%s\n' "ZenMoney agent skills are already installed."
  exit 0
fi

if (( ${#missing_paths[@]} > 0 )); then
  python3 "$installer" \
    --repo jetteim/zenmoney-receipts \
    --path "${missing_paths[@]}"
fi

for skill_name in "${refresh_names[@]}"; do
  cp -R "$repo_root/skills/$skill_name/." "$codex_root/skills/$skill_name/"
done

if (( ${#refresh_names[@]} > 0 )); then
  printf '%s\n' "Refreshed ${#refresh_names[@]} ZenMoney agent skills from this clone."
fi
printf '%s\n' "ZenMoney agent skills installed. Start a new Codex session to load them."
