<template>
  <view class="ly-charts-radar">
    <canvas 
      :id="cid" 
      :canvas-id="cid" 
      :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    ></canvas>
  </view>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, getCurrentInstance } from 'vue';
import { normalizeOption, mergeOptions, createEventRegistry } from '../../libs/util/runtimeHelper.js';

const instance = getCurrentInstance();

// #ifdef APP-NVUE
const dom = weex.requireModule('dom');
// #endif

// 引入chartHelper
import chartHelper from '../../libs/util/chartHelper.js';

// 定义组件属性
const props = defineProps({
  // ECharts标准配置接口
  option: {
    type: Object,
    required: true,
    default: () => ({})
  },
  // 图表宽度
  width: {
    type: [String, Number],
    default: '100%'
  },
  // 图表高度
  height: {
    type: [String, Number],
    default: 300
  },
  // 主题配置
  theme: {
    type: Object,
    default: () => ({})
  },
  // 图表实例ID（多图表场景）
  chartId: {
    type: String,
    default: 'radarChart'
  }
});

// 定义事件
const emit = defineEmits(['click', 'tooltipShow']);

// 生成唯一ID
const cid = 'u-charts-radar-' + Math.random().toString(36).substr(2);

// 响应式数据
const canvasWidth = ref(typeof props.width === 'string' && props.width.indexOf('%') !== -1 ? 
  null : 
  (typeof props.width === 'number' ? props.width : parseUnit(props.width)));
const canvasHeight = ref(typeof props.height === 'string' ? parseUnit(props.height) : props.height);
const isMount = ref(false);
const chartInstance = ref(null);
const activePointer = ref(null);
const currentOption = ref({});
const disposed = ref(false);
const loading = ref(false);
const eventRegistry = createEventRegistry();
const touchInfo = ref({
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0
});
const TAP_SLOP = 8;

// 解析单位的辅助函数，支持rpx、px和数字
const parseUnit = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    if (value.endsWith('rpx')) {
      return uni.upx2px(parseInt(value));
    } else if (value.endsWith('px')) {
      return parseInt(value);
    } else if (value.endsWith('%')) {
      return value; // 百分比保持原样
    } else {
      return parseInt(value) || 0;
    }
  }
  
  return 0;
};

// 获取画布尺寸
const getCanvasSize = () => {
  return new Promise((resolve) => {
    // 添加对canvasWidth是否已经为数字的判断
    if (typeof canvasWidth.value === 'number' && canvasWidth.value > 0) {
      resolve();
      return;
    }
    
    // 修复：在 setup 上下文中使用正确的 selector 查询方式
    const query = uni.createSelectorQuery().in(instance);
    query.select('#' + cid)
      .boundingClientRect((res) => {
        if (res) {
          canvasWidth.value = res.width || props.width;
          canvasHeight.value = res.height || props.height;
        } else {
          // 改进宽度计算逻辑，支持rpx单位
          canvasWidth.value = typeof props.width === 'string' && props.width.indexOf('%') !== -1 ? 
            (uni.upx2px(750) * parseInt(props.width) / 100) : 
            parseUnit(props.width);
          canvasHeight.value = parseUnit(props.height);
        }
        resolve();
      })
      .exec();
  });
};

// 绘制图表
const drawChart = (option = props.option) => {
  if (disposed.value) return;
  currentOption.value = normalizeOption(option || {});
  if (!currentOption.value || !Object.keys(currentOption.value).length) return;
  
  // 使用原生Canvas绘制雷达图
  drawNativeRadar();
};

