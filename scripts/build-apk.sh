#!/usr/bin/env bash
# Genera el APK de Android (WebView a pantalla completa con el index.html autocontenido).
# Solo necesita Java 17+, python3 y acceso a Maven Central: descarga aapt2 y los recursos
# del framework (dentro de apktool-lib), las clases de Android (Robolectric android-all),
# dx y apksig. Uso: npm run build:apk   (antes: npm run build:html)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AND="$ROOT/android"
T="$AND/.tools"
B="$AND/build"
OUT="$ROOT/apk/CincoNochesEnBrunos.apk"
VERSION_CODE="${VERSION_CODE:-2}"
VERSION_NAME="${VERSION_NAME:-1.1}"
KS="$AND/brunos.keystore"
KS_PASS="${KS_PASS:-cinconoches}"
MC=https://repo1.maven.org/maven2

mkdir -p "$T"
fetch() {
  [ -s "$T/$2" ] && return 0
  echo "Descargando $2..."
  for i in 1 2 3 4 5; do
    curl -fsSL -o "$T/$2" "$MC/$1" && return 0
    sleep $((i * 4))
  done
  echo "No se pudo descargar $1" && exit 1
}
fetch org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar apktool-lib.jar
fetch org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar android-all.jar
fetch com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar dx.jar
fetch com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar apksig.jar
if [ ! -x "$T/aapt2" ]; then
  (cd "$T" && unzip -o -q apktool-lib.jar prebuilt/linux/aapt2 prebuilt/android-framework.jar \
    && mv prebuilt/linux/aapt2 aapt2 && mv prebuilt/android-framework.jar framework.jar && rm -rf prebuilt && chmod +x aapt2)
fi
if [ ! -f "$T/SignApk.class" ]; then
  javac -cp "$T/apksig.jar" -d "$T" "$AND/tools-src/SignApk.java"
fi
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias brunos -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Cinco Noches en Brunos, O=Pizzeria Brunos"
fi

[ -f "$ROOT/index.html" ] || { echo "Falta index.html: ejecuta npm run build:html"; exit 1; }
rm -rf "$B" && mkdir -p "$B/assets" "$B/gen" "$B/classes"
cp "$ROOT/index.html" "$B/assets/index.html"

# Recursos y manifiesto
"$T/aapt2" compile --dir "$AND/res" -o "$B/res.zip"
"$T/aapt2" link -o "$B/base.apk" -I "$T/framework.jar" --manifest "$AND/AndroidManifest.xml" \
  --java "$B/gen" -A "$B/assets" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" --replace-version "$B/res.zip"

# Código: Java -> .class -> classes.dex
javac -source 8 -target 8 -nowarn -Xlint:-options -encoding UTF-8 -cp "$T/android-all.jar" -d "$B/classes" \
  $(find "$AND/src" "$B/gen" -name '*.java')
java -cp "$T/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$B/classes.dex" "$B/classes"
(cd "$B" && zip -q -j base.apk classes.dex)

# Alineación a 4 bytes de las entradas sin comprimir (resources.arsc) y firma v1+v2
python3 "$ROOT/scripts/zipalign.py" "$B/base.apk" "$B/aligned.apk"
mkdir -p "$(dirname "$OUT")"
# apksig 2.3.0 usa clases internas de sun.security (hay que exportarlas en Java 17+)
JX="--add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED"
java $JX -cp "$T/apksig.jar:$T" SignApk "$B/aligned.apk" "$OUT" "$KS" brunos "$KS_PASS"
ls -la "$OUT"
