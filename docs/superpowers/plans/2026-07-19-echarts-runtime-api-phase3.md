# ECharts Runtime API Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add practical ECharts-compatible `highlight` / `downplay`, `select` / `unselect` / `toggleSelect`, and `appendData` runtime APIs without publishing a new package version.

**Architecture:** Extend the existing runtime helpers with item-state and append-data utilities, then wire supported chart components through those helpers. Keep highlight and select as component-local runtime states so visual emphasis does not mutate user option data; use existing geometry loops for rendering emphasis.

**Tech Stack:** Vue 3 SFCs, uni-app canvas API, uni-app-x uvue/UTS components, existing lyCharts runtime helper structure, sibling markdown docs in `D:\Repos\xyito\open\lyCharts-docs`.

## Global Constraints

- Do not publish a new version in this phase.
- Preserve the current per-chart component architecture.
- Keep `src/uni_modules/ly-charts` and `uin-app-x/uni_modules/ly-charts` behavior aligned.
- Do not implement full ECharts state machines or action bus scheduling.
- Do not implement `blur`, `legendSelect`, `legendUnSelect`, `legendAllSelect`, or `legendInverseSelect`.
- Do not add visual select/highlight support to gauge in this phase.
- Do not implement streaming or progressive rendering for `appendData`.
- Do not implement coordinate conversion APIs such as `convertToPixel`, `convertFromPixel`, or `containPixel`.
- Update `D:\Repos\xyito\open\lyCharts-docs` with supported API boundaries.
- Do not revert unrelated repository changes.

---

## File Structure

- Modify `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`: add JavaScript item-state and append-data utilities.
- Modify `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: add UTS item-state and append-data utilities.
- Modify `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: mirror UTS helpers.
- Modify Vue axis charts:
  - `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`
- Modify Vue non-axis supported charts:
  - `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue`
- Modify matching uvue files under `src/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter,pie,radar}`.
- Modify matching uvue files under `uin-app-x/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter,pie,radar}`.
- Modify docs:
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\pie.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\radar.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\gauge.md`

---

### Task 1: Shared Runtime State Helpers

**Files:**
- Modify: `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`
- Modify: `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`
- Modify: `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`

**Interfaces:**
- Produces: `makeItemKey(seriesIndex: any, dataIndex: any): string | null`
- Produces: `setItemState(state: Record<string, boolean>, seriesIndex: any, dataIndex: any, enabled?: boolean): boolean`
- Produces: `toggleItemState(state: Record<string, boolean>, seriesIndex: any, dataIndex: any): boolean`
- Produces: `clearItemState(state: Record<string, boolean>, seriesIndex?: any, dataIndex?: any): boolean`
- Produces: `hasItemState(state: Record<string, boolean>, seriesIndex: any, dataIndex: any): boolean`
- Produces: `appendSeriesData(option: any, payload: any): { option: any, changed: boolean }`

- [ ] **Step 1: Add JavaScript helper functions**

Append this block to `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`:

```js
export function makeItemKey(seriesIndex, dataIndex) {
  const series = Number(seriesIndex ?? 0);
  const data = Number(dataIndex);
  if (!Number.isInteger(series) || !Number.isInteger(data) || series < 0 || data < 0) return null;
  return `${series}:${data}`;
}

export function setItemState(state, seriesIndex, dataIndex, enabled = true) {
  const key = makeItemKey(seriesIndex, dataIndex);
  if (!key || !state) return false;
  if (enabled) {
    state[key] = true;
  } else {
    delete state[key];
  }
  return true;
}

export function toggleItemState(state, seriesIndex, dataIndex) {
  const key = makeItemKey(seriesIndex, dataIndex);
  if (!key || !state) return false;
  if (state[key]) {
    delete state[key];
  } else {
    state[key] = true;
  }
  return true;
}

export function clearItemState(state, seriesIndex, dataIndex) {
  if (!state) return false;
  const key = makeItemKey(seriesIndex, dataIndex);
  if (key) {
    delete state[key];
    return true;
  }
  Object.keys(state).forEach(itemKey => delete state[itemKey]);
  return true;
}

export function hasItemState(state, seriesIndex, dataIndex) {
  const key = makeItemKey(seriesIndex, dataIndex);
  return !!(key && state && state[key]);
}

