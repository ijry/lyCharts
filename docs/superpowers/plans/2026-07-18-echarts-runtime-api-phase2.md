# ECharts Runtime API Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ECharts-compatible legend selection, non-candlestick axis-chart `dataZoom`, and basic tooltip formatter support to lyCharts.

**Architecture:** Extend the existing runtime helpers with pure option transforms and tooltip formatting, then route line/bar/scatter drawing through those transforms. Keep original normalized options as the runtime source of truth while using clipped render options for geometry, drawing, hit testing, and tooltip content.

**Tech Stack:** Vue 3 SFCs, uni-app canvas API, uni-app-x uvue/UTS components, existing lyCharts component structure, sibling markdown docs in `D:\Repos\xyito\open\lyCharts-docs`.

## Global Constraints

- Preserve the current per-chart component architecture.
- Keep `src/uni_modules/ly-charts` and `uin-app-x/uni_modules/ly-charts` behavior aligned.
- Do not implement a full ECharts runtime, scheduler, component model, or action bus.
- Do not implement click-to-toggle legend UI in this phase.
- Do not implement non-candlestick `dataZoom` slider UI in this phase.
- Do not implement HTML tooltip rendering, rich text fragments, async formatter output, or DOM positioning.
- uvue function `tooltip.formatter` must degrade safely to default tooltip text.
- Update `D:\Repos\xyito\open\lyCharts-docs` with supported API boundaries.
- Do not revert unrelated repository changes.

---

## File Structure

- Modify `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`: shared JavaScript helpers for visible series, dataZoom clipping, runtime option mutation, and tooltip formatting.
- Modify `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: UTS-compatible helpers for visible series, dataZoom clipping, runtime option mutation, and string tooltip formatting.
- Modify `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`: mirror the UTS helper.
- Modify `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`: apply visible series/windowed render option, dataZoom action, legend toggle action, tooltip formatter.
- Modify `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`: apply the helper output before stacked range calculation, bar geometry generation, hit testing, and tooltip rendering.
- Modify `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`: apply the helper output before scatter range calculation, point geometry generation, hit testing, and tooltip rendering.
- Modify matching `*.uvue` components under `src/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter}`.
- Modify matching `*.uvue` components under `uin-app-x/uni_modules/ly-charts/components/ly-charts-{line,bar,scatter}`.
- Modify `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`.
- Modify `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`.
- Modify `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`.

---

### Task 1: Shared Runtime Helper Extensions

**Files:**
- Modify: `src/uni_modules/ly-charts/libs/util/runtimeHelper.js`
- Modify: `src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`
- Modify: `uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts`

**Interfaces:**
- Produces: `getSeriesName(seriesItem: any, index: number): string`
- Produces: `applyLegendSelection(option: any): any`
- Produces: `resolveDataZoomWindow(option: any, dataLength: number): { startIndex: number, endIndex: number, changed: boolean }`
- Produces: `applyAxisDataWindow(option: any): { option: any, startIndex: number, endIndex: number, changed: boolean }`
- Produces: `toggleLegendSelected(option: any, name: string): { option: any, changed: boolean }`
- Produces: `updateDataZoomOption(option: any, action: any): { option: any, changed: boolean }`
- Produces: `formatTooltipLines(option: any, pointer: any, defaultLines: any[], chartType: string, allowFunctionFormatter?: boolean): any[]`

- [ ] **Step 1: Add JavaScript helper functions**

Add these exported functions to `runtimeHelper.js` after `createEventRegistry()`:

```js
export function getSeriesName(seriesItem = {}, index = 0) {
  return seriesItem.name != null ? String(seriesItem.name) : `Series ${index}`;
}

export function applyLegendSelection(option) {
  const nextOption = clone(option || {});
  const selected = nextOption.legend && nextOption.legend.selected;
  if (!selected || !Array.isArray(nextOption.series)) return nextOption;
  nextOption.series = nextOption.series.filter((seriesItem, index) => {
    const name = getSeriesName(seriesItem, index);
    return selected[name] !== false;
  });
  return nextOption;
}

