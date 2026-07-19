# 普通 Vue 图表统一使用 ly-canvas 设计

## 背景

`ly-charts` 当前已有公共 `ly-canvas` 组件，用于封装多端 canvas 初始化、尺寸读取、绘图上下文兼容方法和触摸事件转发。`uvue` 与 `uin-app-x` 图表基本已经统一使用 `ly-canvas`，但普通 `.vue` 图表里仍有 `line`、`bar`、`scatter`、`pie`、`radar`、`gauge` 直接声明 `<canvas>` 并调用 `uni.createCanvasContext`。

这导致普通 Vue 与 uvue 实现的画布初始化路径不一致，微信小程序端 `type="2d"` 行为也需要在多个图表组件里分别维护。

## 目标

- 普通 `.vue` 的 `line`、`bar`、`scatter`、`pie`、`radar`、`gauge` 统一使用公共 `<ly-canvas>`。
- 继续保留现有 props、事件、绘图效果和 ECharts 兼容运行时 API 行为。
- 微信小程序端通过 `ly-canvas.vue` 的 `MP || H5` 分支继续启用 `type="2d"`。
- 同步更新同级 docs 仓库，说明普通 Vue 图表已经统一使用公共 canvas 层。

## 非目标

- 不重写图表绘制算法。
- 不扩大 ECharts API 兼容范围。
- 不调整发布流程，不在本轮自动发版。

## 方案

采用最小迁移方案：只替换普通 Vue 图表的画布宿主和初始化层。

`line`、`bar`、`scatter` 使用与现有 uvue/candlestick 类似的结构：

- 模板从 `<canvas>` 替换为 `<ly-canvas ref="canvasRef">`。
- 传入 `canvas-id`、`width`、`height`、`use-root-height-and-width`。
- 将 touch 事件继续接到原有 `handleTouchStart`、`handleTouchMove`、`handleTouchEnd`。
- 监听 `ready` 事件，在回调中设置 `ctx`、`canvasWidth`、`canvasHeight` 并触发原绘图函数。

`pie`、`radar`、`gauge` 保留当前尺寸计算方式，但绘图上下文改为复用 `ly-canvas` 实例。原来每次绘制时重新 `uni.createCanvasContext` 的代码改为读取公共上下文，避免绕过公共层。

`ly-canvas.vue` 当前在 `MP || H5` 分支已设置 `type="2d"`，本次实现会保留并核对该行为；如果迁移后发现普通 Vue 图表未触发该分支，需要在 `ly-canvas` 内部修正，而不是在每个图表中重复声明。

## 数据流

1. 图表组件接收 `option`、`width`、`height`。
2. 图表组件把尺寸传给 `ly-canvas`。
3. `ly-canvas` 完成节点查询、2d 上下文创建、高清屏缩放、背景清理后发出 `ready`。
4. 图表组件保存公共画布实例作为 `ctx`，保存 `ready` 返回的宽高。
5. 原有 `drawChart`、tooltip、dispatchAction、appendData 等逻辑继续使用 `ctx` 兼容方法绘制。

## 错误处理

- 如果 `ly-canvas` 未 ready 或返回空上下文，图表组件不绘制并输出现有风格的初始化错误。
- `option` watch 在画布未 ready 前不会强制创建原生上下文，避免回退到旧路径。
- `clear`、`showLoading` 等运行时方法继续在 `ctx` 不存在时安全返回。

## 文档

同步更新 `D:\Repos\xyito\open\lyCharts-docs`：

- 在相关图表文档或统一说明中补充普通 Vue 图表已统一使用公共 `ly-canvas`。
- 明确微信小程序端使用 2d canvas 模式由公共层处理。

## 验证

- 静态搜索确认普通 `.vue` 图表不再直接声明业务 `<canvas>` 或直接调用 `uni.createCanvasContext`。
- `git diff --check`。
- 如环境允许，执行现有类型检查；已知旧基线错误需要单独说明，不作为本轮新增失败。
