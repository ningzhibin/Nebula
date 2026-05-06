// PCA worker source.
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._pcaWorkerSrc and creates a Blob Worker from it.
window._pcaWorkerSrc = `
// Optimized PCA using typed arrays and power iteration (no ml-matrix dependency)
function performPCATypedArrays(data, numComponentsParam, fastModeParam) {
    const n = data.length;
    const m = data[0].length;
    if (n < 2 || m < 2) throw new Error('PCA requires at least 2 samples and 2 features');

    const dataArray = new Float64Array(n * m);
    for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++)
            dataArray[i * m + j] = data[i][j];

    const means = new Float64Array(m);
    for (let j = 0; j < m; j++) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += dataArray[i * m + j];
        means[j] = sum / n;
    }

    const centered = new Float64Array(n * m);
    for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++)
            centered[i * m + j] = dataArray[i * m + j] - means[j];

    const numComponents = numComponentsParam ? Math.min(m, n, numComponentsParam) : Math.min(m, n, 10);
    const maxIterations = (fastModeParam || false) ? 20 : 50;
    const eigenvectors = [];
    const eigenvalues = [];

    for (let comp = 0; comp < numComponents; comp++) {
        const compProgress = 30 + Math.floor((comp / numComponents) * 60);
        self.postMessage({ type: 'progress', progress: compProgress, message: 'Computing PC' + (comp + 1) + ' of ' + numComponents + '...' });

        const vector = new Float64Array(m);
        vector[comp] = 1.0;

        for (let iter = 0; iter < maxIterations; iter++) {
            if (iter % 10 === 0 && (m > 1000 || n > 1000)) {
                const iterProgress = compProgress + Math.floor((iter / maxIterations) * (60 / numComponents));
                self.postMessage({ type: 'progress', progress: Math.min(iterProgress, compProgress + Math.floor(60 / numComponents)), message: 'Computing PC' + (comp + 1) + ' (iteration ' + (iter + 1) + '/' + maxIterations + ')...' });
            }
            const newVector = new Float64Array(m);
            const xvArray = new Float64Array(n);
            for (let k = 0; k < n; k++) {
                let xv = 0;
                const baseIdx = k * m;
                for (let j = 0; j < m; j++) xv += centered[baseIdx + j] * vector[j];
                xvArray[k] = xv;
            }
            for (let i = 0; i < m; i++) {
                let sum = 0;
                for (let k = 0; k < n; k++) sum += centered[k * m + i] * xvArray[k];
                newVector[i] = sum / (n - 1);
            }
            for (let prev = 0; prev < comp; prev++) {
                let dot = 0;
                for (let i = 0; i < m; i++) dot += newVector[i] * eigenvectors[prev][i];
                for (let i = 0; i < m; i++) newVector[i] -= dot * eigenvectors[prev][i];
            }
            let norm = 0;
            for (let i = 0; i < m; i++) norm += newVector[i] * newVector[i];
            norm = Math.sqrt(norm);
            if (norm < 1e-10) break;
            for (let i = 0; i < m; i++) vector[i] = newVector[i] / norm;
        }

        let eigenvalue = 0;
        for (let k = 0; k < n; k++) {
            let xv = 0;
            for (let j = 0; j < m; j++) xv += centered[k * m + j] * vector[j];
            eigenvalue += xv * xv;
        }
        eigenvalue /= (n - 1);
        eigenvalues.push(eigenvalue);
        eigenvectors.push(Array.from(vector));
    }

    self.postMessage({ type: 'progress', progress: 90, message: 'Projecting data...' });
    const projections = [];
    for (let i = 0; i < n; i++) {
        const proj = [];
        for (let comp = 0; comp < eigenvectors.length; comp++) {
            let sum = 0;
            for (let j = 0; j < m; j++) sum += centered[i * m + j] * eigenvectors[comp][j];
            proj.push(sum);
        }
        projections.push(proj);
    }

    const totalVariance = eigenvalues.reduce((a, b) => a + b, 0);
    return {
        projections,
        explainedVariance: eigenvalues.map(e => e / totalVariance),
        eigenvectors,
        eigenvalues
    };
}

self.onmessage = function (e) {
    const { data, type, numComponents, fastMode } = e.data;
    try {
        if (type === 'pca') {
            const result = performPCATypedArrays(data, numComponents, fastMode);
            self.postMessage({ type: 'result', success: true, result });
        }
    } catch (error) {
        self.postMessage({ type: 'result', success: false, error: error.message });
    }
};
`;
