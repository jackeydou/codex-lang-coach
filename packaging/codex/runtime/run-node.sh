#!/bin/sh
# Desktop hosts need not inherit a version manager's shell initialization.
# Probe capabilities instead of accepting an incompatible node from PATH.
supports_node() {
  [ -x "$1" ] && "$1" --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 5)) process.exit(1);' >/dev/null 2>&1
}

if [ -n "${LANGUAGE_COACH_NODE:-}" ]; then
  if supports_node "$LANGUAGE_COACH_NODE"; then
    exec "$LANGUAGE_COACH_NODE" "$@"
  fi
  echo "Language Coach: LANGUAGE_COACH_NODE must point to Node.js 22.5+ with node:sqlite." >&2
  exit 1
fi

path_node=$(command -v node 2>/dev/null || true)
for candidate in "$path_node" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node \
  "${VOLTA_HOME:-$HOME/.volta}/bin/node" \
  "${MISE_DATA_DIR:-$HOME/.local/share/mise}"/installs/node/*/bin/node \
  "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node \
  "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node \
  "$HOME"/Library/Application\ Support/fnm/node-versions/*/installation/bin/node; do
  if supports_node "$candidate"; then
    exec "$candidate" "$@"
  fi
done

echo "Language Coach: cannot find Node.js 22.5+ with node:sqlite. Install Node.js or set LANGUAGE_COACH_NODE to its absolute path in the MCP configuration." >&2
exit 1
