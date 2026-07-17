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
