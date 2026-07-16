# Multi-Chart Pointer Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagent-driven development is unavailable unless multi-agent is enabled in Codex config.

**Goal:** Add candlestick-like click/drag current-data inspection (in-chart pointer + tooltip + `tooltipShow`/`click`) to line, bar, scatter, pie, radar, and gauge charts on both uni-app and uni-app-x while keeping ECharts-compatible option/event APIs.

**Architecture:** Per-chart in-component `activePointer` lifecycle, duplicated across `.vue` and `.uvue` (no shared JS/UTS interaction helper). Each chart keeps hit geometry from the last render, resolves pointer on touchstart/move/end, redraws pointer/tooltip overlays after the base chart, and emits ECharts-like payloads.

**Tech Stack:** Vue 3 (script setup + options API variants), uni-app canvas API, uni-app-x uvue/UTS canvas API, existing ly-charts components.

## Global Constraints

- API remains ECharts-compatible: consume `option.tooltip` / `option.tooltip.axisPointer`; emit `click` and `tooltipShow`.
- Cover both ends for every chart: `src/uni_modules/ly-charts/...` (`.vue` + `.uvue`) and `uin-app-x/uni_modules/ly-charts/...` (`.uvue`).
- Do not extract a shared interaction framework in this pass.
- Do not change candlestick behavior.
- Tap threshold is `8px`.
- Missing tooltip config defaults to interactive visuals enabled.
- `tooltip.show === false` or `tooltip.showContent === false` hides tooltip content only.
- `tooltip.axisPointer.show === false` hides pointer lines.
- Demo external cards are optional and non-blocking.
- Do not revert unrelated dirty files (`uin-app-x/.hbuilderx/launch.json`, `memory/`).

## File Map

| Chart | uni-app Vue | uni-app uvue | uni-app-x uvue |
|---|---|---|---|
| line | `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue` | `src/.../ly-charts-line.uvue` | `uin-app-x/.../ly-charts-line.uvue` |
| bar | `src/.../ly-charts-bar/ly-charts-bar.vue` | `src/.../ly-charts-bar.uvue` | `uin-app-x/.../ly-charts-bar.uvue` |
| scatter | `src/.../ly-charts-scatter/ly-charts-scatter.vue` | `src/.../ly-charts-scatter.uvue` | `uin-app-x/.../ly-charts-scatter.uvue` |
| pie | `src/.../ly-charts-pie/ly-charts-pie.vue` | `src/.../ly-charts-pie.uvue` | `uin-app-x/.../ly-charts-pie.uvue` |
| radar | `src/.../ly-charts-radar/ly-charts-radar.vue` | `src/.../ly-charts-radar.uvue` | `uin-app-x/.../ly-charts-radar.uvue` |
| gauge | `src/.../ly-charts-gauge/ly-charts-gauge.vue` | `src/.../ly-charts-gauge.uvue` | `uin-app-x/.../ly-charts-gauge.uvue` |

Reference implementation (read only, do not change behavior):

- `src/uni_modules/ly-charts/components/ly-charts-candlestick/ly-charts-candlestick.vue`
- `src/uni_modules/ly-charts/components/ly-charts-candlestick/ly-charts-candlestick.uvue`
- `uin-app-x/uni_modules/ly-charts/components/ly-charts-candlestick/ly-charts-candlestick.uvue`

Spec:

- `docs/superpowers/specs/2026-07-16-chart-pointer-tooltip-design.md`

## Shared Payload Contract

Every chart emits objects shaped like:

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
  indicatorIndex?: number, // radar
  seriesValues?: Array<{ seriesName: string, value: any, color?: string }>,
  event?: { offsetX: number, offsetY: number }
}
```

Internal pointer state may also include drawing fields such as `x`, `y`, `centerX`, and chart-specific geometry. Keep those fields for drawing; emit the public fields above.

## Shared Implementation Pattern

For each chart file, implement this lifecycle:

1. State: `activePointer`, expanded `touchInfo` (`startX/startY/lastX/lastY`), and hit geometry from last render.
2. `buildPointerPayload(...)` returns public + drawing fields.
3. `updateActivePointer(x, y, emitTooltip = true)` resolves hit, sets `activePointer`, optionally emits `tooltipShow`, redraws.
4. Pointer/tooltip draw helpers respect tooltip option switches.
5. Touch handlers:
   - start: record touch + `updateActivePointer`
   - move: `preventDefault` + `updateActivePointer`
   - end: `updateActivePointer`; if movement <= 8px, emit `click`
6. `drawChart` ends by drawing pointer overlays when `activePointer` exists.
7. Empty data / invalid canvas must no-op safely.

Common helpers to adapt from candlestick:

```js
const TAP_SLOP = 8;

