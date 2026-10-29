#!/usr/bin/env node
/**
 * Open a Nebula report HTML in a real (headless) Chromium and verify its layout.
 *
 * No npm dependencies: it speaks the Chrome DevTools Protocol directly over the
 * WebSocket built into Node 22+ (global fetch/WebSocket), driving the Chrome that
 * is already installed on the machine.
 *
 * Why a browser at all: a saved report is a self-contained page whose figures are
 * mounted by an inline boot script (Plotly from the CDN, `__NR_PLOT_MNT__`), and
 * whose sections are tabs - only the active section has a layout at all. Whether a
 * figure fits its container can only be measured after rendering and activating it.
 *
 * Usage:
 *   node scripts/report_browser_check.mjs <report.html> [options]
 *
 * Options:
 *   --width=N        viewport width; repeatable (default 1440)
 *   --height=N       viewport height (default 900)
 *   --out=DIR        screenshot directory (default: <system temp>/nebula-report-check)
 *   --chrome=PATH    Chrome/Chromium executable (default: auto-detect)
 *   --wait=MS        max wait for each figure to mount (default 20000)
 *   --offline        emulate no network (proves the report does not need the CDN)
 *   --json           print only the JSON summary
 *
 * Checks, per section, with that section's tab active:
 *   - figure/host width does not exceed the section width (no spill past the card)
 *   - the page has no horizontal overflow (documentElement.scrollWidth <= innerWidth)
 *   - every Plotly section actually mounted (.main-svg present); SVG sections have an <svg>
 *   - fill sections (heatmap, row profile, per-column summary) fill the panel height
 *
 * Exit code: 0 = all checks pass, 1 = a check failed, 2 = could not run.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/* ------------------------------------------------------------------ args */
function parseArgs(argv) {
    const opts = { file: null, widths: [], height: 900, out: join(tmpdir(), 'nebula-report-check'), chrome: null, wait: 20000, json: false, offline: false };
    for (const a of argv) {
        if (a.startsWith('--width=')) opts.widths.push(Number(a.slice(8)));
        else if (a.startsWith('--height=')) opts.height = Number(a.slice(9));
        else if (a.startsWith('--out=')) opts.out = a.slice(6);
        else if (a.startsWith('--chrome=')) opts.chrome = a.slice(9);
        else if (a.startsWith('--wait=')) opts.wait = Number(a.slice(7));
        else if (a === '--offline') opts.offline = true;
        else if (a === '--json') opts.json = true;
        else if (a === '--help' || a === '-h') opts.help = true;
        else if (!a.startsWith('--')) opts.file = a;
    }
    if (!opts.widths.length) opts.widths = [1440];
    return opts;
}

function findChrome(explicit) {
    const candidates = [
        explicit,
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : null,
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);
    return candidates.find(p => existsSync(p)) || null;
}

/* --------------------------------------------------------- CDP plumbing */
class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.addEventListener('message', ev => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve: res, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message));
                else res(msg.result);
            } else if (msg.method) {
                for (const fn of this.listeners) fn(msg);
            }
        });
    }

    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('CDP socket failed: ' + url)), { once: true });
        });
        return new Cdp(ws);
    }

    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((res, rej) => {
            this.pending.set(id, { resolve: res, reject: rej });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    on(fn) { this.listeners.push(fn); }
    close() { try { this.ws.close(); } catch { /* already closed */ } }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForPort(portFile, timeoutMs) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (existsSync(portFile)) {
            const txt = readFileSync(portFile, 'utf8').trim();
            if (txt) return txt.split(/\r?\n/)[0].trim();
        }
        await sleep(150);
    }
    return null;
}

function killTree(pid) {
    /* Await the kill: exiting the Node process immediately after spawning taskkill
     * would kill taskkill itself and leave the browser behind. */
    return new Promise(resolve => {
        try {
            const p = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
            p.on('exit', resolve);
            p.on('error', resolve);
            setTimeout(resolve, 3000);
        } catch { resolve(); }
    });
}

