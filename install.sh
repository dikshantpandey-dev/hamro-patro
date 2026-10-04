#!/usr/bin/env bash
# Install Hamro Patro for the current user by symlinking this clone into
# GNOME Shell's extension directory, so `git pull` updates it in place.
set -euo pipefail

UUID="hamro-patro@dikshantpandey-dev"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
FONT_URL="https://github.com/mhnpd/nepali-font/raw/master/fonts/Kalimati.ttf"
FONT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/fonts/kalimati"

echo "==> Compiling settings schema"
glib-compile-schemas "$SRC/schemas"

echo "==> Linking $DEST -> $SRC"
mkdir -p "$(dirname "$DEST")"
if [ -L "$DEST" ]; then
  rm "$DEST"
elif [ -e "$DEST" ]; then
  backup="$DEST.bak.$(date +%Y%m%d%H%M%S)"
  echo "    existing install moved to $backup"
  mv "$DEST" "$backup"
fi
ln -s "$SRC" "$DEST"

if fc-list | grep -i kalimati >/dev/null; then
  echo "==> Kalimati already installed"
else
  echo "==> Installing Kalimati font"
  mkdir -p "$FONT_DIR"
  tmp="$(mktemp)"
  if curl -fsSL -o "$tmp" "$FONT_URL" && file "$tmp" | grep -q "TrueType"; then
    install -m 0644 "$tmp" "$FONT_DIR/Kalimati.ttf"
    fc-cache -f "$FONT_DIR" >/dev/null
  else
    echo "    download failed; Nepali text will fall back to Noto Sans Devanagari"
  fi
  rm -f "$tmp"
fi

echo "==> Enabling extension"
if ! gnome-extensions enable "$UUID" 2>/dev/null; then
  # The shell only discovers new extension directories at login, so add it
  # to the enabled list directly; it loads on next login.
  python3 - "$UUID" <<'EOF'
import ast, subprocess, sys
uuid = sys.argv[1]
cur = ast.literal_eval(subprocess.check_output(
    ["gsettings", "get", "org.gnome.shell", "enabled-extensions"], text=True).strip() or "[]")
if uuid not in cur:
    cur.append(uuid)
    subprocess.check_call(["gsettings", "set", "org.gnome.shell", "enabled-extensions", str(cur)])
EOF
fi

echo
echo "Done. Log out and back in to load Hamro Patro."