export function appendSeriesData(option, payload = {}) {
  const seriesIndex = Number(payload.seriesIndex ?? 0);
  if (!Number.isInteger(seriesIndex) || seriesIndex < 0) return { option, changed: false };
  if (!Object.prototype.hasOwnProperty.call(payload, 'data')) return { option, changed: false };
  const nextOption = clone(option || {});
  if (!Array.isArray(nextOption.series) || !nextOption.series[seriesIndex]) return { option, changed: false };
  const incoming = Array.isArray(payload.data) ? payload.data : [payload.data];
  if (incoming.length === 0) return { option, changed: false };
  const seriesItem = { ...nextOption.series[seriesIndex] };
  const currentData = Array.isArray(seriesItem.data) ? seriesItem.data.slice() : [];
  seriesItem.data = currentData.concat(incoming);
  nextOption.series = nextOption.series.slice();
  nextOption.series[seriesIndex] = seriesItem;
  return { option: nextOption, changed: true };
}
```

- [ ] **Step 2: Add UTS helper functions**

Append equivalent UTS helpers to both UTS helper files:

```ts
export function makeItemKey(seriesIndex : any, dataIndex : any) : string | null {
  const series = seriesIndex == null ? 0 : Number(seriesIndex)
  const data = Number(dataIndex)
  if (!isFinite(series) || !isFinite(data)) return null
  const seriesInt = Math.floor(series)
  const dataInt = Math.floor(data)
  if (seriesInt < 0 || dataInt < 0 || seriesInt != series || dataInt != data) return null
  return `${seriesInt}:${dataInt}`
}

export function setItemState(state : UTSJSONObject, seriesIndex : any, dataIndex : any, enabled : boolean = true) : boolean {
  const key = makeItemKey(seriesIndex, dataIndex)
  if (key == null) return false
  if (enabled) {
    state.set(key, true)
  } else {
    state.delete(key)
  }
  return true
}

export function toggleItemState(state : UTSJSONObject, seriesIndex : any, dataIndex : any) : boolean {
  const key = makeItemKey(seriesIndex, dataIndex)
  if (key == null) return false
  if (state.get(key) === true) {
    state.delete(key)
  } else {
    state.set(key, true)
  }
  return true
}

export function clearItemState(state : UTSJSONObject, seriesIndex : any | null = null, dataIndex : any | null = null) : boolean {
  const key = makeItemKey(seriesIndex, dataIndex)
  if (key != null) {
    state.delete(key)
    return true
  }
  state.toMap().forEach((_: any, itemKey : string) => {
    state.delete(itemKey)
  })
  return true
}

export function hasItemState(state : UTSJSONObject, seriesIndex : any, dataIndex : any) : boolean {
  const key = makeItemKey(seriesIndex, dataIndex)
  return key != null && state.get(key) === true
}

export function appendSeriesData(option : any, payload : any) : UTSJSONObject {
  const result = {} as UTSJSONObject
  const payloadObject = payload as UTSJSONObject
  const seriesIndexValue = payloadObject.get('seriesIndex')
  const seriesIndex = seriesIndexValue == null ? 0 : Number(seriesIndexValue)
  if (!isFinite(seriesIndex) || Math.floor(seriesIndex) != seriesIndex || seriesIndex < 0 || payloadObject.get('data') == null) {
    result.set('option', option)
    result.set('changed', false)
    return result
  }
  const nextOption = cloneRuntimeValue(option)
  const optionObject = nextOption as UTSJSONObject
  const seriesValue = optionObject.get('series')
  if (!Array.isArray(seriesValue) || seriesIndex >= (seriesValue as any[]).length) {
    result.set('option', option)
    result.set('changed', false)
    return result
  }
  const nextSeries = (seriesValue as any[]).slice(0)
  const seriesItem = cloneRuntimeValue(nextSeries[seriesIndex]) as UTSJSONObject
  const currentDataValue = seriesItem.get('data')
  const currentData = Array.isArray(currentDataValue) ? (currentDataValue as any[]).slice(0) : [] as any[]
  const incomingValue = payloadObject.get('data')
  const incoming = Array.isArray(incomingValue) ? incomingValue as any[] : [incomingValue]
  if (incoming.length == 0) {
    result.set('option', option)
    result.set('changed', false)
    return result
  }
  incoming.forEach((item : any) => {
    currentData.push(item)
  })
  seriesItem.set('data', currentData)
  nextSeries[seriesIndex] = seriesItem
  optionObject.set('series', nextSeries)
  result.set('option', nextOption)
  result.set('changed', true)
  return result
}
```

- [ ] **Step 3: Smoke-test JavaScript helpers**

Run:

```powershell
@'
import {
  appendSeriesData,
  clearItemState,
  hasItemState,
  setItemState,
  toggleItemState
} from './src/uni_modules/ly-charts/libs/util/runtimeHelper.js';

