/* Nebula port of 0266_diann-parquet-parser/js/main.js - scoped for the #diannExplorerTab panel. See AGENTS.md. */
/* file://-safe classic script converted from src/main.js. Load via plain <script src> (see index.html order + js/README.txt). No import/export. */

// Bump DIANN_APP_VERSION on every release and mirror it in the ?v= tags in index.html.
const DIANN_APP_VERSION = '1.3';
const DIANN_APP_BUILD = '2026-09-18';

// Application State
const diannState = {
  rawRows: [],
  runs: [],
  fileName: '',
  settings: loadSettings(),
  filteredRows: [],
  proteinMatrix: [],
  peptideMatrix: [],
  geneMatrix: [],
  selectedProteinGroup: null,
  selectedPrecursorId: null,
  selectedGene: null,
  xicCache: {},
  xicBuffers: {},
  xicFiles: {},
  xicIndex: {},
  xicTraceCache: {},
  xicSeenKeys: [],
  explorer: {
    pgMode: 'pg',
    pgQuery: '',
    pepQuery: '',
    runQuery: '',
    run: null,
    showY: true,
    showB: true,
    showMs1: false,
    showTheo: false
  },
  activeTab: 'diann-summary-tab',
  fastaEntries: [],
  fastaIndex: null,
  fastaFileName: '',
  loadedParquetBuffer: null,
  loadedParquetCustom: false,
  loadedFastaText: null,
  loadedFastaCustom: false,
  coverage: null,
  
  // Table Sorting and Pagination
  proteinTable: {
    page: 1,
    pageSize: 25,
    sortCol: 'totalIntensity',
    sortAsc: false,
    query: '',
    showPeptideCounts: false
  },
  peptideTable: {
    page: 1,
    pageSize: 25,
    sortCol: 'totalIntensity',
    sortAsc: false,
    query: ''
  },
  geneTable: {
    page: 1,
    pageSize: 25,
    sortCol: 'totalIntensity',
    sortAsc: false,
    query: '',
    showPeptideCounts: false
  },
};

/* Nebula port: panel root for all tab-system queries (never document-wide). */
function diannRoot() { return document.getElementById('diannExplorerTab'); }

// DOM Element References
const elements = {
  loadExampleBtn: document.getElementById('loadExampleBtn'),
  openFolderBtn: document.getElementById('openFolderBtn'),
  exportReportBtn: document.getElementById('exportReportBtn'),
  fileStatusBadge: document.getElementById('fileStatusBadge'),
  fileStatusText: document.getElementById('fileStatusText'),
  fastaStatusBadge: document.getElementById('fastaStatusBadge'),
  fastaStatusText: document.getElementById('fastaStatusText'),

  resetFiltersBtn: document.getElementById('resetFiltersBtn'),
  qValueSlider: document.getElementById('qValueSlider'),
  qValueTag: document.getElementById('qValueTag'),
  globalQValueSlider: document.getElementById('globalQValueSlider'),
  globalQValueTag: document.getElementById('globalQValueTag'),
  pgQValueSlider: document.getElementById('pgQValueSlider'),
  pgQValueTag: document.getElementById('pgQValueTag'),

  intensityColumnSelect: document.getElementById('intensityColumnSelect'),
  quantMethodSelect: document.getElementById('quantMethodSelect'),
  proteotypicOnlyToggle: document.getElementById('proteotypicOnlyToggle'),

  kpiFileName: document.getElementById('kpiFileName'),
  kpiPrecursors: document.getElementById('kpiPrecursors'),
  kpiProteins: document.getElementById('kpiProteins'),
  kpiPeptides: document.getElementById('kpiPeptides'),
  kpiRuns: document.getElementById('kpiRuns'),

  tabButtons: diannRoot().querySelectorAll('.diann-tab-btn'),
  tabContents: diannRoot().querySelectorAll('.diann-tab-content'),

  // Identification Summary
  sumOverlapPrecursors: document.getElementById('sumOverlapPrecursors'),
  sumOverlapPeptides: document.getElementById('sumOverlapPeptides'),
  sumOverlapProteins: document.getElementById('sumOverlapProteins'),
  sumTableHead: document.getElementById('sumTableHead'),
  sumTableBody: document.getElementById('sumTableBody'),

  exportProteinMatrixBtn: document.getElementById('exportProteinMatrixBtn'),
  exportGeneMatrixBtn: document.getElementById('exportGeneMatrixBtn'),
  exportPeptideMatrixBtn: document.getElementById('exportPeptideMatrixBtn'),
  sendProteinBtn: document.getElementById('sendProteinBtn'),
  sendGeneBtn: document.getElementById('sendGeneBtn'),

  // Protein Table
  proteinTableSearchInput: document.getElementById('proteinTableSearchInput'),
  proteinPeptideCountsToggle: document.getElementById('proteinPeptideCountsToggle'),
  proteinTable: document.getElementById('proteinTable'),
  proteinTableHead: document.getElementById('proteinTableHead'),
  proteinTableBody: document.getElementById('proteinTableBody'),
  proteinEmptyState: document.getElementById('proteinEmptyState'),
  proteinPaginationInfo: document.getElementById('proteinPaginationInfo'),
  proteinPageSizeSelect: document.getElementById('proteinPageSizeSelect'),
  proteinPrevPageBtn: document.getElementById('proteinPrevPageBtn'),
  proteinCurrentPageTag: document.getElementById('proteinCurrentPageTag'),
  proteinNextPageBtn: document.getElementById('proteinNextPageBtn'),

  // Peptide Table
  selectedProteinLabel: document.getElementById('selectedProteinLabel'),
  clearProteinSelectionBtn: document.getElementById('clearProteinSelectionBtn'),
  peptideTableSearchInput: document.getElementById('peptideTableSearchInput'),
  peptideTable: document.getElementById('peptideTable'),
  peptideTableHead: document.getElementById('peptideTableHead'),
  peptideTableBody: document.getElementById('peptideTableBody'),
  peptideEmptyState: document.getElementById('peptideEmptyState'),
  peptidePaginationInfo: document.getElementById('peptidePaginationInfo'),
  peptidePageSizeSelect: document.getElementById('peptidePageSizeSelect'),
  peptidePrevPageBtn: document.getElementById('peptidePrevPageBtn'),
  peptideCurrentPageTag: document.getElementById('peptideCurrentPageTag'),
  peptideNextPageBtn: document.getElementById('peptideNextPageBtn'),

  // Gene Table
  geneTableSearchInput: document.getElementById('geneTableSearchInput'),
  genePeptideCountsToggle: document.getElementById('genePeptideCountsToggle'),
  geneTable: document.getElementById('geneTable'),
  geneTableHead: document.getElementById('geneTableHead'),
  geneTableBody: document.getElementById('geneTableBody'),
  geneEmptyState: document.getElementById('geneEmptyState'),
  genePaginationInfo: document.getElementById('genePaginationInfo'),
  genePageSizeSelect: document.getElementById('genePageSizeSelect'),
  genePrevPageBtn: document.getElementById('genePrevPageBtn'),
  geneCurrentPageTag: document.getElementById('geneCurrentPageTag'),
  geneNextPageBtn: document.getElementById('geneNextPageBtn'),
  clearGeneFilterBtn: document.getElementById('clearGeneFilterBtn'),
  clearGeneSelectionBtn: document.getElementById('clearGeneSelectionBtn'),

  xicStatusBadge: document.getElementById('xicStatusBadge'),
  xicStatusText: document.getElementById('xicStatusText'),
  diannLoadProgress: document.getElementById('diannLoadProgress'),
  diannLoadProgressLabel: document.getElementById('diannLoadProgressLabel'),
  diannLoadProgressFill: document.getElementById('diannLoadProgressFill'),

  // Spectra Explorer
  explorerEmptyState: document.getElementById('explorerEmptyState'),
  explorerEmptyText: document.getElementById('explorerEmptyText'),
  explorerContent: document.getElementById('explorerContent'),
  explorerPgModeBtn: document.getElementById('explorerPgModeBtn'),
  explorerGeneModeBtn: document.getElementById('explorerGeneModeBtn'),
  explorerProteinFilter: document.getElementById('explorerProteinFilter'),
  explorerProteinCount: document.getElementById('explorerProteinCount'),
  explorerGeneBadge: document.getElementById('explorerGeneBadge'),
  explorerProteinList: document.getElementById('explorerProteinList'),
  explorerPeptideFilter: document.getElementById('explorerPeptideFilter'),
  explorerPeptideCount: document.getElementById('explorerPeptideCount'),
  explorerPeptideList: document.getElementById('explorerPeptideList'),
  explorerRunFilter: document.getElementById('explorerRunFilter'),
  explorerRunCount: document.getElementById('explorerRunCount'),
  explorerRunList: document.getElementById('explorerRunList'),
  explorerPrecLabel: document.getElementById('explorerPrecLabel'),
  explorerFragmap: document.getElementById('explorerFragmap'),
  explorerPlot: document.getElementById('explorerPlot'),
  explorerLegend: document.getElementById('explorerLegend'),
  explorerShowY: document.getElementById('explorerShowY'),
  explorerShowB: document.getElementById('explorerShowB'),
  explorerShowMs1: document.getElementById('explorerShowMs1'),
  explorerShowTheo: document.getElementById('explorerShowTheo'),

  // Sequence Coverage (detail panel inside explorer)
  covProtLabel: document.getElementById('covProtLabel'),
  covStats: document.getElementById('covStats'),
  covRunPanels: document.getElementById('covRunPanels'),
  covDetail: document.getElementById('covDetail'),
  covDetailEmpty: document.getElementById('covDetailEmpty'),
  covDetailEmptyText: document.getElementById('covDetailEmptyText'),

  toastContainer: document.getElementById('toastContainer')
};

/**
 * Toast Notification Helper
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// In-cell sparkline shared by both tables: bar height is relative to the row's own max; missing runs show as faint ticks.
function sparklineSVG(sampleIntensities, runs, maxIntensity) {
  const n = runs.length;
  if (!n || !(maxIntensity > 0)) return '<span style="color: var(--text-muted);">-</span>';
  const bw = 6, gap = 2, h = 28, w = n * (bw + gap) + gap;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  let rects = '';
  for (let i = 0; i < n; i++) {
    const run = runs[i];
    const val = sampleIntensities[run];
    const x = gap + i * (bw + gap);
    if (val != null && val > 0) {
      const bh = Math.max(2, Math.round((val / maxIntensity) * (h - 6)));
      rects += `<rect x="${x}" y="${h - bh}" width="${bw}" height="${bh}" rx="1"><title>${esc(run)}: ${formatScientific(val)}</title></rect>`;
    } else {
      rects += `<rect x="${x}" y="${h - 3}" width="${bw}" height="2" rx="1" class="spark-missing"><title>${esc(run)}: not detected</title></rect>`;
    }
  }
  return `<svg class="spark-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Relative sample intensities">${rects}</svg>`;
}

/**
 * Sync UI with State Settings
 */
function syncSettingsToUI() {
  const s = diannState.settings;
  elements.qValueSlider.value = s.qValue;
  elements.qValueTag.textContent = `≤ ${Number(s.qValue).toFixed(3)}`;

  elements.globalQValueSlider.value = s.globalQValue;
  elements.globalQValueTag.textContent = `≤ ${Number(s.globalQValue).toFixed(3)}`;

  elements.pgQValueSlider.value = s.pgQValue;
  elements.pgQValueTag.textContent = `≤ ${Number(s.pgQValue).toFixed(3)}`;

  elements.intensityColumnSelect.value = s.intensityColumn || 'Precursor.Normalised';
  elements.quantMethodSelect.value = s.quantMethod || 'PG.MaxLFQ';
  elements.proteotypicOnlyToggle.checked = !!s.proteotypicOnly;

  elements.proteinPageSizeSelect.value = diannState.proteinTable.pageSize;
  elements.peptidePageSizeSelect.value = diannState.peptideTable.pageSize;

  updateThemeUI();
}

/**
 * Updates Theme UI — Nebula port: the studio follows the Nebula shell theme
 * (its own toggle button was removed). Nebula Dark -> dark studio, anything
 * else -> light studio.
 */
function updateThemeUI() {
  var dark = false;
  try { dark = document.documentElement.getAttribute('data-theme') === 'dark'; } catch (e) {}
  diannState.settings.theme = dark ? 'dark' : 'light';
  applyTheme(diannState.settings.theme);
}

/**
 * Core Data Recalculation and Refresh
 */
function refreshData() {
  if (!diannState.rawRows || diannState.rawRows.length === 0) {
    elements.proteinEmptyState.style.display = 'flex';
    elements.peptideEmptyState.style.display = 'flex';
    updateKPIs();
    diannRenderSummary();
    return;
  }

  // 1. Filter precursors
  diannState.filteredRows = filterPrecursors(diannState.rawRows, diannState.settings);

  // 2. Aggregate Protein Group Matrix
  diannState.proteinMatrix = aggregateProteinMatrix(diannState.filteredRows, diannState.runs, diannState.settings);

  // 3. Aggregate Gene Matrix
  diannState.geneMatrix = aggregateGeneMatrix(diannState.filteredRows, diannState.runs, diannState.settings);
  if (diannState.selectedGene && !diannState.geneMatrix.some(g => g.gene === diannState.selectedGene)) {
    diannState.selectedGene = null;
  }

  // 4. Aggregate Peptide Matrix (for selected protein, else selected gene, else all)
  diannState.peptideMatrix = aggregatePeptideMatrix(diannState.filteredRows, diannState.runs, diannState.selectedProteinGroup, diannState.settings, diannState.selectedGene);

  // 5. Update KPIs
  updateKPIs();

  // 6. Render Tables & Charts
  renderProteinTable();
  renderPeptideTable();
  renderGeneTable();
  renderCoverage();
  diannRenderSummary();
  renderExplorer();
}

