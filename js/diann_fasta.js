/* Nebula port of 0266_diann-parquet-parser/js/fasta.js - scoped for the #diannExplorerTab panel. See AGENTS.md. */
/* FASTA utilities — file://-safe classic script, no import/export.
 * Parses protein FASTA text, indexes entries by accession, and maps
 * identified peptide sequences back onto a protein sequence to compute
 * residue-level coverage. Load via plain <script src> before js/main.js.
 */

// Extract the accession from a FASTA header line (without the leading '>').
// Handles UniProt style 'sp|P12345|NAME ...' as well as plain '>ID ...'.
function fastaAccession(header) {
  const token = header.trim().split(/\s+/)[0];
  const parts = token.split("|");
  if (parts.length >= 3) return parts[1];
  if (parts.length === 2) return parts[1] || parts[0];
  return token;
}

// Parse FASTA text into [{ header, accession, description, sequence }].
function parseFastaText(text) {
  const entries = [];
  let header = null;
  let seqParts = [];
  const push = () => {
    if (header == null) return;
    const sequence = seqParts.join("").replace(/\s+/g, "").toUpperCase();
    if (sequence) {
      entries.push({
        header,
        accession: fastaAccession(header),
        description: header,
        sequence,
      });
    }
  };
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.charAt(0) === ">") {
      push();
      header = line.slice(1);
      seqParts = [];
    } else if (header != null) {
      seqParts.push(line);
    }
  }
  push();
  return entries;
}

// All searchable tokens of a FASTA header: accession, pipe parts, first
// token, GN= gene name, and every whitespace/punctuation-delimited word.
function headerTokens(header) {
  const tokens = new Set();
  const text = String(header || "").trim();
  if (!text) return tokens;
  const first = text.split(/\s+/)[0];
  tokens.add(first);
  first.split("|").forEach((t) => {
    if (t) tokens.add(t);
  });
  const gn = text.match(/\bGN=([^\s;]+)/);
  if (gn) tokens.add(gn[1]);
  text.split(/[\s|;,()[\]]+/).forEach((t) => {
    if (t) tokens.add(t);
  });
  return tokens;
}

// Index entries by every header token (first entry wins per token).
function buildFastaIndex(entries) {
  const index = new Map();
  const lower = new Map();
  for (let i = 0; i < entries.length; i++) {
    const toks = headerTokens(entries[i].header);
    toks.forEach((t) => {
      if (!index.has(t)) index.set(t, entries[i]);
      const l = t.toLowerCase();
      if (!lower.has(l)) lower.set(l, entries[i]);
    });
  }
  return { index, lower };
}

// Reduce a FASTA text to entries matching the given protein group ids.
// Returns { text, kept, total }; falls back to the full text when nothing matches.
function subsetFastaToProteins(fastaText, proteinGroups) {
  const entries = parseFastaText(fastaText);
  if (!entries.length) return { text: fastaText, kept: 0, total: 0 };
  const idx = buildFastaIndex(entries);
  const keep = new Set();
  (proteinGroups || []).forEach((pg) => {
    String(pg)
      .split(';')
      .forEach((s) => {
        const id = s.trim();
        if (!id) return;
        const hit = findProteinEntry(idx, id);
        if (hit) keep.add(hit.entry);
      });
  });
  if (!keep.size) return { text: fastaText, kept: 0, total: entries.length };
  let out = '';
  keep.forEach((e) => {
    out += '>' + e.header + '\n';
    for (let i = 0; i < e.sequence.length; i += 60) out += e.sequence.slice(i, i + 60) + '\n';
  });
  return { text: out, kept: keep.size, total: entries.length };
}

