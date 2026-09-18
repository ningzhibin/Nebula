/* Nebula port of 0266_diann-parquet-parser/js/parser.js - scoped for the #diannExplorerTab panel. See AGENTS.md. */
/* DIA-NN Parquet parser — file://-safe classic script (converted from src/parser.js).
 * hyparquet is ESM-only (no UMD build), so it is lazy-loaded via dynamic
 * import(), preferring the vendored sources embedded by build_sources.js
 * (imported through blob: URLs, which need no network), with the pinned
 * jsDelivr +esm bundles as fallback. There are intentionally NO static
 * import/export statements in this file or any other js/*.js file, since
 * those are blocked by CORS on file:// double-click.
 */

var HYPARQUET_FZSTD_SPEC = '/npm/fzstd@0.1.1/+esm';
var HYPARQUET_HYSNAPPY_SPEC = '/npm/hysnappy@1.0.0/+esm';

// Pinned CDN endpoints (verified: both resolve to bundled ESM via Rollup).
var HYPARQUET_URL = 'https://cdn.jsdelivr.net/npm/hyparquet@1.30.0/+esm';
var HYPARQUET_COMPRESSORS_URL = 'https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.1/+esm';

var __hyparquetCache = null;

function blobModuleUrl(src) {
  return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
}

// Loads hyparquet + compressors once, then reuses the cached module handles.
async function loadHyparquet() {
  if (__hyparquetCache) return __hyparquetCache;
  var embeddedError = null;
  if (typeof APP_VENDOR !== 'undefined' && APP_VENDOR && APP_VENDOR.hyparquet && APP_VENDOR.compressors) {
    try {
      const hp = await import(blobModuleUrl(APP_VENDOR.hyparquet));
      let hpcSrc = APP_VENDOR.compressors;
      if (APP_VENDOR.fzstd) {
        hpcSrc = hpcSrc.split(HYPARQUET_FZSTD_SPEC).join(blobModuleUrl(APP_VENDOR.fzstd));
      }
      if (APP_VENDOR.hysnappy) {
        hpcSrc = hpcSrc.split(HYPARQUET_HYSNAPPY_SPEC).join(blobModuleUrl(APP_VENDOR.hysnappy));
      }
      const hc = await import(blobModuleUrl(hpcSrc));
      if (typeof hp.parquetReadObjects !== 'function') throw new Error('embedded hyparquet missing parquetReadObjects');
      __hyparquetCache = {
        parquetReadObjects: hp.parquetReadObjects,
        parquetRead: hp.parquetRead,
        parquetMetadata: hp.parquetMetadata,
        compressors: hc.compressors || (hc.default && hc.default.compressors) || hc.default || {}
      };
      return __hyparquetCache;
    } catch (err) {
      embeddedError = err;
      console.warn('Embedded hyparquet failed, falling back to CDN:', err.message);
    }
  }
  var hp, hc;
  try {
    hp = await import(HYPARQUET_URL);
  } catch (err) {
    throw new Error('Could not load hyparquet from CDN (' + HYPARQUET_URL + '). Check internet access. ' + (embeddedError ? 'Embedded error: ' + embeddedError.message + '. ' : '') + err.message);
  }
  try {
    hc = await import(HYPARQUET_COMPRESSORS_URL);
  } catch (err) {
    throw new Error('Could not load hyparquet-compressors from CDN (' + HYPARQUET_COMPRESSORS_URL + '). Check internet access. ' + err.message);
  }
  if (typeof hp.parquetReadObjects !== 'function') {
    throw new Error('hyparquet CDN module did not export parquetReadObjects.');
  }
  __hyparquetCache = {
    parquetReadObjects: hp.parquetReadObjects,
    parquetRead: hp.parquetRead,
    parquetMetadata: hp.parquetMetadata,
    compressors: hc.compressors || (hc.default && hc.default.compressors) || hc.default || {}
  };
  return __hyparquetCache;
}

/**
 * Converts a base64 string to an ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  var binaryString = atob(base64);
  var len = binaryString.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Normalizes parquet row object:
 * Converts BigInt fields to standard Numbers for clean serialization & math
 */
function normalizeRow(row) {
  var norm = {};
  var keys = Object.keys(row);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var val = row[key];
    if (typeof val === 'bigint') {
      norm[key] = Number(val);
    } else {
      norm[key] = val;
    }
  }
  return norm;
}

/**
 * Extracts distinct sample run names from parsed rows
 */
function extractRuns(rows) {
  var runSet = new Set();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Run) runSet.add(rows[i].Run);
  }
  return Array.from(runSet).sort();
}

