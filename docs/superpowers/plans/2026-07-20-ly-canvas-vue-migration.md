# ly-canvas Vue Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate ordinary Vue chart components to the shared `ly-canvas` component while preserving current chart behavior and WeChat Mini Program 2d canvas mode.

**Architecture:** Keep every chart component and drawing algorithm in place, and replace only the canvas host and initialization path. Ordinary Vue charts will use the same `ref="canvasRef"` and `@ready="handleCanvasReady"` contract already used by `ly-charts-candlestick.vue` and uvue components; the shared `ly-canvas.vue` remains responsible for platform canvas creation and `type="2d"` in `MP || H5`.

**Tech Stack:** Vue 3 SFCs, uni-app canvas, shared `ly-canvas` Vue component, existing lyCharts runtime helpers, sibling VitePress docs in `D:\Repos\xyito\open\lyCharts-docs`.

## Global Constraints

- Do not publish a new version in this phase.
- Ordinary `.vue` chart components must not directly create business chart `<canvas>` elements after migration.
- Ordinary `.vue` chart components must not call `uni.createCanvasContext` after migration.
- Preserve existing props, emits, exposed methods, touch interactions, tooltip behavior, `dispatchAction`, and `appendData` behavior.
- Preserve `ly-canvas.vue` WeChat Mini Program 2d mode through the existing `MP || H5` canvas branch with `type="2d"`.
- Update `D:\Repos\xyito\open\lyCharts-docs` with the new shared canvas-layer behavior.
- Do not revert unrelated repository changes.

---

## File Structure

- Modify `src/uni_modules/ly-charts/components/ly-canvas/ly-canvas.vue`: verify the `MP || H5` branch still declares `type="2d"` and leave the public drawing wrapper API intact.
- Modify axis Vue charts:
  - `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`
- Modify non-axis Vue charts:
  - `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue`
  - `src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.vue`
- Modify docs:
  - `D:\Repos\xyito\open\lyCharts-docs\docs\index.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\pie.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\radar.md`
  - `D:\Repos\xyito\open\lyCharts-docs\docs\charts\gauge.md`

---

### Task 1: Axis Vue Charts Use ly-canvas

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue`

**Interfaces:**
- Consumes: `ly-canvas` methods `refresh(): Promise<boolean> | boolean`, `getWidth(): number`, `getHeight(): number`, drawing wrapper methods such as `clearRect`, `setFillStyle`, `fillRect`, `draw`, `measureText`.
- Produces: unchanged chart component external API; internally `ctx` references the `ly-canvas` instance instead of a raw uni canvas context.

- [ ] **Step 1: Replace `line` template canvas host**

Replace the `<canvas>` block in `ly-charts-line.vue` with:

```vue
<ly-canvas
  ref="canvasRef"
  class="chart-canvas"
  :canvas-id="canvasId"
  width="100"
  height="100"
  :use-root-height-and-width="true"
  @ready="handleCanvasReady"
  @touchstart="handleTouchStart"
  @touchmove="handleTouchMove"
  @touchend="handleTouchEnd"
/>
```

- [ ] **Step 2: Replace `bar` template canvas host**

Replace the `<canvas>` block in `ly-charts-bar.vue` with:

```vue
<ly-canvas
  ref="canvasRef"
  class="chart-canvas"
  :canvas-id="canvasId"
  width="100"
  height="100"
  :use-root-height-and-width="true"
  @ready="handleCanvasReady"
  @touchstart="handleTouchStart"
  @touchmove="handleTouchMove"
  @touchend="handleTouchEnd"
