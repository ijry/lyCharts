# Coordinate Conversion Runtime API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ECharts-compatible `convertToPixel`, `convertFromPixel`, and `containPixel` to line/bar/scatter charts without publishing a new package version.

**Architecture:** Cache a `coordSys` snapshot after each successful Cartesian draw, then expose pure conversion helpers from runtimeHelper. Components only pass current geometry and series hit data into those helpers. Mirror the same helpers and methods across Vue, uvue, and `uin-app-x`.

**Tech Stack:** Vue 3 SFCs, uni-app canvas API, uni-app-x uvue/UTS components, existing lyCharts runtime helper structure, sibling markdown docs in `D:\Repos\xyito\open\lyCharts-docs`.

## Global Constraints

- Do not publish a new version in this phase.
- Support only `line`, `bar`, and `scatter`.
- Support only primary Cartesian system (`xAxisIndex`/`yAxisIndex`/`gridIndex` must be `0` or omitted).
- Reuse last successful draw geometry; do not recompute layout from raw option inside conversion methods.
- Keep Vue, uvue, and `uin-app-x` behavior aligned.
- Update `D:\Repos\xyito\open\lyCharts-docs` for line/bar/scatter.
- Do not revert unrelated repository changes.
- Do not change existing draw algorithms beyond writing `coordSys` and exposing the three methods.

---

## File Structure

- Modify `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`: add JS coordinate helpers.
- Modify `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: add UTS coordinate helpers.
- Modify `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: mirror UTS helpers.
- Modify Vue charts:
  - `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`
- Modify uvue charts:
  - `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
  - `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
  - `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`
- Mirror uvue charts under:
  - `uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
  - `uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
  - `uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`
- Modify docs:
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`

---

### Task 1: Shared JS Coordinate Helpers

**Files:**
- Modify: `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`
- Test: manual node-style checks via temporary PowerShell/`node -e` snippets in later verification task

**Interfaces:**
- Produces:
  - `normalizeCoordPair(value): [number, number] | null`
  - `isSupportedCartesianFinder(finder): boolean`
  - `getSeriesIndexFromFinder(finder): number | null`
  - `createCartesianCoordSys(input): object | null`
  - `convertCartesianToPixel(coordSys, value): [number, number] | null`
  - `convertCartesianFromPixel(coordSys, value): [number, number] | null`
  - `containCartesianPixel(coordSys, seriesData, finder, value): boolean`

- [ ] **Step 1: Append helper block after `appendSeriesData`**

Append this exact block to `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`:

```js
function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeCoordPair(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length < 2) return null;
    const x = toFiniteNumber(value[0]);
    const y = toFiniteNumber(value[1]);
    if (x == null || y == null) return null;
    return [x, y];
  }
  if (typeof value === 'object') {
    const x = toFiniteNumber(value.x ?? value[0]);
    const y = toFiniteNumber(value.y ?? value[1]);
    if (x == null || y == null) return null;
    return [x, y];
  }
  return null;
}

