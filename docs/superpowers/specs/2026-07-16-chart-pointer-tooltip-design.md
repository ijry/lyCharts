# Multi-Chart Pointer Tooltip Design

**Date:** 2026-07-16  
**Status:** Approved for implementation planning  
**Scope:** Add K-line-like click/drag current-data display to non-candlestick charts while keeping ECharts-compatible option/event APIs.

## Goal

Bring line, bar, scatter, pie, radar, and gauge charts to the same interactive data inspection experience already implemented by candlestick charts:

- Click a data item to select and show current values.
- Drag across the chart to continuously update the selected data.
- Draw in-chart pointer/tooltip visuals when enabled by `option.tooltip`.
- Emit ECharts-style payloads through existing component events.
- Keep both `uni-app` (`src/uni_modules/ly-charts`) and `uni-app-x` (`uin-app-x/uni_modules/ly-charts`) implementations in sync.

## Non-Goals

- Do not rewrite chart rendering architecture.
- Do not extract a shared UTS/JS interaction framework in this pass.
- Do not add new external dependencies.
- Do not change candlestick behavior except for keeping payload conventions aligned.
- Do not require demo pages to own the visual pointer/tooltip drawing.

## Current Baseline

Candlestick already implements the target pattern:

- Maintains `activePointer` state.
- Updates on `touchstart` / `touchmove` / `touchend`.
- Draws crosshair and tooltip box from `option.tooltip` / `option.tooltip.axisPointer`.
- Emits:
  - `tooltipShow` during pointer updates
  - `click` for near-stationary taps with ECharts-like fields (`componentType`, `seriesType`, `seriesName`, `name`, `dataIndex`, `value`, `color`, `event`)

Other charts currently vary:

| Chart | Existing interaction | Missing vs candlestick |
|---|---|---|
| line | click nearest point only | drag update, pointer/tooltip draw, `tooltipShow` |
| bar | click bar hit only | drag update, pointer/tooltip draw, `tooltipShow` |
| scatter | click nearest point only | drag update, pointer/tooltip draw, `tooltipShow` |
| pie | click sector + optional `tooltipShow` | drag update, visual tooltip, richer ECharts payload |
| radar | mostly click/raw touch | hit testing, pointer/tooltip draw, structured events |
| gauge | raw click emit | value payload + optional tooltip visual |

## Design Decision

Use **Approach A: per-chart in-component active pointer**.

Reasoning:

1. Matches the proven candlestick implementation style already in both ends.
2. Keeps public API surface unchanged: still consume ECharts-like `option`, still expose `click` / `tooltipShow`.
3. Avoids cross-runtime helper extraction complexity between JS Vue and UTS uvue in this pass.
4. Allows chart-specific hit testing without forcing a one-size abstraction prematurely.

## Architecture

Each target chart component gains the same interaction lifecycle:

1. During draw, persist hit-testable geometry in component state (`seriesData`, sector angles, radar points, gauge center/value).
2. On touch start, resolve nearest/hit data and set `activePointer`.
3. On touch move, re-resolve data continuously and redraw pointer/tooltip.
4. On touch end:
   - Always refresh active pointer for the release position.
   - If movement is within tap threshold, emit `click` with the active pointer payload.
5. On every successful pointer update, emit `tooltipShow` with the same payload shape used for display.

### Shared behavioral rules

- Tap threshold: about `8px` movement (align with candlestick; existing charts using `5px` may be normalized to `8px` for consistency).
- If no data is hit, keep previous pointer or clear based on chart type:
  - Cartesian charts (line/bar/scatter): clear only if touch is outside plot grid.
  - Pie/radar: clear only if touch is outside hit radius/region.
  - Gauge: keep last shown value unless touch is outside gauge area and no hit is found.
- Drawing order: base chart first, then axis pointer, then tooltip box.
- Existing `setOption` / `resize` APIs remain unchanged.

## Chart-Specific Behavior

### Line

- Hit strategy: nearest category by X within plot area; collect all series values at that category (axis trigger style).
- Visuals:
  - Vertical axis pointer line at category X.
  - Optional horizontal cross line if `tooltip.axisPointer.type === 'cross'`.
  - Tooltip box listing category and each series value/color.
- Events:
  - Primary payload represents the nearest series point.
  - Include `seriesValues` array for multi-series category inspection.

### Bar

- Hit strategy: prefer geometric bar hit; fallback to nearest category by X.
- Visuals:
  - Category highlight pointer (vertical line or soft category band).
  - Tooltip with category and matched bar value(s).
- Stacked bars: hit the topmost matching stack segment under the touch; payload includes stack series name and value.

### Scatter

- Hit strategy: nearest point within a fixed radius (existing ~20px, keep).
- Visuals:
  - Point emphasis marker.
  - Optional crosshair centered on selected point.
  - Tooltip with series name and `[x, y]` value.
- Drag continuously snaps to nearest point under finger.

### Pie

- Hit strategy: angle + radius sector test (existing), including ring charts with inner radius exclusion.
- Visuals:
  - Optional sector emphasis stroke.
  - Tooltip near touch/sector midpoint with name, value, percent.