// 使用原生Canvas绘制雷达图
const drawNativeRadar = () => {
  // #ifndef APP-NVUE
  // 修复：在 setup 上下文中正确创建 canvas context
  const ctx = uni.createCanvasContext(cid, instance);
  
  // 清空画布
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  
  // 获取雷达图配置
  const radar = currentOption.value.radar || {};
  const series = currentOption.value.series || []; // 支持多个系列
  // 兼容只传一个系列的情况
  const processedSeries = series.map(s => {
    if (Array.isArray(s)) {
      return { data: s };
    }
    return s;
  });
  
  if (!radar.indicator || !radar.indicator.length || !processedSeries.length) return;
  
  // 绘制标题
  let chartTop = 0;
  let titleHeight = 0;
  if (currentOption.value.title && currentOption.value.title.show !== false) {
    titleHeight = drawChartTitle(ctx);
    chartTop += titleHeight;
  }
  
  // 绘制图例
  let legendHeight = 0;
  let legendWidth = 0;
  let chartLeft = 0;
  let chartRight = 0;
  let bottomHeight = 0;
  if (currentOption.value.legend && currentOption.value.legend.show !== false) {
    const legendInfo = drawChartLegend(ctx, chartTop, titleHeight);
    legendHeight = legendInfo.height;
    legendWidth = legendInfo.width;
    chartLeft = legendInfo.left;
    chartRight = legendInfo.right;
    
    // 如果图例在顶部或底部，需要调整图表顶部位置
    if (currentOption.value.legend.top != undefined) {
       chartTop += legendHeight;
    } else {
        // 如果图表在底部
        bottomHeight = legendHeight - chartTop / 2;
    }
  }
  
  const indicators = radar.indicator;
  const numIndicators = indicators.length;
  
  // 计算中心点和半径（考虑标题高度和图例位置）
  const centerX = (chartLeft + (canvasWidth.value - chartRight - chartLeft) / 2);
  const centerY = chartTop + (canvasHeight.value - chartTop - bottomHeight) / 2;
  const maxRadius = Math.min(canvasWidth.value - chartLeft - chartRight, canvasHeight.value - chartTop - bottomHeight ) * 0.37;
  
  // 绘制雷达网格
  drawRadarGrid(ctx, centerX, centerY, maxRadius, indicators);
  
  // 绘制数据
  const seriesPoints = drawRadarData(ctx, centerX, centerY, maxRadius, indicators, processedSeries);
  
  // 绘制指示器标签
  drawRadarLabels(ctx, centerX, centerY, maxRadius, indicators);

  // 保存图表实例信息
  chartInstance.value = {
    type: 'native-radar',
    data: processedSeries,
    indicators: indicators,
    centerX: centerX,
    centerY: centerY,
    radius: maxRadius,
    seriesPoints,
    destroy: () => {} // 空销毁函数
  };

  if (activePointer.value) {
    drawRadarAxisPointer(ctx);
    drawRadarTooltipBox(ctx);
  }
  
  ctx.draw(false);
  // #endif
};

// 绘制图表标题
const drawChartTitle = (ctx) => {
  const title = currentOption.value.title;
  if (!title || title.show === false) return 0;
  
  let titleHeight = 0;
  
  // 设置主标题样式
  if (title.text) {
    const titleFontSize = title.textStyle?.fontSize || 18;
    ctx.setFontSize(titleFontSize);
    ctx.setFillStyle(title.textStyle?.color || '#333');
    ctx.setTextAlign('center');
    ctx.setTextBaseline('top');
    
    // 绘制主标题
    const titleY = 10;
    ctx.fillText(title.text, canvasWidth.value / 2, titleY);
    titleHeight += titleFontSize + 10;
  }
  
  // 设置副标题样式
  if (title.subtext) {
    const subtitleFontSize = title.subtextStyle?.fontSize || 14;
    ctx.setFontSize(subtitleFontSize);
    ctx.setFillStyle(title.subtextStyle?.color || '#666');
    ctx.setTextAlign('center');
    ctx.setTextBaseline('top');
    
    // 绘制副标题
    const subtitleY = titleHeight + 5;
    ctx.fillText(title.subtext, canvasWidth.value / 2, subtitleY);
    titleHeight += subtitleFontSize + 10;
  }
  
  // 添加额外的底部边距，避免标题遮挡雷达图标签
  titleHeight += 6;
  
  return titleHeight;
};

