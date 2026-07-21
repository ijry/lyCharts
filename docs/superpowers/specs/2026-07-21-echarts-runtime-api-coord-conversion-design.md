# ECharts Runtime API Coordinate Conversion Design

**Date:** 2026-07-21

**Scope:** Add practical ECharts-compatible coordinate conversion APIs: `convertToPixel`, `convertFromPixel`, and `containPixel`. This phase targets Cartesian charts only and does not publish a new package version.

## Goals

- Add instance methods:
  - `convertToPixel(finder, value)`
  - `convertFromPixel(finder, value)`
  - `containPixel(finder, value)`
- Support `line`, `bar`, and `scatter` charts first.
- Keep Vue, uvue, and `uin-app-x` copies aligned.
- Reuse existing geometry state already produced during draw:
  - `plotGrid`
  - `categoryCenters`
  - `seriesData`
  - axis value ranges used by the last successful draw
- Update sibling docs in `D:\Repos\xyito\open\lyCharts-docs`.
- Commit implementation and docs, but do not run the publishing flow unless explicitly requested later.

## Non-Goals

- Do not publish a new version in this phase.
- Do not implement coordinate conversion for `pie`, `radar`, or `gauge`.
- Do not implement multi-axis systems (`xAxisIndex > 0`, `yAxisIndex > 0`, dual axes).
- Do not implement polar / calendar / geo / graph coordinate systems.
- Do not invent a full ECharts coordinate-system registry.
- Do not change existing drawing algorithms, tooltip hit-testing, or runtime action behavior.
- Do not require callers to pass canvas element or DOM finder objects; lyCharts already exposes methods on the chart instance.

## Current Context

Phase 1-3 already added runtime instance APIs and interaction actions. Cartesian charts already compute and cache:

- `plotGrid`: plotting rectangle `{ left, top, width, height }`
- `categoryCenters`: category x centers for line/bar
- `seriesData`: drawn point geometry for hit-testing and tooltip

`chartHelper.js` already has generic helpers:

- `screenToDataCoords(...)`
- `dataToScreenCoords(...)`

Those helpers are not sufficient as-is:

1. line/bar use `xAxisPadding` and category centers, not pure equal grid spacing alone.
2. bar category centers prefer actual bar midpoints.
3. scatter uses continuous x/y value ranges, not category indices.
4. current `plotGrid` does not store axis ranges, so reverse conversion cannot rely on `plotGrid` alone.

Therefore this phase should add a small, explicit geometry snapshot and shared conversion helpers instead of calling the old helpers directly.

## Proposed API Contract

### convertToPixel

```js
chart.convertToPixel(finder, value)
```

Supported call shapes for this phase:

```js
chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [x, y])
chart.convertToPixel({ seriesIndex: 0 }, [x, y])
chart.convertToPixel(null, [x, y])
```

Return:

- success: `[pixelX, pixelY]`
- failure: `null`

Semantics:

- `value` must be a 2-item array-like payload.
- line/bar:
  - `value[0]` is category index (number). Non-integer values are allowed and linearly interpolated between category centers.
  - `value[1]` is y data value.
- scatter:
  - `value[0]` is continuous x data value.
  - `value[1]` is continuous y data value.
- finder is accepted for ECharts-like shape, but this phase only supports the primary Cartesian system:
  - missing finder is treated as primary axes
  - `xAxisIndex` / `yAxisIndex` other than `0` / `undefined` return `null`
  - `seriesIndex` may be accepted, but does not change the coordinate system in this phase
- conversion uses the last successful draw geometry, not a recompute from raw option.

### convertFromPixel

```js
chart.convertFromPixel(finder, value)
```

Supported call shapes:

```js
chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pixelX, pixelY])
chart.convertFromPixel({ seriesIndex: 0 }, [pixelX, pixelY])
chart.convertFromPixel(null, [pixelX, pixelY])
```

Return:

- success: `[dataX, dataY]`
- failure: `null`

Semantics:

- `value` must be a 2-item pixel coordinate array-like payload.
- line/bar:
  - `dataX` is a continuous category index relative to current visible categories
  - `dataY` is y data value in the last drawn axis range
- scatter:
  - both values are continuous data values in the last drawn x/y ranges
- same finder restrictions as `convertToPixel`.
- pixel coordinates are chart-local canvas coordinates, consistent with current touch/tooltip coordinates.

### containPixel

```js
chart.containPixel(finder, value)
```

Supported call shapes:

```js
chart.containPixel(null, [pixelX, pixelY])
chart.containPixel({ gridIndex: 0 }, [pixelX, pixelY])
chart.containPixel({ seriesIndex: 0 }, [pixelX, pixelY])
```

Return:

- boolean only

Semantics for this phase:

1. If chart is disposed, not drawn, or geometry is missing: `false`
2. Base rule: pixel is inside `plotGrid` rectangle, inclusive on edges
3. If finder specifies unsupported multi-axis indexes: `false`
4. If finder includes `seriesIndex`:
   - first require plot-grid containment
   - then require that the series exists in current `seriesData`
   - then require the pixel is near any visible point of that series
   - nearness threshold:
     - scatter: `max(symbolSize, 8)` if available, otherwise `10`
     - line: `10`
     - bar: use bar rect if available (`x/y/barWidth/height`), otherwise radius `10`