export function resolveDataZoomWindow(option, dataLength) {
  const length = Number(dataLength) || 0;
  if (length <= 0) return { startIndex: 0, endIndex: -1, changed: false };
  const zoomList = Array.isArray(option?.dataZoom) ? option.dataZoom : (option?.dataZoom ? [option.dataZoom] : []);
  const zoom = zoomList.find(item => item && (item.start != null || item.end != null || item.startValue != null || item.endValue != null));
  if (!zoom) return { startIndex: 0, endIndex: length - 1, changed: false };
  let startIndex = zoom.startValue != null ? Number(zoom.startValue) : Math.floor((Number(zoom.start ?? 0) / 100) * (length - 1));
  let endIndex = zoom.endValue != null ? Number(zoom.endValue) : Math.ceil((Number(zoom.end ?? 100) / 100) * (length - 1));
  if (!Number.isFinite(startIndex)) startIndex = 0;
  if (!Number.isFinite(endIndex)) endIndex = length - 1;
  startIndex = Math.max(0, Math.min(length - 1, Math.floor(startIndex)));
  endIndex = Math.max(0, Math.min(length - 1, Math.ceil(endIndex)));
  if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
  return { startIndex, endIndex, changed: startIndex > 0 || endIndex < length - 1 };
}

export function applyAxisDataWindow(option) {
  const nextOption = clone(option || {});
  const series = Array.isArray(nextOption.series) ? nextOption.series : [];
  const xAxisLength = Array.isArray(nextOption.xAxis?.data) ? nextOption.xAxis.data.length : 0;
  const seriesLength = series.reduce((max, item) => Math.max(max, Array.isArray(item?.data) ? item.data.length : 0), 0);
  const dataLength = Math.max(xAxisLength, seriesLength);
  const window = resolveDataZoomWindow(nextOption, dataLength);
  if (!window.changed) return { option: nextOption, ...window };
  const end = window.endIndex + 1;
  if (Array.isArray(nextOption.xAxis?.data)) {
    nextOption.xAxis = { ...nextOption.xAxis, data: nextOption.xAxis.data.slice(window.startIndex, end) };
  }
  nextOption.series = series.map(seriesItem => {
    if (!Array.isArray(seriesItem?.data)) return seriesItem;
    return { ...seriesItem, data: seriesItem.data.slice(window.startIndex, end) };
  });
  return { option: nextOption, ...window };
}

export function toggleLegendSelected(option, name) {
  if (!name) return { option, changed: false };
  const nextOption = clone(option || {});
  const series = Array.isArray(nextOption.series) ? nextOption.series : [];
  const exists = series.some((item, index) => getSeriesName(item, index) === String(name));
  if (!exists) return { option, changed: false };
  const legend = nextOption.legend && typeof nextOption.legend === 'object' ? { ...nextOption.legend } : {};
  const selected = legend.selected && typeof legend.selected === 'object' ? { ...legend.selected } : {};
  selected[String(name)] = selected[String(name)] === false;
  legend.selected = selected;
  nextOption.legend = legend;
  return { option: nextOption, changed: true };
}

export function updateDataZoomOption(option, action = {}) {
  const nextOption = clone(option || {});
  const zoomList = Array.isArray(nextOption.dataZoom) ? nextOption.dataZoom.slice() : [{}];
  const target = { ...(zoomList[0] || {}) };
  ['start', 'end', 'startValue', 'endValue'].forEach((key) => {
    if (action[key] != null) target[key] = action[key];
  });
  const hasWindow = ['start', 'end', 'startValue', 'endValue'].some(key => target[key] != null);
  if (!hasWindow) return { option, changed: false };
  zoomList[0] = target;
  nextOption.dataZoom = zoomList;
  return { option: nextOption, changed: true };
}

function makeTooltipParams(pointer, chartType) {
  if (Array.isArray(pointer?.seriesValues) && pointer.seriesValues.length > 0) {
    return pointer.seriesValues.map((item, index) => ({
      componentType: 'series',
      seriesType: chartType,
      seriesName: item.seriesName,
      name: pointer.name,
      dataIndex: pointer.dataIndex,
      value: item.value,
      color: item.color,
      marker: '',
      seriesIndex: index
    }));
  }
  return {
    componentType: 'series',
    seriesType: chartType,
    seriesName: pointer?.seriesName,
    name: pointer?.name,
    dataIndex: pointer?.dataIndex,
    value: pointer?.value,
    color: pointer?.color,
    marker: ''
  };
}

function applyTooltipTemplate(template, params) {
  return String(template).replace(/\{(a|b|c|d|seriesName|name|value)\}/g, (_, key) => {
    if (key === 'a' || key === 'seriesName') return params.seriesName ?? '';
    if (key === 'b' || key === 'name') return params.name ?? '';
    if (key === 'c' || key === 'value') return Array.isArray(params.value) ? params.value.join(', ') : (params.value ?? '');
    if (key === 'd') return params.percent ?? '';
    return '';
  });
}

