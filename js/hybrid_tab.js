/* app.js — UI layer for the Hybrid DE application.
 * Depends on hybrid-core.js (window.HybridProteomics). */
(function () {
  'use strict';
  const H = window.HybridProteomics;
  const $ = sel => {
    let el = document.querySelector(sel);
    if (el) return el;
    const map = {
      '#svgMain': '#hybFigMain',
      '#legMain': '#hybMainLegend',
      '#svgBinHist': '#hybFigBinHist',
      '#legBinHist': '#hybBinHistLegend',
      '#svgVolcano': '#hybFigVolcano',
      '#legVolcano': '#hybVolLegend',
      '#svgOnestScatter': '#hybFigOnestScatter',
      '#svgOnestVolA': '#hybFigOnestA',
      '#svgOnestVolB': '#hybFigOnestB',
      '#svgHybridScatter': '#hybFigHybridScatter',
      '#legHybridScatter': '#hybHybridLegend',
      '#hybridScatterCards': '#hybScatterCards',
      '#hybridScatterNote': '#hybScatterNote',
      '#protHead': '#hybHead',
      '#protBody': '#hybBody',
      '#ftSearch': '#hybTableFilter',
      '#ftSearchInfo': '#hybTableCount',
      '#colHelp': '#hybColHelp',
      '#tableNote': '#hybTableNote',
      '#emptyState': '#hybEmpty',
      '#resultsBody': '#hybResults',
      '#btnRun': '#hybRunBtn',
      '#runStatus': '#hybRunStatus',
      '#selGrpA': '#hybGroupA',
      '#selGrpB': '#hybGroupB',
      '#oBoot': '#hybBoot',
      '#oMode': '#hybMode',
      '#oTarget': '#hybTarget',
      '#oImpute': '#hybImpute',
      '#oTest': '#hybTest',
      '#statusChip': '#hybStatusChip',
      '#statusText': '#hybStatusText',
      '#dsTag': '#hybDsTag',
      '#dsStats': '#hybDsStats',
      '#dsWarnings': '#hybDsWarnings',
      '#binStats': '#hybBinStats',
      '#intStats': '#hybIntStats',
      '#hybStats': '#hybStats',
      '#hybDetail': '#hybDetail',
      '#wideHead': '#hybWideHead',
      '#wideBody': '#hybWideBody',
      '#wideStats': '#hybWideStats',
      '#wideNote': '#hybWideNote',
      '#btnUpload': '#hybBtnUpload',
      '#fileInput': '#hybFileInput',
      '#btnSelfTest': '#hybBtnSelfTest',
      '#btnCsv': '#hybBtnCsv',
      '#btnPng': '#hybBtnFigPng',
      '#btnVolPng': '#hybBtnVolPng',
      '#btnWideCsv': '#hybBtnWideCsv',
      '#btnWideCsv2': '#hybBtnWideCsv2',
      '#wideFilter': '#hybWideFilter',
      '#btnSampleCsv': '#hybSampleCsv'
    };
    if (map[sel]) {
      const mapped = document.querySelector(map[sel]);
      if (mapped) return mapped;
    }
    // file:// safety + layout port: return a detached dummy so callers can safely
    // set .textContent/.innerHTML/.classList without throwing when a panel id is
    // temporarily absent (e.g., Volcano/Hybrid scatter moved). Real elements are
    // still preferred when present.
    const dummy = document.createElement('div');
    dummy.style.display = 'none';
    dummy.setAttribute('data-hyb-dummy', sel);
    return dummy;
  };
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const COLORS = {
    binary: getComputedStyle(document.documentElement).getPropertyValue('--binary').trim() || '#2e6b5c',
    intensity: getComputedStyle(document.documentElement).getPropertyValue('--intensity').trim() || '#3c5f8f',
    hybrid: getComputedStyle(document.documentElement).getPropertyValue('--hybrid').trim() || '#bc4421',
    ink: '#211d17', ink2: '#57503f', ink3: '#8a816c', line: '#d5cdb9', paper: '#fbf9f4'
  };

  const state = {
    dataset: null,
    warnings: [],
    result: null,
    sort: { key: 'pMin', dir: 1 },
    filter: '',
    volcanoMode: 'significance',
    onestMode: 'all',
    histAxis: 'log',
    histBins: 10,
    mainAxis: 'fit',
    wideFilter: ''
  };
  window.hybridState = state;
  function hyEl(hyb, hybrid){ return document.getElementById(hyb) || document.getElementById(hybrid); }
  function hybridNormalizeKey(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
  function hybridFindMetaHeader(aliases){
    if(!window.metaData || !Array.isArray(window.metaData.headers)) return null;
    const keys=aliases.map(hybridNormalizeKey);
    for(const h of window.metaData.headers) if(keys.includes(hybridNormalizeKey(h))) return h;
    return null;
  }
  function hybridBuildMetaBySampleId(){
    const map=new Map();
    if(!window.metaData || !Array.isArray(window.metaData.rows)) return map;
    const sidHeader=hybridFindMetaHeader(['Sample_ID','SampleID'])||'Sample_ID';
    const asText=v=>String(v==null?'':v).trim();
    window.metaData.rows.forEach(r=>{ const sid=asText(r[sidHeader]); if(sid) map.set(sid,r); });
    return map;
  }
  function buildHybridDatasetFromNebula(){
    const cd=window.currentData;
    if(!cd || !Array.isArray(cd.dataMatrix) || !Array.isArray(cd.columnHeaders) || !Array.isArray(cd.rowIds)) throw new Error('No matrix loaded. Load data in Data Preparation first.');
    const groupColEl=hyEl('hybMetaCol','hybridMetaColumn')|| hyEl('hybridMetaColumn','hybMetaCol');
    const gAEl=hyEl('hybGroupA','hybridGroupA'), gBEl=hyEl('hybGroupB','hybridGroupB');
    const groupCol=groupColEl?groupColEl.value:''; const valA=gAEl?gAEl.value:''; const valB=gBEl?gBEl.value:'';
    if(!groupCol) throw new Error('Choose a "Group by" meta column.'); if(!valA||!valB) throw new Error('Choose both Group A and Group B.'); if(valA===valB) throw new Error('Group A and Group B must be different.');
    const metaMap=hybridBuildMetaBySampleId(); const asText=v=>String(v==null?'':v).trim();
    const samples=[]; const idxA=[], idxB=[];
    cd.columnHeaders.forEach((sampleId,colIdx)=>{
      const sid=asText(sampleId); let row=metaMap.get(sid);
      if(!row && typeof resolveMetaRowForMatrixColumn==='function'){
        const sidHeader=hybridFindMetaHeader(['Sample_ID','SampleID'])||'Sample_ID';
        const resolved=resolveMetaRowForMatrixColumn(window.metaData.rows, metaMap, sidHeader, colIdx, sampleId); row=resolved&&resolved.row;
      }
      if(!row) return; const v=asText(row[groupCol]);
      if(v===valA){ samples.push({id:sid,group:0,colIdx}); idxA.push(colIdx); } else if(v===valB){ samples.push({id:sid,group:1,colIdx}); idxB.push(colIdx); }
    });
    if(idxA.length<2||idxB.length<2) throw new Error('Each group needs at least 2 samples with matching Sample_ID in the meta table. Found '+idxA.length+' in A and '+idxB.length+' in B.');
    const samplesForHybrid=samples.map(s=>({id:s.id,group:s.group})); const peptides=[], proteins=[];
    for(let r=0;r<cd.rowIds.length;r++){
      const featId=String(cd.rowIds[r]==null?'row_'+(r+1):cd.rowIds[r]).trim()||('row_'+(r+1)); let pid=featId; let dup=1; while(peptides.some(p=>p.id===pid)) pid=featId+'_'+(++dup);
      const values={}; const row=cd.dataMatrix[r]||[];
      samples.forEach(s=>{ const raw=row[s.colIdx]; if(raw!=null&&isFinite(raw)&&raw!==''&&Number(raw)>0){ const v=Number(raw); if(isFinite(v)&&v>0) values[s.id]=v; } });
      peptides.push({id:pid,protein:pid,values}); proteins.push({id:pid,peptideIds:[pid]});
    }
    if(!peptides.some(p=>Object.keys(p.values).length>0)) throw new Error('No observed intensities found for the selected groups (all values zero/missing).');
    return {samples:samplesForHybrid,peptides,proteins,groupLabels:[valA,valB],meta:{source:'nebula-matrix'}};
  }
  function hybridRefreshMetaUi(){
    const sel=hyEl('hybMetaCol','hybridMetaColumn')|| hyEl('hybridMetaColumn','hybMetaCol'); if(!sel) return; const prev=sel.value; sel.innerHTML='';
    if(!window.metaData||!Array.isArray(window.metaData.headers)||window.metaData.headers.length===0){ const o=document.createElement('option');o.value='';o.textContent='(No meta table)';sel.appendChild(o); try{hybridOnMetaColumnChange();}catch(e){} return; }
    const cols=window.metaData.headers.filter(h=>h&&String(h).trim()!==''&&h!=='Sample_ID');
    if(cols.length===0){ const o=document.createElement('option');o.value='';o.textContent='(No grouping columns)';sel.appendChild(o); }else{ cols.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);}); if(prev&&cols.includes(prev)) sel.value=prev; }
    try{hybridOnMetaColumnChange();}catch(e){} try{hybridTrySyncFromNebula();}catch(e){}
  }
  function hybridOnMetaColumnChange(){
    const metaCol=(hyEl('hybMetaCol','hybridMetaColumn')&&hyEl('hybMetaCol','hybridMetaColumn').value); const ga=hyEl('hybGroupA','hybridGroupA'), gb=hyEl('hybGroupB','hybridGroupB'); const countsEl=hyEl('hybGroupCounts','hybridGroupCounts'); if(!ga||!gb) return; const prevA=ga.value, prevB=gb.value; ga.innerHTML=''; gb.innerHTML='';
    if(!metaCol||!window.currentData||!Array.isArray(window.currentData.columnHeaders)){ if(countsEl) countsEl.textContent=''; hybridUpdateGroupCounts(); return; }
    const metaMap=hybridBuildMetaBySampleId(); const asText=v=>String(v==null?'':v).trim(); const set=new Set();
    window.currentData.columnHeaders.forEach(sid=>{ const row=metaMap.get(asText(sid)); if(!row){ if(typeof resolveMetaRowForMatrixColumn==='function'){ const sidHeader=hybridFindMetaHeader(['Sample_ID','SampleID'])||'Sample_ID'; const resolved=resolveMetaRowForMatrixColumn(window.metaData.rows, metaMap, sidHeader, window.currentData.columnHeaders.indexOf(sid), sid); const r2=resolved&&resolved.row; if(r2){ const v2=asText(r2[metaCol]); if(v2) set.add(v2); } } return; } const v=asText(row[metaCol]); if(v) set.add(v); });
    const values=Array.from(set).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
    values.forEach(v=>{ const oa=document.createElement('option');oa.value=v;oa.textContent=v; ga.appendChild(oa.cloneNode(true)); gb.appendChild(oa.cloneNode(true)); });
    if(values.length>=1){ if(prevA&&values.includes(prevA)) ga.value=prevA; else ga.selectedIndex=0; if(prevB&&values.includes(prevB)) gb.value=prevB; else gb.selectedIndex=values.length>=2?1:0; }
    if(ga.value===gb.value&&values.length>=2) gb.selectedIndex=ga.selectedIndex===0?1:0; hybridUpdateGroupCounts(); try{hybridTrySyncFromNebula();}catch(e){}
  }
  function hybridUpdateGroupCounts(){
    const el=hyEl('hybGroupCounts','hybridGroupCounts'); if(!el) return; const metaEl2=hyEl('hybMetaCol','hybridMetaColumn'); const metaCol=metaEl2&&metaEl2.value; if(!metaCol||!window.currentData||!Array.isArray(window.currentData.columnHeaders)){ el.textContent=''; return; }
    const valA=(hyEl('hybGroupA','hybridGroupA')&&hyEl('hybGroupA','hybridGroupA').value); const valB=(hyEl('hybGroupB','hybridGroupB')&&hyEl('hybGroupB','hybridGroupB').value); const metaMap=hybridBuildMetaBySampleId(); const asText=v=>String(v==null?'':v).trim(); let nA=0,nB=0;
    window.currentData.columnHeaders.forEach(sid=>{ const row=metaMap.get(asText(sid)); let v=row?asText(row[metaCol]):''; if(!v&&typeof resolveMetaRowForMatrixColumn==='function'){ const sidHeader=hybridFindMetaHeader(['Sample_ID','SampleID'])||'Sample_ID'; const resolved=resolveMetaRowForMatrixColumn(window.metaData.rows, metaMap, sidHeader, window.currentData.columnHeaders.indexOf(sid), sid); const r2=resolved&&resolved.row; v=r2?asText(r2[metaCol]):''; } if(v===valA) nA++; else if(v===valB) nB++; });
    el.innerHTML='Group A <strong>'+esc(valA||'—')+'</strong>: n='+nA+' &nbsp;|&nbsp; Group B <strong>'+esc(valB||'—')+'</strong>: n='+nB; if(nA<2||nB<2) el.innerHTML+='<br><span style="color:#c62828;">Each group needs at least 2 samples.</span>';
    try{ if(!state._hybridSyncPending){ state._hybridSyncPending=true; setTimeout(()=>{ state._hybridSyncPending=false; try{ hybridTrySyncFromNebula(); }catch(e){} },0);} }catch(e){}
  }
  function hybridTrySyncFromNebula(){ try{ const cd=window.currentData; if(!cd||!Array.isArray(cd.dataMatrix)||!cd.columnHeaders) return; const mc=hyEl('hybMetaCol','hybridMetaColumn'); if(!mc||!mc.value) return; const ga=hyEl('hybGroupA','hybridGroupA'), gb=hyEl('hybGroupB','hybridGroupB'); if(!ga||!ga.value||!gb||!gb.value||ga.value===gb.value) return; const ds=buildHybridDatasetFromNebula(); const cur=state.dataset; if(cur&&cur.meta&&cur.meta.source==='nebula-matrix'&&cur.groupLabels[0]===ds.groupLabels[0]&&cur.groupLabels[1]===ds.groupLabels[1]&&cur.samples.length===ds.samples.length){ hybridRenderDataset(ds,[]); hybridSetStatus('ready — '+ds.proteins.length+' features · '+ds.samples.length+' samples ('+ds.groupLabels[0]+' vs '+ds.groupLabels[1]+') — from current matrix','live'); return; } state.dataset=ds; state.warnings=[]; state.result=null; hybridRenderDataset(ds,[]); hybridSetStatus('ready — '+ds.proteins.length+' features · '+ds.samples.length+' samples ('+ds.groupLabels[0]+' vs '+ds.groupLabels[1]+') — from current matrix','live'); const emptyEl=hyEl('hybEmpty','hybridEmptyState')||document.getElementById('hybridEmptyState'); if(emptyEl) emptyEl.style.display='none'; }catch(e){} }
  window.hybridUseCurrentMatrix=function(){ try{ const ds=buildHybridDatasetFromNebula(); state.dataset=ds; state.warnings=[]; state.result=null; hybridRenderDataset(ds,[]); hybridSetStatus('ready — '+ds.proteins.length+' features · '+ds.samples.length+' samples ('+ds.groupLabels[0]+' vs '+ds.groupLabels[1]+')','live'); const st=hyEl('hybRunStatus','hybridRunStatus'); if(st) st.textContent=''; const emptyEl2=hyEl('hybEmpty','hybridEmptyState'); if(emptyEl2) emptyEl2.style.display='none'; const body2=hyEl('hybResults','hybridResultsBody')||document.getElementById('hybridResultsBody'); if(body2) body2.style.display='none'; }catch(e){ hybridSetStatus('error — '+e.message,'err'); alert(e.message); } };
  function hybridSetStatus(text,cls){ const el=hyEl('hybStatusText','hybridStatusText')||document.getElementById('hybridStatusText'); if(el) el.textContent=text; const chip=hyEl('hybStatusChip','hybridStatusChip')||document.getElementById('hybridStatusChip'); if(chip) chip.classList.toggle('live',cls==='live'); const alt=hyEl('hybridStatusText','hybStatusText'); if(alt&&alt!==el) alt.textContent=text; }

  /* ==========================================================
   * Number formatting
   * ========================================================== */
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
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ==========================================================
   * Minimal SVG chart library
   * ========================================================== */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(SVGNS, name);
    for (const k in attrs || {}) {
      const v = attrs[k];
      /* var() values are CSS custom-property refs (tokens from
         css/font_tokens.css) — presentation ATTRIBUTES can't resolve them,
         so route those through the element's inline style instead. */
      if (typeof v === 'string' && v.indexOf('var(') === 0) el.style.setProperty(k, v);
      else el.setAttribute(k, v);
    }
    if (parent) parent.appendChild(el);
    return el;
  }
  function niceTicks(min, max, n) {
    if (!isFinite(min) || !isFinite(max) || min === max) return [min];
    const span = max - min;
    const step0 = span / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    let step = mag;
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (step0 <= m * mag) { step = m * mag; break; }
    }
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
    return ticks;
  }
  function logTicks(min, max) {
    const ticks = [];
    let e = Math.floor(Math.log10(min));
    while (Math.pow(10, e) <= max * 1.0001) {
      const v = Math.pow(10, e);
      if (v >= min * 0.9999) ticks.push(v);
      e++;
    }
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
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img', preserveAspectRatio: 'xMidYMid meet' }, container);
    const g = svgEl('g', {}, svg);
    const x = v => m.l + (v - m.xmin) / (m.xmax - m.xmin) * (w - m.l - m.r);
    const y = v => h - m.b - (v - m.ymin) / (m.ymax - m.ymin) * (h - m.t - m.b);
    return { svg, g, x, y, w, h, m };
  }
  function axes(c, opts) {
    const { g, x, y, h, m } = c;
    const X = opts.xLog ? logTicks(m.xmin, m.xmax) : niceTicks(m.xmin, m.xmax, opts.xn || 6);
    const Y = opts.yLog ? logTicks(m.ymin, m.ymax) : niceTicks(m.ymin, m.ymax, opts.yn || 5);
    // gridlines
    for (const t of Y) {
      if (t < m.ymin * (opts.yLog ? 0.999 : 1) - 1e-12) continue;
      svgEl('line', { x1: m.l, x2: c.w - m.r, y1: y(t), y2: y(t), stroke: COLORS.line, 'stroke-width': 0.7 }, g);
      svgEl('text', { x: m.l - 7, y: y(t) + 3.5, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, g).textContent = fmtTick(t, opts.yLog);
    }
    for (const t of X) {
      if (t < m.xmin * (opts.xLog ? 0.999 : 1) - 1e-12) continue;
      svgEl('line', { x1: x(t), x2: x(t), y1: h - m.b, y2: h - m.b + 4, stroke: COLORS.ink3, 'stroke-width': 0.7 }, g);
      svgEl('text', { x: x(t), y: h - m.b + 16, 'text-anchor': 'middle', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, g).textContent = fmtTick(t, opts.xLog);
    }
    // frame
    svgEl('line', { x1: m.l, x2: c.w - m.r, y1: h - m.b, y2: h - m.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, g);
    svgEl('line', { x1: m.l, x2: m.l, y1: m.t, y2: h - m.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, g);
    if (opts.xLabel) svgEl('text', { x: (m.l + c.w - m.r) / 2, y: h - 2, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)' }, g).textContent = opts.xLabel;
    if (opts.yLabel) {
      const t = svgEl('text', { x: 12, y: (m.t + h - m.b) / 2, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)', transform: `rotate(-90 12 ${(m.t + h - m.b) / 2})` }, g);
      t.textContent = opts.yLabel;
    }
  }
  function lineSeries(c, pts, color, opts) {
    const { g, x, y } = c;
    opts = opts || {};
    const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + x(p[0]).toFixed(2) + ' ' + y(p[1]).toFixed(2)).join(' ');
    const path = svgEl('path', {
      d, fill: 'none', stroke: color, 'stroke-width': opts.width || 1.8,
      'stroke-dasharray': opts.dash || 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }, g);
    if (opts.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const len = path.getTotalLength();
      path.style.strokeDasharray = len + ' ' + (opts.dash || '');
      path.style.strokeDashoffset = len;
      path.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(.3,.8,.3,1)';
      requestAnimationFrame(() => requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; }));
      path.style.strokeDasharray = opts.dash || 'none';
    }
    return path;
  }
  function dot(c, px, py, r, color, opts) {
    return svgEl('circle', {
      cx: x2(c, px), cy: y2(c, py), r: r || 3.4,
      fill: color || COLORS.ink, stroke: COLORS.paper, 'stroke-width': 1.4,
      opacity: (opts && opts.opacity) || 1
    }, c.g);
  }
  function x2(c, v) { return c.x(v); }
  function y2(c, v) { return c.y(v); }
  function vline(c, v, color, dash) {
    return svgEl('line', {
      x1: c.x(v), x2: c.x(v), y1: c.m.t, y2: c.h - c.m.b,
      stroke: color || COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': dash || '4 3'
    }, c.g);
  }
  function hline(c, v, color, dash) {
    return svgEl('line', {
      x1: c.m.l, x2: c.w - c.m.r, y1: c.y(v), y2: c.y(v),
      stroke: color || COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': dash || '4 3'
    }, c.g);
  }
  function text(c, px, py, str, opts) {
    const t = svgEl('text', {
      x: c.x(px), y: c.y(py), 'font-size': (opts && opts.size) || 11,
      fill: (opts && opts.color) || COLORS.ink2,
      'text-anchor': (opts && opts.anchor) || 'start',
      'font-family': 'var(--font-body, sans-serif)',
      'font-style': (opts && opts.italic) ? 'italic' : 'normal',
      'font-weight': (opts && opts.bold) || 400
    }, c.g);
    t.textContent = str;
    return t;
  }

  /* Hover tooltip across a set of series */
  function attachHover(container, svg, seriesDefs) {
    // seriesDefs: [{name, color, pts:[{x,y,label}], data}]
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;pointer-events:none;background:#211d17;color:#f6f2ea;font-family:var(--font-mono);font-size:var(--fs-xs);padding:7px 10px;line-height:1.5;opacity:0;transition:opacity .12s ease;z-index:30;white-space:nowrap;';
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
          const px = (p.px);
          if (!isFinite(px)) continue;
          const d = Math.abs(px - mx);
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

  /* ==========================================================
   * Figure 1 — selected proteins vs estimated FDR
   * ========================================================== */
  function drawMainFigure(res, targetFdr) {
    const container = $('#svgMain');
    const W = 860, Hh = 380, M = { l: 58, r: 24, t: 18, b: 46 };
    // collect series (x = estimated FDR, y = #selected)
    const series = [];
    function addSeries(name, color, pts) {
      const valid = pts.filter(p => isFinite(p.x) && isFinite(p.y) && p.x > 0);
      if (!valid.length) return;
      series.push({ name, color, pts: valid });
    }
    addSeries('presence/absence', COLORS.binary, res.binary.curves.map(c => ({ x: c.fdrMix, y: c.sel, cp: c.cp })));
    addSeries('intensity', COLORS.intensity, res.intensity.curves.map(c => ({ x: c.fdr, y: c.sel, cp: c.cp })));
    addSeries('hybrid (Sec. 2.6)', COLORS.hybrid, res.hybrid.curves.map(c => ({ x: c.fdr, y: c.sel, cp: c.cp })));

    const yMax = Math.max.apply(null, series.flatMap(s => s.pts.map(p => p.y))) * 1.12;
    // x-axis mode: fit (log, zoomed to the curves) | full (log, right edge at FDR = 1)
    // | linear (0–1; small FDRs compress against the y-axis there)
    const axisMode = state.mainAxis === 'linear' ? 'linear' : (state.mainAxis === 'full' ? 'full' : 'fit');
    const fdrs = series.flatMap(s => s.pts.map(p => p.x));
    const fMin = Math.min.apply(null, fdrs), fMax = Math.max.apply(null, fdrs);
    let xMin, xMax;
    if (axisMode === 'linear') {
      xMin = 0; xMax = 1;
    } else if (axisMode === 'full') {
      const eMin = Math.max(-6, Math.floor(Math.log10(Math.max(fMin, 1e-9))));
      xMin = Math.pow(10, eMin); xMax = 1;
    } else {
      xMin = Math.max(1e-4, fMin * 0.8);
      xMax = Math.min(1.5, fMax * 1.15);
    }
    const isLog = axisMode !== 'linear';
    const c = baseChart(container, W, Hh, { l: M.l, r: M.r, t: M.t, b: M.b, xmin: 0, xmax: 1, ymin: 0, ymax: yMax });
    const plotW = W - M.l - M.r;
    const xL = v => isLog
      ? c.m.l + (Math.log10(v) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin)) * plotW
      : c.m.l + (v / xMax) * plotW;
    const xTicks = [];
    if (isLog) {
      for (let e = Math.ceil(Math.log10(xMin) - 1e-9); e <= Math.floor(Math.log10(xMax) + 1e-9); e++) xTicks.push(Math.pow(10, e));
    } else {
      for (let k = 0; k <= 10; k++) xTicks.push(k / 10);
    }
    // gridlines + axes
    const Yt = niceTicks(0, yMax, 5);
    for (const t of Yt) {
      svgEl('line', { x1: M.l, x2: W - M.r, y1: c.y(t), y2: c.y(t), stroke: COLORS.line, 'stroke-width': 0.7 }, c.g);
      svgEl('text', { x: M.l - 7, y: c.y(t) + 3.5, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, c.g).textContent = String(Math.round(t));
    }
    for (const t of xTicks) {
      if (t < xMin * 0.99 || t > xMax * 1.01) continue;
      svgEl('line', { x1: xL(t), x2: xL(t), y1: Hh - M.b, y2: Hh - M.b + 4, stroke: COLORS.ink3, 'stroke-width': 0.7 }, c.g);
      svgEl('text', { x: xL(t), y: Hh - M.b + 16, 'text-anchor': 'middle', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, c.g).textContent = isLog ? fmtTick(t, true) : t.toFixed(1);
    }
    svgEl('line', { x1: M.l, x2: W - M.r, y1: Hh - M.b, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, c.g);
    svgEl('line', { x1: M.l, x2: M.l, y1: M.t, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, c.g);
    svgEl('text', { x: (M.l + W - M.r) / 2, y: Hh - 3, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)' }, c.g).textContent = isLog ? 'estimated FDR (log scale, mode: ' + axisMode + ')' : 'estimated FDR (linear 0–1)';
    const yl = svgEl('text', { x: 13, y: (M.t + Hh - M.b) / 2, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)', transform: `rotate(-90 13 ${(M.t + Hh - M.b) / 2})` }, c.g);
    yl.textContent = '# selected proteins';

    // diagonal reference (FDR = true selection fraction? no — reference line est FDR = cp)
    // draw series
    const hoverPts = [];
    for (const s of series) {
      const pts = s.pts.slice().sort((a, b) => a.x - b.x).map(p => [p.x, p.y]);
      const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + xL(p[0]).toFixed(2) + ' ' + c.y(p[1]).toFixed(2)).join(' ');
      const path = svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.name.startsWith('hybrid') ? 2.4 : 1.7, 'stroke-linejoin': 'round' }, c.g);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
        path.style.transition = 'stroke-dashoffset 1s cubic-bezier(.3,.8,.3,1)';
        requestAnimationFrame(() => requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; }));
        path.style.strokeDasharray = 'none';
      }
      for (const p of s.pts) {
        hoverPts.push({ px: xL(p.x), py: c.y(p.y), name: s.name, color: s.color, label: 'FDR ' + fmtP(p.x) + ' · ' + p.y + ' selected · cp=' + fmtP(p.cp) });
      }
    }
    // target FDR line + operating dots
    if (targetFdr >= xMin && targetFdr <= xMax) {
      vlineLog(c, xL, targetFdr, COLORS.ink);
      text2(c, xL(targetFdr) + 5, c.m.t + 12, 'target FDR = ' + targetFdr, { size: 10.5 });
    }
    const ops = [
      { s: res.binary.operatingPoint, color: COLORS.binary, name: 'presence/absence' },
      { s: res.intensity.operatingPoint, color: COLORS.intensity, name: 'intensity' },
      { s: res.hybrid.operatingPoint, color: COLORS.hybrid, name: 'hybrid' }
    ];
    for (const o of ops) {
      if (!isFinite(o.s.cp) || !isFinite(o.s.fdr) || o.s.sel == null) continue;
      if (o.s.fdr < xMin || o.s.fdr > xMax || o.s.sel > yMax) continue;
      svgEl('circle', { cx: xL(o.s.fdr), cy: c.y(o.s.sel), r: 4.2, fill: o.color, stroke: COLORS.paper, 'stroke-width': 1.6 }, c.g);
      hoverPts.push({ px: xL(o.s.fdr), py: c.y(o.s.sel), name: o.name, color: o.color, label: 'operating point: FDR ' + fmtP(o.s.fdr) + ' · ' + o.s.sel + ' selected · cp=' + fmtP(o.s.cp) });
    }
    attachHover(container, c.svg, [{ name: 'hover', color: '#fff', pts: hoverPts }]);

    // legend
    const leg = $('#legMain');
    leg.innerHTML = ['presence/absence', 'intensity', 'hybrid (Sec. 2.6)'].map((n, i) =>
      '<span class="item"><span class="swatch" style="background:' + [COLORS.binary, COLORS.intensity, COLORS.hybrid][i] + '"></span>' + n + '</span>').join('') +
      '<span class="item"><span class="swatch" style="background:' + COLORS.ink + ';opacity:.5"></span>target FDR</span>';
  }
  function vlineLog(c, xL, v, color) {
    svgEl('line', { x1: xL(v), x2: xL(v), y1: c.m.t, y2: c.h - c.m.b, stroke: color, 'stroke-width': 1.1, 'stroke-dasharray': '5 4', opacity: 0.75 }, c.g);
  }
  function text2(c, xAbs, yAbs, str, opts) {
    const t = svgEl('text', { x: xAbs, y: yAbs, 'font-size': (opts && opts.size) || 11, fill: (opts && opts.color) || COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)' }, c.g);
    t.textContent = str;
    return t;
  }

  /* ==========================================================
   * Figure 2 — p-value histograms
   * ========================================================== */
  function drawHist(containerId, legendId, datasets, axis, nBins) {
    const container = $(containerId);
    const W = 860, Hh = 260, M = { l: 52, r: 20, t: 14, b: 42 };
    const n = Math.max(2, Math.floor(nBins) || 10);
    axis = axis === 'linear' ? 'linear' : 'log';
    // p = 0 is allowed: an underflowed value ("smaller than 1e-308"), bin it as the smallest bucket (log axis clamps to the leftmost slot, linear axis to the first slot)
    const good = p => isFinite(p) && p >= 0 && p <= 1;
    // u-space is always [0,1]; log axis maps p → (log10 p − eMin)/(−eMin)
    const minP = Math.min.apply(null, datasets.flatMap(d => d.pts.filter(p => good(p))).concat([1]));
    const eMin = axis === 'log' ? Math.max(-25, Math.floor(Math.log10(Math.max(minP * 0.9, 1e-9)))) : null;
    const u = p => axis === 'log' ? (Math.log10(p) - eMin) / (0 - eMin) : p;
    const idxOf = p => Math.max(0, Math.min(n - 1, Math.floor(u(p) * n)));
    const bins = datasets.map(d => new Array(n).fill(0));
    datasets.forEach((d, di) => {
      for (const p of d.pts) if (good(p)) bins[di][idxOf(p)]++;
    });
    const yMax = Math.max(1, ...bins.flat()) * 1.15;
    const c = baseChart(container, W, Hh, { l: M.l, r: M.r, t: M.t, b: M.b, xmin: 0, xmax: 1, ymin: 0, ymax: yMax });
    // y grid + labels
    for (const t of niceTicks(0, yMax, 5)) {
      svgEl('line', { x1: M.l, x2: W - M.r, y1: c.y(t), y2: c.y(t), stroke: COLORS.line, 'stroke-width': 0.7 }, c.g);
      svgEl('text', { x: M.l - 7, y: c.y(t) + 3.5, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, c.g).textContent = String(Math.round(t));
    }
    // frame
    svgEl('line', { x1: M.l, x2: W - M.r, y1: Hh - M.b, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, c.g);
    svgEl('line', { x1: M.l, x2: M.l, y1: M.t, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, c.g);
    // n equal-width slots; series that actually have data share each slot
    // side by side (an empty series takes no width); bars fill the shared
    // slot (92%)
    const slot = 1 / n;
    const plotW = W - M.l - M.r;
    const nD = Math.max(1, datasets.filter(d => d.pts.some(p => good(p))).length);
    let a = 0;
    datasets.forEach((d, di) => {
      const has = d.pts.some(p => good(p));
      if (!has) return;
      const pos = a++;
      for (let i = 0; i < n; i++) {
        const v = bins[di][i];
        if (!v) continue;
        svgEl('rect', {
          x: c.x(i * slot + (pos / nD) * slot + slot * 0.02 / nD),
          y: c.y(v), width: Math.max(2, slot * 0.92 / nD * plotW), height: c.y(0) - c.y(v),
          fill: d.color, opacity: 0.85
        }, c.g);
      }
    });
    // x ticks: decade boundaries (log) or 0.1 grid (linear)
    const ticks = [];
    if (axis === 'log') {
      for (let e = eMin; e <= 0; e++) ticks.push([(e - eMin) / (0 - eMin), e < 0 ? '1e' + e : '1']);
    } else {
      for (let k = 0; k <= 10; k++) ticks.push([k / 10, (k / 10).toFixed(1)]);
    }
    for (const [t, lab] of ticks) {
      svgEl('line', { x1: c.x(t), x2: c.x(t), y1: Hh - M.b, y2: Hh - M.b + 4, stroke: COLORS.ink3, 'stroke-width': 0.7 }, c.g);
      svgEl('text', { x: c.x(t), y: Hh - M.b + 16, 'text-anchor': 'middle', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, c.g).textContent = lab;
    }
    svgEl('text', { x: (M.l + W - M.r) / 2, y: Hh - 2, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)' }, c.g)
      .textContent = axis === 'log' ? ('p-value (log scale, ' + n + ' bins)') : 'p-value (linear 0–1, ' + n + ' bins of ' + (1 / n).toFixed(2) + ')';
    if ($(legendId)) {
      $(legendId).innerHTML = datasets.map(d =>
        '<span class="item"><span class="swatch" style="background:' + d.color + '"></span>' + d.name + ' <span style="color:' + COLORS.ink3 + '">(n=' + d.pts.filter(isFinite).length + ')</span></span>').join('');
    }
  }

  // redraw Fig. 2 with the current axis / bin selection (after a run exists)
  function drawFig2() {
    const res = state.result;
    if (!res) return;
    const single = res.proteins.filter(p => p.single).map(p => p.pBin);
    const multi = res.proteins.filter(p => !p.single).map(p => p.pBin);
    const intp = res.proteins.filter(p => isFinite(p.pInt)).map(p => p.pInt);
    const intTestName = res.intensity.test === 'welch' ? 'Welch t' : 'limma moderated t';
    drawHist('#svgBinHist', '#legBinHist', [
      { name: 'single-feature (exact test)', color: COLORS.binary, pts: single },
      { name: 'multi-feature (bootstrap)', color: COLORS.intensity, pts: multi },
      { name: 'intensity (' + intTestName + ')', color: COLORS.hybrid, pts: intp }
    ], state.histAxis, state.histBins);
  }

  /* ==========================================================
   * Figure 3 — pi0 curve
   * ========================================================== */
  /* ==========================================================
   * Rendering
   * ========================================================== */
  /* ==========================================================
    * Figure 4 — volcano plot (fold change vs -log10 p)
    * ========================================================== */
  const VOL_MODES = {
    significance: {
      // Hybrid significance scatter:
      //   x = quantitative effect  (log₂FC_quant, intensity stage)
      //   y = qualitative effect   (ΔPresence = P(present, cond₁) − P(present, cond₂))
      //   colour = which stage(s) call the feature significant:
      //     NS/NS            → background (gray)
      //     quant sig / NS   → intensity colour (quantitative-only)
      //     NS / qual sig    → binary colour   (qualitative-only)
      //     sig / sig        → both colours    (both)
      color: COLORS.hybrid,
      colorOf: x => {
        if (x.selBinary && x.selIntensity) return { fill: COLORS.binary, ring: COLORS.intensity };
        if (x.selBinary) return { fill: COLORS.binary };
        if (x.selIntensity) return { fill: COLORS.intensity };
        return { fill: COLORS.binary };
      },
      label: 'hybrid significance',
      selLabel: 'significant',
      sel: x => x.selBinary || x.selIntensity,
      x: x => (isFinite(x.log2FC) ? x.log2FC : null),
      xEdge: x => ((x.y1 > 0 && x.y2 === 0) ? 1 : (x.y1 === 0 && x.y2 > 0) ? -1 : 0),
      y: (x, R) => x.y1 / R.n1 - x.y2 / R.n2,
      xLabel: 'log₂FC (quantitative)',
      yLabel: 'Δ presence',
      signedY: true,
      legB: 'qualitative-only (presence/absence)',
      legI: 'quantitative-only (intensity)',
      legBoth: 'both stages',
      legGuide: 'Δ presence = 0 / |FC| = 1',
      skip: x => false,
      tip: (x, R) => 'significance: ' + ([x.selIntensity ? 'quantitative' : null, x.selBinary ? 'qualitative' : null].filter(Boolean).join(' + ') || '— (NS in both)') +
        '<br>log₂FC ' + (isFinite(x.log2FC) ? x.log2FC.toFixed(2) : '— (no quant contrast)') +
        '<br>Δ presence ' + ((x.y1 / R.n1) - (x.y2 / R.n2)).toFixed(3) + '  (present ' + x.y1 + '/' + R.n1 + ' vs ' + x.y2 + '/' + R.n2 + ')' +
        '<br>p_bin ' + fmtP(x.pBin) + ' · p_int ' + (isFinite(x.pInt) ? fmtP(x.pInt) : '—')
    },
    hybrid: {
      color: COLORS.hybrid, label: 'hybrid (min p)',
      // selected points are coloured by ORIGIN (hybrid = union of the two stages):
      //   binary colour  = selected via presence/absence only
      //   intensity colour = selected via the intensity stage only
      //   both colours   = selected by both stages (binary fill + intensity ring)
      //   hybrid colour  = corner case: min-p passed the hybrid cp but neither stage cp did
      colorOf: x => {
        if (x.selBinary && x.selIntensity) return { fill: COLORS.binary, ring: COLORS.intensity };
        if (x.selBinary) return { fill: COLORS.binary };
        if (x.selIntensity) return { fill: COLORS.intensity };
        return { fill: COLORS.hybrid };
      },
      x: x => (isFinite(x.log2FC) ? x.log2FC : null),
      xEdge: x => ((x.y1 > 0 && x.y2 === 0) ? 1 : (x.y1 === 0 && x.y2 > 0) ? -1 : 0),
      y: x => -Math.log10(Math.min(x.pBin, isFinite(x.pInt) ? x.pInt : 1)),
      sel: x => x.selHybrid,
      xLabel: 'log₂FC (intensity stage)',
      skip: x => false,
      tip: x => 'origin: ' + [x.selBinary ? 'binary' : null, x.selIntensity ? 'intensity' : null, x.selHybrid && !x.selBinary && !x.selIntensity ? 'hybrid only' : null].filter(Boolean).join(' + ') +
        '<br>log₂FC ' + (isFinite(x.log2FC) ? x.log2FC.toFixed(2) : '— (no usable contrast)') +
        '<br>p_bin ' + fmtP(x.pBin) + ' · p_int ' + (isFinite(x.pInt) ? fmtP(x.pInt) : '—') +
        '<br>min p ' + fmtP(Math.min(x.pBin, isFinite(x.pInt) ? x.pInt : 1))
    },
    binary: {
      color: COLORS.binary, label: 'presence/absence',
      x: x => Math.log2((x.y1 + 1) / (x.y2 + 1)),
      xEdge: () => 0,
      y: x => -Math.log10(x.pBin),
      sel: x => x.selBinary,
      xLabel: 'log₂ presence ratio (y₁+1)/(y₂+1)',
      skip: x => false,
      tip: x => 'ratio ' + (x.y1 + 1) + ':' + (x.y2 + 1) + ' → log₂ ' + Math.log2((x.y1 + 1) / (x.y2 + 1)).toFixed(2) + '<br>p_bin ' + fmtP(x.pBin)
    },
    intensity: {
      color: COLORS.intensity, label: 'intensity',
      x: x => (isFinite(x.log2FC) ? x.log2FC : null),
      xEdge: () => 0,
      y: x => (isFinite(x.pInt) ? -Math.log10(x.pInt) : null),
      sel: x => x.selIntensity,
      xLabel: 'log₂FC (intensity stage)',
      skip: x => !isFinite(x.pInt),
      tip: x => 'log₂FC ' + x.log2FC.toFixed(2) + '<br>p_int ' + fmtP(x.pInt)
    },
  };

  function drawVolcano(res) {
    const def = VOL_MODES[state.volcanoMode] || VOL_MODES.hybrid;
    const container = $('#svgVolcano');
    container.innerHTML = '';
    const W = 860, Hh = 430, M = { l: 62, r: 24, t: 20, b: 48 };
    const c = baseChart(container, W, Hh, { l: M.l, r: M.r, t: M.t, b: M.b, xmin: -1, xmax: 1, ymin: 0, ymax: 1 });
    const pts = [];
    for (const x of res.proteins) {
      if (def.skip(x)) continue;
      const yRaw = def.y(x, res);
      if (yRaw == null || isNaN(yRaw)) continue;      // truly unusable (no p-value at all)
      if (isFinite(yRaw)) { pts.push({ x, xv: def.x(x), yv: yRaw, sel: def.sel(x) }); }
      else { pts.push({ x, xv: def.x(x), yv: 30, sel: def.sel(x), cap: true }); } // p underflowed to 0 → cap at −log10(1e-30)
    }
    const g = c.g;
    if (!pts.length) {
      svgEl('text', { x: W / 2, y: Hh / 2, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink3 }, g).textContent = 'no proteins with a usable value';
      $('#legVolcano').innerHTML = '';
      return;
    }
    // robust symmetric x range from the 99% quantile of |x|
    const fx = pts.filter(p => isFinite(p.xv)).map(p => Math.abs(p.xv)).sort((a, b) => a - b);
    const xq = fx.length ? fx[Math.floor(0.99 * fx.length)] : 4;
    const xMax = Math.min(14, Math.max(2.5, xq * 1.15));
    // y range: one-sided 0..yMax (p-scale modes) or symmetric ±yHi (ΔPresence)
    const signed = !!def.signedY;
    const fy = pts.map(p => p.yv).sort((a, b) => a - b);
    let yLo = 0, yMax;
    if (signed) {
      const ay = fy.map(v => Math.abs(v)).sort((a, b) => a - b);
      const yq2 = ay.length ? ay[Math.floor(0.99 * ay.length)] : 0.5;
      yMax = Math.max(0.6, yq2 * 1.15);
      yLo = -yMax;
    } else {
      const yq = fy[Math.floor(0.99 * fy.length)];
      yMax = Math.max(4, Math.max(yq * 1.12, -Math.log10(res.options.targetFdr) * 1.35));
    }
    const X = v => M.l + (v + xMax) / (2 * xMax) * (W - M.l - M.r);
    const Y = v => Hh - M.b - (v - yLo) / (yMax - yLo) * (Hh - M.t - M.b);
    // axes (own scales, same style as the other figures)
    const xTicks = niceTicks(-xMax, xMax, 7);
    for (const t of xTicks) {
      svgEl('line', { x1: X(t), x2: X(t), y1: Hh - M.b, y2: Hh - M.b + 4, stroke: COLORS.ink3, 'stroke-width': 0.7 }, g);
      svgEl('text', { x: X(t), y: Hh - M.b + 16, 'text-anchor': 'middle', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, g).textContent = String(Math.round(t * 10) / 10);
    }
    for (const t of niceTicks(yLo, yMax, 5)) {
      if (t > yMax) continue;
      svgEl('line', { x1: M.l, x2: W - M.r, y1: Y(t), y2: Y(t), stroke: COLORS.line, 'stroke-width': 0.7 }, g);
      svgEl('text', { x: M.l - 7, y: Y(t) + 3.5, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, g).textContent = (signed ? String(Math.round(t * 20) / 20) : String(Math.round(t)));
    }
    svgEl('line', { x1: M.l, x2: W - M.r, y1: Hh - M.b, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, g);
    svgEl('line', { x1: M.l, x2: M.l, y1: M.t, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.2 }, g);
    svgEl('line', { x1: X(0), x2: X(0), y1: M.t, y2: Hh - M.b, stroke: COLORS.line, 'stroke-width': 1 }, g);
    svgEl('text', { x: (M.l + W - M.r) / 2, y: Hh - 3, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)' }, g).textContent = def.xLabel;
    const yl = svgEl('text', { x: 13, y: (M.t + Hh - M.b) / 2, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)', transform: `rotate(-90 13 ${(M.t + Hh - M.b) / 2})` }, g);
    yl.textContent = def.yLabel || '−log₁₀ p';
    // guides: |FC| = 1 always; target-FDR line + quadrant shading for p-scale
    // modes; a ΔPresence = 0 reference line for the significant-mode
    const fcL = X(-1), fcR = X(1);
    if (!signed) {
      const pCut = -Math.log10(res.options.targetFdr);
      svgEl('rect', { x: Math.min(fcL, X(0)), y: M.t, width: Math.abs(X(0) - fcL), height: Math.max(0, Y(Math.min(pCut, yMax)) - M.t), fill: def.color, opacity: 0.05 }, g);
      svgEl('rect', { x: Math.min(X(0), fcR), y: M.t, width: Math.abs(fcR - X(0)), height: Math.max(0, Y(Math.min(pCut, yMax)) - M.t), fill: def.color, opacity: 0.05 }, g);
      if (pCut <= yMax) {
        const yCut = Y(pCut);
        svgEl('line', { x1: M.l, x2: W - M.r, y1: yCut, y2: yCut, stroke: COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
        svgEl('text', { x: W - M.r - 4, y: yCut - 5, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, g).textContent = 'target FDR ' + fmtP(res.options.targetFdr);
      }
    } else {
      const yZero = Y(0);
      svgEl('line', { x1: M.l, x2: W - M.r, y1: yZero, y2: yZero, stroke: COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
      svgEl('text', { x: W - M.r - 4, y: yZero - 5, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, g).textContent = 'Δ presence = 0';
    }
    svgEl('line', { x1: fcL, x2: fcL, y1: M.t, y2: Hh - M.b, stroke: COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
    svgEl('line', { x1: fcR, x2: fcR, y1: M.t, y2: Hh - M.b, stroke: COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g);
    // points — unselected first, selected on top.
    // The discrete p-value / FC structure often puts several features on the EXACT
    // same (x, y) coordinate (one-state rows in particular, where FC and p are
    // determined by k alone). Lay every point out first, then fan out the
    // colliding selected points in a deterministic phyllotaxis (sunflower)
    // pattern so that each selected feature is individually visible.
    const laid = [];
    for (const p of pts) {
      const ex = isFinite(p.xv) ? p.xv : def.xEdge(p.x) * xMax * 0.985;
      laid.push({ p, px: X(ex), py: Y(Math.max(yLo, Math.min(yMax, p.yv))), sel: p.sel, cap: p.cap });
    }
    // deterministic de-stacking: no two selected dots share a (0.4px-quantized)
    // pixel center — the discrete p-value/FC structure otherwise puts several
    // features on the exact same coordinate (one-state rows in particular).
    // The first point of each collision set keeps its true position; the rest
    // fan out along a golden-angle spiral until they find a free spot.
    const preKeys = new Set(laid.filter(d => d.sel).map(d => Math.round(d.px / 0.4) + '|' + Math.round(d.py / 0.4)));
    const fanned = laid.filter(d => d.sel).length - preKeys.size;
    let fanClusters = 0;
    if (fanned > 0) fanClusters = fanned;
    {
      const used = new Set();
      const K = (x, y) => Math.round(x / 0.4) + '|' + Math.round(y / 0.4);
      for (const d of laid) {
        if (!d.sel) continue;
        let px = d.px, py = d.py, t = 0;
        while (used.has(K(px, py)) && t < 80) {
          t++;
          const r = 9 + 2.3 * (t - 1);
          px = Math.max(M.l + 6, Math.min(W - M.r - 8, d.px + r * Math.cos(t * 2.399963229728653321)));
          py = Math.max(M.t + 8, Math.min(Hh - M.b - 5, d.py + r * Math.sin(t * 2.399963229728653321)));
        }
        used.add(K(px, py));
        d.px = px; d.py = py;
      }
    }
    const drawn = [];
    const placeEl = (d, r, fill, stroke, sw, op) => {
      const el = svgEl('circle', { cx: d.px.toFixed(1), cy: d.py.toFixed(1), r, fill, stroke, 'stroke-width': sw, opacity: op }, g);
      drawn.push({ px: d.px, py: d.py, p: d.p, el });
    };
    let nSelUp = 0, nSelDown = 0, nEdge = 0;
    for (const d of laid) if (!d.sel) placeEl(d, 3.4, '#cdc4ae', COLORS.paper, 0.8, 0.7);
    for (const d of laid) {
      if (!d.sel) continue;
      if (def.colorOf) { const cc = def.colorOf(d.p.x); placeEl(d, 4.6, cc.fill, cc.ring || '#ffffff', cc.ring ? 2 : 1.5, 0.95); }
      else placeEl(d, 4.6, def.color, '#ffffff', 1.5, 0.95);
      if (!isFinite(d.p.xv)) nEdge++;
      else if (d.p.xv > 1) nSelUp++;
      else if (d.p.xv < -1) nSelDown++;
    }
    // hover — 2-D nearest point
    const svg = c.svg;
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;pointer-events:none;background:#211d17;color:#f6f2ea;font-family:var(--font-mono);font-size:var(--fs-xs);padding:7px 10px;line-height:1.5;opacity:0;transition:opacity .12s ease;z-index:30;white-space:nowrap;';
    container.style.position = 'relative';
    container.appendChild(tip);
    const overlay = svgEl('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: 'transparent' }, svg);
    let lastEl = null;
    const clearLast = () => {
      if (!lastEl) return;
      lastEl.setAttribute('r', lastEl.getAttribute('data-r'));
      lastEl.setAttribute('stroke', lastEl.getAttribute('data-stroke'));
      lastEl = null;
    };
    overlay.addEventListener('mousemove', ev => {
      const rect = svg.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width);
      const my = (ev.clientY - rect.top) * (svg.viewBox.baseVal.height / rect.height);
      let best = null;
      for (const d of drawn) {
        const dist = Math.hypot(d.px - mx, d.py - my);
        if (!best || dist < best.dist) best = { dist, d };
      }
      clearLast();
      if (!best || best.dist > 18) { tip.style.opacity = 0; return; }
      const { d } = best;
      d.el.setAttribute('data-r', d.el.getAttribute('r'));
      d.el.setAttribute('data-stroke', d.el.getAttribute('stroke'));
      d.el.setAttribute('r', Number(d.el.getAttribute('r')) + 2);
      d.el.setAttribute('stroke', COLORS.ink);
      lastEl = d.el;
      tip.style.opacity = 1;
      tip.innerHTML = '<b style="color:' + (typeof def.color === 'function' ? COLORS.hybrid : def.color) + '">' + esc(d.p.x.protein) + '</b><br>' + def.tip(d.p.x, res) +
        '<br>' + (d.p.sel ? '✓ ' + (def.selLabel || 'selected') + ' (' + def.label + ')' : (def.selLabel || 'selected') + ' in neither stage') +
        (d.p.x.single ? '<br>single-feature group' : '') +
        (((d.p.x.y1 > 0 && d.p.x.y2 === 0) || (d.p.x.y1 === 0 && d.p.x.y2 > 0)) ? '<br>one-state type' : '');
      const lx = (d.px / svg.viewBox.baseVal.width) * rect.width;
      const ly = (d.py / svg.viewBox.baseVal.height) * rect.height;
      tip.style.left = Math.min(lx + 14, rect.width - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.max(4, ly - tip.offsetHeight - 10) + 'px';
    });
    overlay.addEventListener('mouseleave', () => { tip.style.opacity = 0; clearLast(); });
    // legend
    const leg = $('#legVolcano');
    if (leg) {
      const nSel = pts.filter(p => p.sel).length;
      const nUn = pts.length - nSel;
      let items;
      if (def.colorOf) {
        const cB = pts.filter(p => p.sel && p.x.selBinary && !p.x.selIntensity).length;
        const cI = pts.filter(p => p.sel && p.x.selIntensity && !p.x.selBinary).length;
        const cBoth = pts.filter(p => p.sel && p.x.selBinary && p.x.selIntensity).length;
        const cH = pts.filter(p => p.sel && p.x.selHybrid && !p.x.selBinary && !p.x.selIntensity).length;
        items =
          '<span class="item"><span class="swatch" style="background:linear-gradient(90deg,' + COLORS.binary + ' 50%,' + COLORS.intensity + ' 50%)"></span>' + (def.selLabel || 'selected') + ' (' + nSel + ')</span>' +
          '<span class="item"><span class="swatch" style="background:' + COLORS.binary + ';border-radius:50%"></span>' + (def.legB || 'binary origin') + ' (' + cB + ')</span>' +
          '<span class="item"><span class="swatch" style="background:' + COLORS.intensity + ';border-radius:50%"></span>' + (def.legI || 'intensity origin') + ' (' + cI + ')</span>' +
          (cBoth ? '<span class="item"><span class="swatch" style="background:' + COLORS.binary + ';border:2px solid ' + COLORS.intensity + ';border-radius:50%"></span>' + (def.legBoth || 'both origins') + ' (' + cBoth + ')</span>' : '') +
          (cH ? '<span class="item"><span class="swatch" style="background:' + COLORS.hybrid + ';border-radius:50%"></span>' + (def.legH || 'hybrid only') + ' (' + cH + ')</span>' : '') +
          '<span class="item"><span class="swatch" style="background:#cdc4ae;border-radius:50%"></span>' + (def.selLabel ? 'neither stage (' + nUn + ')' : 'not selected (' + nUn + ')') + '</span>';
      } else {
        items =
          '<span class="item"><span class="swatch" style="background:' + def.color + ';border-radius:50%"></span>selected (' + nSel + ')</span>' +
          '<span class="item"><span class="swatch" style="background:#cdc4ae;border-radius:50%"></span>not selected (' + nUn + ')</span>';
      }
      if (nEdge) items += '<span class="item"><span class="swatch" style="background:transparent;border:2px solid ' + def.color + ';border-radius:50%"></span>no usable FC — edge (observed at most once, ' + nEdge + ')</span>';
      const nCap = pts.filter(p => p.sel && p.cap).length;
      if (nCap) items += '<span class="item"><span class="swatch" style="background:' + def.color + ';border-radius:50%"></span>p = 0 (underflow) — capped at 10<sup>−30</sup>, drawn at the top (' + nCap + ')</span>';
      if (fanClusters) items += '<span class="item" style="color:' + COLORS.ink3 + '">' + fanClusters + ' point' + (fanClusters > 1 ? 's' : '') + ' shared a coordinate → fanned out</span>';
      items += '<span class="item"><span class="swatch" style="border-bottom:2px dashed ' + COLORS.ink3 + ';height:1px;width:18px"></span>' + (def.legGuide || 'target FDR / |FC| = 1') + '</span>';
      items += '<span class="item" style="color:' + COLORS.ink3 + '">up-selected ' + nSelUp + ' · down-selected ' + nSelDown + '</span>';
      leg.innerHTML = items;
    }
  }

  /* ---------- Fig 5 — one-state coordinate comparison ---------- */
  function pearson(a, b) {
    const n = a.length;
    if (n < 3) return { r: NaN, slope: NaN, intercept: NaN };
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let sab = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; sa += da * da; sb += db * db; }
    const r = (sa > 0 && sb > 0) ? sab / Math.sqrt(sa * sb) : NaN;
    const slope = sa > 0 ? sab / sa : NaN;
    return { r, slope, intercept: mb - slope * ma };
  }
  function ranks(v) {
    const order = v.map((x, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Array(v.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]] === v[order[i]]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]] = avg;
      i = j + 1;
    }
    return r;
  }

  // Fig 5: for one-state rows the two volcano x-coordinates are structurally
  // independent — presence ratio log2(k+1) uses only the count k, while the
  // intensity FC (mean-min)+1.5*IQR uses only the value spread. Measure the
  // empirical correlation and show the same points in both coordinate systems.
  // Fig. 5 modes — which membership to highlight among the one-state points
  // (the correlation is always computed over ALL one-state points shown):
  const ON_MODES = {
    all:       { color: COLORS.ink,       label: 'all',       sel: x => true },
    hybrid:    { color: COLORS.hybrid,    label: 'hybrid',    sel: x => x.selHybrid },
    binary:    { color: COLORS.binary,    label: 'binary',    sel: x => x.selBinary },
    intensity: { color: COLORS.intensity, label: 'intensity', sel: x => x.selIntensity }
  };
  function drawOnestCompare(res) {
    const def = ON_MODES[state.onestMode] || ON_MODES.all;
    const isOnest = x => (x.y1 > 0 && x.y2 === 0) || (x.y1 === 0 && x.y2 > 0);
    const ones = res.proteins.filter(x =>
      isOnest(x) && isFinite(x.log2FC) && isFinite(x.pBin) && isFinite(x.pInt));
    const elS = $('#svgOnestScatter'), elA = $('#svgOnestVolA'), elB = $('#svgOnestVolB');
    if (elA) elA.innerHTML = '';
    if (elB) elB.innerHTML = '';
    const note = (el, html) => { if (el) el.innerHTML = '<p class="lead" style="color:' + COLORS.ink3 + '">' + html + '</p>'; };
    // one-panel volcano (presence ratio or intensity axis vs −log10 p)
    const mini = (rows, el, xval, xLabel, title) => {
      if (!el) return;
      const W = 320, Hh = 316, M = { l: 46, r: 12, t: 42, b: 46 };
      const xf = rows.map(p => Math.abs(xval(p))).sort((a, b) => a - b);
      const xMax = Math.min(12, Math.max(2.5, xf[Math.floor(0.99 * xf.length)] * 1.15));
      const yf = rows.map(p => p.yv).sort((a, b) => a - b);
      const yMax = Math.max(3, yf[Math.floor(0.99 * yf.length)] * 1.12);
      const c = baseChart(el, W, Hh, { l: M.l, r: M.r, t: M.t, b: M.b, xmin: -xMax, xmax: xMax, ymin: 0, ymax: yMax });
      axes(c, { xLabel, yLabel: '−log₁₀ p', xn: 6, yn: 5 });
      svgEl('text', { x: W / 2, y: 15, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink, 'font-family': 'var(--font-body, sans-serif)' }, c.g).textContent = title;
      for (const gx of [-1, 1]) svgEl('line', { x1: c.x(gx), x2: c.x(gx), y1: M.t, y2: Hh - M.b, stroke: COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, c.g);
      const pCut = -Math.log10(res.options.targetFdr);
      if (pCut <= yMax) svgEl('line', { x1: M.l, x2: W - M.r, y1: c.y(pCut), y2: c.y(pCut), stroke: COLORS.ink3, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, c.g);
      // many one-state rows share the exact same (x, y) — de-stack colliding
      // selected points (golden-angle spiral search for a free spot) so all
      // stay individually visible
      const laid = rows.map(p => ({ p, px: c.x(Math.max(-xMax, Math.min(xMax, xval(p)))), py: c.y(Math.min(p.yv, yMax)) }));
      {
        const used = new Set();
        const K = (x, y) => Math.round(x / 0.4) + '|' + Math.round(y / 0.4);
        for (const d of laid) {
          if (!d.p.sel) continue;
          let px = d.px, py = d.py, t = 0;
          while (used.has(K(px, py)) && t < 80) {
            t++;
            const r = 8 + 2.2 * (t - 1);
            px = Math.max(M.l + 5, Math.min(W - M.r - 6, d.px + r * Math.cos(t * 2.399963229728653321)));
            py = Math.max(M.t + 6, Math.min(Hh - M.b - 4, d.py + r * Math.sin(t * 2.399963229728653321)));
          }
          used.add(K(px, py));
          d.px = px; d.py = py;
        }
      }
      for (const d of laid) if (!d.p.sel) svgEl('circle', { cx: d.px.toFixed(1), cy: d.py.toFixed(1), r: 3.2, fill: '#cdc4ae', stroke: COLORS.paper, 'stroke-width': 1.4, opacity: 0.75 }, c.g);
      for (const d of laid) if (d.p.sel) svgEl('circle', { cx: d.px.toFixed(1), cy: d.py.toFixed(1), r: 4.2, fill: def.color, stroke: COLORS.paper, 'stroke-width': 1.4 }, c.g);
      svgEl('text', { x: M.l + 8, y: M.t - 6, 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, c.g)
        .textContent = (def.label === 'all' ? 'all ' + rows.length : def.label + ' ' + rows.filter(p => p.sel).length + '/' + rows.length);
    };
    if (ones.length < 3) {
      // No intensity contrast for one-state rows (imputation OFF by default):
      // still show the presence/absence volcano — it needs only the counts.
      const rowsB = res.proteins.filter(x => isOnest(x) && isFinite(x.pBin)).map(x => {
        const k = Math.max(x.y1, x.y2);
        const dir = x.y1 > x.y2 ? 1 : -1;
        return { id: x.protein, k, dir, pres: dir * Math.log2(k + 1), yv: Math.min(30, -Math.log10(Math.max(x.pBin, 1e-300))), sel: def.sel(x) };
      });
      if (rowsB.length >= 3) {
        note(elS, 'With missing-value imputation OFF (default), one-state features are observed in only one comparison group and therefore have <b>no intensity contrast</b> — the intensity panel and the correlation above need that axis. The panel on the right shows the one-state points in <b>presence/absence coordinates</b> instead. Set <b>intensity stage: missing values → impute</b> in the Analysis panel (or run with <code>intensityImpute: true</code>) to unlock the intensity panels — the one-state volcano below then switches to intensity coordinates.');
        mini(rowsB, elA, p => p.pres, 'log₂ presence ratio  (k+1) : 1', 'presence/absence coordinates (binary p)');
        note(elB, 'needs the intensity axis — one-state features have no intensity contrast with imputation OFF; enable “intensity stage: missing values → impute”.');
        return;
      }
      note(elS, 'only ' + ones.length + ' one-state feature group' + (ones.length === 1 ? ' has' : 's have') + ' a usable intensity contrast — nothing to correlate. With missing-value imputation OFF (default), one-state features are observed in only one comparison group and therefore have no testable intensity contrast; set <b>intensity stage: missing values → impute</b> in the Analysis panel (or run with <code>intensityImpute: true</code>) to plot them here.');
      return;
    }
    const rows = ones.map(x => {
      const k = Math.max(x.y1, x.y2);
      const dir = x.y1 > x.y2 ? 1 : -1;
      return {
        id: x.protein, k, dir,
        pres: dir * Math.log2(k + 1),              // presence axis: log2((k+1):1)
        fc: x.log2FC,                              // intensity axis (signed)
        yv: Math.min(30, -Math.log10(Math.max(Math.min(x.pBin, x.pInt), 1e-300))),
        sel: def.sel(x)
      };
    });
    const xs = rows.map(p => p.pres), ys = rows.map(p => p.fc);
    const { r, slope, intercept } = pearson(xs, ys);
    const rho = pearson(ranks(xs), ranks(ys)).r;
    const fmtR = v => isFinite(v) ? (v < 0 ? '−' + Math.abs(v).toFixed(2) : v.toFixed(2)) : 'n/a';

    // Panel 1 — scatter of the two x-coordinates (the asked correlation)
    if (elS) {
      const W = 340, Hh = 316, M = { l: 48, r: 12, t: 40, b: 46 };
      const qAbs = a => a.map(Math.abs).sort((p, q) => p - q)[Math.floor(0.99 * a.length)];
      const xMax = Math.min(12, Math.max(2.5, qAbs(xs) * 1.15));
      const yMax = Math.min(14, Math.max(2.5, qAbs(ys) * 1.15));
      const c = baseChart(elS, W, Hh, { l: M.l, r: M.r, t: M.t, b: M.b, xmin: -xMax, xmax: xMax, ymin: -yMax, ymax: yMax });
      axes(c, { xLabel: 'log₂ presence ratio  (k+1) : 1', yLabel: 'log₂FC (intensity)', xn: 6, yn: 6 });
      svgEl('line', { x1: c.x(0), x2: c.x(0), y1: M.t, y2: Hh - M.b, stroke: COLORS.line, 'stroke-width': 1 }, c.g);
      svgEl('line', { x1: M.l, x2: W - M.r, y1: c.y(0), y2: c.y(0), stroke: COLORS.line, 'stroke-width': 1 }, c.g);
      if (isFinite(slope)) {
        const xa = -xMax * 0.94, xb = xMax * 0.94;
        const cl = v => Math.max(-yMax * 0.99, Math.min(yMax * 0.99, v));
        svgEl('line', { x1: c.x(xa), y1: c.y(cl(intercept + slope * xa)), x2: c.x(xb), y2: c.y(cl(intercept + slope * xb)), stroke: COLORS.ink3, 'stroke-width': 1.4, 'stroke-dasharray': '5 3' }, c.g);
      }
      for (const p of rows) if (!p.sel) dot(c, p.pres, Math.max(-yMax, Math.min(yMax, p.fc)), 3.2, '#cdc4ae', { opacity: 0.75 });
      for (const p of rows) if (p.sel) dot(c, p.pres, Math.max(-yMax, Math.min(yMax, p.fc)), 4.2, def.color);
      svgEl('text', { x: M.l + 8, y: M.t + 12, 'font-size': 11, fill: COLORS.ink, 'font-family': 'var(--font-mono, monospace)' }, c.g)
        .textContent = 'N ' + rows.length + ' · Pearson r ' + fmtR(r) + ' · Spearman ρ ' + fmtR(rho);
    }

    // Panels 2/3 — the same points in each coordinate system
    mini(rows, elA, p => p.pres, 'log₂ presence ratio  (k+1) : 1', 'presence/absence coordinates');
    mini(rows, elB, p => p.fc, 'log₂FC (intensity)', 'intensity / hybrid coordinates');
  }

  function drawHybridScatter(res) {
    const container = document.getElementById('hybFigHybridScatter') || document.getElementById('svgHybridScatter') || document.getElementById('hybridScatter') || document.getElementById('svgHybridScatterWrap');
    const legEl = document.getElementById('hybHybridLegend') || document.getElementById('legHybridScatter') || document.getElementById('hybridLegend');
    const cardsEl = document.getElementById('hybScatterCards') || document.getElementById('hybridScatterCards') || document.getElementById('hybridScatterCardsWrap');
    const noteEl = document.getElementById('hybScatterNote') || document.getElementById('hybridScatterNote');
    if (!container) return;
    container.innerHTML = '';
    if (legEl) legEl.innerHTML = '';
    if (cardsEl) cardsEl.innerHTML = '';
    if (!res || !res.proteins) {
      container.innerHTML = '<p class="lead" style="color:' + COLORS.ink3 + '">Run hybrid analysis to see the scatter.</p>';
      return;
    }
    const W = 920, Hh = 540, M = { l: 64, r: 220, t: 44, b: 56 };
    const xMin = -4, xMax = 4, yMin = -1.0, yMax = 1.0;
    const X = v => M.l + (v - xMin) / (xMax - xMin) * (W - M.l - M.r);
    const Y = v => Hh - M.b - (v - yMin) / (yMax - yMin) * (Hh - M.t - M.b);
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + Hh, width: '100%', role: 'img', preserveAspectRatio: 'xMidYMid meet' }, container);
    const g = svgEl('g', {}, svg);
    const n1 = (isFinite(res.n1) ? res.n1 : (state.dataset ? state.dataset.samples.filter(s => s.group === 0).length : 10));
    const n2 = (isFinite(res.n2) ? res.n2 : (state.dataset ? state.dataset.samples.filter(s => s.group === 1).length : 10));
    const pts = res.proteins.map(p => {
      const dP = (p.y1 / n1) - (p.y2 / n2);
      const fc = p.log2FC;
      const xv = isFinite(fc) ? fc : ((p.y1 > 0 && p.y2 === 0) ? xMax * 0.97 : (p.y1 === 0 && p.y2 > 0) ? xMin * 0.97 : 0);
      const yv = dP;
      const sigQ = !!p.selIntensity;
      const sigP = !!p.selBinary;
      let cat = 'ns';
      if (sigQ && sigP) {
        const s = Math.sign(isFinite(fc) ? fc : (p.y1 - p.y2));
        const sy = Math.sign(dP);
        cat = (s !== 0 && sy !== 0 && s === sy) ? 'both_conc' : 'both_disc';
      } else if (sigQ && !sigP) cat = 'quant';
      else if (!sigQ && sigP) cat = 'qual';
      return { p, xv, yv, dP, cat, sigQ, sigP };
    });
    const col = {
      both_conc: '#2e7b5f',
      both_disc: '#e67e22',
      quant: '#c94a3d',
      qual: '#2a5db0',
      ns: '#b8b3a3'
    };
    const bg = {
      qual: 'rgba(42,93,176,0.08)',
      both_conc_t: 'rgba(46,123,95,0.09)',
      both_disc_o: 'rgba(230,126,34,0.09)',
      quant: 'rgba(201,74,61,0.09)'
    };
    svgEl('rect', { x: X(-4), y: Y(1.0), width: X(-1) - X(-4), height: Y(0.3) - Y(1.0), fill: bg.qual, rx: 4 }, g);
    svgEl('rect', { x: X(1), y: Y(1.0), width: X(4) - X(1), height: Y(0.3) - Y(1.0), fill: bg.both_conc_t, rx: 4 }, g);
    svgEl('rect', { x: X(-4), y: Y(-0.3), width: X(-1) - X(-4), height: Y(-1.0) - Y(-0.3), fill: bg.both_disc_o, rx: 4 }, g);
    svgEl('rect', { x: X(1), y: Y(-0.3), width: X(4) - X(1), height: Y(-1.0) - Y(-0.3), fill: bg.quant, rx: 4 }, g);
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      svgEl('line', { x1: M.l, x2: W - M.r, y1: Y(t), y2: Y(t), stroke: COLORS.line, 'stroke-width': t === 0 ? 1.1 : 0.7, 'stroke-dasharray': t === 0 ? '6 4' : 'none', opacity: t === 0 ? 0.9 : 0.6 }, g);
      svgEl('text', { x: M.l - 8, y: Y(t) + 3.5, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.ink3, 'font-family': 'var(--font-mono, monospace)' }, g).textContent = t.toFixed(1);
    }
    for (const t of [-4, -2, -1, 0, 1, 2, 4]) {
      const isGuide = Math.abs(t) === 1;
      svgEl('line', { x1: X(t), x2: X(t), y1: M.t, y2: Hh - M.b, stroke: isGuide ? COLORS.ink3 : COLORS.line, 'stroke-width': isGuide ? 1.1 : 0.7, 'stroke-dasharray': isGuide ? '6 4' : 'none', opacity: isGuide ? 0.9 : 0.5 }, g);
      svgEl('text', { x: X(t), y: Hh - M.b + 18, 'text-anchor': 'middle', 'font-size': 11, fill: isGuide ? COLORS.ink : COLORS.ink3, 'font-family': 'var(--font-mono, monospace)', 'font-weight': isGuide ? 600 : 400 }, g).textContent = String(t);
      if (isGuide) svgEl('text', { x: X(t), y: Hh - M.b + 32, 'text-anchor': 'middle', 'font-size': 10, fill: '#2a5db0', 'font-family': 'var(--font-mono, monospace)' }, g).textContent = 'log₂FC = ' + (t > 0 ? '1' : '-1');
    }
    svgEl('line', { x1: M.l, x2: W - M.r, y1: Hh - M.b, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.3 }, g);
    svgEl('line', { x1: M.l, x2: M.l, y1: M.t, y2: Hh - M.b, stroke: COLORS.ink, 'stroke-width': 1.3 }, g);
    svgEl('text', { x: (M.l + W - M.r) / 2, y: Hh - 6, 'text-anchor': 'middle', 'font-size': 13, fill: COLORS.ink, 'font-family': 'var(--font-body, sans-serif)', 'font-weight': 600 }, g).textContent = 'Quantitative effect: log₂ Fold Change (quantitative analysis)';
    const yLab = svgEl('text', { x: 14, y: (M.t + Hh - M.b) / 2, 'text-anchor': 'middle', 'font-size': 13, fill: COLORS.ink, 'font-family': 'var(--font-body, sans-serif)', 'font-weight': 600, transform: 'rotate(-90 14 ' + ((M.t + Hh - M.b) / 2) + ')' }, g);
    yLab.textContent = 'Qualitative effect: Δ Presence  (P_cond1 − P_cond2)';
    svgEl('text', { x: W / 2, y: 16, 'text-anchor': 'middle', 'font-size': 15, fill: COLORS.ink, 'font-family': 'var(--font-body, sans-serif)', 'font-weight': 700 }, g).textContent = 'Hybrid significance scatter plot';
    svgEl('text', { x: W / 2, y: 30, 'text-anchor': 'middle', 'font-size': 13, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)', 'font-style': 'italic' }, g).textContent = '(Quantitative vs. Qualitative)';
    const counts = { both_conc: 0, both_disc: 0, quant: 0, qual: 0, ns: 0 };
    for (const pt of pts) counts[pt.cat]++;
    const box = (cx, cy, w, h, fill, stroke, title, n) => {
      const rx = 6;
      svgEl('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, fill: '#ffffff', stroke, 'stroke-width': 1.1, rx, ry: rx, opacity: 0.96 }, g);
      svgEl('text', { x: cx, y: cy - 8, 'text-anchor': 'middle', 'font-size': 10, fill: stroke, 'font-family': 'var(--font-body, sans-serif)', 'font-weight': 700 }, g).textContent = title;
      svgEl('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': 10, fill: COLORS.ink2, 'font-family': 'var(--font-body, sans-serif)' }, g).textContent = n === 1 ? 'n = 1' : 'n = ' + n;
    };
    box(X(-2.5), Y(0.65), 118, 36, '#fff', '#2a5db0', 'Qualitative-only', counts.qual);
    box(X(2.5), Y(0.65), 118, 36, '#fff', '#2e7b5f', 'Both significant', counts.both_conc);
    box(X(-2.5), Y(-0.65), 118, 36, '#fff', '#e67e22', 'Both significant', counts.both_disc);
    box(X(2.5), Y(-0.65), 118, 36, '#fff', '#c94a3d', 'Quantitative-only', counts.quant);
    box((M.l + W - M.r) / 2, Y(0.02), 108, 32, '#fff', COLORS.ink3, 'Not significant', counts.ns);
    const thrL = svgEl('g', {}, g);
    svgEl('text', { x: W - M.r + 14, y: Y(0.3) + 3, 'font-size': 10, fill: '#2a5db0', 'font-family': 'var(--font-mono, monospace)' }, thrL).textContent = 'ΔP = 0.3';
    svgEl('text', { x: W - M.r + 14, y: Y(-0.3) + 3, 'font-size': 10, fill: '#2a5db0', 'font-family': 'var(--font-mono, monospace)' }, thrL).textContent = 'ΔP = -0.3';
    const ordered = pts.slice().sort((a, b) => (a.cat === 'ns') - (b.cat === 'ns'));
    const drawn = [];
    for (const pt of ordered) {
      const isNS = pt.cat === 'ns';
      const r = isNS ? 3.0 : 3.8;
      const fill = col[pt.cat];
      const el = svgEl('circle', { cx: X(Math.max(xMin + 0.02, Math.min(xMax - 0.02, pt.xv))), cy: Y(Math.max(yMin + 0.02, Math.min(yMax - 0.02, pt.yv))), r, fill, stroke: isNS ? '#fbf9f4' : '#ffffff', 'stroke-width': isNS ? 0.6 : 1.1, opacity: isNS ? 0.65 : 0.95 }, g);
      drawn.push({ el, pt, x: pt.xv, y: pt.yv });
    }
    if (legEl) {
      legEl.innerHTML =
        '<div style="border:1px solid var(--line);background:#fbf9f4;padding:10px 12px;min-width:168px">' +
        '<div style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px">Significant thresholds</div>' +
        '<div style="font-size:var(--fs-sm);color:var(--ink-2);line-height:1.5"><span style="border-bottom:2px dashed #57503f">&nbsp;&nbsp;&nbsp;&nbsp;</span> Quantitative:<br>FDR &lt; 0.05<br>(|log₂FC| ≥ 1)</div>' +
        '<div style="font-size:var(--fs-sm);color:var(--ink-2);line-height:1.5;margin-top:6px"><span style="border-bottom:2px dashed #2a5db0">&nbsp;&nbsp;&nbsp;&nbsp;</span> Qualitative:<br>FDR &lt; 0.05<br>(|ΔP| ≥ 0.3)</div></div>' +
        '<div style="border:1px solid var(--line);background:#fbf9f4;padding:10px 12px;min-width:168px;margin-top:10px">' +
        '<div style="font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px">Point color (category)</div>' +
        '<div style="display:grid;gap:5px;font-size:var(--fs-sm);color:var(--ink-2);line-height:1.4">' +
        '<span><span style="display:inline-block;width:10px;height:10px;background:#2e7b5f;border-radius:50%;vertical-align:1px;margin-right:6px"></span>Both significant<br><span style="margin-left:16px;color:var(--ink-3)">(Q Sig, P Sig) concordant</span></div>' +
        '<div style="font-size:var(--fs-sm)"><span style="display:inline-block;width:10px;height:10px;background:#c94a3d;border-radius:50%;vertical-align:1px;margin-right:6px"></span>Quantitative-only<br><span style="margin-left:16px;color:var(--ink-3)">(Q Sig, P NS)</span></div>' +
        '<div style="font-size:var(--fs-sm)"><span style="display:inline-block;width:10px;height:10px;background:#2a5db0;border-radius:50%;vertical-align:1px;margin-right:6px"></span>Qualitative-only<br><span style="margin-left:16px;color:var(--ink-3)">(Q NS, P Sig)</span></div>' +
        '<div style="font-size:var(--fs-sm)"><span style="display:inline-block;width:10px;height:10px;background:#e67e22;border-radius:50%;vertical-align:1px;margin-right:6px"></span>Both significant<br><span style="margin-left:16px;color:var(--ink-3)">(Q Sig, P Sig) opposite</span></div>' +
        '<div style="font-size:var(--fs-sm)"><span style="display:inline-block;width:10px;height:10px;background:#b8b3a3;border-radius:50%;vertical-align:1px;margin-right:6px"></span>Not significant<br><span style="margin-left:16px;color:var(--ink-3)">(Q NS, P NS)</span></div>' +
        '</div></div>';
      const figEl = document.getElementById('figHybridScatter') || document.getElementById('hybFigHybridScatterWrap') || document.getElementById('hybFigHybridScatter');
      if (figEl) figEl.style.position = 'relative';
      if (legEl) {
        legEl.style.display = 'block';
        legEl.style.position = 'absolute';
        legEl.style.right = '14px';
        legEl.style.top = '56px';
        legEl.style.zIndex = '2';
      }
      if (container) container.style.position = 'relative';
    }
    if (cardsEl) {
      const card = (title, desc, bgc, bc) => '<div style="flex:1 1 140px;min-width:132px;border:1px solid ' + bc + ';background:' + bgc + ';padding:10px 10px 9px;line-height:1.4"><div style="font-size:var(--fs-sm);font-weight:700;color:' + bc + ';text-align:center">' + title + '</div><div style="font-size:var(--fs-xs);color:var(--ink-2);text-align:center;margin-top:4px">' + desc + '</div></div>';
      cardsEl.innerHTML =
        card('Both significant<br>(concordant)', 'Significant in both analyses<br>with consistent direction<br><span style="color:var(--ink-3)">(upper-right &amp; lower-left)</span>', '#eaf3ec', '#2e7b5f') +
        card('Quantitative-only', 'Significant in quantitative<br>analysis only<br><span style="color:var(--ink-3)">(abundance changes but<br>presence frequency similar)</span>', '#fde8e8', '#c94a3d') +
        card('Qualitative-only', 'Significant in qualitative<br>analysis only<br><span style="color:var(--ink-3)">(presence frequency changes<br>but abundance similar)</span>', '#e6eef8', '#2a5db0') +
        card('Both significant<br>(discordant)', 'Significant in both analyses<br>but with opposite direction<br><span style="color:var(--ink-3)">(upper-left &amp; lower-right)</span>', '#fdf0e0', '#e67e22') +
        card('Not significant', 'Not significant<br>in either analysis', '#f6f2ea', '#b8b3a3');
    }
    if (noteEl) noteEl.textContent = pts.length + ' feature groups · ' + counts.both_conc + ' both-concordant · ' + counts.both_disc + ' both-discordant · ' + counts.quant + ' quant-only · ' + counts.qual + ' qual-only · ' + counts.ns + ' NS · FDR ' + (res.options ? res.options.targetFdr : '0.05');
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;pointer-events:none;background:#211d17;color:#f6f2ea;font-family:var(--font-mono);font-size:var(--fs-xs);padding:7px 10px;line-height:1.5;opacity:0;transition:opacity .12s ease;z-index:30;white-space:nowrap;';
    container.appendChild(tip);
    const overlay = svgEl('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: 'transparent' }, svg);
    let last = null;
    const clearLast = () => { if (last) { last.setAttribute('r', last.getAttribute('data-r')); last.setAttribute('stroke', last.getAttribute('data-stroke')); last = null; } };
    overlay.addEventListener('mousemove', ev => {
      const rect = svg.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width);
      const my = (ev.clientY - rect.top) * (svg.viewBox.baseVal.height / rect.height);
      let best = null, bd = 1e9;
      for (const d of drawn) {
        const px = Number(d.el.getAttribute('cx')), py = Number(d.el.getAttribute('cy'));
        const dist = Math.hypot(px - mx, py - my);
        if (dist < bd) { bd = dist; best = d; }
      }
      clearLast();
      if (!best || bd > 18) { tip.style.opacity = 0; return; }
      best.el.setAttribute('data-r', best.el.getAttribute('r'));
      best.el.setAttribute('data-stroke', best.el.getAttribute('stroke'));
      best.el.setAttribute('r', Number(best.el.getAttribute('r')) + 2);
      best.el.setAttribute('stroke', COLORS.ink);
      last = best.el;
      tip.style.opacity = 1;
      const pt = best.pt;
      tip.innerHTML = '<b style="color:#f6f2ea">' + esc(pt.p.protein) + '</b> · ' + pt.cat.replace('_', ' ') + '<br>log₂FC ' + (isFinite(pt.p.log2FC) ? pt.p.log2FC.toFixed(2) : '—') + ' · ΔP ' + pt.dP.toFixed(3) + '<br>p_bin ' + fmtP(pt.p.pBin) + ' · p_int ' + (isFinite(pt.p.pInt) ? fmtP(pt.p.pInt) : '—') + '<br>' + (pt.sigQ ? 'Q Sig' : 'Q NS') + ' · ' + (pt.sigP ? 'P Sig' : 'P NS');
      const lx = (Number(best.el.getAttribute('cx')) / svg.viewBox.baseVal.width) * rect.width;
      const ly = (Number(best.el.getAttribute('cy')) / svg.viewBox.baseVal.height) * rect.height;
      tip.style.left = Math.min(lx + 14, rect.width - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.max(4, ly - tip.offsetHeight - 10) + 'px';
    });
    overlay.addEventListener('mouseleave', () => { tip.style.opacity = 0; clearLast(); });
  }

  function setStatus(text, cls) {
    const chip = $('#statusChip');
    $('#statusText').textContent = text;
    chip.classList.toggle('live', cls === 'live');
  }

  function renderDataset(ds, warnings) {
    const nSmp = ds.samples.length;
    const nA = ds.samples.filter(s => s.group === 0).length;
    const nB = nSmp - nA;
    // missingness over the FULL feature×sample grid: a cell is missing when
    // it has no usable positive quantity — absent (feature not observed there,
    // or detected low-intensity quantity censored away, MNAR) or an explicit 0.
    let totalCells = 0, usable = 0, absent = 0, zeros = 0, other = 0;
    for (const p of ds.peptides) for (const s of ds.samples) {
      const v = p.values[s.id];
      totalCells++;
      if (v == null || !isFinite(v)) absent++;
      else if (v > 0) usable++;
      else if (v === 0) zeros++;
      else other++;
    }
    const miss = totalCells ? (1 - usable / totalCells) : 0;
    const nProt = ds.proteins.length;
    const nSingle = ds.proteins.filter(p => p.peptideIds.length === 1).length;
    $('#dsTag').textContent = ds.meta ? (ds.meta.source === 'simulated' ? 'simulated' : 'user data') : 'user data';
    $('#dsStats').innerHTML = [
      ['feature groups', nProt, '<small>(' + nSingle + ' single-feature)</small>'],
      ['features (rows)', ds.peptides.length],
      ['samples (cols)', nSmp, '<small>(' + nA + ' ' + esc(ds.groupLabels[0]) + ' · ' + nB + ' ' + esc(ds.groupLabels[1]) + ')</small>'],
      ['missing quantities', fmtPct(miss), '<small>' + absent + ' absent' + (zeros ? ' · ' + zeros + ' zero' : '') + ' · ' + (totalCells - absent - zeros - other) + ' usable</small>',
       'share of all feature×sample cells with no usable positive quantity: absent cells (feature not observed in that sample — including low-intensity quantities censored away, MNAR by design) plus explicit zeros, over the full ' + ds.peptides.length + '×' + nSmp + ' grid.'],
      ['group A', esc(ds.groupLabels[0])],
      ['group B', esc(ds.groupLabels[1])]
    ].map(([k, v, sub, t]) => '<div class="stat"' + (t ? ' title="' + esc(t) + '"' : '') + '><div class="k">' + k + '</div><div class="v">' + v + (sub || '') + '</div></div>').join('');
    $('#dsWarnings').innerHTML = (warnings && warnings.length)
      ? warnings.map(w => '<div class="pill" style="border-color:#b08a2a;background:#f5eeda">⚠ ' + esc(w) + '</div>').join('')
      : '';
    // group selectors
    const gA = $('#selGrpA'), gB = $('#selGrpB');
    gA.innerHTML = ds.groupLabels.map((g, i) => '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' + esc(g) + '</option>').join('');
    gB.innerHTML = ds.groupLabels.map((g, i) => '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>' + esc(g) + '</option>').join('');
    gA.disabled = gB.disabled = false;
    // wide dataset matrix (the Dataset tab)
    const wideTbl = $('#wideTable');
    if (wideTbl) renderWideTable(ds);
  }

  /* ---------- wide dataset matrix (peptide × sample) ---------- */
  function fmtCell(v) {
    if (v >= 10000) return v.toExponential(2);
    return String(Number(v.toPrecision(4)));
  }
  function renderWideTable(ds) {
    if (!$('#wideTable')) return;
    const samples = ds.samples;
    const nS = samples.length;
    const gLab = i => ds.groupLabels[samples[i].group];
    // Show the feature-group column only when it adds information
    // (a plain protein/feature matrix has feature == group for every row).
    const hasGroups = ds.proteins.some(p => p.peptideIds.length > 1);
    $('#wideTable').classList.toggle('grp', hasGroups);
    // first sample of group B → separator column
    let sepIdx = -1;
    for (let i = 0; i < nS; i++) if (samples[i].group === 1) { sepIdx = i; break; }
    let h1 = '<th>feature</th>' + (hasGroups ? '<th>feature group</th>' : '');
    let h2 = '<th></th>' + (hasGroups ? '<th></th>' : '');
    for (let i = 0; i < nS; i++) {
      const cls = 'g' + samples[i].group + (i === sepIdx ? ' sep' : '');
      h1 += '<th class="' + cls + '">' + esc(samples[i].id) + '</th>';
      h2 += '<th class="' + cls + '">' + esc(gLab(i)) + '</th>';
    }
    $('#wideHead').innerHTML = '<tr>' + h1 + '</tr><tr>' + h2 + '</tr>';
    // stats over the full dataset
    let totalCells = 0, present = 0;
    for (const p of ds.peptides) {
      for (const s of samples) {
        totalCells++;
        const v = p.values[s.id];
        if (isFinite(v) && v > 0) present++;
      }
    }
    const miss = totalCells ? 1 - present / totalCells : 0;
    $('#wideStats').innerHTML = [
      ['features (rows)', ds.peptides.length],
      ['feature groups', ds.proteins.length, hasGroups ? '' : '<small>(each feature is its own group)</small>'],
      ['samples (cols)', nS, '<small>(' + esc(ds.groupLabels[0]) + ' / ' + esc(ds.groupLabels[1]) + ')</small>'],
      ['missing cells', fmtPct(miss)]
    ].map(([k, v, sub]) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + (sub ? '<br><small>' + sub + '</small>' : '') + '</div></div>').join('');
    // body (with filter)
    const f = (state.wideFilter || '').toLowerCase();
    const rows = [];
    for (const p of ds.peptides) {
      if (f && !(p.id.toLowerCase().includes(f) || p.protein.toLowerCase().includes(f))) continue;
      let cells = '';
      for (let i = 0; i < nS; i++) {
        const v = p.values[samples[i].id];
        const sep = i === sepIdx;
        if (isFinite(v) && v > 0) {
          cells += (sep ? '<td class="sep">' : '<td>') + fmtCell(v) + '</td>';
        } else {
          cells += '<td class="' + (sep ? 'sep miss' : 'miss') + '">–</td>';
        }
      }
      rows.push('<tr><td>' + esc(p.id) + '</td>' + (hasGroups ? '<td>' + esc(p.protein) + '</td>' : '') + cells + '</tr>');
    }
    $('#wideBody').innerHTML = rows.join('');
    $('#wideNote').textContent = (f ? rows.length + ' of ' + ds.peptides.length + ' features shown (filtered) · ' : '') +
      ds.peptides.length + ' features × ' + nS + ' samples · faint = not observed (MNAR) · this layout is the CSV download format';
  }

  /* ---------- wide CSV (dataset) ---------- */
  function wideCsvText(ds) {
    const hasGroups = ds.proteins.some(p => p.peptideIds.length > 1);
    const head = hasGroups ? ['Feature', 'Feature group'] : ['Feature'];
    const lines = [];
    lines.push(head.concat(ds.samples.map(s => s.id)).join(','));
    lines.push(['Group'].concat(hasGroups ? [''] : []).concat(ds.samples.map(s => ds.groupLabels[s.group])).join(','));
    for (const p of ds.peptides) {
      const cells = ds.samples.map(s => {
        const v = p.values[s.id];
        return isFinite(v) && v > 0 ? String(v) : '';
      });
      lines.push(hasGroups ? [p.id, p.protein].concat(cells).join(',')
                           : [p.id].concat(cells).join(','));
    }
    return lines.join('\n');
  }
  function exportWideCsv() {
    if (!state.dataset) return;
    download('dataset_wide.csv', wideCsvText(state.dataset), 'text/csv');
  }

  function renderResults(res) {
    const q = res.options.targetFdr;
    // ---- binary stats
    $('#hybBinStats').innerHTML = [
      ['single-feature groups (exact test)', res.nSingle],
      ['multi-feature groups (bootstrap)', res.nMulti],
      ['π̂₀ (multi, Storey–Tibshirani)', res.binary.pi0Multi.toFixed(3)],
      ['operating point (FDR ≤ ' + q + ')', res.binary.operatingPoint.sel + ' selected @ cp = ' + fmtP(res.binary.operatingPoint.cp), 'fdr ' + fmtP(res.binary.operatingPoint.fdr)]
    ].map(([k, v, sub]) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + (sub ? '<br><small>' + sub + '</small>' : '') + '</div></div>').join('');
    // ---- intensity stats
    const intP = res.intensity.prior || {};
    const intTestRow = res.intensity.test === 'welch'
      ? ['test statistic (intensity)', 'Welch two-sample t']
      : ['test statistic (intensity)', 'limma-style moderated t (empirical Bayes)'];
    const intPriorRow = res.intensity.test === 'limma' && isFinite(intP.df2)
      ? ['prior variance (fitFDist)', 'df̂₀ = ' + String(intP.df2).slice(0, 5) + ' · var = ' + (intP.s20 != null ? (+intP.s20).toPrecision(3) : '—'), 'each feature s̄² pulled toward this common scale']
      : (res.intensity.test === 'limma' && intP.df2 === Infinity
          ? ['prior variance (fitFDist)', 'df̂₀ = ∞ (variances homogeneous) — common var = ' + (intP.s20 != null ? (+intP.s20).toPrecision(3) : '—')]
          : null);
    $('#hybIntStats').innerHTML = [
      ['proteins with intensity p', res.intensity.nValid],
      intTestRow,
      intPriorRow
    ].filter(Boolean).concat([
      ['π̂₀ (intensity)', res.intensity.pi0.toFixed(3)],
      ['operating point (FDR ≤ ' + q + ')', res.intensity.operatingPoint.sel + ' selected @ cp = ' + fmtP(res.intensity.operatingPoint.cp), 'fdr ' + fmtP(res.intensity.operatingPoint.fdr)]
    ].map(([k, v, sub]) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + (sub ? '<br><small>' + sub + '</small>' : '') + '</div></div>').join(''));
    // ---- hybrid stats
    const hb = res.hybrid.operatingPoint;
    let selBOnly = 0, selIOnly = 0, selBoth = 0;
    if (isFinite(hb.cp)) {
      for (const x of res.proteins) {
        const b = x.pBin <= hb.cp, i = isFinite(x.pInt) && x.pInt <= hb.cp;
        if (b && i) selBoth++; else if (b) selBOnly++; else if (i) selIOnly++;
      }
    }
    $('#hybStats').innerHTML = [
      ['hybrid list (FDR ≤ ' + q + ')', hb.sel, 'cp = ' + fmtP(hb.cp) + ' · est. FDR ' + fmtP(hb.fdr)],
      ['from presence/absence only', selBOnly],
      ['from intensity only', selIOnly],
      ['from both', selBoth],
      ['one-state feature groups in list', res.proteins.filter(x => x.selHybrid && ((x.y1 > 0 && x.y2 === 0) || (x.y1 === 0 && x.y2 > 0))).length]
    ].map(([k, v, sub]) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + (sub ? '<br><small>' + sub + '</small>' : '') + '</div></div>').join('');

    $('#hybDetail').innerHTML =
      '<p class="lead" style="margin-top:6px">Reading the operating point: at cutoff <code>cp = ' + fmtP(hb.cp) + '</code>, the hybrid rule keeps <b>' + hb.sel + ' feature groups</b> (union of the two stages) with an estimated overall FDR of <b>' + fmtP(hb.fdr) + '</b>. The breakdown above shows how many were caught by both stages, by presence/absence alone (' + selBOnly + '), or by intensity alone (' + selIOnly + ').</p>';

    // ---- figures
    drawMainFigure(res, q);
    markMainBtns();
    const single = res.proteins.filter(p => p.single).map(p => p.pBin);
    const multi = res.proteins.filter(p => !p.single).map(p => p.pBin);
    const intp = res.proteins.filter(p => isFinite(p.pInt)).map(p => p.pInt);
    const intTestName = res.intensity.test === 'welch' ? 'Welch t' : 'limma moderated t';
    drawHist('#svgBinHist', '#legBinHist', [
      { name: 'single-feature (exact test)', color: COLORS.binary, pts: single },
      { name: 'multi-feature (bootstrap)', color: COLORS.intensity, pts: multi },
      { name: 'intensity (' + intTestName + ')', color: COLORS.hybrid, pts: intp }
    ], state.histAxis, state.histBins);
    markHistBtns();
    // volcano
    drawVolcano(res);
    markVolcanoBtns();
    // one-state coordinate comparison (Fig. 5)
    markOnestBtns();
    drawOnestCompare(res);
    drawHybridScatter(res);

    renderTable(res);
  }

  /* ---------- feature table ---------- */
  const COLS = [
    { key: 'protein', label: 'feature group', get: x => x.protein },
    { key: 'nPeptides', label: 'n feat.', get: x => x.nPeptides },
    { key: 'type', label: 'type', get: x => x.single ? 'S' : 'M' },
    { key: 'y1', label: 'y·A', get: x => x.y1 },
    { key: 'y2', label: 'y·B', get: x => x.y2 },
    { key: 'exprA', label: 'expr·A', nosort: true },
    { key: 'exprB', label: 'expr·B', nosort: true },
    { key: 'T', label: 'T', get: x => x.T },
    { key: 'pBin', label: 'p binary', get: x => x.pBin },
    { key: 'w', label: 'w', get: x => x.single ? x.w : null },
    { key: 'log2FC', label: 'log2FC', get: x => x.log2FC },
    { key: 'pInt', label: 'p int.', get: x => x.pInt },
    { key: 'pMin', label: 'min p', get: x => Math.min(x.pBin, isFinite(x.pInt) ? x.pInt : 1) },
    { key: 'pep', label: 'pep', get: x => x.pep },
    { key: 'fdr', label: 'Q value', get: x => x.fdr },
    { key: 'sel', label: 'sel.', get: x => (x.selHybrid ? 'H' : '') + (x.selBinary ? 'B' : '') + (x.selIntensity ? 'I' : '') }
  ];
  // One source of truth for the column meanings: used for the header
  // tooltips and for the "column descriptions" block under the table.
  const COL_HELP = {
    protein: 'The analysis unit (one row), i.e. the paper\'s "protein". In protein-matrix mode it is the feature itself. Rows observed in one group and absent in the other carry a one-state badge (the paper\'s flagship case, e.g. observed in 10 samples of one group, 0 of the other).',
    nPeptides: 'Number of features (the paper\'s peptides) in this group. In protein-matrix mode every group is a single feature.',
    type: 'S = single-feature group, tested with the exact binomial test (paper Sec. 2.3); M = multi-feature group, tested with the parametric bootstrap (Sec. 2.4).',
    y1: 'Observed (feature, sample) events in group A: for a single-feature group, the number of group-A samples in which the feature was observed; for a multi-feature group, the sum over all its features.',
    y2: 'Observed (feature, sample) events in group B (same definition as y·A).',
    exprA: 'Per-sample intensities in group A — one bar per sample. Bars are log2-scaled within the row (both groups share the same scale), so you can read off which samples were observed and their relative intensities. Faint slot = sample not observed. Hover a bar for the exact value.',
    exprB: 'Per-sample intensities in group B — one bar per sample, same within-row log2 scale as expr·A.',
    T: 'Presence/absence statistic: T = |y·A − y·B| for single-feature groups (exact test); for multi-feature groups the weighted sum Σ κj(yj·A − yj·B) with κj proportional to feature j\'s total observed count (Sec. 2.4).',
    pBin: 'Presence/absence p-value: exact-test tail for S rows; bootstrap (#{|T*| ≥ |T|} + 1)/(B+1) for M rows.',
    w: 'Single-feature rows only: the paper\'s 0/1 null-vs-alternative weight w = 1{PMF_null(counts) ≥ PMF_alt(counts)}. "null" = the pooled-presence null fits the counts at least as well as the group-specific alternative (w = 1); "alt" = the alternative fits better (w = 0). This weight enters the FDR numerator.',
    log2FC: 'Quantitative fold change: log2 mean(group A) − log2 mean(group B), over per-sample group means of the group\'s features. For one-state rows the absent group is imputed at the feature\'s own detection floor (min − 1.5·IQR of its observed log values), so FC = (mean − min) + 1.5·IQR of the observed group — a guaranteed minimum contrast, not an exact biological fold change. — only when no contrast is constructible (observed in 0–1 samples).',
    pInt: 'Two-group p-value on the per-sample means (the quantitative stage). Default statistic: limma-style empirical-Bayes moderated t (Smyth 2004) — each feature\'s residual variance is pooled and then moderated toward a common prior variance estimated across all features (small-n robustness), p from a t distribution with prior-df + (n1+n2−2) df; Welch two-sample t is selectable in the Analysis panel. With the default setting (missing values left out), a feature never observed in one comparison group has no testable contrast and shows — there (the presence/absence stage covers it; enable "intensity stage → impute missing values" to include such features via min − 1.5·IQR imputation).',
    pMin: 'min(p binary, p int.) — the quantity the hybrid rule (Sec. 2.6) tests: a group enters the list when min p ≤ cp at the shared target-FDR cutoff.',
    pep: 'pep — LOCAL FDR (per-feature posterior). The probability this feature\'s difference is a false discovery (null), based only on how well this feature\'s own counts fit the null model vs. the alternative (flat 50/50 prior): single-feature rows pmf0/(pmf0+pmf1) (exact binomial PMFs, Sec. 2.3 / 2.5.1); multi-feature rows f0/(f0+f1) (bootstrap null vs. alternative densities at T, Sec. 2.4). Near 0 = strong evidence of a real difference; near 1 = looks null. A genuine per-feature quantity, so it sorts and differs row to row — and it is generally different from the per-feature Q value.',
    fdr: 'Q value — per-feature q-value (Storey): the minimum global FDR at which this feature would be called significant. It is the hybrid FDR curve (Fig. 1, estimated FDR axis) evaluated at the feature\'s own min p (min(p binary, p int.)), i.e. min_{cp ≥ min p} FDR(cp), monotonic in min p and capped at 1. You are correct — this column is a q-value, not the list-level FDR itself (the stat strips above show the list-level FDR at the operating point cp*). Features sharing the same min p share the same Q value.',
    sel: 'Selection flags: H = in the hybrid (primary) list; B = selected by the presence/absence stage at the shared cutoff; I = selected by the intensity stage; — = not selected. H is the union of B and I — a group needs at least one stage to flag it; rows with only one of B/I are exactly what the union is for (they would be missed by the other stage alone).'
  };

  // Per-group, per-sample raw intensities: mean of the observed values over
  // the group's features (a single-feature group gives its own value).
  function groupValuesBySample(ds) {
    const byGroup = new Map();
    for (const p of ds.peptides) {
      let m = byGroup.get(p.protein);
      if (!m) { m = new Map(); byGroup.set(p.protein, m); }
      for (const s of ds.samples) {
        const v = p.values[s.id];
        if (isFinite(v) && v > 0) {
          const c = m.get(s.id) || { sum: 0, n: 0 };
          c.sum += v; c.n += 1;
          m.set(s.id, c);
        }
      }
    }
    return byGroup;
  }

  // In-cell bar plot: one bar per sample of the group (ordered), log2-scaled
  // on the row-shared [lo, hi] log range. arr items: {id, v, n} or null.
  function exprBarSvg(arr, lo, hi, color) {
    const step = 9, n = arr.length, W = n * step + 2, H = 36, base = H - 3;
    const span = Math.max(hi - lo, 0.5);
    let out = '';
    for (let i = 0; i < n; i++) {
      const c = arr[i], x = 1 + i * step;
      if (c == null) {
        out += '<rect x="' + x + '" y="' + (base - 2) + '" width="7" height="2.5" fill="#ddd7ca"></rect>';
      } else {
        const h = Math.max(0.12, Math.min(1, (Math.log2(c.v) - lo) / span)) * (base - 2);
        const tv = Number(c.v.toPrecision(4)).toLocaleString('en-US');
        out += '<rect x="' + x + '" y="' + (base - h).toFixed(1) + '" width="7" height="' + h.toFixed(1) + '" fill="' + color + '" opacity="0.8">' +
          '<title>' + esc(c.id) + ' · ' + tv + (c.n > 1 ? ' (mean of ' + c.n + ' features)' : '') + '</title></rect>';
      }
    }
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '" stroke="#d9d3c5"></line>' +
      out + '</svg>';
  }
  /* ---------- feature table search ---------- */
  // Plain-text rendering of one feature row (mirrors the cells shown in the
  // table, badges included) — used by the search box to match feature id or
  // any column value (p-values, counts, FC, pep/fdr, "one-state", "H" …).
  function featureMatchText(x) {
    const oneState = (x.y1 > 0 && x.y2 === 0) || (x.y1 === 0 && x.y2 > 0);
    const minP = Math.min(x.pBin, isFinite(x.pInt) ? x.pInt : 1);
    return [
      x.protein, x.nPeptides, x.single ? 'S' : 'M', x.y1, x.y2,
      isFinite(x.T) ? fmtNum(x.T, 2) : '',
      isFinite(x.pBin) ? fmtP(x.pBin) : '',
      x.single ? (x.w === 1 ? 'null' : 'alt') : '',
      isFinite(x.log2FC) ? fmtNum(x.log2FC, 2) : '',
      isFinite(x.pInt) ? fmtP(x.pInt) : '',
      isFinite(minP) ? fmtP(minP) : '',
      isFinite(x.pep) ? fmtP(x.pep) : '',
      isFinite(x.fdr) ? fmtP(x.fdr) : '',
      x.selHybrid ? 'H' : '', x.selBinary ? 'B' : '', x.selIntensity ? 'I' : '',
      oneState ? 'one-state' : ''
    ].join(' ').toLowerCase();
  }
  // Highlight the part of the feature id that the search query matches.
  function markProteinId(id) {
    const tok = (state.filter || '').trim().toLowerCase();
    if (!tok) return esc(id);
    const i = id.toLowerCase().indexOf(tok);
    if (i < 0) return esc(id);
    return esc(id.slice(0, i)) + '<mark>' + esc(id.slice(i, i + tok.length)) + '</mark>' + esc(id.slice(i + tok.length));
  }

  function renderTable(res) {
    const { key, dir } = state.sort;
    const col = COLS.find(c => c.key === key) || COLS[0];
    let rows = res.proteins.slice();
    const searchTok = (state.filter || '').trim().toLowerCase();
    if (searchTok) rows = rows.filter(x => featureMatchText(x).includes(searchTok));
    // Tie-break by the previous display order, so equal values (e.g. rows
    // sharing the same min p, hence the same pep) keep the current row
    // order instead of resetting to data order.
    const prevOrder = state.lastOrder;
    const tie = (a, b) => {
      const ia = prevOrder && prevOrder.has(a) ? prevOrder.get(a) : Number.MAX_SAFE_INTEGER;
      const ib = prevOrder && prevOrder.has(b) ? prevOrder.get(b) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    };
    rows.sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      const na = va == null || (typeof va === 'number' && !isFinite(va)), nb = vb == null || (typeof vb === 'number' && !isFinite(vb));
      if (na && nb) return tie(a, b);
      if (na) return 1;
      if (nb) return -1;
      if (typeof va === 'string') { const d = va.localeCompare(vb); return d ? dir * d : tie(a, b); }
      const d = va - vb;
      return d ? dir * d : tie(a, b);
    });
    state.lastOrder = new Map(rows.map((r, i) => [r, i]));
    // per-run operating points (const per app run): hybrid list's cp + FDR,
    // plus the three-stage breakdown for the tooltips / column descriptions
    const opTxt = op => (op && isFinite(op.cp) && isFinite(op.fdr))
      ? 'cp ' + fmtP(op.cp) + ' · est. FDR ' + fmtP(op.fdr) + ' · ' + op.sel + ' selected'
      : 'no list at the target FDR';
    const opSum = 'Operating points — hybrid: ' + opTxt(res.hybrid.operatingPoint) +
      ' · presence/absence: ' + opTxt(res.binary.operatingPoint) +
      ' · intensity: ' + opTxt(res.intensity.operatingPoint) + '.';
    // header (nosort columns — #, expr·A, expr·B — are plain tooltips)
    $('#protHead').innerHTML =
      '<th class="idx-h" title="row position in the current list (after filtering / sorting)">#</th>' +
      COLS.map(c => {
      const tip = ' title="' + esc((COL_HELP[c.key] || '') + (c.key === 'sel' ? ' ' + opSum : '')) + '"';
      if (c.nosort) return '<th class="expr-h"' + tip + '>' + c.label + '</th>';
      return '<th data-k="' + c.key + '"' + (c.key === key ? ' class="sorted"' : '') + tip + '>' + c.label + ' <span class="arr">' + (c.key === key ? (dir > 0 ? '↑' : '↓') : '↕') + '</span></th>';
    }).join('');
    const ds = state.dataset;
    const gA = ds.groupLabels[0], gB = ds.groupLabels[1];
    const byGroup = groupValuesBySample(ds);
    const smpA = ds.samples.filter(s => s.group === 0);
    const smpB = ds.samples.filter(s => s.group === 1);
    const valsOf = (x, smp) => {
      const m = byGroup.get(x.protein);
      return smp.map(s => {
        const c = m && m.get(s.id);
        return c ? { id: s.id, v: c.sum / c.n, n: c.n } : null;
      });
    };
    $('#protBody').innerHTML = rows.map((x, i) => {
      // in-cell intensity bars (row-shared log2 scale across both groups)
      const A = valsOf(x, smpA), B = valsOf(x, smpB);
      let lo = Infinity, hi = -Infinity;
      for (const c of A.concat(B)) {
        if (!c) continue;
        const lg = Math.log2(c.v);
        if (lg < lo) lo = lg;
        if (lg > hi) hi = lg;
      }
      if (lo === Infinity) { lo = 0; hi = 1; }
      const nA = A.filter(Boolean).length, nB = B.filter(Boolean).length;
      const barsA = '<td class="bars" title="' + esc(gA) + ': ' + nA + '/' + smpA.length + ' samples observed">' + exprBarSvg(A, lo, hi, COLORS.binary) + '</td>';
      const barsB = '<td class="bars" title="' + esc(gB) + ': ' + nB + '/' + smpB.length + ' samples observed">' + exprBarSvg(B, lo, hi, COLORS.intensity) + '</td>';
      const oneState = (x.y1 > 0 && x.y2 === 0) || (x.y1 === 0 && x.y2 > 0);
      const sel = [];
      if (x.selHybrid) sel.push('<span class="badge h">H</span>');
      if (x.selBinary) sel.push('<span class="badge b">B</span>');
      if (x.selIntensity) sel.push('<span class="badge i">I</span>');
      if (!sel.length) sel.push('<span class="badge s">—</span>');
      return '<tr>' +
        '<td class="idx">' + (i + 1) + '</td>' +
        '<td class="protein" title="' + esc(x.protein) + '">' + markProteinId(x.protein) + (oneState ? ' <span class="badge onest">one-state</span>' : '') + '</td>' +
        '<td>' + x.nPeptides + '</td>' +
        '<td>' + (x.single ? 'S' : 'M') + '</td>' +
        '<td title="observed (feature, sample) events in ' + esc(gA) + '">' + x.y1 + '</td>' +
        '<td title="observed (feature, sample) events in ' + esc(gB) + '">' + x.y2 + '</td>' +
        barsA + barsB +
        '<td>' + (isFinite(x.T) ? fmtNum(x.T, 2) : '—') + '</td>' +
        '<td>' + fmtP(x.pBin) + '</td>' +
        '<td>' + (x.single ? (x.w === 1 ? 'null' : 'alt') : '—') + '</td>' +
        '<td>' + (isFinite(x.log2FC) ? fmtNum(x.log2FC, 2) : '—') + '</td>' +
        '<td>' + fmtP(x.pInt) + '</td>' +
        '<td style="color:var(--ink);font-weight:500">' + fmtP(Math.min(x.pBin, isFinite(x.pInt) ? x.pInt : 1)) + '</td>' +
        '<td title="pep = LOCAL FDR of this feature: posterior probability it is a false discovery, from this feature\'s own null-vs-alternative fit (PMF or bootstrap densities). 0 = certainly real, 1 = looks null.">' + (isFinite(x.pep) ? fmtP(x.pep) : '—') + '</td>' +
        '<td title="fdr = GLOBAL (list-level) FDR: the FDR of the selected list at this feature\'s min p (the Fig-1 \"estimated FDR\" axis).">' + (isFinite(x.fdr) ? fmtP(x.fdr) : '—') + '</td>' +
        '<td title="' + esc(opSum) + '">' + sel.join(' ') + '</td>' +
        '</tr>';
    }).join('');
    const sInfo = $('#ftSearchInfo');
    if (sInfo) {
      sInfo.textContent = searchTok ? rows.length + ' match' + (rows.length === 1 ? '' : 'es') + ' for \u201c' + state.filter.trim() + '\u201d' : '';
      sInfo.classList.toggle('zero', !!searchTok && rows.length === 0);
    }
    $('#tableNote').textContent = rows.length + ' of ' + res.proteins.length + ' feature groups shown' + (searchTok ? ' · search: \u201c' + state.filter.trim() + '\u201d — Esc clears' : '') + ' · sorted by ' + key + (dir > 0 ? ' ↑' : ' ↓') + ' · expr·A / expr·B = per-sample intensity bars (log₂ within row; faint slot = sample not observed) · H = hybrid list, B = presence/absence list, I = intensity list (each at the shared target FDR) · pep = LOCAL per-feature posterior; Q value = per-feature q-value (minimum FDR at min p, monotonic, capped at 1) — both sortable; per-list global FDR at the operating point cp* is in the stat strips above';
    // column descriptions block under the table
    const ch = $('#colHelp');
    if (ch) ch.innerHTML =
      '<p><b>#</b> — row position in the current list (recomputed after filtering / sorting — use the feature ID to identify a feature, not this number). Frozen left while the table scrolls horizontally.</p>' +
      COLS.map(c => '<p><b>' + c.label + '</b> — ' + (COL_HELP[c.key] || '') + (c.key === 'sel' ? ' ' + esc(opSum) : '') + '</p>').join('');
    $('#protHead').querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.k;
        if (!k) return; // nosort columns (expr·A / expr·B)
        if (state.sort.key === k) state.sort.dir *= -1;
        else state.sort = { key: k, dir: k === 'protein' || k === 'type' || k === 'sel' ? 1 : 1 };
        renderTable(res);
      });
    });
  }

  /* ==========================================================
   * Data loading
   * ========================================================== */
  function loadCsvText(text, name) {
    const parsed = H.parseCsv(text);
    state.dataset = parsed.dataset;
    state.warnings = parsed.warnings;
    state.result = null;
    renderDataset(parsed.dataset, parsed.warnings);
    setStatus(name + ' — ' + parsed.dataset.peptides.length + ' features in ' +
      parsed.dataset.proteins.length + ' feature groups', 'live');
  }

  /* ==========================================================
   * Run
   * ========================================================== */
  function run() {
    if (!state.dataset) {
      setStatus('no dataset — load data in Data Preparation', 'err');
      return;
    }
    const btn = $('#btnRun');
    const st = $('#runStatus');
    st.className = 'run-status';
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> computing…';
    const t0 = performance.now();
    setTimeout(() => {
      try {
        const gA = +$('#selGrpA').value, gB = +$('#selGrpB').value;
        if (gA === gB) throw new Error('Group A and Group B must be two different groups.');
        const ds = remapGroups(state.dataset, gA, gB);
        state.dataset = ds;
        renderWideTable(ds); // reflect group A/B ordering in the Dataset section
        const res = H.runAnalysis(ds, {
          bootstrapIters: +$('#oBoot').value,
          bootstrapMode: $('#oMode').value,
          targetFdr: +$('#oTarget').value,
          intensityImpute: $('#oImpute').value === 'on',
          intensityTest: $('#oTest').value,
          seed: 42
        });
        state.result = res;
        $('#emptyState').style.display = 'none';
        const body = $('#resultsBody');
        body.style.display = 'block';
        renderResults(res);
        // reveal sections staggered
        const secs = $$('#resultsBody .section');
        secs.forEach((s, i) => {
          s.classList.remove('in');
          s.style.transitionDelay = (i * 70) + 'ms';
          requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('in')));
        });
        const ms = Math.round(performance.now() - t0);
        st.textContent = 'done in ' + ms + ' ms · ' + res.nProteins + ' feature groups · B=' + res.options.bootstrapIters;
        st.className = 'run-status ok';
        setStatus('analysed — hybrid list: ' + res.hybrid.operatingPoint.sel + ' feature groups @ FDR ' + fmtP(res.hybrid.operatingPoint.fdr), 'live');
      } catch (err) {
        console.error(err);
        st.textContent = 'error: ' + err.message;
        st.className = 'run-status err';
        setStatus('error — ' + err.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Run hybrid analysis';
      }
    }, 30);
  }

  function remapGroups(ds, a, b) {
    // ensure group A -> 0, B -> 1
    const map = { [a]: 0, [b]: 1 };
    const samples = ds.samples.map(s => ({ id: s.id, group: map[s.group] != null ? map[s.group] : s.group }));
    return { ...ds, samples, groupLabels: [ds.groupLabels[a], ds.groupLabels[b]] };
  }

  /* ==========================================================
   * Exports
   * ========================================================== */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function exportCsv() {
    if (!state.result) return;
    const res = state.result;
    const gA = state.dataset.groupLabels[0], gB = state.dataset.groupLabels[1];
    const head = ['feature_group', 'n_features', 'type', 'y_' + gA, 'y_' + gB, 'T_stat', 'p_binary', 'w_binary', 'log2FC', 'p_intensity', 'p_min', 'pep', 'q_value', 'sel_binary', 'sel_intensity', 'sel_hybrid'];
    const lines = [head.join(',')];
    for (const x of res.proteins) {
      lines.push([
        x.protein, x.nPeptides, x.single ? 'single-feature' : 'multi-feature', x.y1, x.y2,
        isFinite(x.T) ? x.T : '', x.pBin, x.single ? x.w : '',
        isFinite(x.log2FC) ? x.log2FC : '', isFinite(x.pInt) ? x.pInt : '',
        Math.min(x.pBin, isFinite(x.pInt) ? x.pInt : 1),
        isFinite(x.pep) ? x.pep : '', isFinite(x.fdr) ? x.fdr : '',
        x.selBinary ? 1 : 0, x.selIntensity ? 1 : 0, x.selHybrid ? 1 : 0
      ].join(','));
    }
    download('hybrid_de_results.csv', lines.join('\n'), 'text/csv');
  }
  function svgToPng(svg, filename) {
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', SVGNS);
    const data = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = svg.viewBox.baseVal.width * scale;
      canvas.height = svg.viewBox.baseVal.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fbf9f4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(b => {
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
  }
  function exportPng() { svgToPng(document.querySelector('#svgMain svg'), 'hybrid_de_fig1.png'); }
  function exportVolcanoPng() { svgToPng(document.querySelector('#svgVolcano svg'), 'hybrid_de_volcano.png'); }
  function exportHybridScatterPng() { svgToPng(document.querySelector('#hybFigHybridScatter svg') || document.querySelector('#svgHybridScatter svg'), 'hybrid_de_hybrid_scatter.png'); }

  /* ---------- volcano mode buttons ---------- */
  function markVolcanoBtns() {
    $$('.btn-vol').forEach(b => {
      const on = b.dataset.mode === state.volcanoMode;
      b.style.background = on ? 'rgba(var(--md-accent-rgb),.10)' : '';
      b.style.color = on ? 'var(--md-accent)' : '';
      b.style.borderColor = on ? 'var(--md-accent)' : '';
      b.style.fontWeight = on ? 600 : '';
    });
  }
  function markOnestBtns() {
    $$('.btn-onest').forEach(b => {
      const on = b.dataset.mode === state.onestMode;
      b.style.background = on ? 'rgba(var(--md-accent-rgb),.10)' : '';
      b.style.color = on ? 'var(--md-accent)' : '';
      b.style.borderColor = on ? 'var(--md-accent)' : '';
      b.style.fontWeight = on ? 600 : '';
    });
  }
  function markHistBtns() {
    $$('.btn-hist').forEach(b => {
      const on = b.dataset.axis
        ? b.dataset.axis === state.histAxis
        : Number(b.dataset.bins) === state.histBins;
      b.style.background = on ? 'rgba(var(--md-accent-rgb),.10)' : '';
      b.style.color = on ? 'var(--md-accent)' : '';
      b.style.borderColor = on ? 'var(--md-accent)' : '';
      b.style.fontWeight = on ? 600 : '';
    });
  }
  function markMainBtns() {
    $$('.btn-main').forEach(b => {
      const on = (b.dataset.axis || 'fit') === state.mainAxis;
      b.style.background = on ? 'rgba(var(--md-accent-rgb),.10)' : '';
      b.style.color = on ? 'var(--md-accent)' : '';
      b.style.borderColor = on ? 'var(--md-accent)' : '';
      b.style.fontWeight = on ? 600 : '';
    });
  }
  function sampleCsv() {
    if (!state.dataset) { setStatus('no dataset — load data first', 'err'); return; }
    // Wide matrix — the preferred format (and the one the Dataset section shows).
    // Round-trips through parseCsv: header row, Group row, then intensities.
    download('sample_wide.csv', wideCsvText(state.dataset), 'text/csv');
  }

  /* ---------- tabs ---------- */
  function switchTab(id) {
    $$('.tab-btn').forEach(b => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
  }

  /* ==========================================================
   * Self-test
   * ========================================================== */
  function runSelfTest() {
    const out = $('#diagOut');
    const btn = $('#btnSelfTest');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> running…';
    setTimeout(() => {
      try {
        const r = H.selfTest({ nProteins: 500, bootstrapIters: 800 });
        const cards = [];
        cards.push({
          name: 'One-state peptide (Sec. 2.3)',
          detail: '10 vs 0 observed, n = 10 + 10 → p = ' + r.oneState.observed.toExponential(3) + ' (paper: 2·B(10;10,½)·B(0;10,½) ≈ 1.9·10⁻⁶ < 10⁻⁴)',
          pass: r.oneState.ok
        });
        const c = r.calibration;
        cards.push({
          name: 'FDR estimator conservative (Fig. 2)',
          detail: 'simulated 30% differential mixture, ' + c.points + ' curve points · median (est − true) gap = ' + (100 * c.medianGap).toFixed(2) + ' pp · operating point: est ' + (c.operatingPoint ? fmtP(c.operatingPoint.est) : '—') + ' vs true ' + (c.operatingPoint ? fmtP(c.operatingPoint.truth) : '—') + ' @ ' + (c.operatingPoint ? c.operatingPoint.sel : 0) + ' selected',
          pass: c.ok
        });
        const h = r.hybridVsComponents;
        cards.push({
          name: 'Hybrid = union of stages (Sec. 2.6)',
          detail: 'at cp = 0.05: binary ' + h.atCp05.binary + ' · intensity ' + h.atCp05.intensity + ' · hybrid ' + h.atCp05.hybrid + ' (operating points: ' + h.operatingPoints.binary + ' / ' + h.operatingPoints.intensity + ' / ' + h.operatingPoints.hybrid + ')',
          pass: h.ok
        });
        out.innerHTML = cards.map(c2 =>
          '<div class="diag-card ' + (c2.pass ? 'pass' : 'fail') + '">' +
          '<div class="name">' + esc(c2.name) + '</div>' +
          '<div class="detail">' + esc(c2.detail) + '</div>' +
          '<div class="verdict">' + (c2.pass ? '✓ PASS' : '✗ FAIL') + '</div>' +
          '</div>').join('') +
          '<p class="table-note">self-test battery: ' + (r.pass ? 'all checks passed' : 'some checks failed') + ' · fresh simulated mixture, independent of the dataset above</p>';
      } catch (err) {
        out.innerHTML = '<div class="diag-card fail"><div class="name">self-test</div><div class="detail">' + esc(err.message) + '</div><div class="verdict">✗ ERROR</div></div>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'run self-test';
      }
    }, 30);
  }

  window.drawHybridScatter = drawHybridScatter;
  window.drawVolcano = drawVolcano;
  window.drawMainFigure = drawMainFigure;
  window.drawFig2 = drawFig2;
  window.drawOnestCompare = drawOnestCompare;
  window.drawHist = drawHist;
  window.renderHybridResults = renderResults;

  /* ==========================================================
   * Wiring
   * ========================================================== */
  const safeBind = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn); };
  safeBind('#btnUpload', 'click', () => { const fi = $('#fileInput'); if (fi) fi.click(); });
  const fileInput = $('#fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', ev => {
      const f = ev.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { loadCsvText(String(rd.result), f.name); }
        catch (e) { setStatus('CSV error — ' + e.message, 'err'); alert('Could not parse CSV:\n' + e.message); }
      };
      rd.readAsText(f);
      ev.target.value = '';
    });
  }
  safeBind('#btnRun', 'click', run);
  safeBind('#btnSelfTest', 'click', runSelfTest);
  safeBind('#btnCsv', 'click', exportCsv);
  safeBind('#btnPng', 'click', exportPng);
  safeBind('#btnVolPng', 'click', exportVolcanoPng);
  const btnHyb2 = document.getElementById('btnHybridScatterPng');
  if (btnHyb2) btnHyb2.addEventListener('click', exportHybridScatterPng);
  // dataset wide CSV (rail + Dataset tab)
  safeBind('#btnWideCsv', 'click', exportWideCsv);
  safeBind('#btnWideCsv2', 'click', exportWideCsv);
  const wideFilt = $('#wideFilter');
  if (wideFilt) {
    wideFilt.addEventListener('input', e => {
      state.wideFilter = e.target.value;
      if (state.dataset) renderWideTable(state.dataset);
    });
  }
  // feature table search box (locate a feature by id or any cell value)
  const ftSearch = $('#ftSearch');
  if (ftSearch) {
    const ftApply = () => {
      state.filter = ftSearch.value;
      if (state.result) renderTable(state.result);
    };
    ftSearch.addEventListener('input', ftApply);
    ftSearch.addEventListener('search', ftApply); // native × clear on type=search
    ftSearch.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        ftSearch.value = '';
        ftApply();
        ftSearch.blur();
      }
    });
  }
  // tabs
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  switchTab('tabProteins');
  $$('.btn-vol').forEach(b => b.addEventListener('click', () => {
    state.volcanoMode = b.dataset.mode;
    markVolcanoBtns();
    if (state.result) drawVolcano(state.result);
  }));
  markVolcanoBtns();
  $$('.btn-onest').forEach(b => b.addEventListener('click', () => {
    state.onestMode = b.dataset.mode;
    markOnestBtns();
    if (state.result) drawOnestCompare(state.result);
  }));
  markOnestBtns();
  $$('.btn-hist').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.axis) state.histAxis = b.dataset.axis;
    if (b.dataset.bins) state.histBins = Number(b.dataset.bins);
    markHistBtns();
    if (state.result) drawFig2();
  }));
  markHistBtns();
  $$('.btn-main').forEach(b => b.addEventListener('click', () => {
    state.mainAxis = b.dataset.axis || 'fit';
    markMainBtns();
    if (state.result) drawMainFigure(state.result, state.result.options.targetFdr);
  }));
  markMainBtns();
  safeBind('#btnSampleCsv', 'click', e => { e.preventDefault(); sampleCsv(); });
  const rerunOnGroup = () => { if (state.result) run(); };
  try{ const a=$('#selGrpA'); if(a) a.addEventListener('change', rerunOnGroup); }catch(e){}
  try{ const b=$('#selGrpB'); if(b) b.addEventListener('change', rerunOnGroup); }catch(e){}
  try{ const t=$('#oTarget'); if(t) t.addEventListener('change', rerunOnGroup); }catch(e){}
  try{ const im=$('#oImpute'); if(im) im.addEventListener('change', rerunOnGroup); }catch(e){}
  try{ const te=$('#oTest'); if(te) te.addEventListener('change', rerunOnGroup); }catch(e){}
  // Nebula-specific buttons (hyb* IDs) — wire via hyEl so standalone still works
  try{ const nb=hyEl('hybBtnNebula','hybridBtnNebula'); if(nb) nb.addEventListener('click', ()=>{ try{ const ds=buildHybridDatasetFromNebula(); state.dataset=ds; state.warnings=[]; state.result=null; renderDataset(ds,[]); }catch(e){ alert(e.message); } }); }catch(e){}
  try{ const up=hyEl('hybBtnUpload','hybridBtnUpload'); const fi=hyEl('hybFileInput','hybridFileInput')||$('#fileInput'); if(up&&fi) up.addEventListener('click', ()=> fi.click()); }catch(e){}
  window.runHybridAnalysis = run;
  window.HybridTab = { onOpen: function(){ try{ hybridRefreshMetaUi(); }catch(e){} } };
  window.refreshHybridMetaUi = hybridRefreshMetaUi;
  window.hybridOnMetaColumnChange = hybridOnMetaColumnChange;
  window.hybridUpdateGroupCounts = hybridUpdateGroupCounts;
})();
