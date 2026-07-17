# ECharts Runtime API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add practical ECharts-compatible runtime APIs, event subscription, action dispatch, and `dataset` / `encode` preprocessing to lyCharts.

**Architecture:** Add small shared runtime helpers for option normalization and event registry behavior, then wire each chart component through the helper before drawing. Keep chart-specific drawing and hit geometry local, with `dispatchAction` delegating to existing pointer/zoom methods where available.

**Tech Stack:** Vue 3 SFCs, uni-app canvas API, uni-app-x uvue/UTS components, existing lyCharts component structure, sibling VitePress-style markdown docs in `D:\Repos\xyito\open\lyCharts-docs`.

## Global Constraints

- Preserve the current per-chart component architecture.
- Keep `src/uni_modules/ly-charts` and `uin-app-x/uni_modules/ly-charts` behavior aligned.
- Do not implement a full ECharts runtime, scheduler, component model, or action bus.
- Do not add new chart types.
- Do not implement non-candlestick `dataZoom` behavior in this phase.
- Do not implement `highlight`, `downplay`, `select`, or `unselect` in this phase.
- Do not implement full tooltip `formatter`, DOM tooltip positioning, or all ECharts event names.
- Update `D:\Repos\xyito\open\lyCharts-docs` with supported API boundaries.
- Do not revert unrelated repository changes.

---

## File Structure

- Create `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`: JavaScript option normalization, merge, event registry helpers.
- Create `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: UTS-compatible option normalization helper.
- Create `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: same UTS-compatible helper for the uni-app-x package copy.
- Modify `src/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter,pie,radar,gauge,candlestick}`: route drawing through normalized options and expose runtime APIs.
- Modify `uin-app-x/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter,pie,radar,gauge,candlestick}`: mirror uvue runtime API behavior.
- Modify `D:\Repos\xyito\open\lyCharts-docs\docs\charts\*.md`: document instance methods, events, `dispatchAction`, `dataset`, and phase-one limits.

---

### Task 1: Shared Runtime Helpers

**Files:**
- Create: `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`
- Create: `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`
- Create: `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`

**Interfaces:**
- Produces: `normalizeOption(option: any): any`
- Produces: `mergeOptions(baseOption: any, nextOption: any, notMerge?: boolean): any`
- Produces: `createEventRegistry(): { on, off, emit, clear }` in JavaScript helper.

- [ ] **Step 1: Add JavaScript runtime helper**

Create `src/uni_modules/ly-charts/libs/util/runtimeHelper.js` with:

```js
function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
}

function toRows(source) {
  if (!Array.isArray(source) || source.length === 0) return { rows: [], dimensions: [] };
  if (Array.isArray(source[0])) {
    const dimensions = source[0].map((item, index) => item != null ? String(item) : String(index));
    return { rows: source.slice(1), dimensions };
  }
  if (source[0] && typeof source[0] === 'object') {
    return { rows: source, dimensions: Object.keys(source[0]) };
  }
  return { rows: [], dimensions: [] };
}

function readValue(row, dimensions, key) {
  if (key == null) return undefined;
  if (Array.isArray(row)) {
    const index = typeof key === 'number' ? key : dimensions.indexOf(String(key));
    return index >= 0 ? row[index] : undefined;
  }
  return row != null && typeof row === 'object' ? row[key] : undefined;
}

function firstEncodeValue(encode, keys) {
  for (const key of keys) {
    const value = encode && encode[key];
    if (Array.isArray(value)) return value[0];
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeSeriesData(seriesItem, rows, dimensions) {
  if (Array.isArray(seriesItem.data) || !seriesItem.encode) return seriesItem;
  const encode = seriesItem.encode;
  const xKey = firstEncodeValue(encode, ['x', 'itemName', 'name']);
  const yKey = firstEncodeValue(encode, ['y', 'value']);
  const valueKey = yKey !== undefined ? yKey : firstEncodeValue(encode, ['value']);
  const normalized = { ...seriesItem };
  if (seriesItem.type === 'scatter') {
    normalized.data = rows.map(row => [readValue(row, dimensions, xKey), readValue(row, dimensions, valueKey)]);
  } else if (seriesItem.type === 'pie') {
    normalized.data = rows.map(row => ({
      name: readValue(row, dimensions, xKey),
      value: readValue(row, dimensions, valueKey)
    }));
  } else {
    normalized.data = rows.map(row => readValue(row, dimensions, valueKey));
  }
  return normalized;
}

export function normalizeOption(option) {
  const normalized = clone(option || {});
  const source = normalized.dataset && normalized.dataset.source;
  const { rows, dimensions } = toRows(source);
  if (!rows.length || !Array.isArray(normalized.series)) return normalized;
  let xAxisData = null;
  normalized.series = normalized.series.map((seriesItem) => {
    const nextSeries = normalizeSeriesData(seriesItem || {}, rows, dimensions);
    const xKey = firstEncodeValue(seriesItem && seriesItem.encode, ['x', 'itemName', 'name']);
    if (xAxisData == null && xKey !== undefined) {
      xAxisData = rows.map(row => readValue(row, dimensions, xKey));
    }
    return nextSeries;
  });
  if (xAxisData && normalized.xAxis && !Array.isArray(normalized.xAxis.data)) {
    normalized.xAxis = { ...normalized.xAxis, data: xAxisData };
  } else if (xAxisData && !normalized.xAxis) {
    normalized.xAxis = { data: xAxisData };
  }
  return normalized;
}

export function mergeOptions(baseOption, nextOption, notMerge = false) {
  if (notMerge) return normalizeOption(nextOption);
  return normalizeOption(Object.assign(clone(baseOption || {}), nextOption || {}));
}

export function createEventRegistry() {
  const handlers = {};
  return {
    on(eventName, handler) {
      if (!eventName || typeof handler !== 'function') return false;
      if (!handlers[eventName]) handlers[eventName] = [];
      handlers[eventName].push(handler);
      return true;
    },
    off(eventName, handler) {
      if (!eventName || !handlers[eventName]) return false;
      if (typeof handler !== 'function') {
        handlers[eventName] = [];
        return true;
      }
      handlers[eventName] = handlers[eventName].filter(item => item !== handler);
      return true;
    },
    emit(eventName, payload) {
      (handlers[eventName] || []).slice().forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error('[ly-charts] event handler failed:', error);
        }
      });
    },
    clear() {
      Object.keys(handlers).forEach((eventName) => {
        handlers[eventName] = [];
      });
    }
  };
}
```