function diannRenderSummary() {
  const runs = diannState.runs;
  const nRuns = runs.length;
  const precRuns = new Map();
  const pepRuns = new Map();
  const pgRuns = new Map();
  const perRun = runs.map(() => ({ precursors: 0, peps: new Set(), pgs: new Set(), intensity: 0 }));
  const runIdx = new Map(runs.map((r, i) => [r, i]));
  const intCol = diannState.settings.intensityColumn || 'Precursor.Normalised';
  for (let i = 0; i < diannState.filteredRows.length; i++) {
    const r = diannState.filteredRows[i];
    const run = r['Run'];
    const ri = runIdx.get(run);
    if (ri == null) continue;
    const precId = r['Precursor.Id'] || `${r['Modified.Sequence'] || r['Stripped.Sequence']}_${r['Precursor.Charge']}`;
    const pep = r['Stripped.Sequence'] || r['Modified.Sequence'] || '';
    const pg = r['Protein.Group'] || r['Protein.Ids'] || '';
    perRun[ri].precursors++;
    perRun[ri].intensity += r[intCol] || 0;
    if (pep) {
      perRun[ri].peps.add(pep);
      if (!pepRuns.has(pep)) pepRuns.set(pep, new Set());
      pepRuns.get(pep).add(run);
    }
    if (pg) {
      perRun[ri].pgs.add(pg);
      if (!pgRuns.has(pg)) pgRuns.set(pg, new Set());
      pgRuns.get(pg).add(run);
    }
    if (!precRuns.has(precId)) precRuns.set(precId, new Set());
    precRuns.get(precId).add(run);
  }
  const inAll = (m) => {
    let n = 0;
    m.forEach((s) => { if (s.size === nRuns) n++; });
    return n;
  };
  elements.sumOverlapPrecursors.textContent = nRuns ? inAll(precRuns).toLocaleString() : '0';
  elements.sumOverlapPeptides.textContent = nRuns ? inAll(pepRuns).toLocaleString() : '0';
  elements.sumOverlapProteins.textContent = nRuns ? inAll(pgRuns).toLocaleString() : '0';
  const labels = shortenSampleNames(runs);
  let headHtml = '<tr><th>Sample</th><th>Precursors</th><th>Unique Peptides</th><th>Protein Groups</th><th>Total Intensity</th></tr>';
  elements.sumTableHead.innerHTML = headHtml;
  const maxPrec = Math.max.apply(null, [0].concat(perRun.map((d) => d.precursors)));
  const maxPep = Math.max.apply(null, [0].concat(perRun.map((d) => d.peps.size)));
  const maxPg = Math.max.apply(null, [0].concat(perRun.map((d) => d.pgs.size)));
  const maxInt = Math.max.apply(null, [0].concat(perRun.map((d) => d.intensity)));
  const cell = (val, max) => {
    const pct = max > 0 && val > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
    return `<td class="intensity-cell"><div class="intensity-bar-bg" style="width: ${pct}%;"></div>` +
      `<span class="intensity-val">${val.toLocaleString()}</span></td>`;
  };
  const intCell = (val, max) => {
    const pct = max > 0 && val > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
    return `<td class="intensity-cell" title="${val.toLocaleString()}"><div class="intensity-bar-bg" style="width: ${pct}%;"></div>` +
      `<span class="intensity-val">${formatCompact(val)}</span></td>`;
  };
  let grandInt = 0;
  let bodyHtml = '';
  for (let i = 0; i < nRuns; i++) {
    grandInt += perRun[i].intensity;
    bodyHtml += `<tr><td class="mono-cell" style="font-weight: 600;" title="${runs[i]}">${labels[i]}</td>` +
      cell(perRun[i].precursors, maxPrec) + cell(perRun[i].peps.size, maxPep) + cell(perRun[i].pgs.size, maxPg) + intCell(perRun[i].intensity, maxInt) + '</tr>';
  }
  bodyHtml += `<tr class="total-row"><td>Total (distinct)</td>` +
    cell(precRuns.size, maxPrec) + cell(pepRuns.size, maxPep) + cell(pgRuns.size, maxPg) + intCell(grandInt, maxInt) + '</tr>';
  elements.sumTableBody.innerHTML = bodyHtml;
}

/**
 * Update Top Metric KPI Cards
 */
function updateKPIs() {
  elements.kpiFileName.textContent = diannState.fileName || 'No file loaded';
  elements.kpiFileName.title = diannState.fileName || '';
  elements.kpiPrecursors.textContent = `${diannState.filteredRows.length.toLocaleString()} / ${diannState.rawRows.length.toLocaleString()}`;
  elements.kpiProteins.textContent = diannState.proteinMatrix.length.toLocaleString();

  // Count unique peptide stripped sequences
  const uniqueSeqs = new Set(diannState.filteredRows.map(r => r['Stripped.Sequence'] || r['Modified.Sequence'])).size;
  elements.kpiPeptides.textContent = uniqueSeqs.toLocaleString();
  elements.kpiRuns.textContent = diannState.runs.length.toString();
}

/**
 * Render Tab 1: Protein Group Table
 */
function renderProteinTable() {
  const runs = diannState.runs;
  const tState = diannState.proteinTable;

  // Build Head
  let headHtml = `<tr>
    <th style="width: 40px;">#</th>
    <th data-sort="proteinGroup" class="${tState.sortCol === 'proteinGroup' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Protein ID</th>
    <th data-sort="genes" class="${tState.sortCol === 'genes' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Gene</th>
    <th data-sort="proteinNames" class="${tState.sortCol === 'proteinNames' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Protein Name</th>
    <th data-sort="nSequences" class="${tState.sortCol === 'nSequences' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">N.Seq</th>
    <th data-sort="nProteotypicSequences" class="${tState.sortCol === 'nProteotypicSequences' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">N.Proto</th>
    <th data-sort="totalIntensity" class="${tState.sortCol === 'totalIntensity' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Total Int.</th>
    <th style="min-width: 100px;" title="Per-sample intensity profile, relative to this row's max">Profile</th>
  `;

  for (const run of runs) {
    const cleanRun = shortRunLabel(run, runs);
    const isSorted = tState.sortCol === run;
    headHtml += `<th data-sort="${run}" title="${run}" class="${isSorted ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">${cleanRun}</th>`;
  }
  headHtml += '</tr>';
  elements.proteinTableHead.innerHTML = headHtml;

  // Bind head sorting clicks
  elements.proteinTableHead.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (tState.sortCol === col) {
        tState.sortAsc = !tState.sortAsc;
      } else {
        tState.sortCol = col;
        tState.sortAsc = false;
      }
      renderProteinTable();
    });
  });

  // Filter with quick search
  let displayList = diannState.proteinMatrix;
  if (diannState.selectedGene) {
    displayList = displayList.filter(p =>
      (p.genes || '').split(';').map(g => g.trim()).includes(diannState.selectedGene)
    );
  }
  if (tState.query) {
    const q = tState.query.toLowerCase();
    displayList = displayList.filter(p =>
      (p.proteinGroup && p.proteinGroup.toLowerCase().includes(q)) ||
      (p.genes && p.genes.toLowerCase().includes(q)) ||
      (p.proteinNames && p.proteinNames.toLowerCase().includes(q)) ||
      (p.firstProteinDescription && p.firstProteinDescription.toLowerCase().includes(q))
    );
  }

  // Sort
  const col = tState.sortCol;
  const mult = tState.sortAsc ? 1 : -1;
  displayList.sort((a, b) => {
    let valA, valB;
    if (runs.includes(col)) {
      if (tState.showPeptideCounts) {
        valA = (a.samplePeptideCounts && a.samplePeptideCounts[col]) || 0;
        valB = (b.samplePeptideCounts && b.samplePeptideCounts[col]) || 0;
      } else {
        valA = a.sampleIntensities[col] || 0;
        valB = b.sampleIntensities[col] || 0;
      }
    } else {
      valA = a[col] ?? '';
      valB = b[col] ?? '';
    }
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * mult;
    }
    return (valA - valB) * mult;
  });

  // Pagination
  const total = displayList.length;
  if (total === 0) {
    elements.proteinTableBody.innerHTML = '';
    elements.proteinEmptyState.style.display = 'flex';
    elements.proteinPaginationInfo.textContent = 'No matching proteins';
    return;
  }
  elements.proteinEmptyState.style.display = 'none';

  const maxPage = Math.ceil(total / tState.pageSize) || 1;
  if (tState.page > maxPage) tState.page = maxPage;
  const startIdx = (tState.page - 1) * tState.pageSize;
  const pageRows = displayList.slice(startIdx, startIdx + tState.pageSize);

  // Build Body Rows
  let bodyHtml = '';
  pageRows.forEach((p, idx) => {
    const isSelected = p.proteinGroup === diannState.selectedProteinGroup;
    bodyHtml += `<tr class="${isSelected ? 'selected' : ''}" data-pg="${p.proteinGroup}">
      <td style="color: var(--text-muted); font-size: 0.75rem;">${startIdx + idx + 1}</td>
      <td class="mono-cell" style="font-weight: 600; color: var(--accent-primary);">${p.proteinGroup}</td>
      <td>${p.genes ? `<span style="font-weight: 600;">${p.genes}</span>` : '<span style="color: var(--text-muted);">-</span>'}</td>
      <td title="${p.firstProteinDescription || p.proteinNames}">${p.proteinNames || p.firstProteinDescription || '-'}</td>
      <td style="text-align: center; font-family: var(--font-body); font-variant-numeric: tabular-nums;">${p.nSequences}</td>
      <td style="text-align: center; font-family: var(--font-body); font-variant-numeric: tabular-nums;">${p.nProteotypicSequences}</td>
      <td class="mono-cell" style="text-align: right; font-weight: 600;">${formatCompact(p.totalIntensity)}</td>
      ${tState.showPeptideCounts
        ? `<td class="spark-cell" title="Relative peptide counts across samples">${sparklineSVG(p.samplePeptideCounts, runs, p.maxPeptideCount)}</td>`
        : `<td class="spark-cell" title="Relative profile across samples (row max = ${formatScientific(p.maxIntensity)})">${sparklineSVG(p.sampleIntensities, runs, p.maxIntensity)}</td>`}
    `;

    // Samples
    for (const run of runs) {
      if (tState.showPeptideCounts) {
        const n = (p.samplePeptideCounts && p.samplePeptideCounts[run]) || 0;
        const pct = p.maxPeptideCount > 0 && n > 0 ? Math.min(100, Math.round((n / p.maxPeptideCount) * 100)) : 0;
        bodyHtml += `<td class="intensity-cell" title="${run}: ${n} peptide${n === 1 ? '' : 's'}">` +
          (n > 0 ? `<div class="intensity-bar-bg" style="width: ${pct}%;"></div>` : '') +
          `<span class="intensity-val" style="color: ${n > 0 ? 'inherit' : 'var(--text-muted)'};">${n}</span></td>`;
        continue;
      }
      const val = p.sampleIntensities[run];
      const hasVal = val != null && val > 0;
      const pct = p.maxIntensity > 0 && hasVal ? Math.min(100, Math.round((val / p.maxIntensity) * 100)) : 0;
      bodyHtml += `<td class="intensity-cell" title="${hasVal ? `${run}: ${formatScientific(val)}` : 'Not detected'}">
        ${hasVal ? `<div class="intensity-bar-bg" style="width: ${pct}%;"></div>` : ''}
        <span class="intensity-val" style="color: ${hasVal ? 'inherit' : 'var(--text-muted)'};">${formatCompact(val)}</span>
      </td>`;
    }
    bodyHtml += '</tr>';
  });

  elements.proteinTableBody.innerHTML = bodyHtml;

  // Row selection handler
  elements.proteinTableBody.querySelectorAll('tr[data-pg]').forEach(tr => {
    tr.addEventListener('click', () => {
      const pg = tr.getAttribute('data-pg');
      selectProteinGroup(pg);
    });
  });

  // Update Pagination Controls
  elements.proteinPaginationInfo.textContent = `Showing ${startIdx + 1}–${Math.min(startIdx + tState.pageSize, total)} of ${total.toLocaleString()} proteins`;
  elements.proteinCurrentPageTag.textContent = `Page ${tState.page} of ${maxPage}`;
  elements.proteinPrevPageBtn.disabled = tState.page <= 1;
  elements.proteinNextPageBtn.disabled = tState.page >= maxPage;
}