/**
 * Columns the explorer actually reads (see row['...'] uses in diann_main.js
 * and diann_quant.js). Real result files carry ~70 columns; parsing only
 * these keeps an 832k-row file from OOMing the tab. Files matching fewer
 * than 5 fall back to a full read.
 */
var DIANN_KEEP_COLUMNS = [
  'Protein.Group', 'Protein.Ids', 'Protein.Names', 'Genes',
  'First.Protein.Description', 'Stripped.Sequence', 'Modified.Sequence',
  'Precursor.Charge', 'Precursor.Id', 'Precursor.Mz', 'Q.Value',
  'Global.Q.Value', 'PG.Q.Value', 'Proteotypic', 'RT', 'Run', 'PG.MaxLFQ',
  'Precursor.Normalised', 'Precursor.Quantity'
];

/**
 * Loads parquet from an ArrayBuffer
 */
async function parseParquetBuffer(arrayBuffer, sourceName) {
  sourceName = sourceName || 'custom.parquet';
  var lib = await loadHyparquet();
  var startTime = performance.now();
  var readOpts = { file: arrayBuffer, compressors: lib.compressors };
  try {
    if (typeof lib.parquetMetadata === 'function') {
      var have = {};
      lib.parquetMetadata(arrayBuffer).schema.forEach(function (s) { have[s.name] = true; });
      var cols = DIANN_KEEP_COLUMNS.filter(function (c) { return have[c]; });
      if (cols.length >= 5) readOpts.columns = cols;
    }
  } catch (_) {}
  var rawRows = await lib.parquetReadObjects(readOpts);

  // Normalize in place: a .map copy doubles peak memory on 100MB+ files.
  for (var n = 0; n < rawRows.length; n++) {
    var row = rawRows[n];
    for (var key in row) {
      if (typeof row[key] === 'bigint') row[key] = Number(row[key]);
    }
  }
  var normalizedRows = rawRows;
  var runs = extractRuns(normalizedRows);
  var durationMs = Math.round(performance.now() - startTime);

  return {
    sourceName: sourceName,
    rows: normalizedRows,
    runs: runs,
    totalRows: normalizedRows.length,
    durationMs: durationMs
  };
}

/**
 * Attempts to automatically load default data:
 * 1. Uses embedded base64 data from js/defaultData.js (no fetch needed)
 * 2. Falls back to HTTP fetch of data/results.parquet when served over http(s)
 * NOTE: hyparquet itself still loads from CDN, so step 1 also needs internet
 * on first parse. Keep diann_viewer_standalone.html for fully offline use.
 */
async function loadDefaultParquet() {
  if (typeof EXPORT_PAYLOAD !== 'undefined' && EXPORT_PAYLOAD) {
    if (EXPORT_PAYLOAD.rows && EXPORT_PAYLOAD.rows.length) {
      const rows = EXPORT_PAYLOAD.rows;
      return {
        sourceName: EXPORT_PAYLOAD.parquetName || 'results.parquet',
        rows,
        runs: extractRuns(rows),
        totalRows: rows.length,
        durationMs: 0
      };
    }
    if (EXPORT_PAYLOAD.parquetB64) {
      try {
        const buffer = base64ToArrayBuffer(EXPORT_PAYLOAD.parquetB64);
        return await parseParquetBuffer(buffer, EXPORT_PAYLOAD.parquetName || 'results.parquet');
      } catch (err) {
        console.warn('Failed to parse report payload parquet:', err);
      }
    }
  }
  if (typeof DEFAULT_PARQUET_BASE64 !== 'undefined' && DEFAULT_PARQUET_BASE64) {
    try {
      var buffer = base64ToArrayBuffer(DEFAULT_PARQUET_BASE64);
      return await parseParquetBuffer(buffer, (typeof DEFAULT_FILE_NAME !== 'undefined' && DEFAULT_FILE_NAME) || 'results.parquet');
    } catch (err) {
      console.warn('Failed to parse embedded default parquet data:', err);
    }
  }

  var candidates = [
    '/data/results.parquet',
    'data/results.parquet',
    './data/results.parquet'
  ];

  for (var i = 0; i < candidates.length; i++) {
    try {
      var response = await fetch(candidates[i]);
      if (!response.ok) continue;
      var buf = await response.arrayBuffer();
      if (buf && buf.byteLength > 100) {
        return await parseParquetBuffer(buf, 'results.parquet');
      }
    } catch (e) {
      console.warn('Failed to fetch from ' + candidates[i] + ':', e);
    }
  }

  throw new Error('Default file data/results.parquet could not be loaded.');
}
