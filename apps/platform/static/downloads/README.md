# Descargas públicas

Aquí va el APK que ofrece `/install`.

Nombre fijo esperado por la página:

    mac-android.apk

La página lee la versión y el tamaño reales en tiempo de petición
(`/install/+page.server.ts`), así que basta con sustituir el archivo: no hay
que tocar código al publicar una versión nueva.

Generar el APK:

    pnpm tauri android build --apk --target aarch64
    ./scripts/sign-android-dev-release.sh

El APK firmado queda en:

    apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/
      app-universal-release-dev-signed.apk

Cópialo aquí como `mac-android.apk`.

Nunca subas aquí el keystore ni ningún `.jks`.
