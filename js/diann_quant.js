/* Nebula port of 0266_diann-parquet-parser/js/quant.js - scoped for the #diannExplorerTab panel. See AGENTS.md. */
/* file://-safe classic script converted from src/quant.js. Load via plain <script src> (see index.html order + js/README.txt). No import/export. */
/**
 * DIA-NN Filtering, Quantification, and Matrix Aggregation Engine
 */

/**
 * Filter raw parquet precursor rows based on active settings
 */
function filterPrecursors(rows, settings) {
  const {
    qValue = 0.01,
    globalQValue = 0.01,
    pgQValue = 0.05,
    proteinFilter = '',
    geneFilter = '',
    proteinIdFilter = '',
    proteotypicOnly = false
  } = settings;

  const protQuery = proteinFilter.trim().toLowerCase();
  const geneQuery = geneFilter.trim().toLowerCase();
  const idQuery = proteinIdFilter.trim().toLowerCase();

  return rows.filter(row => {
    // 1. Q.Value threshold
    if (row['Q.Value'] != null && row['Q.Value'] > qValue) return false;

    // 2. Global.Q.Value threshold
    if (row['Global.Q.Value'] != null && row['Global.Q.Value'] > globalQValue) return false;

    // 3. PG.Q.Value threshold
    if (row['PG.Q.Value'] != null && row['PG.Q.Value'] > pgQValue) return false;

    // 4. Proteotypic only
    if (proteotypicOnly && row['Proteotypic'] !== 1) return false;

    // 5. Protein Name query
    if (protQuery && (!row['Protein.Names'] || !row['Protein.Names'].toLowerCase().includes(protQuery))) {
      return false;
    }

    // 6. Gene Name query
    if (geneQuery && (!row['Genes'] || !row['Genes'].toLowerCase().includes(geneQuery))) {
      return false;
    }

    // 7. Protein ID query
    if (idQuery) {
      const matchGroup = row['Protein.Group'] && row['Protein.Group'].toLowerCase().includes(idQuery);
      const matchIds = row['Protein.Ids'] && row['Protein.Ids'].toLowerCase().includes(idQuery);
      if (!matchGroup && !matchIds) return false;
    }

    return true;
  });
}

/**
 * Recalculates and aggregates filtered precursor rows into a Protein Group Matrix
 */
function aggregateProteinMatrix(filteredRows, runs, settings) {
  // Group filtered rows by Protein.Group
  const groupMap = new Map();

  for (let i = 0; i < filteredRows.length; i++) {
    const row = filteredRows[i];
    const pgId = row['Protein.Group'] || row['Protein.Ids'] || 'Unknown';

    let pgEntry = groupMap.get(pgId);
    if (!pgEntry) {
      pgEntry = {
        labels: {
          proteinGroup: pgId,
          proteinNames: row['Protein.Names'] || '',
          genes: row['Genes'] || '',
          firstProteinDescription: row['First.Protein.Description'] || row['Protein.Names'] || ''
        },
        sequencesSet: new Set(),
        proteotypicSequencesSet: new Set(),
        runRowsMap: new Map(), // Run -> array of rows
        runSeqMap: new Map() // Run -> Set of stripped sequences
      };
      groupMap.set(pgId, pgEntry);
    }

    // Record unique stripped sequences
    const stripped = row['Stripped.Sequence'] || row['Modified.Sequence'];
    accumulateGroupEntry(pgEntry, row, stripped);
  }

  return aggregateGroupMatrix(groupMap, runs, settings);
}

