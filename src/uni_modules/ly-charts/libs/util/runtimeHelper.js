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