export function isSupportedCartesianFinder(finder) {
  if (finder == null || finder === false) return true;
  if (typeof finder !== 'object') return false;
  const axisKeys = ['xAxisIndex', 'yAxisIndex', 'gridIndex'];
  for (const key of axisKeys) {
    if (Object.prototype.hasOwnProperty.call(finder, key)) {
      const index = Number(finder[key]);
      if (!Number.isInteger(index) || index !== 0) return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(finder, 'seriesIndex')) {
    const seriesIndex = Number(finder.seriesIndex);
    if (!Number.isInteger(seriesIndex) || seriesIndex < 0) return false;
  }
  return true;
}

export function getSeriesIndexFromFinder(finder) {
  if (finder == null || typeof finder !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(finder, 'seriesIndex')) return null;
  const seriesIndex = Number(finder.seriesIndex);
  if (!Number.isInteger(seriesIndex) || seriesIndex < 0) return null;
  return seriesIndex;
}

export function createCartesianCoordSys(input = {}) {
  const grid = input.grid;
  if (!grid) return null;
  const left = toFiniteNumber(grid.left);
  const top = toFiniteNumber(grid.top);
  const width = toFiniteNumber(grid.width);
  const height = toFiniteNumber(grid.height);
  const minY = toFiniteNumber(input.minY);
  const maxY = toFiniteNumber(input.maxY);
  if (
    left == null || top == null || width == null || height == null ||
    minY == null || maxY == null || width <= 0 || height <= 0
  ) {
    return null;
  }

  const chartType = input.chartType || 'line';
  const categoryCenters = Array.isArray(input.categoryCenters)
    ? input.categoryCenters.map(item => toFiniteNumber(item)).filter(item => item != null)
    : [];
  const minX = toFiniteNumber(input.minX);
  const maxX = toFiniteNumber(input.maxX);

  if (chartType === 'scatter') {
    if (minX == null || maxX == null || maxX === minX || maxY === minY) return null;
  } else if (!categoryCenters.length || maxY === minY) {
    return null;
  }

  return {
    type: 'cartesian2d',
    chartType,
    grid: { left, top, width, height },
    categoryCenters,
    minX,
    maxX,
    minY,
    maxY
  };
}

function mapCategoryIndexToPixelX(categoryCenters, dataX) {
  if (!Array.isArray(categoryCenters) || categoryCenters.length === 0) return null;
  if (categoryCenters.length === 1) return categoryCenters[0];
  const maxIndex = categoryCenters.length - 1;
  const clamped = Math.min(Math.max(dataX, 0), maxIndex);
  const leftIndex = Math.floor(clamped);
  const rightIndex = Math.min(leftIndex + 1, maxIndex);
  if (leftIndex === rightIndex) return categoryCenters[leftIndex];
  const ratio = clamped - leftIndex;
  return categoryCenters[leftIndex] + (categoryCenters[rightIndex] - categoryCenters[leftIndex]) * ratio;
}

function mapPixelXToCategoryIndex(categoryCenters, pixelX) {
  if (!Array.isArray(categoryCenters) || categoryCenters.length === 0) return null;
  if (categoryCenters.length === 1) return 0;
  if (pixelX <= categoryCenters[0]) return 0;
  const last = categoryCenters.length - 1;
  if (pixelX >= categoryCenters[last]) return last;
  for (let i = 0; i < last; i++) {
    const left = categoryCenters[i];
    const right = categoryCenters[i + 1];
    if (pixelX >= left && pixelX <= right) {
      if (right === left) return i;
      return i + (pixelX - left) / (right - left);
    }
  }
  return last;
}

function mapValueToPixelY(grid, minY, maxY, value) {
  const ratio = (value - minY) / (maxY - minY);
  return grid.top + grid.height - ratio * grid.height;
}

function mapPixelYToValue(grid, minY, maxY, pixelY) {
  const ratio = (grid.top + grid.height - pixelY) / grid.height;
  return minY + ratio * (maxY - minY);
}

export function convertCartesianToPixel(coordSys, value) {
  if (!coordSys || coordSys.type !== 'cartesian2d') return null;
  const pair = normalizeCoordPair(value);
  if (!pair) return null;
  const [dataX, dataY] = pair;
  const grid = coordSys.grid;
  let pixelX = null;
  if (coordSys.chartType === 'scatter') {
    if (coordSys.maxX === coordSys.minX) return null;
    const ratioX = (dataX - coordSys.minX) / (coordSys.maxX - coordSys.minX);
    pixelX = grid.left + ratioX * grid.width;
  } else {
    pixelX = mapCategoryIndexToPixelX(coordSys.categoryCenters, dataX);
  }
  if (pixelX == null || coordSys.maxY === coordSys.minY) return null;
  const pixelY = mapValueToPixelY(grid, coordSys.minY, coordSys.maxY, dataY);
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) return null;
  return [pixelX, pixelY];
}

export function convertCartesianFromPixel(coordSys, value) {
  if (!coordSys || coordSys.type !== 'cartesian2d') return null;
  const pair = normalizeCoordPair(value);
  if (!pair) return null;
  const [pixelX, pixelY] = pair;
  const grid = coordSys.grid;
  let dataX = null;
  if (coordSys.chartType === 'scatter') {
    if (coordSys.maxX === coordSys.minX || grid.width === 0) return null;
    dataX = coordSys.minX + ((pixelX - grid.left) / grid.width) * (coordSys.maxX - coordSys.minX);
  } else {
    dataX = mapPixelXToCategoryIndex(coordSys.categoryCenters, pixelX);
  }
  if (dataX == null || coordSys.maxY === coordSys.minY || grid.height === 0) return null;
  const dataY = mapPixelYToValue(grid, coordSys.minY, coordSys.maxY, pixelY);
  if (!Number.isFinite(dataX) || !Number.isFinite(dataY)) return null;
  return [dataX, dataY];
}

function pointInRect(x, y, rect) {
  return x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height;
}