/* ------------------------------------------------------------- measurement */
/* Runs with a section's tab active; returns that section's geometry. */
const MEASURE_SECTION = `(index) => {
    const s = document.querySelectorAll('.nr-section')[index];
    if (!s) return null;
    const fig = s.querySelector('figure');
    const plotHost = s.querySelector('.nebula-report-plotly-host');
    const svgHost = s.querySelector('.nebula-report-svg-host, .nebula-report-pca3d-host');
    const titleEl = s.querySelector('.nr-section-title');
    const box = fig ? fig.getBoundingClientRect() : null;
    const hostBox = plotHost ? plotHost.getBoundingClientRect() : (svgHost ? svgHost.getBoundingClientRect() : null);
    const width = Math.max(box ? box.width : 0, hostBox ? hostBox.width : 0);
    const de = document.documentElement;
    return {
        index,
        id: s.id,
        title: (titleEl ? titleEl.textContent : '').replace(/^\\s*\\d+\\s*/, '').trim(),
        fill: s.classList.contains('nr-section--fill'),
        visible: !!(s.offsetParent || s.getClientRects().length),
        sectionWidth: Math.round(s.clientWidth * 10) / 10,
        sectionHeight: Math.round(s.getBoundingClientRect().height),
        figureWidth: Math.round(width * 10) / 10,
        overflow: Math.round((width - s.clientWidth) * 10) / 10,
        hasFigure: !!fig,
        plotlyHosts: s.querySelectorAll('.nebula-report-plotly-host').length,
        plotlySvgs: s.querySelectorAll('.main-svg').length,
        svgChild: svgHost ? svgHost.querySelectorAll('svg').length : 0,
        pageOverflow: de.scrollWidth - window.innerWidth
    };
}`;

async function evaluate(cdp, expression) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate failed');
    return result.value;
}