function renderGeneTable() {
  const runs = diannState.runs;
  const tState = diannState.geneTable;

  // Build Head
  let headHtml = `<tr>
    <th style="width: 40px;">#</th>
    <th data-sort="gene" class="${tState.sortCol === 'gene' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Gene</th>
    <th data-sort="nProteinGroups" class="${tState.sortCol === 'nProteinGroups' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">N.PG</th>
    <th data-sort="proteinNames" class="${tState.sortCol === 'proteinNames' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Protein Name</th>
    <th data-sort="nSequences" class="${tState.sortCol === 'nSequences' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">N.Seq</th>
    <th data-sort="nProteotypicSequences" class="${tState.sortCol === 'nProteotypicSequences' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">N.Proto</th>
    <th data-sort="totalIntensity" class="${tState.sortCol === 'totalIntensity' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Total Int.</th>
    <th style="min-width: 100px;" title="Per-sample intensity profile, relative to this row's max">Profile</th>
  `;

  for (const run of runs) {
    const cleanRun = shortRunLabel(run, runs);
    const isSorted = tState.sortCol === run;
    headHtml += `<th data-sort="${run}" title="${run}" class="${isSorted ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">${cleanRun}</th>`;
  }
  headHtml += '</tr>';
  elements.geneTableHead.innerHTML = headHtml;

  // Bind head sorting clicks
  elements.geneTableHead.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (tState.sortCol === col) {
        tState.sortAsc = !tState.sortAsc;
      } else {
        tState.sortCol = col;
        tState.sortAsc = false;
      }
      renderGeneTable();
    });
  });

  // Filter with quick search
  let displayList = diannState.geneMatrix;
  if (tState.query) {
    const q = tState.query.toLowerCase();
    displayList = displayList.filter(g =>
      (g.gene && g.gene.toLowerCase().includes(q)) ||
      (g.proteinGroupList && g.proteinGroupList.toLowerCase().includes(q)) ||
      (g.proteinNames && g.proteinNames.toLowerCase().includes(q))
    );
  }

  // Sort
  const col = tState.sortCol;
  const mult = tState.sortAsc ? 1 : -1;
  displayList.sort((a, b) => {
    let valA, valB;
    if (runs.includes(col)) {
      if (tState.showPeptideCounts) {
        valA = (a.samplePeptideCounts && a.samplePeptideCounts[col]) || 0;
        valB = (b.samplePeptideCounts && b.samplePeptideCounts[col]) || 0;
      } else {
        valA = a.sampleIntensities[col] || 0;
        valB = b.sampleIntensities[col] || 0;
      }
    } else {
      valA = a[col] ?? '';
      valB = b[col] ?? '';
    }
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * mult;
    }
    return (valA - valB) * mult;
  });

  // Pagination
  const total = displayList.length;
  if (total === 0) {
    elements.geneTableBody.innerHTML = '';
    elements.geneEmptyState.style.display = 'flex';
    elements.genePaginationInfo.textContent = 'No matching genes';
    return;
  }
  elements.geneEmptyState.style.display = 'none';

  const maxPage = Math.ceil(total / tState.pageSize) || 1;
  if (tState.page > maxPage) tState.page = maxPage;
  const startIdx = (tState.page - 1) * tState.pageSize;
  const pageRows = displayList.slice(startIdx, startIdx + tState.pageSize);

  // Build Body Rows
  let bodyHtml = '';
  const selProtGenes = diannState.selectedProteinGroup
    ? (((diannState.proteinMatrix.find(p => p.proteinGroup === diannState.selectedProteinGroup) || {}).genes || '').split(';').map(g => g.trim()).filter(Boolean))
    : [];
  pageRows.forEach((g, idx) => {
    const isSelected = g.gene === diannState.selectedGene;
    const isLinked = !isSelected && selProtGenes.includes(g.gene);
    bodyHtml += `<tr class="${isSelected ? 'selected' : isLinked ? 'linked' : ''}" data-gene="${g.gene}">
      <td style="color: var(--text-muted); font-size: 0.75rem;">${startIdx + idx + 1}</td>
      <td class="mono-cell" style="font-weight: 600; color: var(--accent-primary);" title="${g.proteinGroupList || g.gene}">${g.gene}</td>
      <td style="text-align: center; font-family: var(--font-body); font-variant-numeric: tabular-nums;">${g.nProteinGroups}</td>
      <td title="${g.proteinNames || '-'}">${g.proteinNames || '-'}</td>
      <td style="text-align: center; font-family: var(--font-body); font-variant-numeric: tabular-nums;">${g.nSequences}</td>
      <td style="text-align: center; font-family: var(--font-body); font-variant-numeric: tabular-nums;">${g.nProteotypicSequences}</td>
      <td class="mono-cell" style="text-align: right; font-weight: 600;">${formatCompact(g.totalIntensity)}</td>
      ${tState.showPeptideCounts
        ? `<td class="spark-cell" title="Relative peptide counts across samples">${sparklineSVG(g.samplePeptideCounts, runs, g.maxPeptideCount)}</td>`
        : `<td class="spark-cell" title="Relative profile across samples (row max = ${formatScientific(g.maxIntensity)})">${sparklineSVG(g.sampleIntensities, runs, g.maxIntensity)}</td>`}
    `;

    // Samples
    for (const run of runs) {
      if (tState.showPeptideCounts) {
        const n = (g.samplePeptideCounts && g.samplePeptideCounts[run]) || 0;
        const pct = g.maxPeptideCount > 0 && n > 0 ? Math.min(100, Math.round((n / g.maxPeptideCount) * 100)) : 0;
        bodyHtml += `<td class="intensity-cell" title="${run}: ${n} peptide${n === 1 ? '' : 's'}">` +
          (n > 0 ? `<div class="intensity-bar-bg" style="width: ${pct}%;"></div>` : '') +
          `<span class="intensity-val" style="color: ${n > 0 ? 'inherit' : 'var(--text-muted)'};">${n}</span></td>`;
        continue;
      }
      const val = g.sampleIntensities[run];
      const hasVal = val != null && val > 0;
      const pct = g.maxIntensity > 0 && hasVal ? Math.min(100, Math.round((val / g.maxIntensity) * 100)) : 0;
      bodyHtml += `<td class="intensity-cell" title="${hasVal ? `${run}: ${formatScientific(val)}` : 'Not detected'}">
        ${hasVal ? `<div class="intensity-bar-bg" style="width: ${pct}%;"></div>` : ''}
        <span class="intensity-val" style="color: ${hasVal ? 'inherit' : 'var(--text-muted)'};">${formatCompact(val)}</span>
      </td>`;
    }
    bodyHtml += '</tr>';
  });

  elements.geneTableBody.innerHTML = bodyHtml;

  // Row selection handler
  elements.geneTableBody.querySelectorAll('tr[data-gene]').forEach(tr => {
    tr.addEventListener('click', () => {
      selectGene(tr.getAttribute('data-gene'));
    });
  });

  // Update Pagination Controls
  elements.genePaginationInfo.textContent = `Showing ${startIdx + 1}–${Math.min(startIdx + tState.pageSize, total)} of ${total.toLocaleString()} genes`;
  elements.geneCurrentPageTag.textContent = `Page ${tState.page} of ${maxPage}`;
  elements.genePrevPageBtn.disabled = tState.page <= 1;
  elements.geneNextPageBtn.disabled = tState.page >= maxPage;
}

function updatePeptideBadge() {
  const p = diannState.selectedProteinGroup
    ? diannState.proteinMatrix.find(item => item.proteinGroup === diannState.selectedProteinGroup)
    : null;
  if (p) {
    elements.selectedProteinLabel.innerHTML = `<strong>${p.proteinGroup}</strong> (${p.genes || p.proteinNames || 'No Gene'}) — ${p.nSequences} peptides`;
    return;
  }
  const g = diannState.selectedGene
    ? diannState.geneMatrix.find(item => item.gene === diannState.selectedGene)
    : null;
  if (g) {
    elements.selectedProteinLabel.innerHTML = `<strong>Gene ${g.gene}</strong> (${g.nProteinGroups} proteins) — ${diannState.peptideMatrix.length.toLocaleString()} peptides`;
    return;
  }
  elements.selectedProteinLabel.textContent = 'None selected (showing all peptides)';
}

/**
 * Handle Protein Selection
 */
function selectProteinGroup(pg) {
  diannState.selectedProteinGroup = pg;
  diannState.selectedPrecursorId = null;

  // Update Peptide Table for this protein
  diannState.peptideMatrix = aggregatePeptideMatrix(diannState.filteredRows, diannState.runs, diannState.selectedProteinGroup, diannState.settings, diannState.selectedGene);
  diannState.peptideTable.page = 1;
  updatePeptideBadge();

  // Highlight row in protein table
  elements.proteinTableBody.querySelectorAll('tr').forEach(tr => {
    if (tr.getAttribute('data-pg') === pg) {
      tr.classList.add('selected');
    } else {
      tr.classList.remove('selected');
    }
  });

  renderPeptideTable();
  renderCoverage();
  renderExplorer();
}

/**
 * Clear Protein Selection (Show All Peptides)
 */
function clearProteinSelection() {
  diannState.selectedProteinGroup = null;
  diannState.selectedPrecursorId = null;
  diannState.selectedGene = null;
  elements.selectedProteinLabel.textContent = 'None selected (showing all peptides)';
  diannState.peptideMatrix = aggregatePeptideMatrix(diannState.filteredRows, diannState.runs, null, diannState.settings);
  diannState.peptideTable.page = 1;

  elements.proteinTableBody.querySelectorAll('tr.selected').forEach(tr => tr.classList.remove('selected'));
  renderProteinTable();
  renderPeptideTable();
  renderGeneTable();
  renderCoverage();
  renderExplorer();
}

function filterProteinList(query) {
  const q = (query || '').trim().toLowerCase();
  return diannState.proteinMatrix.filter((p) => {
    if (diannState.selectedGene && !(p.genes || '').split(';').map(g => g.trim()).includes(diannState.selectedGene)) return false;
    if (!q) return true;
    return ((p.proteinGroup || '') + ' ' + (p.genes || '') + ' ' + (p.proteinNames || '')).toLowerCase().includes(q);
  });
}

