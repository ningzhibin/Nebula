/* js/hybrid_downstream.js — Hybrid differential (Wang et al. 2012) integrated as Downstream subtab
 * Adapts hybrid/hybrid-core.js + hybrid/app.js logic to Nebula's data model.
 * Uses window.HybridProteomics from js/hybrid-core.js (UMD). No modules.
 * Provides the "Hybrid differential" subtab under #downstreamTab.
 */
(function () {
  'use strict';
  if (!window.HybridProteomics) {
    console.warn('HybridProteomics not loaded — hybrid subtab disabled');
    return;
  }
  const H = window.HybridProteomics;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const COLORS = {
    binary: '#2e6b5c',
    intensity: '#3c5f8f',
    hybrid: '#bc4421',
    ink: '#211d17', ink2: '#57503f', ink3: '#8a816c', line: '#d5cdb9', paper: '#f6f2ea'
  };

  window.hybridState = {
    dataset: null,
    warnings: [],
    result: null,
    sort: { key: 'pMin', dir: 1 },
    filter: '',
    volcanoMode: 'hybrid',
    wideFilter: ''
  };
  const state = window.hybridState;
  function hyEl(hyb, hybrid){ return document.getElementById(hyb) || document.getElementById(hybrid); }

  // --- helpers ---------------------------------------------------------------
  function fmtP(p) {
    if (p == null || !isFinite(p)) return '—';
    if (p === 0) return '0';
    if (p < 1e-4) return p.toExponential(2).replace('e-', '×10⁻');
    if (p < 0.01) return p.toPrecision(2).replace('e-', 'e-');
    return p.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0');
  }
  function fmtNum(x, d) {
    if (x == null || !isFinite(x)) return '—';
    return Number(x.toFixed(d == null ? 2 : d)).toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d });
  }
  function fmtPct(x) { return isFinite(x) ? (100 * x).toFixed(1) + '%' : '—'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // --- SVG mini lib (copied from hybrid/app.js, namespaced) ---------------
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(SVGNS, name);
    for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function niceTicks(min, max, n) {
    if (!isFinite(min) || !isFinite(max) || min === max) return [min];
    const span = max - min;
    const step0 = span / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    let step = mag;
    for (const m of [1, 2, 2.5, 5, 10]) { if (step0 <= m * mag) { step = m * mag; break; } }
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
    return ticks;
  }
  function fmtTick(v, log) {
    if (log) {
      const e = Math.round(Math.log10(v));
      if (Math.abs(Math.log10(v) - e) < 1e-9) {
        if (e === 0) return '1';
        if (e === -1) return '0.1';
        if (e === -2) return '0.01';
        if (e === -3) return '0.001';
        return '1e' + e;
      }
    }
    if (v === 0) return '0';
    if (Math.abs(v) >= 1000) return v.toLocaleString('en-US');
    if (Math.abs(v) < 0.01) return v.toExponential(0);
    return String(Math.round(v * 100) / 100);
  }
  function baseChart(container, w, h, m) {
    if (!container) return null;
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img', preserveAspectRatio: 'xMidYMid meet' }, container);
    const g = svgEl('g', {}, svg);
    const x = v => m.l + (v - m.xmin) / (m.xmax - m.xmin) * (w - m.l - m.r);
    const y = v => h - m.b - (v - m.ymin) / (m.ymax - m.ymin) * (h - m.t - m.b);
    return { svg, g, x, y, w, h, m };
  }
  function attachHover(container, svg, seriesDefs) {
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;pointer-events:none;background:#211d17;color:#f6f2ea;font-family:monospace;font-size:11px;padding:7px 10px;line-height:1.5;opacity:0;transition:opacity .12s ease;z-index:30;white-space:nowrap;';
    container.style.position = 'relative';
    container.appendChild(tip);
    const overlay = svgEl('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: 'transparent' }, svg);
    const guide = svgEl('line', { y1: 0, y2: '100%', stroke: COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 }, svg);
    svg.addEventListener('mousemove', ev => {
      const rect = svg.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width);
      let best = null;
      for (const s of seriesDefs) {
        for (const p of s.pts) {
          if (!isFinite(p.px)) continue;
          const d = Math.abs(p.px - mx);
          if (!best || d < best.d) best = { d, p, s };
        }
      }
      if (!best || best.d > 60) { tip.style.opacity = 0; guide.setAttribute('opacity', 0); return; }
      const { p, s } = best;
      guide.setAttribute('x1', p.px); guide.setAttribute('x2', p.px); guide.setAttribute('opacity', 0.8);
      tip.style.opacity = 1;
      tip.innerHTML = '<b style="color:' + s.color + '">' + esc(s.name) + '</b><br>' + esc(p.label || '');
      const lx = (p.px / svg.viewBox.baseVal.width) * rect.width;
      const ly = (p.py / svg.viewBox.baseVal.height) * rect.height;
      tip.style.left = Math.min(lx + 14, rect.width - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.max(4, ly - tip.offsetHeight - 10) + 'px';
    });
    svg.addEventListener('mouseleave', () => { tip.style.opacity = 0; guide.setAttribute('opacity', 0); });
  }

  // --- meta helpers (mirror diff helpers) ---------------------------------
  function hybridNormalizeKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function hybridFindMetaHeader(aliases) {
    if (!window.metaData || !Array.isArray(window.metaData.headers)) return null;
    const keys = aliases.map(hybridNormalizeKey);
    for (const h of window.metaData.headers) if (keys.includes(hybridNormalizeKey(h))) return h;
    return null;
  }
  function hybridBuildMetaBySampleId() {
    const map = new Map();
    if (!window.metaData || !Array.isArray(window.metaData.rows)) return map;
    const sampleIdHeader = hybridFindMetaHeader(['Sample_ID', 'SampleID']) || 'Sample_ID';
    const asText = v => String(v == null ? '' : v).trim();
    window.metaData.rows.forEach(r => { const sid = asText(r[sampleIdHeader]); if (sid) map.set(sid, r); });
    return map;
  }

  // --- dataset builders -----------------------------------------------------
  function buildHybridDatasetFromNebula() {
    const cd = window.currentData;
    if (!cd || !Array.isArray(cd.dataMatrix) || !Array.isArray(cd.columnHeaders) || !Array.isArray(cd.rowIds)) {
      throw new Error('No matrix loaded. Load data in Data Preparation first.');
    }
    const groupColEl = hyEl('hybMetaCol','hybridMetaColumn') || hyEl('hybridMetaColumn','hybMetaCol');
    const gAEl = hyEl('hybGroupA','hybridGroupA');
    const gBEl = hyEl('hybGroupB','hybridGroupB');
    const groupCol = groupColEl ? groupColEl.value : '';
    const valA = gAEl ? gAEl.value : '';
    const valB = gBEl ? gBEl.value : '';
    if (!groupCol) throw new Error('Choose a "Group by" meta column.');
    if (!valA || !valB) throw new Error('Choose both Group A and Group B.');
    if (valA === valB) throw new Error('Group A and Group B must be different.');
    const metaMap = hybridBuildMetaBySampleId();
    const asText = v => String(v == null ? '' : v).trim();
    const samples = [];
    const idxA = [], idxB = [];
    cd.columnHeaders.forEach((sampleId, colIdx) => {
      const sid = asText(sampleId);
      let row = metaMap.get(sid);
      // fallback via resolveMetaRowForMatrixColumn if available
      if (!row && typeof resolveMetaRowForMatrixColumn === 'function') {
        const sidHeader = hybridFindMetaHeader(['Sample_ID', 'SampleID']) || 'Sample_ID';
        const resolved = resolveMetaRowForMatrixColumn(window.metaData.rows, metaMap, sidHeader, colIdx, sampleId);
        row = resolved && resolved.row;
      }
      if (!row) return;
      const v = asText(row[groupCol]);
      if (v === valA) { samples.push({ id: sid, group: 0, colIdx }); idxA.push(colIdx); }
      else if (v === valB) { samples.push({ id: sid, group: 1, colIdx }); idxB.push(colIdx); }
    });
    if (idxA.length < 2 || idxB.length < 2) throw new Error('Each group needs at least 2 samples with matching Sample_ID in the meta table. Found ' + idxA.length + ' in A and ' + idxB.length + ' in B.');
    // Build peptides / proteins: each row is a single-feature group (protein matrix)
    const samplesForHybrid = samples.map(s => ({ id: s.id, group: s.group }));
    const peptides = [];
    const proteins = [];
    for (let r = 0; r < cd.rowIds.length; r++) {
      const featId = String(cd.rowIds[r] == null ? 'row_' + (r + 1) : cd.rowIds[r]).trim() || ('row_' + (r + 1));
      // ensure unique id
      let pid = featId;
      let dup = 1;
      while (peptides.some(p => p.id === pid)) pid = featId + '_' + (++dup);
      const values = {};
      const row = cd.dataMatrix[r] || [];
      samples.forEach(s => {
        const raw = row[s.colIdx];
        if (raw != null && isFinite(raw) && raw !== '' && Number(raw) > 0) {
          const v = Number(raw);
          if (isFinite(v) && v > 0) values[s.id] = v;
        }
      });
      peptides.push({ id: pid, protein: pid, values });
      proteins.push({ id: pid, peptideIds: [pid] });
    }
    // Check that at least some features have observed values
    const anyObserved = peptides.some(p => Object.keys(p.values).length > 0);
    if (!anyObserved) throw new Error('No observed intensities found for the selected groups (all values zero/missing).');
    return {
      samples: samplesForHybrid,
      peptides,
      proteins,
      groupLabels: [valA, valB],
      meta: { source: 'nebula-matrix' }
    };
  }

  function hybridRefreshMetaUi() {
    const sel = hyEl('hybMetaCol','hybridMetaColumn') || hyEl('hybridMetaColumn','hybMetaCol');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    if (!window.metaData || !Array.isArray(window.metaData.headers) || window.metaData.headers.length === 0) {
      const o = document.createElement('option'); o.value = ''; o.textContent = '(No meta table)'; sel.appendChild(o);
      hybridOnMetaColumnChange(); return;
    }
    const cols = window.metaData.headers.filter(h => h && String(h).trim() !== '' && h !== 'Sample_ID');
    if (cols.length === 0) {
      const o = document.createElement('option'); o.value = ''; o.textContent = '(No grouping columns)'; sel.appendChild(o);
    } else {
      cols.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
      if (prev && cols.includes(prev)) sel.value = prev;
    }
    hybridOnMetaColumnChange();
    hybridTrySyncFromNebula();
  }

  function hybridOnMetaColumnChange() {
    const metaEl = hyEl('hybMetaCol','hybridMetaColumn');
    const metaCol = metaEl && metaEl.value;
    const ga = hyEl('hybGroupA','hybridGroupA');
    const gb = hyEl('hybGroupB','hybridGroupB');
    const countsEl = hyEl('hybGroupCounts','hybridGroupCounts');
    if (!ga || !gb) return;
    const prevA = ga.value, prevB = gb.value;
    ga.innerHTML = ''; gb.innerHTML = '';
    if (!metaCol || !window.currentData || !Array.isArray(window.currentData.columnHeaders)) {
      if (countsEl) countsEl.textContent = '';
      hybridUpdateGroupCounts();
      return;
    }
    const metaMap = hybridBuildMetaBySampleId();
    const asText = v => String(v == null ? '' : v).trim();
    const set = new Set();
    window.currentData.columnHeaders.forEach(sid => {
      const row = metaMap.get(asText(sid));
      if (!row) {
        // try resolve fallback
        if (typeof resolveMetaRowForMatrixColumn === 'function') {
          const sidHeader = hybridFindMetaHeader(['Sample_ID', 'SampleID']) || 'Sample_ID';
          const resolved = resolveMetaRowForMatrixColumn(window.metaData.rows, metaMap, sidHeader, window.currentData.columnHeaders.indexOf(sid), sid);
          const r2 = resolved && resolved.row;
          if (r2) { const v2 = asText(r2[metaCol]); if (v2) set.add(v2); }
        }
        return;
      }
      const v = asText(row[metaCol]); if (v) set.add(v);
    });
    const values = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    values.forEach(v => {
      const oa = document.createElement('option'); oa.value = v; oa.textContent = v;
      ga.appendChild(oa.cloneNode(true)); gb.appendChild(oa.cloneNode(true));
    });
    if (values.length >= 1) {
      if (prevA && values.includes(prevA)) ga.value = prevA; else ga.selectedIndex = 0;
      if (prevB && values.includes(prevB)) gb.value = prevB; else gb.selectedIndex = values.length >= 2 ? 1 : 0;
    }
    if (ga.value === gb.value && values.length >= 2) gb.selectedIndex = ga.selectedIndex === 0 ? 1 : 0;
    hybridUpdateGroupCounts();
    hybridTrySyncFromNebula();
  }
  function hybridUpdateGroupCounts() {
    const el = hyEl('hybGroupCounts','hybridGroupCounts');
    if (!el) return;
    const metaEl2 = hyEl('hybMetaCol','hybridMetaColumn');
    const metaCol = metaEl2 && metaEl2.value;
    if (!metaCol || !window.currentData || !Array.isArray(window.currentData.columnHeaders)) { el.textContent = ''; return; }
    const valA = (hyEl('hybGroupA','hybridGroupA') && hyEl('hybGroupA','hybridGroupA').value);
    const valB = (hyEl('hybGroupB','hybridGroupB') && hyEl('hybGroupB','hybridGroupB').value);
    const metaMap = hybridBuildMetaBySampleId();
    const asText = v => String(v == null ? '' : v).trim();
    let nA = 0, nB = 0;
    window.currentData.columnHeaders.forEach(sid => {
      const row = metaMap.get(asText(sid));
      let v = row ? asText(row[metaCol]) : '';
      if (!v && typeof resolveMetaRowForMatrixColumn === 'function') {
        const sidHeader = hybridFindMetaHeader(['Sample_ID', 'SampleID']) || 'Sample_ID';
        const resolved = resolveMetaRowForMatrixColumn(window.metaData.rows, metaMap, sidHeader, window.currentData.columnHeaders.indexOf(sid), sid);
        const r2 = resolved && resolved.row;
        v = r2 ? asText(r2[metaCol]) : '';
      }
      if (v === valA) nA++; else if (v === valB) nB++;
    });
    el.innerHTML = 'Group A <strong>' + esc(valA || '—') + '</strong>: n=' + nA + ' &nbsp;|&nbsp; Group B <strong>' + esc(valB || '—') + '</strong>: n=' + nB;
    if (nA < 2 || nB < 2) el.innerHTML += '<br><span style="color:#c62828;">Each group needs at least 2 samples.</span>';
    try{ if(!state._hybridSyncPending){ state._hybridSyncPending=true; setTimeout(()=>{ state._hybridSyncPending=false; try{ hybridTrySyncFromNebula(); }catch(e){} }, 0); } }catch(e){}
  }

  
  function hybridTrySyncFromNebula(){
    try{
      const cd = window.currentData;
      if(!cd || !Array.isArray(cd.dataMatrix) || !cd.columnHeaders) return;
      const mc = hyEl('hybMetaCol','hybridMetaColumn');
      if(!mc || !mc.value) return;
      const ga = hyEl('hybGroupA','hybridGroupA');
      const gb = hyEl('hybGroupB','hybridGroupB');
      if(!ga || !ga.value || !gb || !gb.value || ga.value===gb.value) return;
      const ds = buildHybridDatasetFromNebula();
      const cur = state.dataset;
      if(cur && cur.meta && cur.meta.source==='nebula-matrix' && cur.groupLabels[0]===ds.groupLabels[0] && cur.groupLabels[1]===ds.groupLabels[1] && cur.samples.length===ds.samples.length) {
        hybridRenderDataset(ds, []);
        hybridSetStatus('ready — ' + ds.proteins.length + ' features \u00b7 ' + ds.samples.length + ' samples (' + ds.groupLabels[0] + ' vs ' + ds.groupLabels[1] + ') — from current matrix', 'live');
        return;
      }
      state.dataset = ds; state.warnings=[]; state.result=null;
      hybridRenderDataset(ds, []);
      hybridSetStatus('ready — ' + ds.proteins.length + ' features \u00b7 ' + ds.samples.length + ' samples (' + ds.groupLabels[0] + ' vs ' + ds.groupLabels[1] + ') — from current matrix', 'live');
      const emptyEl = document.getElementById('hybridEmptyState');
      if(emptyEl) emptyEl.style.display='none';
    }catch(e){}
  }

  // --- data source actions --------------------------------------------------
  window.hybridUseCurrentMatrix = function () {
    try {
      const ds = buildHybridDatasetFromNebula();
      state.dataset = ds; state.warnings = []; state.result = null;
      hybridRenderDataset(ds, []);
      hybridSetStatus('ready — ' + ds.proteins.length + ' features · ' + ds.samples.length + ' samples (' + ds.groupLabels[0] + ' vs ' + ds.groupLabels[1] + ')', 'live');
      document.getElementById('hybridRunStatus').textContent = '';
      document.getElementById('hybridEmptyState').style.display = 'none';
      document.getElementById('hybridResultsBody').style.display = 'none';
      // keep results hidden until Run
    } catch (e) {
      hybridSetStatus('error — ' + e.message, 'err');
      alert(e.message);
    }
  };

  function hybridLoadCsvText(text, name) {
    const parsed = H.parseCsv(text);
    state.dataset = parsed.dataset; state.warnings = parsed.warnings; state.result = null;
    hybridRenderDataset(parsed.dataset, parsed.warnings);
    const ga = hyEl('hybGroupA','hybridGroupA'), gb = hyEl('hybGroupB','hybridGroupB');
    if (ga && gb && parsed.dataset.groupLabels) {
      ga.innerHTML = parsed.dataset.groupLabels.map((g,i)=> '<option value="' + i + '"' + (i===0?' selected':'') + '>' + esc(g) + '</option>').join('');
      gb.innerHTML = parsed.dataset.groupLabels.map((g,i)=> '<option value="' + i + '"' + (i===1?' selected':'') + '>' + esc(g) + '</option>').join('');
      const mc = hyEl('hybMetaCol','hybridMetaColumn');
      if (mc) mc.innerHTML = '<option value="">(from file: ' + esc(parsed.dataset.groupLabels.join(' / ')) + ')</option>';
    }
    hybridSetStatus(name + ' — ' + parsed.dataset.peptides.length + ' features in ' + parsed.dataset.proteins.length + ' groups', 'live');
    document.getElementById('hybridEmptyState').style.display = 'none';
    document.getElementById('hybridResultsBody').style.display = 'none';
  }

  // --- rendering ------------------------------------------------------------
  function hybridSetStatus(text, cls) {
    const el = document.getElementById('hybridStatusText');
    if (el) el.textContent = text;
    const chip = document.getElementById('hybridStatusChip');
    if (chip) chip.classList.toggle('live', cls === 'live');
  }

  function hybridRenderDataset(ds, warnings) {
    // ds stats
    const nSmp = ds.samples.length;
    const nA = ds.samples.filter(s=>s.group===0).length;
    const nB = nSmp - nA;
    let totalCells = 0, present = 0;
    for (const p of ds.peptides) for (const v of Object.values(p.values)) { totalCells++; if(isFinite(v)&&v>0) present++; }
    // also count missing cells as peptides*samples - present? Use peptide count
    const nProt = ds.proteins.length;
    const nSingle = ds.proteins.filter(p=>p.peptideIds.length===1).length;
    const dsTag = document.getElementById('hybridDsTag');
    if (dsTag) dsTag.textContent = ds.meta && ds.meta.source === 'simulated' ? 'simulated' : (ds.meta && ds.meta.source==='nebula-matrix' ? 'nebula matrix' : 'user data');
    const dsStats = document.getElementById('hybridDsStats');
    if (dsStats) dsStats.innerHTML = [
      ['feature groups', nProt, '<small>(' + nSingle + ' single-feature)</small>'],
      ['features (rows)', ds.peptides.length],
      ['samples (cols)', nSmp, '<small>(' + nA + ' ' + esc(ds.groupLabels[0]) + ' · ' + nB + ' ' + esc(ds.groupLabels[1]) + ')</small>'],
      ['missing?', fmtPct(totalCells? 1-present/totalCells : 0)]
    ].map(([k,v,sub])=> '<div class="hybrid-stat"><div class="k">'+k+'</div><div class="v">'+v+(sub||'')+'</div></div>').join('');
    const wEl = document.getElementById('hybridDsWarnings');
    if (wEl) wEl.innerHTML = (warnings && warnings.length) ? warnings.map(w=> '<div class="hybrid-pill" style="border-color:#b08a2a;background:#f5eeda">⚠ '+esc(w)+'</div>').join('') : '';
    // group selectors already handled elsewhere, but ensure counts
    hybridUpdateGroupCounts();
    hybridRenderWideTable(ds);
  }

  function fmtCell(v){ if(v>=10000) return v.toExponential(2); return String(Number(v.toPrecision(4))); }
  function hybridRenderWideTable(ds){
    const samples = ds.samples;
    const nS = samples.length;
    const hasGroups = ds.proteins.some(p=>p.peptideIds.length>1);
    const table = document.getElementById('hybridWideTable');
    if(table) table.classList.toggle('grp', hasGroups);
    let sepIdx=-1; for(let i=0;i<nS;i++) if(samples[i].group===1){ sepIdx=i; break; }
    let h1='<th>feature</th>' + (hasGroups?'<th>feature group</th>':'');
    let h2='<th></th>' + (hasGroups?'<th></th>':'');
    for(let i=0;i<nS;i++){ const cls='g'+samples[i].group + (i===sepIdx?' sep':''); h1+='<th class="'+cls+'">'+esc(samples[i].id)+'</th>'; h2+='<th class="'+cls+'">'+esc(ds.groupLabels[samples[i].group])+'</th>'; }
    const head = document.getElementById('hybridWideHead');
    if(head) head.innerHTML='<tr>'+h1+'</tr><tr>'+h2+'</tr>';
    let totalCells=0, present=0;
    for(const p of ds.peptides){ for(const s of samples){ totalCells++; const v=p.values[s.id]; if(isFinite(v)&&v>0) present++; } }
    const miss = totalCells? 1-present/totalCells :0;
    const ws = document.getElementById('hybridWideStats');
    if(ws) ws.innerHTML = [
      ['features (rows)', ds.peptides.length],
      ['feature groups', ds.proteins.length, hasGroups?'':'<small>(each feature is its own group)</small>'],
      ['samples (cols)', nS, '<small>('+esc(ds.groupLabels[0])+' / '+esc(ds.groupLabels[1])+')</small>'],
      ['missing cells', fmtPct(miss)]
    ].map(([k,v,sub])=> '<div class="hybrid-stat"><div class="k">'+k+'</div><div class="v">'+v+(sub?'<br><small>'+sub+'</small>':'')+'</div></div>').join('');
    const f=(state.wideFilter||'').toLowerCase();
    const rows=[];
    for(const p of ds.peptides){
      if(f && !(p.id.toLowerCase().includes(f) || p.protein.toLowerCase().includes(f))) continue;
      let cells='';
      for(let i=0;i<nS;i++){ const v=p.values[samples[i].id]; const sep=i===sepIdx; if(isFinite(v)&&v>0){ cells+=(sep?'<td class="sep">':'<td>')+fmtCell(v)+'</td>'; } else { cells+='<td class="'+(sep?'sep miss':'miss')+'">–</td>'; } }
      rows.push('<tr><td>'+esc(p.id)+'</td>' + (hasGroups?'<td>'+esc(p.protein)+'</td>':'') + cells + '</tr>');
    }
    const body=document.getElementById('hybridWideBody');
    if(body) body.innerHTML=rows.join('');
    const note=document.getElementById('hybridWideNote');
    if(note) note.textContent = (f? rows.length+' of '+ds.peptides.length+' features shown (filtered) · ' : '') + ds.peptides.length+' features × '+nS+' samples · faint = not observed (MNAR)';
  }

  window.hybridWideFilterInput = function(v){ state.wideFilter=v; if(state.dataset) hybridRenderWideTable(state.dataset); };

  function hybridWideCsvText(ds){
    const hasGroups = ds.proteins.some(p=>p.peptideIds.length>1);
    const head = hasGroups? ['Feature','Feature group'] : ['Feature'];
    const lines=[];
    lines.push(head.concat(ds.samples.map(s=>s.id)).join(','));
    lines.push(['Group'].concat(hasGroups?[''] : []).concat(ds.samples.map(s=> ds.groupLabels[s.group])).join(','));
    for(const p of ds.peptides){
      const cells= ds.samples.map(s=>{ const v=p.values[s.id]; return isFinite(v)&&v>0? String(v) : ''; });
      lines.push(hasGroups? [p.id,p.protein].concat(cells).join(',') : [p.id].concat(cells).join(','));
    }
    return lines.join('\n');
  }
  window.hybridExportWideCsv = function(){
    if(!state.dataset) return;
    const txt = hybridWideCsvText(state.dataset);
    const blob=new Blob([txt],{type:'text/csv'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='hybrid_dataset_wide.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  window.hybridExportWideCsv2 = window.hybridExportWideCsv;

  // --- figures --------------------------------------------------------------
  function drawMainFigure(res, targetFdr){
    const container = document.getElementById('hybridSvgMain'); if(!container) return;
    const W=860, Hh=380, M={ l:58, r:24, t:18, b:46 };
    const series=[];
    function addSeries(name,color,pts){ const valid=pts.filter(p=>isFinite(p.x)&&isFinite(p.y)&&p.x>0); if(!valid.length) return; series.push({name,color,pts:valid}); }
    addSeries('presence/absence', COLORS.binary, res.binary.curves.map(c=>({x:c.fdrMix,y:c.sel,cp:c.cp})));
    addSeries('intensity', COLORS.intensity, res.intensity.curves.map(c=>({x:c.fdr,y:c.sel,cp:c.cp})));
    addSeries('hybrid (Sec. 2.6)', COLORS.hybrid, res.hybrid.curves.map(c=>({x:c.fdr,y:c.sel,cp:c.cp})));
    if(!series.length){ container.innerHTML='<div style="color:#8a816c;padding:12px">no curves</div>'; return; }
    const xMin = Math.max(1e-4, Math.min.apply(null, series.flatMap(s=>s.pts.map(p=>p.x)))*0.8);
    const xMax = Math.min(1.5, Math.max.apply(null, series.flatMap(s=>s.pts.map(p=>p.x)))*1.15);
    const yMax = Math.max.apply(null, series.flatMap(s=>s.pts.map(p=>p.y)))*1.12;
    const lxMin=Math.log10(xMin), lxMax=Math.log10(xMax);
    const c=baseChart(container,W,Hh,{l:M.l,r:M.r,t:M.t,b:M.b,xmin:lxMin,xmax:lxMax,ymin:0,ymax:yMax});
    if(!c) return;
    const xL=v=> c.m.l + (Math.log10(v)-lxMin)/(lxMax-lxMin)*(W-M.l-M.r);
    const xTicks=[]; for(let e=Math.ceil(lxMin); e<=Math.floor(lxMax); e++) xTicks.push(Math.pow(10,e));
    const Yt=niceTicks(0,yMax,5);
    for(const t of Yt){ svgEl('line',{x1:M.l,x2:W-M.r,y1:c.y(t),y2:c.y(t),stroke:COLORS.line,'stroke-width':0.7},c.g); svgEl('text',{x:M.l-7,y:c.y(t)+3.5,'text-anchor':'end','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},c.g).textContent=String(Math.round(t)); }
    for(const t of xTicks){ if(t < xMin*0.99 || t > xMax*1.01) continue; svgEl('line',{x1:xL(t),x2:xL(t),y1:Hh-M.b,y2:Hh-M.b+4,stroke:COLORS.ink3,'stroke-width':0.7},c.g); svgEl('text',{x:xL(t),y:Hh-M.b+16,'text-anchor':'middle','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},c.g).textContent=fmtTick(t,true); }
    svgEl('line',{x1:M.l,x2:W-M.r,y1:Hh-M.b,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},c.g);
    svgEl('line',{x1:M.l,x2:M.l,y1:M.t,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},c.g);
    svgEl('text',{x:(M.l+W-M.r)/2,y:Hh-3,'text-anchor':'middle','font-size':11.5,fill:COLORS.ink2,'font-family':'sans-serif'},c.g).textContent='estimated FDR';
    const yl=svgEl('text',{x:13,y:(M.t+Hh-M.b)/2,'text-anchor':'middle','font-size':11.5,fill:COLORS.ink2,'font-family':'sans-serif',transform:`rotate(-90 13 ${(M.t+Hh-M.b)/2})`},c.g); yl.textContent='# selected proteins';
    const hoverPts=[];
    for(const s of series){
      const pts=s.pts.slice().sort((a,b)=>a.x-b.x).map(p=>[p.x,p.y]);
      const d=pts.map((p,i)=> (i===0?'M':'L')+xL(p[0]).toFixed(2)+' '+c.y(p[1]).toFixed(2)).join(' ');
      const path=svgEl('path',{d,fill:'none',stroke:s.color,'stroke-width':s.name.startsWith('hybrid')?2.4:1.7,'stroke-linejoin':'round'},c.g);
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        try{ const len=path.getTotalLength(); path.style.transition='stroke-dashoffset 1s'; path.style.strokeDasharray=len; path.style.strokeDashoffset=len; requestAnimationFrame(()=>requestAnimationFrame(()=>{path.style.strokeDashoffset='0';})); setTimeout(()=>{path.style.strokeDasharray='none';},1000);}catch(e){}
      }
      for(const p of s.pts) hoverPts.push({px:xL(p.x),py:c.y(p.y),name:s.name,color:s.color,label:'FDR '+fmtP(p.x)+' · '+p.y+' selected · cp='+fmtP(p.cp)});
    }
    if(targetFdr>=xMin && targetFdr<=xMax){
      svgEl('line',{x1:xL(targetFdr),x2:xL(targetFdr),y1:c.m.t,y2:c.h-c.m.b,stroke:COLORS.ink,'stroke-width':1.1,'stroke-dasharray':'5 4',opacity:0.75},c.g);
      const t=svgEl('text',{x:xL(targetFdr)+5,y:c.m.t+12,'font-size':10.5,fill:COLORS.ink2,'font-family':'sans-serif'},c.g); t.textContent='target FDR = '+targetFdr;
    }
    const ops=[{s:res.binary.operatingPoint,color:COLORS.binary,name:'presence/absence'},{s:res.intensity.operatingPoint,color:COLORS.intensity,name:'intensity'},{s:res.hybrid.operatingPoint,color:COLORS.hybrid,name:'hybrid'}];
    for(const o of ops){
      if(!isFinite(o.s.cp)||!isFinite(o.s.fdr)||o.s.sel==null) continue;
      if(o.s.fdr < xMin || o.s.fdr > xMax || o.s.sel > yMax) continue;
      svgEl('circle',{cx:xL(o.s.fdr),cy:c.y(o.s.sel),r:4.2,fill:o.color,stroke:COLORS.paper,'stroke-width':1.6},c.g);
      hoverPts.push({px:xL(o.s.fdr),py:c.y(o.s.sel),name:o.name,color:o.color,label:'operating point: FDR '+fmtP(o.s.fdr)+' · '+o.s.sel+' selected · cp='+fmtP(o.s.cp)});
    }
    attachHover(container,c.svg,[{name:'hover',color:'#fff',pts:hoverPts}]);
    const leg=document.getElementById('hybridLegMain');
    if(leg) leg.innerHTML=['presence/absence','intensity','hybrid (Sec. 2.6)'].map((n,i)=> '<span class="hybrid-legend-item"><span class="hybrid-swatch" style="background:'+[COLORS.binary,COLORS.intensity,COLORS.hybrid][i]+'"></span>'+n+'</span>').join('') + '<span class="hybrid-legend-item"><span class="hybrid-swatch" style="background:'+COLORS.ink+';opacity:.5"></span>target FDR</span>';
  }

  function drawHist(containerId, legendId, datasets){
    const container=document.getElementById(containerId); if(!container) return;
    const W=860,Hh=260,M={l:52,r:20,t:14,b:42};
    const xMin=Math.min.apply(null, datasets.flatMap(d=>d.pts.filter(isFinite).map(p=>p)))*0.9;
    const eMin=Math.floor(Math.log10(Math.max(xMin,1e-9))); const eMax=0; const nB=eMax-eMin;
    const bins=datasets.map(()=> new Array(nB).fill(0));
    datasets.forEach((d,di)=>{ for(const p of d.pts){ if(!isFinite(p)||p<=0||p>1) continue; const e=Math.min(eMax-1, Math.floor(Math.log10(p))); const idx=e-eMin; if(idx>=0&&idx<nB) bins[di][idx]++; } });
    const yMax=Math.max(1, ...bins.flat())*1.15;
    const c=baseChart(container,W,Hh,{l:M.l,r:M.r,t:M.t,b:M.b,xmin:eMin,xmax:eMax,ymin:0,ymax:yMax}); if(!c) return;
    for(const t of niceTicks(0,yMax,5)){ svgEl('line',{x1:M.l,x2:W-M.r,y1:c.y(t),y2:c.y(t),stroke:COLORS.line,'stroke-width':0.7},c.g); svgEl('text',{x:M.l-7,y:c.y(t)+3.5,'text-anchor':'end','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},c.g).textContent=String(Math.round(t)); }
    svgEl('line',{x1:M.l,x2:W-M.r,y1:Hh-M.b,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},c.g); svgEl('line',{x1:M.l,x2:M.l,y1:M.t,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},c.g);
    const bw=(W-M.l-M.r)/nB; const nD=datasets.length;
    datasets.forEach((d,di)=>{ for(let i=0;i<nB;i++){ const v=bins[di][i]; if(!v) continue; svgEl('rect',{x:c.x(i+eMin)+bw*(di/nD)*0.86+bw*0.07,y:c.y(v),width:Math.max(1,bw*0.86/nD-1.5),height:c.y(0)-c.y(v),fill:d.color,opacity:0.85},c.g); } });
    for(let e=eMin;e<=eMax;e++){ const v=Math.pow(10,e); svgEl('line',{x1:c.x(e-eMin),x2:c.x(e-eMin),y1:Hh-M.b,y2:Hh-M.b+4,stroke:COLORS.ink3,'stroke-width':0.7},c.g); svgEl('text',{x:c.x(e-eMin),y:Hh-M.b+16,'text-anchor':'middle','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},c.g).textContent=v<1?'1e'+e:'1'; }
    svgEl('text',{x:(M.l+W-M.r)/2,y:Hh-2,'text-anchor':'middle','font-size':11.5,fill:COLORS.ink2,'font-family':'sans-serif'},c.g).textContent='p-value (log scale)';
    const leg=document.getElementById(legendId);
    if(leg) leg.innerHTML=datasets.map(d=> '<span class="hybrid-legend-item"><span class="hybrid-swatch" style="background:'+d.color+'"></span>'+d.name+' <span style="color:'+COLORS.ink3+'">(n='+d.pts.filter(isFinite).length+')</span></span>').join('');
  }

  function drawPi0(container, curve, pi0){
    if(!container) return; container.innerHTML='';
    if(!curve||curve.length<3){ container.innerHTML='<div style="color:#8a816c;padding:12px">not enough p-values for a π₀ curve</div>'; return; }
    const W=860,Hh=200,M={l:58,r:24,t:16,b:38};
    const ys=curve.map(p=>p[1]); const yMax=Math.min(1.15, Math.max.apply(null,ys)*1.1+0.02);
    const c=baseChart(container,W,Hh,{l:M.l,r:M.r,t:M.t,b:M.b,xmin:0,xmax:1,ymin:0,ymax:yMax}); if(!c) return;
    // axes
    const X=niceTicks(0,1,6), Y=niceTicks(0,yMax,4);
    for(const t of Y){ svgEl('line',{x1:M.l,x2:W-M.r,y1:c.y(t),y2:c.y(t),stroke:COLORS.line,'stroke-width':0.7},c.g); svgEl('text',{x:M.l-7,y:c.y(t)+3.5,'text-anchor':'end','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},c.g).textContent=String(Math.round(t*100)/100); }
    for(const t of X){ svgEl('line',{x1:c.x(t),x2:c.x(t),y1:Hh-M.b,y2:Hh-M.b+4,stroke:COLORS.ink3,'stroke-width':0.7},c.g); svgEl('text',{x:c.x(t),y:Hh-M.b+16,'text-anchor':'middle','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},c.g).textContent=String(t); }
    svgEl('line',{x1:M.l,x2:W-M.r,y1:Hh-M.b,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},c.g); svgEl('line',{x1:M.l,x2:M.l,y1:M.t,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},c.g);
    svgEl('text',{x:(M.l+W-M.r)/2,y:Hh-2,'text-anchor':'middle','font-size':11.5,fill:COLORS.ink2},c.g).textContent='λ (p-value threshold)'; const yl=svgEl('text',{x:13,y:(M.t+Hh-M.b)/2,'text-anchor':'middle','font-size':11.5,fill:COLORS.ink2,transform:`rotate(-90 13 ${(M.t+Hh-M.b)/2})`},c.g); yl.textContent='π̂₀(λ)';
    for(const [x,yv] of curve) svgEl('circle',{cx:c.x(x),cy:c.y(yv),r:2.2,fill:COLORS.binary,opacity:0.5},c.g);
    const tail=curve.slice(Math.max(0,Math.floor(0.75*curve.length)));
    if(tail.length>=3){
      const q=H.fitQuadratic? H.fitQuadratic(tail) : null;
      // fallback: use storeyPi0 fitQuadratic not exposed; approximate pi0 line
      if(q){
        const pts=[]; for(let i=0;i<=40;i++){ const x=tail[0][0]+(1-tail[0][0])*i/40; const yv=q.a+q.b*x+q.c*x*x; if(yv>1.2||yv<-0.2) continue; pts.push([x,Math.max(0,yv)]); }
        if(pts.length>1){ const d=pts.map((p,i)=>(i?'L':'M')+c.x(p[0]).toFixed(1)+' '+c.y(p[1]).toFixed(1)).join(' '); svgEl('path',{d,fill:'none',stroke:COLORS.hybrid,'stroke-width':2.2},c.g); }
        const t=svgEl('text',{x:c.x(1)-8,y:c.y(Math.max(0,Math.min(1,q.a+q.b+q.c)))-8,'font-size':11,fill:COLORS.hybrid,'font-family':'sans-serif','text-anchor':'end'},c.g); t.textContent='π̂₀ = '+pi0.toFixed(3);
      } else {
        const t=svgEl('text',{x:c.x(1)-8,y:c.y(pi0)-8,'font-size':11,fill:COLORS.hybrid,'font-family':'sans-serif','text-anchor':'end'},c.g); t.textContent='π̂₀ = '+pi0.toFixed(3);
      }
    }
  }

  const VOL_MODES={
    hybrid:{color:COLORS.hybrid,label:'hybrid (min p)',x:x=> (isFinite(x.log2FC)?x.log2FC:null), xEdge:x=>((x.y1>0&&x.y2===0)?1:(x.y1===0&&x.y2>0)?-1:0), y:x=> -Math.log10(Math.min(x.pBin,isFinite(x.pInt)?x.pInt:1)), sel:x=>x.selHybrid, xLabel:'log₂FC (intensity stage)', skip:x=>false, tip:x=>'log₂FC '+(isFinite(x.log2FC)?x.log2FC.toFixed(2):'— (one-state type)')+'<br>p_bin '+fmtP(x.pBin)+' · p_int '+(isFinite(x.pInt)?fmtP(x.pInt):'—')+'<br>min p '+fmtP(Math.min(x.pBin,isFinite(x.pInt)?x.pInt:1))},
    binary:{color:COLORS.binary,label:'presence/absence',x:x=> Math.log2((x.y1+1)/(x.y2+1)), xEdge:()=>0, y:x=> -Math.log10(x.pBin), sel:x=>x.selBinary, xLabel:'log₂ presence ratio (y₁+1)/(y₂+1)', skip:x=>false, tip:x=>'ratio '+(x.y1+1)+':'+(x.y2+1)+' → log₂ '+Math.log2((x.y1+1)/(x.y2+1)).toFixed(2)+'<br>p_bin '+fmtP(x.pBin)},
    intensity:{color:COLORS.intensity,label:'intensity',x:x=> (isFinite(x.log2FC)?x.log2FC:null), xEdge:()=>0, y:x=> (isFinite(x.pInt)? -Math.log10(x.pInt):null), sel:x=>x.selIntensity, xLabel:'log₂FC (intensity stage)', skip:x=> !isFinite(x.pInt), tip:x=>'log₂FC '+x.log2FC.toFixed(2)+'<br>p_int '+fmtP(x.pInt)}
  };
  function drawVolcano(res){
    const def=VOL_MODES[state.volcanoMode]||VOL_MODES.hybrid;
    const container=document.getElementById('hybridSvgVolcano'); if(!container) return; container.innerHTML='';
    const W=860,Hh=430,M={l:62,r:24,t:20,b:48};
    const c=baseChart(container,W,Hh,{l:M.l,r:M.r,t:M.t,b:M.b,xmin:-1,xmax:1,ymin:0,ymax:1}); if(!c) return;
    const pts=[]; for(const x of res.proteins){ if(def.skip(x)) continue; const yv=def.y(x); if(!isFinite(yv)) continue; pts.push({x,xv:def.x(x),yv,sel:def.sel(x)}); }
    const g=c.g;
    if(!pts.length){ svgEl('text',{x:W/2,y:Hh/2,'text-anchor':'middle','font-size':12,fill:COLORS.ink3},g).textContent='no proteins with a usable value'; const leg=document.getElementById('hybridLegVolcano'); if(leg) leg.innerHTML=''; return; }
    const fx=pts.filter(p=>isFinite(p.xv)).map(p=>Math.abs(p.xv)).sort((a,b)=>a-b);
    const xq=fx.length? fx[Math.floor(0.99*fx.length)] :4; const xMax=Math.min(14,Math.max(2.5,xq*1.15));
    const fy=pts.map(p=>p.yv).sort((a,b)=>a-b); const yq=fy[Math.floor(0.99*fy.length)]; const yMax=Math.max(4,Math.max(yq*1.12, -Math.log10(res.options.targetFdr)*1.35));
    const X=v=> M.l + (v + xMax)/(2*xMax)*(W-M.l-M.r);
    const Y=v=> Hh-M.b - (v / yMax)*(Hh-M.t-M.b);
    const xTicks=niceTicks(-xMax,xMax,7);
    for(const t of xTicks){ svgEl('line',{x1:X(t),x2:X(t),y1:Hh-M.b,y2:Hh-M.b+4,stroke:COLORS.ink3,'stroke-width':0.7},g); svgEl('text',{x:X(t),y:Hh-M.b+16,'text-anchor':'middle','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},g).textContent=String(Math.round(t*10)/10); }
    for(const t of niceTicks(0,yMax,5)){ if(t>yMax) continue; svgEl('line',{x1:M.l,x2:W-M.r,y1:Y(t),y2:Y(t),stroke:COLORS.line,'stroke-width':0.7},g); svgEl('text',{x:M.l-7,y:Y(t)+3.5,'text-anchor':'end','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},g).textContent=String(Math.round(t)); }
    svgEl('line',{x1:M.l,x2:W-M.r,y1:Hh-M.b,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},g); svgEl('line',{x1:M.l,x2:M.l,y1:M.t,y2:Hh-M.b,stroke:COLORS.ink,'stroke-width':1.2},g); svgEl('line',{x1:X(0),x2:X(0),y1:M.t,y2:Hh-M.b,stroke:COLORS.line,'stroke-width':1},g);
    svgEl('text',{x:(M.l+W-M.r)/2,y:Hh-3,'text-anchor':'middle','font-size':11.5,fill:COLORS.ink2,'font-family':'sans-serif'},g).textContent=def.xLabel;
    const yl=svgEl('text',{x:13,y:(M.t+Hh-M.b)/2,'text-anchor':'middle','font-size':11.5,fill:COLORS.ink2,'font-family':'sans-serif',transform:`rotate(-90 13 ${(M.t+Hh-M.b)/2})`},g); yl.textContent='−log₁₀ p';
    const pCut=-Math.log10(res.options.targetFdr); const fcL=X(-1), fcR=X(1);
    svgEl('rect',{x:Math.min(fcL,X(0)),y:M.t,width:Math.abs(X(0)-fcL),height:Math.max(0,Y(Math.min(pCut,yMax))-M.t),fill:def.color,opacity:0.05},g);
    svgEl('rect',{x:Math.min(X(0),fcR),y:M.t,width:Math.abs(fcR-X(0)),height:Math.max(0,Y(Math.min(pCut,yMax))-M.t),fill:def.color,opacity:0.05},g);
    svgEl('line',{x1:fcL,x2:fcL,y1:M.t,y2:Hh-M.b,stroke:COLORS.ink3,'stroke-width':1,'stroke-dasharray':'4 3'},g);
    svgEl('line',{x1:fcR,x2:fcR,y1:M.t,y2:Hh-M.b,stroke:COLORS.ink3,'stroke-width':1,'stroke-dasharray':'4 3'},g);
    if(pCut<=yMax){ const yCut=Y(pCut); svgEl('line',{x1:M.l,x2:W-M.r,y1:yCut,y2:yCut,stroke:COLORS.ink3,'stroke-width':1,'stroke-dasharray':'4 3'},g); svgEl('text',{x:W-M.r-4,y:yCut-5,'text-anchor':'end','font-size':10.5,fill:COLORS.ink3,'font-family':'monospace'},g).textContent='target FDR '+fmtP(res.options.targetFdr); }
    const drawn=[];
    const place=(p,r,fill,stroke,sw,op)=>{ const ex=isFinite(p.xv)? p.xv : def.xEdge(p.x)*xMax*0.985; const px=X(ex), py=Y(Math.min(p.yv,yMax)); const el=svgEl('circle',{cx:px.toFixed(1),cy:py.toFixed(1),r,fill,stroke,'stroke-width':sw,opacity:op},g); drawn.push({px,py,p,el}); };
    let nSelUp=0,nSelDown=0,nEdge=0;
    for(const p of pts) if(!p.sel) place(p,3.4,'#cdc4ae',COLORS.paper,0.8,0.7);
    for(const p of pts){ if(!p.sel) continue; place(p,4.6,def.color,'#ffffff',1.5,0.95); if(!isFinite(p.xv)) nEdge++; else if(p.xv>1) nSelUp++; else if(p.xv<-1) nSelDown++; }
    const svg=c.svg; const tip=document.createElement('div'); tip.style.cssText='position:absolute;pointer-events:none;background:#211d17;color:#f6f2ea;font-family:monospace;font-size:11px;padding:7px 10px;line-height:1.5;opacity:0;transition:opacity .12s ease;z-index:30;white-space:nowrap;'; container.style.position='relative'; container.appendChild(tip);
    const overlay=svgEl('rect',{x:0,y:0,width:'100%',height:'100%',fill:'transparent'},svg); let lastEl=null;
    const clearLast=()=>{ if(!lastEl) return; lastEl.setAttribute('r', lastEl.getAttribute('data-r')); lastEl.setAttribute('stroke', lastEl.getAttribute('data-stroke')); lastEl=null; };
    overlay.addEventListener('mousemove',ev=>{
      const rect=svg.getBoundingClientRect(); const mx=(ev.clientX-rect.left)*(svg.viewBox.baseVal.width/rect.width); const my=(ev.clientY-rect.top)*(svg.viewBox.baseVal.height/rect.height);
      let best=null; for(const d of drawn){ const dist=Math.hypot(d.px-mx,d.py-my); if(!best||dist<best.dist) best={dist,d}; }
      clearLast(); if(!best||best.dist>18){ tip.style.opacity=0; return; }
      const {d}=best; d.el.setAttribute('data-r', d.el.getAttribute('r')); d.el.setAttribute('data-stroke', d.el.getAttribute('stroke')); d.el.setAttribute('r', Number(d.el.getAttribute('r'))+2); d.el.setAttribute('stroke',COLORS.ink); lastEl=d.el;
      tip.style.opacity=1; tip.innerHTML='<b style="color:'+def.color+'">'+esc(d.p.x.protein)+'</b><br>'+def.tip(d.p.x)+'<br>'+(d.p.sel?'✓ selected ('+def.label+')':'not selected')+(d.p.x.single?'<br>single-feature group':'')+(((d.p.x.y1>0&&d.p.x.y2===0)||(d.p.x.y1===0&&d.p.x.y2>0))?'<br>one-state type':'');
      const lx=(d.px/svg.viewBox.baseVal.width)*rect.width; const ly=(d.py/svg.viewBox.baseVal.height)*rect.height;
      tip.style.left=Math.min(lx+14, rect.width-tip.offsetWidth-8)+'px'; tip.style.top=Math.max(4, ly-tip.offsetHeight-10)+'px';
    });
    overlay.addEventListener('mouseleave',()=>{ tip.style.opacity=0; clearLast(); });
    const leg=document.getElementById('hybridLegVolcano');
    if(leg){
      const nSel=pts.filter(p=>p.sel).length; const nUn=pts.length-nSel;
      let items='<span class="hybrid-legend-item"><span class="hybrid-swatch" style="background:'+def.color+';border-radius:50%"></span>selected ('+nSel+')</span><span class="hybrid-legend-item"><span class="hybrid-swatch" style="background:#cdc4ae;border-radius:50%"></span>not selected ('+nUn+')</span>';
      if(nEdge) items+='<span class="hybrid-legend-item"><span class="hybrid-swatch" style="background:transparent;border:2px solid '+def.color+';border-radius:50%"></span>one-state type, no FC (edge, '+nEdge+')</span>';
      items+='<span class="hybrid-legend-item"><span class="hybrid-swatch" style="border-bottom:2px dashed '+COLORS.ink3+';height:1px;width:18px"></span>target FDR / |FC| = 1</span>';
      items+='<span class="hybrid-legend-item" style="color:'+COLORS.ink3+'">up-selected '+nSelUp+' · down-selected '+nSelDown+'</span>';
      leg.innerHTML=items;
    }
  }

  function hybridMarkVolcanoBtns(){
    $$('.hybrid-vol-btn').forEach(b=>{
      const on=b.getAttribute('data-mode')===state.volcanoMode;
      b.style.background= on? 'rgba(188,68,33,.10)':''; b.style.color= on? '#bc4421':''; b.style.borderColor= on? '#bc4421':''; b.style.fontWeight= on? 600:'';
    });
  }

  // --- table (Nebula DataTables style) — ported from hybrid2: adds pep (local) + fdr (global) ---
  const COLS=[
    {key:'protein',label:'feature group',get:x=>x.protein},
    {key:'nPeptides',label:'n feat.',get:x=>x.nPeptides},
    {key:'type',label:'type',get:x=> x.single?'S':'M'},
    {key:'y1',label:'y\u00b7A',get:x=>x.y1},
    {key:'y2',label:'y\u00b7B',get:x=>x.y2},
    {key:'T',label:'T',get:x=>x.T},
    {key:'pBin',label:'p binary',get:x=>x.pBin},
    {key:'w',label:'w',get:x=> x.single? x.w : null},
    {key:'log2FC',label:'log2FC',get:x=>x.log2FC},
    {key:'pInt',label:'p int.',get:x=>x.pInt},
    {key:'pMin',label:'min p',get:x=> Math.min(x.pBin,isFinite(x.pInt)?x.pInt:1)},
    {key:'pep',label:'pep',get:x=>x.pep},
    {key:'fdr',label:'fdr',get:x=>x.fdr},
    {key:'sel',label:'sel.',get:x=> (x.selHybrid?'H':'')+(x.selBinary?'B':'')+(x.selIntensity?'I':'')}
  ];
  function hybridRenderTable(res){
    const host = document.getElementById('hybridResultTableHost');
    const note = document.getElementById('hybridTableNote');
    if(!host) return;
    const rows = res.proteins.map(x=>{
      const oneState = (x.y1>0&&x.y2===0)||(x.y1===0&&x.y2>0);
      const sel=[];
      if(x.selHybrid) sel.push('H');
      if(x.selBinary) sel.push('B');
      if(x.selIntensity) sel.push('I');
      const selStr = sel.length? sel.join(''): '\u2014';
      const protDisplay = x.protein + (oneState ? ' \u25cfone-state' : '');
      return {
        protein: protDisplay,
        nPeptides: x.nPeptides,
        type: x.single?'S':'M',
        y1: x.y1,
        y2: x.y2,
        T: isFinite(x.T)? x.T : null,
        pBin: isFinite(x.pBin)? x.pBin : null,
        w: x.single? (x.w===1?'null':'alt') : '\u2014',
        log2FC: isFinite(x.log2FC)? x.log2FC : null,
        pInt: isFinite(x.pInt)? x.pInt : null,
        pMin: Math.min(x.pBin,isFinite(x.pInt)?x.pInt:1),
        pep: isFinite(x.pep)? x.pep : null,
        fdr: isFinite(x.fdr)? x.fdr : null,
        sel: selStr
      };
    });
    const tdCols = [
      {title:'feature group', key:'protein', searchable:true, orderable:true},
      {title:'n feat.', key:'nPeptides', searchable:false},
      {title:'type', key:'type'},
      {title:'y\u00b7A', key:'y1'},
      {title:'y\u00b7B', key:'y2'},
      {title:'T', key:'T', render: function(data,type){ if(type!=='display') return data==null?'':data; return data==null||data==='' ? '\u2014' : Number(data).toFixed(3).replace(/\.?0+$/,''); }},
      {title:'p binary', key:'pBin', render: function(data,type){ if(type!=='display') return data==null? 1 : data; return data==null||!isFinite(data) ? '\u2014' : fmtP(data); }},
      {title:'w', key:'w'},
      {title:'log2FC', key:'log2FC', render: function(data,type){ if(type!=='display') return data==null?'':data; return data==null||data==='' ? '\u2014' : Number(data).toFixed(3).replace(/\.?0+$/,''); }},
      {title:'p int.', key:'pInt', render: function(data,type){ if(type!=='display') return data==null? 1 : data; return data==null||!isFinite(data) ? '\u2014' : fmtP(data); }},
      {title:'min p', key:'pMin', render: function(data,type){ if(type!=='display') return data==null? 1 : data; return data==null||!isFinite(data) ? '\u2014' : fmtP(data); }},
      {title:'pep', key:'pep', render: function(data,type){ if(type!=='display') return data==null? 1 : data; return data==null||!isFinite(data) ? '\u2014' : fmtP(data); }},
      {title:'fdr', key:'fdr', render: function(data,type){ if(type!=='display') return data==null? 1 : data; return data==null||!isFinite(data) ? '\u2014' : fmtP(data); }},
      {title:'sel.', key:'sel', render: function(data,type){ if(type!=='display') return data; if(!data||data==='\u2014') return '<span class="hybrid-badge s">\u2014</span>'; let html=''; for(let ch of String(data)){ if(ch==='H') html+='<span class="hybrid-badge h">H</span>'; else if(ch==='B') html+='<span class="hybrid-badge b">B</span>'; else if(ch==='I') html+='<span class="hybrid-badge i">I</span>'; } return '<span style="white-space:nowrap;display:inline-flex;gap:2px;">'+html+'</span>'; }}
    ];
    // Prefer TableDisplay if available (same style as Data Filter / Enrichr / SAINT)
    if(window.TableDisplay && typeof window.TableDisplay.renderGenericTable === 'function'){
      // Use Nebula's generic table (DataTables) — numericBars off for this result table (we show badges, not bars)
      window.TableDisplay.renderGenericTable(host, {
        data: rows,
        columns: tdCols,
        pageLength: 100,
        lengthMenu: [[25,50,100,250,-1],[25,50,100,250,'All']],
        numericBars: false,
        barScaleMode: 'row',
        escapeHtml: function(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
      }).catch(function(err){
        console.warn('Hybrid TableDisplay failed, falling back', err);
        // fallback: simple html
        host.innerHTML = '<div style="padding:12px;color:#8a816c;">Table render failed: '+esc(String(err.message||err))+'</div>';
      });
    } else {
      // Fallback: simple html table with nebula-like styling (no DataTables)
      let html = '<div class="app-table-scroll" style="max-height:560px;overflow:auto;border:1px solid var(--line);background:#fbf9f4;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>';
      tdCols.forEach(c=>{ html += '<th style="font-family:monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a816c;text-align:left;padding:7px 10px;border-bottom:1.5px solid #211d17;position:sticky;top:0;background:#fbf9f4;z-index:1;">'+esc(c.title)+'</th>'; });
      html += '</tr></thead><tbody>';
      rows.forEach(r=>{
        html += '<tr>';
        tdCols.forEach(col=>{ const v=r[col.key]; html += '<td style="padding:6px 10px;border-bottom:1px solid #d5cdb9;font-family:monospace;font-size:12px;text-align:left;white-space:nowrap;">'+esc(String(v==null?'':v))+'</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      host.innerHTML = html;
    }
    if(note) note.textContent = rows.length + ' of ' + res.proteins.length + ' feature groups shown \u00b7 H = hybrid list, B = presence/absence, I = intensity (shared target FDR) \u00b7 sorted/filtered via table controls';
  }

  // --- main render ---------------------------------------------------------
  function hybridRenderResults(res){
    const q=res.options.targetFdr;
    const binEl=document.getElementById('hybridBinStats');
    if(binEl) binEl.innerHTML=[
      ['single-feature groups (exact test)', res.nSingle],
      ['multi-feature groups (bootstrap)', res.nMulti],
      ['π̂₀ (multi, Storey–Tibshirani)', res.binary.pi0Multi.toFixed(3)],
      ['operating point (FDR ≤ '+q+')', res.binary.operatingPoint.sel+' selected @ cp = '+fmtP(res.binary.operatingPoint.cp), 'fdr '+fmtP(res.binary.operatingPoint.fdr)]
    ].map(([k,v,sub])=> '<div class="hybrid-stat"><div class="k">'+k+'</div><div class="v">'+v+(sub?'<br><small>'+sub+'</small>':'')+'</div></div>').join('');
    const intEl=document.getElementById('hybridIntStats');
    if(intEl) intEl.innerHTML=[
      ['proteins with intensity p', res.intensity.nValid],
      ['π̂₀ (intensity)', res.intensity.pi0.toFixed(3)],
      ['operating point (FDR ≤ '+q+')', res.intensity.operatingPoint.sel+' selected @ cp = '+fmtP(res.intensity.operatingPoint.cp), 'fdr '+fmtP(res.intensity.operatingPoint.fdr)]
    ].map(([k,v,sub])=> '<div class="hybrid-stat"><div class="k">'+k+'</div><div class="v">'+v+(sub?'<br><small>'+sub+'</small>':'')+'</div></div>').join('');
    const hb=res.hybrid.operatingPoint;
    let selBOnly=0, selIOnly=0, selBoth=0;
    if(isFinite(hb.cp)){ for(const x of res.proteins){ const b=x.pBin <=hb.cp, i=isFinite(x.pInt)&&x.pInt<=hb.cp; if(b&&i) selBoth++; else if(b) selBOnly++; else if(i) selIOnly++; } }
    const hybEl=document.getElementById('hybridHybStats');
    if(hybEl) hybEl.innerHTML=[
      ['hybrid list (FDR ≤ '+q+')', hb.sel, 'cp = '+fmtP(hb.cp)+' · est. FDR '+fmtP(hb.fdr)],
      ['from presence/absence only', selBOnly],
      ['from intensity only', selIOnly],
      ['from both', selBoth],
      ['one-state feature groups in list', res.proteins.filter(x=> x.selHybrid && ((x.y1>0&&x.y2===0)||(x.y1===0&&x.y2>0))).length]
    ].map(([k,v,sub])=> '<div class="hybrid-stat"><div class="k">'+k+'</div><div class="v">'+v+(sub?'<br><small>'+sub+'</small>':'')+'</div></div>').join('');
    const det=document.getElementById('hybridHybDetail');
    if(det) det.innerHTML='<p class="hybrid-lead" style="margin-top:6px">At cutoff <code>cp = '+fmtP(hb.cp)+'</code>, hybrid keeps <b>'+hb.sel+' feature groups</b> with est. FDR <b>'+fmtP(hb.fdr)+'</b>. This union contains features caught by intensity, by presence/absence (including '+selBOnly+' one-state-type features the intensity stage cannot use), and by both.</p>';
    drawMainFigure(res,q);
    const single=res.proteins.filter(p=>p.single).map(p=>p.pBin);
    const multi=res.proteins.filter(p=>!p.single).map(p=>p.pBin);
    const intp=res.proteins.filter(p=>isFinite(p.pInt)).map(p=>p.pInt);
    drawHist('hybridSvgBinHist','hybridLegBinHist',[
      {name:'single-feature (exact test)',color:COLORS.binary,pts:single},
      {name:'multi-feature (bootstrap)',color:COLORS.intensity,pts:multi},
      {name:'intensity (Welch t)',color:COLORS.hybrid,pts:intp}
    ]);
    // pi0 curve: try to get from storeyPi0; H may expose storeyPi0
    try{
      const pi0res = H.storeyPi0 ? H.storeyPi0(multi) : {curve:[], pi0: res.binary.pi0Multi};
      drawPi0(document.getElementById('hybridSvgPi0'), pi0res.curve, pi0res.pi0);
    }catch(e){ const el=document.getElementById('hybridSvgPi0'); if(el) el.innerHTML='<div style="color:#8a816c;padding:12px">π₀ curve unavailable</div>'; }
    drawVolcano(res); hybridMarkVolcanoBtns();
    hybridRenderTable(res);
  }

  // --- run ---------------------------------------------------------------
  window.runHybridAnalysis = function(){
    if(!state.dataset){
      try{ hybridTrySyncFromNebula(); }catch(e){}
      if(!state.dataset) { hybridSetStatus('No dataset — load data in Data Preparation or Upload CSV', 'err'); return; }
    }
    const btn=hyEl('hybRunBtn','hybridRunBtn') || document.getElementById('hybridRunBtn');
    const st=hyEl('hybRunStatus','hybridRunStatus') || document.getElementById('hybridRunStatus');
    if(st) { st.className='hybrid-run-status'; st.textContent=''; }
    if(btn){ btn.disabled=true; btn.innerHTML='<span class="hybrid-spin"></span> computing…'; }
    const t0=performance.now();
    setTimeout(()=>{
      try{
        let ds=state.dataset;
        // If dataset is from nebula matrix, we already have correct groups; if from csv, check selectors
        const isNebula = ds.meta && ds.meta.source==='nebula-matrix';
        if(!isNebula){
          const gAel2 = hyEl('hybGroupA','hybridGroupA'), gBel2 = hyEl('hybGroupB','hybridGroupB');
          const gA=+(gAel2 && gAel2.value), gB=+(gBel2 && gBel2.value);
          if(isFinite(gA)&&isFinite(gB)&&gA!==gB){
            // Remap if user changed group indices post-load (for 2-group CSV)
            // H.parseCsv datasets store groupLabels order; we respect selector as 0/1 mapping if different
            // For simplicity, if dataset has exactly 2 labels and selector values are 0/1, we can reorder samples
            // dataset samples already have group 0/1 based on original; if user picks swapped, swap
            const needSwap = (gA===1 && gB===0);
            if(needSwap){
              ds.samples.forEach(s=>{ s.group = s.group===0?1:0; });
              const tmp=ds.groupLabels[0]; ds.groupLabels[0]=ds.groupLabels[1]; ds.groupLabels[1]=tmp;
              state.dataset=ds;
              hybridRenderWideTable(ds);
            }
          }
        }
        if(isNebula){
          // rebuild to ensure group A/B match current selector (user may have changed after Use current matrix)
          try{ const fresh=buildHybridDatasetFromNebula(); ds=fresh; state.dataset=fresh; hybridRenderWideTable(fresh); }catch(e){ /* keep old if rebuild fails */ }
        }
        const bootEl=document.getElementById('hybBoot') || document.getElementById('hybridBootstrap');
        const modeEl=document.getElementById('hybMode') || document.getElementById('hybridMode');
        const targetEl=document.getElementById('hybTarget') || document.getElementById('hybridTargetFdr');
        const centerEl=document.getElementById('hybCentering');
        const imputeEl=document.getElementById('hybImpute');
        const testEl=document.getElementById('hybTest');
        const res=H.runAnalysis(ds,{
          bootstrapIters: +(bootEl && bootEl.value) || 1000,
          bootstrapMode: (modeEl && modeEl.value) || 'structured',
          targetFdr: +(targetEl && targetEl.value) || 0.05,
          intensityCentering: (centerEl && centerEl.value) || 'none',
          intensityImpute: (imputeEl && imputeEl.value) === 'on',
          intensityTest: (testEl && testEl.value) || 'limma',
          seed: 42
        });
        state.result=res;
        const emptyEl2 = hyEl('hybEmpty','hybridEmptyState') || document.getElementById('hybridEmptyState');
        if(emptyEl2) emptyEl2.style.display='none';
        const body=hyEl('hybResults','hybridResultsBody') || document.getElementById('hybridResultsBody');
        if(body) body.style.display='block';
        try{ hybridSwitchTab('hybridTabAnalysis'); }catch(e){ try{ hybridSwitchTab('hybPanelAnalysis'); }catch(e2){} }
        hybridRenderResults(res);
        const ms=Math.round(performance.now()-t0);
        if(st){ st.textContent='done in '+ms+' ms · '+res.nProteins+' feature groups · B='+(res.options.bootstrapIters); st.className='hybrid-run-status ok'; }
        hybridSetStatus('analysed — hybrid list: '+res.hybrid.operatingPoint.sel+' feature groups @ FDR '+fmtP(res.hybrid.operatingPoint.fdr), 'live');
        // reveal animation
        const secs=document.querySelectorAll('#hybridResultsBody .hybrid-section');
        secs.forEach((s,i)=>{ s.classList.remove('in'); s.style.transitionDelay=(i*70)+'ms'; requestAnimationFrame(()=>requestAnimationFrame(()=> s.classList.add('in'))); });
      }catch(err){
        console.error(err);
        if(st){ st.textContent='error: '+err.message; st.className='hybrid-run-status err'; }
        hybridSetStatus('error — '+err.message,'err');
      }finally{
        if(btn){ btn.disabled=false; btn.textContent='Run hybrid analysis'; }
      }
    },30);
  };

  // --- exports -------------------------------------------------------------
  window.hybridExportCsv = function(){
    if(!state.result) return;
    const res=state.result;
    const gA=state.dataset.groupLabels[0], gB=state.dataset.groupLabels[1];
    const head=['feature_group','n_features','type','y_'+gA,'y_'+gB,'T_stat','p_binary','w_binary','log2FC','p_intensity','p_min','pep','fdr','sel_binary','sel_intensity','sel_hybrid'];
    const lines=[head.join(',')];
    for(const x of res.proteins){
      lines.push([x.protein,x.nPeptides,x.single?'single-feature':'multi-feature',x.y1,x.y2,isFinite(x.T)?x.T:'',x.pBin,x.single?x.w:'',isFinite(x.log2FC)?x.log2FC:'',isFinite(x.pInt)?x.pInt:'',Math.min(x.pBin,isFinite(x.pInt)?x.pInt:1),isFinite(x.pep)?x.pep:'',isFinite(x.fdr)?x.fdr:'',x.selBinary?1:0,x.selIntensity?1:0,x.selHybrid?1:0].join(','));
    }
    const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='hybrid_de_results.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  window.hybridExportMainPng = function(){ hybridSvgToPng(document.querySelector('#hybridSvgMain svg'),'hybrid_de_fig1.png'); };
  window.hybridExportVolcanoPng = function(){ hybridSvgToPng(document.querySelector('#hybridSvgVolcano svg'),'hybrid_de_volcano.png'); };
  function hybridSvgToPng(svg, filename){
    if(!svg) return;
    const clone=svg.cloneNode(true); clone.setAttribute('xmlns',SVGNS);
    const data=new XMLSerializer().serializeToString(clone);
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas'); const scale=2; canvas.width=svg.viewBox.baseVal.width*scale; canvas.height=svg.viewBox.baseVal.height*scale;
      const ctx=canvas.getContext('2d'); ctx.fillStyle='#fbf9f4'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.scale(scale,scale); ctx.drawImage(img,0,0);
      canvas.toBlob(b=>{ const url=URL.createObjectURL(b); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); });
    };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(data);
  }
  window.hybridSvgToPng = hybridSvgToPng;
  window.hybridSampleCsv = function(){
    if(!state.dataset) { hybridSetStatus('No dataset - load data in Data Preparation', 'err'); return; }
    const txt=hybridWideCsvText(state.dataset);
    const blob=new Blob([txt],{type:'text/csv'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='sample_wide.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  };

  // --- tabs inside hybrid results ------------------------------------------
  window.hybridSwitchTab = function(id){
    document.querySelectorAll('.hybrid-tab-btn').forEach(b=>{
      const on=b.getAttribute('data-hybrid-tab')===id;
      b.classList.toggle('active',on); b.setAttribute('aria-selected', on?'true':'false');
    });
    document.querySelectorAll('.hybrid-tab-panel').forEach(p=> p.classList.toggle('active', p.id===id));
    // resize plots when switching to analysis
    if(id==='hybridTabAnalysis' && state.result){
      setTimeout(()=>{ drawMainFigure(state.result, state.result.options.targetFdr); drawVolcano(state.result); },60);
    }
    // Fix DataTables pagination when result table was rendered hidden (display:none) — columns need adjust on show
    if(id==='hybridTabProteins'){
      setTimeout(()=>{
        try{
          const host=document.getElementById('hybridResultTableHost');
          const table=host&&host.querySelector('table');
          if(table && window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable && window.jQuery.fn.DataTable.isDataTable(table)){
            window.jQuery(table).DataTable().columns.adjust().draw(false);
          }
        }catch(e){}
      }, 80);
    }
  };

  // --- self-test -----------------------------------------------------------
  window.hybridRunSelfTest = function(){
    const out=document.getElementById('hybridDiagOut');
    const btn=document.getElementById('hybridBtnSelfTest');
    if(btn){ btn.disabled=true; btn.innerHTML='<span class="hybrid-spin"></span> running…'; }
    setTimeout(()=>{
      try{
        const r=H.selfTest({nProteins:500, bootstrapIters:800});
        const cards=[];
        cards.push({name:'One-state peptide (Sec. 2.3)', detail:'10 vs 0 observed, n = 10 + 10 → p = '+r.oneState.observed.toExponential(3)+' (paper: 2·B(10;10,½)·B(0;10,½) ≈ 1.9·10⁻⁶ < 10⁻⁴)', pass:r.oneState.ok});
        const c=r.calibration;
        cards.push({name:'FDR estimator conservative (Fig. 2)', detail:'simulated 30% differential mixture, '+c.points+' curve points · median (est − true) gap = '+(100*c.medianGap).toFixed(2)+' pp · operating point: est '+(c.operatingPoint?fmtP(c.operatingPoint.est):'—')+' vs true '+(c.operatingPoint?fmtP(c.operatingPoint.truth):'—')+' @ '+(c.operatingPoint?c.operatingPoint.sel:0)+' selected', pass:c.ok});
        const h=r.hybridVsComponents;
        cards.push({name:'Hybrid = union of stages (Sec. 2.6)', detail:'at cp = 0.05: binary '+h.atCp05.binary+' · intensity '+h.atCp05.intensity+' · hybrid '+h.atCp05.hybrid+' (operating points: '+h.operatingPoints.binary+' / '+h.operatingPoints.intensity+' / '+h.operatingPoints.hybrid+')', pass:h.ok});
        out.innerHTML=cards.map(c2=> '<div class="hybrid-diag-card '+(c2.pass?'pass':'fail')+'"><div class="name">'+esc(c2.name)+'</div><div class="detail">'+esc(c2.detail)+'</div><div class="verdict">'+(c2.pass?'✓ PASS':'✗ FAIL')+'</div></div>').join('') + '<p class="hybrid-table-note">self-test battery: '+(r.pass?'all checks passed':'some checks failed')+' · fresh simulated mixture, independent of the dataset above</p>';
      }catch(err){
        out.innerHTML='<div class="hybrid-diag-card fail"><div class="name">self-test</div><div class="detail">'+esc(err.message)+'</div><div class="verdict">✗ ERROR</div></div>';
      }finally{
        if(btn){ btn.disabled=false; btn.textContent='run self-test'; }
      }
    },30);
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    const fileInput=hyEl('hybFileInput','hybridFileInput') || document.getElementById('hybridFileInput');
    if(fileInput) fileInput.addEventListener('change', ev=>{
      const f=ev.target.files[0]; if(!f) return;
      const rd=new FileReader(); rd.onload=()=>{ try{ hybridLoadCsvText(String(rd.result), f.name);}catch(e){ hybridSetStatus('CSV error — '+e.message,'err'); alert('Could not parse CSV:\n'+e.message);} }; rd.readAsText(f); ev.target.value='';
    });
    const runBtn = hyEl('hybRunBtn','hybridRunBtn');
    if(runBtn) runBtn.addEventListener('click', window.runHybridAnalysis);
    const nebulaBtn = hyEl('hybBtnNebula','hybridBtnNebula');
    if(nebulaBtn) nebulaBtn.addEventListener('click', window.hybridUseCurrentMatrix);
    const uploadBtn = hyEl('hybBtnUpload','hybridBtnUpload');
    if(uploadBtn && fileInput) uploadBtn.addEventListener('click', ()=> fileInput.click());
    const csvDownloadBtn = hyEl('hybBtnCsv','hybridBtnCsv');
    if(csvDownloadBtn) csvDownloadBtn.addEventListener('click', window.hybridExportCsv);
    const wideCsvBtn = hyEl('hybBtnWideCsv','hybridBtnWideCsv');
    if(wideCsvBtn) wideCsvBtn.addEventListener('click', window.hybridExportWideCsv);
    const figPngBtn = hyEl('hybBtnFigPng','hybridBtnFigPng');
    if(figPngBtn) figPngBtn.addEventListener('click', window.hybridExportMainPng);
    const volPngBtn = hyEl('hybBtnVolPng','hybridBtnVolPng');
    if(volPngBtn) volPngBtn.addEventListener('click', window.hybridExportVolcanoPng);
    document.querySelectorAll('.hybrid-vol-btn').forEach(b=> b.addEventListener('click', ()=>{
      state.volcanoMode=b.getAttribute('data-mode'); hybridMarkVolcanoBtns(); if(state.result) drawVolcano(state.result);
    }));
    document.querySelectorAll('.hybrid-tab-btn').forEach(b=> b.addEventListener('click', ()=> window.hybridSwitchTab(b.getAttribute('data-hybrid-tab')||b.getAttribute('data-hybt'))));
    const wideFilterEl=hyEl('hybWideFilter','hybridWideFilter') || document.getElementById('hybridWideFilter');
    if(wideFilterEl) wideFilterEl.addEventListener('input', e=>{ window.hybridWideFilterInput(e.target.value); });
    const tableFilterEl = hyEl('hybTableFilter','hybridTableFilter');
    if(tableFilterEl) tableFilterEl.addEventListener('input', e=>{ state.filter=e.target.value; if(state.result) hybridRenderTable(state.result); });
    const metaColEl = hyEl('hybMetaCol','hybridMetaColumn');
    if(metaColEl) metaColEl.addEventListener('change', hybridOnMetaColumnChange);
    const gAEl2 = hyEl('hybGroupA','hybridGroupA');
    if(gAEl2) gAEl2.addEventListener('change', hybridUpdateGroupCounts);
    const gBEl2 = hyEl('hybGroupB','hybridGroupB');
    if(gBEl2) gBEl2.addEventListener('change', hybridUpdateGroupCounts);
    window.refreshHybridMetaUi = hybridRefreshMetaUi;
    window.hybridOnMetaColumnChange = hybridOnMetaColumnChange;
    hybridMarkVolcanoBtns();
    try{ hybridRefreshMetaUi(); }catch(e){}
  });

  window.HybridTab = { onOpen: function(){ try{ hybridRefreshMetaUi(); }catch(e){} } };
  window.refreshHybridMetaUi = hybridRefreshMetaUi;
  window.hybridOnMetaColumnChange = hybridOnMetaColumnChange;
  window.hybridUpdateGroupCounts = hybridUpdateGroupCounts;

  // --- inject minimal styles scoped to hybridTab --------------------------------
  const style=document.createElement('style');
  style.textContent=`
  #hybridTab .hybrid-stat-strip{display:flex;flex-wrap:wrap;gap:0;border-top:1px solid #d5cdb9;border-bottom:1px solid #d5cdb9;margin:0 0 22px}
  #hybridTab .hybrid-stat{padding:12px 22px 12px 0;margin-right:22px;border-right:1px solid #d5cdb9}
  #hybridTab .hybrid-stat:last-child{border-right:0}
  #hybridTab .hybrid-stat .k{font-size:10.5px;font-family:monospace;letter-spacing:.12em;text-transform:uppercase;color:#8a816c}
  #hybridTab .hybrid-stat .v{font-family:Georgia,serif;font-size:23px;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums}
  #hybridTab .hybrid-stat .v small{font-size:13px;color:#57503f;font-weight:400;font-style:italic}
  #hybridTab .hybrid-fig{margin:0 0 26px;border:1px solid #d5cdb9;background:#fbf9f4;padding:16px 16px 12px}
  #hybridTab .hybrid-fig svg{display:block;width:100%;height:auto}
  #hybridTab .hybrid-fig figcaption{font-size:12.5px;color:#57503f;margin-top:10px;line-height:1.5}
  #hybridTab .hybrid-legend{display:flex;gap:18px;flex-wrap:wrap;margin:2px 0 8px}
  #hybridTab .hybrid-legend .hybrid-legend-item{display:flex;align-items:center;gap:7px;font-size:12px;color:#57503f}
  #hybridTab .hybrid-swatch{width:18px;height:3px;display:inline-block}
  #hybridTab .hybrid-table-wrap{overflow-x:auto;border:1px solid #d5cdb9;background:#fbf9f4}
  #hybridTab table.hybrid-data{width:100%;border-collapse:collapse;font-size:13px}
  #hybridTab table.hybrid-data th{font-family:monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#8a816c;text-align:right;padding:7px 10px;border-bottom:1.5px solid #211d17;cursor:pointer;user-select:none;white-space:nowrap}
  #hybridTab table.hybrid-data th:first-child, #hybridTab table.hybrid-data td:first-child{text-align:left}
  #hybridTab table.hybrid-data td{text-align:right;padding:6px 10px;border-bottom:1px solid #d5cdb9;font-family:monospace;font-size:12px;white-space:nowrap}
  #hybridTab table.hybrid-data tr:hover td{background:rgba(188,68,33,.04)}
  #hybridTab table.hybrid-data td.protein{font-family:sans-serif;font-size:13px;font-weight:500}
  #hybridTab .hybrid-badge{display:inline-block;font-family:monospace;font-size:10px;letter-spacing:.06em;padding:1.5px 7px;border:1px solid;vertical-align:1px;white-space:nowrap}
  #hybridTab .hybrid-badge.b{color:#2e6b5c;border-color:#2e6b5c;background:#e0ebe4}
  #hybridTab .hybrid-badge.i{color:#3c5f8f;border-color:#3c5f8f;background:#e1e7f0}
  #hybridTab .hybrid-badge.h{color:#93321a;border-color:#bc4421;background:#f3e2da;font-weight:500}
  #hybridTab .hybrid-badge.s{color:#8a816c;border-color:#c3b99f;background:transparent}
  #hybridTab .hybrid-badge.onest{color:#fff;background:#211d17;border-color:#211d17}
  #hybridTab .hybrid-wide-wrap{max-height:600px;overflow:auto}
  #hybridTab .hybrid-wide-wrap thead{position:sticky;top:0;z-index:3}
  #hybridTab .hybrid-wide-wrap thead th{background:#fbf9f4;padding:5px 9px 6px}
  #hybridTab .hybrid-wide-wrap thead tr:nth-child(2) th{background:#fbf9f4;font-size:9px;letter-spacing:.05em;text-transform:none;padding:2px 9px 5px;border-bottom:1.5px solid #211d17}
  #hybridTab table.hybrid-wide th{cursor:default}
  #hybridTab table.hybrid-wide td{padding:4px 9px;font-size:11.5px}
  #hybridTab table.hybrid-wide th:first-child, #hybridTab table.hybrid-wide td:first-child{position:sticky;left:0;z-index:1;background:#fbf9f4;min-width:118px;max-width:118px}
  #hybridTab table.hybrid-wide.grp th:nth-child(2), #hybridTab table.hybrid-wide.grp td:nth-child(2){position:sticky;left:118px;z-index:1;background:#fbf9f4;min-width:88px;max-width:88px}
  #hybridTab table.hybrid-wide thead th:first-child{z-index:4}
  #hybridTab table.hybrid-wide thead tr:nth-child(2) th:first-child{z-index:4}
  #hybridTab table.hybrid-wide.grp thead th:nth-child(2){z-index:4}
  #hybridTab table.hybrid-wide.grp thead tr:nth-child(2) th:nth-child(2){z-index:4}
  #hybridTab table.hybrid-wide td.miss{color:#d5cdb9}
  #hybridTab table.hybrid-wide th.g0{background:linear-gradient(180deg,#e0ebe4 30%,#fbf9f4 100%)}
  #hybridTab table.hybrid-wide th.g1{background:linear-gradient(180deg,#e1e7f0 30%,#fbf9f4 100%)}
  #hybridTab table.hybrid-wide th.sep{border-left:1px solid #c3b99f}
  #hybridTab table.hybrid-wide td.sep{border-left:1px solid #c3b99f}
  #hybridTab .hybrid-section{margin-bottom:32px}
  #hybridTab .hybrid-sec-head{display:flex;align-items:baseline;gap:14px;border-bottom:1px solid #211d17;padding-bottom:10px;margin-bottom:18px}
  #hybridTab .hybrid-sec-no{font-family:monospace;font-size:12px;color:#93321a;letter-spacing:.1em}
  #hybridTab .hybrid-sec-head h2{font-family:Georgia,serif;font-weight:600;font-size:20px;margin:0;letter-spacing:-.01em}
  #hybridTab .hybrid-sec-head .tag{margin-left:auto;font-family:monospace;font-size:10.5px;color:#8a816c;letter-spacing:.08em;text-transform:uppercase}
  #hybridTab .hybrid-lead{font-family:Georgia,serif;font-style:italic;color:#57503f;font-size:14.5px;max-width:74ch;margin:0 0 18px}
  #hybridTab .hybrid-lead code{font-family:monospace;font-style:normal;font-size:.85em;background:#efe9dc;padding:1px 4px;color:#211d17}
  #hybridTab .hybrid-empty{border:1px solid #d5cdb9;background:repeating-linear-gradient(-45deg,transparent 0 14px, rgba(213,205,185,.28) 14px 15px), #fbf9f4;padding:32px}
  #hybridTab .hybrid-empty h3{font-family:Georgia,serif;font-size:20px;font-weight:600;margin:0 0 10px}
  #hybridTab .hybrid-run-status{margin-top:10px;font-family:monospace;font-size:11px;color:#57503f;min-height:16px}
  #hybridTab .hybrid-run-status.ok{color:#2e6b5c}
  #hybridTab .hybrid-run-status.err{color:#a03020}
  #hybridTab .hybrid-pill{display:inline-flex;align-items:center;gap:6px;font-family:monospace;font-size:11px;color:#57503f;border:1px solid #c3b99f;background:#efe9dc;padding:4px 10px;margin:0 6px 6px 0}
  #hybridTab .hybrid-diag-card{border:1px solid #d5cdb9;background:#fbf9f4;display:grid;grid-template-columns:150px 1fr auto;gap:0;align-items:center;margin-bottom:10px;padding:12px 16px}
  #hybridTab .hybrid-diag-card .name{font-size:13px;font-weight:500}
  #hybridTab .hybrid-diag-card .detail{font-family:monospace;font-size:11.5px;color:#57503f;overflow-wrap:anywhere}
  #hybridTab .hybrid-diag-card .verdict{font-family:monospace;font-size:11px;letter-spacing:.1em}
  #hybridTab .hybrid-diag-card.pass .verdict{color:#2e6b5c}
  #hybridTab .hybrid-diag-card.fail .verdict{color:#a03020}
  #hybridTab .hybrid-table-note{font-size:11px;color:#8a816c;margin-top:8px;font-family:monospace}
  #hybridTab .hybrid-tabs{display:flex;gap:4px;border-bottom:1.5px solid #211d17;margin:0 0 24px;flex-wrap:wrap}
  #hybridTab .hybrid-tab-btn{appearance:none;background:none;border:none;cursor:pointer;font-family:monospace;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#8a816c;padding:9px 16px 11px;position:relative;white-space:nowrap}
  #hybridTab .hybrid-tab-btn::after{content:"";position:absolute;left:16px;right:16px;bottom:-1.5px;height:2.5px;background:#bc4421;transform:scaleX(0);transition:transform .25s ease;transform-origin:left}
  #hybridTab .hybrid-tab-btn:hover{color:#211d17}
  #hybridTab .hybrid-tab-btn.active{color:#211d17;font-weight:500}
  #hybridTab .hybrid-tab-btn.active::after{transform:scaleX(1)}
  #hybridTab .hybrid-tab-panel{display:none}
  #hybridTab .hybrid-tab-panel.active{display:block;animation:fadeSwap .4s ease}
  #hybridTab .hybrid-spin{display:inline-block;width:11px;height:11px;border:2px solid #fbf9f4;border-top-color:#211d17;border-radius:50%;animation:hybridSpin .7s linear infinite}
  @keyframes hybridSpin{to{transform:rotate(360deg)}}
  #hybridTab .hybrid-reveal{opacity:0;transform:translateY(10px)}
  #hybridTab .hybrid-reveal.in{opacity:1;transform:none;transition:opacity .55s ease,transform .55s cubic-bezier(.22,.9,.28,1)}
  `;
  document.head.appendChild(style);
})();
