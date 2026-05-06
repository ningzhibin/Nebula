/**
 * SAINTq Algorithm Implementation in JavaScript
 * Based on SAINTq C++ source code
 * Ported for web-based AP-MS interaction scoring
 *
 * Uses full MRF optimization (ICM + beta1) to match the desktop SAINTq algorithm.
 */

// Utility functions
const utils = {
    isMissing: (x) => isNaN(x) || x === null || x === undefined || x === 0,
    
    log2: (x) => Math.log2(x),
    
    exp2: (x) => Math.pow(2, x),
    
    mean: (arr) => {
        const valid = arr.filter(x => !utils.isMissing(x));
        if (valid.length === 0) return NaN;
        return valid.reduce((a, b) => a + b, 0) / valid.length;
    },
    
    variance: (arr) => {
        const valid = arr.filter(x => !utils.isMissing(x));
        if (valid.length < 2) return NaN;
        const m = utils.mean(valid);
        const variance = valid.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (valid.length - 1);
        return variance;
    },
    
    sd: (arr) => {
        const v = utils.variance(arr);
        return isNaN(v) ? NaN : Math.sqrt(v);
    },
    
    sum: (arr) => arr.reduce((a, b) => (utils.isMissing(b) ? a : a + b), 0),
    
    min: (arr) => {
        const valid = arr.filter(x => !utils.isMissing(x));
        return valid.length === 0 ? NaN : Math.min(...valid);
    },
    
    max: (arr) => {
        const valid = arr.filter(x => !utils.isMissing(x));
        return valid.length === 0 ? NaN : Math.max(...valid);
    },
    
    median: (arr) => {
        const valid = arr.filter(x => !utils.isMissing(x)).sort((a, b) => a - b);
        if (valid.length === 0) return NaN;
        const mid = Math.floor(valid.length / 2);
        return valid.length % 2 === 0 
            ? (valid[mid - 1] + valid[mid]) / 2 
            : valid[mid];
    },
    
    meanOfTopN: (arr, n) => {
        const valid = arr.filter(x => !utils.isMissing(x))
            .map(x => utils.isMissing(x) ? 0 : x)
            .sort((a, b) => b - a);
        const n2 = Math.min(n, valid.length);
        if (n2 === 0) return 0;
        return valid.slice(0, n2).reduce((a, b) => a + b, 0) / n2;
    },
    // Match desktop SAINTq: NaN -> 0, sort desc, take top n, divide sum by min(n, length)
    meanOfTopNSaintq: (arr, n) => {
        const v2 = arr.map(x => (utils.isMissing(x) ? 0 : x));
        const n2 = Math.min(n, v2.length);
        if (n2 === 0) return 0;
        v2.sort((a, b) => b - a);
        return v2.slice(0, n2).reduce((a, b) => a + b, 0) / n2;
    }
};

// BFDR calculation
function calculateBFDR(scores) {
    // Create array of score-index pairs
    const scoreIdxPairs = scores
        .map((score, idx) => ({ score, idx }))
        .filter(pair => !utils.isMissing(pair.score));
    
    if (scoreIdxPairs.length === 0) {
        return scores.map(() => NaN);
    }
    
    // Sort by score descending
    scoreIdxPairs.sort((a, b) => b.score - a.score);
    
    const n = scoreIdxPairs.length;
    const bfdr = new Array(scores.length).fill(NaN);
    
    // Calculate BFDR
    let psum = 0;
    let lastBFDR = 0;
    bfdr[scoreIdxPairs[0].idx] = 0;
    
    for (let i = 0; i < n - 1; i++) {
        psum += scoreIdxPairs[i].score;
        if (scoreIdxPairs[i].score === scoreIdxPairs[i + 1].score) {
            bfdr[scoreIdxPairs[i + 1].idx] = lastBFDR;
        } else {
            lastBFDR = Math.max(0, 1 - psum / (i + 1));
            bfdr[scoreIdxPairs[i + 1].idx] = lastBFDR;
        }
    }
    
    return bfdr;
}