function updateGeneBadge(el) {
  if (!el) return;
  if (diannState.selectedGene) {
    el.style.display = 'block';
    el.textContent = `Gene ${diannState.selectedGene} ×`;
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function selectGene(gene) {
  diannState.selectedGene = (diannState.selectedGene === gene) ? null : gene;
  diannState.selectedProteinGroup = null;
  diannState.selectedPrecursorId = null;
  diannState.peptideMatrix = aggregatePeptideMatrix(diannState.filteredRows, diannState.runs, null, diannState.settings, diannState.selectedGene);
  diannState.peptideTable.page = 1;
  updatePeptideBadge();

  renderProteinTable();
  renderPeptideTable();
  renderGeneTable();
  renderCoverage();
  renderExplorer();
}

function explorerRowHtml(kind, key, label, title, selected, spark) {
  return `<div class="explorer-row${selected ? ' selected' : ''}" data-x${kind}="${key}" title="${title || label}"><span class="xrow-label">${label}</span>${spark ? `<span class="xrow-spark">${spark}</span>` : ''}</div>`;
}

function pgRowSpark(p, pgMode, geneMap) {
  let src = p;
  if (pgMode === 'gene') {
    const toks = (p.genes || '').split(';').map(g => g.trim()).filter(Boolean);
    if (toks.length === 1 && geneMap.has(toks[0])) src = geneMap.get(toks[0]);
  }
  return sparklineSVG(src.sampleIntensities || {}, diannState.runs, src.maxIntensity || 0);
}

function showDetailEmpty(message) {
  elements.covDetail.style.display = 'none';
  elements.covDetailEmpty.style.display = 'flex';
  elements.covDetailEmptyText.textContent = message;
}

function showDetail() {
  elements.covDetail.style.display = 'flex';
  elements.covDetailEmpty.style.display = 'none';
}

const XCOL_DEFAULTS = [210, 270, 200];
const XCOL_MIN = 140;

function xcolWidths() {
  try {
    const w = JSON.parse(localStorage.getItem('diann.xcolW') || 'null');
    if (Array.isArray(w) && w.length === 3 && w.every(v => typeof v === 'number' && v >= 100 && v <= 1200)) return w;
  } catch (e) { /* fall through to defaults */ }
  return XCOL_DEFAULTS.slice();
}

function applyXcolWidths() {
  const w = xcolWidths();
  document.querySelectorAll('#explorerContent .explorer-col').forEach((col, i) => {
    if (w[i] != null) col.style.width = w[i] + 'px';
  });
}

function initXcolDrag() {
  const grid = document.getElementById('explorerContent');
  if (!grid || grid.dataset.xdrag) return;
  grid.dataset.xdrag = '1';
  grid.querySelectorAll('.xcol-handle').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      h.classList.add('dragging');
      const idx = Number(h.getAttribute('data-handle'));
      const col = grid.querySelectorAll('.explorer-col')[idx];
      if (!col) return;
      const startX = e.clientX;
      const startW = col.getBoundingClientRect().width;
      const move = (ev) => {
        const maxW = Math.max(220, grid.clientWidth - 420);
        col.style.width = Math.min(maxW, Math.max(XCOL_MIN, Math.round(startW + ev.clientX - startX))) + 'px';
      };
      const up = () => {
        h.classList.remove('dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const w = xcolWidths();
        w[idx] = Math.round(col.getBoundingClientRect().width);
        try { localStorage.setItem('diann.xcolW', JSON.stringify(w)); } catch (err) { /* ignore */ }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}

async function renderExplorer() {
  const ex = diannState.explorer;
  if (!diannState.proteinMatrix.length) {
    elements.explorerEmptyState.style.display = 'flex';
    elements.explorerEmptyText.textContent = 'Load a dataset to browse proteins, peptides and runs.';
    elements.explorerContent.style.display = 'none';
    return;
  }
  elements.explorerEmptyState.style.display = 'none';
  elements.explorerContent.style.display = 'flex';

  elements.explorerPgModeBtn.classList.toggle('active', ex.pgMode === 'pg');
  elements.explorerGeneModeBtn.classList.toggle('active', ex.pgMode === 'gene');

  const plist = filterProteinList(ex.pgQuery);
  elements.explorerProteinCount.textContent = `${plist.length} / ${diannState.proteinMatrix.length}`;
  updateGeneBadge(elements.explorerGeneBadge);
  if (diannState.activeTab === 'diann-explorer-tab' && !diannState.selectedProteinGroup && plist.length) {
    selectProteinGroup(plist[0].proteinGroup);
    return;
  }
  const geneMap = new Map(diannState.geneMatrix.map(g => [g.gene, g]));
  let pgHtml = '';
  plist.forEach((p) => {
    const label = ex.pgMode === 'gene' ? (p.genes || p.proteinGroup) : p.proteinGroup;
    const spark = pgRowSpark(p, ex.pgMode, geneMap);
    pgHtml += explorerRowHtml('pg', p.proteinGroup, label, `${p.proteinGroup} · ${p.genes || ''} · ${p.proteinNames || ''}`, p.proteinGroup === diannState.selectedProteinGroup, spark);
  });
  elements.explorerProteinList.innerHTML = pgHtml || '<div class="explorer-prompt">No proteins match</div>';
  elements.explorerProteinList.querySelectorAll('[data-xpg]').forEach((el) => {
    el.addEventListener('click', () => selectProteinGroup(el.getAttribute('data-xpg')));
  });

  const selPG = diannState.selectedProteinGroup;
  const pepQ = ex.pepQuery.trim().toLowerCase();
  const peps = selPG ? diannState.peptideMatrix.filter((p) => {
    if (p.proteinGroup !== selPG) return false;
    if (!pepQ) return true;
    return ((p.precursorId || '') + ' ' + (p.strippedSequence || '') + ' ' + (p.modifiedSequence || '')).toLowerCase().includes(pepQ);
  }) : [];
  const totalPeps = selPG ? diannState.peptideMatrix.filter((p) => p.proteinGroup === selPG).length : 0;
  if (diannState.activeTab === 'diann-explorer-tab' && selPG && !diannState.selectedPrecursorId && peps.length) {
    selectPrecursor(peps[0].precursorId);
    return;
  }
  elements.explorerPeptideCount.textContent = selPG ? `${peps.length} / ${totalPeps}` : '0';
  let pepHtml = '';
  if (!selPG) {
    pepHtml = '<div class="explorer-prompt">Select a protein first</div>';
  } else {
    peps.forEach((p) => {
      const spark = sparklineSVG(p.sampleIntensities || {}, diannState.runs, p.maxIntensity || 0);
      pepHtml += explorerRowHtml('pep', p.precursorId, p.precursorId, `${p.strippedSequence} · z${p.charge}`, p.precursorId === diannState.selectedPrecursorId, spark);
    });
    if (!pepHtml) pepHtml = '<div class="explorer-prompt">No precursors match</div>';
  }
  elements.explorerPeptideList.innerHTML = pepHtml;
  elements.explorerPeptideList.querySelectorAll('[data-xpep]').forEach((el) => {
    el.addEventListener('click', () => selectPrecursor(el.getAttribute('data-xpep')));
  });

  const runQ = ex.runQuery.trim().toLowerCase();
  const runList = diannState.runs.filter((r) => !runQ || r.toLowerCase().includes(runQ) || shortRunLabel(r, diannState.runs).toLowerCase().includes(runQ));
  if (ex.run && ex.run !== '*' && !diannState.runs.includes(ex.run)) ex.run = null;
  if (!ex.run) {
    ex.run = runList.find((r) => diannState.xicCache[r]) || runList[0] || null;
  }
  elements.explorerRunCount.textContent = `${runList.length} / ${diannState.runs.length}`;
  let runHtml = '';
  runList.forEach((r) => {
    const hasXic = !!(diannState.xicCache[r] || diannState.xicBuffers[r] || diannState.xicFiles[r]);
    runHtml += `<div class="explorer-row${ex.run === r ? ' selected' : ''}" data-xrun="${r}" title="${r}">${hasXic ? '' : '○ '}${shortRunLabel(r, diannState.runs)}</div>`;
  });
  runHtml += `<div class="explorer-row${ex.run === '*' ? ' selected' : ''}" data-xrun="*" title="One chromatogram panel per sample">★ All samples</div>`;
  elements.explorerRunList.innerHTML = runHtml || '<div class="explorer-prompt">No runs</div>';
  elements.explorerRunList.querySelectorAll('[data-xrun]').forEach((el) => {
    el.addEventListener('click', () => { ex.run = el.getAttribute('data-xrun'); renderExplorer(); renderCoverage(); });
  });

  const precId = diannState.selectedPrecursorId && peps.some((p) => p.precursorId === diannState.selectedPrecursorId)
    ? diannState.selectedPrecursorId
    : (peps.length ? peps[0].precursorId : null);
  const isAll = ex.run === '*';
  const wantRuns = isAll
    ? runList.filter((r) => diannState.xicCache[r] || diannState.xicBuffers[r] || diannState.xicFiles[r])
    : [ex.run].filter((r) => r && diannState.runs.includes(r));
  if (!precId || !wantRuns.length) {
    elements.explorerPrecLabel.textContent = !precId ? 'Select a precursor from the list' : 'Select a run from the list';
    elements.explorerFragmap.innerHTML = '';
    elements.explorerPlot.innerHTML = '';
    elements.explorerLegend.innerHTML = '';
    return;
  }
  const indexedTraces = new Map();
  if (precId) {
    for (const r of wantRuns) {
      if (!diannState.xicCache[r] && (diannState.xicFiles[r] || diannState.xicBuffers[r])) {
        try {
          const t = await readXicTracesFor(r, precId);
          if (t) indexedTraces.set(r, t);
        } catch (e) {
          console.error('Error reading indexed XIC:', e);
        }
      }
    }
  }
  updateXICStatus();
  const readyRuns = wantRuns.filter((r) => diannState.xicCache[r] || indexedTraces.has(r));
  if (!readyRuns.length) {
    elements.explorerPrecLabel.textContent = diannState.lastXicNote || 'No XIC data — spectra need per-run .xic.parquet files (use Open result folder)';
    elements.explorerFragmap.innerHTML = '';
    elements.explorerPlot.innerHTML = '';
    elements.explorerLegend.innerHTML = '';
    return;
  }
  if (isAll) {
    renderExplorerAll(precId, readyRuns, indexedTraces);
    return;
  }
  const run = ex.run;
  const pepEntry = diannState.peptideMatrix.find((p) => p.precursorId === precId);
  const stripped = pepEntry ? pepEntry.strippedSequence : '';
  const allTraces = indexedTraces.has(run)
    ? indexedTraces.get(run)
    : (diannState.xicCache[run] ? groupXICTraces(diannState.xicCache[run], precId) : []);
  const traces = allTraces.filter((t) => {
    if (t.feature === 'ms1') return ex.showMs1;
    const frag = parseFragmentFeature(t.feature);
    if (!frag) return true;
    if (frag.type === 'y') return ex.showY;
    if (frag.type === 'b') return ex.showB;
    return true;
  });
  let yMax = 0;
  let ms1Max = 0;
  let rtMin = Infinity;
  let rtMax = -Infinity;
  traces.forEach((t, idx) => {
    t.color = xicFeatureColor(t.feature, idx);
    t.pts.forEach((p) => {
      if (t.feature === 'ms1') {
        if (p[1] > ms1Max) ms1Max = p[1];
      } else if (p[1] > yMax) {
        yMax = p[1];
      }
      if (p[1] > 0) {
        if (p[0] < rtMin) rtMin = p[0];
        if (p[0] > rtMax) rtMax = p[0];
      }
    });
  });
  const useMs1Axis = ex.showMs1 && ms1Max > 0;
  if (!(yMax > 0) && !useMs1Axis) {
    elements.explorerPrecLabel.innerHTML = `<strong>${precId}</strong>`;
    elements.explorerFragmap.innerHTML = '';
    elements.explorerPlot.innerHTML = '<div class="xic-panel-empty">' +
      (diannState.lastXicNote || 'No signal with current ion filters') + '</div>';
    elements.explorerLegend.innerHTML = '';
    return;
  }
  if (!(rtMax > rtMin)) {
    rtMin = 0;
    rtMax = 1;
  }
  const pad = (rtMax - rtMin) * 0.04;
  rtMin -= pad;
  rtMax += pad;
  elements.explorerPrecLabel.innerHTML = `<strong>${precId}</strong> <span style="color: var(--text-muted); font-weight: 400;">${shortRunLabel(run, diannState.runs)} · peak ${formatCompact(yMax)}</span>`;
  const featMax = {};
  traces.forEach((t) => {
    let m = 0;
    t.pts.forEach((p) => { if (p[1] > m) m = p[1]; });
    featMax[t.feature] = m;
  });
  elements.explorerLegend.innerHTML = traces.map((t) => {
    const peak = featMax[t.feature] || 0;
    return `<span class="cov-legend-item"><span class="cov-swatch" style="background: ${t.color}; border-color: transparent;"></span>${t.feature} · ${formatCompactTick(peak)}${t.feature === 'ms1' ? ' (right axis)' : ''}</span>`;
  }).join('');
  if (stripped) {
    const bMap = {};
    const yMap = {};
    let maxI = 0;
    traces.forEach((t) => {
      const frag = parseFragmentFeature(t.feature);
      if (!frag || frag.n < 1 || frag.n >= stripped.length) return;
      const target = frag.type === 'b' ? bMap : yMap;
      const key = frag.type === 'b' ? frag.n : stripped.length - frag.n;
      let e = target[key];
      if (!e) {
        e = { charges: [], max: 0, color: t.color };
        target[key] = e;
      }
      e.charges.push(frag.charge);
      const m = featMax[t.feature] || 0;
      if (m > e.max) {
        e.max = m;
        e.color = t.color;
      }
      if (e.max > maxI) maxI = e.max;
    });
    elements.explorerFragmap.innerHTML = fragmapSVG(stripped, bMap, yMap, maxI, ex.showTheo);
  } else {
    elements.explorerFragmap.innerHTML = '';
  }
  if (window.Plotly) {
    elements.explorerPlot.classList.remove('xic-grid-panels');
    elements.explorerPlot.style.height = '';
    elements.explorerPlot.innerHTML = '';
    renderExplorerPlot(traces, rtMin, rtMax, yMax, useMs1Axis ? ms1Max : 0, diannState.settings.theme === 'dark');
  } else {
    ensurePlotly();
    elements.explorerPlot.classList.remove('xic-grid-panels');
    elements.explorerPlot.style.height = '';
    elements.explorerPlot.innerHTML = xicPanelSVG(shortRunLabel(run, diannState.runs), run, traces.filter((t) => t.feature !== 'ms1'), rtMin, rtMax, yMax > 0 ? yMax : 1);
  }
}

function renderExplorerPlot(traces, rtMin, rtMax, yMax, ms1Max, isDark) {
  const div = elements.explorerPlot;
  if (!div || !window.Plotly) return;
  elements.explorerPlot.innerHTML = '';
  const palExp = (!isDark && typeof diannLightPalette === 'function') ? diannLightPalette() : null;
  const fg = isDark ? '#e2e8f0' : (palExp ? palExp.text : '#1e293b');
  const muted = isDark ? '#94a3b8' : (palExp ? palExp.secondary : '#64748b');
  const apexColor = isDark ? '#0f172a' : (palExp ? palExp.text : '#0f172a');
  const useMs1Axis = ms1Max > 0;
  const data = traces.map((t) => ({
    x: t.pts.map((p) => p[0]),
    y: t.pts.map((p) => p[1]),
    mode: 'lines',
    name: t.feature,
    yaxis: t.feature === 'ms1' && useMs1Axis ? 'y2' : 'y',
    line: { color: t.color || muted, width: 1.5 },
    hovertemplate: `${t.feature}<br>RT %{x:.2f} min<br>Int %{y}<extra></extra>`
  }));
  let apex = null;
  traces.forEach((t) => {
    if (t.feature === 'ms1' && useMs1Axis) return;
    t.pts.forEach((p) => {
      if (!apex || p[1] > apex[1]) apex = p;
    });
  });
  if (!apex) {
    traces.forEach((t) => t.pts.forEach((p) => {
      if (!apex || p[1] > apex[1]) apex = p;
    }));
  }
  if (apex) {
    data.push({
      x: [apex[0]], y: [apex[1]], mode: 'markers', name: 'apex',
      marker: { size: 7, color: apexColor },
      hovertemplate: `apex %{x:.2f} min<br>Int %{y}<extra></extra>`,
      showlegend: false
    });
  }
  const layout = {
    height: div.clientHeight || 420,
    margin: { l: 56, r: useMs1Axis ? 56 : 10, t: 10, b: 40 },
    font: { color: fg },
    xaxis: { title: { text: 'RT (min)', font: { size: 11 } }, range: [rtMin, rtMax], tickfont: { size: 10, color: muted }, showgrid: false },
    yaxis: { title: { text: 'Intensity', font: { size: 11 } }, range: [0, yMax > 0 ? yMax : 1], tickfont: { size: 10, color: muted }, showgrid: false },
    showlegend: false,
    hovermode: 'closest',
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)'
  };
  if (useMs1Axis) {
    layout.yaxis2 = {
      title: { text: 'MS1 intensity', font: { size: 11 } },
      overlaying: 'y', side: 'right', range: [0, ms1Max],
      tickfont: { size: 10, color: muted }, showgrid: false
    };
  }
  window.Plotly.newPlot(div, data, layout, { responsive: true, displaylogo: false, displayModeBar: true, scrollZoom: true });
}

function renderExplorerAll(precId, readyRuns, indexedTraces) {
  const ex = diannState.explorer;
  const pepEntry = diannState.peptideMatrix.find((p) => p.precursorId === precId);
  const stripped = pepEntry ? pepEntry.strippedSequence : '';
  const perRun = [];
  const featOrder = [];
  const featSeen = new Set();
  readyRuns.forEach((run, i) => {
    const all = (indexedTraces && indexedTraces.get(run)) ||
      (diannState.xicCache[run] ? groupXICTraces(diannState.xicCache[run], precId) : []);
    const traces = all.filter((t) => {
      if (t.feature === 'ms1') return ex.showMs1;
      const frag = parseFragmentFeature(t.feature);
      if (!frag) return true;
      if (frag.type === 'y') return ex.showY;
      if (frag.type === 'b') return ex.showB;
      return true;
    });
    traces.forEach((t) => {
      if (!featSeen.has(t.feature)) {
        featSeen.add(t.feature);
        featOrder.push(t.feature);
      }
    });
    perRun.push({ run, traces, color: XIC_PALETTE[i % XIC_PALETTE.length] });
  });
  perRun.forEach(({ traces }) => {
    traces.forEach((t) => {
      t.color = xicFeatureColor(t.feature, featOrder.indexOf(t.feature));
    });
  });
  let yMax = 0;
  let ms1Max = 0;
  perRun.forEach(({ traces }) => {
    traces.forEach((t) => {
      t.pts.forEach((p) => {
        if (t.feature === 'ms1') {
          if (p[1] > ms1Max) ms1Max = p[1];
        } else if (p[1] > yMax) {
          yMax = p[1];
        }
      });
    });
  });
  const useMs1Axis = ex.showMs1 && ms1Max > 0;
  if (!(yMax > 0) && !useMs1Axis) {
    elements.explorerPrecLabel.innerHTML = `<strong>${precId}</strong>`;
    elements.explorerFragmap.innerHTML = '';
    elements.explorerPlot.innerHTML = '<div class="xic-panel-empty">' +
      (diannState.lastXicNote || 'No signal with current ion filters') + '</div>';
    elements.explorerLegend.innerHTML = '';
    return;
  }
  elements.explorerPrecLabel.innerHTML = `<strong>${precId}</strong> <span style="color: var(--text-muted); font-weight: 400;">all ${readyRuns.length} samples · peak ${formatCompact(yMax)}</span>`;
  elements.explorerLegend.innerHTML = featOrder.filter((f) => f !== 'ms1' || ex.showMs1).map((f) => {
    const idx = featOrder.indexOf(f);
    const peak = perRun.reduce((m, pr) => {
      const t = pr.traces.find((x) => x.feature === f);
      if (!t) return m;
      t.pts.forEach((p) => { if (p[1] > m) m = p[1]; });
      return m;
    }, 0);
    return `<span class="cov-legend-item"><span class="cov-swatch" style="background: ${xicFeatureColor(f, idx)}; border-color: transparent;"></span>${f} · ${formatCompactTick(peak)}${f === 'ms1' ? ' (right axis)' : ''}</span>`;
  }).join('');
  if (stripped) {
    const bMap = {};
    const yMap = {};
    let maxI = 0;
    perRun.forEach(({ traces }) => {
      traces.forEach((t) => {
        const frag = parseFragmentFeature(t.feature);
        if (!frag || frag.n < 1 || frag.n >= stripped.length) return;
        const target = frag.type === 'b' ? bMap : yMap;
        const key = frag.type === 'b' ? frag.n : stripped.length - frag.n;
        let e = target[key];
        if (!e) {
          e = { charges: [], max: 0, color: t.color };
          target[key] = e;
        }
        e.charges.push(frag.charge);
        let m = 0;
        t.pts.forEach((p) => { if (p[1] > m) m = p[1]; });
        if (m > e.max) {
          e.max = m;
          e.color = t.color;
        }
        if (e.max > maxI) maxI = e.max;
      });
    });
    elements.explorerFragmap.innerHTML = fragmapSVG(stripped, bMap, yMap, maxI, ex.showTheo);
  } else {
    elements.explorerFragmap.innerHTML = '';
  }
  const isDark = diannState.settings.theme === 'dark';
  perRun.forEach((item) => {
    let rtMin = Infinity;
    let rtMax = -Infinity;
    item.traces.forEach((t) => {
      t.pts.forEach((p) => {
        if (p[1] > 0) {
          if (p[0] < rtMin) rtMin = p[0];
          if (p[0] > rtMax) rtMax = p[0];
        }
      });
    });
    if (!(rtMax > rtMin)) {
      rtMin = 0;
      rtMax = 1;
    }
    const pad = (rtMax - rtMin) * 0.04;
    item.rtMin = rtMin - pad;
    item.rtMax = rtMax + pad;
  });
  elements.explorerPlot.classList.add('xic-grid-panels');
  elements.explorerPlot.style.height = 'auto';
  renderXicPanels(elements.explorerPlot, 'xplPlot', perRun, diannState.runs, yMax, isDark, useMs1Axis ? ms1Max : 0, 260, 'diann-explorer-tab');
}

function selectPrecursor(precId) {
  diannState.selectedPrecursorId = precId;
  elements.peptideTableBody.querySelectorAll('tr[data-prec]').forEach(tr => {
    tr.classList.toggle('selected', tr.getAttribute('data-prec') === precId);
  });
  if (diannState.coverage) {
    const pep = diannState.peptideMatrix.find(p => p.precursorId === precId);
    diannState.coverage.selectedSeq = pep ? pep.strippedSequence : null;
  }
  renderExplorer();
  renderCoverageRunPanels(true);
}

function setXICStatus(text, ok) {
  elements.xicStatusText.textContent = text;
  elements.xicStatusBadge.className = 'file-status-badge' + (ok ? ' success' : '');
}

function setDiannLoadProgress(frac, label) {
  const wrap = elements.diannLoadProgress;
  const lab = elements.diannLoadProgressLabel;
  const fill = elements.diannLoadProgressFill;
  if (!wrap || !lab || !fill) return;
  wrap.style.display = 'block';
  if (label) lab.textContent = label;
  if (frac == null || !(frac >= 0)) {
    fill.classList.add('indeterminate');
  } else {
    fill.classList.remove('indeterminate');
    fill.style.width = Math.max(0, Math.min(100, frac * 100)).toFixed(1) + '%';
  }
}

function hideDiannLoadProgress() {
  const wrap = elements.diannLoadProgress;
  const fill = elements.diannLoadProgressFill;
  if (!wrap) return;
  wrap.style.display = 'none';
  if (fill) {
    fill.classList.remove('indeterminate');
    fill.style.width = '0%';
  }
}

// Stream a File into memory with progress (single preallocated copy).
async function readFileWithProgress(file, onProgress) {
  if (!file.stream || typeof file.stream !== 'function' || !file.size) {
    if (onProgress) onProgress(null);
    return await file.arrayBuffer();
  }
  const total = file.size;
  const out = new Uint8Array(total);
  let off = 0;
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength) {
        out.set(value.subarray(0, Math.min(value.byteLength, total - off)), off);
        off += Math.min(value.byteLength, total - off);
      }
      if (onProgress) onProgress(off / total);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
  return out.buffer;
}

function updateXICStatus() {
  const n = diannState.runs.length;
  const ready = diannState.runs.filter((r) => diannState.xicCache[r] || diannState.xicIndex[r]).length;
  const reg = diannState.runs.filter((r) => !diannState.xicCache[r] && !diannState.xicIndex[r] && (diannState.xicFiles[r] || diannState.xicBuffers[r])).length;
  if (ready > 0) setXICStatus(`XIC parsed for ${ready}/${n} samples`, true);
  else if (reg > 0) setXICStatus(`XIC files for ${reg}/${n} samples (loads on selection)`, false);
  else setXICStatus('No XIC data (needs .xic.parquet)', false);
}

async function loadDefaultXIC() {
  diannState.xicTraceCache = {};
  if (typeof EXPORT_PAYLOAD !== 'undefined' && EXPORT_PAYLOAD && EXPORT_PAYLOAD.xic) {
    const keys = Object.keys(EXPORT_PAYLOAD.xic);
    for (let i = 0; i < keys.length; i++) {
      try {
        diannState.xicBuffers[keys[i]] = base64ToArrayBuffer(EXPORT_PAYLOAD.xic[keys[i]]);
        delete diannState.xicIndex[keys[i]];
      } catch (e) {
        console.warn('Failed to decode report XIC for ' + keys[i] + ':', e.message);
      }
    }
    updateXICStatus();
    renderExplorer();
    return;
  }
  const base = (diannState.settings.xicPath || 'data/results_xic').replace(/\/+$/, '');
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    for (let i = 0; i < diannState.runs.length; i++) {
      const run = diannState.runs[i];
      if (diannState.xicFiles[run] || diannState.xicBuffers[run]) continue;
      const url = base + '/' + cleanRunName(run) + '.xic.parquet';
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const buf = await resp.arrayBuffer();
        if (!buf || buf.byteLength < 100) continue;
        diannState.xicBuffers[run] = buf;
        delete diannState.xicIndex[run];
      } catch (e) {
        console.info('XIC not auto-loaded for ' + run + ':', e.message);
      }
    }
  }
  if (typeof DEFAULT_XIC_BASE64 !== 'undefined' && DEFAULT_XIC_BASE64) {
    for (let i = 0; i < diannState.runs.length; i++) {
      const run = diannState.runs[i];
      if (diannState.xicCache[run] || diannState.xicBuffers[run]) continue;
      const key = cleanRunName(run);
      if (DEFAULT_XIC_BASE64[key]) {
        try {
          diannState.xicBuffers[run] = base64ToArrayBuffer(DEFAULT_XIC_BASE64[key]);
          delete diannState.xicIndex[run];
        } catch (e) {
          console.warn('Failed to decode embedded XIC for ' + run + ':', e.message);
        }
      }
    }
  }
  updateXICStatus();
  renderExplorer();
}

