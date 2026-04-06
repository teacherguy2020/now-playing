#!/bin/zsh
set -euo pipefail

WORKSPACE="/Users/brianwis/.openclaw/workspace"
SOURCE_DIR="$WORKSPACE/docs/now-playing-knowledge"
RENDERED_DIR="$WORKSPACE/docs/now-playing-knowledge-site"
BACKUP_ROOT="$WORKSPACE/backups/now-playing-wiki"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
DEST="$BACKUP_ROOT/now-playing-wiki_$STAMP.tar.gz"
LATEST="$BACKUP_ROOT/latest.tar.gz"

mkdir -p "$BACKUP_ROOT"

tar -czf "$DEST" \
  -C "$WORKSPACE/docs" \
  now-playing-knowledge \
  now-playing-knowledge-site

ln -sfn "$(basename "$DEST")" "$LATEST"

# Keep the newest 30 archives
ls -1t "$BACKUP_ROOT"/now-playing-wiki_*.tar.gz 2>/dev/null | tail -n +31 | while read -r old; do
  rm -f "$old"
done

echo "Created wiki backup: $DEST"