- [ ] **Step 2: Add UTS runtime helpers**

Create both UTS files with a conservative subset:

```ts
export function normalizeOption(option : any) : any {
  if (option == null) return {}
  let normalized : any = option
  try {
    normalized = JSON.parse(JSON.stringify(option))
  } catch (error) {
    normalized = option
  }
  const optionObject = normalized as UTSJSONObject
  const datasetValue = optionObject.get('dataset')
  if (datasetValue == null) return normalized
  const dataset = datasetValue as UTSJSONObject
  const sourceValue = dataset.get('source')
  if (!Array.isArray(sourceValue) || (sourceValue as any[]).length == 0) return normalized
  const source = sourceValue as any[]
  const first = source[0]
  const rows = Array.isArray(first) ? source.slice(1) : source
  const dimensions = [] as string[]
  if (Array.isArray(first)) {
    ;(first as any[]).forEach((item : any, index : number) => {
      dimensions.push(item != null ? `${item}` : `${index}`)
    })
  } else if (first != null) {
    const firstObject = first as UTSJSONObject
    firstObject.toMap().forEach((_: any, key : string) => {
      dimensions.push(key)
    })
  }
  const seriesValue = optionObject.get('series')
  if (!Array.isArray(seriesValue)) return normalized
  const series = seriesValue as any[]
  let xAxisData = null as any[] | null
  const normalizedSeries = [] as any[]
  series.forEach((serie : any) => {
    const serieObject = serie as UTSJSONObject
    if (Array.isArray(serieObject.get('data')) || serieObject.get('encode') == null) {
      normalizedSeries.push(serie)
      return
    }
    const encode = serieObject.get('encode') as UTSJSONObject
    const xKey = getEncodeValue(encode, ['x', 'itemName', 'name'])
    const yKey = getEncodeValue(encode, ['y', 'value'])
    const typeValue = serieObject.get('type')
    const nextSerie = JSON.parse(JSON.stringify(serie)) as UTSJSONObject
    const data = [] as any[]
    rows.forEach((row : any) => {
      if (`${typeValue}` == 'scatter') {
        data.push([readRowValue(row, dimensions, xKey), readRowValue(row, dimensions, yKey)])
      } else if (`${typeValue}` == 'pie') {
        data.push({ name: readRowValue(row, dimensions, xKey), value: readRowValue(row, dimensions, yKey) })
      } else {
        data.push(readRowValue(row, dimensions, yKey))
      }
    })
    nextSerie.set('data', data)
    normalizedSeries.push(nextSerie)
    if (xAxisData == null && xKey != null) {
      xAxisData = rows.map((row : any) => readRowValue(row, dimensions, xKey))
    }
  })
  optionObject.set('series', normalizedSeries)
  if (xAxisData != null) {
    const xAxisValue = optionObject.get('xAxis')
    const xAxis = xAxisValue != null ? xAxisValue as UTSJSONObject : {} as UTSJSONObject
    if (!Array.isArray(xAxis.get('data'))) {
      xAxis.set('data', xAxisData)
      optionObject.set('xAxis', xAxis)
    }
  }
  return normalized
}

export function mergeOptions(baseOption : any, nextOption : any, notMerge : boolean = false) : any {
  if (notMerge) return normalizeOption(nextOption)
  let merged = {} as UTSJSONObject
  try {
    merged = JSON.parse(JSON.stringify(baseOption != null ? baseOption : {})) as UTSJSONObject
  } catch (error) {
    merged = {} as UTSJSONObject
  }
  if (nextOption != null) {
    const nextObject = nextOption as UTSJSONObject
    nextObject.toMap().forEach((value : any, key : string) => {
      merged.set(key, value)
    })
  }
  return normalizeOption(merged)
}

function getEncodeValue(encode : UTSJSONObject, keys : string[]) : any {
  for (let i = 0; i < keys.length; i++) {
    const value = encode.get(keys[i])
    if (Array.isArray(value)) {
      const arr = value as any[]
      return arr.length > 0 ? arr[0] : null
    }
    if (value != null) return value
  }
  return null
}

function readRowValue(row : any, dimensions : string[], key : any) : any {
  if (key == null) return null
  if (Array.isArray(row)) {
    const arr = row as any[]
    let index = -1
    if (typeof key == 'number') {
      index = key as number
    } else {
      index = dimensions.indexOf(`${key}`)
    }
    return index >= 0 && index < arr.length ? arr[index] : null
  }
  const rowObject = row as UTSJSONObject
  return rowObject.get(`${key}`)
}
```