function isNearSeriesPoint(chartType, point, pixelX, pixelY) {
  if (!point) return false;
  if (chartType === 'bar' && point.barWidth != null) {
    const width = Number(point.barWidth) || 0;
    const height = Math.abs(Number(point.height != null ? point.height : point.barHeight) || 0);
    const top = Number(point.y) || 0;
    const left = Number(point.x) || 0;
    const bottom = point.height != null ? top + (Number(point.height) || 0) : top + height;
    const minY = Math.min(top, bottom);
    const maxY = Math.max(top, bottom);
    return pixelX >= left && pixelX <= left + width && pixelY >= minY && pixelY <= maxY;
  }
  const radius = chartType === 'scatter'
    ? Math.max(Number(point.symbolSize) || 0, 8)
    : 10;
  const dx = (Number(point.x) || 0) - pixelX;
  const dy = (Number(point.y) || 0) - pixelY;
  return (dx * dx + dy * dy) <= radius * radius;
}

export function containCartesianPixel(coordSys, seriesData, finder, value) {
  if (!coordSys || coordSys.type !== 'cartesian2d') return false;
  if (!isSupportedCartesianFinder(finder)) return false;
  const pair = normalizeCoordPair(value);
  if (!pair) return false;
  const [pixelX, pixelY] = pair;
  if (!pointInRect(pixelX, pixelY, coordSys.grid)) return false;

  const seriesIndex = getSeriesIndexFromFinder(finder);
  if (seriesIndex == null) return true;
  if (!Array.isArray(seriesData) || !seriesData[seriesIndex]) return false;
  const series = seriesData[seriesIndex];
  const points = Array.isArray(series.points) ? series.points : [];
  for (let i = 0; i < points.length; i++) {
    if (isNearSeriesPoint(coordSys.chartType, points[i], pixelX, pixelY)) return true;
  }
  return false;
}
```

- [ ] **Step 2: Smoke-check helper exports**

Run:

```powershell
node -e "const h=require('./src/uni_modules/ly-charts/libs/util/runtimeHelper.js'); const coord=h.createCartesianCoordSys({chartType:'line',grid:{left:40,top:20,width:200,height:100},categoryCenters:[40,140,240],minY:0,maxY:100}); console.log(h.convertCartesianToPixel(coord,[1,50])); console.log(h.convertCartesianFromPixel(coord,[140,70])); console.log(h.containCartesianPixel(coord,[{points:[{x:140,y:70}]}], {seriesIndex:0}, [140,70]));"
```

Expected:
- first log roughly `[140, 70]`
- second log roughly `[1, 50]`
- third log `true`

- [ ] **Step 3: Commit helpers**

```powershell
git add src/uni_modules/ly-charts/libs/util/runtimeHelper.js
git commit -m "feat: add cartesian coordinate conversion helpers"
```

---

### Task 2: Vue Line Chart Integration

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`

**Interfaces:**
- Consumes: helpers from Task 1
- Produces: `convertToPixel(finder, value)`, `convertFromPixel(finder, value)`, `containPixel(finder, value)`

- [ ] **Step 1: Import helpers**

Extend the existing runtimeHelper import list to include:

```js
createCartesianCoordSys,
convertCartesianToPixel,
convertCartesianFromPixel,
containCartesianPixel,
isSupportedCartesianFinder
```

- [ ] **Step 2: Add `coordSys` state**

Near `plotGrid` / `categoryCenters` declarations, add:

```js
const coordSys = ref(null);
```

- [ ] **Step 3: Write snapshot after successful geometry build**

In `drawChart`, immediately after `categoryCenters.value = ...` and before axis pointer drawing, set:

```js
coordSys.value = createCartesianCoordSys({
  chartType: 'line',
  grid: plotGrid.value,
  categoryCenters: categoryCenters.value,
  minY: chartHelper.adjustedYMin,
  maxY: chartHelper.adjustedYMax
});
```

If draw exits early before geometry is ready, leave `coordSys` unchanged only when the previous chart remains valid; on hard failure paths that clear series geometry, also set `coordSys.value = null`.

- [ ] **Step 4: Clear snapshot in `clear()`**

Inside `clear()`, after resetting `categoryCenters`, add:

```js
coordSys.value = null;
```

- [ ] **Step 5: Add conversion methods**

Add these methods near other runtime APIs, before `defineExpose`:

```js
const convertToPixel = (finder, value) => {
  if (disposed.value || !isSupportedCartesianFinder(finder)) return null;
  return convertCartesianToPixel(coordSys.value, value);
};

const convertFromPixel = (finder, value) => {
  if (disposed.value || !isSupportedCartesianFinder(finder)) return null;
  return convertCartesianFromPixel(coordSys.value, value);
};

const containPixel = (finder, value) => {
  if (disposed.value) return false;
  return containCartesianPixel(coordSys.value, seriesData.value, finder, value);
};
```

- [ ] **Step 6: Export methods**

Add to `defineExpose`:

```js
convertToPixel,
convertFromPixel,
containPixel
```

- [ ] **Step 7: Commit**

```powershell
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue
git commit -m "feat: expose coordinate conversion APIs on line chart"
```

---

### Task 3: Vue Bar Chart Integration

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`

**Interfaces:**
- Consumes: helpers from Task 1
- Produces: same three methods as line

- [ ] **Step 1: Import helpers**

Same import additions as Task 2.

- [ ] **Step 2: Add `coordSys` state**

```js
const coordSys = ref(null);
```

- [ ] **Step 3: Snapshot after category centers are computed**

Immediately after `categoryCenters.value = centers;`:

```js
coordSys.value = createCartesianCoordSys({
  chartType: 'bar',
  grid: plotGrid.value,
  categoryCenters: categoryCenters.value,
  minY: chartHelper.adjustedYMin,
  maxY: chartHelper.adjustedYMax
});
```

- [ ] **Step 4: Clear on `clear()`**

```js
coordSys.value = null;
```

- [ ] **Step 5: Add methods and expose them**

Use the same method bodies as line, with `chartType` already stored in `coordSys` as `'bar'`.

```js
const convertToPixel = (finder, value) => {
  if (disposed.value || !isSupportedCartesianFinder(finder)) return null;
  return convertCartesianToPixel(coordSys.value, value);
};

const convertFromPixel = (finder, value) => {
  if (disposed.value || !isSupportedCartesianFinder(finder)) return null;
  return convertCartesianFromPixel(coordSys.value, value);
};

const containPixel = (finder, value) => {
  if (disposed.value) return false;
  return containCartesianPixel(coordSys.value, seriesData.value, finder, value);
};
```

Expose:

```js
convertToPixel,
convertFromPixel,
containPixel
```

- [ ] **Step 6: Commit**

```powershell
git add src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue
git commit -m "feat: expose coordinate conversion APIs on bar chart"
```

---

### Task 4: Vue Scatter Chart Integration

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`

**Interfaces:**
- Consumes: helpers from Task 1
- Produces: same three methods, continuous x/y semantics

- [ ] **Step 1: Import helpers**

In the scatter Options API import section, add:

```js
createCartesianCoordSys,
convertCartesianToPixel,
convertCartesianFromPixel,
containCartesianPixel,
isSupportedCartesianFinder
```

- [ ] **Step 2: Add state**

In `data()`:

```js
coordSys: null,
```

- [ ] **Step 3: Snapshot after plot grid assignment**

In `drawChart`, after:

```js
this.plotGrid = {
  left: this.grid.left,
  top: this.grid.top,
  width: this.canvasWidth - this.grid.left - this.grid.right,
  height: this.canvasHeight - this.grid.top - this.grid.bottom
};
```

add:

```js
this.coordSys = createCartesianCoordSys({
  chartType: 'scatter',
  grid: this.plotGrid,
  minX,
  maxX,
  minY,
  maxY
});
```

Use the same `minX/maxX/minY/maxY` locals already computed for drawing.

- [ ] **Step 4: Ensure scatter points carry size for series containment**

Where scatter points are pushed into `seriesData`, include:

```js
symbolSize
```

so `containCartesianPixel` can use `max(symbolSize, 8)`.

If current point object is:

```js
points.push({
  x,
  y,
  value: [xValue, yValue],
  name: value[2] || `(${xValue}, ${yValue})`,
  seriesName: serie.name || `Series ${index}`
});
```

change to:

```js
points.push({
  x,
  y,
  value: [xValue, yValue],
  name: value[2] || `(${xValue}, ${yValue})`,
  seriesName: serie.name || `Series ${index}`,
  symbolSize
});
```

- [ ] **Step 5: Clear on `clear()`**

```js
this.coordSys = null;
```

- [ ] **Step 6: Add methods**