function splitTooltipText(text, color = '#e2e8f0') {
  return String(text).split(/\r?\n/).map(line => ({ text: line, color, fontSize: 11 }));
}

export function formatTooltipLines(option, pointer, defaultLines, chartType, allowFunctionFormatter = false) {
  const formatter = option?.tooltip?.formatter;
  if (!formatter) return defaultLines;
  const params = makeTooltipParams(pointer, chartType);
  try {
    if (typeof formatter === 'function') {
      if (!allowFunctionFormatter) return defaultLines;
      const result = formatter(params);
      return result == null ? defaultLines : splitTooltipText(result, pointer?.color);
    }
    if (typeof formatter === 'string') {
      if (Array.isArray(params)) {
        return params.flatMap(item => splitTooltipText(applyTooltipTemplate(formatter, item), item.color));
      }
      return splitTooltipText(applyTooltipTemplate(formatter, params), pointer?.color);
    }
  } catch (error) {
    console.warn('[ly-charts] tooltip formatter failed:', error);
  }
  return defaultLines;
}
```

- [ ] **Step 2: Add UTS helper functions**

Add this UTS-compatible helper block to both UTS helper files after `readRowValue(...)`:

```ts
function cloneRuntimeValue(value : any) : any {
  if (value == null) return {}
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return value
  }
}

export function getSeriesName(seriesItem : any, index : number = 0) : string {
  const seriesObject = seriesItem as UTSJSONObject
  const nameValue = seriesObject.get('name')
  return nameValue != null ? `${nameValue}` : `Series ${index}`
}

export function applyLegendSelection(option : any) : any {
  const nextOption = cloneRuntimeValue(option)
  const optionObject = nextOption as UTSJSONObject
  const legendValue = optionObject.get('legend')
  if (legendValue == null) return nextOption
  const legend = legendValue as UTSJSONObject
  const selectedValue = legend.get('selected')
  if (selectedValue == null) return nextOption
  const selected = selectedValue as UTSJSONObject
  const seriesValue = optionObject.get('series')
  if (!Array.isArray(seriesValue)) return nextOption
  const series = seriesValue as any[]
  const visibleSeries = [] as any[]
  series.forEach((serie : any, index : number) => {
    const name = getSeriesName(serie, index)
    if (selected.get(name) !== false) {
      visibleSeries.push(serie)
    }
  })
  optionObject.set('series', visibleSeries)
  return nextOption
}

function getRuntimeDataLength(option : any) : number {
  const optionObject = option as UTSJSONObject
  let dataLength = 0
  const xAxisValue = optionObject.get('xAxis')
  if (xAxisValue != null) {
    const xAxis = xAxisValue as UTSJSONObject
    const dataValue = xAxis.get('data')
    if (Array.isArray(dataValue)) {
      dataLength = Math.max(dataLength, (dataValue as any[]).length)
    }
  }
  const seriesValue = optionObject.get('series')
  if (Array.isArray(seriesValue)) {
    ;(seriesValue as any[]).forEach((serie : any) => {
      const serieObject = serie as UTSJSONObject
      const dataValue = serieObject.get('data')
      if (Array.isArray(dataValue)) {
        dataLength = Math.max(dataLength, (dataValue as any[]).length)
      }
    })
  }
  return dataLength
}