/* ------------------------------------------------------------------- main */
async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help || !opts.file) {
        const header = readFileSync(new URL(import.meta.url), 'utf8').split('*/\n')[0];
        console.log(header.replace(/^#!.*\n/, '').replace(/^\/\*\*?/, ''));
        process.exit(opts.help ? 0 : 2);
    }
    const isUrl = /^https?:\/\//i.test(opts.file);
    const file = isUrl ? opts.file : resolve(opts.file);
    if (!isUrl && !existsSync(file)) { console.error('No such file: ' + file); process.exit(2); }
    const targetUrl = isUrl ? file : pathToFileURL(file).href;
    const chrome = findChrome(opts.chrome);
    if (!chrome) { console.error('No Chrome/Chromium found; pass --chrome=PATH or set CHROME_PATH.'); process.exit(2); }

    mkdirSync(opts.out, { recursive: true });
    const report = { file, chrome, runs: [], failures: [] };

    for (const width of opts.widths) {
        const profile = mkdtempSync(join(tmpdir(), 'nebula-cdp-'));
        const proc = spawn(chrome, [
            '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
            '--disable-breakpad', '--disable-crash-reporter', '--allow-file-access-from-files',
            '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
        ], { stdio: 'ignore', windowsHide: true });

        const port = await waitForPort(join(profile, 'DevToolsActivePort'), 20000);
        if (!port) { await killTree(proc.pid); console.error('Chrome did not expose a CDP port.'); process.exit(2); }

        let cdp = null;
        const run = { viewport: width + 'x' + opts.height, offline: opts.offline, screenshots: [], sections: [], consoleErrors: [] };
        try {
            const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
            const pageTarget = targets.find(t => t.type === 'page');
            cdp = await Cdp.connect(pageTarget.webSocketDebuggerUrl);

            cdp.on(msg => {
                if (msg.method === 'Runtime.exceptionThrown') {
                    run.consoleErrors.push(String(msg.params?.exceptionDetails?.exception?.description || 'exception'));
                } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
                    run.consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
                }
            });

            await cdp.send('Page.enable');
            await cdp.send('Runtime.enable');
            if (opts.offline) {
                await cdp.send('Network.enable');
                await cdp.send('Network.emulateNetworkConditions', {
                    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
                });
            }
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: opts.height, deviceScaleFactor: 1, mobile: false });
            await cdp.send('Page.navigate', { url: targetUrl });
            await new Promise(res => {
                cdp.on(m => { if (m.method === 'Page.loadEventFired') res(); });
                setTimeout(res, 15000);
            });

            /* Wait for the boot script to declare Plotly (from the CDN) and the tab UI. */
            const deadline = Date.now() + opts.wait;
            let tabCount = 0;
            while (Date.now() < deadline) {
                tabCount = await evaluate(cdp, `document.querySelectorAll('.nr-toc-list a[data-nr-tab]').length`);
                if (tabCount > 0) break;
                await sleep(250);
            }
            run.plotlyLoaded = await evaluate(cdp, `typeof window.Plotly !== 'undefined'`);
            run.navLinks = tabCount;

            for (let i = 0; i < tabCount; i++) {
                /* Sections are tabs: only the active one has a layout, so activate
                 * each one and measure it while visible (figures mount lazily). */
                await evaluate(cdp, `document.querySelectorAll('.nr-toc-list a[data-nr-tab]')[${i}].click()`);
                const sectionDeadline = Date.now() + opts.wait;
                let measured = null;
                while (Date.now() < sectionDeadline) {
                    measured = await evaluate(cdp, `(${MEASURE_SECTION})(${i})`);
                    if (!measured) break;
                    const mounted = measured.plotlyHosts === 0 || measured.plotlySvgs > 0;
                    if (measured.visible && mounted) break;
                    await sleep(300);
                }
                await sleep(600); /* let Plotly's post-mount resize settle */
                measured = await evaluate(cdp, `(${MEASURE_SECTION})(${i})`);
                if (measured) {
                    run.sections.push(measured);
                    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
                    const png = join(opts.out, 'report_' + width + 'x' + opts.height + '_sec' + (i + 1) + '.png');
                    writeFileSync(png, Buffer.from(shot.data, 'base64'));
                    run.screenshots.push(png);
                }
            }
            run.pageOverflow = run.sections.length ? run.sections[run.sections.length - 1].pageOverflow : 0;
        } finally {
            try { if (cdp) { await cdp.send('Browser.close'); cdp.close(); } } catch { /* closing */ }
            await sleep(300);
            await killTree(proc.pid);
            await sleep(200);
            try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir */ }
        }

        /* ---------------------------------------------------------- verdicts */
        if (run.pageOverflow > 1.5) {
            report.failures.push(run.viewport + ': page overflows horizontally by ' + run.pageOverflow + 'px');
        }
        for (const s of run.sections) {
            if (!s.visible) { report.failures.push(run.viewport + ': "' + s.title + '" never became visible'); continue; }
            if (s.overflow > 1.5) {
                report.failures.push(run.viewport + ': "' + s.title + '" spills ' + s.overflow + 'px past its section (' + s.figureWidth + ' > ' + s.sectionWidth + ')');
            }
            if (s.plotlyHosts > 0 && s.plotlySvgs === 0) {
                report.failures.push(run.viewport + ': "' + s.title + '" has no mounted Plotly figure');
            }
            if (s.fill && s.sectionHeight < opts.height * 0.6) {
                report.failures.push(run.viewport + ': fill section "' + s.title + '" is only ' + s.sectionHeight + 'px tall');
            }
        }
        for (const e of run.consoleErrors.slice(0, 5)) {
            report.failures.push(run.viewport + ': console error: ' + e.slice(0, 160));
        }
        report.runs.push(run);
    }

    if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        for (const run of report.runs) {
            console.log('\n=== ' + run.viewport + ' ===');
            console.log('  Plotly loaded: ' + run.plotlyLoaded + '   network: ' + (run.offline ? 'offline' : 'online') + '   page horizontal overflow: ' + run.pageOverflow + 'px   tabs: ' + run.navLinks);
            for (const s of run.sections) {
                const label = (s.title || s.id || '?').slice(0, 46).padEnd(46);
                console.log('  ' + String(s.index + 1).padStart(2) + '. ' + label +
                    ' section=' + String(s.sectionWidth).padStart(6) +
                    ' figure=' + String(s.figureWidth).padStart(6) +
                    ' overflow=' + String(s.overflow).padStart(6) +
                    ' svg=' + s.plotlySvgs +
                    (s.fill ? '  [fill ' + s.sectionHeight + 'px]' : ''));
            }
            for (const p of run.screenshots) console.log('  screenshot: ' + p);
        }
        console.log('\n' + (report.failures.length ? 'FAILURES:\n  - ' + report.failures.join('\n  - ') : 'All checks passed.'));
    }
    process.exit(report.failures.length ? 1 : 0);
}

main().catch(err => {
    console.error('browser check failed: ' + (err && err.stack ? err.stack : err));
    process.exit(2);
});