// ----- MRF (Markov Random Field) optimization - match desktop SAINTq -----
// Build likelihood matrix: for each (i,j) with non-missing test value, { false_, true_ } PDFs
function getQuantPDFs(testData, ctrlMeans, ctrlSDs, muD, testSDs) {
    const nRows = testData.length;
    const nCols = testData[0] ? testData[0].length : 0;
    const lik = Array(nRows).fill(null).map(() => Array(nCols).fill(null));
    for (let i = 0; i < nRows; i++) {
        for (let j = 0; j < nCols; j++) {
            const e = testData[i][j];
            if (utils.isMissing(e)) {
                lik[i][j] = { false_: NaN, true_: NaN };
                continue;
            }
            const muF = ctrlMeans[i];
            const muT = muF + muD[i];
            const sdF = ctrlSDs[i];
            const sdT = testSDs[i];
            lik[i][j] = {
                false_: quantPDFFalse(e, muF, sdF),
                true_: quantPDFTrue(e, muT, sdT)
            };
        }
    }
    return lik;
}

// Single-cell log-likelihood (desktop: row_col_loglikelihood)
function rowColLoglikelihood(lik, z, MRF_true, MRF_false, i, j) {
    const ll = lik[i][j];
    const num = z === 0 ? (MRF_false * ll.false_) : (MRF_true * ll.true_);
    return Math.log(num / (MRF_true + MRF_false));
}

// Full log-likelihood; desktop uses exp2(beta1) for MRF_true
function loglikelihoodMRF(beta1, Z, lik, testData) {
    const MRF_true = utils.exp2(beta1);
    const MRF_false = 1;
    let loglik = 0;
    for (let i = 0; i < testData.length; i++) {
        for (let j = 0; j < testData[i].length; j++) {
            if (utils.isMissing(testData[i][j])) continue;
            loglik += rowColLoglikelihood(lik, Z[i][j], MRF_true, MRF_false, i, j);
        }
    }
    return loglik;
}

// ICM: update Z to maximize log-likelihood at each cell (gamma=0, so exp2(beta1))
function icmZ(Z, beta1, lik, testData) {
    const MRF_true = utils.exp2(beta1);
    const MRF_false = 1;
    for (let i = 0; i < testData.length; i++) {
        for (let j = 0; j < testData[i].length; j++) {
            if (utils.isMissing(testData[i][j])) continue;
            const ll = lik[i][j];
            Z[i][j] = (MRF_true * ll.true_ > MRF_false * ll.false_) ? 1 : 0;
        }
    }
}

// Maximize loglikelihood(beta1) over beta1 in [-2, 2]; desktop uses dlib find_max_box_constrained
function optimizeBeta1(Z, lik, testData, tol = 1e-7) {
    const gr = (Math.sqrt(5) - 1) / 2;
    let a = -2;
    let b = 2;
    let c = b - gr * (b - a);
    let d = a + gr * (b - a);
    let fc = loglikelihoodMRF(c, Z, lik, testData);
    let fd = loglikelihoodMRF(d, Z, lik, testData);
    while ((b - a) > tol) {
        if (fc > fd) {
            b = d;
            d = c;
            fd = fc;
            c = b - gr * (b - a);
            fc = loglikelihoodMRF(c, Z, lik, testData);
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + gr * (b - a);
            fd = loglikelihoodMRF(d, Z, lik, testData);
        }
    }
    return (a + b) / 2;
}

// Probability density function
function quantPDF(x, mu, sd) {
    if (utils.isMissing(x) || utils.isMissing(mu) || utils.isMissing(sd) || sd <= 0) {
        return NaN;
    }
    const tmp = Math.min(Math.pow((x - mu) / sd, 2) / 2, 32);
    return Math.pow(2, -tmp) / sd;
}

function quantPDFTrue(x, mu, sd) {
    return quantPDF(Math.min(x, mu), mu, sd);
}

function quantPDFFalse(x, mu, sd) {
    return quantPDF(Math.max(x, mu), mu, sd);
}