// Shared per-group quantification core. Each map entry holds
// {labels, sequencesSet, proteotypicSequencesSet, runRowsMap, runSeqMap};
// labels are spread into each output row. Optional finalize(row, entry)
// hook derives extra fields (e.g. gene protein-group counts).
function aggregateGroupMatrix(groupMap, runs, settings, finalize) {
  const {
    quantMethod = 'PG.MaxLFQ',
    intensityColumn = 'Precursor.Normalised'
  } = settings;

  // Build matrix rows
  const matrix = [];

  for (const entry of groupMap.values()) {
    const sampleIntensities = {};
    const samplePeptideCounts = {};
    let totalIntensity = 0;
    let detectedRuns = 0;
    let maxIntensity = 0;
    let maxPeptideCount = 0;

    for (const run of runs) {
      const rowsForRun = entry.runRowsMap.get(run) || [];
      let val = null;

      if (rowsForRun.length > 0) {
        if (quantMethod === 'PG.MaxLFQ') {
          // Take MaxLFQ reported by DIA-NN
          for (const r of rowsForRun) {
            const m = r['PG.MaxLFQ'];
            if (m != null && m > 0) {
              val = m;
              break;
            }
          }
          // If no non-zero MaxLFQ found, fallback to Top 3 mean or sum
          if (val == null || val === 0) {
            const sumInt = rowsForRun.reduce((acc, r) => acc + (r[intensityColumn] || 0), 0);
            val = sumInt > 0 ? sumInt : null;
          }
        } else if (quantMethod === 'Top3') {
          // Top 3 precursors mean
          const sorted = rowsForRun
            .map(r => r[intensityColumn] || 0)
            .filter(v => v > 0)
            .sort((a, b) => b - a);

          if (sorted.length > 0) {
            const top3 = sorted.slice(0, 3);
            val = top3.reduce((a, b) => a + b, 0) / top3.length;
          }
        } else {
          // Default: Sum Precursors
          const sum = rowsForRun.reduce((acc, r) => acc + (r[intensityColumn] || 0), 0);
          val = sum > 0 ? sum : null;
        }
      }

      sampleIntensities[run] = val;
      const nPep = (entry.runSeqMap.get(run) || new Set()).size;
      samplePeptideCounts[run] = nPep;
      if (nPep > maxPeptideCount) maxPeptideCount = nPep;
      if (val != null && val > 0) {
        totalIntensity += val;
        detectedRuns++;
        if (val > maxIntensity) maxIntensity = val;
      }
    }

    const nSequences = entry.sequencesSet.size;
    const nProteotypic = entry.proteotypicSequencesSet.size;
    const meanIntensity = detectedRuns > 0 ? totalIntensity / detectedRuns : 0;

    const row = Object.assign({
      nSequences,
      nProteotypicSequences: nProteotypic,
      sampleIntensities,
      samplePeptideCounts,
      detectedRuns,
      totalIntensity,
      meanIntensity,
      maxIntensity,
      maxPeptideCount
    }, entry.labels);
    if (finalize) finalize(row, entry);
    matrix.push(row);
  }

  // Sort initially by total intensity descending
  matrix.sort((a, b) => b.totalIntensity - a.totalIntensity);

  return matrix;
}

// Accumulate one filtered row into a group entry (shared by protein/gene paths)
function accumulateGroupEntry(entry, row, stripped) {
  if (stripped) {
    entry.sequencesSet.add(stripped);
    if (row['Proteotypic'] === 1) {
      entry.proteotypicSequencesSet.add(stripped);
    }
  }

  // Organize by run
  const run = row['Run'];
  if (run) {
    let rRows = entry.runRowsMap.get(run);
    if (!rRows) {
      rRows = [];
      entry.runRowsMap.set(run, rRows);
    }
    rRows.push(row);
    if (stripped) {
      let rSeqs = entry.runSeqMap.get(run);
      if (!rSeqs) {
        rSeqs = new Set();
        entry.runSeqMap.set(run, rSeqs);
      }
      rSeqs.add(stripped);
    }
  }
}

// Builds Gene Matrix like the protein matrix but grouped by gene symbol.
// Precursors annotated with several genes (semicolon-separated) count
// toward each listed gene, so shared peptides contribute to each gene.
function aggregateGeneMatrix(filteredRows, runs, settings) {
  const groupMap = new Map();

  for (let i = 0; i < filteredRows.length; i++) {
    const row = filteredRows[i];
    const rawGenes = row['Genes'] || '';
    const geneList = rawGenes.split(';').map(g => g.trim()).filter(Boolean);
    const genes = geneList.length ? geneList : ['Unknown'];
    const pgId = row['Protein.Group'] || row['Protein.Ids'] || 'Unknown';

    for (const gene of genes) {
      let gEntry = groupMap.get(gene);
      if (!gEntry) {
        gEntry = {
          labels: {
            gene,
            proteinNames: row['Protein.Names'] || ''
          },
          pgSet: new Set(),
          sequencesSet: new Set(),
          proteotypicSequencesSet: new Set(),
          runRowsMap: new Map(),
          runSeqMap: new Map()
        };
        groupMap.set(gene, gEntry);
      }
      gEntry.pgSet.add(pgId);

      const stripped = row['Stripped.Sequence'] || row['Modified.Sequence'];
      accumulateGroupEntry(gEntry, row, stripped);
    }
  }

  return aggregateGroupMatrix(groupMap, runs, settings, (row, entry) => {
    row.nProteinGroups = entry.pgSet.size;
    row.proteinGroupList = Array.from(entry.pgSet).join('; ');
  });
}

/**
 * Builds Peptide Precursor Matrix for a selected protein (or all filtered precursors)
 */