- [ ] **Step 3: Run static checks for helper syntax**

Run: `pnpm type-check`

Expected: The existing project may report unrelated Vue/UTS limitations, but the new JavaScript helper should not introduce TypeScript parse errors.

- [ ] **Step 4: Commit helpers**

Run:

```bash
git add src/uni_modules/ly-charts/libs/util/runtimeHelper.js src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts
git commit -m "feat: add echarts runtime option helpers"
```

---

### Task 2: Wire JavaScript Vue Components

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-candlestick/ly-charts-candlestick.vue`

**Interfaces:**
- Consumes: `normalizeOption()`, `mergeOptions()`, `createEventRegistry()`.
- Produces: instance methods `getOption`, `clear`, `dispose`, `showLoading`, `hideLoading`, `getWidth`, `getHeight`, `on`, `off`, `dispatchAction`.

- [ ] **Step 1: Import runtime helper in each JavaScript component**

Use:

```js
import { normalizeOption, mergeOptions, createEventRegistry } from '../../libs/util/runtimeHelper.js';
```

For components that already import `chartHelper`, keep both imports.

- [ ] **Step 2: Add runtime state**

For `<script setup>` components, add:

```js
const currentOption = ref({});
const disposed = ref(false);
const loading = ref(false);
const eventRegistry = createEventRegistry();
```

For Options API components, add data fields:

```js
currentOption: {},
disposed: false,
loading: false,
eventRegistry: createEventRegistry(),
```

- [ ] **Step 3: Normalize options before drawing**

At the start of each draw function, use:

```js
if (disposed.value) return;
const normalizedOption = normalizeOption(option || {});
currentOption.value = normalizedOption;
option = normalizedOption;
```

For Options API:

```js
if (this.disposed) return;
const normalizedOption = normalizeOption(option || this.option || {});
this.currentOption = normalizedOption;
option = normalizedOption;
```

- [ ] **Step 4: Replace event emits with a wrapper**

For setup components:

```js
const emitChartEvent = (eventName, payload) => {
  emit(eventName, payload);
  eventRegistry.emit(eventName, payload);
};
```

Replace `emit('click', payload)` and `emit('tooltipShow', payload)` with `emitChartEvent(...)`.

For Options API:

```js
emitChartEvent(eventName, payload) {
  this.$emit(eventName, payload);
  this.eventRegistry.emit(eventName, payload);
}
```

Replace `this.$emit(...)` for supported chart events with `this.emitChartEvent(...)`.

- [ ] **Step 5: Add runtime methods**

Add methods with these signatures:

```js
const getOption = () => currentOption.value;
const getWidth = () => canvasWidth.value || 0;
const getHeight = () => canvasHeight.value || 0;
const clear = () => {
  activePointer.value = null;
  ctx.value && ctx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  ctx.value && ctx.value.draw && ctx.value.draw();
};
const dispose = () => {
  disposed.value = true;
  eventRegistry.clear();
  clear();
};
const showLoading = () => {
  loading.value = true;
  ctx.value && ctx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  if (ctx.value) {
    ctx.value.setFillStyle('rgba(255,255,255,0.86)');
    ctx.value.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
    ctx.value.setFillStyle('#64748b');
    ctx.value.setFontSize && ctx.value.setFontSize(14);
    ctx.value.setTextAlign && ctx.value.setTextAlign('center');
    ctx.value.fillText('Loading...', canvasWidth.value / 2, canvasHeight.value / 2);
    ctx.value.draw && ctx.value.draw();
  }
};
const hideLoading = () => {
  loading.value = false;
  drawChart(currentOption.value || props.option);
};
const on = (eventName, handler) => eventRegistry.on(eventName, handler);
const off = (eventName, handler) => eventRegistry.off(eventName, handler);
const dispatchAction = (action = {}) => {
  if (!action || !action.type) return false;
  if (action.type === 'hideTip') {
    activePointer.value = null;
    drawChart(currentOption.value || props.option);
    return true;
  }
  if (action.type === 'showTip' && typeof updateActivePointerByDataIndex === 'function') {
    return updateActivePointerByDataIndex(action.dataIndex, action.seriesIndex || 0);
  }
  return false;
};
```

Adapt Options API references to `this`.

- [ ] **Step 6: Implement chart-local `showTip` by data index**

For charts with `seriesData` / region arrays, add a method that resolves `dataIndex` to existing geometry and calls the existing pointer update or assigns `activePointer`, then redraws. If geometry is unavailable, return `false`.

For candlestick, map `dataIndex` to existing candle region and active pointer.

- [ ] **Step 7: Update `setOption` and `resize`**

Make `setOption()` use:

```js
const nextOption = mergeOptions(currentOption.value || props.option, option, notMerge);
drawChart(nextOption);
```

Make `resize()` no-op if disposed; otherwise keep existing initialization behavior.

- [ ] **Step 8: Expose methods**

Add all new methods to `defineExpose()` or Options API `methods`.

- [ ] **Step 9: Run H5 build/type check**

Run: `pnpm type-check`

Expected: No new parse errors in modified Vue files.

- [ ] **Step 10: Commit JavaScript components**

Run:

```bash
git add src/uni_modules/ly-charts/components
git commit -m "feat: expose echarts runtime api on vue charts"
```

---

### Task 3: Wire UTS / uvue Components

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-candlestick/ly-charts-candlestick.uvue`
- Modify: matching files under `uin-app-x/uni_modules/ly-charts/components`