/>
```

- [ ] **Step 3: Replace `line` script setup canvas initialization**

In `ly-charts-line.vue`, add `canvasRef` next to the other refs:

```js
const canvasId = ref('line-chart-' + Date.now());
const canvasRef = ref(null);
const ctx = ref(null);
```

Replace `initCanvas` with:

```js
const initCanvas = () => {
  const canvas = canvasRef.value;
  if (canvas && typeof canvas.refresh === 'function') {
    canvas.refresh();
  }
};
```

Add this function after `initCanvas`:

```js
const handleCanvasReady = (event) => {
  const canvas = canvasRef.value;
  if (!canvas) {
    console.error('无法获取canvas绘图上下文');
    return;
  }
  ctx.value = canvas;
  canvasWidth.value = event.width || canvas.getWidth();
  canvasHeight.value = event.height || canvas.getHeight();
  drawChart(props.option);
};
```

- [ ] **Step 4: Replace `bar` script setup canvas initialization**

In `ly-charts-bar.vue`, add `canvasRef` next to the other refs:

```js
const canvasId = ref('bar-chart-' + Date.now());
const canvasRef = ref(null);
const ctx = ref(null);
```

Replace `initCanvas` with:

```js
const initCanvas = () => {
  const canvas = canvasRef.value;
  if (canvas && typeof canvas.refresh === 'function') {
    canvas.refresh();
  }
};
```

Add this function after `initCanvas`:

```js
const handleCanvasReady = (event) => {
  const canvas = canvasRef.value;
  if (!canvas) {
    console.error('无法获取canvas绘图上下文');
    return;
  }
  ctx.value = canvas;
  canvasWidth.value = event.width || canvas.getWidth();
  canvasHeight.value = event.height || canvas.getHeight();
  drawChart(props.option);
};
```

- [ ] **Step 5: Replace `scatter` template and initialization**

Replace the `<canvas>` block in `ly-charts-scatter.vue` with:

```vue
<ly-canvas
  ref="canvasRef"
  class="chart-canvas"
  :canvas-id="canvasId"
  width="100"
  height="100"
  :use-root-height-and-width="true"
  @ready="handleCanvasReady"
  @touchstart="handleTouchStart"
  @touchmove="handleTouchMove"
  @touchend="handleTouchEnd"
/>
```

Replace the `initCanvas()` method with:

```js
initCanvas() {
  const canvasRef = this.$refs.canvasRef;
  if (canvasRef && typeof canvasRef.refresh === 'function') {
    canvasRef.refresh();
  }
},
```

Add this method after `initCanvas()`:

```js
handleCanvasReady(event) {
  const canvasRef = this.$refs.canvasRef;
  if (!canvasRef) {
    console.error('无法获取canvas绘图上下文');
    return;
  }
  this.ctx = canvasRef;
  this.canvasWidth = event.width || canvasRef.getWidth();
  this.canvasHeight = event.height || canvasRef.getHeight();
  this.drawChart(this.option);
},
```

- [ ] **Step 6: Verify axis charts no longer use direct canvas creation**

Run:

```powershell
rg -n '<canvas|createCanvasContext' src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue
```

Expected: no output.

- [ ] **Step 7: Commit axis chart migration**

Run:

```powershell
git add src/uni_modules/ly-charts/components/ly-charts-line/ly-charts-line.vue src/uni_modules/ly-charts/components/ly-charts-bar/ly-charts-bar.vue src/uni_modules/ly-charts/components/ly-charts-scatter/ly-charts-scatter.vue
git commit -m "feat: 普通 Vue 轴类图表使用 ly-canvas"
```

---

### Task 2: Non-Axis Vue Charts Use ly-canvas

**Files:**
- Modify: `src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue`
- Modify: `src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.vue`

**Interfaces:**
- Consumes: `ly-canvas` methods `refresh`, `getWidth`, `getHeight`, and drawing wrapper methods.
- Produces: unchanged chart component external API; internally draw helpers receive the shared `ly-canvas` wrapper instead of raw uni contexts.

- [ ] **Step 1: Replace `pie` canvas host**

Replace the `<canvas>` block in `ly-charts-pie.vue` with:

```vue
<ly-canvas
  ref="canvasRef"
  :canvas-id="cid"
  :width="canvasWidth || 100"
  :height="canvasHeight"
  @ready="handleCanvasReady"
  @touchstart="handleTouchStart"
  @touchmove="handleTouchMove"
  @touchend="handleTouchEnd"