5. Invalid pixel payload returns `false`

This is intentionally practical rather than a full ECharts component-finder implementation.

## Geometry Snapshot

Each supported chart stores a `coordSys` snapshot after successful draw:

```js
{
  type: 'cartesian2d',
  chartType: 'line' | 'bar' | 'scatter',
  grid: { left, top, width, height },
  // line/bar
  categoryCenters: number[],
  // scatter continuous x range
  minX: number | null,
  maxX: number | null,
  // shared y range for line/bar/scatter
  minY: number,
  maxY: number
}
```

Population rules:

- line/bar:
  - `categoryCenters` from current draw
  - `minY` / `maxY` from adjusted axis range actually used for drawing
  - `minX` / `maxX` unused (`null`)
- scatter:
  - `minX` / `maxX` / `minY` / `maxY` from the range used for drawing
  - `categoryCenters` empty

`clear()` and failed draws reset `coordSys` to `null`.
`dispose()` also clears it.

## Architecture

### Shared Helpers

Add pure helpers in:

- `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`
- `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`
- `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`

Recommended helpers:

```js
normalizePixelPair(value) -> [x, y] | null
normalizeDataPair(value) -> [x, y] | null
isSupportedCartesianFinder(finder) -> boolean
getSeriesIndexFromFinder(finder) -> number | null
convertCartesianToPixel(coordSys, value) -> [px, py] | null
convertCartesianFromPixel(coordSys, value) -> [x, y] | null
containCartesianPixel(coordSys, seriesData, finder, value) -> boolean
```

Conversion math:

#### line/bar x

- if `categoryCenters.length === 0`: fail
- if `categoryCenters.length === 1`: x pixel is that center for any data x
- else:
  - clamp interpolation to centers by index range `[0, length - 1]`
  - fractional index interpolates between adjacent centers
- reverse: map pixel x onto nearest segment between centers and return continuous index

#### line/bar y and scatter x/y

```text
pixel = origin + (value - min) / (max - min) * size
value = min + (pixel - origin) / size * (max - min)
```

Y axis is inverted:

```text
pixelY = grid.top + grid.height - ratio * grid.height
```

Zero-range axes fail conversion instead of dividing by zero.

### Component Integration

For `line`, `bar`, `scatter` Vue and uvue components:

1. Keep existing draw path.
2. After geometry is ready, write `coordSys`.
3. Expose:
   - `convertToPixel`
   - `convertFromPixel`
   - `containPixel`
4. Methods:
   - return safe failure values when disposed or geometry missing
   - do not redraw
   - do not mutate option or interaction state

### Unsupported Charts

`pie`, `radar`, `gauge`, and other charts:

- do not expose these methods in this phase, or if already sharing a generic expose surface later, return `null` / `false`
- docs state coordinate conversion is currently limited to Cartesian charts

## Error Handling

- Invalid finder indexes return failure values, never throw.
- Invalid value payloads return failure values, never throw.
- Missing geometry returns failure values.
- Helper math must guard zero-length ranges and empty category centers.
- uvue helpers should avoid dynamic callback-heavy APIs and stay UTS-friendly.
- Conversion outside axis range still returns numbers when geometry exists; it is not clipped unless category centers require endpoint clamping for index mapping.

## Documentation

Update `D:\Repos\xyito\open\lyCharts-docs`:

- `docs/charts/line.md`
- `docs/charts/bar.md`
- `docs/charts/scatter.md`

Each should document:

- method signatures
- return values
- line/bar category-index semantics
- scatter continuous-value semantics
- finder limitations for this phase
- that this batch is implemented in source but not published until a later release request

Optional short note in shared runtime docs if such a page is already the place for cross-chart API notes.

## Testing

Manual/static verification:

1. After draw, `convertToPixel` for known category/value returns expected pixel near drawn points.
2. Round-trip:
   - line/bar: `convertFromPixel(convertToPixel([i, y]))` recovers approximate `[i, y]`
   - scatter: same for continuous values
3. `containPixel` is `true` inside plot grid and `false` outside.
4. series-limited `containPixel` is `true` near a series point and `false` far from it.
5. Before first draw / after `clear()` / after `dispose()`:
   - conversions return `null`
   - `containPixel` returns `false`
6. Unsupported finder indexes fail safely.
7. Vue and uvue expose matching method names.
8. `git diff --check` passes.
9. Existing `pnpm type-check` baseline remains acceptable if unrelated repo issues persist.

## Acceptance Criteria

- `line` / `bar` / `scatter` expose the three coordinate APIs consistently.
- Conversion uses last drawn geometry and matches current chart layout, including `xAxisPadding` and bar centers.
- No regression to existing runtime APIs or draw behavior.
- Sibling docs describe the new APIs and limitations.
- Work is committed, but no release script is run in this phase.

## Implementation Notes

Recommended order:

1. Shared helper functions and pure conversion math
2. Vue line/bar/scatter geometry snapshot + method exposure
3. Mirror uvue + `uin-app-x`
4. Docs updates
5. Static verification and commit
