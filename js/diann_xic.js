/* Nebula port of 0266_diann-parquet-parser/js/xic.js - scoped for the #diannExplorerTab panel. See AGENTS.md. */
/* XIC utilities — file://-safe classic script, no import/export.
 * Parses DIA-NN .xic.parquet files (columns pr/feature/info/rt/value),
 * matches files to runs, groups traces per precursor, and builds SVG
 * chromatograms. Load via plain <script src> before js/main.js.
 * Depends on globals from js/parser.js (loadHyparquet) and js/quant.js
 * (cleanRunName), and js/charts.js (formatCompact).
 */

var XIC_PALETTE = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#a65628", "#f781bf", "#17becf", "#8c564b", "#2ca02c"
];

function xicFeatureColor(feature, order) {
  if (feature === "ms1") return "#64748b";
  return XIC_PALETTE[order % XIC_PALETTE.length];
}

// Strip folders and .xic.parquet/.parquet suffixes to a sample key.
function xicSampleKey(fileName) {
  const base = String(fileName || "").replace(/\\/g, "/").split("/").pop();
  return base.replace(/\.xic\.parquet$/i, "").replace(/\.parquet$/i, "");
}

// Resolve a File or a lazy FileSystemFileHandle to a File. diannFileOf lives
// inside diann_main.js's diannSetupEventListeners closure and is NOT reachable
// from this file (classic scripts share globals, not nested function scopes),
// so keep a local copy here and never depend on the one in diann_main.js.
async function xicFileOf(f) {
  if (!f) return null;
  if (typeof f.arrayBuffer === 'function' && typeof f.text === 'function' && f.size !== undefined) return f;
  if (typeof f.getFile === 'function') return await f.getFile();
  return null;
}

// A full object parse of a real DIA-NN .xic.parquet (tens of millions of rows)
// needs several GB and OOMs the tab. Refuse above this row count; callers must
// use the indexed reader (xicPrIndexFor / readXicTracesFor) instead.
var XIC_FULL_PARSE_MAX_ROWS = 2000000;

// Bytes for a run's XIC: a supplied buffer (report/HTTP/embedded XIC) when
// present, otherwise the registered File/handle read transiently.
async function xicArrayBufferFor(run) {
  if (diannState.xicBuffers[run]) return diannState.xicBuffers[run];
  const f = await xicFileOf(diannState.xicFiles[run]);
  if (!f) return null;
  return await f.arrayBuffer();
}

// Match an XIC file name to a run. Returns the run or null.
function matchXicFileToRun(fileName, runs) {
  const key = xicSampleKey(fileName);
  for (let i = 0; i < (runs || []).length; i++) {
    if (cleanRunName(runs[i]) === key) return runs[i];
  }
  return null;
}

// Parse an XIC parquet ArrayBuffer into row objects. Only for small files:
// large .xic.parquet inputs are rejected so the tab can't OOM.
async function parseXICBuffer(arrayBuffer, sourceName) {
  const lib = await loadHyparquet();
  let totalRows = null;
  try {
    if (typeof lib.parquetMetadata === 'function') totalRows = Number(lib.parquetMetadata(arrayBuffer).num_rows);
  } catch (_) { /* metadata best-effort */ }
  if (totalRows && totalRows > XIC_FULL_PARSE_MAX_ROWS) {
    throw new Error(`XIC file has ${totalRows.toLocaleString()} rows — too large to parse whole; reading by index instead`);
  }
  const rows = await lib.parquetReadObjects({
    file: arrayBuffer,
    compressors: lib.compressors
  });
  return { sourceName: sourceName || "xic.parquet", rows };
}

// Group cached XIC rows of one precursor into { feature -> sorted [[rt,v]] }.
// The 'index' channel is DIA-NN metadata, not a fragment, and is excluded.
function groupXICTraces(rows, precursorId) {
  const byFeature = new Map();
  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    if (String(r.pr) !== String(precursorId)) continue;
    const f = String(r.feature);
    if (f === 'index') continue;
    if (!byFeature.has(f)) byFeature.set(f, []);
    byFeature.get(f).push([Number(r.rt), Number(r.value)]);
  }
  const traces = [];
  byFeature.forEach((pts, feature) => {
    pts.sort((a, b) => a[0] - b[0]);
    traces.push({ feature, pts: decimateTrace(pts, 250) });
  });
  traces.sort((a, b) => (a.feature === "ms1" ? -1 : b.feature === "ms1" ? 1 : a.feature < b.feature ? -1 : 1));
  return traces;
}