// 绘制图例
const drawChartLegend = (ctx, top, titleHeight = 0) => {
  const legend = currentOption.value.legend || {};
  if (legend.show === false) return { height: 0, width: 0, left: 0, right: 0 };

  // 优先使用chartHelper中的drawLegend方法
  try {
    // 准备legend数据
    const series = currentOption.value.series || [];
    const processedSeries = series.map(s => {
      if (Array.isArray(s)) {
        return { data: s };
      }
      return s;
    });

    // 构造legend数据格式
    const legendData = processedSeries.map((s, index) => {
      return s.name || `series${index}`;
    });

    // 构造legendOption对象
    const legendOption = {
      ...legend,
      data: legendData
    };

    // 使用chartHelper中的drawLegend方法
    console.log(legend.left)
    const grid = {
      top: top,
      left: legend.left === 'center' ? 0 : (legend.left !== undefined ? legend.left : (canvasWidth.value - canvasHeight.value + titleHeight) / 2), // 默认值为(图表宽度-图表高度+标题高度)/2
      right: legend.left === 'center' ? 0 : (legend.right !== undefined ? legend.right : (canvasWidth.value - canvasHeight.value + titleHeight) / 2), // 默认值为(图表宽度-图表高度+标题高度)/2
      bottom: 0
    };
    console.log(grid)

    // 保存原始grid值
    const originalGrid = {...grid};

    // 调用chartHelper的drawLegend方法
    const legendHeight = chartHelper.drawLegend(
      ctx, 
      legendOption, 
      grid, 
      canvasWidth.value, 
      chartHelper.defaultColors,
      canvasHeight.value,
      top // titleHeight
    );

    // 计算图例宽度（简化处理）
    let legendWidth = 0;
    if (legendData.length > 0) {
      ctx.setFontSize(12);
      legendData.forEach(name => {
        const metrics = ctx.measureText(name);
        legendWidth = Math.max(legendWidth, metrics.width);
      });
      legendWidth += 30; // 符号宽度和间距
    }

    // 返回图例信息，用于调整图表绘制区域
    return {
      height: legendHeight,
      width: legendWidth,
      left: grid.left !== originalGrid.left ? grid.left : 0,
      right: grid.right !== originalGrid.right ? grid.right : 0
    };
  } catch (e) {
    console.warn('Failed to use chartHelper.drawLegend, using fallback implementation', e);
  }
};