function aggregatePeptideMatrix(filteredRows, runs, selectedProteinGroup = null, settings = {}, selectedGene = null) {
  const intensityCol = settings.intensityColumn || 'Precursor.Normalised';

  // Optionally filter by selected protein (takes precedence), otherwise by selected gene
  let targetRows = filteredRows;
  if (selectedProteinGroup) {
    targetRows = filteredRows.filter(r => r['Protein.Group'] === selectedProteinGroup || r['Protein.Ids'] === selectedProteinGroup);
  } else if (selectedGene) {
    targetRows = filteredRows.filter(r => (r['Genes'] || '').split(';').map(g => g.trim()).includes(selectedGene));
  }

  // Group by Precursor.Id
  const precursorMap = new Map();

  for (let i = 0; i < targetRows.length; i++) {
    const row = targetRows[i];
    const precId = row['Precursor.Id'] || `${row['Modified.Sequence'] || row['Stripped.Sequence']}_${row['Precursor.Charge']}`;

    let precEntry = precursorMap.get(precId);
    if (!precEntry) {
      precEntry = {
        precursorId: precId,
        strippedSequence: row['Stripped.Sequence'] || '',
        modifiedSequence: row['Modified.Sequence'] || row['Stripped.Sequence'] || '',
        charge: row['Precursor.Charge'] ?? '',
        proteinGroup: row['Protein.Group'] || row['Protein.Ids'] || '',
        proteinNames: row['Protein.Names'] || '',
        genes: row['Genes'] || '',
        proteotypic: row['Proteotypic'] === 1 ? 'Yes' : 'No',
        mz: row['Precursor.Mz'] ?? '',
        rt: row['RT'] != null ? Number(row['RT']).toFixed(2) : '',
        minQValue: row['Q.Value'] ?? 1,
        minGlobalQValue: row['Global.Q.Value'] ?? 1,
        minPGQValue: row['PG.Q.Value'] ?? 1,
        runIntensityMap: new Map() // Run -> intensity
      };
      precursorMap.set(precId, precEntry);
    }

    if (row['Q.Value'] != null && row['Q.Value'] < precEntry.minQValue) {
      precEntry.minQValue = row['Q.Value'];
    }
    if (row['Global.Q.Value'] != null && row['Global.Q.Value'] < precEntry.minGlobalQValue) {
      precEntry.minGlobalQValue = row['Global.Q.Value'];
    }
    if (row['PG.Q.Value'] != null && row['PG.Q.Value'] < precEntry.minPGQValue) {
      precEntry.minPGQValue = row['PG.Q.Value'];
    }

    const run = row['Run'];
    const intensity = row[intensityCol] ?? null;
    if (run && intensity != null && intensity > 0) {
      precEntry.runIntensityMap.set(run, intensity);
    }
  }

  // Build matrix rows
  const peptides = [];

  for (const entry of precursorMap.values()) {
    const sampleIntensities = {};
    let totalIntensity = 0;
    let detectedRuns = 0;
    let maxIntensity = 0;

    for (const run of runs) {
      const val = entry.runIntensityMap.get(run) ?? null;
      sampleIntensities[run] = val;
      if (val != null && val > 0) {
        totalIntensity += val;
        detectedRuns++;
        if (val > maxIntensity) maxIntensity = val;
      }
    }

    peptides.push({
      precursorId: entry.precursorId,
      strippedSequence: entry.strippedSequence,
      modifiedSequence: entry.modifiedSequence,
      charge: entry.charge,
      proteinGroup: entry.proteinGroup,
      proteinNames: entry.proteinNames,
      genes: entry.genes,
      proteotypic: entry.proteotypic,
      mz: entry.mz,
      rt: entry.rt,
      qValue: entry.minQValue,
      globalQValue: entry.minGlobalQValue,
      pgQValue: entry.minPGQValue,
      sampleIntensities,
      detectedRuns,
      totalIntensity,
      meanIntensity: detectedRuns > 0 ? totalIntensity / detectedRuns : 0,
      maxIntensity
    });
  }

  peptides.sort((a, b) => b.totalIntensity - a.totalIntensity);
  return peptides;
}

/**
 * Exports Protein Matrix as TSV formatted like DIA-NN results.pg_matrix.tsv
 */
function exportProteinMatrixTSV(proteinList, runs) {
  const header = [
    'Protein.Group',
    'Protein.Names',
    'Genes',
    'First.Protein.Description',
    'N.Sequences',
    'N.Proteotypic.Sequences',
    ...runs
  ].join('\t');

  const lines = [header];

  for (const p of proteinList) {
    const rowVals = [
      p.proteinGroup || '',
      p.proteinNames || '',
      p.genes || '',
      p.firstProteinDescription || '',
      p.nSequences ?? 0,
      p.nProteotypicSequences ?? 0
    ];

    for (const run of runs) {
      const val = p.sampleIntensities[run];
      rowVals.push(val != null && !isNaN(val) ? val : '');
    }

    lines.push(rowVals.join('\t'));
  }

  return lines.join('\n');
}

