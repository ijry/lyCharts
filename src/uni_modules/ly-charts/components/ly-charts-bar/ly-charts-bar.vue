<template>
  <view class="ly-charts-bar" :style="{ width: containerWidth, height: containerHeight }">
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
  </view>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import chartHelper from '../../libs/util/chartHelper.js';
import {
  normalizeOption,
  mergeOptions,
  createEventRegistry,
  applyLegendSelection,
  applyAxisDataWindow,
  appendSeriesData,
  clearItemState,
  hasItemState,
  setItemState,
  toggleLegendSelected,
  toggleItemState,
  updateDataZoomOption,
  formatTooltipLines
} from '../../libs/util/runtimeHelper.js';

// 定义props
const props = defineProps({
  // ECharts 风格的配置项
  option: {
    type: Object,
    default: () => ({})
  },
  // 容器高度
  height: {
    type: [String, Number],
    default: 400
  },
  // 容器宽度
  width: {
    type: [String, Number],
    default: '100%'
  }
});

// 响应式数据
const canvasId = ref('bar-chart-' + Date.now());
const canvasRef = ref(null);
const ctx = ref(null);
const canvasWidth = ref(0);
const canvasHeight = ref(0);
const grid = ref({ top: 10, right: 20, bottom: 25, left: 50 });
// 存储系列数据用于事件处理
const seriesData = ref([]);
const activePointer = ref(null);
const plotGrid = ref(null);
const categoryCenters = ref([]);
const currentOption = ref({});
const disposed = ref(false);
const loading = ref(false);
const highlightState = ref({});
const selectState = ref({});
const eventRegistry = createEventRegistry();
// 触摸相关信息
const touchInfo = ref({
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0
});
const TAP_SLOP = 8;

// 计算属性
const containerHeight = computed(() => {
  return typeof props.height === 'number' ? props.height + 'px' : props.height;
});

const containerWidth = computed(() => {
  return typeof props.width === 'number' ? props.width + 'px' : props.width;
});

// 定义emit
const emit = defineEmits(['click', 'tooltipShow']);
const emitChartEvent = (eventName, payload) => {
  emit(eventName, payload);
  eventRegistry.emit(eventName, payload);
};

