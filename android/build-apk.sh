#!/usr/bin/env bash
# Builds the student edition's APK from dist-student/world-table-games-student.html (made by
# `npm run build:html:student`; `npm run build:apk` does both). Needs JDK 17+, Gradle 8.13+ and the Android SDK
# (platform 35, build-tools 35) under ANDROID_HOME. The APK is signed with WTG_KEYSTORE (password in
# WTG_KEYSTORE_PASSWORD); without one, a key is made once under ~/.wtg/ and kept there. Keep that key: an update
# installs over the app only when it is signed with the same key.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
page="$root/dist-student/world-table-games-student.html"
[ -f "$page" ] || { echo "Missing $page: run npm run build:html:student first" >&2; exit 1; }
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
[ -d "$ANDROID_HOME/platforms" ] || { echo "No Android SDK at $ANDROID_HOME (set ANDROID_HOME)" >&2; exit 1; }
export ANDROID_HOME
echo "sdk.dir=$ANDROID_HOME" > "$here/local.properties"
mkdir -p "$here/app/src/main/assets"
cp "$page" "$here/app/src/main/assets/index.html"
if [ -z "${WTG_KEYSTORE:-}" ]; then
  mkdir -p "$HOME/.wtg"
  export WTG_KEYSTORE="$HOME/.wtg/student-release.jks"
  if [ ! -f "$WTG_KEYSTORE" ]; then
    head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$HOME/.wtg/student-release.pass"
    keytool -genkeypair -v -keystore "$WTG_KEYSTORE" -alias student -keyalg RSA -keysize 2048 -validity 10000 \
      -storepass "$(cat "$HOME/.wtg/student-release.pass")" -keypass "$(cat "$HOME/.wtg/student-release.pass")" \
      -dname "CN=World Table Games Student, O=World Table Games, C=KR" >/dev/null 2>&1
  fi
  export WTG_KEYSTORE_PASSWORD="$(cat "$HOME/.wtg/student-release.pass")"
fi
export WTG_VERSION_NAME="$(node -p "require('$root/package.json').version")"
export WTG_VERSION_CODE="${WTG_VERSION_CODE:-$(date +%s | awk '{print int(($1 - 1700000000) / 60)}')}"
# The wrapper fetches its own Gradle when none is given; GRADLE may name an installed one.
gradle_cmd="${GRADLE:-./gradlew}"
(cd "$here" && "$gradle_cmd" --no-daemon -q assembleRelease)
cp "$here/app/build/outputs/apk/release/app-release.apk" "$root/dist-student/world-table-games-student.apk"
echo "APK: $root/dist-student/world-table-games-student.apk"
