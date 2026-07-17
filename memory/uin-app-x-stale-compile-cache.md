---
name: uin-app-x-stale-compile-cache
description: HBuilderX differential compile can serve stale classes and mask uvue code changes/errors
metadata:
  type: feedback
---

When rebuilding the `uin-app-x/` uvue project via HBuilderX CLI, the log line "检测到编译缓存部分失效，开始差量编译" (differential compile) can serve **stale cached android classes** — edits to a `.uvue` component (and the compile errors they contain) do not take effect, yet the build still reports "编译成功。应用启动成功". This masked both an on-canvas diagnostic (never appeared) and real UTS type errors for several rebuilds.

**Why:** the differential compiler skips recompiling a changed component when its cache heuristic misfires, so you validate against old code.

**How to apply:** when a uvue code change (especially a new/edited component) does not visibly take effect on-device, or when you need to be sure the compiler actually saw your edits, rebuild with `--cleanCache true` (uni-app-x only) to force a full recompile. A clean compile surfaced the genuine "Smart cast to 'Any' is impossible" errors that differential builds had hidden. See [[uin-app-x-build-run]] and [[uts-delegated-property-no-smartcast]].