// Impute control values
function imputeCtrlProtOrPep(ctrlData, minVal) {
    const nRows = ctrlData.length;
    const nCols = ctrlData[0] ? ctrlData[0].length : 0;
    
    // Calculate rep min (minimum per column)
    const repMin = [];
    for (let j = 0; j < nCols; j++) {
        const colValues = [];
        for (let i = 0; i < nRows; i++) {
            if (!utils.isMissing(ctrlData[i][j])) {
                colValues.push(ctrlData[i][j]);
            }
        }
        repMin[j] = colValues.length > 0 ? utils.min(colValues) : NaN;
    }
    
    // Calculate overall min
    const allValues = [];
    for (let i = 0; i < nRows; i++) {
        for (let j = 0; j < nCols; j++) {
            if (!utils.isMissing(ctrlData[i][j])) {
                allValues.push(ctrlData[i][j]);
            }
        }
    }
    const protMin = allValues.length > 0 ? utils.min(allValues) : minVal;
    
    // Impute missing values
    for (let i = 0; i < nRows; i++) {
        for (let j = 0; j < nCols; j++) {
            if (utils.isMissing(ctrlData[i][j])) {
                if (!utils.isMissing(repMin[j])) {
                    ctrlData[i][j] = repMin[j] * 0.90;
                } else if (!utils.isMissing(protMin)) {
                    ctrlData[i][j] = protMin * 0.90;
                } else {
                    ctrlData[i][j] = minVal;
                }
            }
        }
    }
}