function measureTextWidth(ctx, text, fontSize = 12) {
  if (!ctx || typeof ctx.measureText !== 'function') {
    return String(text).length * fontSize * 0.6;
  }
  ctx.setFontSize(fontSize);
  return ctx.measureText(String(text)).width || (String(text).length * fontSize * 0.6);
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(digits);
}

function isPointInGrid(x, y, grid) {
  return !!grid &&
    x >= grid.left &&
    x <= grid.left + grid.width &&
    y >= grid.top &&
    y <= grid.top + grid.height;
}

function shouldShowTooltipContent(option) {
  const tooltip = option?.tooltip || {};
  return tooltip.show !== false && tooltip.showContent !== false;
}

function shouldShowAxisPointer(option) {
  const axisPointer = option?.tooltip?.axisPointer || {};
  return axisPointer.show !== false;
}
```

Tooltip box template:

```js
function drawTooltipBox(ctx, canvasWidth, canvasHeight, pointer, lines, option) {
  if (!pointer || !shouldShowTooltipContent(option)) return;
  const paddingX = 10;
  const paddingY = 8;
  const lineGap = 6;
  let boxWidth = 0;
  let boxHeight = paddingY * 2 - lineGap;
  lines.forEach((line) => {
    boxWidth = Math.max(boxWidth, measureTextWidth(ctx, line.text, line.fontSize || 11));
    boxHeight += (line.fontSize || 11) + lineGap;
  });
  boxWidth += paddingX * 2;

  let boxX = (pointer.x || pointer.event?.offsetX || 0) + 12;
  if (boxX + boxWidth > canvasWidth - 8) {
    boxX = (pointer.x || pointer.event?.offsetX || 0) - boxWidth - 12;
  }
  boxX = Math.max(8, boxX);
  let boxY = Math.max(8, (pointer.y || pointer.event?.offsetY || 0) - boxHeight - 12);
  if (boxY + boxHeight > canvasHeight - 8) {
    boxY = Math.max(8, canvasHeight - boxHeight - 8);
  }

  const tooltip = option?.tooltip || {};
  ctx.setFillStyle(tooltip.backgroundColor || 'rgba(15, 23, 42, 0.88)');
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.setStrokeStyle(tooltip.borderColor || 'rgba(148, 163, 184, 0.5)');
  ctx.setLineWidth(tooltip.borderWidth || 1);
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  let currentY = boxY + paddingY;
  lines.forEach((line) => {
    ctx.setFontSize(line.fontSize || 11);
    ctx.setFillStyle(line.color || tooltip.textStyle?.color || '#e2e8f0');
    ctx.setTextAlign('left');
    ctx.setTextBaseline('top');
    ctx.fillText(line.text, boxX + paddingX, currentY);
    currentY += (line.fontSize || 11) + lineGap;
  });
}
```

---

### Task 1: Line chart pointer (uni-app Vue)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
- Test: manual on line demo page / HBuilderX

**Interfaces:**
- Consumes: existing `seriesData` points `{ x, y, value, name, seriesName }`, `grid`, `option`
- Produces: `activePointer`, `tooltipShow` payload, upgraded `click` payload with `dataIndex` + `seriesValues`

- [ ] **Step 1: Expand state and emits**

```js
const emit = defineEmits(['click', 'tooltipShow']);
const activePointer = ref(null);
const plotGrid = ref(null); // { left, top, width, height }
const categoryCenters = ref([]); // number[]
const touchInfo = ref({
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0
});
```

While drawing series points, store plot geometry using the exact same x formula already used by point placement:

```js
plotGrid.value = {
  left: grid.value.left,
  top: grid.value.top,
  width: canvasWidth.value - grid.value.left - grid.value.right,
  height: canvasHeight.value - grid.value.top - grid.value.bottom
};
// categoryCenters[i] must equal points[i].x for the first series
```

- [ ] **Step 2: Add hit/payload/draw helpers**

```js
const TAP_SLOP = 8;