export function resolveDataZoomWindow(option : any, dataLength : number) : UTSJSONObject {
  const result = {} as UTSJSONObject
  const length = dataLength
  if (length <= 0) {
    result.set('startIndex', 0)
    result.set('endIndex', -1)
    result.set('changed', false)
    return result
  }
  const optionObject = option as UTSJSONObject
  const dataZoomValue = optionObject.get('dataZoom')
  let zoom = null as UTSJSONObject | null
  if (Array.isArray(dataZoomValue)) {
    const zoomList = dataZoomValue as any[]
    for (let i = 0; i < zoomList.length; i++) {
      const item = zoomList[i] as UTSJSONObject
      if (item.get('start') != null || item.get('end') != null || item.get('startValue') != null || item.get('endValue') != null) {
        zoom = item
        break
      }
    }
  } else if (dataZoomValue != null) {
    zoom = dataZoomValue as UTSJSONObject
  }
  if (zoom == null) {
    result.set('startIndex', 0)
    result.set('endIndex', length - 1)
    result.set('changed', false)
    return result
  }
  const startValue = zoom.get('startValue')
  const endValue = zoom.get('endValue')
  const startPercent = zoom.get('start')
  const endPercent = zoom.get('end')
  let startIndex = startValue != null ? Number(startValue) : Math.floor((Number(startPercent != null ? startPercent : 0) / 100) * (length - 1))
  let endIndex = endValue != null ? Number(endValue) : Math.ceil((Number(endPercent != null ? endPercent : 100) / 100) * (length - 1))
  if (!Number.isFinite(startIndex)) startIndex = 0
  if (!Number.isFinite(endIndex)) endIndex = length - 1
  startIndex = Math.max(0, Math.min(length - 1, Math.floor(startIndex)))
  endIndex = Math.max(0, Math.min(length - 1, Math.ceil(endIndex)))
  if (endIndex < startIndex) {
    const swap = startIndex
    startIndex = endIndex
    endIndex = swap
  }
  result.set('startIndex', startIndex)
  result.set('endIndex', endIndex)
  result.set('changed', startIndex > 0 || endIndex < length - 1)
  return result
}

export function applyAxisDataWindow(option : any) : UTSJSONObject {
  const nextOption = cloneRuntimeValue(option)
  const optionObject = nextOption as UTSJSONObject
  const window = resolveDataZoomWindow(nextOption, getRuntimeDataLength(nextOption))
  const startIndex = window.get('startIndex') as number
  const endIndex = window.get('endIndex') as number
  const changed = window.get('changed') as boolean
  if (changed === true) {
    const end = endIndex + 1
    const xAxisValue = optionObject.get('xAxis')
    if (xAxisValue != null) {
      const xAxis = xAxisValue as UTSJSONObject
      const dataValue = xAxis.get('data')
      if (Array.isArray(dataValue)) {
        xAxis.set('data', (dataValue as any[]).slice(startIndex, end))
        optionObject.set('xAxis', xAxis)
      }
    }
    const seriesValue = optionObject.get('series')
    if (Array.isArray(seriesValue)) {
      const nextSeries = [] as any[]
      ;(seriesValue as any[]).forEach((serie : any) => {
        const serieObject = cloneRuntimeValue(serie) as UTSJSONObject
        const dataValue = serieObject.get('data')
        if (Array.isArray(dataValue)) {
          serieObject.set('data', (dataValue as any[]).slice(startIndex, end))
        }
        nextSeries.push(serieObject)
      })
      optionObject.set('series', nextSeries)
    }
  }
  const result = {} as UTSJSONObject
  result.set('option', nextOption)
  result.set('startIndex', startIndex)
  result.set('endIndex', endIndex)
  result.set('changed', changed)
  return result
}

export function toggleLegendSelected(option : any, name : any) : UTSJSONObject {
  const result = {} as UTSJSONObject
  if (name == null || `${name}` == '') {
    result.set('option', option)
    result.set('changed', false)
    return result
  }
  const nextOption = cloneRuntimeValue(option)
  const optionObject = nextOption as UTSJSONObject
  const seriesValue = optionObject.get('series')
  let exists = false
  if (Array.isArray(seriesValue)) {
    ;(seriesValue as any[]).forEach((serie : any, index : number) => {
      if (getSeriesName(serie, index) == `${name}`) exists = true
    })
  }
  if (!exists) {
    result.set('option', option)
    result.set('changed', false)
    return result
  }
  const legendValue = optionObject.get('legend')
  const legend = legendValue != null ? cloneRuntimeValue(legendValue) as UTSJSONObject : {} as UTSJSONObject
  const selectedValue = legend.get('selected')
  const selected = selectedValue != null ? cloneRuntimeValue(selectedValue) as UTSJSONObject : {} as UTSJSONObject
  selected.set(`${name}`, selected.get(`${name}`) === false)
  legend.set('selected', selected)
  optionObject.set('legend', legend)
  result.set('option', nextOption)
  result.set('changed', true)
  return result
}

