# ECharts Runtime API Compatibility Design

**Date:** 2026-07-17

**Scope:** Add a practical first layer of ECharts-compatible runtime APIs to lyCharts while preserving the current per-chart component architecture and keeping `src/uni_modules/ly-charts` and `uin-app-x/uni_modules/ly-charts` behavior aligned.

## Goals

- Add common chart instance APIs beyond the existing `setOption()` and `resize()`.
- Add `on()` / `off()` event subscription APIs that bridge existing component events.
- Add `dispatchAction()` for the most useful programmatic interactions.
- Add `dataset` / `encode` preprocessing so ECharts-style tabular data can feed current renderers.
- Update the sibling documentation repository `D:\Repos\xyito\open\lyCharts-docs` with supported API boundaries.

## Non-Goals

- Do not implement a full ECharts runtime, scheduler, component model, or action bus.
- Do not add new chart types.
- Do not implement non-candlestick `dataZoom` behavior in this phase.
- Do not implement `highlight`, `downplay`, `select`, or `unselect` in this phase.
- Do not implement full tooltip `formatter`, DOM tooltip positioning, or all ECharts event names.

## Current Context

lyCharts currently exposes chart-specific Vue/uvue components for line, bar, scatter, pie, radar, gauge, and candlestick charts. Most components already consume an ECharts-like `option` prop and several expose `setOption(option, notMerge?)` and `resize()`. Existing interaction is emitted through Vue component events such as `click`, `tooltipShow`, and candlestick `zoom`.

The implementation is duplicated across:

- `src/uni_modules/ly-charts/components`
- `uin-app-x/uni_modules/ly-charts/components`

Documentation lives in the sibling repository:

- `D:\Repos\xyito\open\lyCharts-docs\docs\charts`

## Proposed API Contract

### Instance APIs

Each chart component should expose:

```js
chart.setOption(option, notMerge)
chart.getOption()
chart.resize()
chart.clear()
chart.dispose()
chart.showLoading(textOrOptions)
chart.hideLoading()
chart.getWidth()
chart.getHeight()
```

Behavior:

- `getOption()` returns the current normalized option snapshot where practical.
- `clear()` clears the canvas and resets active pointer / interaction state without destroying the component.
- `dispose()` marks the chart as disposed, clears the canvas, removes local event handlers, and makes later drawing calls no-op.
- `showLoading()` draws a lightweight canvas loading overlay.
- `hideLoading()` removes the loading overlay and redraws the current option.
- `getWidth()` and `getHeight()` return measured canvas dimensions.

### Event APIs

Each chart component should expose:

```js
chart.on(eventName, handler)
chart.off(eventName, handler)
```

Behavior:

- Supported event names in phase one: `click`, `tooltipShow`, and candlestick `zoom`.
- `on()` registers an additional programmatic listener without replacing Vue emits.
- `off(eventName, handler)` removes one handler.
- `off(eventName)` removes all handlers for that event.
- Event payloads reuse the current ECharts-like payloads already emitted by chart touch handlers.

### `dispatchAction()`

Each chart component should expose:

```js
chart.dispatchAction(action)
```

Supported actions:

- `showTip`: show the tooltip/pointer for `seriesIndex` + `dataIndex` when chart geometry is available.
- `hideTip`: clear active tooltip/pointer and redraw.
- `dataZoom`: update candlestick zoom range and emit `zoom`; no-op on non-candlestick charts.

Unsupported action types should be ignored safely and return `false` or an equivalent failure indicator rather than throwing.

### `dataset` / `encode`

Before rendering, chart options should be normalized:

```js
{
  dataset: {
    source: [
      ['month', 'sales', 'profit'],
      ['Jan', 120, 30],
      ['Feb', 200, 80]
    ]
  },
  xAxis: {},
  series: [
    { type: 'line', encode: { x: 'month', y: 'sales' } },
    { type: 'bar', encode: { x: 'month', y: 'profit' } }
  ]
}
```

Normalization rules:

- Support `dataset.source` as a two-dimensional array with a header row.
- Support `dataset.source` as an array of objects.
- Resolve `series.encode.x` into `xAxis.data` when an axis chart uses category data and `xAxis.data` is absent.
- Resolve `series.encode.y` into each `series.data`.
- If a series already has `data`, keep it as the higher-priority explicit value.
- Preserve original option fields and only add derived `xAxis.data` / `series.data` for existing renderers.
- Pie, radar, gauge, and scatter should receive best-effort value extraction where it maps cleanly to their existing data formats; unsupported mappings should leave existing data untouched.

## Architecture

### Shared Runtime Helpers

Add small shared helpers under the package library area rather than copying all logic into every component:

- A dataset normalizer for JavaScript components.
- A UTS-compatible dataset normalizer for uvue components.
- A lightweight event registry helper where language constraints allow it.
- Component-local wrappers for canvas clearing, loading overlays, and action dispatch because drawing APIs differ between Vue and uvue.

This keeps API behavior consistent while allowing chart-specific geometry and canvas handling to stay local.

### Component Integration

For each chart component:

1. Store `currentOption` as the normalized option used for drawing.
2. Route prop updates and `setOption()` through the same normalization path.
3. Emit existing Vue events as before.
4. Also notify handlers registered via `on()`.
5. Expose the new instance methods through `defineExpose()` or Options API methods.
6. Guard drawing and event methods when disposed.

Candlestick keeps its existing dataZoom implementation and becomes the first chart where `dispatchAction({ type: 'dataZoom' })` changes the visible range.

## Error Handling

- Invalid or missing options should not throw during normalization; the chart should render empty state or no-op as it currently does.
- Invalid `dispatchAction()` payloads should return `false`.
- Handlers registered by `on()` should be isolated so one handler failure does not break drawing or other handlers.
- `dispose()` should be idempotent.

## Documentation

Update `D:\Repos\xyito\open\lyCharts-docs`:

- Add or update shared API documentation for instance methods, event methods, `dispatchAction`, `dataset`, and `encode`.
- Update chart pages where API tables currently list only `setOption` / `resize` or outdated methods.
- Clearly mark phase-one limits: non-candlestick `dataZoom` is not implemented, unsupported actions are ignored, and this is ECharts-style compatibility rather than full ECharts.

## Testing

Manual and static validation should cover:

- Existing demo pages still render for all chart types.
- `setOption()` still updates chart data.
- `getOption()`, `getWidth()`, and `getHeight()` return stable values after first render.
- `clear()` clears the canvas and `setOption()` can render again afterward.
- `dispose()` prevents later drawing without throwing.
- `showLoading()` / `hideLoading()` work before and after data is set.
- `on()` receives click / tooltip events in addition to Vue emits.
- `off()` removes handlers.
- `dispatchAction({ type: 'showTip' })` shows an available tooltip for charts with hit geometry.
- `dispatchAction({ type: 'hideTip' })` clears the tooltip.
- `dispatchAction({ type: 'dataZoom' })` updates candlestick range and is safe on other charts.
- `dataset.source` with array rows and object rows maps into line/bar/scatter examples.

## Acceptance Criteria

- The three requested API groups are available consistently on supported chart components.
- Existing public props and events remain backward compatible.
- Unsupported ECharts actions fail safely.
- Documentation in the sibling docs repository reflects the new API and boundaries.
- No unrelated repository changes are reverted or included.
