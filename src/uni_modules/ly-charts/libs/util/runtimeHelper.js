function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
}

function toRows(source) {
  if (!Array.isArray(source) || source.length === 0) {
    return { rows: [], dimensions: [] };
  }
  if (Array.isArray(source[0])) {
    return {
      rows: source.slice(1),
      dimensions: source[0].map((item, index) => (item != null ? String(item) : String(index)))
    };
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
    normalized.data = rows.map(row => [
      readValue(row, dimensions, xKey),
      readValue(row, dimensions, valueKey)
    ]);
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
  normalized.series = normalized.series.map((seriesItem = {}) => {
    const nextSeries = normalizeSeriesData(seriesItem, rows, dimensions);
    const xKey = firstEncodeValue(seriesItem.encode, ['x', 'itemName', 'name']);
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

  const zoomList = Array.isArray(option?.dataZoom)
    ? option.dataZoom
    : (option?.dataZoom ? [option.dataZoom] : []);
  const zoom = zoomList.find(item => (
    item &&
    (item.start != null || item.end != null || item.startValue != null || item.endValue != null)
  ));
  if (!zoom) return { startIndex: 0, endIndex: length - 1, changed: false };

  let startIndex = zoom.startValue != null
    ? Number(zoom.startValue)
    : Math.floor((Number(zoom.start ?? 0) / 100) * (length - 1));
  let endIndex = zoom.endValue != null
    ? Number(zoom.endValue)
    : Math.ceil((Number(zoom.end ?? 100) / 100) * (length - 1));

  if (!Number.isFinite(startIndex)) startIndex = 0;
  if (!Number.isFinite(endIndex)) endIndex = length - 1;

  startIndex = Math.max(0, Math.min(length - 1, Math.floor(startIndex)));
  endIndex = Math.max(0, Math.min(length - 1, Math.ceil(endIndex)));
  if (endIndex < startIndex) {
    [startIndex, endIndex] = [endIndex, startIndex];
  }

  return {
    startIndex,
    endIndex,
    changed: startIndex > 0 || endIndex < length - 1
  };
}

export function applyAxisDataWindow(option) {
  const nextOption = clone(option || {});
  const series = Array.isArray(nextOption.series) ? nextOption.series : [];
  const xAxisLength = Array.isArray(nextOption.xAxis?.data) ? nextOption.xAxis.data.length : 0;
  const seriesLength = series.reduce((max, item) => {
    return Math.max(max, Array.isArray(item?.data) ? item.data.length : 0);
  }, 0);
  const window = resolveDataZoomWindow(nextOption, Math.max(xAxisLength, seriesLength));
  if (!window.changed) return { option: nextOption, ...window };

  const end = window.endIndex + 1;
  if (Array.isArray(nextOption.xAxis?.data)) {
    nextOption.xAxis = {
      ...nextOption.xAxis,
      data: nextOption.xAxis.data.slice(window.startIndex, end)
    };
  }
  nextOption.series = series.map((seriesItem) => {
    if (!Array.isArray(seriesItem?.data)) return seriesItem;
    return {
      ...seriesItem,
      data: seriesItem.data.slice(window.startIndex, end)
    };
  });

  return { option: nextOption, ...window };
}

export function toggleLegendSelected(option, name) {
  if (!name) return { option, changed: false };

  const nextOption = clone(option || {});
  const series = Array.isArray(nextOption.series) ? nextOption.series : [];
  const exists = series.some((item, index) => getSeriesName(item, index) === String(name));
  if (!exists) return { option, changed: false };

  const legend = nextOption.legend && typeof nextOption.legend === 'object'
    ? { ...nextOption.legend }
    : {};
  const selected = legend.selected && typeof legend.selected === 'object'
    ? { ...legend.selected }
    : {};
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
    if (key === 'c' || key === 'value') {
      return Array.isArray(params.value) ? params.value.join(', ') : (params.value ?? '');
    }
    if (key === 'd') return params.percent ?? '';
    return '';
  });
}

function splitTooltipText(text, color = '#e2e8f0') {
  return String(text).split(/\r?\n/).map(line => ({
    text: line,
    color,
    fontSize: 11
  }));
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
  if (!Array.isArray(nextOption.series) || !nextOption.series[seriesIndex]) {
    return { option, changed: false };
  }

  const incoming = Array.isArray(payload.data) ? payload.data : [payload.data];
  if (incoming.length === 0) return { option, changed: false };

  const seriesItem = { ...nextOption.series[seriesIndex] };
  const currentData = Array.isArray(seriesItem.data) ? seriesItem.data.slice() : [];
  seriesItem.data = currentData.concat(incoming);
  nextOption.series = nextOption.series.slice();
  nextOption.series[seriesIndex] = seriesItem;
  return { option: nextOption, changed: true };
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeCoordPair(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length < 2) return null;
    const x = toFiniteNumber(value[0]);
    const y = toFiniteNumber(value[1]);
    if (x == null || y == null) return null;
    return [x, y];
  }
  if (typeof value === 'object') {
    const x = toFiniteNumber(value.x ?? value[0]);
    const y = toFiniteNumber(value.y ?? value[1]);
    if (x == null || y == null) return null;
    return [x, y];
  }
  return null;
}