/**
 * 初始化画布
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const initCanvas = () => {
  const canvas = canvasRef.value;
  if (canvas && typeof canvas.refresh === 'function') {
    canvas.refresh();
  }
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
  drawChart(props.option);
};

/**
 * 绘制图表
 * @param {Object} option - 图表配置项
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const drawChart = (option) => {
  if (disposed.value) return;
  if (!ctx.value || !option) return;
  const normalizedOption = normalizeOption(option);
  currentOption.value = normalizedOption;
  option = applyAxisDataWindow(applyLegendSelection(normalizedOption)).option;
  
  try {
    // 清空画布
    ctx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
    
    // 设置背景色
    if (option.backgroundColor) {
      ctx.value.setFillStyle(option.backgroundColor);
      ctx.value.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
    }
    
    // 绘制标题
    let titleHeight = 0;
    if (option.title && option.title.text) {
      titleHeight = chartHelper.drawTitle(ctx.value, option.title, canvasWidth.value);
    }
    
    // 如果有标题，调整网格顶部边距
    if (titleHeight > 0) {
      grid.value.top = Math.max(grid.value.top, titleHeight + 10);
    }
    
    // 提取系列数据
    const series = option.series || [];
    const xAxis = option.xAxis || {};
    const yAxis = option.yAxis || {};
    
    // 处理x轴数据
    const xAxisData = chartHelper.processXAxisData(xAxis, series);
    
    // 计算数据范围
    const { minY, maxY } = calculateStackedDataRange(series);
    
    // 获取X轴padding配置，默认为10px
    const xAxisPadding = option.xAxisPadding !== undefined ? option.xAxisPadding : 10;

    // 绘制图例（在网格调整之前）
    let legendHeight = 0;
    if (option.legend && option.legend.data) {
      const legendOption = { 
        ...option.legend, 
      };
      // 为图例生成与系列一致的颜色列表
      const legendColors = series.map((serie, index) => 
        serie.color || serie.itemStyle?.color || chartHelper.getColor(index)
      );
      legendHeight = chartHelper.drawLegend(
        ctx.value, 
        legendOption, 
        grid.value, 
        canvasWidth.value, 
        legendColors, // 使用与系列一致的颜色
        canvasHeight.value,
        titleHeight
      );
    }
    
    // 绘制网格
    if (option.grid !== false) {
      chartHelper.drawGrid(ctx.value, grid.value, canvasWidth.value, canvasHeight.value, xAxisData.length, minY, maxY, false, xAxisPadding);
    }
    
    // 绘制坐标轴
    chartHelper.drawAxis(ctx.value, grid.value, canvasWidth.value, canvasHeight.value, xAxisData, minY, maxY, xAxis, yAxis, 'bar', xAxisPadding);
    
    // 绘制柱状图
    drawBars(series, xAxisData, minY, maxY, chartHelper.adjustedYMin, chartHelper.adjustedYMax, xAxisPadding);

    const chartWidth = canvasWidth.value - grid.value.left - grid.value.right;
    const chartHeight = canvasHeight.value - grid.value.top - grid.value.bottom;
    plotGrid.value = {
      left: grid.value.left,
      top: grid.value.top,
      width: chartWidth,
      height: chartHeight
    };

    // 使用各分类下第一根柱子的中心作为命中基准
    const centers = [];
    const categoryCount = (xAxisData || []).length;
    for (let i = 0; i < categoryCount; i++) {
      let center = null;
      for (const series of seriesData.value) {
        const point = series.points?.[i];
        if (!point) continue;
        center = point.x + (point.barWidth || 20) / 2;
        break;
      }
      if (center == null) {
        const paddedChartWidth = chartWidth - 2 * xAxisPadding;
        center = grid.value.left + xAxisPadding + (categoryCount > 1 ? (i / (categoryCount - 1)) * paddedChartWidth : paddedChartWidth / 2);
      }
      centers.push(center);
    }
    categoryCenters.value = centers;

    if (activePointer.value) {
      drawBarAxisPointer();
      drawBarTooltipBox();
    }
    
    // 绘制到画布
    ctx.value.draw();
  } catch (error) {
    console.error('绘制图表失败:', error);
  }
};

/**
 * 绘制山峰形状的柱子 (三角形)
 * @param {Object} ctx - canvas上下文
 * @param {Number} x - x坐标
 * @param {Number} y - y坐标
 * @param {Number} width - 宽度
 * @param {Number} height - 高度
 * @param {String} color - 颜色
 * @param {String} borderColor - 边框颜色
 * @param {Number} borderWidth - 边框宽度
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const drawMountainBar = (ctx, x, y, width, height, color, borderColor, borderWidth) => {
  ctx.beginPath();
  ctx.setFillStyle(color);
  
  // 三角形山峰图，底部更宽，占满整个柱子宽度
  // 修改: 使用grid总宽度除以列数作为底部宽度参考
  const chartWidth = canvasWidth.value - grid.value.left - grid.value.right;
  const columnCount = props.option.xAxis?.data?.length || 1;
  const bottomWidth = chartWidth / columnCount; // 占满整个列宽
  const topWidth = width * 0.3;   // 顶部宽度减少到30%，使顶部更尖
  
  const bottomX = x - (bottomWidth - width) / 2; // 底部居中
  const topX = x + (width - topWidth) / 2;       // 顶部居中
  
  ctx.moveTo(topX + topWidth / 2, y);           // 顶部中心点
  ctx.lineTo(bottomX, y + height);              // 左下角
  ctx.lineTo(bottomX + bottomWidth, y + height); // 右下角
  ctx.lineTo(topX + topWidth / 2, y);           // 回到顶部
  
  ctx.closePath();
  ctx.fill();
  
  // 绘制边框
  if (borderWidth > 0 && borderColor) {
    ctx.setLineWidth(borderWidth);
    ctx.setStrokeStyle(borderColor);
    ctx.stroke();
  }
};

/**
 * 绘制圆角山峰形状的柱子
 * @param {Object} ctx - canvas上下文
 * @param {Number} x - x坐标
 * @param {Number} y - y坐标
 * @param {Number} width - 宽度
 * @param {Number} height - 高度
 * @param {String} color - 颜色
 * @param {String} borderColor - 边框颜色
 * @param {Number} borderWidth - 边框宽度
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const drawRoundedMountainBar = (ctx, x, y, width, height, color, borderColor, borderWidth) => {
  ctx.beginPath();
  ctx.setFillStyle(color);
  
  // 底部更宽，顶部更圆润，形成S形曲线
  const bottomWidth = width * 4.0; // 底部宽度增加到400% (原来是200%)
  const topWidth = width * 5.0;    // 顶部宽度为原始宽度，使顶部更尖
  
  const bottomX = x - (bottomWidth - width) / 2; // 底部居中
  const topX = x + (width - topWidth) / 2;       // 顶部居中
  
  // 使用更平滑的贝塞尔曲线绘制圆润的山峰形状
  const bottomY = y + height;
  const topY = y;
  
  // 起始点在左侧底部
  ctx.moveTo(bottomX, bottomY);
  
  // 左侧S形曲线：从底部到顶部
  // 调整控制点使顶部更尖锐
  ctx.bezierCurveTo(
    bottomX + bottomWidth * 0.4, bottomY - height * 0.2,    // 左侧底部控制点
    topX + topWidth * 0.3, topY + height * 0.2,             // 左侧腰部控制点
    topX + topWidth * 0.5, topY + height * 0.2              // 顶部中心点
  );
  
  // 右侧S形曲线：从顶部到底部
  ctx.bezierCurveTo(
    topX + topWidth * 0.7, topY + height * 0.2,             // 右侧腰部控制点
    bottomX + bottomWidth * 0.6, bottomY - height * 0.2,    // 右侧底部控制点
    bottomX + bottomWidth, bottomY                          // 右侧底部终点
  );
  
  // 闭合路径回到起始点
  ctx.closePath();
  ctx.fill();
  
  // 绘制边框
  if (borderWidth > 0 && borderColor) {
    ctx.setLineWidth(borderWidth);
    ctx.setStrokeStyle(borderColor);
    ctx.stroke();
  }
};

/**
 * 绘制尖角山峰形状的柱子
 * @param {Object} ctx - canvas上下文
 * @param {Number} x - x坐标
 * @param {Number} y - y坐标
 * @param {Number} width - 宽度
 * @param {Number} height - 高度
 * @param {String} color - 颜色
 * @param {String} borderColor - 边框颜色
 * @param {Number} borderWidth - 边框宽度
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const drawSharpMountainBar = (ctx, x, y, width, height, color, borderColor, borderWidth) => {
  ctx.beginPath();
  ctx.setFillStyle(color);
  
  // 底部更宽，顶部更圆润，形成S形曲线
  const bottomWidth = width * 4.0; // 底部宽度增加到400% (原来是200%)
  const topWidth = width * 0.1;    // 顶部宽度为原始宽度，使顶部更尖
  
  const bottomX = x - (bottomWidth - width) / 2; // 底部居中
  const topX = x + (width - topWidth) / 2;       // 顶部居中
  
  // 使用更平滑的贝塞尔曲线绘制圆润的山峰形状
  const bottomY = y + height;
  const topY = y;
  
  // 起始点在左侧底部
  ctx.moveTo(bottomX, bottomY);
  
  // 左侧S形曲线：从底部到顶部
  // 调整控制点使顶部更尖锐
  ctx.bezierCurveTo(
    bottomX + bottomWidth * 0.4, bottomY - height * 0.2,    // 左侧底部控制点
    topX + topWidth * 0.3, topY + height * 0.2,             // 左侧腰部控制点
    topX + topWidth * 0.5, topY                                 // 顶部中心点，使顶部更尖
  );
  
  // 右侧S形曲线：从顶部到底部
  ctx.bezierCurveTo(
    topX + topWidth * 0.7, topY + height * 0.2,             // 右侧腰部控制点
    bottomX + bottomWidth * 0.6, bottomY - height * 0.2,    // 右侧底部控制点
    bottomX + bottomWidth, bottomY                          // 右侧底部终点
  );
  
  // 闭合路径回到起始点
  ctx.closePath();
  ctx.fill();
  
  // 绘制边框
  if (borderWidth > 0 && borderColor) {
    ctx.setLineWidth(borderWidth);
    ctx.setStrokeStyle(borderColor);
    ctx.stroke();
  }
};

/**
 * 绘制自然山峰形状的柱子 (重叠样式，后一个遮挡前一个一点点)
 * @param {Object} ctx - canvas上下文
 * @param {Number} x - x坐标
 * @param {Number} y - y坐标
 * @param {Number} width - 宽度
 * @param {Number} height - 高度
 * @param {String} color - 颜色
 * @param {String} borderColor - 边框颜色
 * @param {Number} borderWidth - 边框宽度
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const drawRealMountainBar = (ctx, x, y, width, height, color, borderColor, borderWidth) => {
  ctx.beginPath();
  ctx.setFillStyle(color);
  
  // 实现更接近圆珠笔头形状的 roundedMountain 样式
  // 底部更宽，顶部更圆润，形成S形曲线
  const bottomWidth = width * 4.0; // 底部宽度增加到400% (原来是200%)
  const topWidth = width * 2.0;    // 顶部宽度增加到200%，使顶部更圆润像帽子
  
  const bottomX = x - (bottomWidth - width) / 2; // 底部居中
  const topX = x + (width - topWidth) / 2;       // 顶部居中
  
  // 使用更平滑的贝塞尔曲线绘制圆润的山峰形状
  const bottomY = y + height;
  const topY = y;
  
  // 起始点在左侧底部
  ctx.moveTo(bottomX, bottomY);
  
  // 左侧S形曲线：从底部到顶部
  // 调整控制点使顶部更圆润，更像帽子
  ctx.bezierCurveTo(
    bottomX + bottomWidth * 0.3, bottomY - height * 0.3,    // 左侧底部控制点
    topX + topWidth * 0.2, topY + height * 0.3,             // 左侧腰部控制点
    topX + topWidth * 0.4, topY + height * 0.1              // 左侧接近顶部控制点
  );
  
  // 顶部圆润部分，添加额外控制点使顶部更像帽子
  ctx.bezierCurveTo(
    topX + topWidth * 0.5, topY,                            // 顶部中心点
    topX + topWidth * 0.6, topY + height * 0.1,             // 右侧接近顶部控制点
    topX + topWidth * 0.8, topY + height * 0.3              // 右侧腰部控制点
  );
  
  // 右侧S形曲线：从顶部到底部
  ctx.bezierCurveTo(
    topX + topWidth * 0.9, topY + height * 0.4,             // 右侧腰部控制点
    bottomX + bottomWidth * 0.7, bottomY - height * 0.3,    // 右侧底部控制点
    bottomX + bottomWidth, bottomY                          // 右侧底部终点
  );
  
  // 闭合路径回到起始点
  ctx.closePath();
  ctx.fill();
  
  // 绘制边框
  if (borderWidth > 0 && borderColor) {
    ctx.setLineWidth(borderWidth);
    ctx.setStrokeStyle(borderColor);
    ctx.stroke();
  }
};

/**
 * 绘制圆角柱状形状的柱子
 * @param {Object} ctx - canvas上下文
 * @param {Number} x - x坐标
 * @param {Number} y - y坐标
 * @param {Number} width - 宽度
 * @param {Number} height - 高度
 * @param {String} color - 颜色
 * @param {String} borderColor - 边框颜色
 * @param {Number} borderWidth - 边框宽度
 * @param {Number} borderRadius - 圆角半径
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const drawRoundedBar = (ctx, x, y, width, height, color, borderColor, borderWidth, borderRadius) => {
  const radius = borderRadius ? borderRadius : Math.min(width / 2, height / 2);
  ctx.beginPath();
  ctx.setFillStyle(color);
  
  // 绘制圆角矩形
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  
  ctx.closePath();
  ctx.fill();
  
  // 绘制边框
  if (borderWidth > 0 && borderColor) {
    ctx.setLineWidth(borderWidth);
    ctx.setStrokeStyle(borderColor);
    ctx.stroke();
  }
};

/**
 * 绘制柱状图
 * @param {Array} series - 系列数据
 * @param {Array} xAxisData - x轴数据
 * @param {Number} minY - y轴最小值
 * @param {Number} maxY - y轴最大值
 * @param {Number} adjustedYMin - 调整后的y轴最小值
 * @param {Number} adjustedYMax - 调整后的y轴最大值
 * @param {Number} xAxisPadding - x轴内边距
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const drawBars = (series, xAxisData, minY, maxY, adjustedYMin, adjustedYMax, xAxisPadding = 10) => {
  const chartWidth = canvasWidth.value - grid.value.left - grid.value.right;
  
  // 应用X轴padding
  const paddedChartWidth = chartWidth - 2 * xAxisPadding;
  
  const chartHeight = canvasHeight.value - grid.value.top - grid.value.bottom;
  
  seriesData.value = []; // 重置系列数据
  
  // 使用调整后的Y轴范围
  const useAdjustedY = adjustedYMin !== undefined && adjustedYMax !== undefined;
  const actualMinY = useAdjustedY ? adjustedYMin : minY;
  const actualMaxY = useAdjustedY ? adjustedYMax : maxY;
  
  // 确保最小值为0，这样柱状图才会从底部开始
  const barMinY = actualMinY < 0 ? actualMinY : 0;
  
  // 处理堆叠逻辑 - 构建stack映射
  const stackMap = new Map(); // 用于存储每个stack分组的数据
  
  // 预处理数据，构建堆叠结构
  series.forEach((serie, index) => {
    if (serie.type !== 'bar') return;
    
    if (serie.stack) {
      if (!stackMap.has(serie.stack)) {
        stackMap.set(serie.stack, []);
      }
      stackMap.get(serie.stack).push({ serie, index });
    }
  });
  
  // 计算柱子的宽度和间隔
  const barCategoryGap = 20; // 柱子之间的间隔
  
  // 计算分组数量：堆叠组数量 + 非堆叠系列数量
  const stackGroups = stackMap.size; // 堆叠分组数量
  const nonStackedBars = series.filter(s => s.type === 'bar' && !s.stack).length; // 非堆叠柱子数量
  const groupCount = stackGroups + nonStackedBars; // 总的分组数量
  
  const totalBarWidth = paddedChartWidth - (xAxisData.length - 1) * barCategoryGap;
  const groupWidth = groupCount > 0 ? Math.max(1, totalBarWidth / xAxisData.length) : 0; // 每组的宽度
  
  // 为每个系列分配位置
  const seriesPositions = new Map();
  let groupIndex = 0;
  
  // 先处理堆叠分组
  stackMap.forEach((stackSeries, stackName) => {
    seriesPositions.set(stackName, {
      groupIndex: groupIndex++,
      isStack: true,
      seriesList: stackSeries
    });
  });
  
  // 再处理非堆叠系列
  series.forEach((serie, index) => {
    if (serie.type !== 'bar') return;
    
    if (!serie.stack) {
      seriesPositions.set(index, {
        groupIndex: groupIndex++,
        isStack: false,
        seriesList: [{ serie, index }]
      });
    }
  });
  
  // 保存每个x轴位置上各个系列的基准值，用于堆叠计算
  const stackBaseValues = new Map();
  
  series.forEach((serie, index) => {
    if (serie.type !== 'bar') return;
    
    const color = serie.color || serie.itemStyle?.color || chartHelper.getColor(index);
    const barWidth = serie.barWidth || Math.min(20, groupWidth / (groupCount || 1));
    const symbol = serie.symbol || 'rect'; // 默认为矩形
    
    // 获取该系列的位置信息
    let positionInfo;
    if (serie.stack) {
      positionInfo = seriesPositions.get(serie.stack);
    } else {
      positionInfo = seriesPositions.get(index);
    }
    
    // 初始化stackBaseValues
    if (!stackBaseValues.has(positionInfo.groupIndex)) {
      stackBaseValues.set(positionInfo.groupIndex, new Array(xAxisData.length).fill(0));
    }
    
    // 计算柱状图位置
    const points = [];
    serie.data.forEach((value, i) => {
      // 支持 ECharts 规范的数据点格式 {value: ..., itemStyle: {color: ...}}
      const actualValue = typeof value === 'object' && value !== null ? (value.value !== undefined ? value.value : value) : value;
      
      // 计算基准X位置
      let x;
      const groupSlotWidth = paddedChartWidth / Math.max(xAxisData.length, 1);
      const groupStartX = grid.value.left + xAxisPadding + i * groupSlotWidth;
      
      if (positionInfo.isStack) {
        // 堆叠柱状图，所有同组柱子在同一位置
        x = groupStartX + (groupSlotWidth - barWidth) / 2;
      } else {
        // 并列柱状图，需要根据分组位置计算
        const groupCountForPosition = groupCount || 1;
        const barSpacing = barWidth * 0.1; // 柱子之间的间距比例
        const totalGroupWidth = barWidth * groupCountForPosition + barSpacing * (groupCountForPosition - 1);
        const groupStart = groupStartX + (groupSlotWidth - totalGroupWidth) / 2;
        x = groupStart + positionInfo.groupIndex * (barWidth + barSpacing);
      }
      
      // 计算基准线位置（0值位置）
      const zeroY = grid.value.top + chartHeight - ((0 - barMinY) / (actualMaxY - barMinY || 1)) * chartHeight;
      
      // 处理堆叠逻辑
      let y, barHeight;
      if (positionInfo.isStack) {
        // 堆叠柱状图逻辑
        const baseValues = stackBaseValues.get(positionInfo.groupIndex);
        const stackBase = baseValues[i];
        
        // 正值堆叠在上方，负值堆叠在下方
        const baseY = grid.value.top + chartHeight - ((stackBase - barMinY) / (actualMaxY - barMinY || 1)) * chartHeight;
        const topY = grid.value.top + chartHeight - ((stackBase + actualValue - barMinY) / (actualMaxY - barMinY || 1)) * chartHeight;
        
        y = topY;
        barHeight = Math.abs(baseY - topY);
        
        // 更新基准值
        baseValues[i] = stackBase + actualValue;
      } else {
        // 非堆叠柱状图逻辑
        y = grid.value.top + chartHeight - ((actualValue - barMinY) / (actualMaxY - barMinY || 1)) * chartHeight;
        barHeight = Math.abs(y - zeroY);
      }
      
      // 支持为单个数据点设置颜色 (ECharts 规范)
      const pointColor = typeof value === 'object' && value !== null && value.itemStyle?.color ? 
                         value.itemStyle.color : 
                         (typeof value === 'object' && value !== null && value.color ? value.color : color);
      
      // 获取边框样式 - 修复borderColor和borderWidth获取逻辑
      let borderColor = serie.itemStyle?.borderColor || null;
      let borderWidth = serie.itemStyle?.borderWidth || 0;
      // 获取圆角配置
      let borderRadius = serie.itemStyle?.borderRadius || 0;
      
      // 如果是对象格式的数据点，获取其边框样式
      if (typeof value === 'object' && value !== null) {
        borderColor = value.itemStyle?.borderColor || value.borderColor || borderColor;
        borderWidth = value.itemStyle?.borderWidth || value.borderWidth || borderWidth;
        borderRadius = value.itemStyle?.borderRadius || value.borderRadius || borderRadius;
      }
      
      points.push({ 
        x, 
        y: actualValue >= 0 ? y : (positionInfo.isStack ? y : zeroY), 
        value: actualValue, 
        name: xAxisData[i],
        seriesName: serie.name,
        barHeight,
        zeroY, // 保存0值的Y坐标用于绘制负值柱子
        barWidth, // 保存柱子宽度
        symbol, // 保存柱子形状
        color: pointColor, // 保存柱子颜色
        borderColor, // 保存边框颜色
        borderWidth, // 保存边框宽度
        borderRadius  // 保存圆角配置
      });
    });
    
    // 保存系列数据用于事件处理
    seriesData.value.push({
      name: serie.name,
      points,
      color
    });
    
    // 绘制柱状图
    points.forEach((point, pointIndex) => {
      // 根据symbol属性选择绘制方式
      // 当是山峰图时如果没有指定颜色，则从defaultColors中获取颜色
      let drawColor = point.color;
      if (!drawColor || (drawColor === color
        && (point.symbol === 'mountain' || point.symbol === 'realMountain' || point.symbol === 'roundedMountain' || point.symbol === 'sharpMountain'))) {
        drawColor = chartHelper.defaultColors[pointIndex % chartHelper.defaultColors.length];
      }
      const selected = hasItemState(selectState.value, index, pointIndex);
      const highlighted = hasItemState(highlightState.value, index, pointIndex);
      const originalBorderWidth = Number(point.borderWidth || 0);
      if (selected) {
        point.borderColor = '#0f172a';
        point.borderWidth = Math.max(originalBorderWidth, 3);
      } else if (highlighted) {
        point.borderColor = '#ffffff';
        point.borderWidth = Math.max(originalBorderWidth, 2);
      }
      
      switch (point.symbol) {
        case 'mountain':
          // 山峰图 (三角形)
          drawMountainBar(
            ctx.value, 
            point.x, 
            point.value >= 0 ? point.y : (positionInfo.isStack ? point.y : zeroY), 
            point.barWidth, 
            point.barHeight, 
            drawColor || point.color, // 使用数据点颜色或默认颜色
            point.borderColor, // 使用数据点边框颜色
            point.borderWidth  // 使用数据点边框宽度
          );
          break;
          
        case 'roundedMountain':
          // 圆角山峰图 (重叠样式)
          drawRoundedMountainBar(
            ctx.value, 
            point.x, 
            point.value >= 0 ? point.y : (positionInfo.isStack ? point.y : zeroY), 
            point.barWidth, 
            point.barHeight, 
            drawColor || point.color, // 使用数据点颜色或默认颜色
            point.borderColor, // 使用数据点边框颜色
            point.borderWidth  // 使用数据点边框宽度
          );
          break;

        case 'realMountain':
          // 圆角山峰图 (重叠样式)
          drawRealMountainBar(
            ctx.value, 
            point.x, 
            point.value >= 0 ? point.y : (positionInfo.isStack ? point.y : zeroY), 
            point.barWidth, 
            point.barHeight, 
            drawColor || point.color, // 使用数据点颜色或默认颜色
            point.borderColor, // 使用数据点边框颜色
            point.borderWidth  // 使用数据点边框宽度
          );
          break;
          
        case 'sharpMountain':
          // 尖角山峰图 (明显内凹曲线，底部更宽以实现重叠效果)
          drawSharpMountainBar(
            ctx.value, 
            point.x, 
            point.value >= 0 ? point.y : (positionInfo.isStack ? point.y : zeroY), 
            point.barWidth, 
            point.barHeight, 
            drawColor || point.color, // 使用数据点颜色或默认颜色
            point.borderColor, // 使用数据点边框颜色
            point.borderWidth  // 使用数据点边框宽度
          );
          break;
          
        case 'rounded':
          // 圆角柱状图
          drawRoundedBar(
            ctx.value, 
            point.x, 
            point.value >= 0 ? point.y : (positionInfo.isStack ? point.y : zeroY), 
            point.barWidth, 
            point.barHeight, 
            drawColor || point.color, // 使用数据点颜色或默认颜色
            point.borderColor, // 使用数据点边框颜色
            point.borderWidth  // 使用数据点边框宽度
          );
          break;
          
        default:
          // 默认柱状图 - 支持borderRadius配置
          if (point.borderRadius && point.borderRadius > 0) {
            // 如果配置了borderRadius，则使用圆角矩形绘制
            drawRoundedBar(
              ctx.value,
              point.x,
              point.value >= 0 ? point.y : (positionInfo.isStack ? point.y : zeroY),
              point.barWidth,
              point.barHeight,
              drawColor || point.color,
              point.borderColor,
              point.borderWidth,
              point.borderRadius
            );
          } else {
            // 否则使用普通矩形绘制
            ctx.value.setFillStyle(drawColor || point.color); // 使用数据点颜色或默认颜色
            // 根据值的正负确定绘制方向
            const drawY = point.value >= 0 ? point.y : (positionInfo.isStack ? point.y : zeroY);
            ctx.value.fillRect(
              point.x, 
              drawY, 
              point.barWidth, 
              point.barHeight
            );
            
            // 绘制边框 (仅对非堆叠柱状图绘制边框)
            if (!positionInfo.isStack && point.borderWidth > 0 && point.borderColor) {
              ctx.value.setLineWidth(point.borderWidth);
              ctx.value.setStrokeStyle(point.borderColor);
              ctx.value.strokeRect(
                point.x, 
                drawY, 
                point.barWidth, 
                point.barHeight
              );
            }
          }
      }
    });
  });
  
  // 处理堆叠柱状图的整体边框样式
  stackMap.forEach((stackSeries) => {
    // 获取堆叠组的边框样式（从第一个系列获取）
    if (stackSeries.length > 0) {
      const firstSeries = stackSeries[0].serie;
      const stackBorderColor = firstSeries.itemStyle?.borderColor || null;
      const stackBorderWidth = firstSeries.itemStyle?.borderWidth || 0;
      
      // 如果设置了堆叠组的边框样式，则绘制整体边框
      if (stackBorderWidth > 0 && stackBorderColor) {
        stackSeries.forEach(({ serie, index }) => {
          const positionInfo = seriesPositions.get(serie.stack);
          serie.data.forEach((value, i) => {
            const points = seriesData.value[index].points;
            if (points && points[i]) {
              const point = points[i];
              // 只有堆叠组中的最后一个系列才绘制整体边框
              const isLastInStack = index === stackSeries[stackSeries.length - 1].index;
              
              if (isLastInStack) {
                // 计算整个堆叠组的总高度
                const baseValues = stackBaseValues.get(positionInfo.groupIndex);
                const totalValue = baseValues[i];
                const totalHeight = Math.abs((totalValue / (actualMaxY - barMinY || 1)) * chartHeight);
                
                // 确定堆叠组的起始Y坐标
                const stackStartY = grid.value.top + chartHeight - ((totalValue - barMinY) / (actualMaxY - barMinY || 1)) * chartHeight;
                
                ctx.value.setLineWidth(stackBorderWidth);
                ctx.value.setStrokeStyle(stackBorderColor);
                ctx.value.strokeRect(
                  point.x, 
                  stackStartY, 
                  point.barWidth, 
                  totalHeight
                );
              }
            }
          });
        });
      }
    }
  });
};

const shouldShowTooltipContent = (option) => {
  const tooltip = option?.tooltip || {};
  return tooltip.show !== false && tooltip.showContent !== false;
};

const shouldShowAxisPointer = (option) => {
  const axisPointer = option?.tooltip?.axisPointer || {};
  return axisPointer.show !== false;
};

const measureTextWidth = (text, fontSize = 12) => {
  if (!ctx.value || typeof ctx.value.measureText !== 'function') {
    return String(text).length * fontSize * 0.6;
  }
  ctx.value.setFontSize(fontSize);
  return ctx.value.measureText(String(text)).width || (String(text).length * fontSize * 0.6);
};

const formatNumber = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(digits);
};

const isInPlot = (x, y) => {
  const g = plotGrid.value;
  return !!g && x >= g.left && x <= g.left + g.width && y >= g.top && y <= g.top + g.height;
};

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

const hitBar = (x, y) => {
  for (let s = seriesData.value.length - 1; s >= 0; s--) {
    const series = seriesData.value[s];
    const points = series.points || [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
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
  if (!seriesData.value.length) return null;
  const direct = hitBar(touchX, touchY);
  let dataIndex = direct ? direct.dataIndex : -1;
  if (dataIndex < 0) {
    if (!isInPlot(touchX, touchY)) return null;
    dataIndex = findCategoryIndexByX(touchX);
  }
  if (dataIndex < 0) return null;

  const seriesValues = [];
  let primary = null;
  seriesData.value.forEach((series) => {
    const point = series.points?.[dataIndex];
    if (!point) return;
    const centerX = point.x + (point.barWidth || 20) / 2;
    const item = {
      seriesName: series.name,
      value: point.value,
      color: point.color || series.color,
      x: centerX,
      y: point.y,
      name: point.name,
      dataIndex,
      barWidth: point.barWidth || 20,
      zeroY: point.zeroY
    };
    seriesValues.push({
      seriesName: item.seriesName,
      value: item.value,
      color: item.color
    });
    if (!primary) primary = item;
    if (direct && series === direct.series) {
      primary = item;
    }
  });
  if (!primary) return null;
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
    event: {
      offsetX: primary.x,
      offsetY: primary.y
    }
  };
};

const getBarTooltipLines = (pointer) => {
  const lines = [
    { text: String(pointer.name ?? ''), color: '#f8fafc', fontSize: 12 }
  ];
  (pointer.seriesValues || []).forEach((item) => {
    lines.push({
      text: `${item.seriesName} ${formatNumber(item.value)}`,
      color: item.color || '#e2e8f0',
      fontSize: 11
    });
  });
  return formatTooltipLines(currentOption.value, pointer, lines, 'bar', true);
};

const drawBarAxisPointer = () => {
  if (!activePointer.value || !ctx.value || !plotGrid.value) return;
  if (!shouldShowAxisPointer(currentOption.value)) return;

  const axisPointer = currentOption.value?.tooltip?.axisPointer || {};
  const lineColor = axisPointer.lineStyle?.color || 'rgba(71, 85, 105, 0.75)';
  const lineWidth = axisPointer.lineStyle?.width || 1;
  const g = plotGrid.value;
  const x = activePointer.value.x;

  ctx.value.beginPath();
  ctx.value.setStrokeStyle(lineColor);
  ctx.value.setLineWidth(lineWidth);
  ctx.value.moveTo(x, g.top);
  ctx.value.lineTo(x, g.top + g.height);
  ctx.value.stroke();

  if (axisPointer.type === 'cross' || axisPointer.type === undefined) {
    const y = activePointer.value.y;
    ctx.value.beginPath();
    ctx.value.setStrokeStyle(lineColor);
    ctx.value.setLineWidth(lineWidth);
    ctx.value.moveTo(g.left, y);
    ctx.value.lineTo(g.left + g.width, y);
    ctx.value.stroke();
  }

  // 强调当前分类下的柱顶
  seriesData.value.forEach((series) => {
    const point = series.points?.[activePointer.value.dataIndex];
    if (!point) return;
    const centerX = point.x + (point.barWidth || 20) / 2;
    ctx.value.beginPath();
    ctx.value.setFillStyle('#ffffff');
    ctx.value.arc(centerX, point.y, 5, 0, Math.PI * 2);
    ctx.value.fill();
    ctx.value.beginPath();
    ctx.value.setFillStyle(point.color || series.color || '#5470c6');
    ctx.value.arc(centerX, point.y, 3.5, 0, Math.PI * 2);
    ctx.value.fill();
  });
};

const drawBarTooltipBox = () => {
  if (!activePointer.value || !ctx.value) return;
  if (!shouldShowTooltipContent(currentOption.value)) return;

  const pointer = activePointer.value;
  const lines = getBarTooltipLines(pointer);
  const paddingX = 10;
  const paddingY = 8;
  const lineGap = 6;
  let boxWidth = 0;
  let boxHeight = paddingY * 2 - lineGap;
  lines.forEach((line) => {
    boxWidth = Math.max(boxWidth, measureTextWidth(line.text, line.fontSize || 11));
    boxHeight += (line.fontSize || 11) + lineGap;
  });
  boxWidth += paddingX * 2;

  let boxX = (pointer.x || 0) + 12;
  if (boxX + boxWidth > canvasWidth.value - 8) {
    boxX = (pointer.x || 0) - boxWidth - 12;
  }
  boxX = Math.max(8, boxX);
  let boxY = Math.max(8, (pointer.y || 0) - boxHeight - 12);
  if (boxY + boxHeight > canvasHeight.value - 8) {
    boxY = Math.max(8, canvasHeight.value - boxHeight - 8);
  }

  const tooltip = currentOption.value?.tooltip || {};
  ctx.value.setFillStyle(tooltip.backgroundColor || 'rgba(15, 23, 42, 0.88)');
  ctx.value.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.value.setStrokeStyle(tooltip.borderColor || 'rgba(148, 163, 184, 0.5)');
  ctx.value.setLineWidth(tooltip.borderWidth || 1);
  ctx.value.strokeRect(boxX, boxY, boxWidth, boxHeight);

  let currentY = boxY + paddingY;
  lines.forEach((line) => {
    ctx.value.setFontSize(line.fontSize || 11);
    ctx.value.setFillStyle(line.color || tooltip.textStyle?.color || '#e2e8f0');
    ctx.value.setTextAlign('left');
    ctx.value.setTextBaseline('top');
    ctx.value.fillText(line.text, boxX + paddingX, currentY);
    currentY += (line.fontSize || 11) + lineGap;
  });
};

const updateActivePointer = (touchX, touchY, emitTooltip = true) => {
  if (!seriesData.value.length) {
    activePointer.value = null;
    return null;
  }
  // 直接命中柱体时允许；否则仅在 plot 内按分类回退
  const pointer = buildBarPointerPayload(touchX, touchY);
  if (!pointer) {
    if (!isInPlot(touchX, touchY)) {
      return activePointer.value;
    }
    return activePointer.value;
  }
  touchInfo.value.lastX = touchX;
  touchInfo.value.lastY = touchY;
  activePointer.value = pointer;
  if (emitTooltip) {
    emitChartEvent('tooltipShow', pointer);
  }
  drawChart(currentOption.value || props.option);
  return pointer;
};

/**
 * 处理触摸开始事件
 * @param {Object} e - 事件对象
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const handleTouchStart = (e) => {
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  touchInfo.value.startX = touch.x || 0;
  touchInfo.value.startY = touch.y || 0;
  touchInfo.value.lastX = touchInfo.value.startX;
  touchInfo.value.lastY = touchInfo.value.startY;
  updateActivePointer(touchInfo.value.startX, touchInfo.value.startY, true);
};

/**
 * 处理触摸移动事件
 * @param {Object} e - 事件对象
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const handleTouchMove = (e) => {
  e.preventDefault && e.preventDefault();
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  updateActivePointer(touch.x || 0, touch.y || 0, true);
};

/**
 * 处理触摸结束事件
 * @param {Object} e - 事件对象
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const handleTouchEnd = (e) => {
  const touch = e.changedTouches && e.changedTouches[0];
  if (!touch) return;
  const endX = touch.x || 0;
  const endY = touch.y || 0;
  const pointer = updateActivePointer(endX, endY, true) || activePointer.value;
  const moved =
    Math.abs(endX - touchInfo.value.startX) > TAP_SLOP ||
    Math.abs(endY - touchInfo.value.startY) > TAP_SLOP;
  if (!moved && pointer) {
    emitChartEvent('click', pointer);
  }
};

/**
 * 设置图表选项（类似 ECharts 的 setOption 方法）
 * @param {Object} option - 图表配置项
 * @param {Boolean} notMerge - 是否不合并配置
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const setOption = (option, notMerge = false) => {
  if (disposed.value) return false;
  if (notMerge === true) {
    highlightState.value = {};
    selectState.value = {};
  }
  const nextOption = mergeOptions(currentOption.value || props.option, option, notMerge);
  drawChart(nextOption);
  return true;
};

const appendData = (payload = {}) => {
  if (disposed.value) return false;
  const result = appendSeriesData(currentOption.value || props.option, payload);
  if (!result.changed) return false;
  drawChart(result.option);
  return true;
};

/**
 * 重置图表大小（类似 ECharts 的 resize 方法）
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const resize = () => {
  if (disposed.value) return false;
  initCanvas();
  return true;
};

const getOption = () => currentOption.value;
const getWidth = () => canvasWidth.value || 0;
const getHeight = () => canvasHeight.value || 0;

const clear = () => {
  activePointer.value = null;
  seriesData.value = [];
  categoryCenters.value = [];
  highlightState.value = {};
  selectState.value = {};
  if (ctx.value) {
    ctx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
    ctx.value.draw && ctx.value.draw();
  }
  return true;
};

const dispose = () => {
  if (disposed.value) return true;
  disposed.value = true;
  eventRegistry.clear();
  clear();
  return true;
};

const showLoading = (textOrOptions = 'Loading...') => {
  if (disposed.value || !ctx.value) return false;
  loading.value = true;
  const text = typeof textOrOptions === 'string' ? textOrOptions : (textOrOptions.text || 'Loading...');
  ctx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  ctx.value.setFillStyle('rgba(255,255,255,0.86)');
  ctx.value.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
  ctx.value.setFillStyle('#64748b');
  ctx.value.setFontSize && ctx.value.setFontSize(14);
  ctx.value.setTextAlign && ctx.value.setTextAlign('center');
  ctx.value.setTextBaseline && ctx.value.setTextBaseline('middle');
  ctx.value.fillText(text, canvasWidth.value / 2, canvasHeight.value / 2);
  ctx.value.draw && ctx.value.draw();
  return true;
};

const hideLoading = () => {
  if (disposed.value) return false;
  loading.value = false;
  drawChart(currentOption.value || props.option);
  return true;
};

const on = (eventName, handler) => eventRegistry.on(eventName, handler);
const off = (eventName, handler) => eventRegistry.off(eventName, handler);

const updateActivePointerByDataIndex = (dataIndex, seriesIndex = 0) => {
  const index = Number(dataIndex);
  if (!Number.isInteger(index) || index < 0 || index >= categoryCenters.value.length) return false;
  const series = seriesData.value[seriesIndex] || seriesData.value[0];
  const point = series?.points?.[index];
  const x = point ? point.x + (point.barWidth || 20) / 2 : categoryCenters.value[index];
  const y = point?.y || (plotGrid.value ? plotGrid.value.top + plotGrid.value.height / 2 : 0);
  const pointer = buildBarPointerPayload(x, y);
  if (!pointer) return false;
  activePointer.value = pointer;
  emitChartEvent('tooltipShow', pointer);
  drawChart(currentOption.value || props.option);
  return true;
};

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

const dispatchAction = (action = {}) => {
  if (disposed.value || !action || !action.type) return false;
  if (action.type === 'hideTip') {
    activePointer.value = null;
    drawChart(currentOption.value || props.option);
    return true;
  }
  if (action.type === 'showTip') {
    return updateActivePointerByDataIndex(action.dataIndex, action.seriesIndex || 0);
  }
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
  if (['highlight', 'downplay', 'select', 'unselect', 'toggleSelect'].includes(action.type)) {
    return applyItemAction(action);
  }
  return false;
};

/**
 * 计算堆叠数据范围
 * @param {Array} series - 系列数据
 * @returns {Object} 包含 minY 和 maxY 的对象
 * @author jry <ijry@qq.com>
 * @created 2025-07-28
 */
