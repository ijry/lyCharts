<template>
  <view class="ly-charts-scatter" :style="{ width: containerWidth, height: containerHeight }">
    <canvas 
      class="chart-canvas" 
      :id="canvasId" 
      :canvas-id="canvasId"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    ></canvas>
  </view>
</template>

<script>
import chartHelper from '../../libs/util/chartHelper.js';

export default {
  name: 'ly-charts-scatter',
  emits: ['click', 'tooltipShow'],
  props: {
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
  },
  data() {
    return {
      canvasId: 'scatter-chart-' + Date.now(),
      ctx: null,
      canvasWidth: 0,
      canvasHeight: 0,
      grid: { top: 10, right: 20, bottom: 25, left: 50 },
      // 存储系列数据用于事件处理
      seriesData: [],
      activePointer: null,
      plotGrid: null,
      // 触摸相关信息
      touchInfo: {
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0
      },
      TAP_SLOP: 8
    };
  },
  computed: {
    containerHeight() {
      return typeof this.height === 'number' ? this.height + 'px' : this.height;
    },
    containerWidth() {
      return typeof this.width === 'number' ? this.width + 'px' : this.width;
    }
  },
  watch: {
    option: {
      handler(newOption) {
        this.drawChart(newOption);
      },
      deep: true
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.initCanvas();
    });
  },
  methods: {
    initCanvas() {
      try {
        const query = uni.createSelectorQuery().in(this);
        query.select('#' + this.canvasId).boundingClientRect((res) => {
          if (res) {
            this.canvasWidth = res.width;
            this.canvasHeight = res.height;
            
            // 创建canvas上下文
            this.ctx = uni.createCanvasContext(this.canvasId, this);
            if (!this.ctx) {
              console.error('无法获取canvas绘图上下文');
              return;
            }
            
            this.drawChart(this.option);
          } else {
            console.error('无法获取canvas信息');
          }
        }).exec();
      } catch (error) {
        console.error('初始化canvas失败:', error);
      }
    },
    
    drawChart(option) {
      if (!this.ctx || !option) return;
      
      try {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        // 设置背景色
        if (option.backgroundColor) {
          this.ctx.setFillStyle(option.backgroundColor);
          this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        }
        
        // 绘制标题
        let titleHeight = 0;
        if (option.title && option.title.text) {
          titleHeight = chartHelper.drawTitle(this.ctx, option.title, this.canvasWidth);
        }
        
        // 如果有标题，调整网格顶部边距
        if (titleHeight > 0) {
          this.grid.top = Math.max(this.grid.top, titleHeight + 10);
        }
        
        // 提取系列数据
        const series = option.series || [];
        const xAxis = option.xAxis || {};
        const yAxis = option.yAxis || {};
        
        // 处理数据范围
        const { minX, maxX, minY, maxY } = this.calculateScatterDataRange(series);

        // 绘制图例（在网格调整之前）
        let legendHeight = 0;
        if (option.legend && option.legend.data) {
          const legendData = series.map(s => s.name);
          const legendOption = { 
            ...option.legend, 
            data: legendData,
          };
          legendHeight = chartHelper.drawLegend(
            this.ctx, 
            legendOption, 
            this.grid, 
            this.canvasWidth, 
            chartHelper.defaultColors,
            this.canvasHeight,
            titleHeight
          );
        }
        
        // 绘制网格
        if (option.grid !== false) {
          chartHelper.drawGrid(this.ctx, this.grid, this.canvasWidth, this.canvasHeight, 5, minY, maxY, true);
        }
        
        // 绘制坐标轴
        chartHelper.drawAxis(this.ctx, this.grid, this.canvasWidth, this.canvasHeight, 
                            [minX, (minX+maxX)/2, maxX], minY, maxY, xAxis, yAxis, 'scatter');
        
        // 绘制散点
        this.drawScatterSeries(series, minX, maxX, minY, maxY);

        this.plotGrid = {
          left: this.grid.left,
          top: this.grid.top,
          width: this.canvasWidth - this.grid.left - this.grid.right,
          height: this.canvasHeight - this.grid.top - this.grid.bottom
        };
        if (this.activePointer) {
          this.drawScatterAxisPointer();
          this.drawScatterTooltipBox();
        }
        
        // 绘制到画布
        this.ctx.draw();
      } catch (error) {
        console.error('绘制图表失败:', error);
      }
    },
    
    /**
     * 计算散点图数据范围
     * @param {Array} series - 系列数据
     * @returns {Object} 包含最小值和最大值的对象
     */
    calculateScatterDataRange(series) {
      let minX = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE;
      let minY = Number.MAX_VALUE;
      let maxY = -Number.MAX_VALUE;
      
      if (!series || !Array.isArray(series)) {
        return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
      }
      
      let hasData = false;
      
      series.forEach(serie => {
        if (serie && serie.type === 'scatter' && serie.data && Array.isArray(serie.data)) {
          serie.data.forEach(point => {
            if (Array.isArray(point) && point.length >= 2) {
              const x = point[0];
              const y = point[1];
              
              if (typeof x === 'number' && !isNaN(x) && 
                  typeof y === 'number' && !isNaN(y)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                hasData = true;
              }
            }
          });
        }
      });
      
      // 如果没有有效数据，设置默认值
      if (!hasData) {
        return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
      }
      
      // 添加边距
      const xRange = maxX - minX;
      const yRange = maxY - minY;
      
      if (xRange === 0) {
        minX -= 1;
        maxX += 1;
      } else {
        const padding = xRange * 0.1;
        minX -= padding;
        maxX += padding;
      }
      
      if (yRange === 0) {
        minY -= 1;
        maxY += 1;
      } else {
        const padding = yRange * 0.1;
        minY -= padding;
        maxY += padding;
      }
      
      return { minX, maxX, minY, maxY };
    },
    
    drawScatterSeries(series, minX, maxX, minY, maxY) {
      if (!series || series.length === 0) return;
      
      const chartWidth = this.canvasWidth - this.grid.left - this.grid.right;
      const chartHeight = this.canvasHeight - this.grid.top - this.grid.bottom;
      
      this.seriesData = []; // 重置系列数据
      
      series.forEach((serie, index) => {
        if (serie.type !== 'scatter') return;
        
        const color = serie.color || serie.itemStyle?.color || chartHelper.getColor(index);
        const symbolSize = serie.symbolSize || 10;
        
        // 转换数据点为坐标
        const points = [];
        if (serie.data && Array.isArray(serie.data)) {
          serie.data.forEach((value, i) => {
            if (Array.isArray(value) && value.length >= 2) {
              const xValue = value[0];
              const yValue = value[1];
              
              // 确保不会除以零
              const x = this.grid.left + ((xValue - minX) / (maxX - minX || 1)) * chartWidth;
              const y = this.grid.top + chartHeight - ((yValue - minY) / (maxY - minY || 1)) * chartHeight;
              
              points.push({ 
                x, 
                y, 
                value: [xValue, yValue],
                name: value[2] || `(${xValue}, ${yValue})`,
                seriesName: serie.name || `Series ${index}`
              });
            }
          });
        }
        
        // 保存系列数据用于事件处理
        this.seriesData.push({
          name: serie.name || `Series ${index}`,
          points,
          color
        });
        
        // 绘制散点
        if (points.length > 0) {
          this.ctx.setFillStyle(color);
          points.forEach(point => {
            this.drawSymbol(point.x, point.y, symbolSize, serie.symbol || 'circle');
          });
        }
      });
    },
    
    /**
     * 绘制散点符号
     * @param {Number} x - X坐标
     * @param {Number} y - Y坐标
     * @param {Number} size - 符号大小
     * @param {String} symbol - 符号类型
     */
    drawSymbol(x, y, size, symbol) {
      this.ctx.beginPath();
      
      switch (symbol) {
        case 'circle':
        default:
          this.ctx.arc(x, y, size/2, 0, 2 * Math.PI);
          break;
        case 'rect':
          this.ctx.rect(x - size/2, y - size/2, size, size);
          break;
        case 'triangle':
          const height = size * Math.sqrt(3) / 2;
          this.ctx.moveTo(x, y - height/2);
          this.ctx.lineTo(x - size/2, y + height/2);
          this.ctx.lineTo(x + size/2, y + height/2);
          this.ctx.closePath();
          break;
        case 'diamond':
          this.ctx.moveTo(x, y - size/2);
          this.ctx.lineTo(x - size/2, y);
          this.ctx.lineTo(x, y + size/2);
          this.ctx.lineTo(x + size/2, y);
          this.ctx.closePath();
          break;
      }
      
      this.ctx.fill();
    },
    
    // 触摸事件处理
    shouldShowTooltipContent(option) {
      const tooltip = option?.tooltip || {};
      return tooltip.show !== false && tooltip.showContent !== false;
    },
    shouldShowAxisPointer(option) {
      const axisPointer = option?.tooltip?.axisPointer || {};
      return axisPointer.show !== false;
    },
    measureTextWidth(text, fontSize = 12) {
      if (!this.ctx || typeof this.ctx.measureText !== 'function') {
        return String(text).length * fontSize * 0.6;
      }
      this.ctx.setFontSize(fontSize);
      return this.ctx.measureText(String(text)).width || (String(text).length * fontSize * 0.6);
    },
    formatNumber(value, digits = 2) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '--';
      return n.toFixed(digits);
    },
    formatScatterValue(value) {
      if (Array.isArray(value)) {
        return value.map(v => this.formatNumber(v)).join(', ');
      }
      return this.formatNumber(value);
    },
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
    },
    getScatterTooltipLines(pointer) {
      return [
        { text: String(pointer.name ?? ''), color: '#f8fafc', fontSize: 12 },
        { text: `${pointer.seriesName || ''} ${this.formatScatterValue(pointer.value)}`, color: pointer.color || '#e2e8f0', fontSize: 11 }
      ];
    },
    drawScatterAxisPointer() {
      if (!this.activePointer || !this.ctx || !this.plotGrid) return;
      if (!this.shouldShowAxisPointer(this.option)) return;
      const axisPointer = this.option?.tooltip?.axisPointer || {};
      const lineColor = axisPointer.lineStyle?.color || 'rgba(71, 85, 105, 0.75)';
      const lineWidth = axisPointer.lineStyle?.width || 1;
      const g = this.plotGrid;
      const x = this.activePointer.x;
      const y = this.activePointer.y;
      this.ctx.beginPath();
      this.ctx.setStrokeStyle(lineColor);
      this.ctx.setLineWidth(lineWidth);
      this.ctx.moveTo(x, g.top);
      this.ctx.lineTo(x, g.top + g.height);
      this.ctx.stroke();
      if (axisPointer.type === 'cross' || axisPointer.type === undefined) {
        this.ctx.beginPath();
        this.ctx.setStrokeStyle(lineColor);
        this.ctx.setLineWidth(lineWidth);
        this.ctx.moveTo(g.left, y);
        this.ctx.lineTo(g.left + g.width, y);
        this.ctx.stroke();
      }
      this.ctx.beginPath();
      this.ctx.setFillStyle('#ffffff');
      this.ctx.arc(x, y, 6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.setFillStyle(this.activePointer.color || '#5470c6');
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx.fill();
    },
    drawScatterTooltipBox() {
      if (!this.activePointer || !this.ctx) return;
      if (!this.shouldShowTooltipContent(this.option)) return;
      const pointer = this.activePointer;
      const lines = this.getScatterTooltipLines(pointer);
      const paddingX = 10;
      const paddingY = 8;
      const lineGap = 6;
      let boxWidth = 0;
      let boxHeight = paddingY * 2 - lineGap;
      lines.forEach((line) => {
        boxWidth = Math.max(boxWidth, this.measureTextWidth(line.text, line.fontSize || 11));
        boxHeight += (line.fontSize || 11) + lineGap;
      });
      boxWidth += paddingX * 2;
      let boxX = (pointer.x || 0) + 12;
      if (boxX + boxWidth > this.canvasWidth - 8) {
        boxX = (pointer.x || 0) - boxWidth - 12;
      }
      boxX = Math.max(8, boxX);
      let boxY = Math.max(8, (pointer.y || 0) - boxHeight - 12);
      if (boxY + boxHeight > this.canvasHeight - 8) {
        boxY = Math.max(8, this.canvasHeight - boxHeight - 8);
      }
      const tooltip = this.option?.tooltip || {};
      this.ctx.setFillStyle(tooltip.backgroundColor || 'rgba(15, 23, 42, 0.88)');
      this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      this.ctx.setStrokeStyle(tooltip.borderColor || 'rgba(148, 163, 184, 0.5)');
      this.ctx.setLineWidth(tooltip.borderWidth || 1);
      this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      let currentY = boxY + paddingY;
      lines.forEach((line) => {
        this.ctx.setFontSize(line.fontSize || 11);
        this.ctx.setFillStyle(line.color || tooltip.textStyle?.color || '#e2e8f0');
        this.ctx.setTextAlign('left');
        this.ctx.setTextBaseline('top');
        this.ctx.fillText(line.text, boxX + paddingX, currentY);
        currentY += (line.fontSize || 11) + lineGap;
      });
    },
    updateActivePointer(touchX, touchY, emitTooltip = true) {
      if (!this.seriesData || !this.seriesData.length) {
        this.activePointer = null;
        return null;
      }
      const pointer = this.findNearestScatterPoint(touchX, touchY, 20);
      if (!pointer) {
        // keep previous pointer when outside snap radius
        return this.activePointer;
      }
      this.touchInfo.lastX = touchX;
      this.touchInfo.lastY = touchY;
      this.activePointer = pointer;
      if (emitTooltip) {
        this.$emit('tooltipShow', pointer);
      }
      this.drawChart(this.option);
      return pointer;
    },
    handleTouchStart(e) {
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      this.touchInfo.startX = touch.x || 0;
      this.touchInfo.startY = touch.y || 0;
      this.touchInfo.lastX = this.touchInfo.startX;
      this.touchInfo.lastY = this.touchInfo.startY;
      this.updateActivePointer(this.touchInfo.startX, this.touchInfo.startY, true);
    },
    handleTouchMove(e) {
      e.preventDefault && e.preventDefault();
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      this.updateActivePointer(touch.x || 0, touch.y || 0, true);
    },
    handleTouchEnd(e) {
      const touch = e.changedTouches && e.changedTouches[0];
      if (!touch) return;
      const endX = touch.x || 0;
      const endY = touch.y || 0;
      const pointer = this.updateActivePointer(endX, endY, true) || this.activePointer;
      const moved =
        Math.abs(endX - this.touchInfo.startX) > this.TAP_SLOP ||
        Math.abs(endY - this.touchInfo.startY) > this.TAP_SLOP;
      if (!moved && pointer) {
        this.$emit('click', pointer);
      }
    },
    setOption(option, notMerge = false) {
      if (notMerge) {
        this.drawChart(option);
      } else {
        // 简单合并配置
        try {
          const newOption = JSON.parse(JSON.stringify(this.option));
          Object.assign(newOption, option);
          this.drawChart(newOption);
        } catch (error) {
          console.error('合并配置失败:', error);
          this.drawChart(option);
        }
      }
    },
    
    // 提供类似 ECharts 的 resize 方法
    resize() {
      this.initCanvas();
    }
  }
};
</script>

<style scoped>
.u-charts-scatter {
  position: relative;
}

.chart-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