function decimateTrace(pts, maxN) {
  if (pts.length <= maxN) return pts;
  const step = pts.length / maxN;
  const out = [];
  for (let i = 0; i < maxN; i++) out.push(pts[Math.floor(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}

// Indexed XIC reads: 28M-row files OOM on full parse, so index pr ranges once.
function xicProgress(frac, label) {
  try {
    if (typeof setDiannLoadProgress === 'function') setDiannLoadProgress(frac, label);
  } catch (_) {}
}

async function xicPrIndexFor(run) {
  if (diannState.xicIndex[run]) return diannState.xicIndex[run];
  if (!diannState.xicFiles[run] && !diannState.xicBuffers[run]) {
    const seen = diannState.xicSeenKeys || [];
    if (!seen.length) {
      diannState.lastXicNote = 'No .xic.parquet files were loaded — use Open result folder and pick the DIA-NN output folder that contains results_xic';
    } else {
      const want = cleanRunName(run) + '.xic.parquet';
      diannState.lastXicNote = `No XIC file matched this run (expected ${want})`;
    }
    return null;
  }
  let buf = null;
  try {
    buf = await xicArrayBufferFor(run);
    if (!buf) {
      diannState.lastXicNote = 'Lost access to the XIC file — reopen the folder or files';
      return null;
    }
    const lib = await loadHyparquet();
    if (typeof lib.parquetMetadata !== 'function' || typeof lib.parquetRead !== 'function') {
      diannState.lastXicNote = 'XIC reader lacks indexed-read support';
      return null;
    }
    const meta = lib.parquetMetadata(buf);
    const bounds = [];
    let off = 0;
    for (const rg of meta.row_groups) {
      const n = Number(rg.num_rows);
      bounds.push([off, off + n]);
      off += n;
    }
    const ranges = {};
    let curPr = null;
    let curStart = 0;
    const STEP = 10;
    for (let g = 0; g < bounds.length; g += STEP) {
      const rowBase = bounds[g][0];
      const end = Math.min(bounds[Math.min(g + STEP - 1, bounds.length - 1)][1], off);
      let chunk = null;
      await lib.parquetRead({ file: buf, compressors: lib.compressors, rowFormat: 'array',
        columns: ['pr'], rowStart: rowBase, rowEnd: end,
        onComplete(c) { chunk = c; }
      });
      if (chunk) {
        for (let i = 0; i < chunk.length; i++) {
          const pr = String(chunk[i][0]);
          const row = rowBase + i;
          if (pr !== curPr) {
            if (curPr !== null) {
              if (!ranges[curPr]) ranges[curPr] = [];
              ranges[curPr].push([curStart, row]);
            }
            curPr = pr;
            curStart = row;
          }
        }
        chunk = null;
      }
      xicProgress(bounds[g][0] / off, `Indexing XIC (${cleanRunName(run)})...`);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (curPr !== null) {
      if (!ranges[curPr]) ranges[curPr] = [];
      ranges[curPr].push([curStart, off]);
    }
    const idx = { ranges, totalRows: off, precursors: Object.keys(ranges).length };
    diannState.xicIndex[run] = idx;
    diannState.lastXicNote = `Indexed ${idx.precursors.toLocaleString()} precursors`;
    return idx;
  } catch (e) {
    console.error('XIC index failed:', e);
    diannState.lastXicNote = 'XIC index failed: ' + (e && e.message ? e.message : e);
    return null;
  } finally {
    buf = null;
    xicProgress(null);
    try {
      if (typeof hideDiannLoadProgress === 'function') hideDiannLoadProgress();
    } catch (_) {}
  }
}

async function readXicTracesFor(run, precId) {
  const cache = diannState.xicTraceCache;
  const cacheKey = run + '\u0000' + precId;
  if (cache && cache[cacheKey]) return cache[cacheKey];
  const idx = await xicPrIndexFor(run);
  if (!idx) return null;
  const ranges = idx.ranges[String(precId)];
  if (!ranges || !ranges.length) {
    diannState.lastXicNote = `No XIC rows for ${precId} (${idx.precursors.toLocaleString()} precursors indexed)`;
    return [];
  }
  let buf = null;
  try {
    buf = await xicArrayBufferFor(run);
    if (!buf) {
      diannState.lastXicNote = 'No file reference for this run';
      return null;
    }
    const lib = await loadHyparquet();
    const rows = [];
    for (const [s, e] of ranges) {
      await lib.parquetRead({ file: buf, compressors: lib.compressors, rowFormat: 'object',
        rowStart: s, rowEnd: e,
        onComplete(chunk) {
          for (let i = 0; i < chunk.length; i++) rows.push(chunk[i]);
        }
      });
    }
    const traces = groupXICTraces(rows, precId);
    if (cache) {
      const keys = Object.keys(cache);
      if (keys.length >= 400) for (const k of keys) delete cache[k];
      cache[cacheKey] = traces;
    }
    return traces;
  } catch (e) {
    console.error('XIC read failed:', e);
    diannState.lastXicNote = 'XIC read failed: ' + (e && e.message ? e.message : e);
    return null;
  } finally {
    buf = null;
  }
}

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Parse a fragment feature label like 'y6^1' or 'b3^2' into { type, n, charge }.
function parseFragmentFeature(f) {
  const m = /^([by])(\d+)\^(\d+)$/.exec(String(f || ""));
  if (!m) return null;
  return { type: m[1], n: parseInt(m[2], 10), charge: parseInt(m[3], 10) };
}

// Fragmentation map: peptide letters with residue numbers, observed b-ion
// cleavages barred above the sequence and y-ion cleavages below it.
// bMap/yMap map cleavage position -> { charges, max, color }; bar height
// scales with the ion's peak intensity relative to maxI. With showAll,
// unobserved cleavage sites render as faint ticks.
function fragmapSVG(sequence, bMap, yMap, maxI, showAll) {
  const seq = String(sequence || "");
  const L = seq.length;
  if (!L) return "";
  const cw = 22, padX = 30, top = 46, baseline = 64, numY = 80, bot = 98;
  const W = padX * 2 + L * cw, H = 142;
  const X = (i) => padX + i * cw + cw / 2;
  const CX = (n) => padX + n * cw;
  const chg = (arr) => Array.from(new Set(arr)).sort().join(",");
  const barH = (m) => (maxI > 0 ? 5 + Math.round(21 * (m.max / maxI)) : 5);
  let svg = `<svg class="xic-fragmap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`;
  for (let i = 0; i < L; i++) {
    svg += `<text x="${X(i)}" y="${baseline}" text-anchor="middle" class="frag-aa">${escXml(seq[i])}</text>`;
    svg += `<text x="${X(i)}" y="${numY}" text-anchor="middle" class="frag-num">${i + 1}</text>`;
  }
  for (let n = 1; n < L; n++) {
    const b = bMap[n];
    const y = yMap[n];
    if (b || y) {
      svg += `<line x1="${CX(n)}" y1="${top - 30}" x2="${CX(n)}" y2="${bot + 16}" class="frag-guide"/>`;
    }
    if (b) {
      const h = barH(b);
      svg += `<rect x="${CX(n) - 4}" y="${top - h}" width="8" height="${h}" rx="1.5" fill="${b.color}"><title>b${n} (charge ${chg(b.charges)}): peak ${formatCompactTick(b.max)}</title></rect>`;
      svg += `<text x="${CX(n)}" y="${top - h - 5}" text-anchor="middle" class="frag-lab" fill="${b.color}">b${n}</text>`;
    } else if (showAll) {
      svg += `<line x1="${CX(n)}" y1="${top - 30}" x2="${CX(n)}" y2="${top - 6}" class="frag-tick-theo"><title>unobserved cleavage ${n}</title></line>`;
    }
    if (y) {
      const h = barH(y);
      svg += `<rect x="${CX(n) - 4}" y="${bot - 8}" width="8" height="${h}" rx="1.5" fill="${y.color}"><title>y${L - n} (charge ${chg(y.charges)}): peak ${formatCompactTick(y.max)}</title></rect>`;
      svg += `<text x="${CX(n)}" y="${bot + h + 2}" text-anchor="middle" class="frag-lab" fill="${y.color}">y${L - n}</text>`;
    } else if (showAll) {
      svg += `<line x1="${CX(n)}" y1="${bot - 8}" x2="${CX(n)}" y2="${bot + 16}" class="frag-tick-theo"><title>unobserved cleavage ${n}</title></line>`;
    }
  }
  svg += "</svg>";
  return svg;
}

function formatCompactTick(v) {
  if (v == null) return "-";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

// One SVG chromatogram panel for a single run. traces share rt/y scales.
function xicPanelSVG(runLabel, fullRun, traces, rtMin, rtMax, yMax) {
  const W = 300, H = 168, padL = 46, padR = 8, padT = 24, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const X = (rt) => padL + (rtMax > rtMin ? ((rt - rtMin) / (rtMax - rtMin)) * plotW : plotW / 2);
  const Y = (v) => padT + plotH - (yMax > 0 ? (v / yMax) * plotH : 0);
  let svg = `<svg class="xic-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`;
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" class="xic-axis"/>`;
  svg += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" class="xic-axis"/>`;
  svg += `<text x="${padL - 4}" y="${padT + 4}" text-anchor="end" class="xic-tick">${escXml(formatCompact(yMax))}</text>`;
  svg += `<text x="${padL}" y="${H - 6}" text-anchor="start" class="xic-tick">${rtMin.toFixed(2)}</text>`;
  svg += `<text x="${padL + plotW}" y="${H - 6}" text-anchor="end" class="xic-tick">${rtMax.toFixed(2)} min</text>`;
  svg += `<text x="${padL}" y="13" text-anchor="start" class="xic-title">${escXml(runLabel)}</text>`;
  let apex = null;
  traces.forEach((t, idx) => {
    const color = t.color || xicFeatureColor(t.feature, idx);
    const d = t.pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
    svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"><title>${escXml(t.feature)}</title></path>`;
    t.pts.forEach((p) => {
      if (!apex || p[1] > apex[1]) apex = p;
    });
  });
  if (apex) {
    svg += `<circle cx="${X(apex[0]).toFixed(1)}" cy="${Y(apex[1]).toFixed(1)}" r="3" class="xic-apex"><title>apex ${apex[0].toFixed(2)} min: ${formatCompact(apex[1])}</title></circle>`;
  }
  svg += "</svg>";
  return svg;
}