// XIC is lazy: files register up front, each run parses on first selection.
async function registerXICFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let ok = 0;
  const miss = [];
  for (const f of files) {
    const run = matchXicFileToRun(f.name, diannState.runs);
    if (!run) {
      miss.push(f.name);
      continue;
    }
    diannState.xicFiles[run] = f;
    delete diannState.xicIndex[run];
    diannState.xicTraceCache = {};
    ok++;
  }
  updateXICStatus();
  if (miss.length) showToast(`Unmatched XIC files: ${miss.join(', ')}`, 'error');
  else if (ok) showToast(`XIC files registered for ${ok} sample${ok === 1 ? '' : 's'} — parsed on selection`, 'success');
  renderExplorer();
}

var PLOTLY_SRC = 'https://cdn.jsdelivr.net/npm/plotly.js-dist@2.35.2/plotly.min.js';
var plotlyLoading = false;

function ensurePlotly() {
  if (window.Plotly || plotlyLoading) return;
  plotlyLoading = true;
  const s = document.createElement('script');
  s.src = PLOTLY_SRC;
  s.async = true;
  s.onload = () => {
    if (!diannState.selectedPrecursorId) return;
    if (diannState.activeTab === 'diann-explorer-tab') renderExplorer();
  };
  s.onerror = () => { plotlyLoading = false; };
  document.head.appendChild(s);
}

var xicSyncing = false;
var xicSyncSource = null;
var xicSyncTimer = null;

function resetAllXicZoom(rootId) {
  if (!window.Plotly) return;
  xicSyncing = true;
  xicSyncSource = true;
  if (xicSyncTimer) clearTimeout(xicSyncTimer);
  document.querySelectorAll('#' + (rootId || 'xicGrid') + ' .xic-plot').forEach((d) => {
    window.Plotly.relayout(d, { 'xaxis.autorange': true, 'yaxis.autorange': true, 'yaxis2.autorange': true });
  });
  xicSyncTimer = setTimeout(() => { xicSyncing = false; xicSyncSource = null; }, 150);
}

