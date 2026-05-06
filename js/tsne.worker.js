// t-SNE worker source.
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._tsneWorkerSrc and creates a Blob Worker from it.
window._tsneWorkerSrc = `
function sqDist(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return s;
}
function findSigma(D_row, i, perplexity) {
    const n = D_row.length;
    const target = Math.log(perplexity);
    let lo = 1e-10, hi = 1e4;
    for (let step = 0; step < 50; step++) {
        const sigma = (lo + hi) / 2;
        const p = new Array(n);
        let sum = 0;
        for (let j = 0; j < n; j++) { p[j] = Math.exp(-D_row[j] / (2 * sigma * sigma)); sum += p[j]; }
        if (sum > 0) for (let j = 0; j < n; j++) p[j] /= sum;
        p[i] = 0;
        let H = 0;
        for (let j = 0; j < n; j++) if (p[j] > 1e-20) H -= p[j] * Math.log(p[j]);
        if (Math.abs(H - target) < 0.001) return { sigma, p };
        if (H < target) lo = sigma; else hi = sigma;
    }
    const sigma = (lo + hi) / 2;
    const p = new Array(n);
    let sum = 0;
    for (let j = 0; j < n; j++) { p[j] = Math.exp(-D_row[j] / (2 * sigma * sigma)); sum += p[j]; }
    if (sum > 0) for (let j = 0; j < n; j++) p[j] /= sum;
    p[i] = 0;
    return { sigma, p };
}
/** Center 2D embedding and scale each axis by its SD so axis values are ~O(1) for display (structure preserved up to affine per-axis scale). */
function normalizeEmbedding2DForDisplay(Y, n) {
    if (n < 1) return;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) {
        mx += Y[i][0];
        my += Y[i][1];
    }
    mx /= n;
    my /= n;
    for (let i = 0; i < n; i++) {
        Y[i][0] -= mx;
        Y[i][1] -= my;
    }
    if (n < 2) return;
    let vx = 0, vy = 0;
    for (let i = 0; i < n; i++) {
        vx += Y[i][0] * Y[i][0];
        vy += Y[i][1] * Y[i][1];
    }
    vx = Math.sqrt(vx / n);
    vy = Math.sqrt(vy / n);
    const sx = vx > 1e-15 ? vx : 1;
    const sy = vy > 1e-15 ? vy : 1;
    for (let i = 0; i < n; i++) {
        Y[i][0] /= sx;
        Y[i][1] /= sy;
    }
}
self.onmessage = function (e) {
    const { data, perplexity, maxIter } = e.data;
    const n = data.length, d = data[0].length;
    const D = [];
    for (let i = 0; i < n; i++) {
        D[i] = new Array(n);
        for (let j = 0; j < n; j++) D[i][j] = i === j ? 0 : sqDist(data[i], data[j]);
    }
    const P = [];
    for (let i = 0; i < n; i++) {
        const { p } = findSigma(D[i], i, Math.min(perplexity, n - 1));
        P[i] = p;
    }
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            P[i][j] = (P[i][j] + P[j][i]) / (2 * n);
    for (let i = 0; i < n; i++) P[i][i] = 0;
    let Y = [];
    for (let i = 0; i < n; i++) Y[i] = [0.0001 * (Math.random() - 0.5), 0.0001 * (Math.random() - 0.5)];
    const lr = 200, earlyExag = 250;
    for (let iter = 0; iter < maxIter; iter++) {
        const exag = iter < earlyExag ? 4 : 1;
        let Z = 0;
        const Q = [];
        for (let i = 0; i < n; i++) {
            Q[i] = new Array(n);
            for (let j = 0; j < n; j++) {
                if (i === j) { Q[i][j] = 0; continue; }
                const dy = Y[i][0] - Y[j][0], dx = Y[i][1] - Y[j][1];
                Q[i][j] = 1 / (1 + dy * dy + dx * dx);
                Z += Q[i][j];
            }
        }
        Z = Math.max(Z, 1e-12);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Q[i][j] /= Z;
        const grad = [];
        for (let i = 0; i < n; i++) grad[i] = [0, 0];
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const pq = exag * P[i][j] - Q[i][j];
                const dy = Y[i][0] - Y[j][0], dx = Y[i][1] - Y[j][1];
                const factor = 4 * pq * Q[i][j];
                grad[i][0] += factor * dy;
                grad[i][1] += factor * dx;
            }
        }
        for (let i = 0; i < n; i++) { Y[i][0] -= lr * grad[i][0]; Y[i][1] -= lr * grad[i][1]; }
        if (iter % 100 === 0) self.postMessage({ type: 'progress', iter, maxIter });
    }
    normalizeEmbedding2DForDisplay(Y, n);
    self.postMessage({ type: 'result', success: true, embeddings: Y });
};
`;
