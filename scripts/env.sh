#!/usr/bin/env bash

# Cargar con: source scripts/env.sh
# Solo modifica el shell actual y no cambia los runtimes globales del sistema.

CDOR_PNPM_RUNTIME="${PNPM_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/pnpm}"
CDOR_LOCAL_ANDROID_SDK="${XDG_DATA_HOME:-$HOME/.local/share}/cdor-android-sdk"
if [[ -d "$CDOR_LOCAL_ANDROID_SDK/platforms/android-36" ]]; then
  CDOR_ANDROID_SDK="$CDOR_LOCAL_ANDROID_SDK"
else
  CDOR_ANDROID_SDK="${ANDROID_HOME:-/opt/android-sdk}"
fi

if [[ -x "$CDOR_PNPM_RUNTIME/bin/node" ]]; then
  export PNPM_HOME="$CDOR_PNPM_RUNTIME"
  export PATH="$PNPM_HOME/bin:$PATH"
fi

export JAVA_HOME="/usr/lib/jvm/java-17-openjdk"
export ANDROID_HOME="$CDOR_ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ -z "${NDK_HOME:-}" && -d "$ANDROID_HOME/ndk" ]]; then
  NDK_HOME="$(
    find -L "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" \
      | sort -V \
      | tail -n 1
  )"
  if [[ -n "$NDK_HOME" ]]; then
    export NDK_HOME="$ANDROID_HOME/ndk/$NDK_HOME"
  fi
fi

if [[ -n "${NDK_HOME:-}" ]]; then
  CDOR_NDK_BIN="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
  if [[ -d "$CDOR_NDK_BIN" ]]; then
    export CC_aarch64_linux_android="$CDOR_NDK_BIN/aarch64-linux-android24-clang"
    export CC_armv7_linux_androideabi="$CDOR_NDK_BIN/armv7a-linux-androideabi24-clang"
    export CC_i686_linux_android="$CDOR_NDK_BIN/i686-linux-android24-clang"
    export CC_x86_64_linux_android="$CDOR_NDK_BIN/x86_64-linux-android24-clang"
    export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CC_aarch64_linux_android"
    export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$CC_armv7_linux_androideabi"
    export CARGO_TARGET_I686_LINUX_ANDROID_LINKER="$CC_i686_linux_android"
    export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$CC_x86_64_linux_android"
    export AR_aarch64_linux_android="$CDOR_NDK_BIN/llvm-ar"
    export AR_armv7_linux_androideabi="$CDOR_NDK_BIN/llvm-ar"
    export AR_i686_linux_android="$CDOR_NDK_BIN/llvm-ar"
    export AR_x86_64_linux_android="$CDOR_NDK_BIN/llvm-ar"
  fi
  unset CDOR_NDK_BIN
fi

export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

unset CDOR_PNPM_RUNTIME
unset CDOR_LOCAL_ANDROID_SDK
unset CDOR_ANDROID_SDK
