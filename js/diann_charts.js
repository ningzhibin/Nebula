/* Nebula port of 0266_diann-parquet-parser/js/charts.js - scoped for the #diannExplorerTab panel. See AGENTS.md. */
/* file://-safe classic script converted from src/charts.js. Load via plain <script src> (see index.html order + js/README.txt). No import/export. */
/**
 * Modern, responsive Canvas/SVG charts for DIA-NN Quality Control and Protein Profiling
 */

function diannNebulaVar(name, fallback) {
  try {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    if (v && v.trim()) return v.trim();
  } catch (_) {}
  return fallback;
}

function diannLightPalette() {
  return {
    text: diannNebulaVar('--md-text-primary', '#211d17'),
    secondary: diannNebulaVar('--md-text-secondary', '#57503f'),
    muted: diannNebulaVar('--hyb-ink-3', '#8a816c'),
    accent: diannNebulaVar('--md-accent', '#bc4421'),
    accentHover: diannNebulaVar('--md-accent-hover', '#93321a'),
    success: diannNebulaVar('--md-btn-success', '#2e6b5c'),
    successHover: diannNebulaVar('--md-btn-success-hover', '#25574b'),
    border: diannNebulaVar('--md-border', '#d5cdb9'),
    borderSubtle: diannNebulaVar('--md-border-subtle', '#e3ddcf')
  };
}

function formatScientific(num) {
  if (num == null || isNaN(num) || num === 0) return '0';
  if (num >= 1e6 || num <= 1e-3) {
    return Number(num).toExponential(2);
  }
  return Number(num).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatCompact(num) {
  if (num == null || isNaN(num) || num === 0) return '-';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return Number(num).toFixed(1);
}

/**
 * Renders a clean bar chart of sample intensities for a given protein
 */
function renderProteinProfileChart(canvas, protein, runs, isDark) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  if (!protein) {
    var pal0 = isDark ? null : diannLightPalette();
    ctx.fillStyle = isDark ? '#64748b' : pal0.muted;
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Select a protein row from the Protein Table to inspect sample intensities', w / 2, h / 2);
    return;
  }

  const padding = { top: 40, right: 30, bottom: 65, left: 75 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const data = runs.map(run => ({
    run,
    val: protein.sampleIntensities[run] || 0
  }));

  const maxVal = Math.max(...data.map(d => d.val), 1);

  // Background grid & Y-axis labels
  const gridLines = 4;
  const pal = isDark ? null : diannLightPalette();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  ctx.fillStyle = isDark ? '#94a3b8' : pal.secondary;
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const yVal = (maxVal * (gridLines - i)) / gridLines;
    const y = padding.top + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    ctx.fillText(formatCompact(yVal), padding.left - 10, y + 4);
  }

  // Draw Bars
  const barWidth = Math.min(60, (plotW / data.length) * 0.6);
  const gap = plotW / data.length;

  data.forEach((d, i) => {
    const barH = maxVal > 0 ? (d.val / maxVal) * plotH : 0;
    const x = padding.left + i * gap + (gap - barWidth) / 2;
    const y = padding.top + plotH - barH;

    // Gradient fill
    const grad = ctx.createLinearGradient(x, y, x, padding.top + plotH);
    if (d.val > 0) {
      grad.addColorStop(0, isDark ? '#6366f1' : pal.accent);
      grad.addColorStop(1, isDark ? '#3b82f6' : pal.accentHover);
    } else {
      grad.addColorStop(0, isDark ? '#334155' : pal.border);
      grad.addColorStop(1, isDark ? '#1e293b' : pal.borderSubtle);
    }

    ctx.fillStyle = grad;
    // Rounded bar top
    const radius = Math.max(0, Math.min(4, barH / 2));
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [radius, radius, 0, 0]);
    ctx.fill();

    // Value label on top of bar
    if (d.val > 0) {
      ctx.fillStyle = isDark ? '#f8fafc' : pal.text;
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCompact(d.val), x + barWidth / 2, y - 8);
    }

    // X-axis label (Run Name)
    ctx.save();
    ctx.translate(x + barWidth / 2, padding.top + plotH + 12);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = isDark ? '#cbd5e1' : pal.secondary;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const cleanName = shortRunLabel(d.run, runs);
    ctx.fillText(cleanName.length > 20 ? cleanName.slice(0, 18) + '…' : cleanName, 0, 0);
    ctx.restore();
  });

  // Chart Title
  ctx.fillStyle = isDark ? '#e2e8f0' : pal.text;
  ctx.font = '600 13px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Protein: ${protein.proteinGroup} (${protein.genes || protein.proteinNames || 'No gene'}) — Abundance Profile`,
    padding.left,
    22
  );
}

/**
 * Renders Sample QC bar chart comparing total precursor signal per run
 */
function renderSampleQCChart(canvas, filteredRows, runs, isDark) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (runs.length === 0 || filteredRows.length === 0) {
    var palQ0 = isDark ? null : diannLightPalette();
    ctx.fillStyle = isDark ? '#64748b' : palQ0.muted;
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data available to display QC chart', w / 2, h / 2);
    return;
  }

  // Calculate run totals
  const runStats = runs.map(run => {
    const runRows = filteredRows.filter(r => r.Run === run);
    const sumIntensity = runRows.reduce((acc, r) => acc + (r['Precursor.Normalised'] || r['Precursor.Quantity'] || 0), 0);
    return {
      run,
      count: runRows.length,
      intensity: sumIntensity
    };
  });

  const maxIntensity = Math.max(...runStats.map(s => s.intensity), 1);
  const padding = { top: 40, right: 30, bottom: 65, left: 75 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  // Grid
  const gridLines = 4;
  const palQ = isDark ? null : diannLightPalette();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  ctx.fillStyle = isDark ? '#94a3b8' : palQ.secondary;
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const yVal = (maxIntensity * (gridLines - i)) / gridLines;
    const y = padding.top + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillText(formatCompact(yVal), padding.left - 10, y + 4);
  }

  const barWidth = Math.min(60, (plotW / runStats.length) * 0.6);
  const gap = plotW / runStats.length;

  runStats.forEach((d, i) => {
    const barH = maxIntensity > 0 ? (d.intensity / maxIntensity) * plotH : 0;
    const x = padding.left + i * gap + (gap - barWidth) / 2;
    const y = padding.top + plotH - barH;

    const grad = ctx.createLinearGradient(x, y, x, padding.top + plotH);
    grad.addColorStop(0, isDark ? '#10b981' : palQ.success);
    grad.addColorStop(1, isDark ? '#059669' : palQ.successHover);

    ctx.fillStyle = grad;
    const radius = Math.max(0, Math.min(4, barH / 2));
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [radius, radius, 0, 0]);
    ctx.fill();

    // Value label
    ctx.fillStyle = isDark ? '#f8fafc' : palQ.text;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatCompact(d.intensity), x + barWidth / 2, y - 8);

    // X label
    ctx.save();
    ctx.translate(x + barWidth / 2, padding.top + plotH + 12);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = isDark ? '#cbd5e1' : palQ.secondary;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const cleanName = shortRunLabel(d.run, runs);
    ctx.fillText(cleanName.length > 20 ? cleanName.slice(0, 18) + '…' : cleanName, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = isDark ? '#e2e8f0' : palQ.text;
  ctx.font = '600 13px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Sample Run Total Intensity QC', padding.left, 22);
}