function renderXicPanels(container, prefix, perRun, runs, yMax, isDark, ms1Max, plotHeight, forTab) {
  ensurePlotly();
  if (diannState.activeTab !== forTab) return;
  const useMs1Axis = ms1Max > 0;
  let gridHtml = '';
  perRun.forEach((item, pi) => {
    const run = item.run;
    const traces = (!window.Plotly && useMs1Axis) ? item.traces.filter((t) => t.feature !== 'ms1') : item.traces;
    const label = shortRunLabel(run, runs);
    if (!traces.length) {
      gridHtml += `<div class="xic-panel"><div class="xic-panel-title" title="${run}">${label}</div><div class="xic-panel-empty">Precursor not detected</div></div>`;
    } else if (window.Plotly) {
      gridHtml += `<div class="xic-panel"><div class="xic-panel-title" title="${run}">${label}</div><div class="xic-plot" id="${prefix}${pi}"></div></div>`;
    } else {
      gridHtml += `<div class="xic-panel"><div class="xic-panel-title" title="${run}">${label}</div>` +
        xicPanelSVG(label, run, traces, item.rtMin, item.rtMax, yMax > 0 ? yMax : 1) + `</div>`;
    }
  });
  container.innerHTML = gridHtml;
  if (!window.Plotly) return;
  const palGrid = (!isDark && typeof diannLightPalette === 'function') ? diannLightPalette() : null;
  const fg = isDark ? '#e2e8f0' : (palGrid ? palGrid.text : '#1e293b');
  const muted = isDark ? '#94a3b8' : (palGrid ? palGrid.secondary : '#64748b');
  const apexGridColor = isDark ? '#0f172a' : (palGrid ? palGrid.text : '#0f172a');
  const rootId = container.id || 'xicGrid';
  perRun.forEach((item, i) => {
    if (!item.traces.length) return;
    const div = document.getElementById(prefix + i);
    if (!div) return;
    const plotH = div.clientHeight || plotHeight;
    const data = item.traces.map((t) => ({
      x: t.pts.map((p) => p[0]),
      y: t.pts.map((p) => p[1]),
      mode: 'lines',
      name: t.feature,
      yaxis: t.feature === 'ms1' && useMs1Axis ? 'y2' : 'y',
      line: { color: t.color || muted, width: 1.5 },
      hovertemplate: `${t.feature}<br>RT %{x:.2f} min<br>Int %{y}<extra></extra>`
    }));
    let apex = null;
    item.traces.forEach((t) => {
      if (t.feature === 'ms1' && useMs1Axis) return;
      t.pts.forEach((p) => {
        if (!apex || p[1] > apex[1]) apex = p;
      });
    });
    if (!apex) {
      item.traces.forEach((t) => t.pts.forEach((p) => {
        if (!apex || p[1] > apex[1]) apex = p;
      }));
    }
    if (apex) {
      data.push({
        x: [apex[0]], y: [apex[1]], mode: 'markers', name: 'apex',
        marker: { size: 7, color: apexGridColor },
        hovertemplate: `apex %{x:.2f} min<br>Int %{y}<extra></extra>`,
        showlegend: false
      });
    }
    const layout = {
      height: plotH,
      margin: { l: 48, r: useMs1Axis ? 52 : 8, t: 6, b: 30 },
      font: { color: fg },
      xaxis: { title: { text: 'RT (min)', font: { size: 10 } }, range: [item.rtMin, item.rtMax], tickfont: { size: 9, color: muted }, showgrid: false },
      yaxis: { title: { text: 'Intensity', font: { size: 10 } }, range: [0, yMax > 0 ? yMax : 1], tickfont: { size: 9, color: muted }, showgrid: false },
      showlegend: false,
      hovermode: 'closest',
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)'
    };
    if (useMs1Axis) {
      layout.yaxis2 = {
        title: { text: 'MS1 intensity', font: { size: 10 } },
        overlaying: 'y', side: 'right', range: [0, ms1Max],
        tickfont: { size: 9, color: muted }, showgrid: false
      };
    }
    window.Plotly.newPlot(div, data, layout, { responsive: true, displaylogo: false, displayModeBar: true, scrollZoom: true });
    div.on('plotly_relayout', (ev) => {
      if (xicSyncing && xicSyncSource !== div) return;
      const upd = {};
      ['xaxis.range[0]', 'xaxis.range[1]', 'yaxis.range[0]', 'yaxis.range[1]', 'yaxis2.range[0]', 'yaxis2.range[1]'].forEach((k) => {
        if (ev[k] !== undefined) upd[k] = ev[k];
      });
      if (ev['xaxis.autosize'] || ev['yaxis.autosize'] || ev['yaxis2.autosize']) {
        upd['xaxis.autorange'] = true;
        upd['yaxis.autorange'] = true;
        upd['yaxis2.autorange'] = true;
      }
      if (!Object.keys(upd).length) return;
      xicSyncing = true;
      xicSyncSource = div;
      if (xicSyncTimer) clearTimeout(xicSyncTimer);
      perRun.forEach((other, j) => {
        if (j === i || !other.traces.length) return;
        const otherDiv = document.getElementById(prefix + j);
        if (otherDiv) window.Plotly.relayout(otherDiv, upd);
      });
      xicSyncTimer = setTimeout(() => { xicSyncing = false; xicSyncSource = null; }, 150);
    });
    div.addEventListener('dblclick', () => {
      resetAllXicZoom(rootId);
    });
  });
}

/**
 * Render Tab 2: Peptide Precursor Table
 */
function renderPeptideTable() {
  const runs = diannState.runs;
  const tState = diannState.peptideTable;

  // Build Head
  let headHtml = `<tr>
    <th style="width: 40px;">#</th>
    <th data-sort="strippedSequence" class="${tState.sortCol === 'strippedSequence' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Sequence</th>
    <th data-sort="charge" class="${tState.sortCol === 'charge' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">z</th>
    <th data-sort="proteinGroup" class="${tState.sortCol === 'proteinGroup' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Protein ID</th>
    <th data-sort="genes" class="${tState.sortCol === 'genes' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Gene</th>
    <th data-sort="proteotypic" class="${tState.sortCol === 'proteotypic' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Proto</th>
    <th data-sort="qValue" class="${tState.sortCol === 'qValue' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Q.Val</th>
    <th data-sort="totalIntensity" class="${tState.sortCol === 'totalIntensity' ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">Total Int.</th>
    <th style="min-width: 100px;" title="Per-sample intensity profile, relative to this row's max">Profile</th>
  `;

  for (const run of runs) {
    const cleanRun = shortRunLabel(run, runs);
    const isSorted = tState.sortCol === run;
    headHtml += `<th data-sort="${run}" title="${run}" class="${isSorted ? (tState.sortAsc ? 'sorted-asc' : 'sorted-desc') : ''}">${cleanRun}</th>`;
  }
  headHtml += '</tr>';
  elements.peptideTableHead.innerHTML = headHtml;

  // Head Sort clicks
  elements.peptideTableHead.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (tState.sortCol === col) {
        tState.sortAsc = !tState.sortAsc;
      } else {
        tState.sortCol = col;
        tState.sortAsc = false;
      }
      renderPeptideTable();
    });
  });

  // Filter
  let displayList = diannState.peptideMatrix;
  if (tState.query) {
    const q = tState.query.toLowerCase();
    displayList = displayList.filter(p =>
      (p.strippedSequence && p.strippedSequence.toLowerCase().includes(q)) ||
      (p.modifiedSequence && p.modifiedSequence.toLowerCase().includes(q)) ||
      (p.proteinGroup && p.proteinGroup.toLowerCase().includes(q)) ||
      (p.genes && p.genes.toLowerCase().includes(q)) ||
      (p.precursorId && p.precursorId.toLowerCase().includes(q))
    );
  }

  // Sort
  const col = tState.sortCol;
  const mult = tState.sortAsc ? 1 : -1;
  displayList.sort((a, b) => {
    let valA, valB;
    if (runs.includes(col)) {
      valA = a.sampleIntensities[col] || 0;
      valB = b.sampleIntensities[col] || 0;
    } else {
      valA = a[col] ?? '';
      valB = b[col] ?? '';
    }
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * mult;
    }
    return (valA - valB) * mult;
  });

  const total = displayList.length;
  if (total === 0) {
    elements.peptideTableBody.innerHTML = '';
    elements.peptideEmptyState.style.display = 'flex';
    elements.peptidePaginationInfo.textContent = 'No matching peptides';
    return;
  }
  elements.peptideEmptyState.style.display = 'none';

  const maxPage = Math.ceil(total / tState.pageSize) || 1;
  if (tState.page > maxPage) tState.page = maxPage;
  const startIdx = (tState.page - 1) * tState.pageSize;
  const pageRows = displayList.slice(startIdx, startIdx + tState.pageSize);

  let bodyHtml = '';
  pageRows.forEach((p, idx) => {
    const isPrecSelected = diannState.selectedPrecursorId != null && diannState.selectedPrecursorId === p.precursorId;
    bodyHtml += `<tr data-prec="${p.precursorId}" class="${isPrecSelected ? 'selected' : ''}">
      <td style="color: var(--text-muted); font-size: 0.75rem;">${startIdx + idx + 1}</td>
      <td class="mono-cell" title="Modified: ${p.modifiedSequence}" style="font-weight: 600; color: var(--accent-secondary);">${p.strippedSequence}</td>
      <td class="mono-cell" style="text-align: center;">+${p.charge}</td>
      <td class="mono-cell" style="color: var(--accent-primary); font-size: 0.8rem;">${p.proteinGroup}</td>
      <td>${p.genes || '-'}</td>
      <td style="text-align: center;">
        <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; background: ${p.proteotypic === 'Yes' ? 'var(--badge-success-bg)' : 'var(--badge-bg)'}; color: ${p.proteotypic === 'Yes' ? 'var(--badge-success-text)' : 'var(--badge-text)'};">
          ${p.proteotypic}
        </span>
      </td>
      <td class="mono-cell" style="font-size: 0.75rem;">${p.qValue != null ? Number(p.qValue).toExponential(2) : '-'}</td>
      <td class="mono-cell" style="text-align: right; font-weight: 600;">${formatCompact(p.totalIntensity)}</td>
      <td class="spark-cell" title="Relative profile across samples (row max = ${formatScientific(p.maxIntensity)})">${sparklineSVG(p.sampleIntensities, runs, p.maxIntensity)}</td>
    `;

    for (const run of runs) {
      const val = p.sampleIntensities[run];
      const hasVal = val != null && val > 0;
      const pct = p.maxIntensity > 0 && hasVal ? Math.min(100, Math.round((val / p.maxIntensity) * 100)) : 0;
      bodyHtml += `<td class="intensity-cell" title="${hasVal ? `${run}: ${formatScientific(val)}` : 'Not detected'}">
        ${hasVal ? `<div class="intensity-bar-bg" style="width: ${pct}%;"></div>` : ''}
        <span class="intensity-val" style="color: ${hasVal ? 'inherit' : 'var(--text-muted)'};">${formatCompact(val)}</span>
      </td>`;
    }
    bodyHtml += '</tr>';
  });

  elements.peptideTableBody.innerHTML = bodyHtml;

  // Precursor selection for XIC tab
  elements.peptideTableBody.querySelectorAll('tr[data-prec]').forEach(tr => {
    tr.addEventListener('click', () => selectPrecursor(tr.getAttribute('data-prec')));
  });

  elements.peptidePaginationInfo.textContent = `Showing ${startIdx + 1}–${Math.min(startIdx + tState.pageSize, total)} of ${total.toLocaleString()} peptides`;
  elements.peptideCurrentPageTag.textContent = `Page ${tState.page} of ${maxPage}`;
  elements.peptidePrevPageBtn.disabled = tState.page <= 1;
  elements.peptideNextPageBtn.disabled = tState.page >= maxPage;
}

/**
 * Load and Process Parquet File
 */
async function handleParquetBuffer(buffer, name) {
  try {
    elements.fileStatusText.textContent = `Parsing ${name}...`;
    elements.fileStatusBadge.className = 'file-status-badge';

    const result = await parseParquetBuffer(buffer, name);
    diannState.rawRows = result.rows;
    diannState.runs = result.runs;
    diannState.fileName = name;
    diannState.loadedParquetCustom = true;

    elements.fileStatusText.textContent = `${name} (${result.totalRows.toLocaleString()} rows)`;
    elements.fileStatusBadge.className = 'file-status-badge success';

    showToast(`Loaded ${result.totalRows.toLocaleString()} precursors from ${name} in ${result.durationMs}ms`, 'success');

    // Auto-select first protein
    diannState.selectedProteinGroup = null;
    diannState.selectedPrecursorId = null;
    diannState.xicCache = {};
    diannState.xicBuffers = {};
    diannState.xicFiles = {};
    diannState.xicIndex = {};
    diannState.xicTraceCache = {};
    diannState.xicSeenKeys = [];
    refreshData();
    await loadDefaultXIC();
  } catch (err) {
    console.error('Error loading parquet:', err);
    elements.fileStatusText.textContent = `Error: ${err.message}`;
    showToast(`Failed to parse parquet: ${err.message}`, 'error');
  }
}

function setFastaStatus(text, ok) {
  elements.fastaStatusText.textContent = text;
  elements.fastaStatusBadge.className = 'file-status-badge' + (ok ? ' success' : '');
}

function handleFastaText(text, name) {
  try {
    const isDefault = (typeof DEFAULT_FASTA_NAME !== 'undefined') && name === DEFAULT_FASTA_NAME;
    diannState.loadedFastaCustom = !isDefault;
    diannState.loadedFastaText = isDefault ? null : text;
    const entries = parseFastaText(text);
    if (entries.length === 0) throw new Error('no protein entries found');
    diannState.fastaEntries = entries;
    diannState.fastaIndex = buildFastaIndex(entries);
    diannState.fastaFileName = name;
    setFastaStatus(`${name} (${entries.length.toLocaleString()} proteins)`, true);
    renderCoverage();
  } catch (err) {
    console.error('Error loading fasta:', err);
    setFastaStatus(`Error: ${err.message}`, false);
    showToast(`Failed to parse fasta: ${err.message}`, 'error');
  }
}

async function loadDefaultFasta() {
  if (typeof EXPORT_PAYLOAD !== 'undefined' && EXPORT_PAYLOAD && EXPORT_PAYLOAD.fastaText) {
    handleFastaText(EXPORT_PAYLOAD.fastaText, EXPORT_PAYLOAD.fastaName || 'report.fasta');
    return;
  }
  const name = diannState.settings.fastaFileName || (typeof DEFAULT_FASTA_NAME !== 'undefined' ? DEFAULT_FASTA_NAME : 'default.fasta');
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const response = await fetch('data/' + name);
      if (response.ok) {
        const text = await response.text();
        if (text && text.length > 100) {
          handleFastaText(text, name);
          return;
        }
      }
    } catch (e) {
      console.info('data/' + name + ' not fetchable, using embedded fasta:', e.message);
    }
  }
  if (typeof DEFAULT_FASTA_TEXT !== 'undefined' && DEFAULT_FASTA_TEXT) {
    handleFastaText(DEFAULT_FASTA_TEXT, (typeof DEFAULT_FASTA_NAME !== 'undefined' && DEFAULT_FASTA_NAME) || name);
  } else {
    setFastaStatus('No fasta loaded', false);
  }
}