export function updateDataZoomOption(option : any, action : any) : UTSJSONObject {
  const result = {} as UTSJSONObject
  const nextOption = cloneRuntimeValue(option)
  const optionObject = nextOption as UTSJSONObject
  const actionObject = action as UTSJSONObject
  const dataZoomValue = optionObject.get('dataZoom')
  const zoomList = Array.isArray(dataZoomValue) ? (dataZoomValue as any[]).slice(0) : [] as any[]
  const target = zoomList.length > 0 ? cloneRuntimeValue(zoomList[0]) as UTSJSONObject : {} as UTSJSONObject
  let hasWindow = false
  ;(['start', 'end', 'startValue', 'endValue'] as string[]).forEach((key : string) => {
    const value = actionObject.get(key)
    if (value != null) {
      target.set(key, value)
      hasWindow = true
    }
  })
  if (!hasWindow) {
    result.set('option', option)
    result.set('changed', false)
    return result
  }
  if (zoomList.length == 0) {
    zoomList.push(target)
  } else {
    zoomList[0] = target
  }
  optionObject.set('dataZoom', zoomList)
  result.set('option', nextOption)
  result.set('changed', true)
  return result
}

function applyTooltipTemplate(template : string, seriesName : any, name : any, value : any) : string {
  const valueText = Array.isArray(value) ? (value as any[]).join(', ') : `${value != null ? value : ''}`
  return template
    .replace('{a}', `${seriesName != null ? seriesName : ''}`)
    .replace('{seriesName}', `${seriesName != null ? seriesName : ''}`)
    .replace('{b}', `${name != null ? name : ''}`)
    .replace('{name}', `${name != null ? name : ''}`)
    .replace('{c}', valueText)
    .replace('{value}', valueText)
    .replace('{d}', '')
}

function pushTooltipTextLines(lines : any[], text : string, color : any) {
  const parts = text.split('\n')
  parts.forEach((line : string) => {
    lines.push({ text: line, color: color || '#e2e8f0', fontSize: 11 })
  })
}

export function formatTooltipLines(option : any, pointer : any, defaultLines : any[], chartType : string) : any[] {
  const optionObject = option as UTSJSONObject
  const tooltipValue = optionObject.get('tooltip')
  if (tooltipValue == null) return defaultLines
  const tooltip = tooltipValue as UTSJSONObject
  const formatter = tooltip.get('formatter')
  if (typeof formatter != 'string') return defaultLines
  const pointerObject = pointer as UTSJSONObject
  const output = [] as any[]
  const seriesValuesValue = pointerObject.get('seriesValues')
  if (Array.isArray(seriesValuesValue)) {
    ;(seriesValuesValue as any[]).forEach((item : any) => {
      const itemObject = item as UTSJSONObject
      pushTooltipTextLines(
        output,
        applyTooltipTemplate(`${formatter}`, itemObject.get('seriesName'), pointerObject.get('name'), itemObject.get('value')),
        itemObject.get('color')
      )
    })
  } else {
    pushTooltipTextLines(
      output,
      applyTooltipTemplate(`${formatter}`, pointerObject.get('seriesName'), pointerObject.get('name'), pointerObject.get('value')),
      pointerObject.get('color')
    )
  }
  return output.length > 0 ? output : defaultLines
}
```

- [ ] **Step 3: Smoke-test JavaScript helper**

Run:

```powershell
@'
import {
  applyAxisDataWindow,
  applyLegendSelection,
  toggleLegendSelected,
  updateDataZoomOption,
  formatTooltipLines
} from './src/uni_modules/ly-charts/libs/util/runtimeHelper.js';

const option = {
  legend: { selected: { Profit: false } },
  dataZoom: [{ startValue: 1, endValue: 2 }],
  xAxis: { data: ['Jan', 'Feb', 'Mar'] },
  series: [
    { name: 'Sales', type: 'line', data: [1, 2, 3] },
    { name: 'Profit', type: 'line', data: [3, 2, 1] }
  ]
};
const visible = applyLegendSelection(option);
if (visible.series.length !== 1 || visible.series[0].name !== 'Sales') throw new Error('legend filtering failed');
const windowed = applyAxisDataWindow(visible);
if (windowed.option.xAxis.data.join(',') !== 'Feb,Mar') throw new Error('dataZoom window failed');
const toggled = toggleLegendSelected(option, 'Profit');
if (toggled.option.legend.selected.Profit !== true) throw new Error('legend toggle failed');
const zoomed = updateDataZoomOption(option, { start: 0, end: 50 });
if (zoomed.option.dataZoom[0].end !== 50) throw new Error('dataZoom update failed');
const lines = formatTooltipLines(
  { tooltip: { formatter: '{a}:{b}:{c}' } },
  { seriesName: 'Sales', name: 'Feb', value: 2, color: '#000' },
  [],
  'line',
  true
);
if (lines[0].text !== 'Sales:Feb:2') throw new Error('tooltip format failed');
console.log('runtime helper phase 2 smoke ok');
'@ | node --input-type=module
```

Expected: `runtime helper phase 2 smoke ok`

- [ ] **Step 4: Commit helper extensions**

Run:

```bash
git add src/uni_modules/ly-charts/libs/util/runtimeHelper.js src/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts uin-app-x/uni_modules/ly-charts/libs/uvue/runtimeHelper.uts
git commit -m "feat: add echarts runtime phase 2 helpers"
```

---

### Task 2: Wire Vue Line, Bar, and Scatter Components

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`