const state = {};
if (!setItemState(state, 0, 2, true)) throw new Error('set failed');
if (!hasItemState(state, 0, 2)) throw new Error('has failed');
if (!toggleItemState(state, 0, 2)) throw new Error('toggle failed');
if (hasItemState(state, 0, 2)) throw new Error('toggle clear failed');
setItemState(state, 1, 3, true);
clearItemState(state);
if (Object.keys(state).length !== 0) throw new Error('clear failed');
const result = appendSeriesData({ series: [{ type: 'line', data: [1] }] }, { seriesIndex: 0, data: [2, 3] });
if (!result.changed || result.option.series[0].data.join(',') !== '1,2,3') throw new Error('append failed');
console.log('runtime phase 3 helpers smoke ok');
'@ | node --input-type=module
```

Expected: `runtime phase 3 helpers smoke ok`

- [ ] **Step 4: Commit helpers**

Run:

```bash
git add src/uni_modules/ly-charts/libs/util/runtimeHelper.js src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts
git commit -m "feat: add echarts runtime item state helpers"
```

---

### Task 2: Vue Axis Charts

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`

**Interfaces:**
- Consumes: Task 1 helper functions.
- Produces: `appendData(payload)`, `highlight`, `downplay`, `select`, `unselect`, and `toggleSelect` support for Vue line/bar/scatter.

- [ ] **Step 1: Extend imports and state**

In each file import:

```js
appendSeriesData,
clearItemState,
hasItemState,
setItemState,
toggleItemState
```

For `<script setup>` line/bar add:

```js
const highlightState = ref({});
const selectState = ref({});
```

For Options API scatter add to `data()`:

```js
highlightState: {},
selectState: {},
```

- [ ] **Step 2: Clear state during lifecycle operations**

For `clear()` in each component, add:

```js
highlightState.value = {};
selectState.value = {};
```

or Options API:

```js
this.highlightState = {};
this.selectState = {};
```

For `setOption(option, notMerge = false)`, if `notMerge === true`, clear both states before drawing.

- [ ] **Step 3: Add action helpers**

For setup components, add:

```js
const applyItemAction = (action = {}) => {
  const seriesIndex = action.seriesIndex || 0;
  const dataIndex = action.dataIndex;
  if (action.type === 'highlight') {
    if (!setItemState(highlightState.value, seriesIndex, dataIndex, true)) return false;
  } else if (action.type === 'downplay') {
    clearItemState(highlightState.value, action.seriesIndex, action.dataIndex);
  } else if (action.type === 'select') {
    if (!setItemState(selectState.value, seriesIndex, dataIndex, true)) return false;
  } else if (action.type === 'unselect') {
    if (action.dataIndex == null) {
      clearItemState(selectState.value);
    } else if (!setItemState(selectState.value, seriesIndex, dataIndex, false)) {
      return false;
    }
  } else if (action.type === 'toggleSelect') {
    if (!toggleItemState(selectState.value, seriesIndex, dataIndex)) return false;
  } else {
    return false;
  }
  drawChart(currentOption.value || props.option);
  return true;
};
```

For scatter, use `this.highlightState`, `this.selectState`, and `this.drawChart(...)`.

- [ ] **Step 4: Add `appendData()`**

For setup components:

```js
const appendData = (payload = {}) => {
  if (disposed.value) return false;
  const result = appendSeriesData(currentOption.value || props.option, payload);
  if (!result.changed) return false;
  drawChart(result.option);
  return true;
};
```

For scatter Options API, use `this.disposed`, `this.currentOption`, `this.option`, and `this.drawChart(...)`.

- [ ] **Step 5: Add dispatch branches**