// Main SAINT analysis function
async function runSaintAnalysis(saintData, params, progressCallback) {
    progressCallback(5, 'Preparing data structures...');
    
    const { dataRows, colMap, ipColumns, colnamesRow } = saintData;
    const { inputLevel, proteinColname, compressNCtrl, compressNRep, normalizeControl } = params;
    
    // Find protein column index
    const proteinColIdx = colMap[proteinColname];
    if (proteinColIdx === undefined) {
        throw new Error(`Protein column '${proteinColname}' not found`);
    }
    
    // Separate test and control columns
    const testColIndices = [];
    const ctrlColIndices = [];
    ipColumns.forEach((ip, idx) => {
        if (ip.status === 'T') {
            testColIndices.push(idx);
        } else if (ip.status === 'C') {
            ctrlColIndices.push(idx);
        }
    });
    
    if (testColIndices.length === 0) {
        throw new Error('No test samples (T) found');
    }
    if (ctrlColIndices.length === 0) {
        throw new Error('No control samples (C) found');
    }
    
    progressCallback(10, 'Extracting intensity data...');
    
    // Extract intensity matrices
    const nRows = dataRows.length;
    const allIntensities = [];
    const testIntensities = [];
    const ctrlIntensities = [];
    
    // Build protein list and indexing
    const proteinList = [];
    const proteinToRows = {};
    
    for (let i = 0; i < nRows; i++) {
        const protein = dataRows[i][proteinColIdx] || '';
        if (!proteinToRows[protein]) {
            proteinToRows[protein] = [];
            proteinList.push(protein);
        }
        proteinToRows[protein].push(i);
    }
    
    // Extract intensities
    for (let i = 0; i < nRows; i++) {
        const row = [];
        const testRow = [];
        const ctrlRow = [];
        
        for (let j = 0; j < ipColumns.length; j++) {
            const colIdx = ipColumns[j].colIndex;
            const value = parseFloat(dataRows[i][colIdx]);
            const intensity = (isNaN(value) || value === 0) ? NaN : value;
            
            row.push(intensity);
            if (testColIndices.includes(j)) {
                testRow.push(intensity);
            }
            if (ctrlColIndices.includes(j)) {
                ctrlRow.push(intensity);
            }
        }
        
        allIntensities.push(row);
        testIntensities.push(testRow);
        ctrlIntensities.push(ctrlRow);
    }
    
    progressCallback(20, 'Processing control samples...');
    
    // Normalize controls if requested
    let ctrlData = ctrlIntensities.map(row => [...row]);
    if (normalizeControl) {
        const testMean = utils.mean(testIntensities.flat());
        const ctrlMean = utils.mean(ctrlData.flat());
        if (!utils.isMissing(testMean) && !utils.isMissing(ctrlMean) && ctrlMean !== 0) {
            const normConst = testMean / ctrlMean;
            ctrlData = ctrlData.map(row => row.map(val => utils.isMissing(val) ? val : val * normConst));
        }
    }
    
    // Impute control data
    const ctrlMin = utils.min(ctrlData.flat());
    const minVal = utils.isMissing(ctrlMin) ? 1 : ctrlMin;
    
    // Group by protein for imputation
    const ctrlByProtein = {};
    proteinList.forEach(protein => {
        const rowIndices = proteinToRows[protein];
        const proteinData = rowIndices.map(idx => ctrlData[idx]);
        ctrlByProtein[protein] = proteinData;
    });
    
    Object.values(ctrlByProtein).forEach(proteinData => {
        imputeCtrlProtOrPep(proteinData, minVal);
    });
    
    // Reconstruct ctrlData from grouped data
    proteinList.forEach((protein, protIdx) => {
        const rowIndices = proteinToRows[protein];
        const proteinData = ctrlByProtein[protein];
        rowIndices.forEach((rowIdx, i) => {
            ctrlData[rowIdx] = proteinData[i];
        });
    });
    
    progressCallback(30, 'Log2 transforming data...');
    
    // Log2 transform controls
    ctrlData = ctrlData.map(row => row.map(val => utils.isMissing(val) ? val : utils.log2(val)));
    
    // Calculate control statistics
    const ctrlMeans = [];
    const ctrlSDs = [];
    
    for (let i = 0; i < nRows; i++) {
        const row = ctrlData[i];
        const sorted = [...row].filter(x => !utils.isMissing(x)).sort((a, b) => b - a);
        const topN = Math.min(compressNCtrl, sorted.length);
        const topValues = sorted.slice(0, topN);
        
        if (topValues.length > 0) {
            ctrlMeans.push(utils.mean(topValues));
            const sd = utils.sd(topValues);
            ctrlSDs.push(utils.isMissing(sd) ? 0 : sd);
        } else {
            ctrlMeans.push(NaN);
            ctrlSDs.push(0);
        }
    }
    
    // Adjust small SDs
    const validSDs = ctrlSDs.filter(sd => !utils.isMissing(sd) && sd > 1e-10);
    if (validSDs.length > 0) {
        const medianSD = utils.median(validSDs);
        ctrlSDs.forEach((sd, idx) => {
            if (utils.isMissing(sd) || sd < medianSD) {
                ctrlSDs[idx] = medianSD;
            }
        });
    }
    
    progressCallback(40, 'Processing test samples...');
    
    // Process test data
    let testData = testIntensities.map(row => [...row]);
    
    // Log2 transform test
    testData = testData.map(row => row.map(val => utils.isMissing(val) ? val : utils.log2(val)));
    
    // Calculate test statistics
    const testMeans = [];
    const testSDs = [];
    
    for (let i = 0; i < nRows; i++) {
        const row = testData[i];
        const valid = row.filter(x => !utils.isMissing(x));
        
        if (valid.length >= 1) {
            testMeans.push(utils.mean(valid));
            const sd = valid.length >= 2 ? utils.sd(valid) : 0;
            testSDs.push(utils.isMissing(sd) ? 0 : sd);
        } else {
            testMeans.push(NaN);
            testSDs.push(0);
        }
    }
    
    // Adjust small test SDs
    const validTestSDs = testSDs.filter(sd => !utils.isMissing(sd) && sd > 0);
    if (validTestSDs.length > 0) {
        const medianTestSD = utils.median(validTestSDs);
        testSDs.forEach((sd, idx) => {
            if (utils.isMissing(sd) || sd < medianTestSD) {
                testSDs[idx] = medianTestSD;
            }
        });
    }
    
    // Calculate mu_d (difference between means)
    const muD = [];
    for (let i = 0; i < nRows; i++) {
        if (utils.isMissing(testMeans[i])) {
            muD.push(utils.log2(4));
        } else {
            const diff = testMeans[i] - ctrlMeans[i];
            muD.push(Math.max(diff, utils.log2(4)));
        }
    }
    
    progressCallback(50, 'Building bait-prey groups...');
    
    // Group test data by bait
    const baitGroups = {};
    testColIndices.forEach((colIdx, idx) => {
        const bait = ipColumns[colIdx].bait;
        if (!baitGroups[bait]) {
            baitGroups[bait] = [];
        }
        baitGroups[bait].push(idx);
    });
    
    const baitList = Object.keys(baitGroups);
    
    progressCallback(55, 'Building likelihood matrix...');
    const lik = getQuantPDFs(testData, ctrlMeans, ctrlSDs, muD, testSDs);
    
    progressCallback(60, 'MRF optimization (ICM + beta1)...');
    const nRowsTest = testData.length;
    const nColsTest = testData[0] ? testData[0].length : 0;
    const Z = Array(nRowsTest).fill(null).map(() => Array(nColsTest).fill(0));
    let beta1 = 0;
    let oldllik = loglikelihoodMRF(beta1, Z, lik, testData);
    const maxIter = 10000;
    const convTol = 0.01;
    for (let iter = 0; iter < maxIter; iter++) {
        icmZ(Z, beta1, lik, testData);
        beta1 = optimizeBeta1(Z, lik, testData);
        const newllik = loglikelihoodMRF(beta1, Z, lik, testData);
        if (newllik >= oldllik && Math.abs(newllik - oldllik) < convTol) break;
        oldllik = newllik;
    }
    const MRF_true_final = Math.exp(beta1);
    const MRF_false_final = 1;
    
    progressCallback(70, 'Calculating scores (with optimized MRF)...');
    
    const scores = [];
    const allScoresForBFDR = [];
    
    for (let baitIdx = 0; baitIdx < baitList.length; baitIdx++) {
        const bait = baitList[baitIdx];
        const baitColIndices = baitGroups[bait];
        
        for (let preyIdx = 0; preyIdx < proteinList.length; preyIdx++) {
            const protein = proteinList[preyIdx];
            const proteinRowIndices = proteinToRows[protein];
            
            // Get test data for this bait-prey combination
            const baitPreyData = [];
            proteinRowIndices.forEach(rowIdx => {
                const row = [];
                baitColIndices.forEach(colIdx => {
                    row.push(testData[rowIdx][colIdx]);
                });
                baitPreyData.push(row);
            });
            
            // Check if there's any data
            const hasData = baitPreyData.some(row => row.some(val => !utils.isMissing(val)));
            if (!hasData) continue;
            
            // Calculate scores for each replicate
            const repScores = [];
            
            for (let repIdx = 0; repIdx < baitColIndices.length; repIdx++) {
                const repScoresForPrey = [];
                
                for (let protRowIdx = 0; protRowIdx < proteinRowIndices.length; protRowIdx++) {
                    const rowIdx = proteinRowIndices[protRowIdx];
                    const testVal = testData[rowIdx][baitColIndices[repIdx]];
                    
                    if (utils.isMissing(testVal)) continue;
                    
                    const muF = ctrlMeans[rowIdx];
                    const muT = muF + muD[rowIdx];
                    const sdF = ctrlSDs[rowIdx];
                    const sdT = testSDs[rowIdx];
                    
                    const pdfFalse = quantPDFFalse(testVal, muF, sdF);
                    const pdfTrue = quantPDFTrue(testVal, muT, sdT);
                    
                    const unnormScoreFalse = MRF_false_final * pdfFalse;
                    const unnormScoreTrue = MRF_true_final * pdfTrue;
                    const score = unnormScoreTrue / (unnormScoreTrue + unnormScoreFalse);
                    
                    repScoresForPrey.push(score);
                }
                
                // One score per replicate; use 0 when all missing (to match desktop SAINTq mean_of_top_n)
                const avgScore = repScoresForPrey.length > 0 ? utils.mean(repScoresForPrey) : 0;
                repScores.push(avgScore);
            }
            
            if (repScores.length > 0) {
                const rawScore = utils.meanOfTopNSaintq(repScores, compressNRep);
                const avgP = Math.round(rawScore * 10000) / 10000; // match desktop 4-decimal rounding
                scores.push({
                    bait: bait,
                    prey: protein,
                    nRep: repScores.length,
                    avgP: avgP
                });
                allScoresForBFDR.push(avgP);
            }
        }
    }
    
    progressCallback(80, 'Calculating BFDR...');
    
    // Calculate BFDR
    const bfdrValues = calculateBFDR(allScoresForBFDR);
    scores.forEach((score, idx) => {
        score.bfdr = bfdrValues[idx];
    });
    
    progressCallback(90, 'Finalizing results...');
    
    return {
        scores: scores,
        baitList: baitList,
        preyList: proteinList
    };
}