function renderCoverage() {
  if (!diannState.proteinMatrix.length) {
    diannState.coverage = null;
    return;
  }
  const runSel = diannState.explorer.run || '*';
  if (!diannState.fastaIndex) {
    showDetailEmpty('Load a protein .fasta file (sidebar) to enable sequence coverage mapping.');
    return;
  }
  const pg = diannState.selectedProteinGroup;
  if (!pg) {
    showDetailEmpty('Select a protein from the list to map its peptides onto the protein sequence.');
    return;
  }
  const hit = findProteinEntry(diannState.fastaIndex, pg);
  if (!hit) {
    showDetailEmpty(`No FASTA sequence matched protein group "${pg}". Check that the fasta accessions match the Protein.Group ids.`);
    return;
  }
  const seqSet = new Set();
  for (let i = 0; i < diannState.filteredRows.length; i++) {
    const r = diannState.filteredRows[i];
    if (r['Protein.Group'] === pg || r['Protein.Ids'] === pg) {
      const s = r['Stripped.Sequence'] || r['Modified.Sequence'];
      if (s) seqSet.add(s);
    }
  }
  if (seqSet.size === 0) {
    showDetailEmpty(`No filtered peptides found for "${pg}" under the current FDR settings.`);
    return;
  }
  const cov = mapPeptidesToSequence(hit.entry.sequence, Array.from(seqSet));
  const prevCov = diannState.coverage && diannState.coverage.pg === pg ? diannState.coverage : null;
  const quantBySeq = new Map();
  for (let i = 0; i < diannState.peptideMatrix.length; i++) {
    const pep = diannState.peptideMatrix[i];
    if (pep.proteinGroup !== pg || !pep.strippedSequence) continue;
    let q = quantBySeq.get(pep.strippedSequence);
    if (!q) {
      q = { perRun: {}, total: 0, max: 0 };
      quantBySeq.set(pep.strippedSequence, q);
    }
    for (let r = 0; r < diannState.runs.length; r++) {
      const run = diannState.runs[r];
      const v = pep.sampleIntensities[run] || 0;
      q.perRun[run] = (q.perRun[run] || 0) + v;
      if (q.perRun[run] > q.max) q.max = q.perRun[run];
    }
    q.total += pep.totalIntensity || 0;
  }
  const seqLen = hit.entry.sequence.length;
  const occCache = new Map();
  const occMask = (seq) => {
    let m = occCache.get(seq);
    if (!m) {
      m = peptideOccurrenceMask(hit.entry.sequence, seq);
      occCache.set(seq, m);
    }
    return m;
  };
  let targetRuns = runSel === '*' ? diannState.runs.slice() : diannState.runs.filter((r) => r === runSel);
  if (!targetRuns.length) targetRuns = diannState.runs.slice();
  const runViews = [];
  let allMax = 0;
  let allMin = 0;
  for (const run of targetRuns) {
    const totals = new Array(seqLen).fill(0);
    const covered = new Uint8Array(seqLen);
    cov.mapped.forEach((m) => {
      const q = quantBySeq.get(m.sequence);
      const w = (q && q.perRun[run]) || 0;
      if (!(w > 0)) return;
      const mask = occMask(m.sequence);
      for (let k = 0; k < seqLen; k++) {
        if (mask[k]) {
          totals[k] += w;
          covered[k] = 1;
        }
      }
    });
    let cc = 0;
    for (let k = 0; k < seqLen; k++) {
      if (covered[k]) cc++;
      if (totals[k] > allMax) allMax = totals[k];
      if (totals[k] > 0 && (allMin === 0 || totals[k] < allMin)) allMin = totals[k];
    }
    runViews.push({ run, totals, covered, coveredCount: cc, coveragePct: seqLen ? (cc / seqLen) * 100 : 0 });
  }
  diannState.coverage = {
    sequence: hit.entry.sequence, covered: cov.covered, mapped: cov.mapped,
    quantBySeq, pg,
    runViews, allMax, allMin,
    sortCol: prevCov ? prevCov.sortCol : 'start',
    sortAsc: prevCov ? prevCov.sortAsc : true,
    selectedSeq: prevCov ? prevCov.selectedSeq : null
  };
  showDetail();
  elements.covProtLabel.innerHTML = `<strong>${hit.matchedId}</strong> <span style="color: var(--text-muted); font-weight: 400;">${hit.entry.description}</span>`;
  elements.covStats.innerHTML =
    `Length <strong>${hit.entry.sequence.length.toLocaleString()} aa</strong> &nbsp;·&nbsp; ` +
    `Coverage <strong>${cov.coveragePct.toFixed(1)}%</strong> (${cov.coveredCount.toLocaleString()} / ${hit.entry.sequence.length.toLocaleString()} aa) &nbsp;·&nbsp; ` +
    `Peptides <strong>${cov.mapped.length}</strong> mapped / ${seqSet.size} identified` +
    (cov.unmatched > 0 ? ` (${cov.unmatched} unmatched)` : '');
  renderCoverageRunPanels(false);
}