```js
convertToPixel(finder, value) {
  if (this.disposed || !isSupportedCartesianFinder(finder)) return null;
  return convertCartesianToPixel(this.coordSys, value);
},
convertFromPixel(finder, value) {
  if (this.disposed || !isSupportedCartesianFinder(finder)) return null;
  return convertCartesianFromPixel(this.coordSys, value);
},
containPixel(finder, value) {
  if (this.disposed) return false;
  return containCartesianPixel(this.coordSys, this.seriesData, finder, value);
}
```

Because scatter uses Options API, these methods are automatically available on the instance; no `defineExpose` is required unless the file already uses one.

- [ ] **Step 7: Commit**

```powershell
git add src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue
git commit -m "feat: expose coordinate conversion APIs on scatter chart"
```

---

### Task 5: UTS Coordinate Helpers

**Files:**
- Modify: `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`
- Modify: `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`

**Interfaces:**
- Produces the same helper names as Task 1, with UTS-friendly types and `UTSJSONObject` usage where needed.

- [ ] **Step 1: Append UTS helpers to both runtimeHelper.uts files**

Mirror the JS logic with these constraints:

- Use `export function ...`
- Prefer `UTSJSONObject` for finder/result bags when reading dynamic keys
- Avoid optional chaining if nearby file style avoids it
- Keep pure functions and no callbacks

Recommended signatures:

```uts
export function normalizeCoordPair(value : any) : number[] | null
export function isSupportedCartesianFinder(finder : any) : boolean
export function getSeriesIndexFromFinder(finder : any) : number | null
export function createCartesianCoordSys(input : any) : UTSJSONObject | null
export function convertCartesianToPixel(coordSys : any, value : any) : number[] | null
export function convertCartesianFromPixel(coordSys : any, value : any) : number[] | null
export function containCartesianPixel(coordSys : any, seriesData : any, finder : any, value : any) : boolean
```

Implementation requirements:

- `createCartesianCoordSys` stores:
  - `type = 'cartesian2d'`
  - `chartType`
  - `grid`
  - `categoryCenters`
  - `minX`, `maxX`, `minY`, `maxY`
- line/bar fail when category centers empty or `minY == maxY`
- scatter fails when x/y ranges are zero-width
- `containCartesianPixel` with `seriesIndex` inspects `series.points`

Keep both `src` and `uin-app-x` files identical for this helper block.

- [ ] **Step 2: Commit**

```powershell
git add src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts
git commit -m "feat: add UTS cartesian coordinate conversion helpers"
```

---

### Task 6: uvue Line/Bar/Scatter Integration

**Files:**
- Modify:
  - `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
  - `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
  - `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`
  - `uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
  - `uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
  - `uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`

**Interfaces:**
- Consumes: UTS helpers from Task 5
- Produces: same three public methods

- [ ] **Step 1: Import helpers in each uvue file**

Add:

```uts
createCartesianCoordSys,
convertCartesianToPixel,
convertCartesianFromPixel,
containCartesianPixel,
isSupportedCartesianFinder
```

to the existing runtimeHelper import list.

- [ ] **Step 2: Add `coordSys` state in each component `data()`**

```uts
coordSys: null as any,
```

- [ ] **Step 3: Snapshot after geometry is ready**

Line:

```uts
this.coordSys = createCartesianCoordSys({
  chartType: 'line',
  grid: this.plotGrid,
  categoryCenters: this.categoryCenters,
  minY: chartHelper.adjustedYMin,
  maxY: chartHelper.adjustedYMax
})
```

Bar:

```uts
this.coordSys = createCartesianCoordSys({
  chartType: 'bar',
  grid: this.plotGrid,
  categoryCenters: this.categoryCenters,
  minY: chartHelper.adjustedYMin,
  maxY: chartHelper.adjustedYMax
})
```

Scatter:

```uts
this.coordSys = createCartesianCoordSys({
  chartType: 'scatter',
  grid: this.plotGrid,
  minX: range.minX,
  maxX: range.maxX,
  minY: range.minY,
  maxY: range.maxY
})
```

Use the actual local range variable names already present in each file.

- [ ] **Step 4: Clear in `clear()`**

```uts
this.coordSys = null
```

- [ ] **Step 5: Add methods**

```uts
convertToPixel(finder : any, value : any) : any {
  if (this.disposed || !isSupportedCartesianFinder(finder)) return null
  return convertCartesianToPixel(this.coordSys, value)
},
convertFromPixel(finder : any, value : any) : any {
  if (this.disposed || !isSupportedCartesianFinder(finder)) return null
  return convertCartesianFromPixel(this.coordSys, value)
},
containPixel(finder : any, value : any) : boolean {
  if (this.disposed) return false
  return containCartesianPixel(this.coordSys, this.seriesData, finder, value)
}
```

