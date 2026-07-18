# ECharts Runtime API Compatibility Phase 3 Design

**Date:** 2026-07-19

**Scope:** Extend lyCharts runtime compatibility with practical programmatic interaction APIs: `highlight` / `downplay`, `select` / `unselect` / `toggleSelect`, and `appendData`. This phase does not publish a new package version.

## Goals

- Add `dispatchAction({ type: 'highlight' })` and `dispatchAction({ type: 'downplay' })`.
- Add `dispatchAction({ type: 'select' })`, `dispatchAction({ type: 'unselect' })`, and `dispatchAction({ type: 'toggleSelect' })`.
- Add `appendData({ seriesIndex, data })` for line, bar, and scatter charts.
- Keep behavior aligned across Vue, uvue, and the `uin-app-x` copy.
- Update sibling docs in `D:\Repos\xyito\open\lyCharts-docs`.
- Commit implementation and docs, but do not run the publishing flow.

## Non-Goals

- Do not publish a new version in this phase.
- Do not implement full ECharts state machines or action bus scheduling.
- Do not implement `blur`, `legendSelect`, `legendUnSelect`, `legendAllSelect`, or `legendInverseSelect`.
- Do not add visual select/highlight support to gauge in this phase.
- Do not implement streaming or progressive rendering for `appendData`.
- Do not implement coordinate conversion APIs such as `convertToPixel`, `convertFromPixel`, or `containPixel`.

## Current Context

Phase 1 and 2 already added:

- Runtime instance APIs such as `setOption`, `getOption`, `resize`, `clear`, `dispose`, loading state, `on`, and `off`.
- `dispatchAction` for `showTip`, `hideTip`, candlestick `dataZoom`, line/bar/scatter `dataZoom`, and line/bar/scatter `legendToggleSelect`.
- `dataset.source` + `series.encode` preprocessing.
- Basic `tooltip.formatter`.

Chart components already generate hit geometry in `seriesData`, which is enough to style highlighted or selected points/bars/slices during redraw without introducing a new renderer.

## Proposed API Contract

### Highlight / Downplay

Supported actions:

```js
chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: 2 })
chart.dispatchAction({ type: 'downplay', seriesIndex: 0, dataIndex: 2 })
chart.dispatchAction({ type: 'downplay' })
```

Behavior:

- Highlight is transient visual emphasis.
- `highlight` with `seriesIndex` + `dataIndex` records an active highlight key and redraws.
- `highlight` without a valid target returns `false`.
- `downplay` with no target clears all highlight state.
- `downplay` with a target clears that one highlight state.
- Unsupported chart types return `false` instead of throwing.

Initial supported charts:

- line
- bar
- scatter
- pie
- radar

Gauge returns `false` for highlight/downplay in this phase.

### Select / Unselect / ToggleSelect

Supported actions:

```js
chart.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex: 2 })
chart.dispatchAction({ type: 'unselect', seriesIndex: 0, dataIndex: 2 })
chart.dispatchAction({ type: 'toggleSelect', seriesIndex: 0, dataIndex: 2 })
```

Behavior:

- Selection is persistent runtime state and survives redraws caused by tooltip movement, `dataZoom`, or `legendToggleSelect`.
- `clear()` removes selected and highlighted states.
- `setOption()` keeps selected state when merging and clears it when `notMerge === true`.
- `dispose()` clears all runtime state.
- A selected item should have a stronger visual style than a highlighted item when both states apply.
- Invalid targets return `false`.

Initial supported charts:

- line
- bar
- scatter
- pie
- radar

Gauge returns `false` for select actions in this phase.

### AppendData

Supported method:

```js
chart.appendData({
  seriesIndex: 0,
  data: [120, 140]
})
```

Behavior:

- Supported on line, bar, and scatter charts.
- `seriesIndex` defaults to `0`.
- `data` can be a single item or an array of items.
- The target series `data` array is appended and the chart redraws through the same normalization/render path as `setOption`.
- `getOption()` returns the appended data.
- `appendData()` returns `true` when data is appended and `false` for invalid payloads or unsupported chart types.
- Existing `dataZoom` config remains in place; appended data may be outside the current visible window until the caller updates `dataZoom`.
- This is not optimized for very large streams.

## Architecture

### Shared Runtime Helpers

Extend the existing runtime helper files with small pure utilities:

- Build stable item keys from `seriesIndex` and `dataIndex`.
- Add/remove/toggle item keys in plain runtime state objects.
- Append series data to a cloned option.
- Check whether a geometry item is highlighted or selected.

JavaScript helper APIs should be mirrored by UTS helper APIs where practical.

### Component Integration

For line, bar, and scatter:

1. Add `highlightState` and `selectState` runtime state.
2. Add `appendData()` to the exposed instance API.
3. Add `highlight`, `downplay`, `select`, `unselect`, and `toggleSelect` branches to `dispatchAction()`.
4. Style matching geometry during drawing:
   - selected item: stronger stroke or fill treatment.
   - highlighted item: lighter emphasis.
5. Clear interaction states in `clear()` and `dispose()`.
6. Clear states on `setOption(..., true)`.

For pie and radar:

1. Add `highlightState` and `selectState`.
2. Add the same action branches to `dispatchAction()`.
3. Use existing sector / radar point or polygon drawing loops to apply emphasis.
4. Do not add `appendData()` unless there is already a chart-local safe data append path.

For gauge:

- Keep unsupported action behavior safe and document the limitation.

## Error Handling

- Invalid action payloads return `false`.
- `appendData()` returns `false` when target series does not exist or `data` is missing.
- Drawing should ignore stale keys that no longer map to visible geometry after `dataZoom` or `legend.selected`.
- State helper failures should not throw during chart drawing.
- uvue should avoid function-style callbacks or dynamic structures that are not reliable in UTS.

## Documentation

Update `D:\Repos\xyito\open\lyCharts-docs`:

- line, bar, and scatter: document highlight/select actions and `appendData`.
- pie and radar: document highlight/select actions.
- gauge: state highlight/select/appendData are unsupported and safely ignored.
- Shared runtime API examples should note that this phase is not released yet until a future publish is requested.

## Testing

Manual/static verification should cover:

- `dispatchAction({ type: 'highlight' })` visually emphasizes target data for supported charts.
- `dispatchAction({ type: 'downplay' })` clears highlight.
- `select`, `unselect`, and `toggleSelect` persist across redraws and clear on `clear()`.
- `appendData()` appends to line/bar/scatter `series.data` and updates `getOption()`.
- Unsupported chart/action combinations return `false`.
- Vue and uvue component files expose matching public method names.
- `git diff --check` passes.
- Existing `pnpm type-check` baseline is recorded if unrelated config/type-definition errors remain.

## Acceptance Criteria

- Supported charts expose the requested runtime APIs consistently.
- Existing phase 1 and phase 2 behavior is not regressed.
- Sibling docs describe the new APIs and limitations.
- Work is committed, but no release script is run.
