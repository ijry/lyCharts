---
name: uin-app-x-build-run
description: How to build/deploy the uin-app-x uvue test app to the Android emulator via HBuilderX CLI
metadata:
  type: project
---

The `uin-app-x/` test app has no CLI build script in package.json — it compiles only through HBuilderX. To rebuild uvue changes onto the emulator from the command line, use the HBuilderX CLI at `/c/ProgramData/HBuilderX/cli.exe`.

Run to Android emulator:
`/c/ProgramData/HBuilderX/cli.exe launch app-android --project uin-app-x`

- HBuilderX must be running (`cli.exe open` starts it).
- Project must be imported in HBuilderX; `cli.exe project list` shows imported projects (uin-app-x is one of them).
- Emulator must be connected (`adb devices`; here `emulator-5554`, density 420 → dpr 2.625).
- First compile is slow; run in background.
- Useful flags: `--cleanCache true` (uni-app-x only), `--compile true` (compile only), `--native-log true`.

**Why:** uvue edits to files under `uin-app-x/uni_modules/` do not hot-reload; they need a full HBuilderX recompile to appear on-device.
**How to apply:** After editing uvue/uts, run the launch command and re-screenshot via `adb exec-out screencap` to verify. See [[ly-canvas-dpr-scaling]].