// Convert a DIA-NN results.protein_description.tsv text (columns including
// a protein id, gene/name/description and Sequence) into FASTA text so the
// regular coverage pipeline can use it. Returns { fasta, kept, total, skipped }.
function proteinDescriptionToFasta(text) {
  const lines = String(text || "").split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) rows.push(lines[i]);
  }
  if (!rows.length) throw new Error("empty protein description file");
  if (!rows.some((r) => r.indexOf("\t") >= 0)) {
    throw new Error("not a tab-separated file");
  }
  const head = rows[0].split("\t").map((h) => h.trim().toLowerCase());
  const hasHeader = head.some((h) => h === "sequence" || h === "seq" || h === "protein.sequence");
  let idIdx = -1;
  let seqIdx = -1;
  let nameIdx = -1;
  let geneIdx = -1;
  let descIdx = -1;
  if (hasHeader) {
    for (let i = 0; i < head.length; i++) {
      const h = head[i];
      if (idIdx < 0 && (h === "protein.id" || h === "id" || h === "accession" || h === "protein")) idIdx = i;
      if (seqIdx < 0 && (h === "sequence" || h === "seq" || h === "protein.sequence")) seqIdx = i;
      if (nameIdx < 0 && (h === "protein.name" || h === "name")) nameIdx = i;
      if (geneIdx < 0 && (h === "gene" || h === "genes" || h === "genename")) geneIdx = i;
      if (descIdx < 0 && (h === "description" || h === "desc" || h === "protein.description")) descIdx = i;
    }
  } else {
    idIdx = 0;
    seqIdx = head.length - 1;
  }
  if (idIdx < 0 || seqIdx < 0) {
    throw new Error("could not find protein id and Sequence columns");
  }
  const dataRows = hasHeader ? rows.slice(1) : rows;
  let out = "";
  let kept = 0;
  let skipped = 0;
  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i].split("\t");
    const id = (cols[idIdx] || "").trim();
    const seq = (cols[seqIdx] || "").replace(/[^A-Za-z]/g, "").toUpperCase();
    if (!id || !seq) {
      skipped++;
      continue;
    }
    const parts = [id];
    if (nameIdx >= 0 && cols[nameIdx] && cols[nameIdx].trim()) parts.push(cols[nameIdx].trim());
    if (geneIdx >= 0 && cols[geneIdx] && cols[geneIdx].trim()) parts.push("GN=" + cols[geneIdx].trim());
    if (descIdx >= 0 && cols[descIdx] && cols[descIdx].trim()) parts.push(cols[descIdx].trim());
    out += ">" + parts.join(" ") + "\n";
    for (let k = 0; k < seq.length; k += 60) out += seq.slice(k, k + 60) + "\n";
    kept++;
  }
  return { fasta: out, kept, total: dataRows.length, skipped };
}

// Strip isoform (-2) or version (.1) suffixes for lenient matching.
function stripSuffix(id) {
  return String(id || "").replace(/[-.]\d+$/, "");
}

// Resolve a DIA-NN Protein.Group value (possibly ';'-separated ids) to a
// FASTA entry. Tries exact token, normalized, then case-insensitive match.
// Returns { entry, matchedId } or null.
function findProteinEntry(fastaIndex, proteinGroup) {
  if (!fastaIndex || !proteinGroup) return null;
  const idx = fastaIndex.index || fastaIndex;
  const lower = fastaIndex.lower || null;
  const ids = String(proteinGroup)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const attempts = [];
  ids.forEach((id) => {
    attempts.push(id);
    const stripped = stripSuffix(id);
    if (stripped !== id) attempts.push(stripped);
  });
  for (let i = 0; i < attempts.length; i++) {
    const entry = idx.get(attempts[i]);
    if (entry) return { entry, matchedId: attempts[i] };
  }
  if (lower) {
    for (let i = 0; i < attempts.length; i++) {
      const entry = lower.get(attempts[i].toLowerCase());
      if (entry) return { entry, matchedId: attempts[i] };
    }
  }
  return null;
}

// Map unique peptide sequences onto a protein sequence (1-based positions).
// Returns { mapped: [{ sequence, start, end }], coveredCount, coveragePct }.
function mapPeptidesToSequence(sequence, peptideSequences) {
  const seq = String(sequence || "").toUpperCase();
  const covered = new Uint8Array(seq.length);
  const mapped = [];
  const seen = new Set();
  const peptides = peptideSequences || [];
  for (let i = 0; i < peptides.length; i++) {
    const pep = String(peptides[i] || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!pep || seen.has(pep)) continue;
    seen.add(pep);
    let from = 0;
    let hits = 0;
    while (from <= seq.length - pep.length) {
      const pos = seq.indexOf(pep, from);
      if (pos < 0) break;
      hits++;
      for (let k = pos; k < pos + pep.length; k++) covered[k] = 1;
      if (hits === 1) mapped.push({ sequence: pep, start: pos + 1, end: pos + pep.length });
      from = pos + 1;
    }
    if (hits > 1) {
      const first = mapped[mapped.length - 1];
      if (first) first.multi = hits;
    }
  }
  mapped.sort((a, b) => a.start - b.start);
  let coveredCount = 0;
  for (let i = 0; i < covered.length; i++) coveredCount += covered[i];
  return {
    mapped,
    unmatched: seen.size - mapped.length,
    coveredCount,
    coveragePct: seq.length ? (coveredCount / seq.length) * 100 : 0,
    covered,
  };
}