const calculateStackedDataRange = (series) => {
  let minY = 0;
  let maxY = 0;
  
  // 处理堆叠逻辑 - 构建stack映射
  const stackMap = new Map();
  const nonStackedSeries = [];
  
  // 分类堆叠和非堆叠系列
  series.forEach((serie) => {
    if (serie.type !== 'bar') return;
    
    if (serie.stack) {
      if (!stackMap.has(serie.stack)) {
        stackMap.set(serie.stack, []);
      }
      stackMap.get(serie.stack).push(serie);
    } else {
      nonStackedSeries.push(serie);
    }
  });
  
  // 计算非堆叠系列的极值
  nonStackedSeries.forEach((serie) => {
    serie.data.forEach((value) => {
      const actualValue = typeof value === 'object' ? value.value : value;
      minY = Math.min(minY, actualValue);
      maxY = Math.max(maxY, actualValue);
    });
  });
  
  // 计算堆叠系列的极值
  stackMap.forEach((stackSeries) => {
    // 为每个x位置计算堆叠值
    const stackValues = new Map();
    
    stackSeries.forEach((serie) => {
      serie.data.forEach((value, index) => {
        const actualValue = typeof value === 'object' ? value.value : value;
        if (!stackValues.has(index)) {
          stackValues.set(index, 0);
        }
        stackValues.set(index, stackValues.get(index) + actualValue);
      });
    });
    
    // 更新minY和maxY
    stackValues.forEach((value) => {
      minY = Math.min(minY, value);
      maxY = Math.max(maxY, value);
    });
  });
  
  // 确保Y轴范围包含0值
  minY = Math.min(minY, 0);
  maxY = Math.max(maxY, 0);
  
  return { minY, maxY };
};

// 监听option变化
watch(() => props.option, (newOption) => {
  if (!disposed.value) drawChart(newOption);
}, { deep: true });

// 组件挂载后初始化
onMounted(() => {
  nextTick(() => {
    initCanvas();
  });
});

// 导出需要在模板中使用的变量和方法
defineExpose({
  setOption,
  appendData,
  getOption,
  resize,
  clear,
  dispose,
  showLoading,
  hideLoading,
  getWidth,
  getHeight,
  on,
  off,
  dispatchAction
});
</script>

<style scoped>
.ly-charts-bar {
  position: relative;
}

.chart-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