export function isSupportedCartesianFinder(finder) {
  if (finder == null || finder === false) return true;
  if (typeof finder !== 'object') return false;
  const axisKeys = ['xAxisIndex', 'yAxisIndex', 'gridIndex'];
  for (const key of axisKeys) {
    if (Object.prototype.hasOwnProperty.call(finder, key)) {
      const index = Number(finder[key]);
      if (!Number.isInteger(index) || index !== 0) return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(finder, 'seriesIndex')) {
    const seriesIndex = Number(finder.seriesIndex);
    if (!Number.isInteger(seriesIndex) || seriesIndex < 0) return false;
  }
  return true;
}

export function getSeriesIndexFromFinder(finder) {
  if (finder == null || typeof finder !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(finder, 'seriesIndex')) return null;
  const seriesIndex = Number(finder.seriesIndex);
  if (!Number.isInteger(seriesIndex) || seriesIndex < 0) return null;
  return seriesIndex;
}

export function createCartesianCoordSys(input = {}) {
  const grid = input.grid;
  if (!grid) return null;
  const left = toFiniteNumber(grid.left);
  const top = toFiniteNumber(grid.top);
  const width = toFiniteNumber(grid.width);
  const height = toFiniteNumber(grid.height);
  const minY = toFiniteNumber(input.minY);
  const maxY = toFiniteNumber(input.maxY);
  if (
    left == null || top == null || width == null || height == null ||
    minY == null || maxY == null || width <= 0 || height <= 0
  ) {
    return null;
  }

  const chartType = input.chartType || 'line';
  const categoryCenters = Array.isArray(input.categoryCenters)
    ? input.categoryCenters.map(item => toFiniteNumber(item)).filter(item => item != null)
    : [];
  const minX = toFiniteNumber(input.minX);
  const maxX = toFiniteNumber(input.maxX);

  if (chartType === 'scatter') {
    if (minX == null || maxX == null || maxX === minX || maxY === minY) return null;
  } else if (!categoryCenters.length || maxY === minY) {
    return null;
  }

  return {
    type: 'cartesian2d',
    chartType,
    grid: { left, top, width, height },
    categoryCenters,
    minX,
    maxX,
    minY,
    maxY
  };
}

function mapCategoryIndexToPixelX(categoryCenters, dataX) {
  if (!Array.isArray(categoryCenters) || categoryCenters.length === 0) return null;
  if (categoryCenters.length === 1) return categoryCenters[0];
  const maxIndex = categoryCenters.length - 1;
  const clamped = Math.min(Math.max(dataX, 0), maxIndex);
  const leftIndex = Math.floor(clamped);
  const rightIndex = Math.min(leftIndex + 1, maxIndex);
  if (leftIndex === rightIndex) return categoryCenters[leftIndex];
  const ratio = clamped - leftIndex;
  return categoryCenters[leftIndex] + (categoryCenters[rightIndex] - categoryCenters[leftIndex]) * ratio;
}

function mapPixelXToCategoryIndex(categoryCenters, pixelX) {
  if (!Array.isArray(categoryCenters) || categoryCenters.length === 0) return null;
  if (categoryCenters.length === 1) return 0;
  if (pixelX <= categoryCenters[0]) return 0;
  const last = categoryCenters.length - 1;
  if (pixelX >= categoryCenters[last]) return last;
  for (let i = 0; i < last; i++) {
    const left = categoryCenters[i];
    const right = categoryCenters[i + 1];
    if (pixelX >= left && pixelX <= right) {
      if (right === left) return i;
      return i + (pixelX - left) / (right - left);
    }
  }
  return last;
}

function mapValueToPixelY(grid, minY, maxY, value) {
  const ratio = (value - minY) / (maxY - minY);
  return grid.top + grid.height - ratio * grid.height;
}

function mapPixelYToValue(grid, minY, maxY, pixelY) {
  const ratio = (grid.top + grid.height - pixelY) / grid.height;
  return minY + ratio * (maxY - minY);
}

export function convertCartesianToPixel(coordSys, value) {
  if (!coordSys || coordSys.type !== 'cartesian2d') return null;
  const pair = normalizeCoordPair(value);
  if (!pair) return null;
  const [dataX, dataY] = pair;
  const grid = coordSys.grid;
  let pixelX = null;
  if (coordSys.chartType === 'scatter') {
    if (coordSys.maxX === coordSys.minX) return null;
    const ratioX = (dataX - coordSys.minX) / (coordSys.maxX - coordSys.minX);
    pixelX = grid.left + ratioX * grid.width;
  } else {
    pixelX = mapCategoryIndexToPixelX(coordSys.categoryCenters, dataX);
  }
  if (pixelX == null || coordSys.maxY === coordSys.minY) return null;
  const pixelY = mapValueToPixelY(grid, coordSys.minY, coordSys.maxY, dataY);
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) return null;
  return [pixelX, pixelY];
}