- [ ] **Step 6: Scatter point size**

In both scatter uvue files, ensure each point object includes `symbolSize` exactly as in Vue scatter.

- [ ] **Step 7: Keep src and uin-app-x copies aligned**

After editing `src/...uvue`, mirror the same method/state/import changes into the matching `uin-app-x/...uvue` files. Prefer direct parity over re-deriving logic.

- [ ] **Step 8: Commit**

```powershell
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue
git commit -m "feat: expose coordinate conversion APIs on uvue cartesian charts"
```

---

### Task 7: Docs Updates

**Files:**
- Modify:
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`

- [ ] **Step 1: Extend method tables**

In each file's "ECharts 运行时兼容 API" table, add:

```md
| convertToPixel | 将数据坐标转换为像素坐标 | finder, value |
| convertFromPixel | 将像素坐标转换为数据坐标 | finder, value |
| containPixel | 判断像素点是否落在坐标系/系列附近 | finder, value |
```

- [ ] **Step 2: Add behavior notes**

After the existing runtime notes, add a short paragraph:

Line/bar:

```md
`convertToPixel` / `convertFromPixel` 当前仅支持主直角坐标系。折线/柱状图的 `value` 形如 `[categoryIndex, yValue]`，`categoryIndex` 可为小数并按类目中心插值；`containPixel` 默认判断是否落在绘图区内，传入 `seriesIndex` 时会进一步判断是否靠近该系列点。本批坐标转换 API 已在源码中实现，需等待后续发版后进入插件市场版本。
```

Scatter:

```md
`convertToPixel` / `convertFromPixel` 当前仅支持主直角坐标系。散点图的 `value` 形如 `[xValue, yValue]`，使用最近一次绘制的连续坐标范围换算；`containPixel` 默认判断是否落在绘图区内，传入 `seriesIndex` 时会进一步判断是否靠近该系列散点。本批坐标转换 API 已在源码中实现，需等待后续发版后进入插件市场版本。
```

- [ ] **Step 3: Add examples**

Line example:

```js
const pixel = chartRef.value?.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [1, 120])
const data = chartRef.value?.convertFromPixel(null, pixel)
const inside = chartRef.value?.containPixel({ seriesIndex: 0 }, pixel)
```

Bar example: same as line.

Scatter example:

```js
const pixel = chartRef.value?.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [8, 42])
const data = chartRef.value?.convertFromPixel(null, pixel)
const inside = chartRef.value?.containPixel({ seriesIndex: 0 }, pixel)
```

- [ ] **Step 4: Commit docs repo**

In `D:\Repos\xyito\open\lyCharts-docs`:

```powershell
git add docs/charts/line.md docs/charts/bar.md docs/charts/scatter.md
git commit -m "docs: document coordinate conversion runtime APIs"
```

---

### Task 8: Static Verification And Final Commit Hygiene

**Files:**
- Verify only; commit only if leftover edits remain

- [ ] **Step 1: Search for public method exposure**

Run:

```powershell
rg -n "convertToPixel|convertFromPixel|containPixel|createCartesianCoordSys" src/uni_modules/ly-charts uin-app-x/uni_modules/ly-charts
```

Expected:
- helpers present in JS + both UTS runtimeHelper files
- methods present in line/bar/scatter Vue + uvue + uin-app-x copies

- [ ] **Step 2: Diff check**

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Optional type-check baseline**

```powershell
pnpm type-check
```

If it fails for known unrelated reasons (`uni_modules/uview-plus/types` missing, removed TS options), record that baseline and continue. Do not spend time fixing unrelated type-check debt in this phase.

- [ ] **Step 4: Final status**

```powershell
git status --short --branch
```

Expected:
- clean worktree, or only unrelated pre-existing changes
- branch ahead of origin by the new implementation commits
- no publish script executed

---

## Self-Review

1. **Spec coverage**
   - Shared helpers: Task 1 + Task 5
   - Vue line/bar/scatter methods and snapshots: Tasks 2-4
   - uvue + uin-app-x parity: Task 6
   - docs: Task 7
   - verification / no publish: Task 8
2. **Placeholder scan**
   - No TBD steps; helper code and method bodies are concrete
3. **Type/name consistency**
   - Public methods stay `convertToPixel` / `convertFromPixel` / `containPixel`
   - Snapshot name stays `coordSys`
   - Helper names stay aligned across JS and UTS
