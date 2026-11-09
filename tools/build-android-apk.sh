#!/usr/bin/env bash
# Builds the Android app: the real game/ folder bundled into a WebView shell.
# Needs only apt packages (no Android Studio, no dl.google.com):
#   apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 default-jdk-headless
#
# Output: android/build/ping-pong.apk
# Signing: set PP_KEYSTORE, PP_KEYSTORE_PASS (and optionally PP_KEY_ALIAS) to sign with the
# release key. Without them a throwaway debug key is generated in android/build/debug.keystore
# (APKs signed with different keys cannot update each other).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/android/native"
OUT="$ROOT/android/build"
JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
[ -f "$JAR" ] || { echo "android.jar not found: $JAR" >&2; exit 1; }

rm -rf "$OUT/stage" "$OUT/classes"
mkdir -p "$OUT/stage/assets" "$OUT/classes"
cp -r "$ROOT/game" "$OUT/stage/assets/game"
rm -f "$OUT/stage/assets/game/sw.js"   # the app serves its own files; see game/js/app/pwa.js

javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -d "$OUT/classes" \
  "$SRC"/src/io/github/lagilava/pingpong/*.java
dalvik-exchange --dex --output="$OUT/classes.dex" "$OUT/classes" >/dev/null

rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk"
# Media and images are stored uncompressed so AssetManager.openFd gives lengths for HTTP Range.
aapt package -f -M "$SRC/AndroidManifest.xml" -S "$SRC/res" -A "$OUT/stage/assets" -I "$JAR" \
  --min-sdk-version 24 --target-sdk-version 34 \
  -0 mp3 -0 ogg -0 wav -0 m4a -0 mp4 -0 webm -0 png -0 jpg -0 jpeg -0 webp -0 woff2 -0 glb \
  -F "$OUT/unsigned.apk"
( cd "$OUT" && aapt add unsigned.apk classes.dex >/dev/null )
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ -n "${PP_KEYSTORE:-}" ]; then
  KS="$PP_KEYSTORE"; PASS="${PP_KEYSTORE_PASS:?set PP_KEYSTORE_PASS}"; ALIAS="${PP_KEY_ALIAS:-pingpong}"
else
  KS="$OUT/debug.keystore"; PASS="android"; ALIAS="pingpong-debug"
  [ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Ping Pong Debug,O=Lagilava" >/dev/null 2>&1
fi
apksigner sign --ks "$KS" --ks-pass "pass:$PASS" --ks-key-alias "$ALIAS" --out "$OUT/ping-pong.apk" "$OUT/aligned.apk"
apksigner verify --print-certs "$OUT/ping-pong.apk" | head -3
ls -l "$OUT/ping-pong.apk"