Before `return false` in each `dispatchAction`, add:

```js
if (['highlight', 'downplay', 'select', 'unselect', 'toggleSelect'].includes(action.type)) {
  return applyItemAction(action);
}
```

- [ ] **Step 6: Style line points**

In line point drawing, replace the fixed point radius block with logic:

```js
points.forEach((point, dataIndex) => {
  const selected = hasItemState(selectState.value, index, dataIndex);
  const highlighted = hasItemState(highlightState.value, index, dataIndex);
  const radius = selected ? 7 : (highlighted ? 6 : 4);
  const innerRadius = selected ? 4 : (highlighted ? 3 : 2);
  ctx.value.beginPath();
  ctx.value.setFillStyle(selected ? '#ffffff' : color);
  ctx.value.arc(point.x, point.y, radius, 0, 2 * Math.PI);
  ctx.value.fill();
  ctx.value.beginPath();
  ctx.value.setFillStyle(selected ? color : '#ffffff');
  ctx.value.arc(point.x, point.y, innerRadius, 0, 2 * Math.PI);
  ctx.value.fill();
  ctx.value.setFillStyle(color);
});
```

- [ ] **Step 7: Style bar points**

Before drawing each bar, compute:

```js
const selected = hasItemState(selectState.value, index, pointIndex);
const highlighted = hasItemState(highlightState.value, index, pointIndex);
const originalBorderWidth = point.borderWidth || 0;
if (selected) {
  point.borderColor = '#0f172a';
  point.borderWidth = Math.max(originalBorderWidth, 3);
} else if (highlighted) {
  point.borderColor = '#ffffff';
  point.borderWidth = Math.max(originalBorderWidth, 2);
}
```

Keep existing symbol drawing functions unchanged.

- [ ] **Step 8: Style scatter points**

Before calling `drawSymbol(...)`, compute selected/highlighted and use:

```js
const selected = hasItemState(this.selectState, index, pointIndex);
const highlighted = hasItemState(this.highlightState, index, pointIndex);
const size = selected ? symbolSize + 6 : (highlighted ? symbolSize + 4 : symbolSize);
this.ctx.setFillStyle(selected ? '#0f172a' : color);
this.drawSymbol(point.x, point.y, size, serie.symbol || 'circle');
if (selected || highlighted) {
  this.ctx.setFillStyle(color);
  this.drawSymbol(point.x, point.y, Math.max(symbolSize, size - 4), serie.symbol || 'circle');
}
```

- [ ] **Step 9: Expose `appendData`**

Add `appendData` to `defineExpose()` for line/bar and to scatter methods.

- [ ] **Step 10: Commit Vue axis charts**

Run:

```bash
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue
git commit -m "feat: add runtime item actions to vue axis charts"
```

---

### Task 3: Vue Pie and Radar Charts

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue`

**Interfaces:**
- Consumes: Task 1 helper functions.
- Produces: `highlight`, `downplay`, `select`, `unselect`, and `toggleSelect` support for Vue pie/radar.

- [ ] **Step 1: Add imports and state**

Import:

```js
clearItemState,
hasItemState,
setItemState,
toggleItemState
```

Add:

```js
const highlightState = ref({});
const selectState = ref({});
```

- [ ] **Step 2: Add item action helper**

Add the same `applyItemAction(action)` function as Task 2, but call `drawChart(currentOption.value || props.option)` and omit `appendData`.

- [ ] **Step 3: Clear state**

In `clear()` set both runtime states to `{}`. In `setOption(..., true)`, clear both runtime states.

- [ ] **Step 4: Style pie active sectors**

In the pie drawing loop that has `dataIndex`, compute:

```js
const selected = hasItemState(selectState.value, 0, i);
const highlighted = hasItemState(highlightState.value, 0, i);
```

After drawing the sector fill, draw a stroke when selected or highlighted:

```js
if (selected || highlighted) {
  ctx.beginPath();
  if (innerRadius > 0) {
    ctx.arc(centerX, centerY, radius + (selected ? 4 : 2), startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
  } else {
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius + (selected ? 4 : 2), startAngle, endAngle);
    ctx.closePath();
  }
  ctx.setStrokeStyle(selected ? '#0f172a' : '#ffffff');
  ctx.setLineWidth(selected ? 4 : 2);
  ctx.stroke();
}
```

- [ ] **Step 5: Style radar points**

When radar points are drawn, compute `selected = hasItemState(selectState.value, seriesIndex, dataIndex)` and `highlighted = hasItemState(highlightState.value, seriesIndex, dataIndex)`. Use radius `selected ? 6 : highlighted ? 5 : 3` and draw a white outer point for selected/highlighted before the colored point.

- [ ] **Step 6: Add dispatch branches**

Before `return false` in each `dispatchAction`, add:

```js
if (['highlight', 'downplay', 'select', 'unselect', 'toggleSelect'].includes(action.type)) {
  return applyItemAction(action);
}
```

- [ ] **Step 7: Commit Vue pie/radar**

Run:

```bash
git add src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue
git commit -m "feat: add runtime item actions to vue polar charts"
```

---

### Task 4: src uvue Axis Charts

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`