// 绘制雷达网格
const drawRadarGrid = (ctx, centerX, centerY, maxRadius, indicators) => {
  const numIndicators = indicators.length;
  // 修改: 支持splitNumber配置项，默认为5
  const radar = currentOption.value.radar || {};
  const levels = radar.splitNumber || 5;
  // 修改: 支持shape配置项，默认为polygon(多边形)
  const shape = radar.shape || 'polygon';

  ctx.setStrokeStyle('#E0E6F1');
  ctx.setLineWidth(1);

  // 获取splitArea配置
  const splitArea = radar.splitArea || {};
  const areaStyle = splitArea.areaStyle || {};
  const colors = areaStyle.color || ['rgba(250,250,250,0.2)', 'rgba(210,219,238,0.2)'];

  // 计算内外半径
  let innerRadius = 0;
  let outerRadius = maxRadius;
  
  // 支持 ECharts 的 radius 配置，格式可以是 number, string 或 [inner, outer] 数组
  if (radar.radius !== undefined) {
    if (Array.isArray(radar.radius)) {
      // 处理 [innerRadius, outerRadius] 格式
      const inner = radar.radius[0];
      const outer = radar.radius[1];
      
      // 处理百分比字符串
      if (typeof inner === 'string' && inner.endsWith('%')) {
        innerRadius = (parseInt(inner) / 100) * maxRadius;
      } else if (typeof inner === 'number') {
        innerRadius = inner;
      }
      
      if (typeof outer === 'string' && outer.endsWith('%')) {
        outerRadius = (parseInt(outer) / 100) * maxRadius;
      } else if (typeof outer === 'number') {
        outerRadius = outer;
      }
    } else {
      // 处理单个值，只设置 outerRadius
      if (typeof radar.radius === 'string' && radar.radius.endsWith('%')) {
        outerRadius = (parseInt(radar.radius) / 100) * maxRadius;
      } else if (typeof radar.radius === 'number') {
        outerRadius = radar.radius;
      }
    }
  }

  // 绘制同心多边形背景色（如果配置了splitArea）
  if (splitArea) {
    for (let level = 1; level <= levels; level++) {
      const levelRatio = level / levels;
      const currentInnerRadius = innerRadius + (outerRadius - innerRadius) * ((level - 1) / levels);
      const currentOuterRadius = innerRadius + (outerRadius - innerRadius) * levelRatio;

      // 根据shape决定绘制方式
      if (shape === 'circle') {
        // 绘制圆形
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentOuterRadius, 0, 2 * Math.PI);
        ctx.arc(centerX, centerY, currentInnerRadius, 0, 2 * Math.PI, true);
        ctx.closePath();
      } else {
        // 绘制多边形（默认）
        ctx.beginPath();

        // 绘制外多边形
        let firstPoint;
        for (let i = 0; i <= numIndicators; i++) {
          const angle = (i * 2 * Math.PI / numIndicators) - Math.PI / 2;
          const x = centerX + currentOuterRadius * Math.cos(angle);
          const y = centerY + currentOuterRadius * Math.sin(angle);

          if (i === 0) {
            firstPoint = { x, y };
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // 绘制内多边形（反向）
        for (let i = numIndicators; i >= 0; i--) {
          const angle = (i * 2 * Math.PI / numIndicators) - Math.PI / 2;
          const x = centerX + currentInnerRadius * Math.cos(angle);
          const y = centerY + currentInnerRadius * Math.sin(angle);
          ctx.lineTo(x, y);
        }

        ctx.closePath();
      }

      // 填充颜色
      const colorIndex = (level - 1) % colors.length;
      ctx.setFillStyle(colors[colorIndex]);
      ctx.fill();
    }
  }

  // 绘制同心图形边框
  for (let level = 1; level <= levels; level++) {
    const levelRatio = level / levels;
    const radius = innerRadius + (outerRadius - innerRadius) * levelRatio;
    
    if (shape === 'circle') {
      // 绘制圆形
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      // 绘制多边形（默认）
      ctx.beginPath();

      for (let i = 0; i < numIndicators; i++) {
        const angle = (i * 2 * Math.PI / numIndicators) - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();
      ctx.stroke();
    }
  }

  // 绘制从中心到各顶点的直线（仅在polygon模式下绘制）
  if (shape !== 'circle') {
    for (let i = 0; i < numIndicators; i++) {
      const angle = (i * 2 * Math.PI / numIndicators) - Math.PI / 2;
      const x = centerX + outerRadius * Math.cos(angle);
      const y = centerY + outerRadius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
};

// 绘制雷达图数据
const drawRadarData = (ctx, centerX, centerY, maxRadius, indicators, data) => {
  const numIndicators = indicators.length;
  const seriesPoints = [];
  
  // 默认颜色列表
  const defaultColors = currentOption.value.color || [
    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'
  ];
  
  // 获取雷达图配置中的 radius 设置
  const radar = currentOption.value.radar || {};
  let innerRadius = 0;
  let outerRadius = maxRadius;
  
  // 支持 ECharts 的 radius 配置
  if (radar.radius !== undefined) {
    if (Array.isArray(radar.radius)) {
      const inner = radar.radius[0];
      const outer = radar.radius[1];
      
      if (typeof inner === 'string' && inner.endsWith('%')) {
        innerRadius = (parseInt(inner) / 100) * maxRadius;
      } else if (typeof inner === 'number') {
        innerRadius = inner;
      }
      
      if (typeof outer === 'string' && outer.endsWith('%')) {
        outerRadius = (parseInt(outer) / 100) * maxRadius;
      } else if (typeof outer === 'number') {
        outerRadius = outer;
      }
    } else {
      if (typeof radar.radius === 'string' && radar.radius.endsWith('%')) {
        outerRadius = (parseInt(radar.radius) / 100) * maxRadius;
      } else if (typeof radar.radius === 'number') {
        outerRadius = radar.radius;
      }
    }
  }
  
  // 处理多个数据系列
  for (let s = 0; s < data.length; s++) {
    const seriesItem = data[s];
    // 支持多种数据格式
    let values;
    if (Array.isArray(seriesItem)) {
      values = seriesItem;
    } else if (Array.isArray(seriesItem.data)) {
      values = seriesItem.data;
    } else if (Array.isArray(seriesItem.value)) {
      values = seriesItem.value;
    } else {
      continue; // 跳过无效数据
    }
    
    const color = seriesItem.color || seriesItem.itemStyle?.color || defaultColors[s % defaultColors.length];
    
    if (!values || values.length !== numIndicators) continue;
    
    // 计算数据点位置
    let points = [];
    const structuredPoints = [];
    for (let i = 0; i < numIndicators; i++) {
      const indicator = indicators[i];
      const maxValue = indicator.max || 100;
      const value = Array.isArray(values[i]) ? values[i][0] : values[i]; // 兼容多维数组
      const ratio = Math.min((value || 0) / maxValue, 1); // 限制最大值
      // 使用 radius 配置计算实际半径
      const radius = innerRadius + ratio * (outerRadius - innerRadius);
      const angle = (i * 2 * Math.PI / numIndicators) - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      points.push({ x, y });
      structuredPoints.push({
        indicatorIndex: i,
        name: indicator.name,
        value,
        x,
        y
      });
    }
    seriesPoints.push({
      seriesIndex: s,
      seriesName: seriesItem.name || `Series ${s}`,
      color,
      points: structuredPoints
    });
    
    // 绘制数据区域填充（可选，根据areaStyle决定是否需要）
    // 修改: 添加对areaStyle的支持，符合ECharts接口
    if (points.length > 0 && (seriesItem.areaStyle !== undefined)) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(points[0].x, points[0].y); // 闭合路径
      ctx.closePath();
      
      // 设置填充样式，支持areaStyle配置
      let fillColor = color;
      if (seriesItem.areaStyle && seriesItem.areaStyle.color) {
        fillColor = seriesItem.areaStyle.color;
      } else {
        // 如果没有指定areaStyle.color，则使用系列颜色并添加默认透明度
        // 优化透明度处理逻辑
        const addAlphaToColor = (baseColor, alpha = 0.5) => {
          // 如果已经是rgba格式，修改alpha值
          if (baseColor.startsWith('rgba(')) {
            return baseColor.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
          } 
          // 如果是rgb格式，转换为rgba
          else if (baseColor.startsWith('rgb(')) {
            return baseColor.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
          } 
          // 如果是十六进制格式，转换为rgba
          else if (baseColor.startsWith('#')) {
            let hex = baseColor.replace('#', '');
            // 处理3位十六进制
            if (hex.length === 3) {
              hex = hex.split('').map(c => c + c).join('');
            }
            // 转换为rgba
            if (hex.length === 6) {
              const r = parseInt(hex.substring(0, 2), 16);
              const g = parseInt(hex.substring(2, 4), 16);
              const b = parseInt(hex.substring(4, 6), 16);
              return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
          }
          // 其他情况返回带透明度的默认颜色
          return `rgba(84, 112, 198, ${alpha})`;
        };
        
        fillColor = addAlphaToColor(color);
      }
      
      ctx.setFillStyle(fillColor);
      ctx.fill();
    }
    
    // 绘制数据连线
    if (points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      // 闭合路径
      ctx.lineTo(points[0].x, points[0].y);
      ctx.closePath(); // 添加闭合路径
      ctx.setStrokeStyle(color);
      ctx.setLineWidth(2);
      ctx.stroke();
    }
    
    // 绘制数据点
    for (let i = 0; i < points.length; i++) {
      ctx.beginPath(); // 为每个点创建新路径
      ctx.arc(points[i].x, points[i].y, 4, 0, 2 * Math.PI);
      ctx.setFillStyle('#ffffff');
      ctx.setStrokeStyle(color);
      ctx.setLineWidth(2);
      ctx.fill();
      ctx.stroke();
    }
    
    // 绘制标签 - 根据series.label配置决定是否显示
    if (seriesItem.label && seriesItem.label.show) {
      const labelFontSize = seriesItem.label.fontSize || 12;
      const labelColor = seriesItem.label.color || '#666666';
      const labelPosition = seriesItem.label.position || 'top';
      
      ctx.setFontSize(labelFontSize);
      ctx.setFillStyle(labelColor);
      ctx.setTextAlign('center');
      
      for (let i = 0; i < points.length; i++) {
        const indicator = indicators[i];
        const maxValue = indicator.max || 100;
        const value = Array.isArray(values[i]) ? values[i][0] : values[i]; // 兼容多维数组
        const ratio = Math.min((value || 0) / maxValue, 1); // 限制最大值
        // 使用 radius 配置计算实际半径
        const radius = innerRadius + ratio * (outerRadius - innerRadius);
        const angle = (i * 2 * Math.PI / numIndicators) - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        // 根据标签位置调整标签的绘制位置
        let labelX = x;
        let labelY = y;
        let textAlign = 'center';
        let textBaseline = 'middle';
        
        switch(labelPosition) {
          case 'top':
            labelY = y - 5;
            textBaseline = 'bottom';
            break;
          case 'bottom':
            labelY = y + 8;
            textBaseline = 'top';
            break;
          case 'inside':
            labelY = y - 5;
            textBaseline = 'bottom';
            break;
          case 'insideTop':
            labelY = y - 5;
            textBaseline = 'bottom';
            break;
          case 'insideBottom':
            labelY = y + 5;
            textBaseline = 'top';
            break;
          default:
            labelY = y - 10;
            textBaseline = 'bottom';
        }
        
        ctx.setTextAlign(textAlign);
        ctx.setTextBaseline(textBaseline);
        
        // 绘制标签值
        ctx.fillText(value.toString(), labelX, labelY);
      }
    }
  }
  return seriesPoints;
};

// 绘制雷达图标签
const drawRadarLabels = (ctx, centerX, centerY, maxRadius, indicators) => {
  const numIndicators = indicators.length;
  
  // 获取雷达图配置中的 radius 设置
  const radar = currentOption.value.radar || {};
  let outerRadius = maxRadius;
  
  // 支持 ECharts 的 radius 配置
  if (radar.radius !== undefined) {
    if (Array.isArray(radar.radius)) {
      const outer = radar.radius[1];
      if (typeof outer === 'string' && outer.endsWith('%')) {
        outerRadius = (parseInt(outer) / 100) * maxRadius;
      } else if (typeof outer === 'number') {
        outerRadius = outer;
      }
    } else {
      if (typeof radar.radius === 'string' && radar.radius.endsWith('%')) {
        outerRadius = (parseInt(radar.radius) / 100) * maxRadius;
      } else if (typeof radar.radius === 'number') {
        outerRadius = radar.radius;
      }
    }
  }
  
  ctx.setFontSize(12);
  ctx.setFillStyle('#666666');
  ctx.setTextAlign('center');
  ctx.setTextBaseline('middle');
  
  for (let i = 0; i < numIndicators; i++) {
    const indicator = indicators[i];
    const angle = (i * 2 * Math.PI / numIndicators) - Math.PI / 2;
    // 计算标签位置，使其与网格保持适当距离
    const labelRadius = outerRadius + 14; // 增加标签与网格的距离
    const x = centerX + labelRadius * Math.cos(angle);
    const y = centerY + labelRadius * Math.sin(angle);
    
    // 根据角度调整文本对齐方式，避免标签重叠
    const angleDeg = ((angle + Math.PI / 2) * 180 / Math.PI + 360) % 360;
    
    if (angleDeg > 330 || angleDeg < 30) {
      // 右侧标签
      ctx.setTextAlign('left');
      ctx.setTextBaseline('middle');
    } else if (angleDeg >= 30 && angleDeg < 60) {
      // 右下标签
      ctx.setTextAlign('left');
      ctx.setTextBaseline('top');
    } else if (angleDeg >= 60 && angleDeg < 120) {
      // 下方标签
      ctx.setTextAlign('center');
      ctx.setTextBaseline('top');
    } else if (angleDeg >= 120 && angleDeg < 150) {
      // 左下标签
      ctx.setTextAlign('right');
      ctx.setTextBaseline('top');
    } else if (angleDeg >= 150 && angleDeg < 210) {
      // 左侧标签
      ctx.setTextAlign('right');
      ctx.setTextBaseline('middle');
    } else if (angleDeg >= 210 && angleDeg < 240) {
      // 左上标签
      ctx.setTextAlign('right');
      ctx.setTextBaseline('bottom');
    } else if (angleDeg >= 240 && angleDeg < 300) {
      // 上方标签
      ctx.setTextAlign('center');
      ctx.setTextBaseline('bottom');
    } else if (angleDeg >= 300 && angleDeg <= 330) {
      // 右上标签
      ctx.setTextAlign('left');
      ctx.setTextBaseline('bottom');
    }
    
    ctx.fillText(indicator.name, x, y);
  }
};

const shouldShowTooltipContent = (option) => {
  const tooltip = option?.tooltip || {};
  return tooltip.show !== false && tooltip.showContent !== false;
};

const shouldShowAxisPointer = (option) => {
  const axisPointer = option?.tooltip?.axisPointer || {};
  return axisPointer.show !== false;
};

const measureTextWidth = (ctx, text, fontSize = 12) => {
  if (!ctx || typeof ctx.measureText !== 'function') {
    return String(text).length * fontSize * 0.6;
  }
  ctx.setFontSize(fontSize);
  return ctx.measureText(String(text)).width || (String(text).length * fontSize * 0.6);
};

const formatNumber = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(digits);
};

const buildRadarPointerPayload = (touchX, touchY) => {
  const chart = chartInstance.value;
  if (!chart || chart.type !== 'native-radar') return null;
  const seriesPoints = chart.seriesPoints || [];
  const indicators = chart.indicators || [];
  if (!seriesPoints.length || !indicators.length) return null;

  const dx = touchX - chart.centerX;
  const dy = touchY - chart.centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > (chart.radius || 0) * 1.15) return null;

  // 1) nearest series vertex within ~24px
  let bestVertex = null;
  let bestVertexDist = Infinity;
  seriesPoints.forEach((series) => {
    (series.points || []).forEach((point) => {
      const dist = Math.sqrt(Math.pow(point.x - touchX, 2) + Math.pow(point.y - touchY, 2));
      if (dist < bestVertexDist && dist <= 24) {
        bestVertexDist = dist;
        bestVertex = {
          series,
          point
        };
      }
    });
  });

  let indicatorIndex = -1;
  let primarySeries = null;
  let primaryPoint = null;
  if (bestVertex) {
    indicatorIndex = bestVertex.point.indicatorIndex;
    primarySeries = bestVertex.series;
    primaryPoint = bestVertex.point;
  } else {
    // 2) nearest indicator by angle inside radius
    let angle = Math.atan2(dy, dx);
    // convert to radar start-at-top coordinate: 0 at top, clockwise with index growth
    let normalized = angle + Math.PI / 2;
    if (normalized < 0) normalized += Math.PI * 2;
    const step = (Math.PI * 2) / indicators.length;
    indicatorIndex = Math.round(normalized / step) % indicators.length;
    // choose closest series value at that indicator as primary
    let minDist = Infinity;
    seriesPoints.forEach((series) => {
      const point = (series.points || [])[indicatorIndex];
      if (!point) return;
      const dist = Math.sqrt(Math.pow(point.x - touchX, 2) + Math.pow(point.y - touchY, 2));
      if (dist < minDist) {
        minDist = dist;
        primarySeries = series;
        primaryPoint = point;
      }
    });
  }

  if (indicatorIndex < 0 || !primarySeries || !primaryPoint) return null;

  const seriesValues = [];
  seriesPoints.forEach((series) => {
    const point = (series.points || [])[indicatorIndex];
    if (!point) return;
    seriesValues.push({
      seriesName: series.seriesName,
      value: point.value,
      color: series.color
    });
  });

  const indicator = indicators[indicatorIndex] || {};
  return {
    componentType: 'series',
    seriesType: 'radar',
    seriesName: primarySeries.seriesName,
    name: indicator.name || primaryPoint.name,
    dataIndex: indicatorIndex,
    indicatorIndex,
    value: primaryPoint.value,
    color: primarySeries.color,
    seriesValues,
    x: primaryPoint.x,
    y: primaryPoint.y,
    centerX: chart.centerX,
    centerY: chart.centerY,
    radius: chart.radius,
    event: {
      offsetX: touchX,
      offsetY: touchY
    }
  };
};

const getRadarTooltipLines = (pointer) => {
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
  return lines;
};

const drawRadarAxisPointer = (ctx) => {
  const pointer = activePointer.value;
  const chart = chartInstance.value;
  if (!pointer || !ctx || !chart) return;
  if (!shouldShowAxisPointer(currentOption.value)) return;

  const axisPointer = currentOption.value?.tooltip?.axisPointer || {};
  const lineColor = axisPointer.lineStyle?.color || 'rgba(71, 85, 105, 0.75)';
  const lineWidth = axisPointer.lineStyle?.width || 1;

  // ray from center through active indicator vertex
  ctx.beginPath();
  ctx.setStrokeStyle(lineColor);
  ctx.setLineWidth(lineWidth);
  ctx.moveTo(chart.centerX, chart.centerY);
  // extend to outer radius along same direction as point
  const dx = pointer.x - chart.centerX;
  const dy = pointer.y - chart.centerY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const endX = chart.centerX + (dx / dist) * chart.radius;
  const endY = chart.centerY + (dy / dist) * chart.radius;
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // emphasize all series points on selected indicator
  (chart.seriesPoints || []).forEach((series) => {
    const point = (series.points || [])[pointer.indicatorIndex];
    if (!point) return;
    ctx.beginPath();
    ctx.setFillStyle('#ffffff');
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.setFillStyle(series.color || '#5470c6');
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
};

const drawRadarTooltipBox = (ctx) => {
  const pointer = activePointer.value;
  if (!pointer || !ctx) return;
  if (!shouldShowTooltipContent(currentOption.value)) return;

  const lines = getRadarTooltipLines(pointer);
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

  const anchorX = pointer.event?.offsetX ?? pointer.x ?? 0;
  const anchorY = pointer.event?.offsetY ?? pointer.y ?? 0;
  let boxX = anchorX + 12;
  if (boxX + boxWidth > canvasWidth.value - 8) {
    boxX = anchorX - boxWidth - 12;
  }
  boxX = Math.max(8, boxX);
  let boxY = Math.max(8, anchorY - boxHeight - 12);
  if (boxY + boxHeight > canvasHeight.value - 8) {
    boxY = Math.max(8, canvasHeight.value - boxHeight - 8);
  }

  const tooltip = currentOption.value?.tooltip || {};
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
};

const updateActivePointer = (touchX, touchY, emitTooltip = true) => {
  const chart = chartInstance.value;
  if (!chart || chart.type !== 'native-radar' || !(chart.seriesPoints || []).length) {
    activePointer.value = null;
    return null;
  }
  const pointer = buildRadarPointerPayload(touchX, touchY);
  if (!pointer) {
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
  if (!moved && pointer) {
    emitChartEvent('click', pointer);
  }
};

const emitChartEvent = (eventName, payload) => {
  emit(eventName, payload);
  eventRegistry.emit(eventName, payload);
};

// 更新数据
const updateData = (data) => {
  if (chartInstance.value) {
    if (chartInstance.value.type === 'native-radar') {
      const series = currentOption.value.series || [];
      const nextSeries = Array.isArray(data) ? [{ ...(series[0] || { type: 'radar' }), data }] : data;
      setOption({ series: nextSeries });
    }
  }
};

// 获取图表实例
const getChartInstance = () => {
  return chartInstance.value;
};

const setOption = (option, notMerge = false) => {
  if (disposed.value) return false;
  const nextOption = mergeOptions(currentOption.value || props.option, option, notMerge);
  drawChart(nextOption);
  return true;
};

const getOption = () => currentOption.value;
const getWidth = () => canvasWidth.value || 0;
const getHeight = () => canvasHeight.value || 0;

const clear = () => {
  activePointer.value = null;
  chartInstance.value = null;
  const ctx = uni.createCanvasContext(cid, instance);
  if (ctx) {
    ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
    ctx.draw && ctx.draw();
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

const resize = () => {
  if (disposed.value) return false;
  init();
  return true;
};

const showLoading = (textOrOptions = 'Loading...') => {
  if (disposed.value) return false;
  loading.value = true;
  const text = typeof textOrOptions === 'string' ? textOrOptions : (textOrOptions.text || 'Loading...');
  const ctx = uni.createCanvasContext(cid, instance);
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  ctx.setFillStyle('rgba(255,255,255,0.86)');
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
  ctx.setFillStyle('#64748b');
  ctx.setFontSize && ctx.setFontSize(14);
  ctx.setTextAlign && ctx.setTextAlign('center');
  ctx.setTextBaseline && ctx.setTextBaseline('middle');
  ctx.fillText(text, canvasWidth.value / 2, canvasHeight.value / 2);
  ctx.draw && ctx.draw();
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

const updateActivePointerByDataIndex = (dataIndex) => {
  const index = Number(dataIndex);
  const chart = chartInstance.value;
  if (!Number.isInteger(index) || !chart || !chart.seriesPoints || index < 0 || index >= (chart.indicators || []).length) return false;
  const point = (chart.seriesPoints[0]?.points || [])[index];
  if (!point) return false;
  const pointer = buildRadarPointerPayload(point.x, point.y);
  if (!pointer) return false;
  activePointer.value = pointer;
  emitChartEvent('tooltipShow', pointer);
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
    return updateActivePointerByDataIndex(action.dataIndex);
  }
  return false;
};

// 监听option变化
watch(
  () => props.option,
  (newVal) => {
    if (isMount.value && !disposed.value) {
      drawChart(newVal);
    }
  },
  { deep: true }
);

// 初始化
const init = () => {
  getCanvasSize().then(() => {
    drawChart();
  });
};

// 初始化nvue
const initNvue = () => {
  dom.getComponentRect(`#${cid}`, (res) => {
    if (res.result) {
      canvasWidth.value = res.size.width;
      canvasHeight.value = res.size.height;
      drawChart();
    }
  });
};

// 组件挂载
onMounted(() => {
  isMount.value = true;
  // #ifndef APP-NVUE
  nextTick(() => {
    init();
  });
  // #endif
  
  // #ifdef APP-NVUE
  initNvue();
  // #endif
});

// 组件卸载
onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.destroy();
  }
});

// 暴露方法给父组件
defineExpose({
  setOption,
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
  dispatchAction,
  updateData,
  getChartInstance
});
</script>

<style scoped>
.ly-charts-radar {
  position: relative;
  width: 100%;
}

.chart-title {
  padding: 10px 0;
}

.main-title {
  display: block;
  font-weight: bold;
  margin-bottom: 5px;
}

.sub-title {
  display: block;
  opacity: 0.8;
}
</style>