**Interfaces:**
- Consumes: helpers from Task 1.
- Produces: `legend.selected`, `legendToggleSelect`, non-candlestick `dataZoom`, and formatter-aware tooltip content for Vue components.

- [ ] **Step 1: Extend imports in all three Vue components**

Use this import shape:

```js
import {
  normalizeOption,
  mergeOptions,
  createEventRegistry,
  applyLegendSelection,
  applyAxisDataWindow,
  toggleLegendSelected,
  updateDataZoomOption,
  formatTooltipLines
} from '../../libs/util/runtimeHelper.js';
```

- [ ] **Step 2: Build render options before chart calculations**

In each `drawChart(option)` after normalization and `currentOption` assignment, add:

```js
const renderOption = applyAxisDataWindow(applyLegendSelection(option)).option;
```

Then use `renderOption.series`, `renderOption.xAxis`, `renderOption.yAxis`, `renderOption.legend`, `renderOption.grid`, and `renderOption.xAxisPadding` for drawing and geometry. Keep `currentOption` as the normalized unwindowed runtime option.

- [ ] **Step 3: Route default tooltip lines through `formatTooltipLines`**

For line:

```js
return formatTooltipLines(currentOption.value, pointer, lines, 'line', true);
```

For bar:

```js
return formatTooltipLines(currentOption.value, pointer, lines, 'bar', true);
```

For scatter:

```js
return formatTooltipLines(this.currentOption, pointer, defaultLines, 'scatter', true);
```

- [ ] **Step 4: Add `legendToggleSelect` and `dataZoom` actions**

For setup components, add to `dispatchAction` before `return false`:

```js
if (action.type === 'legendToggleSelect') {
  const result = toggleLegendSelected(currentOption.value || props.option, action.name);
  if (!result.changed) return false;
  activePointer.value = null;
  drawChart(result.option);
  return true;
}
if (action.type === 'dataZoom') {
  const result = updateDataZoomOption(currentOption.value || props.option, action);
  if (!result.changed) return false;
  activePointer.value = null;
  drawChart(result.option);
  return true;
}
```

For scatter Options API, use `this.currentOption`, `this.activePointer`, and `this.drawChart(...)`.

- [ ] **Step 5: Smoke-test helper-driven Vue behavior**

Run the Task 1 smoke test again and inspect the component diffs for the three expected action branches:

```bash
rg -n "legendToggleSelect|applyAxisDataWindow|formatTooltipLines" src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue
```

Expected: each component includes all three patterns.

- [ ] **Step 6: Commit Vue component wiring**

Run:

```bash
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue
git commit -m "feat: support echarts phase 2 api on vue axis charts"
```

---

