// Self-organizing map (SOM) worker source.
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._somWorkerSrc and creates a Blob Worker from it.
//
// Responsibilities (all heavy numeric work runs off the main thread):
//   - codebook initialization: PCA plane (samples laid along the first two
//     principal components) or random draws from the data
//   - online SOM training with a Gaussian / bubble neighbourhood on a
//     hexagonal (odd-r offset) or rectangular lattice, with decaying
//     learning rate and neighbourhood radius
//   - best-matching unit (BMU) and runner-up per sample, quantization error
//     and topographic error
//   - U-matrix (mean codebook distance between neighbouring map units) and
//     hit counts, the two standard SOM diagnostics
//   - optional grouping of the trained map units into k meta-clusters with
//     k-means (auto-k by silhouette or a fixed k), so samples inherit a
//     compact cluster label from their BMU
window._somWorkerSrc = `
'use strict';

/* Deterministic RNG (mulberry32) so a fixed seed reproduces the same map. */
function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Squared Euclidean distance between rows a and b (arrays of equal length). */
function dist2(a, b) {
    var s = 0;
    for (var j = 0; j < a.length; j++) {
        var d = a[j] - b[j];
        s += d * d;
    }
    return s;
}

/* Two principal components (power iteration + deflation) for PCA initialization. */
function pcaCore(X) {
    var n = X.length, m = X[0].length;
    var mean = new Float64Array(m);
    for (var i = 0; i < n; i++) {
        var r = X[i];
        for (var j = 0; j < m; j++) mean[j] += r[j];
    }
    for (var jm = 0; jm < m; jm++) mean[jm] /= n;
    var C = [];
    for (var a = 0; a < n; a++) {
        var cr = new Float64Array(m), src = X[a];
        for (var b = 0; b < m; b++) cr[b] = src[b] - mean[b];
        C.push(cr);
    }
    var denom = (n - 1) || 1;
    var totalVar = 0;
    for (var jv = 0; jv < m; jv++) {
        var sv = 0;
        for (var iv = 0; iv < n; iv++) sv += C[iv][jv] * C[iv][jv];
        totalVar += sv / denom;
    }
    var comps = [];
    var eigs = [];
    for (var comp = 0; comp < 2; comp++) {
        var vec = new Float64Array(m);
        vec[comp % m] = 1;
        for (var it = 0; it < 80; it++) {
            var xv = new Float64Array(n);
            for (var k1 = 0; k1 < n; k1++) {
                var xx = 0, cc = C[k1];
                for (var j3 = 0; j3 < m; j3++) xx += cc[j3] * vec[j3];
                xv[k1] = xx;
            }
            var nv = new Float64Array(m);
            for (var j4 = 0; j4 < m; j4++) {
                var s2 = 0;
                for (var k2 = 0; k2 < n; k2++) s2 += C[k2][j4] * xv[k2];
                nv[j4] = s2 / denom;
            }
            for (var prev = 0; prev < comp; prev++) {
                var dot = 0;
                for (var jp = 0; jp < m; jp++) dot += nv[jp] * comps[prev][jp];
                for (var jp2 = 0; jp2 < m; jp2++) nv[jp2] -= dot * comps[prev][jp2];
            }
            var norm = 0;
            for (var jn = 0; jn < m; jn++) norm += nv[jn] * nv[jn];
            norm = Math.sqrt(norm);
            if (norm < 1e-12) break;
            for (var jd = 0; jd < m; jd++) vec[jd] = nv[jd] / norm;
        }
        var eig = 0;
        for (var ke = 0; ke < n; ke++) {
            var proj = 0, ce = C[ke];
            for (var je = 0; je < m; je++) proj += ce[je] * vec[je];
            eig += proj * proj;
        }
        eigs.push(eig / denom);
        comps.push(vec);
    }
    return { mean: mean, comps: comps, eigs: eigs, totalVar: totalVar };
}

/* Lattice geometry: odd rows of a hexagonal map are shifted right by half a unit. */
function unitXY(topology, row, col) {
    if (topology === 'hex') {
        return { x: col + (row % 2 ? 0.5 : 0), y: -row * 0.8660254037844386 };
    }
    return { x: col, y: -row };
}

/* Graph distance between two units (hex: cube/axial distance, rect: Euclidean). */
function gridDistance(topology, r1, c1, r2, c2) {
    if (topology === 'hex') {
        var q1 = c1 - (r1 - (r1 & 1)) / 2;
        var q2 = c2 - (r2 - (r2 & 1)) / 2;
        var dq = q1 - q2, dr = r1 - r2;
        return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    }
    var dx = c1 - c2, dy = r1 - r2;
    return Math.sqrt(dx * dx + dy * dy);
}

function neighborOffsets(topology, row) {
    if (topology === 'hex') {
        return (row % 2)
            ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
            : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    }
    return [[0, -1], [0, 1], [-1, 0], [1, 0]];
}

function makeCodebook(units, m) {
    var code = [];
    for (var u = 0; u < units; u++) code.push(new Float64Array(m));
    return code;
}

/* PCA-plane initialization: units span the first two principal components. */
function initPCA(code, gridRows, gridCols, pc) {
    var m = pc.mean.length;
    var s1 = Math.sqrt(Math.max(pc.eigs[0] || 0, 1e-12));
    var s2 = Math.sqrt(Math.max(pc.eigs[1] || 0, 1e-12));
    var cxm = (gridCols - 1) / 2;
    var cym = (gridRows - 1) / 2;
    var u = 0;
    for (var r = 0; r < gridRows; r++) {
        var fy = cym > 0 ? (r - cym) / cym : 0;
        for (var c = 0; c < gridCols; c++) {
            var fx = cxm > 0 ? (c - cxm) / cxm : 0;
            var row = code[u++];
            for (var j = 0; j < m; j++) {
                row[j] = pc.mean[j] + fx * s1 * pc.comps[0][j] + fy * s2 * pc.comps[1][j];
            }
        }
    }
}

/* Random initialization: every unit starts at a random sample. */
function initRandom(code, X, rng) {
    var n = X.length;
    for (var u = 0; u < code.length; u++) {
        var pick = Math.floor(rng() * n);
        var src = X[pick], dst = code[u];
        for (var j = 0; j < dst.length; j++) dst[j] = src[j];
    }
}

/* Online SOM training. Returns the BMU of every sample after the last epoch. */
function train(X, code, gd2, opts, rng, onEpoch) {
    var n = X.length, units = code.length, m = X[0].length;
    var epochs = Math.max(1, opts.epochs);
    var alpha0 = opts.alpha;
    var sigma0 = opts.sigma;
    var bubble = opts.neighborhood === 'bubble';
    var order = new Int32Array(n);
    var i;
    for (i = 0; i < n; i++) order[i] = i;
    var bmu = new Int32Array(n);
    for (var ep = 0; ep < epochs; ep++) {
        var frac = epochs > 1 ? ep / (epochs - 1) : 1;
        var alpha = alpha0 * (1 - frac * 0.93) + 0.005;
        var sigma = sigma0 * (1 - frac * 0.75);
        if (sigma < 0.5) sigma = 0.5;
        var twoSigma2 = 2 * sigma * sigma;
        var sigma2 = sigma * sigma;
        // Shuffle the sample order so the map does not drift with matrix order.
        for (var s = n - 1; s > 0; s--) {
            var jj = Math.floor(rng() * (s + 1));
            var t = order[s]; order[s] = order[jj]; order[jj] = t;
        }
        for (var k = 0; k < n; k++) {
            var idx = order[k];
            var xi = X[idx];
            var best = 0, bestD = Infinity;
            for (var u = 0; u < units; u++) {
                var cv = code[u], d = 0;
                for (var j = 0; j < m; j++) { var df = xi[j] - cv[j]; d += df * df; }
                if (d < bestD) { bestD = d; best = u; }
            }
            bmu[idx] = best;
            var grow = gd2[best];
            for (var v = 0; v < units; v++) {
                var d2g = grow[v];
                var h;
                if (bubble) {
                    if (d2g > sigma2) continue;
                    h = alpha;
                } else {
                    if (d2g > 36) continue; // exp(-36/2) is already negligible
                    h = alpha * Math.exp(-d2g / twoSigma2);
                }
                if (h < 1e-5) continue;
                var cw = code[v];
                for (var jw = 0; jw < m; jw++) cw[jw] += h * (xi[jw] - cw[jw]);
            }
        }
        if (onEpoch) onEpoch(ep + 1, epochs);
    }
    return bmu;
}

/* Best and second-best unit per sample, plus the distance to the BMU code vector. */
function matchSamples(X, code, units, m) {
    var n = X.length;
    var bmu = new Int32Array(n);
    var second = new Int32Array(n);
    var quant = new Float64Array(n);
    for (var i = 0; i < n; i++) {
        var xi = X[i];
        var b1 = -1, d1 = Infinity, b2 = -1, d2 = Infinity;
        for (var u = 0; u < units; u++) {
            var cv = code[u], d = 0;
            for (var j = 0; j < m; j++) { var df = xi[j] - cv[j]; d += df * df; }
            if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = u; }
            else if (d < d2) { d2 = d; b2 = u; }
        }
        bmu[i] = b1;
        second[i] = b2 < 0 ? b1 : b2;
        quant[i] = Math.sqrt(d1);
    }
    return { bmu: bmu, second: second, quant: quant };
}

/* Mean distance from every unit to its lattice neighbours (U-matrix). */
function buildUMatrix(code, topology, gridRows, gridCols) {
    var u = [];
    for (var r = 0; r < gridRows; r++) {
        var rowVals = [];
        for (var c = 0; c < gridCols; c++) {
            var idx = r * gridCols + c;
            var offs = neighborOffsets(topology, r);
            var sum = 0, cnt = 0;
            for (var t = 0; t < offs.length; t++) {
                var rr = r + offs[t][0], cc = c + offs[t][1];
                if (rr < 0 || rr >= gridRows || cc < 0 || cc >= gridCols) continue;
                var nb = code[rr * gridCols + cc];
                sum += Math.sqrt(dist2(code[idx], nb));
                cnt++;
            }
            rowVals.push(cnt > 0 ? sum / cnt : 0);
        }
        u.push(rowVals);
    }
    return u;
}

/* Unit hit counts as a rows x cols matrix. */
function buildHits(bmu, gridRows, gridCols) {
    var hits = [];
    for (var r = 0; r < gridRows; r++) {
        var rowVals = [];
        for (var c = 0; c < gridCols; c++) rowVals.push(0);
        hits.push(rowVals);
    }
    for (var i = 0; i < bmu.length; i++) {
        var idx = bmu[i];
        hits[Math.floor(idx / gridCols)][idx % gridCols]++;
    }
    return hits;
}

/* ---- k-means over the trained codebook vectors (map meta-clusters) ---- */

function initUnitsPlusPlus(code, k, rng) {
    var n = code.length;
    var centers = [Float64Array.from(code[Math.floor(rng() * n)])];
    var d2 = new Float64Array(n);
    for (var i = 0; i < n; i++) d2[i] = dist2(code[i], centers[0]);
    for (var c = 1; c < k; c++) {
        var sum = 0;
        for (var q = 0; q < n; q++) sum += d2[q];
        var target = rng() * sum;
        var acc = 0, chosen = n - 1;
        for (var p = 0; p < n; p++) {
            acc += d2[p];
            if (acc >= target) { chosen = p; break; }
        }
        centers.push(Float64Array.from(code[chosen]));
        for (var r = 0; r < n; r++) {
            var nd = dist2(code[r], centers[c]);
            if (nd < d2[r]) d2[r] = nd;
        }
    }
    return centers;
}

function lloydUnits(code, k, centers, maxIter) {
    var n = code.length, m = code[0].length;
    var labels = new Int32Array(n);
    var iter = 0;
    for (iter = 0; iter < maxIter; iter++) {
        var changed = false;
        for (var i = 0; i < n; i++) {
            var best = 0, bestD = Infinity;
            for (var c = 0; c < k; c++) {
                var d = dist2(code[i], centers[c]);
                if (d < bestD) { bestD = d; best = c; }
            }
            if (labels[i] !== best) { labels[i] = best; changed = true; }
        }
        var sums = [];
        var counts = new Int32Array(k);
        for (var s = 0; s < k; s++) sums.push(new Float64Array(m));
        for (var p = 0; p < n; p++) {
            var lab = labels[p];
            counts[lab]++;
            var row = code[p], sr = sums[lab];
            for (var j = 0; j < m; j++) sr[j] += row[j];
        }
        for (var cc = 0; cc < k; cc++) {
            if (counts[cc] > 0) {
                var inv = 1 / counts[cc], cen = centers[cc], su = sums[cc];
                for (var jj = 0; jj < m; jj++) cen[jj] = su[jj] * inv;
            } else {
                var far = 0, farD = -1;
                for (var q = 0; q < n; q++) {
                    var dd = dist2(code[q], centers[labels[q]]);
                    if (dd > farD) { farD = dd; far = q; }
                }
                centers[cc] = Float64Array.from(code[far]);
                labels[far] = cc;
                changed = true;
            }
        }
        if (!changed && iter > 0) { iter++; break; }
    }
    var inertia = 0;
    for (var z = 0; z < n; z++) inertia += dist2(code[z], centers[labels[z]]);
    return { labels: labels, centers: centers, inertia: inertia, iterations: iter };
}

function runUnitsKMeans(code, k, rng, maxIter, nInit) {
    var best = null;
    for (var t = 0; t < nInit; t++) {
        var centers = initUnitsPlusPlus(code, k, rng);
        var res = lloydUnits(code, k, centers, maxIter);
        if (!best || res.inertia < best.inertia) best = res;
    }
    return best;
}

/* Pairwise Euclidean distances between map units (units are few). */
function unitDistances(code) {
    var n = code.length;
    var D = [];
    for (var i = 0; i < n; i++) D.push(new Float64Array(n));
    for (var a = 0; a < n; a++) {
        for (var b = a + 1; b < n; b++) {
            var d = Math.sqrt(dist2(code[a], code[b]));
            D[a][b] = d; D[b][a] = d;
        }
    }
    return D;
}

function silhouetteUnits(D, labels, k) {
    var n = labels.length;
    var counts = new Int32Array(k);
    for (var i = 0; i < n; i++) counts[labels[i]]++;
    var total = 0, usable = 0;
    for (var p = 0; p < n; p++) {
        var own = labels[p];
        if (counts[own] <= 1) continue;
        var sums = new Float64Array(k);
        var row = D[p];
        for (var q = 0; q < n; q++) sums[labels[q]] += row[q];
        var a = sums[own] / (counts[own] - 1);
        var b = Infinity;
        for (var c = 0; c < k; c++) {
            if (c === own || counts[c] === 0) continue;
            var mean = sums[c] / counts[c];
            if (mean < b) b = mean;
        }
        if (b === Infinity) continue;
        total += (b - a) / Math.max(a, b);
        usable++;
    }
    return usable > 0 ? total / usable : 0;
}

/* Group the trained map units; auto-k uses the best mean silhouette. */
function clusterUnits(code, mode, fixedK, rng) {
    var units = code.length;
    if (units < 3) {
        var single = new Int32Array(units);
        return { k: 1, chosenBy: 'none', silhouette: null, labels: single, sizes: [units] };
    }
    var D = unitDistances(code);
    var maxK = Math.min(8, units - 1);
    var k;
    var chosenBy;
    if (mode === 'fixed') {
        k = Math.max(2, Math.min(fixedK, maxK));
        chosenBy = 'fixed';
    } else {
        var bestSil = -Infinity;
        k = 2;
        for (var cand = 2; cand <= maxK; cand++) {
            var resC = runUnitsKMeans(code, cand, rng, 100, 3);
            var sil = silhouetteUnits(D, resC.labels, cand);
            if (sil > bestSil) { bestSil = sil; k = cand; }
        }
        chosenBy = 'silhouette';
    }
    var res = runUnitsKMeans(code, k, rng, 200, 10);
    var labels = Array.from(res.labels);
    var sizes = new Array(k).fill(0);
    for (var i = 0; i < labels.length; i++) sizes[labels[i]]++;
    return {
        k: k,
        chosenBy: chosenBy,
        silhouette: silhouetteUnits(D, res.labels, k),
        labels: res.labels,
        sizes: sizes
    };
}

self.onmessage = function (e) {
    var msg = e.data || {};
    if (msg.type !== 'run') return;
    try {
        var X = msg.X;
        var o = msg.opts || {};
        var n = X.length;
        var m = X[0] ? X[0].length : 0;
        if (n < 3 || m < 1) throw new Error('Need at least 3 samples with features to build a map.');

        var gridCols = Math.max(2, Math.min(20, Math.round(o.gridCols || 6)));
        var gridRows = Math.max(2, Math.min(20, Math.round(o.gridRows || 6)));
        var topology = o.topology === 'rect' ? 'rect' : 'hex';
        var units = gridRows * gridCols;
        var rng = makeRng(o.seed || 42);

        self.postMessage({ type: 'progress', progress: 4, message: 'Initializing the map…' });
        var code = makeCodebook(units, m);
        if (o.initMethod === 'random') {
            initRandom(code, X, rng);
        } else {
            initPCA(code, gridRows, gridCols, pcaCore(X));
        }

        // Squared graph distance between every pair of units.
        var gd2 = [];
        for (var a = 0; a < units; a++) {
            var row = new Float64Array(units);
            var ar = Math.floor(a / gridCols), ac = a % gridCols;
            for (var b = 0; b < units; b++) {
                var d = gridDistance(topology, ar, ac, Math.floor(b / gridCols), b % gridCols);
                row[b] = d * d;
            }
            gd2.push(row);
        }

        var epochs = Math.max(1, Math.round(o.epochs || 40));
        self.postMessage({ type: 'progress', progress: 8, message: 'Training the map (0/' + epochs + ' epochs)…' });
        var bmu = train(X, code, gd2, {
            epochs: epochs,
            alpha: o.alpha > 0 ? o.alpha : 0.5,
            sigma: o.sigma > 0 ? o.sigma : Math.max(1, Math.min(gridRows, gridCols) / 2),
            neighborhood: o.neighborhood === 'bubble' ? 'bubble' : 'gaussian'
        }, rng, function (ep, total) {
            var pct = 8 + Math.round((ep / total) * 72);
            self.postMessage({
                type: 'progress',
                progress: pct,
                message: 'Training the map (' + ep + '/' + total + ' epochs)…'
            });
        });

        self.postMessage({ type: 'progress', progress: 84, message: 'Matching samples to map units…' });
        var match = matchSamples(X, code, units, m);

        self.postMessage({ type: 'progress', progress: 89, message: 'Computing U-matrix…' });
        var uMatrix = buildUMatrix(code, topology, gridRows, gridCols);
        var hits = buildHits(match.bmu, gridRows, gridCols);

        var qErr = 0;
        for (var qi = 0; qi < n; qi++) qErr += match.quant[qi];
        qErr = qErr / n;

        // Topographic error: fraction of samples whose runner-up unit is not a neighbour.
        var topoBad = 0;
        for (var ti = 0; ti < n; ti++) {
            var u1 = match.bmu[ti], u2 = match.second[ti];
            if (u1 === u2) continue;
            var distG = gridDistance(topology, Math.floor(u1 / gridCols), u1 % gridCols,
                Math.floor(u2 / gridCols), u2 % gridCols);
            if (distG > 1.0001) topoBad++;
        }
        var topographicError = topoBad / n;

        self.postMessage({ type: 'progress', progress: 93, message: 'Grouping map units…' });
        var grouping = clusterUnits(code, o.unitClusterMode === 'fixed' ? 'fixed' : 'auto',
            o.unitK || 4, rng);

        self.postMessage({ type: 'progress', progress: 97, message: 'Finalizing…' });

        // Lattice coordinates for the sample overlay, with a stable jitter so
        // samples that share a unit stay distinguishable.
        var jrng = makeRng(987654321);
        var cellR = topology === 'hex' ? 0.42 : 0.34;
        var sampleX = [], sampleY = [], sampleRow = [], sampleCol = [], sampleCluster = [], sampleDist = [];
        for (var si = 0; si < n; si++) {
            var unitIdx = match.bmu[si];
            var ur = Math.floor(unitIdx / gridCols), uc = unitIdx % gridCols;
            var p = unitXY(topology, ur, uc);
            var rad = cellR * Math.sqrt(jrng());
            var th = jrng() * Math.PI * 2;
            sampleX.push(p.x + rad * Math.cos(th));
            sampleY.push(p.y + rad * Math.sin(th));
            sampleRow.push(ur + 1);
            sampleCol.push(uc + 1);
            sampleCluster.push(grouping.k > 1 ? grouping.labels[unitIdx] : 0);
            sampleDist.push(match.quant[si]);
        }

        var unitX = [], unitY = [];
        for (var ui = 0; ui < units; ui++) {
            var xy = unitXY(topology, Math.floor(ui / gridCols), ui % gridCols);
            unitX.push(xy.x);
            unitY.push(xy.y);
        }

        self.postMessage({
            type: 'result',
            success: true,
            result: {
                gridRows: gridRows,
                gridCols: gridCols,
                topology: topology,
                neighborhood: o.neighborhood === 'bubble' ? 'bubble' : 'gaussian',
                units: units,
                epochs: epochs,
                sampleCount: n,
                featureCount: m,
                quantizationError: qErr,
                topographicError: topographicError,
                hits: hits,
                uMatrix: uMatrix,
                unitX: unitX,
                unitY: unitY,
                unitCluster: grouping.k > 1 ? Array.from(grouping.labels) : new Array(units).fill(0),
                clusterK: grouping.k,
                clusterChosenBy: grouping.chosenBy,
                clusterSilhouette: grouping.silhouette,
                clusterSizes: grouping.sizes,
                sampleUnit: Array.from(match.bmu),
                sampleRow: sampleRow,
                sampleCol: sampleCol,
                sampleCluster: sampleCluster,
                sampleDist: sampleDist,
                sampleX: sampleX,
                sampleY: sampleY
            }
        });
    } catch (err) {
        self.postMessage({ type: 'result', success: false, error: (err && err.message) ? err.message : String(err) });
    }
};
`;