const findCategoryIndexByX = (x) => {
  if (!categoryCenters.value.length) return -1;
  let best = 0;
  let bestDist = Infinity;
  categoryCenters.value.forEach((cx, i) => {
    const d = Math.abs(cx - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
};

const buildLinePointerPayload = (categoryIndex, touchX, touchY) => {
  if (categoryIndex < 0 || !seriesData.value.length) return null;
  const seriesValues = [];
  let primary = null;
  let minPointDist = Infinity;

  seriesData.value.forEach((series) => {
    const point = series.points?.[categoryIndex];
    if (!point) return;
    const item = {
      seriesName: series.name,
      value: point.value,
      color: series.color,
      x: point.x,
      y: point.y,
      name: point.name,
      dataIndex: categoryIndex
    };
    seriesValues.push({
      seriesName: item.seriesName,
      value: item.value,
      color: item.color
    });
    const dist = Math.sqrt(Math.pow(point.x - touchX, 2) + Math.pow(point.y - touchY, 2));
    if (dist < minPointDist) {
      minPointDist = dist;
      primary = item;
    }
  });
  if (!primary) return null;
  return {
    componentType: 'series',
    seriesType: 'line',
    seriesName: primary.seriesName,
    name: primary.name,
    dataIndex: categoryIndex,
    value: primary.value,
    color: primary.color,
    seriesValues,
    x: primary.x,
    y: primary.y,
    event: { offsetX: primary.x, offsetY: primary.y }
  };
};
```

Also implement:
- `getLineTooltipLines(pointer)`
- `drawLineAxisPointer()` vertical line + optional cross + point emphasis
- `drawLineTooltipBox()` using shared tooltip template
- `updateActivePointer(touchX, touchY, emitTooltip = true)`
- outside-plot rule: keep previous pointer, do not invent data

- [ ] **Step 3: Wire touch handlers and draw overlays**

```js
const handleTouchStart = (e) => {
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  touchInfo.value.startX = touch.x || 0;
  touchInfo.value.startY = touch.y || 0;
  touchInfo.value.lastX = touchInfo.value.startX;
  touchInfo.value.lastY = touchInfo.value.startY;
  updateActivePointer(touchInfo.value.startX, touchInfo.value.startY, true);
};

const handleTouchMove = (e) => {
  e.preventDefault && e.preventDefault();
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  updateActivePointer(touch.x || 0, touch.y || 0, true);
};

const handleTouchEnd = (e) => {
  const touch = e.changedTouches && e.changedTouches[0];
  if (!touch) return;
  const endX = touch.x || 0;
  const endY = touch.y || 0;
  const pointer = updateActivePointer(endX, endY, true) || activePointer.value;
  const moved =
    Math.abs(endX - touchInfo.value.startX) > TAP_SLOP ||
    Math.abs(endY - touchInfo.value.startY) > TAP_SLOP;
  if (!moved && pointer) emit('click', pointer);
};
```

Before `ctx.value.draw()`:

```js
if (activePointer.value) {
  drawLineAxisPointer();
  drawLineTooltipBox();
}
```

Remove old nearest-point-only click path for line.

- [ ] **Step 4: Manual verification**

Expected:
1. Drag across categories updates vertical pointer and multi-series tooltip.
2. Light tap emits one `click` with `componentType/seriesType/name/value/seriesValues`.
3. Drag emits repeated `tooltipShow`.
4. `tooltip.show = false` hides box; axisPointer can still show unless disabled.
5. Empty series does not crash.

- [ ] **Step 5: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue
git commit -m "$(cat <<'EOF'
feat(line): add drag pointer and tooltip interaction

Align line chart click/drag inspection with candlestick-style
activePointer, tooltipShow, and ECharts-like payloads.
EOF
)"
```

---

### Task 2: Line chart pointer (both uvue ends)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue`

**Interfaces:**
- Same payload/event contract as Task 1

- [ ] **Step 1: Port state/emits to options-API uvue**

```ts
emits: ['click', 'tooltipShow'],
data() {
  return {
    activePointer: null as any,
    plotGrid: null as any,
    categoryCenters: [] as number[],
    touchInfo: { startX: 0, startY: 0, lastX: 0, lastY: 0 }
  }
}
```

- [ ] **Step 2: Port helpers to methods using `this.*`**
- [ ] **Step 3: Wire touch + draw overlays before `this.ctx.draw()`**
- [ ] **Step 4: Verify uni-app uvue and uni-app-x line demos**
- [ ] **Step 5: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.uvue
git commit -m "$(cat <<'EOF'
feat(line): port pointer tooltip to uvue ends

Mirror line activePointer/tooltip/click behavior on uni-app
and uni-app-x uvue implementations.
EOF
)"
```

---

### Task 3: Bar chart pointer (uni-app Vue)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`

**Interfaces:**
- Consumes: `seriesData[].points[]` with `x,y,value,name,barWidth,barHeight,zeroY,color`
- Produces: bar pointer payload with category `seriesValues` and preferred geometric hit

- [ ] **Step 1: Add pointer state/emits and persist plot grid**
- [ ] **Step 2: Implement bar hit testing**

Priority:
1. Geometric bar hit under finger (iterate series reverse so topmost stack wins)
2. Fallback nearest category by bar center X while inside plot

```js
const hitBar = (x, y) => {
  for (let s = seriesData.value.length - 1; s >= 0; s--) {
    const series = seriesData.value[s];
    for (let i = 0; i < (series.points || []).length; i++) {
      const p = series.points[i];
      const barWidth = p.barWidth || 20;
      const top = Math.min(p.y, p.zeroY);
      const bottom = Math.max(p.y, p.zeroY);
      if (x >= p.x && x <= p.x + barWidth && y >= top && y <= bottom) {
        return { series, point: p, dataIndex: i };
      }
    }
  }
  return null;
};

const buildBarPointerPayload = (touchX, touchY) => {
  const direct = hitBar(touchX, touchY);
  let dataIndex = direct ? direct.dataIndex : findCategoryIndexByX(touchX);
  if (dataIndex < 0) return null;
  // build seriesValues for all series at dataIndex
  // primary = direct hit series when available
  return {
    componentType: 'series',
    seriesType: 'bar',
    seriesName: primary.seriesName,
    name: primary.name,
    dataIndex,
    value: primary.value,
    color: primary.color,
    seriesValues,
    x: primary.x,
    y: primary.y,
    event: { offsetX: primary.x, offsetY: primary.y }
  };
};
```

- [ ] **Step 3: Draw category pointer + tooltip; wire touch lifecycle; remove old click-only path**
- [ ] **Step 4: Manual verify grouped + stacked bars**
- [ ] **Step 5: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue
git commit -m "$(cat <<'EOF'
feat(bar): add drag pointer and tooltip interaction

Enable category/bar hit inspection with in-chart pointer and
ECharts-compatible click/tooltipShow payloads.
EOF
)"
```

---

### Task 4: Bar chart pointer (both uvue ends)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue`

- [ ] **Step 1: Port Task 3 logic**
- [ ] **Step 2: Ensure reverse-hit stack behavior under UTS typing**
- [ ] **Step 3: Verify uni-app-x bar demo**
- [ ] **Step 4: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.uvue
git commit -m "$(cat <<'EOF'
feat(bar): port pointer tooltip to uvue ends

Mirror bar activePointer interaction on uni-app and uni-app-x.
EOF
)"
```

---

### Task 5: Scatter chart pointer (uni-app Vue)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`

