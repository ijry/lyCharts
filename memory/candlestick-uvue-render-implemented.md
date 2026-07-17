---
name: candlestick-uvue-render-implemented
description: uni-app-x candlestick component shipped with stubbed render layer; now implemented
metadata:
  type: project
---

The uni-app-x K线 component `uin-app-x/uni_modules/ly-charts/components/ly-charts-candlestick/ly-charts-candlestick.uvue` was committed (29d41d2) with a complete data/layout layer but an entirely **stubbed rendering + interaction layer** — every draw method was empty, so the chart area rendered blank (no error). This was NOT a uni-app-x version issue.

On 2026-07-14 I implemented all paint/interaction methods (drawChart pipeline, title, legend, Y split area, Y/X axes, candles, MA overlay lines, volume bars, mark points/lines, dataZoom slider + drag, crosshair, tooltip box, touch handlers) following the exact `ctx.$callMethod(...)` + strict-UTS patterns used by the working `ly-charts-line` / `ly-charts-bar` components and `libs/uvue/chartHelper.uts`.

**Why:** it explains why the component looked broken despite correct data code.
**How to apply:** the fix is only verifiable by compiling in HBuilderX on-device (no standalone UTS compiler in-repo). Candle raw data order is `[open, close, low, high]` (ECharts convention). ly-canvas exposes no shadow API. Working reference components: `ly-charts-line`, `ly-charts-bar`.
