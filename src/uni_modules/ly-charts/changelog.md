## 26.2.4
feat: 增强 ECharts 运行时 API 兼容能力

- line/bar/scatter 支持 legend.selected 和 legendToggleSelect
- line/bar/scatter 支持 dataZoom 数据窗口裁剪
- tooltip.formatter 支持基础字符串模板，Vue 端支持函数 formatter，uvue 端安全降级

## 26.2.3
feat: add ECharts runtime API compatibility

## 26.2.2
feat: 为 line/bar/scatter/pie/radar/gauge 补齐点击与拖动当前数据展示

- 兼容 ECharts 风格 option/event（tooltipShow、click）
- 覆盖 uni-app 与 uni-app-x 两端
- 保持 candlestick 行为不变

## 26.2.1（2026-07-15）
feat: 新增K线图组件

## 26.2（2026-07-13）
feat: 新增uni-app-x支持

## 26.1.4（2026-01-21）
add: 增加option参数类型文件

## 26.1.3（2026-01-21）
refactor: 【组合式API重构】pie饼图组件

## 26.1.2（2026-01-20）
refactor: 【组合式API重构】guage仪表盘组件

## 26.1.1（2026-01-20）
refactor: 【组合式API重构】柱状图组件

## 26.1.0（2026-01-20）
refactor: 【组合式API重构】折线图组件

## 26.0.21（2026-01-15）
improvment: scatter组件前缀统一

## 26.0.20（2026-01-15）
improvment: radar组件前缀统一

## 26.0.19（2026-01-13）
improvment: 优化pie组件前缀

## 26.0.18（2026-01-13）
improvment: 优化gague组件前缀

## 26.0.17（2026-01-09）
improvment: 优化柱状图组件前缀

## 26.0.16（2026-01-09）
improvment: 优化折线图组件前缀

## 26.0.15（2026-01-08）
perf: 删除多个多余的libs相关工具类

## 26.0.14（2026-01-05）
add: 折线图支持X轴项目名称过长时自动旋转展示

## 26.0.13（2026-01-04）
add: 雷达图新增支持显示数值

## 26.0.12（2025-12-30）
improvment: 优化line语法兼容性

## 26.0.11（2025-09-04）
improvment: 📈图标补充

## 26.0.10（2025-09-04）
feat: 折线图与柱状图新增支持配置xAxis.axisLabel.show控制是否显示X轴标签

## 26.0.9（2025-09-02）
feat: 折线图新增支持配置yAxis.axisLabel.show控制是否显示Y轴刻度标签

## 26.0.8（2025-08-29）
feat: 新增支持配置是否显示坐标轴轴线

## 26.0.7（2025-08-27）
feat: 折线图支持配置series[].label显示数值标签

## 26.0.6（2025-08-22）
feat: 优化折线图示例高度

## 26.0.5（2025-08-22）
fix: 修复示例统一参数为option

## 26.0.4（2025-08-22）
fix: 统一radar雷达图参数名为option

## 26.0.3（2025-08-21）
fix: 统一pie饼图参数名为option

## 26.0.2（2025-08-21）
fix: 仪表盘参数统一为option

## 26.0.1（2025-08-21）
improvment: 完善柱状图方法注释

## 26.0（2025-08-20）
feat: 新增折线图组件

feat: 新增柱状图&山峰图组件

feat: 新增饼图组件

feat: 新增散点图组件

feat: 新增雷达图组件

feat: 新增仪表台组件