**Interfaces:**
- Consumes: `seriesData[].points[]`
- Produces: nearest-point payload within 20px radius

- [ ] **Step 1: Add `activePointer` + `tooltipShow` support**
- [ ] **Step 2: Nearest-point resolver**

```js
findNearestScatterPoint(x, y, maxDistance = 20) {
  let best = null;
  let bestDist = Infinity;
  (this.seriesData || []).forEach((series) => {
    (series.points || []).forEach((point, dataIndex) => {
      const dist = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2));
      if (dist < bestDist && dist <= maxDistance) {
        bestDist = dist;
        best = {
          componentType: 'series',
          seriesType: 'scatter',
          seriesName: series.name,
          name: point.name,
          dataIndex,
          value: point.value,
          color: series.color,
          x: point.x,
          y: point.y,
          event: { offsetX: point.x, offsetY: point.y }
        };
      }
    });
  });
  return best;
}
```

- [ ] **Step 3: Draw marker + optional crosshair + tooltip; continuous drag snap**
- [ ] **Step 4: Verify + commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue
git commit -m "$(cat <<'EOF'
feat(scatter): add drag nearest-point tooltip

Support continuous nearest-point inspection with in-chart
marker/tooltip and ECharts-like events.
EOF
)"
```

---

### Task 6: Scatter chart pointer (both uvue ends)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue`