function exportGeneMatrixTSV(geneList, runs) {
  const header = [
    'Genes',
    'Protein.Names',
    'N.Sequences',
    'N.Proteotypic.Sequences',
    'N.Protein.Groups',
    'Protein.Groups',
    ...runs
  ].join('\t');

  const lines = [header];

  for (const g of geneList) {
    const rowVals = [
      g.gene || '',
      g.proteinNames || '',
      g.nSequences ?? 0,
      g.nProteotypicSequences ?? 0,
      g.nProteinGroups ?? 0,
      g.proteinGroupList || ''
    ];

    for (const run of runs) {
      const val = g.sampleIntensities[run];
      rowVals.push(val != null && !isNaN(val) ? val : '');
    }

    lines.push(rowVals.join('\t'));
  }

  return lines.join('\n');
}

/**
 * Exports Peptide Matrix as TSV
 */
function exportPeptideMatrixTSV(peptideList, runs) {
  const header = [
    'Precursor.Id',
    'Stripped.Sequence',
    'Modified.Sequence',
    'Precursor.Charge',
    'Protein.Group',
    'Protein.Names',
    'Genes',
    'Proteotypic',
    'Q.Value',
    'Global.Q.Value',
    'PG.Q.Value',
    ...runs
  ].join('\t');

  const lines = [header];

  for (const p of peptideList) {
    const rowVals = [
      p.precursorId || '',
      p.strippedSequence || '',
      p.modifiedSequence || '',
      p.charge ?? '',
      p.proteinGroup || '',
      p.proteinNames || '',
      p.genes || '',
      p.proteotypic || '',
      p.qValue != null ? p.qValue : '',
      p.globalQValue != null ? p.globalQValue : '',
      p.pgQValue != null ? p.pgQValue : ''
    ];

    for (const run of runs) {
      const val = p.sampleIntensities[run];
      rowVals.push(val != null && !isNaN(val) ? val : '');
    }

    lines.push(rowVals.join('\t'));
  }

  return lines.join('\n');
}

/**
 * Helper to trigger browser file download
 */
function triggerDownload(content, filename, mimeType = 'text/tab-separated-values') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Basename of a run path without folders or .raw extension.
function cleanRunName(run) {
  return String(run || '').replace(/\\/g, '/').split('/').pop().replace(/\.raw$/i, '');
}

// Shorten sample display names by stripping the longest common prefix and
// suffix (cut back to separators so words stay intact). Falls back to less
// aggressive stripping when results would be empty or ambiguous.
function shortenSampleNames(runs) {
  const base = (runs || []).map(cleanRunName);
  if (base.length < 2) return base;
  const minLen = Math.min.apply(null, base.map((s) => s.length));
  const isSep = (ch) => ch === '_' || ch === '-' || ch === '.' || ch === ' ';
  const strip = (pre, suf) => base.map((s) => s.slice(pre, s.length - suf));
  const usable = (names) => {
    if (names.some((s) => !s)) return false;
    return new Set(names).size === names.length;
  };
  let pre = 0;
  while (pre < minLen && base.every((s) => s[pre] === base[0][pre])) pre++;
  let cutPre = pre;
  while (cutPre > 0 && !isSep(base[0][cutPre - 1])) cutPre--;
  let suf = 0;
  while (suf < minLen - pre && base.every((s) => s[s.length - 1 - suf] === base[0][base[0].length - 1 - suf])) suf++;
  let cutSuf = suf;
  while (cutSuf > 0 && !isSep(base[0][base[0].length - cutSuf])) cutSuf--;
  const candidates = [
    strip(cutPre, cutSuf),
    strip(cutPre, 0),
    strip(0, cutSuf),
    base
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (usable(candidates[i])) return candidates[i];
  }
  return base;
}

let _runLabelCacheKey = null;
let _runLabelCache = null;

// Display label for one run in the context of all runs (cached).
function shortRunLabel(run, runs) {
  const list = runs || [];
  const key = list.join('\n');
  if (key !== _runLabelCacheKey) {
    const labels = shortenSampleNames(list);
    _runLabelCache = {};
    for (let i = 0; i < list.length; i++) _runLabelCache[list[i]] = labels[i];
    _runLabelCacheKey = key;
  }
  return (_runLabelCache && _runLabelCache[run]) || cleanRunName(run);
}