// Mask (Uint8Array) marking every occurrence of a peptide in a sequence.
function peptideOccurrenceMask(sequence, peptide) {
  const seq = String(sequence || "").toUpperCase();
  const pep = String(peptide || "").toUpperCase();
  const mask = new Uint8Array(seq.length);
  if (!pep) return mask;
  let from = 0;
  while (from <= seq.length - pep.length) {
    const pos = seq.indexOf(pep, from);
    if (pos < 0) break;
    for (let k = pos; k < pos + pep.length; k++) mask[k] = 1;
    from = pos + 1;
  }
  return mask;
}

// Render a protein sequence as an intensity heatmap: each residue is shaded
// by its summed mapped-peptide intensity, log-normalized to the observed
// data range (min..max positive residue totals) via color-mix, so highly
// observed regions stand out. `totals` parallels `sequence`.
function intensitySequenceHTML(sequence, totals, maxTotal, lineLen, minTotal, selected) {
  lineLen = lineLen || 50;
  const seq = String(sequence || "");
  const selAt = (i) => selected && selected[i] > 0;
  const lo = minTotal > 0 ? Math.log10(minTotal) : 0;
  const hi = maxTotal > 0 ? Math.log10(maxTotal) : 0;
  const span = hi - lo;
  const bucket = (v) => {
    if (!(v > 0) || !(hi > 0)) return 0;
    if (!(span > 0)) return 100;
    const t = (Math.log10(v) - lo) / span;
    return Math.max(10, Math.min(100, Math.round(((t * 90 + 10) / 10)) * 10));
  };
  let html = "";
  for (let s = 0; s < seq.length; s += lineLen) {
    const end = Math.min(s + lineLen, seq.length);
    html += '<span class="cov-pos">' + (s + 1) + "</span>";
    let i = s;
    while (i < end) {
      const b = bucket(totals[i] || 0);
      const sel = selAt(i);
      let j = i + 1;
      let peak = totals[i] || 0;
      while (j < end && bucket(totals[j] || 0) === b && selAt(j) === sel) {
        if ((totals[j] || 0) > peak) peak = totals[j];
        j++;
      }
      const chunk = seq.slice(i, j);
      const tip =
        "Residues " +
        (i + 1) +
        "-" +
        j +
        ": peak intensity " +
        Number(peak.toPrecision(3));
      if (sel) {
        html += '<span class="cov-selected" title="' + tip + '">' + chunk + "</span>";
      } else if (b > 0) {
        html +=
          '<span class="cov-int" style="background: color-mix(in srgb, var(--accent-primary) ' +
          b +
          '%, transparent)" title="' +
          tip +
          '">' +
          chunk +
          "</span>";
      } else {
        html += chunk;
      }
      i = j;
    }
    html += "\n";
  }
  return html;
}
// Render sequence lines with covered runs as .cov-covered (.cov-selected wins via mask).
function coverageSequenceHTML(sequence, covered, lineLen, selected) {
  lineLen = lineLen || 50;
  const seq = String(sequence || "");
  const selAt = (i) => selected && selected[i] > 0;
  let html = "";
  for (let s = 0; s < seq.length; s += lineLen) {
    const end = Math.min(s + lineLen, seq.length);
    html += '<span class="cov-pos">' + (s + 1) + "</span>";
    let i = s;
    while (i < end) {
      const cov = covered[i] > 0;
      const sel = selAt(i);
      let j = i + 1;
      while (j < end && covered[j] > 0 === cov && selAt(j) === sel) j++;
      const chunk = seq.slice(i, j);
      if (sel) html += '<span class="cov-selected">' + chunk + "</span>";
      else if (cov) html += '<span class="cov-covered">' + chunk + "</span>";
      else html += chunk;
      i = j;
    }
    html += "\n";
  }
  return html;
}