- [ ] **Step 1: Port Task 5**
- [ ] **Step 2: Verify drag snap radius ~20px**
- [ ] **Step 3: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.uvue
git commit -m "$(cat <<'EOF'
feat(scatter): port pointer tooltip to uvue ends

Mirror scatter nearest-point interaction on both uvue targets.
EOF
)"
```

---

### Task 7: Pie chart pointer (uni-app Vue)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue`

**Interfaces:**
- Consumes: `chartInstance` with center/radius/innerRadius/total/data/sectorAngles
- Produces: item-trigger payload with `percent`

- [ ] **Step 1: Expand interaction state (`activePointer`, touchInfo, emits)**
- [ ] **Step 2: Reuse existing working sector hit math from `tap()`; enrich payload**

```js
{
  componentType: 'series',
  seriesType: 'pie',
  seriesName: props.option?.series?.[0]?.name,
  name: item.name,
  dataIndex,
  value: item.value,
  percent: chart.total ? (item.value / chart.total) * 100 : 0,
  color: item.color || item.itemStyle?.color,
  event: { offsetX: x, offsetY: y },
  data: item
}
```

Requirements:
- honor ring inner radius exclusion
- do not regress current sector hit accuracy

- [ ] **Step 3: Visuals + continuous drag**
  - stroke active sector
  - draw tooltip with name/value/percent
  - always emit `tooltipShow` on pointer updates
  - emit `click` only on tap threshold
- [ ] **Step 4: Verify normal pie + ring pie**
- [ ] **Step 5: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue
git commit -m "$(cat <<'EOF'
feat(pie): add drag sector pointer and tooltip

Support continuous sector inspection with percent payload and
in-chart tooltip visuals.
EOF
)"
```

---

### Task 8: Pie chart pointer (both uvue ends)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue`

Notes:
- uvue already has `findSector` + end-only click/tooltipShow
- add touchmove, activePointer, overlays, percent, 8px tap gating

- [ ] **Step 1: Port continuous pointer behavior**
- [ ] **Step 2: Verify**
- [ ] **Step 3: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.uvue
git commit -m "$(cat <<'EOF'
feat(pie): port pointer tooltip to uvue ends

Add drag sector highlighting and tooltipShow parity on uvue.
EOF
)"
```

---

### Task 9: Radar chart pointer (uni-app Vue)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue`

**Interfaces:**
- Consumes: center/radius/indicators/series
- Produces: payload with `indicatorIndex`, `seriesName`, `seriesValues`

- [ ] **Step 1: Persist hit geometry during draw**

```js
chartInstance.value = {
  type: 'native-radar',
  data: processedSeries,
  indicators,
  centerX,
  centerY,
  radius: maxRadius,
  seriesPoints: [
    // { seriesIndex, seriesName, color, points: [{ indicatorIndex, name, value, x, y }] }
  ],
  destroy: () => {}
};
```

Refactor `drawRadarData` to store structured points.

- [ ] **Step 2: Hit strategy**
  - nearest series vertex within ~24px
  - else nearest indicator by angle inside radius
  - payload includes all series values at selected indicator
- [ ] **Step 3: Draw indicator ray/point + tooltip; replace raw click emit**
- [ ] **Step 4: Verify multi-series radar**
- [ ] **Step 5: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue
git commit -m "$(cat <<'EOF'
feat(radar): add indicator pointer and tooltip

Enable radar drag inspection with indicator/series payloads and
in-chart visuals.
EOF
)"
```

---

### Task 10: Radar chart pointer (both uvue ends)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue`

- [ ] **Step 1: Port geometry persistence + pointer logic**
- [ ] **Step 2: Verify**
- [ ] **Step 3: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.uvue
git commit -m "$(cat <<'EOF'
feat(radar): port pointer tooltip to uvue ends

Mirror radar indicator inspection behavior on both uvue targets.
EOF
)"
```

---

### Task 11: Gauge chart pointer (uni-app Vue)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.vue`