- Trigger model: item-style (`tooltip.trigger` defaulting to item behavior for pie).

### Radar

- Hit strategy: nearest indicator vertex / nearest series point around radar polygon.
- Visuals:
  - Indicator ray or point marker.
  - Tooltip with indicator name and series values.
- Payload includes `indicatorIndex` and `seriesName`.

### Gauge

- Hit strategy: touch inside gauge radius.
- Visuals:
  - Tooltip or detail-adjacent readout for current value.
  - No axis crosshair.
- Payload includes current series value and formatted detail text when available.

## ECharts-Compatible API Contract

### Option compatibility

Continue reading existing ECharts-like fields:

```ts
option.tooltip?.show
option.tooltip?.showContent
option.tooltip?.trigger // 'item' | 'axis' | 'none'
option.tooltip?.formatter // optional; support string templates where practical
option.tooltip?.backgroundColor
option.tooltip?.borderColor
option.tooltip?.borderWidth
option.tooltip?.textStyle
option.tooltip?.axisPointer?.show
option.tooltip?.axisPointer?.type // 'line' | 'cross' | 'shadow' (best-effort)
option.tooltip?.axisPointer?.lineStyle
```

Rules:

- `tooltip.show === false` or `tooltip.showContent === false`: do not draw tooltip content.
- `tooltip.axisPointer.show === false`: do not draw pointer lines.
- Missing tooltip config: default to enabled visuals for interactive inspection, matching candlestick practical defaults.
- Unknown formatter function support remains best-effort; string placeholders like `{b}` / `{c}` may be supported where easy, otherwise fallback to built-in text.

### Event compatibility

All charts emit:

#### `tooltipShow`

Fired on pointer updates (start/move/end when a data item is active).

Common fields:

```ts
{
  componentType: 'series',
  seriesType: 'line' | 'bar' | 'scatter' | 'pie' | 'radar' | 'gauge',
  seriesName?: string,
  name?: string | number,
  dataIndex?: number,
  value: any,
  color?: string,
  percent?: number, // pie
  seriesValues?: Array<{ seriesName: string, value: any, color?: string }>,
  event?: { offsetX: number, offsetY: number }
}
```

#### `click`

Fired on tap (low movement). Payload mirrors `tooltipShow` fields for the selected item.

Existing demo handlers that only read `name` / `value` / `seriesName` remain valid.

## Dual-End Implementation Scope

Update both ends for each chart:

1. `src/uni_modules/ly-charts/components/ly-charts-*/ly-charts-*.vue`
2. `src/uni_modules/ly-charts/components/ly-charts-*/ly-charts-*.uvue` when present
3. `uin-app-x/uni_modules/ly-charts/components/ly-charts-*/ly-charts-*.uvue`

Keep behavior parity between ends. Because UTS constraints differ, implementation may duplicate logic rather than share one helper module.

Optional demo polish (non-blocking for core feature):

- Add `@tooltipShow` handlers and compact external cards on non-candlestick demo pages, similar to candlestick demos.
- Core success does **not** depend on demo page cards; in-chart visuals are sufficient.

## Data Flow

```text
touch event
  -> resolve hit geometry from last render state
  -> build activePointer payload
  -> emit tooltipShow
  -> redraw chart + pointer + tooltip
  -> on tap end: emit click(payload)
```

Render state required per chart:

- line/bar: category centers, series points, grid bounds, y range
- scatter: point coordinates and values
- pie: center, radii, sector angle table
- radar: center, radius, indicator angles, series points
- gauge: center, radius, current value, series meta

## Error Handling and Edge Cases

- Empty series/data: ignore pointer updates, clear active pointer.
- Single data point: still allow selection and tooltip.
- Out-of-grid touch: do not invent data; keep or clear pointer per chart rule above.
- Rapid move events: always recompute from current touch coordinates; no animation dependency.
- Option hot update while pointer active: rebind pointer to same `dataIndex` when possible; otherwise clear.
- Canvas not ready: no-op touch handlers safely.

## Testing Strategy

Manual verification on both ends:

1. Line: drag across categories, multi-series tooltip updates, click emits once per tap.
2. Bar: stacked and grouped bars hit correctly while dragging.
3. Scatter: nearest-point snap while dragging.
4. Pie/ring: sector selection and percent display.
5. Radar: indicator/series selection.
6. Gauge: value tooltip on touch.
7. API checks:
   - `tooltip.show = false` hides content.
   - `axisPointer.show = false` hides lines.
   - Existing `@click` handlers still receive usable payloads.
8. Regression: candlestick pointer/tooltip remains intact.

## Implementation Notes

- Prefer minimal invasive edits inside existing draw/touch methods.
- Reuse candlestick visual language for tooltip box styling when chart has no custom tooltip style.
- Avoid breaking current click payload fields already consumed by demos.
- Normalize event field names toward ECharts params without removing existing convenience fields.

## Success Criteria

- Non-candlestick charts support click and drag inspection of current data.
- In-chart pointer/tooltip appears without requiring external wrappers.
- `option.tooltip` and event names remain ECharts-compatible.
- Behavior is available on both uni-app and uni-app-x chart components.