### Task 3: Wire UTS / uvue Components

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`

**Interfaces:**
- Consumes: UTS helper functions from Task 1.
- Produces: matching phase 2 runtime behavior for uvue, except function `tooltip.formatter` fallback.

- [ ] **Step 1: Extend UTS imports in all six uvue files**

Use:

```ts
import {
  normalizeOption,
  mergeOptions,
  applyLegendSelection,
  applyAxisDataWindow,
  toggleLegendSelected,
  updateDataZoomOption,
  formatTooltipLines
} from '../../libs/uvue/runtimeHelper.uts'
```

- [ ] **Step 2: Apply render options in each uvue draw function**

After:

```ts
option = normalizeOption(option)
this.currentOption = option
```

add:

```ts
const renderOptionResult = applyAxisDataWindow(applyLegendSelection(option))
const renderOption = renderOptionResult.get('option')
```

Use `renderOption` for local `series`, `xAxis`, `yAxis`, `legend`, and drawing checks.

- [ ] **Step 3: Route tooltip lines through UTS formatter helper**

Line:

```ts
return formatTooltipLines(this.currentOption, pointer, lines, 'line')
```

Bar:

```ts
return formatTooltipLines(this.currentOption, pointer, lines, 'bar')
```

Scatter:

```ts
return formatTooltipLines(this.currentOption, pointer, defaultLines, 'scatter')
```

The UTS helper returns default lines when `tooltip.formatter` is not a string.

- [ ] **Step 4: Add UTS action branches**

Add before `return false` in every relevant `dispatchAction(action : any)`:

```ts
if (`${typeValue}` == 'legendToggleSelect') {
  const result = toggleLegendSelected(this.currentOption != null ? this.currentOption : this.option, action.name)
  if (result.get('changed') !== true) return false
  this.activePointer = null
  this.drawChart(result.get('option'))
  return true
}
if (`${typeValue}` == 'dataZoom') {
  const result = updateDataZoomOption(this.currentOption != null ? this.currentOption : this.option, action)
  if (result.get('changed') !== true) return false
  this.activePointer = null
  this.drawChart(result.get('option'))
  return true
}
```

- [ ] **Step 5: Check uvue parity**

Run:

```bash
rg -n "legendToggleSelect|applyAxisDataWindow|formatTooltipLines" src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue
```

Expected: all six files include all three patterns.

- [ ] **Step 6: Commit uvue component wiring**

Run:

```bash
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue
git commit -m "feat: support echarts phase 2 api on uvue axis charts"
```

---

### Task 4: Documentation and Verification

**Files:**
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`

**Interfaces:**
- Consumes: implemented API behavior.
- Produces: docs that accurately describe phase 2 compatibility.

- [ ] **Step 1: Update line/bar/scatter runtime support notes**

Replace text that says non-candlestick `dataZoom` is ignored with text stating line, bar, and scatter support visible-window clipping.

- [ ] **Step 2: Add legend selected docs**

Add this example to each page with the chart type adjusted:

```js
const option = {
  legend: {
    selected: {
      Sales: true,
      Profit: false
    }
  },
  series: [
    { name: 'Sales', type: 'line', data: [120, 200, 150] },
    { name: 'Profit', type: 'line', data: [30, 80, 60] }
  ]
}

chartRef.value?.dispatchAction({ type: 'legendToggleSelect', name: 'Profit' })
```

- [ ] **Step 3: Add dataZoom docs**

Add:

```js
chartRef.value?.dispatchAction({ type: 'dataZoom', start: 20, end: 80 })
chartRef.value?.dispatchAction({ type: 'dataZoom', startValue: 2, endValue: 8 })
```

State that line/bar clip `xAxis.data` and `series.data`, while scatter clips each series by point index order.

- [ ] **Step 4: Add tooltip formatter docs**

Add:

```js
const option = {
  tooltip: {
    formatter: '{a} {b}: {c}'
  }
}
```

State that Vue components also support function formatter, and uvue safely falls back to default tooltip text for functions.

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
- `pnpm type-check` may still fail due existing baseline `uview-plus/types` and removed TS compiler options; record the exact result.
- Git status shows only intended files before commits.

- [ ] **Step 6: Commit docs repository changes**

Run:

```bash
git -C D:\Repos\xyito\open\lyCharts-docs add docs/charts/line.md docs/charts/bar.md docs/charts/scatter.md
git -C D:\Repos\xyito\open\lyCharts-docs commit -m "docs: add echarts runtime api phase 2"
```

- [ ] **Step 7: Commit plan document**

Commit this plan before implementation if it is still uncommitted:

```bash
git add docs/superpowers/plans/2026-07-18-echarts-runtime-api-phase2.md
git commit -m "docs: plan echarts runtime api phase 2"
```

## Self-Review

- Spec coverage: Task 1 covers shared transforms and tooltip formatting; Task 2 covers Vue line/bar/scatter; Task 3 covers uvue and uin-app-x parity; Task 4 covers sibling docs and verification.
- Placeholder scan: no task contains deferred implementation markers; JavaScript and UTS helper interfaces are named explicitly, and component wiring steps include the exact helper calls and action branches.
- Type consistency: public helper names and action names match the design: `legendToggleSelect`, `dataZoom`, `applyLegendSelection`, `applyAxisDataWindow`, `toggleLegendSelected`, `updateDataZoomOption`, `formatTooltipLines`.