/>
```

- [ ] **Step 2: Replace `radar` canvas host**

Replace the `<canvas>` block in `ly-charts-radar.vue` with:

```vue
<ly-canvas
  ref="canvasRef"
  :canvas-id="cid"
  :width="canvasWidth || 100"
  :height="canvasHeight"
  @ready="handleCanvasReady"
  @touchstart="handleTouchStart"
  @touchmove="handleTouchMove"
  @touchend="handleTouchEnd"
/>
```

- [ ] **Step 3: Add shared context helpers to `pie`**

Add these refs after `const isMount = ref(false);`:

```js
const canvasRef = ref(null);
const ctx = ref(null);
```

Add these functions before `drawChart`:

```js
const getCanvasContext = () => ctx.value;

const refreshCanvas = () => {
  const canvas = canvasRef.value;
  if (canvas && typeof canvas.refresh === 'function') {
    canvas.refresh();
    return true;
  }
  return false;
};

const handleCanvasReady = (event) => {
  const canvas = canvasRef.value;
  if (!canvas) {
    console.error('无法获取canvas绘图上下文');
    return;
  }
  ctx.value = canvas;
  canvasWidth.value = event.width || canvas.getWidth();
  canvasHeight.value = event.height || canvas.getHeight();
  drawChart();
};
```

Replace every local context creation with:

```js
const ctx = getCanvasContext();
if (!ctx) return;
```

Replace `init` with:

```js
const init = () => {
  getCanvasSize().then(() => {
    refreshCanvas();
  });
};
```

- [ ] **Step 4: Add shared context helpers to `radar`**

Add these refs after `const isMount = ref(false);`:

```js
const canvasRef = ref(null);
const ctx = ref(null);
```

Add these functions before `drawChart`:

```js
const getCanvasContext = () => ctx.value;

const refreshCanvas = () => {
  const canvas = canvasRef.value;
  if (canvas && typeof canvas.refresh === 'function') {
    canvas.refresh();
    return true;
  }
  return false;
};

const handleCanvasReady = (event) => {
  const canvas = canvasRef.value;
  if (!canvas) {
    console.error('无法获取canvas绘图上下文');
    return;
  }
  ctx.value = canvas;
  canvasWidth.value = event.width || canvas.getWidth();
  canvasHeight.value = event.height || canvas.getHeight();
  drawChart();
};
```

Replace every local context creation with:

```js
const ctx = getCanvasContext();
if (!ctx) return;
```

Replace `init` with:

```js
const init = () => {
  getCanvasSize().then(() => {
    refreshCanvas();
  });
};
```

- [ ] **Step 5: Replace `gauge` canvas host**

Replace the `<canvas>` block in `ly-charts-gauge.vue` with:

```vue
<ly-canvas
  ref="canvasRef"
  :canvas-id="canvasId"
  :width="canvasWidth"
  :height="canvasHeight"
  @ready="handleCanvasReady"
  @touchstart="handleTouchStart"
  @touchmove="handleTouchMove"
  @touchend="handleTouchEnd"
/>
```

Add these refs after `const canvasId = ref('chart-gauge' + Date.now());`:

```js
const canvasRef = ref(null);
const ctx = ref(null);
```

Replace `drawChart` with:

```js
const drawChart = () => {
  if (disposed.value || !ctx.value) return;
  drawGauge(ctx.value);
};
```

Add this function after `init`:

```js
const handleCanvasReady = (event) => {
  const canvas = canvasRef.value;
  if (!canvas) {
    console.error('无法获取canvas绘图上下文');
    return;
  }
  ctx.value = canvas;
  canvasWidth.value = event.width || canvas.getWidth();
  canvasHeight.value = event.height || canvas.getHeight();
  updateChart(props.option);
};
```

Replace direct context use in `clear` and `showLoading` with:

```js
const canvasCtx = ctx.value;
if (!canvasCtx) return false;
```

Then call `canvasCtx.clearRect`, `canvasCtx.setFillStyle`, `canvasCtx.fillRect`, `canvasCtx.fillText`, and `canvasCtx.draw`.

- [ ] **Step 6: Verify non-axis charts no longer use direct canvas creation**

Run:

```powershell
rg -n '<canvas|createCanvasContext' src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.vue
```

Expected: no output.

- [ ] **Step 7: Commit non-axis chart migration**

Run:

```powershell
git add src/uni_modules/ly-charts/components/ly-charts-pie/ly-charts-pie.vue src/uni_modules/ly-charts/components/ly-charts-radar/ly-charts-radar.vue src/uni_modules/ly-charts/components/ly-charts-gauge/ly-charts-gauge.vue
git commit -m "feat: 普通 Vue 非轴类图表使用 ly-canvas"
```

---

### Task 3: Shared Canvas Verification And Docs

**Files:**
- Inspect: `src/uni_modules/ly-charts/components/ly-canvas/ly-canvas.vue`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\index.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\pie.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\radar.md`
- Modify: `D:\Repos\xyito\open\lyCharts-docs\docs\charts\gauge.md`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: docs that describe the common canvas layer and WeChat Mini Program 2d mode.

