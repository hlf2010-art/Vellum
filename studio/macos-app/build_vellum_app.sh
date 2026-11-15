#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
APP_DIR="$BUILD_DIR/Vellum.app"
CONTENTS="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RES_DIR="$CONTENTS/Resources"
APP_RES="$RES_DIR/app"
ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"

MOD_CACHE="$BUILD_DIR/module-cache"
rm -rf "$APP_DIR" "$ICONSET_DIR" "$MOD_CACHE"
mkdir -p "$MACOS_DIR" "$APP_RES/studio/macos-app" "$ICONSET_DIR" "$MOD_CACHE"
export CLANG_MODULE_CACHE_PATH="$MOD_CACHE"

echo "1/4 Generating Vellum app icon..."
swift -module-cache-path "$MOD_CACHE" "$SCRIPT_DIR/make_icon.swift" "$ICONSET_DIR"
python3 - "$ICONSET_DIR" "$RES_DIR/AppIcon.icns" <<'PY'
import struct, sys
from pathlib import Path

iconset = Path(sys.argv[1])
out_path = Path(sys.argv[2])
chunks = [
    (b"icp4", "icon_16x16.png"),
    (b"icp5", "icon_32x32.png"),
    (b"icp6", "icon_32x32@2x.png"),
    (b"ic07", "icon_128x128.png"),
    (b"ic08", "icon_256x256.png"),
    (b"ic09", "icon_512x512.png"),
    (b"ic10", "icon_512x512@2x.png"),
    (b"ic11", "icon_16x16@2x.png"),
    (b"ic12", "icon_32x32@2x.png"),
    (b"ic13", "icon_128x128@2x.png"),
    (b"ic14", "icon_256x256@2x.png"),
]
body = bytearray()
for tag, name in chunks:
    p = iconset / name
    if p.is_file():
        data = p.read_bytes()
        body += tag + struct.pack(">I", 8 + len(data)) + data
out_path.write_bytes(b"icns" + struct.pack(">I", 8 + len(body)) + body)
PY

echo "2/4 Compiling native macOS app binary..."
swiftc -O -module-cache-path "$MOD_CACHE" -framework Cocoa -framework WebKit "$SCRIPT_DIR/VellumApp.swift" -o "$MACOS_DIR/Vellum"

echo "3/4 Staging Vellum web UI and Python services..."
cp "$SCRIPT_DIR/Info.plist" "$CONTENTS/Info.plist"
cp "$ROOT_DIR/Vellum-Lumen.html" "$APP_RES/Vellum-Lumen.html"
cp "$ROOT_DIR/Start Studio AI.command" "$APP_RES/Start Studio AI.command"
cp "$ROOT_DIR/Start MOD WORK Image Service.command" "$APP_RES/Start MOD WORK Image Service.command"
cp "$SCRIPT_DIR/serve_vellum.py" "$APP_RES/studio/macos-app/serve_vellum.py"

rsync -a \
  --exclude "__pycache__" \
  --exclude "*.pyc" \
  --exclude "jobs" \
  --exclude "test_*.py" \
  --exclude "*.test.*" \
  --exclude "macos-app" \
  "$ROOT_DIR/studio/" "$APP_RES/studio/"

chmod +x "$MACOS_DIR/Vellum" "$APP_RES/Start Studio AI.command" "$APP_RES/Start MOD WORK Image Service.command" "$APP_RES/studio/macos-app/serve_vellum.py"

echo "4/4 Ad-hoc signing Vellum.app..."
codesign --force --deep --sign - "$APP_DIR"

rm -rf "$ICONSET_DIR" "$MOD_CACHE"
echo "Built: $APP_DIR"
du -sh "$APP_DIR"
