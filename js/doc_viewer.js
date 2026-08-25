/**
 * Nebula Document tab: load doc/manifest.json, build outline, fetch Markdown, render with marked + DOMPurify.
 * Expects globals: marked, DOMPurify (loaded before this script in index.html).
 */
(function () {
    var DOC_BASE = 'doc/';
    var manifest = null;
    var manifestPromise = null;
    var outlineBuilt = false;
    var htmlCache = new Map();
    var docTextCache = new Map();

    function docBaseUrl() {
        try {
            return new URL(DOC_BASE, window.location.href).href;
        } catch (e) {
            return DOC_BASE;
        }
    }

    function getManifest() {
        if (manifest) return Promise.resolve(manifest);
        var bundled = window.NEBULA_DOC_MANIFEST;
        if (Array.isArray(bundled) && bundled.length) {
            manifest = { sections: bundled };
            return Promise.resolve(manifest);
        }
        if (bundled && Array.isArray(bundled.sections) && bundled.sections.length) {
            manifest = { sections: bundled.sections };
            return Promise.resolve(manifest);
        }
        if (!manifestPromise) {
            manifestPromise = fetch(new URL('manifest.json', docBaseUrl()))
                .then(function (r) {
                    if (!r.ok) throw new Error('manifest.json HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    var sections = Array.isArray(data.sections) ? data.sections : data;
                    if (!Array.isArray(sections) || !sections.length) {
                        throw new Error('manifest has no sections');
                    }
                    manifest = { sections: sections };
                    return manifest;
                });
        }
        return manifestPromise;
    }

    function ensureLibs() {
        var hasMarked = typeof marked !== 'undefined' && (
            typeof marked.parse === 'function' || typeof marked === 'function'
        );
        if (!hasMarked) {
            throw new Error('Markdown renderer (marked) is not loaded.');
        }
        if (typeof DOMPurify === 'undefined' || typeof DOMPurify.sanitize !== 'function') {
            throw new Error('DOMPurify is not loaded.');
        }
    }

    function parseMarkdown(mdText) {
        if (typeof marked.parse === 'function') {
            return marked.parse(mdText, { headerIds: true });
        }
        if (typeof marked === 'function') {
            return marked(mdText);
        }
        throw new Error('marked API not recognized.');
    }

    function renderMdToSafeHtml(mdText) {
        ensureLibs();
        var raw = parseMarkdown(mdText);
        return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    }

    function buildOutline(sections) {
        var outline = document.getElementById('docOutline');
        if (!outline) return;
        outline.innerHTML = '';
        var currentGroup = null;
        sections.forEach(function (entry) {
            var g = entry.group || '';
            if (g !== currentGroup) {
                currentGroup = g;
                if (g) {
                    var h = document.createElement('div');
                    h.className = 'doc-outline-group';
                    h.textContent = g;
                    outline.appendChild(h);
                }
            }
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'doc-outline-btn' + (g ? ' doc-outline-btn--grouped' : '');
            btn.setAttribute('data-doc', entry.id);
            btn.textContent = entry.title || entry.id;
            btn.addEventListener('click', function () {
                if (typeof window.switchDocumentSection === 'function') {
                    window.switchDocumentSection(entry.id);
                }
            });
            outline.appendChild(btn);
        });
        outlineBuilt = true;
    }

    function setStatus(msg, isError) {
        var el = document.getElementById('docMarkdownStatus');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('doc-markdown-status--error', !!isError);
        el.style.display = msg ? 'block' : 'none';
    }

    function setRetryVisible(show, sectionId) {
        var wrap = document.getElementById('docMarkdownRetryWrap');
        var btn = document.getElementById('docMarkdownRetryBtn');
        if (!wrap || !btn) return;
        wrap.style.display = show ? 'block' : 'none';
        btn.onclick = function () {
            htmlCache.delete(sectionId);
            if (typeof window.switchDocumentSection === 'function') {
                window.switchDocumentSection(sectionId);
            }
        };
    }

    function sectionById(sections, id) {
        for (var i = 0; i < sections.length; i++) {
            if (sections[i].id === id) return sections[i];
        }
        return null;
    }

    function showSectionHtml(sectionId, html) {
        var host = document.getElementById('docMarkdownHost');
        if (!host) return;
        host.textContent = '';
        var box = document.createElement('div');
        box.className = 'info-box doc-prose';
        box.setAttribute('data-doc', sectionId);
        box.innerHTML = html;
        host.appendChild(box);
        setStatus('');
        setRetryVisible(false, sectionId);
    }

    function showSectionError(sectionId, err) {
        var host = document.getElementById('docMarkdownHost');
        if (host) host.innerHTML = '';
        var msg = (err && err.message) ? String(err.message) : String(err);
        setStatus('Could not load documentation: ' + msg + ' — for offline use, make sure doc/docs_bundle.js exists. Otherwise serve over http://localhost (not file://) so doc files can be fetched.', true);
        setRetryVisible(true, sectionId);
    }

    function loadSectionMarkdown(sectionId) {
        return getManifest().then(function (m) {
            var sec = sectionById(m.sections, sectionId);
            if (!sec || !sec.file) {
                throw new Error('Unknown doc section: ' + sectionId);
            }
            if (htmlCache.has(sectionId)) {
                return htmlCache.get(sectionId);
            }
            var bundledContent = window.NEBULA_DOC_CONTENT || {};
            if (Object.prototype.hasOwnProperty.call(bundledContent, sectionId)) {
                var bundledMd = String(bundledContent[sectionId] || '');
                var bundledHtml = renderMdToSafeHtml(bundledMd);
                htmlCache.set(sectionId, bundledHtml);
                docTextCache.set(sectionId, bundledMd);
                return bundledHtml;
            }
            var url = new URL(sec.file, docBaseUrl());
            return fetch(url)
                .then(function (r) {
                    if (!r.ok) throw new Error(sec.file + ' HTTP ' + r.status);
                    return r.text();
                })
                .then(function (md) {
                    var html = renderMdToSafeHtml(md);
                    htmlCache.set(sectionId, html);
                    docTextCache.set(sectionId, md);
                    return html;
                });
        });
    }

    function updateOutlineActive(sectionId) {
        document.querySelectorAll('#docOutline .doc-outline-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-doc') === sectionId);
        });
    }

    /**
     * @param {string} sectionName - manifest id (e.g. overview)
     */
    function showDocumentSection(sectionName) {
        var id = sectionName || 'overview';
        setRetryVisible(false, id);
        return getManifest()
            .then(function (m) {
                if (!outlineBuilt) buildOutline(m.sections);
                var known = sectionById(m.sections, id);
                if (!known) id = m.sections[0].id;
                updateOutlineActive(id);
                setStatus('Loading…', false);
                return loadSectionMarkdown(id).then(function (html) {
                    showSectionHtml(id, html);
                    return id;
                });
            })
            .catch(function (err) {
                showSectionError(id, err);
                throw err;
            });
    }

    var readingWidthBound = false;

    function applyDocReadingWidth(limit) {
        var tab = document.getElementById('documentTab');
        if (tab) tab.classList.toggle('doc-reading-width', !!limit);
    }

    function bindReadingWidthToggle() {
        if (readingWidthBound) return;
        readingWidthBound = true;
        var cb = document.getElementById('docReadingWidthToggle');
        if (!cb) return;
        var stored = null;
        try { stored = localStorage.getItem('nebulaDocLimitWidth'); } catch (e) {}
        cb.checked = stored === '1';
        applyDocReadingWidth(cb.checked);
        cb.addEventListener('change', function () {
            applyDocReadingWidth(cb.checked);
            try { localStorage.setItem('nebulaDocLimitWidth', cb.checked ? '1' : '0'); } catch (e) {}
        });
    }

    window.nebulaDocViewer = {
        showDocumentSection: function (sectionName) {
            bindReadingWidthToggle();
            return showDocumentSection(sectionName);
        },
        clearCache: function () {
            htmlCache.clear();
        }
    };
})();