**Interfaces:**
- Consumes: UTS helpers from Task 1.
- Produces: matching axis-chart runtime item actions and `appendData()`.

- [ ] **Step 1: Add imports and state**

Import UTS helpers:

```ts
appendSeriesData,
clearItemState,
hasItemState,
setItemState,
toggleItemState
```

Add to `data()`:

```ts
highlightState: {} as UTSJSONObject,
selectState: {} as UTSJSONObject,
```

- [ ] **Step 2: Add `applyItemAction(action : any) : boolean`**

Use UTSJSONObject action access:

```ts
applyItemAction(action : any) : boolean {
  const actionObject = action as UTSJSONObject
  const typeValue = actionObject.get('type')
  const seriesIndex = actionObject.get('seriesIndex') != null ? actionObject.get('seriesIndex') : 0
  const dataIndex = actionObject.get('dataIndex')
  if (`${typeValue}` == 'highlight') {
    if (!setItemState(this.highlightState, seriesIndex, dataIndex, true)) return false
  } else if (`${typeValue}` == 'downplay') {
    clearItemState(this.highlightState, actionObject.get('seriesIndex'), actionObject.get('dataIndex'))
  } else if (`${typeValue}` == 'select') {
    if (!setItemState(this.selectState, seriesIndex, dataIndex, true)) return false
  } else if (`${typeValue}` == 'unselect') {
    if (dataIndex == null) {
      clearItemState(this.selectState)
    } else if (!setItemState(this.selectState, seriesIndex, dataIndex, false)) {
      return false
    }
  } else if (`${typeValue}` == 'toggleSelect') {
    if (!toggleItemState(this.selectState, seriesIndex, dataIndex)) return false
  } else {
    return false
  }
  this.drawChart(this.currentOption)
  return true
}
```

- [ ] **Step 3: Add `appendData(payload : any) : boolean`**

```ts
appendData(payload : any) : boolean {
  if (this.disposed) return false
  const result = appendSeriesData(this.currentOption != null ? this.currentOption : this.option, payload)
  if (result.get('changed') !== true) return false
  this.drawChart(result.get('option'))
  return true
}
```

- [ ] **Step 4: Clear state**

In `clear()` reset both states to `{}`. In `setOption(option, notMerge)`, if `notMerge` is true, reset both states before drawing.

- [ ] **Step 5: Add dispatch branches and drawing emphasis**

Mirror Task 2 using UTS syntax and `hasItemState(this.selectState, seriesIndex, dataIndex)`.

- [ ] **Step 6: Commit src uvue axis charts**

Run:

```bash
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue
git commit -m "feat: add runtime item actions to uvue axis charts"
```

---

### Task 5: src uvue Pie and Radar

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue`

**Interfaces:**
- Consumes: UTS item-state helpers.
- Produces: matching highlight/select actions for uvue pie/radar.

- [ ] **Step 1: Add imports and state**

Import `clearItemState`, `hasItemState`, `setItemState`, and `toggleItemState`. Add `highlightState` and `selectState` as `UTSJSONObject` data fields.

- [ ] **Step 2: Add item actions, clear behavior, and dispatch branches**

Use the same `applyItemAction(action : any) : boolean` from Task 4 and reset states in `clear()` plus `setOption(..., true)`.

- [ ] **Step 3: Apply emphasis in pie/radar drawing loops**

Use UTS canvas calls already present in each file. Selected items get a 4px dark stroke or larger point; highlighted items get a 2px white stroke or medium point.

- [ ] **Step 4: Commit src uvue pie/radar**

Run:

```bash
git add src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue
git commit -m "feat: add runtime item actions to uvue polar charts"
```

---

### Task 6: uin-app-x Mirror

**Files:**
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue`