**Interfaces:**
- Consumes: gauge center/radius/current values
- Produces: value payload + optional detail text

- [ ] **Step 1: Replace `@tap` with touchstart/move/end and persist geometry**

```html
<canvas
  :id="canvasId"
  :canvas-id="canvasId"
  :style="{width: canvasWidth + 'px', height: canvasHeight + 'px'}"
  @touchstart="handleTouchStart"
  @touchmove="handleTouchMove"
  @touchend="handleTouchEnd"
></canvas>
```

```js
const emit = defineEmits(['click', 'tooltipShow']);
const activePointer = ref(null);
const gaugeMeta = ref(null); // centerX/centerY/radius/values/seriesName/detailText/color
```

Set `gaugeMeta` at end of `drawGauge`; draw tooltip overlay if active.

- [ ] **Step 2: Hit + payload**

```js
const buildGaugePointer = (x, y) => {
  const meta = gaugeMeta.value;
  if (!meta) return null;
  const dx = x - meta.centerX;
  const dy = y - meta.centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > meta.radius * 1.05) return null;
  return {
    componentType: 'series',
    seriesType: 'gauge',
    seriesName: meta.seriesName,
    name: meta.seriesName,
    dataIndex: 0,
    value: meta.values?.[0] ?? 0,
    color: meta.color,
    detail: meta.detailText,
    x,
    y,
    event: { offsetX: x, offsetY: y }
  };
};
```

No crosshair. Tooltip shows value/detail.

- [ ] **Step 3: Touch lifecycle; structured click payload instead of raw event**
- [ ] **Step 4: Verify animated gauge redraw with pointer**
- [ ] **Step 5: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.vue
git commit -m "$(cat <<'EOF'
feat(gauge): add touch value tooltip interaction

Expose gauge current value through pointer/tooltip and structured
click/tooltipShow events.
EOF
)"
```

---

### Task 12: Gauge chart pointer (both uvue ends)

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.uvue`
- Modify: `uin-app-x/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.uvue`

- [ ] **Step 1: Port Task 11 including touch bindings**
- [ ] **Step 2: Verify**
- [ ] **Step 3: Commit**

```bash
git add src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.uvue uin-app-x/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.uvue
git commit -m "$(cat <<'EOF'
feat(gauge): port pointer tooltip to uvue ends

Mirror gauge value inspection behavior on both uvue targets.
EOF
)"
```

---

### Task 13: Cross-chart regression and option switches

**Files:**
- Verify only unless fixes needed
- Candlestick must remain behavior-compatible

- [ ] **Step 1: API matrix manual test** for line/bar/scatter/pie/radar/gauge

1. Default option: pointer + tooltip on drag
2. `tooltip: { show: false }`: no tooltip box
3. cartesian `axisPointer.show = false`: no pointer lines
4. existing `@click` fields remain usable
5. drag does not emit click; light tap does

- [ ] **Step 2: Candlestick regression**
  - crosshair/tooltip
  - zoom/slider
  - click/tooltipShow
- [ ] **Step 3: Fix regressions in touched chart files only**
- [ ] **Step 4: Commit fixes only if needed**

```bash
git add src/uni_modules/ly-charts/components uin-app-x/uni_modules/ly-charts/components
git commit -m "$(cat <<'EOF'
fix: stabilize multi-chart pointer tooltip parity

Address cross-chart option switch and payload regressions found
during manual verification.
EOF
)"
```

---

## Self-Review

1. **Spec coverage**
   - all six charts covered in Tasks 1-12
   - dual-end coverage per chart
   - ECharts option/event contract in shared sections + Task 13
   - no shared helper extraction
   - candlestick unchanged via regression task
2. **Placeholder scan:** no TBD/TODO blockers; pie reuses existing hit math
3. **Consistency:** shared names `activePointer`, `updateActivePointer`, `tooltipShow`, `TAP_SLOP=8`; implementation order line → bar → scatter → pie → radar → gauge

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-multi-chart-pointer-tooltip.md`.

Two execution options:

1. **Subagent-Driven (recommended only if multi-agent enabled)** - fresh subagent per task, review between tasks
2. **Inline Execution** - execute tasks in this session using executing-plans, batch with checkpoints

Which approach?