- [ ] **Step 1: Verify `ly-canvas.vue` keeps WeChat Mini Program 2d mode**

Run:

```powershell
rg -n 'MP \\|\\| H5|type="2d"|createCanvasContext|getContext\\(' src/uni_modules/ly-charts/components/ly-canvas/ly-canvas.vue
```

Expected: output includes the `MP || H5` template branch and `type="2d"` on the canvas element in that branch.

- [ ] **Step 2: Update docs home page**

In `D:\Repos\xyito\open\lyCharts-docs\docs\index.md`, change the first feature detail from:

```yaml
details: 使用canvas技术全新开发,支持App/H5/小程序/鸿盟等各端.
```

to:

```yaml
details: 使用公共ly-canvas画布层全新开发,支持App/H5/小程序/鸿盟等各端,微信小程序默认启用2d canvas模式.
```

- [ ] **Step 3: Add chart-page common canvas note**

After each chart page platform support table in these files, insert the same note:

```markdown
> 普通 Vue、uvue 和 uni-app-x 图表均通过公共 `ly-canvas` 画布层初始化；微信小程序端由公共层启用 `type="2d"` 模式。
```

Files:

```text
D:\Repos\xyito\open\lyCharts-docs\docs\charts\line.md
D:\Repos\xyito\open\lyCharts-docs\docs\charts\bar.md
D:\Repos\xyito\open\lyCharts-docs\docs\charts\scatter.md
D:\Repos\xyito\open\lyCharts-docs\docs\charts\pie.md
D:\Repos\xyito\open\lyCharts-docs\docs\charts\radar.md
D:\Repos\xyito\open\lyCharts-docs\docs\charts\gauge.md
```

- [ ] **Step 4: Run static verification**

Run:

```powershell
rg -n '<canvas|createCanvasContext' src/uni_modules/ly-charts/components -g '*.vue'
```

Expected: output only references `src/uni_modules/ly-charts/components/ly-canvas/ly-canvas.vue`.

Run:

```powershell
git diff --check
```

Expected: no output.

Run:

```powershell
pnpm type-check
```

Expected: either pass or fail only with the known baseline issues for missing `uni_modules/uview-plus/types` and removed TypeScript options `importsNotUsedAsValues` / `preserveValueImports`.

- [ ] **Step 5: Commit docs and final verification state**

Run in `D:\Repos\xyito\open\lyCharts`:

```powershell
git add src/uni_modules/ly-charts/components/ly-canvas/ly-canvas.vue
git commit -m "chore: 核对 ly-canvas 小程序 2d 模式"
```

If `ly-canvas.vue` had no source change, skip that commit and state that the existing `type="2d"` branch already satisfied the requirement.

Run in `D:\Repos\xyito\open\lyCharts-docs`:

```powershell
git add docs/index.md docs/charts/line.md docs/charts/bar.md docs/charts/scatter.md docs/charts/pie.md docs/charts/radar.md docs/charts/gauge.md
git commit -m "docs: 说明图表统一使用 ly-canvas"
```

Run in `D:\Repos\xyito\open\lyCharts`:

```powershell
git status --short --branch
```

Expected: no uncommitted source changes in the main repo.