**Interfaces:**
- Consumes: UTS helpers from `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`.
- Produces: parity with `src` uvue behavior.

- [ ] **Step 1: Mirror src uvue imports, state, methods, and dispatch branches**

Apply the same implementation from Tasks 4 and 5. For uin-app-x files that use `ctx.$callMethod(...)`, keep existing canvas call style and only change state/action/drawing logic.

- [ ] **Step 2: Run parity grep**

Run:

```bash
rg -n "appendData|highlightState|selectState|toggleSelect|appendSeriesData" src/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter,pie,radar} uin-app-x/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter,pie,radar}
```

Expected: axis charts include `appendData`; all five supported chart families include item state and action branches in both package copies.

- [ ] **Step 3: Commit uin-app-x mirror**

Run:

```bash
git add uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue
git commit -m "feat: mirror runtime item actions in uin-app-x charts"
```

---

### Task 7: Documentation and Verification

**Files:**
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\pie.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\radar.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\gauge.md`

**Interfaces:**
- Consumes: implemented phase 3 API behavior.
- Produces: docs that state support boundaries and clearly say this work is not released until a future publish.

- [ ] **Step 1: Update line/bar/scatter docs**

Add examples:

```js
chartRef.value?.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: 2 })
chartRef.value?.dispatchAction({ type: 'downplay', seriesIndex: 0, dataIndex: 2 })
chartRef.value?.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex: 2 })
chartRef.value?.dispatchAction({ type: 'toggleSelect', seriesIndex: 0, dataIndex: 2 })
chartRef.value?.dispatchAction({ type: 'unselect', seriesIndex: 0, dataIndex: 2 })
chartRef.value?.appendData({ seriesIndex: 0, data: [120, 140] })
```

- [ ] **Step 2: Update pie/radar docs**

Add highlight/select examples and state that `appendData` is not supported on pie/radar.

- [ ] **Step 3: Update gauge docs**

State that highlight/select/appendData are unsupported in this phase and return failure safely.

- [ ] **Step 4: Add unreleased note**

In each changed docs page add:

```md
> 当前能力已在源码中实现，需等待后续发版后才会进入插件市场版本。
```

- [ ] **Step 5: Run verification**

Run:

```bash
git diff --check
pnpm type-check
git status --short
git -C D:\Repos\xyito\open\lyCharts-docs status --short
```

Expected:

- `git diff --check` passes.
- `pnpm type-check` may still fail due the existing baseline: missing `uni_modules/uview-plus/types`, removed `importsNotUsedAsValues`, and removed `preserveValueImports`.
- Main repo has only intentional committed changes after final commits.
- Docs repo has only intended docs changes before its commit.

- [ ] **Step 6: Commit docs**

Run:

```bash
git -C D:\Repos\xyito\open\lyCharts-docs add docs/charts/line.md docs/charts/bar.md docs/charts/scatter.md docs/charts/pie.md docs/charts/radar.md docs/charts/gauge.md
git -C D:\Repos\xyito\open\lyCharts-docs commit -m "docs: add echarts runtime item action APIs"
```

- [ ] **Step 7: Do not publish**

Do not run `D:\Repos\xyito\config\hx-plugin-publish.sh`. Leave package version unchanged.

## Self-Review

- Spec coverage: Tasks 1-6 cover helper utilities, highlight/downplay, select/unselect/toggleSelect, appendData for axis charts, Vue/uvue parity, and uin-app-x mirroring. Task 7 covers docs and the no-release constraint.
- Placeholder scan: no deferred placeholders remain. Tasks that depend on chart-local drawing loops name the exact visual rules and files.
- Type consistency: API names match the spec: `appendData`, `highlight`, `downplay`, `select`, `unselect`, `toggleSelect`, `appendSeriesData`, `setItemState`, `toggleItemState`, `clearItemState`, and `hasItemState`.
