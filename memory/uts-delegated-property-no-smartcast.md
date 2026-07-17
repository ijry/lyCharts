---
name: uts-delegated-property-no-smartcast
description: UTS/uvue compile error "Smart cast to X is impossible, because 'prop' is a delegated property" and how to fix it
metadata:
  type: reference
---

In uni-app-x uvue components, `data()` fields compile to Kotlin **delegated properties** (Vue reactivity). Kotlin cannot smart-cast a delegated property after a null-check, so this FAILS to compile:

```uts
if (this.activePointer == null) return
const o = this.activePointer as UTSJSONObject  // error: Smart cast to 'Any' is impossible, because 'activePointer' is a delegated property
```

Fix: snapshot the reactive field into a local `const` first, then null-check and cast the local — never re-read `this.<field>` for narrowing in the same scope:

```uts
const activePointer = this.activePointer
if (activePointer == null) return
const o = activePointer as UTSJSONObject
```

Hit this across candlestick methods on `activePointer`, `sliderRect`, `renderState` (see [[candlestick-uvue-render-implemented]]).

Also note: the compiler **stops at the first error**, and 差量编译 (differential compile) can serve STALE cached classes so edits/errors don't appear — build with `cli.exe launch app-android --project uin-app-x --cleanCache true` when results look stale. See [[uin-app-x-build-run]].

Related UTS strictness: `UTSJSONObject.get()` returns nullable `Any?`; passing it to a param typed non-null `any` fails ("实际类型为 'Any?'，预期类型为 'Any'") — either cast at the call site (`... as UTSJSONObject`) or widen the param to `any | null`.