**Interfaces:**
- Consumes: `normalizeOption()`, `mergeOptions()` from `../../libs/uvue/runtimeHelper.uts`.
- Produces: matching runtime API methods on uvue components.

- [ ] **Step 1: Import UTS helper**

Add:

```ts
import { normalizeOption, mergeOptions } from '../../libs/uvue/runtimeHelper.uts'
```

- [ ] **Step 2: Add data fields**

Add:

```ts
currentOption: {} as any,
disposed: false,
loading: false,
eventHandlers: {} as UTSJSONObject,
```

- [ ] **Step 3: Add event methods**

Add:

```ts
on(eventName : string, handler : any) : boolean {
  if (eventName == '' || handler == null) return false
  const current = this.eventHandlers.get(eventName)
  const handlers = Array.isArray(current) ? current as any[] : [] as any[]
  handlers.push(handler)
  this.eventHandlers.set(eventName, handlers)
  return true
},
off(eventName : string, handler : any | null = null) : boolean {
  const current = this.eventHandlers.get(eventName)
  if (!Array.isArray(current)) return false
  if (handler == null) {
    this.eventHandlers.set(eventName, [] as any[])
    return true
  }
  const next = (current as any[]).filter((item : any) => item != handler)
  this.eventHandlers.set(eventName, next)
  return true
},
emitChartEvent(eventName : string, payload : any) {
  this.$emit(eventName, payload)
  const current = this.eventHandlers.get(eventName)
  if (!Array.isArray(current)) return
  ;(current as any[]).forEach((handler : any) => {
    try {
      handler(payload)
    } catch (error) {
      console.error('[ly-charts] event handler failed:', error)
    }
  })
},
```