export function convertCartesianFromPixel(coordSys, value) {
  if (!coordSys || coordSys.type !== 'cartesian2d') return null;
  const pair = normalizeCoordPair(value);
  if (!pair) return null;
  const [pixelX, pixelY] = pair;
  const grid = coordSys.grid;
  let dataX = null;
  if (coordSys.chartType === 'scatter') {
    if (coordSys.maxX === coordSys.minX || grid.width === 0) return null;
    dataX = coordSys.minX + ((pixelX - grid.left) / grid.width) * (coordSys.maxX - coordSys.minX);
  } else {
    dataX = mapPixelXToCategoryIndex(coordSys.categoryCenters, pixelX);
  }
  if (dataX == null || coordSys.maxY === coordSys.minY || grid.height === 0) return null;
  const dataY = mapPixelYToValue(grid, coordSys.minY, coordSys.maxY, pixelY);
  if (!Number.isFinite(dataX) || !Number.isFinite(dataY)) return null;
  return [dataX, dataY];
}

function pointInRect(x, y, rect) {
  return x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height;
}

function isNearSeriesPoint(chartType, point, pixelX, pixelY) {
  if (!point) return false;
  if (chartType === 'bar' && point.barWidth != null) {
    const width = Number(point.barWidth) || 0;
    const height = Math.abs(Number(point.height != null ? point.height : point.barHeight) || 0);
    const top = Number(point.y) || 0;
    const left = Number(point.x) || 0;
    const bottom = point.height != null ? top + (Number(point.height) || 0) : top + height;
    const minY = Math.min(top, bottom);
    const maxY = Math.max(top, bottom);
    return pixelX >= left && pixelX <= left + width && pixelY >= minY && pixelY <= maxY;
  }
  const radius = chartType === 'scatter'
    ? Math.max(Number(point.symbolSize) || 0, 8)
    : 10;
  const dx = (Number(point.x) || 0) - pixelX;
  const dy = (Number(point.y) || 0) - pixelY;
  return (dx * dx + dy * dy) <= radius * radius;
}

export function containCartesianPixel(coordSys, seriesData, finder, value) {
  if (!coordSys || coordSys.type !== 'cartesian2d') return false;
  if (!isSupportedCartesianFinder(finder)) return false;
  const pair = normalizeCoordPair(value);
  if (!pair) return false;
  const [pixelX, pixelY] = pair;
  if (!pointInRect(pixelX, pixelY, coordSys.grid)) return false;

  const seriesIndex = getSeriesIndexFromFinder(finder);
  if (seriesIndex == null) return true;
  if (!Array.isArray(seriesData) || !seriesData[seriesIndex]) return false;
  const series = seriesData[seriesIndex];
  const points = Array.isArray(series.points) ? series.points : [];
  for (let i = 0; i < points.length; i++) {
    if (isNearSeriesPoint(coordSys.chartType, points[i], pixelX, pixelY)) return true;
  }
  return false;
}
