// Hierarchical clustering worker source.
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._clusteringWorkerSrc and creates a Blob Worker from it.
window._clusteringWorkerSrc = `
// Optimized distance calculation
function calculateDistance(vec1, vec2, metric) {
    const len = vec1.length;
    if (metric === 'euclidean') {
        let sum = 0;
        for (let i = 0; i < len; i++) {
            const diff = vec1[i] - vec2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    } else if (metric === 'manhattan') {
        let sum = 0;
        for (let i = 0; i < len; i++) {
            sum += Math.abs(vec1[i] - vec2[i]);
        }
        return sum;
    } else if (metric === 'correlation') {
        let mean1 = 0, mean2 = 0;
        for (let i = 0; i < len; i++) {
            mean1 += vec1[i];
            mean2 += vec2[i];
        }
        mean1 /= len;
        mean2 /= len;
        let numerator = 0, sumSq1 = 0, sumSq2 = 0;
        for (let i = 0; i < len; i++) {
            const diff1 = vec1[i] - mean1;
            const diff2 = vec2[i] - mean2;
            numerator += diff1 * diff2;
            sumSq1 += diff1 * diff1;
            sumSq2 += diff2 * diff2;
        }
        const denominator = Math.sqrt(sumSq1 * sumSq2);
        if (denominator === 0) return 1;
        return 1 - (numerator / denominator);
    }
    return 0;
}

// Distance matrix: upper triangle in Float32Array
function calculateDistanceMatrix(data, metric) {
    const n = data.length;
    const size = (n * (n - 1)) >> 1;
    const dist = new Float32Array(size);
    const reportInterval = Math.max(1, Math.floor(n / 25));
    for (let i = 0; i < n; i++) {
        if (i > 0 && i % reportInterval === 0) {
            self.postMessage({ type: 'progress', progress: Math.floor((i / n) * 50), message: 'Computing distance matrix...' });
        }
        for (let j = i + 1; j < n; j++) {
            const d = calculateDistance(data[i], data[j], metric);
            const pos = i * n + j - ((i + 1) * (i + 2)) / 2;
            dist[pos] = d;
        }
    }
    return { n, dist };
}
function getDist(dm, i, j) {
    if (i === j) return 0;
    if (i > j) { const t = i; i = j; j = t; }
    return dm.dist[i * dm.n + j - ((i + 1) * (i + 2)) / 2];
}

// Lance-Williams update
function lwDistance(d_ik, d_jk, linkage, ni, nj, nk) {
    if (linkage === 'single') return Math.min(d_ik, d_jk);
    if (linkage === 'complete') return Math.max(d_ik, d_jk);
    return (ni * d_ik + nj * d_jk) / (ni + nj);
}

// Optimized hierarchical clustering (O(n^2) merge phase)
function hierarchicalClustering(data, labels, metric, linkage) {
    const n = data.length;
    if (n <= 1) return { order: [0], dendrogram: null };
    const MAX_CLUSTER_SIZE = 2000;
    if (n > MAX_CLUSTER_SIZE) {
        const step = Math.ceil(n / MAX_CLUSTER_SIZE);
        const sampledIndices = [];
        for (let i = 0; i < n; i += step) sampledIndices.push(i);
        const sampledData = sampledIndices.map(idx => data[idx]);
        const sampledLabels = sampledIndices.map(idx => labels[idx]);
        const cluster = hierarchicalClustering(sampledData, sampledLabels, metric, linkage);
        const order = [];
        const used = new Set(cluster.order.map(idx => sampledIndices[idx]));
        cluster.order.forEach(idx => order.push(sampledIndices[idx]));
        for (let i = 0; i < n; i++) if (!used.has(i)) order.push(i);
        return { order, dendrogram: cluster.dendrogram };
    }
    self.postMessage({ type: 'progress', progress: 5, message: 'Computing distances...' });
    const pointDist = calculateDistanceMatrix(data, metric);
    let K = n;
    let cdist = [];
    let sizes = [];
    for (let i = 0; i < n; i++) {
        sizes[i] = 1;
        cdist[i] = new Float32Array(n);
        cdist[i][i] = 0;
    }
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const d = getDist(pointDist, i, j);
            cdist[i][j] = d;
            cdist[j][i] = d;
        }
    }
    const nodes = [];
    for (let i = 0; i < n; i++) {
        nodes[i] = { index: i, height: 0, left: null, right: null, label: labels[i] };
    }
    let nextNodeIndex = n;
    const totalSteps = n - 1;
    let stepCount = 0;
    while (K > 1) {
        if (stepCount % 5 === 0 || stepCount === totalSteps - 1) {
            self.postMessage({ type: 'progress', progress: 50 + Math.floor((stepCount / totalSteps) * 45), message: 'Clustering...' });
        }
        let minDist = Infinity, mergeI = 0, mergeJ = 1;
        for (let i = 0; i < K; i++) {
            for (let j = i + 1; j < K; j++) {
                const d = cdist[i][j];
                if (d < minDist) { minDist = d; mergeI = i; mergeJ = j; }
            }
        }
        const ni = sizes[mergeI], nj = sizes[mergeJ];
        const newNode = { index: nextNodeIndex++, height: minDist, left: nodes[mergeI], right: nodes[mergeJ], label: null };
        const newSize = ni + nj;
        const oldIndices = [];
        for (let k = 0; k < K; k++) {
            if (k !== mergeI && k !== mergeJ) oldIndices.push(k);
        }
        const K1 = K - 1;
        const newCdist = [];
        const newSizes = [newSize];
        const newNodes = [newNode];
        for (let i = 0; i < K1; i++) {
            newCdist[i] = new Float32Array(K1);
            newCdist[i][i] = 0;
            if (i > 0) { newSizes.push(sizes[oldIndices[i - 1]]); newNodes.push(nodes[oldIndices[i - 1]]); }
        }
        for (let i = 0; i < K1; i++) {
            const oi = i === 0 ? -1 : oldIndices[i - 1];
            for (let j = i + 1; j < K1; j++) {
                const oj = oldIndices[j - 1];
                let val;
                if (i === 0) {
                    val = lwDistance(cdist[mergeI][oj], cdist[mergeJ][oj], linkage, ni, nj, sizes[oj]);
                } else {
                    val = cdist[oi][oj];
                }
                newCdist[i][j] = val;
                newCdist[j][i] = val;
            }
        }
        cdist = newCdist;
        sizes = newSizes;
        nodes.length = 0;
        nodes.push(...newNodes);
        K = K1;
        stepCount++;
    }
    function extractOrder(node, order) {
        if (node.left === null && node.right === null) order.push(node.index);
        else {
            if (node.left) extractOrder(node.left, order);
            if (node.right) extractOrder(node.right, order);
        }
    }
    const order = [];
    extractOrder(nodes[0], order);
    return { order, dendrogram: nodes[0] };
}

self.onmessage = function (e) {
    const { data, type, requestId } = e.data || {};
    try {
        if (type === 'cluster' && data) {
            const result = hierarchicalClustering(data.data, data.labels, data.metric, data.linkage);
            self.postMessage({ type: 'result', success: true, result: result, requestId: requestId });
        }
    } catch (error) {
        self.postMessage({ type: 'result', success: false, error: error?.message || String(error) || 'Unknown clustering error', requestId: requestId });
    }
};
`;