- [ ] **Step 4: Normalize draw input and merge setOption**

Use:

```ts
const normalizedOption = normalizeOption(option)
this.currentOption = normalizedOption
```

and:

```ts
const nextOption = mergeOptions(this.currentOption != null ? this.currentOption : this.option, option, notMerge)
this.drawChart(nextOption)
```

- [ ] **Step 5: Add clear/loading/lifecycle methods**

Add `getOption`, `clear`, `dispose`, `showLoading`, `hideLoading`, `getWidth`, `getHeight`, and `dispatchAction` using the same semantics as Task 2 with UTS syntax and `this.ctx.$callMethod(...)` where needed.

- [ ] **Step 6: Replace supported `$emit` calls**

Replace `this.$emit('click', payload)`, `this.$emit('tooltipShow', payload)`, and candlestick `this.$emit('zoom', payload)` with `this.emitChartEvent(...)`.

- [ ] **Step 7: Run static validation**

Run: `pnpm type-check`

Expected: No new syntax errors from imported helpers or method signatures.

- [ ] **Step 8: Commit uvue components**

Run:

```bash
git add src/uni_modules/ly-charts/components uin-app-x/uni_modules/ly-charts/components src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts
git commit -m "feat: expose echarts runtime api on uvue charts"
```

---

### Task 4: Documentation and Verification

**Files:**
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\pie.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\radar.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\gauge.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\candlestick.md`

**Interfaces:**
- Consumes: implemented API methods.
- Produces: docs tables and examples that match phase-one behavior.

- [ ] **Step 1: Add shared runtime API section to chart docs**

For each chart page, add/update method table with:

```md
| 方法名 | 说明 | 参数 |
| --- | --- | --- |
| setOption | 设置图表配置项 | option, notMerge |
| getOption | 获取当前规范化后的图表配置 | - |
| resize | 重新测量并绘制图表 | - |
| clear | 清空画布并重置当前交互状态 | - |
| dispose | 销毁当前图表实例状态，后续绘制调用将被忽略 | - |
| showLoading | 显示轻量加载态 | textOrOptions |
| hideLoading | 隐藏加载态并重绘当前配置 | - |
| getWidth | 获取当前画布宽度 | - |
| getHeight | 获取当前画布高度 | - |
| on | 监听图表事件 | eventName, handler |
| off | 移除图表事件监听 | eventName, handler? |
| dispatchAction | 触发支持的图表行为 | action |
```

- [ ] **Step 2: Document dispatchAction limits**

Add:

```md
### dispatchAction 支持范围

当前版本支持 `showTip`、`hideTip`、`dataZoom` 三类 action。`dataZoom` 仅 K线图生效，其他图表会安全忽略。未支持的 ECharts action 不会抛错，但会返回失败结果。
```

- [ ] **Step 3: Document dataset / encode**

Add line/bar/scatter examples:

```js
const option = {
  dataset: {
    source: [
      ['month', 'sales', 'profit'],
      ['1月', 120, 30],
      ['2月', 200, 80]
    ]
  },
  series: [
    { type: 'line', encode: { x: 'month', y: 'sales' } }
  ]
}
```

- [ ] **Step 4: Run docs status and project checks**

Run:

```bash
git status --short
pnpm type-check
```

Also run in docs repository:

```bash
git -C D:\Repos\xyito\open\lyCharts-docs status --short
```

- [ ] **Step 5: Commit docs repository changes separately**

Run:

```bash
git -C D:\Repos\xyito\open\lyCharts-docs add docs/charts
git -C D:\Repos\xyito\open\lyCharts-docs commit -m "docs: add echarts runtime api compatibility"
```

- [ ] **Step 6: Commit final code/docs plan status if needed**

Run:

```bash
git add docs/superpowers/plans/2026-07-17-echarts-runtime-api.md
git commit -m "docs: plan echarts runtime api implementation"
```

## Self-Review

- Spec coverage: Task 1 covers helper architecture and dataset normalization; Tasks 2 and 3 cover instance APIs, events, and `dispatchAction`; Task 4 covers sibling docs.
- Placeholder scan: no deferred implementation placeholders remain; unsupported actions are explicitly out of scope.
- Type consistency: API names match the spec: `getOption`, `clear`, `dispose`, `showLoading`, `hideLoading`, `getWidth`, `getHeight`, `on`, `off`, `dispatchAction`, `normalizeOption`, `mergeOptions`.