function renderCoverageRunPanels(scrollToSel) {
  const cov = diannState.coverage;
  if (!cov || !cov.runViews) return;
  const seq = cov.sequence;
  const sel = cov.selectedSeq ? peptideOccurrenceMask(seq, cov.selectedSeq) : null;
  let html = '';
  cov.runViews.forEach((rv) => {
    html += `<div class="cov-run-block"><h4 class="cov-view-title">${escXml(shortRunLabel(rv.run, diannState.runs))} — coverage ${rv.coveragePct.toFixed(1)}% (${rv.coveredCount.toLocaleString()} / ${seq.length.toLocaleString()} aa)</h4>` +
      `<div class="cov-view"><pre class="cov-sequence">${intensitySequenceHTML(seq, rv.totals, cov.allMax, 50, cov.allMin, sel)}</pre></div>` +
      `</div>`;
  });
  elements.covRunPanels.innerHTML = html;
  if (scrollToSel && cov.selectedSeq) {
    const first = elements.covRunPanels.querySelector('.cov-selected');
    if (first && first.scrollIntoView) first.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Bind All UI Event Listeners
 */
function diannSetupEventListeners() {
  /* Nebula port: no own theme toggle (button removed); follow the Nebula shell
     theme live via a documentElement observer (updateThemeUI re-syncs). */
  if (typeof MutationObserver !== 'undefined' && !window.__diannThemeObs) {
    window.__diannThemeObs = new MutationObserver(function () { updateThemeUI(); });
    window.__diannThemeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // Export single-file HTML report
  elements.exportReportBtn.addEventListener('click', exportReport);

  // Open DIA-NN result folder (File System Access API, Chromium)
  elements.openFolderBtn.addEventListener('click', openResultFolder);

async function pickResultFolder() {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('Folder picker not supported in this browser. Use Chrome or Edge.');
  }
  const dir = await window.showDirectoryPicker({ id: 'diann-result', mode: 'read' });
  const files = {};
  async function walk(handle, prefix) {
    const entries = [];
    for await (const [name, h] of handle.entries()) entries.push([name, h]);
    entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (const [name, h] of entries) {
      // Handles only: getFile() on every entry reads ~1GB (.quant) and crashes the tab.
      if (h.kind === 'file') files[prefix + name] = h;
      else if (h.kind === 'directory') await walk(h, prefix + name + '/');
    }
  }
  await walk(dir, '');
  return { name: dir.name, files };
}

// File or lazy FileSystemFileHandle -> File.
async function diannFileOf(f) {
  if (!f) return null;
  if (typeof f.arrayBuffer === 'function' && typeof f.text === 'function' && f.size !== undefined) return f;
  if (typeof f.getFile === 'function') return await f.getFile();
  return null;
}

function diannFileSizeMB(f) {
  try {
    if (f && typeof f.size === 'number' && f.size > 0) return (f.size / 1048576).toFixed(1) + ' MB';
  } catch (_) {}
  return null;
}

function pickMainParquet(keys) {
  const exact = keys.find((k) => /(^|\/)results\.parquet$/i.test(k));
  if (exact) return exact;
  const cands = keys.filter((k) => /\.parquet$/i.test(k) && !/lib\.parquet$/i.test(k) && !/site_report\.parquet$/i.test(k) && !/\.xic\.parquet$/i.test(k) && !/first-pass/i.test(k));
  return cands[0] || null;
}

async function openResultFolder() {
  let folder;
  const prevStatus = elements.fileStatusText.textContent;
  elements.fileStatusText.textContent = 'Opening folder picker...';
  try {
    folder = await pickResultFolder();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.info('Folder picker dismissed by user.');
      elements.fileStatusText.textContent = prevStatus;
      return;
    }
    showToast(err.message || 'Could not open folder', 'error');
    return;
  }
  const keys = Object.keys(folder.files);
  await loadDiannFolderFiles(folder.name, folder.files, keys);
}

// Shared folder/file loader: resolves handles to Files lazily (only the
// result parquet + fasta + XIC parquets are ever read; giant .quant files
// are listed but never touched).
async function loadDiannFolderFiles(folderName, filesByKey, keys) {
  keys = keys || Object.keys(filesByKey);
  const notes = [];
  try {
    const mainKey = pickMainParquet(keys);
    if (!mainKey) throw new Error(`No results parquet found in "${folderName}"`);
    const mainFile = await diannFileOf(filesByKey[mainKey]);
    if (!mainFile) throw new Error(`Could not read ${mainKey}`);
    const sizeNote = diannFileSizeMB(mainFile);
    const baseLabel = `Reading ${mainKey.split('/').pop()}${sizeNote ? ' (' + sizeNote + ')' : ''}`;
    elements.fileStatusText.textContent = baseLabel + '...';
    let buf;
    try {
      buf = await readFileWithProgress(mainFile, (frac) => {
        if (frac == null) setDiannLoadProgress(null, baseLabel + '...');
        else setDiannLoadProgress(frac, `${baseLabel} — ${(frac * 100).toFixed(0)}%`);
      });
    } catch (err) {
      hideDiannLoadProgress();
      throw new Error(`Could not read ${mainKey.split('/').pop()}: ${err.message || err}`);
    }
    setDiannLoadProgress(null, `Parsing ${mainKey.split('/').pop()}...`);
    try {
      await handleParquetBuffer(buf, mainKey.split('/').pop());
    } finally {
      hideDiannLoadProgress();
    }
    notes.push('parquet: ' + mainKey.split('/').pop());
  } catch (err) {
    console.error('Error loading folder parquet:', err);
    showToast(`Parquet: ${err.message}`, 'error');
    return;
  }
  const tsvKey = keys.find((k) => /protein_description\.tsv$/i.test(k));
  const faKey = tsvKey ? null : keys.find((k) => /\.fasta$/i.test(k) || /\.fa$/i.test(k));
  if (tsvKey) {
    try {
      const tsvFile = await diannFileOf(filesByKey[tsvKey]);
      const text = await tsvFile.text();
      const conv = proteinDescriptionToFasta(text);
      diannState.settings.fastaFileName = tsvKey.split('/').pop();
      saveSettings(diannState.settings);
      setFastaStatus(`Parsing ${tsvKey.split('/').pop()}...`, false);
      handleFastaText(conv.fasta, tsvKey.split('/').pop());
      notes.push(`protein descriptions: ${conv.kept}/${conv.total}`);
    } catch (err) {
      console.error('Error loading protein descriptions:', err);
      showToast(`Protein descriptions: ${err.message}`, 'error');
    }
  } else {
    if (faKey) {
      try {
        const faFile = await diannFileOf(filesByKey[faKey]);
        const text = await faFile.text();
        diannState.settings.fastaFileName = faKey.split('/').pop();
        saveSettings(diannState.settings);
        setFastaStatus(`Parsing ${faKey.split('/').pop()}...`, false);
        handleFastaText(text, faKey.split('/').pop());
        notes.push('fasta: ' + faKey.split('/').pop());
      } catch (err) {
        showToast(`Fasta: ${err.message}`, 'error');
      }
    }
  }
  const xicKeys = keys.filter((k) => /\.xic\.parquet$/i.test(k));
  diannState.xicSeenKeys = xicKeys.slice();
  if (xicKeys.length) {
    const xicFiles = [];
    for (const k of xicKeys) {
      const f = await diannFileOf(filesByKey[k]);
      if (f) xicFiles.push(f);
    }
    await registerXICFiles(xicFiles);
    notes.push(`xic: ${xicFiles.length} file(s)`);
  } else {
    notes.push('no .xic.parquet — spectra unavailable');
  }
  if (!tsvKey && !faKey && !diannState.fastaIndex) {
    setFastaStatus('No sequences — also pick results.protein_description.tsv', false);
    notes.push('no sequences — pick results.protein_description.tsv for coverage');
  }
  showToast(`Loaded folder "${folderName}" — ${notes.join(' · ') || 'nothing recognized'}`, 'success');
  refreshData();
  await loadDefaultXIC();
}

  // Load example data
  async function loadDiannExampleData() {
    await loadDefaultFasta();
    elements.fileStatusText.textContent = 'Loading bundled example data...';
    const result = await loadDefaultParquet();
    diannState.rawRows = result.rows;
    diannState.runs = result.runs;
    diannState.fileName = 'results.parquet';
    elements.fileStatusText.textContent = `results.parquet (${result.totalRows.toLocaleString()} rows)`;
    elements.fileStatusBadge.className = 'file-status-badge success';
    refreshData();
    await loadDefaultXIC();
    return result;
  }
  if (elements.loadExampleBtn) {
    elements.loadExampleBtn.addEventListener('click', async () => {
      try {
        const result = await loadDiannExampleData();
        showToast(`Loaded example data (${result.totalRows.toLocaleString()} rows)`, 'success');
      } catch (e) {
        showToast('Failed to load example data', 'error');
      }
    });
  }

  // Spectra Explorer controls
  elements.explorerPgModeBtn.addEventListener('click', () => { diannState.explorer.pgMode = 'pg'; renderExplorer(); });
  elements.explorerGeneModeBtn.addEventListener('click', () => { diannState.explorer.pgMode = 'gene'; renderExplorer(); });
  elements.explorerProteinFilter.addEventListener('input', (e) => { diannState.explorer.pgQuery = e.target.value; renderExplorer(); });
  elements.explorerPeptideFilter.addEventListener('input', (e) => { diannState.explorer.pepQuery = e.target.value; renderExplorer(); });
  elements.explorerRunFilter.addEventListener('input', (e) => { diannState.explorer.runQuery = e.target.value; renderExplorer(); });
  elements.explorerShowY.addEventListener('change', (e) => { diannState.explorer.showY = e.target.checked; renderExplorer(); });
  elements.explorerShowB.addEventListener('change', (e) => { diannState.explorer.showB = e.target.checked; renderExplorer(); });
  elements.explorerShowMs1.addEventListener('change', (e) => { diannState.explorer.showMs1 = e.target.checked; renderExplorer(); });
  elements.explorerShowTheo.addEventListener('change', (e) => { diannState.explorer.showTheo = e.target.checked; renderExplorer(); });
  elements.explorerGeneBadge.addEventListener('click', () => { if (diannState.selectedGene) selectGene(diannState.selectedGene); });

  // Sliders & Text Inputs
  elements.qValueSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    diannState.settings.qValue = val;
    elements.qValueTag.textContent = `≤ ${val.toFixed(3)}`;
    saveSettings(diannState.settings);
    refreshData();
  });

  elements.globalQValueSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    diannState.settings.globalQValue = val;
    elements.globalQValueTag.textContent = `≤ ${val.toFixed(3)}`;
    saveSettings(diannState.settings);
    refreshData();
  });

  elements.pgQValueSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    diannState.settings.pgQValue = val;
    elements.pgQValueTag.textContent = `≤ ${val.toFixed(3)}`;
    saveSettings(diannState.settings);
    refreshData();
  });

  elements.intensityColumnSelect.addEventListener('change', (e) => {
    diannState.settings.intensityColumn = e.target.value;
    saveSettings(diannState.settings);
    refreshData();
  });

  elements.quantMethodSelect.addEventListener('change', (e) => {
    diannState.settings.quantMethod = e.target.value;
    saveSettings(diannState.settings);
    refreshData();
  });

  elements.proteotypicOnlyToggle.addEventListener('change', (e) => {
    diannState.settings.proteotypicOnly = e.target.checked;
    saveSettings(diannState.settings);
    refreshData();
  });

  // Reset Filters
  elements.resetFiltersBtn.addEventListener('click', () => {
    diannState.settings.qValue = 0.01;
    diannState.settings.globalQValue = 0.01;
    diannState.settings.pgQValue = 0.01;
    diannState.settings.proteotypicOnly = false;
    diannState.settings.quantMethod = 'PG.MaxLFQ';
    diannState.settings.intensityColumn = 'Precursor.Normalised';
    saveSettings(diannState.settings);
    syncSettingsToUI();
    refreshData();
    showToast('Filters reset to default settings');
  });

  // Tab Switching
  elements.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      elements.tabButtons.forEach(b => b.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
      diannState.activeTab = tabId;

      if (tabId === 'diann-explorer-tab') {
        setTimeout(() => { renderExplorer(); renderCoverage(); }, 60);
      }
    });
  });

  // Data Matrix sub-tabs (Protein / Peptide / Gene)
  diannRoot().querySelectorAll('#diann-matrix-tab [data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      diannRoot().querySelectorAll('#diann-matrix-tab [data-panel]').forEach(b => b.classList.remove('active'));
      diannRoot().querySelectorAll('#diann-matrix-tab .diann-matrix-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-panel')).classList.add('active');
    });
  });

  // Explorer sub-tabs (Spectra / Coverage)
  diannRoot().querySelectorAll('#diann-explorer-tab [data-xpanel]').forEach(btn => {
    btn.addEventListener('click', () => {
      diannRoot().querySelectorAll('#diann-explorer-tab [data-xpanel]').forEach(b => b.classList.remove('active'));
      diannRoot().querySelectorAll('#diann-explorer-tab .diann-matrix-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-xpanel')).classList.add('active');
    });
  });

  // Explorer sub-tabs (Spectra / Coverage)
  diannRoot().querySelectorAll('#diann-explorer-tab [data-xpanel]').forEach(btn => {
    btn.addEventListener('click', () => {
      diannRoot().querySelectorAll('#diann-explorer-tab [data-xpanel]').forEach(b => b.classList.remove('active'));
      diannRoot().querySelectorAll('#diann-explorer-tab .diann-matrix-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-xpanel')).classList.add('active');
    });
  });

  // Quick search within tables
  elements.proteinTableSearchInput.addEventListener('input', (e) => {
    diannState.proteinTable.query = e.target.value;
    diannState.proteinTable.page = 1;
    renderProteinTable();
  });

  // Protein peptide-counts display toggle
  elements.proteinPeptideCountsToggle.addEventListener('change', (e) => {
    diannState.proteinTable.showPeptideCounts = e.target.checked;
    diannState.proteinTable.page = 1;
    renderProteinTable();
  });

  elements.peptideTableSearchInput.addEventListener('input', (e) => {
    diannState.peptideTable.query = e.target.value;
    diannState.peptideTable.page = 1;
    renderPeptideTable();
  });

  // Clear Selected Protein
  elements.clearProteinSelectionBtn.addEventListener('click', clearProteinSelection);

  // Show All Proteins: clear gene filter, keep protein selection
  elements.clearGeneFilterBtn.addEventListener('click', () => {
    if (!diannState.selectedGene) return;
    diannState.selectedGene = null;
    diannState.peptideMatrix = aggregatePeptideMatrix(diannState.filteredRows, diannState.runs, diannState.selectedProteinGroup, diannState.settings);
    diannState.peptideTable.page = 1;
    updatePeptideBadge();
    renderProteinTable();
    renderPeptideTable();
    renderGeneTable();
    renderCoverage();
    renderExplorer();
  });

  // Show All Genes: clear gene selection
  elements.clearGeneSelectionBtn.addEventListener('click', () => {
    if (diannState.selectedGene) selectGene(diannState.selectedGene);
  });

  // Pagination Handlers
  elements.proteinPrevPageBtn.addEventListener('click', () => {
    if (diannState.proteinTable.page > 1) {
      diannState.proteinTable.page--;
      renderProteinTable();
    }
  });

  elements.proteinNextPageBtn.addEventListener('click', () => {
    diannState.proteinTable.page++;
    renderProteinTable();
  });

  elements.proteinPageSizeSelect.addEventListener('change', (e) => {
    diannState.proteinTable.pageSize = parseInt(e.target.value, 10);
    diannState.proteinTable.page = 1;
    renderProteinTable();
  });

  elements.peptidePrevPageBtn.addEventListener('click', () => {
    if (diannState.peptideTable.page > 1) {
      diannState.peptideTable.page--;
      renderPeptideTable();
    }
  });

  elements.peptideNextPageBtn.addEventListener('click', () => {
    diannState.peptideTable.page++;
    renderPeptideTable();
  });

  elements.peptidePageSizeSelect.addEventListener('change', (e) => {
    diannState.peptideTable.pageSize = parseInt(e.target.value, 10);
    diannState.peptideTable.page = 1;
    renderPeptideTable();
  });

  // Quick search within gene table
  elements.geneTableSearchInput.addEventListener('input', (e) => {
    diannState.geneTable.query = e.target.value;
    diannState.geneTable.page = 1;
    renderGeneTable();
  });

  // Gene peptide-counts display toggle
  elements.genePeptideCountsToggle.addEventListener('change', (e) => {
    diannState.geneTable.showPeptideCounts = e.target.checked;
    diannState.geneTable.page = 1;
    renderGeneTable();
  });

  // Gene Pagination Handlers
  elements.genePrevPageBtn.addEventListener('click', () => {
    if (diannState.geneTable.page > 1) {
      diannState.geneTable.page--;
      renderGeneTable();
    }
  });

  elements.geneNextPageBtn.addEventListener('click', () => {
    diannState.geneTable.page++;
    renderGeneTable();
  });

  elements.genePageSizeSelect.addEventListener('change', (e) => {
    diannState.geneTable.pageSize = parseInt(e.target.value, 10);
    diannState.geneTable.page = 1;
    renderGeneTable();
  });

  // Matrix Exports
  elements.exportProteinMatrixBtn.addEventListener('click', () => {
    if (diannState.proteinMatrix.length === 0) {
      showToast('No protein data to export', 'error');
      return;
    }
    const tsv = exportProteinMatrixTSV(diannState.proteinMatrix, diannState.runs);
    const fname = `${(diannState.fileName || 'results').replace(/\.parquet$/i, '')}.pg_matrix.tsv`;
    triggerDownload(tsv, fname);
    showToast(`Exported ${diannState.proteinMatrix.length} proteins to ${fname}`, 'success');
  });

  elements.exportPeptideMatrixBtn.addEventListener('click', () => {
    if (diannState.peptideMatrix.length === 0) {
      showToast('No peptide data to export', 'error');
      return;
    }
    const tsv = exportPeptideMatrixTSV(diannState.peptideMatrix, diannState.runs);
    const fname = `${(diannState.fileName || 'results').replace(/\.parquet$/i, '')}.peptide_matrix.tsv`;
    triggerDownload(tsv, fname);
    showToast(`Exported ${diannState.peptideMatrix.length} peptides to ${fname}`, 'success');
  });

  if (elements.exportGeneMatrixBtn) elements.exportGeneMatrixBtn.addEventListener('click', () => {
    if (diannState.geneMatrix.length === 0) {
      showToast('No gene data to export', 'error');
      return;
    }
    const tsv = exportGeneMatrixTSV(diannState.geneMatrix, diannState.runs);
    const fname = `${(diannState.fileName || 'results').replace(/\.parquet$/i, '')}.gene_matrix.tsv`;
    triggerDownload(tsv, fname);
    showToast(`Exported ${diannState.geneMatrix.length} genes to ${fname}`, 'success');
  });

  // Send via TSV + the app's own DIANN parsers so annotations/meta match a file load.
  function sendDiannTableToMain(kind) {
    const isGene = kind === 'gene';
    const list = isGene ? diannState.geneMatrix : diannState.proteinMatrix;
    if (!list || list.length === 0) {
      showToast('No ' + (isGene ? 'gene' : 'protein') + ' data to send — load data first', 'error');
      return;
    }
    if (typeof finishFileLoading !== 'function') {
      showToast('Main analysis loader not available', 'error');
      return;
    }
    try {
      const runs = diannState.runs;
      let tsv, parsed, label;
      if (isGene) {
        const header = ['Genes', 'N.Sequences', 'N.Proteotypic.Sequences', ...runs].join('\t');
        const lines = [header];
        for (const g of list) {
          const cells = [g.gene || '', g.nSequences ?? 0, g.nProteotypicSequences ?? 0];
          for (const run of runs) {
            const v = g.sampleIntensities[run];
            cells.push(v != null && !isNaN(v) ? v : '');
          }
          lines.push(cells.join('\t'));
        }
        tsv = lines.join('\n');
        parsed = parseDIANNGeneGroupMatrix(tsv);
        label = 'DIANN gene table';
      } else {
        tsv = exportProteinMatrixTSV(list, runs);
        parsed = parseDIANNProteinGroupMatrix(tsv, 'Protein.Names');
        label = 'DIANN protein table';
      }
      const statusDiv = document.getElementById('exampleDiannStatus') || elements.fileStatusText;
      finishFileLoading(parsed, statusDiv, tsv, label + ' sent to main analysis');
      if (typeof switchTab === 'function') switchTab('dataPrep');
      showToast(label + ` sent to main analysis (${parsed.rowIds.length} rows)`, 'success');
    } catch (e) {
      showToast('Failed to send table: ' + (e && e.message ? e.message : e), 'error');
    }
  }
  if (elements.sendProteinBtn) elements.sendProteinBtn.addEventListener('click', () => sendDiannTableToMain('protein'));
  if (elements.sendGeneBtn) elements.sendGeneBtn.addEventListener('click', () => sendDiannTableToMain('gene'));
}

function diannArrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}

function escHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escInline(s) {
  return String(s).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function exportReport() {
  /* Nebula port: the standalone Export Report clones document.body, which would
     swallow the whole Nebula app, and needs APP_SCRIPTS/APP_VENDOR (not shipped
     here). Disabled inside Nebula. */
  showToast('Export Report is disabled inside Nebula.', 'warn');
}

/**
 * Initialize Application
 */
async function diannInit() {
  try {
    const versionEl = document.getElementById('diannAppVersion');
    if (versionEl) versionEl.textContent = `v${DIANN_APP_VERSION} (${DIANN_APP_BUILD}) · Proteomics Viewer`;
  } catch (e) { /* ignore */ }
  if (typeof EXPORT_PAYLOAD !== 'undefined' && EXPORT_PAYLOAD && EXPORT_PAYLOAD.settings) {
    try {
      diannState.settings = Object.assign({}, diannState.settings, EXPORT_PAYLOAD.settings);
    } catch (e) { /* keep defaults */ }
  }
  syncSettingsToUI();
  diannSetupEventListeners();
  applyXcolWidths();
  initXcolDrag();

  // No auto-load: the user picks Load example data or Open result folder.
  elements.fileStatusText.textContent = 'No file loaded';
  elements.fileStatusBadge.className = 'file-status-badge';
  refreshData();
  if (typeof EXPORT_PAYLOAD !== 'undefined' && EXPORT_PAYLOAD) {
    if (diannState.rawRows && diannState.rawRows.length) {
      if (EXPORT_PAYLOAD.selPG) selectProteinGroup(EXPORT_PAYLOAD.selPG);
      if (EXPORT_PAYLOAD.selPrec) selectPrecursor(EXPORT_PAYLOAD.selPrec);
    }
  }
}

// Start app
/* Nebula port: no auto-init. The Nebula lazy-loader calls window.diannInit() on first tab open. */
window.diannInit = diannInit;
