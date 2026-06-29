/**
 * Interactive PCA 3D plot for Nebula HTML reports (same D3 behavior as Clustering → 3D Plot).
 * Requires global d3 (v7 UMD). Exposes window.NebulaPca3dReportEmbed.mount(hostEl, payload).
 */
(function (global) {
    'use strict';

    var D3_CDN = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';

    function getPcaSymbolName(symbolKey) {
        var v = String(symbolKey || 'circle');
        if (v === 'square') return 'square';
        if (v === 'diamond') return 'diamond';
        if (v === 'triangle-up' || v === 'triangle-down') return 'triangle';
        if (v === 'cross') return 'cross';
        if (v === 'star') return 'star';
        if (v === 'x') return 'wye';
        return 'circle';
    }

    function getPcaSymbolType(d3mod, symbolKey) {
        var name = getPcaSymbolName(symbolKey);
        if (name === 'square') return d3mod.symbolSquare;
        if (name === 'diamond') return d3mod.symbolDiamond;
        if (name === 'triangle') return d3mod.symbolTriangle;
        if (name === 'cross') return d3mod.symbolCross;
        if (name === 'star') return d3mod.symbolStar;
        if (name === 'wye') return d3mod.symbolWye;
        return d3mod.symbolCircle;
    }

    function getOrCreateTooltip(host) {
        var id = 'nebula-pca3d-tip-' + (host.id || 'host');
        var tip = document.getElementById(id);
        if (!tip) {
            tip = document.createElement('div');
            tip.id = id;
            tip.className = 'nebula-pca3d-tooltip';
            tip.setAttribute('role', 'tooltip');
            document.body.appendChild(tip);
        }
        return tip;
    }

    function renderLegend(d3mod, svg, cfg, state, hostId) {
        var laneX = cfg.x;
        var laneY = (cfg.y || 0) + 12;
        var laneW = Math.max(140, cfg.width || 180);
        var laneH = Math.max(120, cfg.height || 260);
        var rowH = 16;
        var items = Array.isArray(cfg.items) ? cfg.items : [];
        var legend = svg.append('g').attr('class', 'pca3d-legend-ui').attr('transform', 'translate(' + laneX + ',' + laneY + ')');
        legend.append('text').attr('x', 0).attr('y', 10).attr('font-size', 12).attr('font-weight', 700).attr('fill', '#111827').text('Groups');
        var listTop = 52;
        var controlsBand = 30;
        var viewportH = Math.max(36, laneH - listTop - controlsBand);
        var controlY = listTop + viewportH + 8;
        var btnW = 74;
        var gap = 6;
        var totalBtnW = (btnW * 2) + gap;
        var btnLeft = Math.max(0, Math.floor((laneW - totalBtnW) / 2));
        var btn = legend.append('g').attr('transform', 'translate(' + btnLeft + ',' + controlY + ')').style('cursor', 'pointer');
        btn.append('rect').attr('width', btnW).attr('height', 16).attr('rx', 4).attr('fill', '#eef2ff').attr('stroke', '#c7d2fe');
        var btnText = btn.append('text').attr('x', btnW / 2).attr('y', 11).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#4338ca');
        var resetBtn = legend.append('g').attr('transform', 'translate(' + (btnLeft + btnW + gap) + ',' + controlY + ')').style('cursor', 'pointer');
        resetBtn.append('rect').attr('width', btnW).attr('height', 16).attr('rx', 4).attr('fill', '#f8fafc').attr('stroke', '#d1d5db');
        resetBtn.append('text').attr('x', btnW / 2).attr('y', 11).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#374151').text('Reset');
        var clipId = 'pcaLegendClip_rpt_' + String(hostId || 'x').replace(/[^a-zA-Z0-9_-]/g, '_');
        var defs = svg.append('defs');
        defs.append('clipPath').attr('id', clipId).append('rect').attr('x', laneX).attr('y', laneY + listTop).attr('width', laneW - 12).attr('height', viewportH);
        var listViewport = svg.append('g').attr('clip-path', 'url(#' + clipId + ')');
        var listContent = listViewport.append('g');
        var foot = legend.append('text').attr('x', 0).attr('y', laneH + 14).attr('font-size', 10).attr('fill', '#6b7280');
        var scrollTrack = legend.append('rect').attr('x', laneW - 8).attr('y', listTop).attr('width', 6).attr('height', viewportH).attr('rx', 3).attr('fill', '#f3f4f6').attr('stroke', '#e5e7eb');
        var scrollThumb = legend.append('rect').attr('x', laneW - 8).attr('width', 6).attr('rx', 3).attr('fill', '#c7d2fe');
        var scrollHit = legend.append('rect')
            .attr('x', 0).attr('y', listTop).attr('width', laneW).attr('height', viewportH)
            .attr('fill', 'transparent')
            .on('wheel', function (event) {
                if (state.collapsed) return;
                var totalH = items.length * rowH;
                var maxScroll = Math.max(0, totalH - viewportH);
                if (maxScroll <= 0) return;
                event.preventDefault();
                event.stopPropagation();
                var delta = event.deltaY > 0 ? 26 : -26;
                state.scroll = Math.max(0, Math.min(maxScroll, state.scroll + delta));
                refreshLegend();
            });

        function refreshLegend() {
            var collapsed = !!state.collapsed;
            btnText.text(collapsed ? 'Expand' : 'Collapse');
            var rowsData = collapsed ? [] : items;
            var row = listContent.selectAll('g.legend-row').data(rowsData, function (d) { return d.label; });
            row.exit().remove();
            var rowEnter = row.enter().append('g').attr('class', 'legend-row');
            rowEnter.append('path');
            rowEnter.append('text').attr('font-size', 11).attr('fill', '#111827');
            var rowAll = rowEnter.merge(row);
            var totalH = rowsData.length * rowH;
            var maxScroll = Math.max(0, totalH - viewportH);
            state.scroll = Math.max(0, Math.min(maxScroll, state.scroll));
            listContent.attr('transform', 'translate(' + laneX + ',' + (laneY + listTop - state.scroll) + ')');
            rowAll.attr('transform', function (_, i) { return 'translate(0,' + (i * rowH + 6) + ')'; });
            rowAll.select('path')
                .attr('d', function (d) { return d3mod.symbol().type(getPcaSymbolType(d3mod, d.symbolKey)).size(70)(); })
                .attr('transform', 'translate(8,0)')
                .attr('fill', function (d) { return d.color; }).attr('stroke', '#111827').attr('stroke-width', 0.5)
                .attr('opacity', function (d) { return (state.hiddenGroups && state.hiddenGroups[d.label]) ? 0.22 : 1; });
            rowAll.select('text').attr('x', 18).attr('y', 4).text(function (d) { return d.label; })
                .attr('opacity', function (d) { return (state.hiddenGroups && state.hiddenGroups[d.label]) ? 0.45 : 1; })
                .style('text-decoration', function (d) {
                    return (state.hiddenGroups && state.hiddenGroups[d.label]) ? 'line-through' : 'none';
                });
            rowAll.style('cursor', 'pointer')
                .on('click', function (event, d) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!state.hiddenGroups) state.hiddenGroups = {};
                    state.hiddenGroups[d.label] = !state.hiddenGroups[d.label];
                    if (typeof cfg.onLegendStateChanged === 'function') cfg.onLegendStateChanged();
                })
                .on('dblclick', function (event, d) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!state.hiddenGroups) state.hiddenGroups = {};
                    var hasOtherVisible = items.some(function (it) {
                        return it.label !== d.label && !state.hiddenGroups[it.label];
                    });
                    if (hasOtherVisible) {
                        var next = {};
                        items.forEach(function (it) { next[it.label] = it.label !== d.label; });
                        state.hiddenGroups = next;
                    } else {
                        state.hiddenGroups = {};
                    }
                    if (typeof cfg.onLegendStateChanged === 'function') cfg.onLegendStateChanged();
                })
                .on('mouseenter', function (event, d) {
                    event.preventDefault();
                    event.stopPropagation();
                    state.hoverGroup = d.label;
                    if (typeof cfg.onLegendStateChanged === 'function') cfg.onLegendStateChanged();
                })
                .on('mouseleave', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    state.hoverGroup = null;
                    if (typeof cfg.onLegendStateChanged === 'function') cfg.onLegendStateChanged();
                });
            var thumbH = maxScroll > 0 ? Math.max(18, (viewportH * viewportH) / Math.max(totalH, viewportH)) : viewportH;
            var thumbY = maxScroll > 0 ? (state.scroll / maxScroll) * (viewportH - thumbH) : 0;
            scrollTrack.style('display', collapsed ? 'none' : null);
            scrollThumb.style('display', collapsed ? 'none' : null)
                .attr('y', listTop + thumbY).attr('height', thumbH);
            scrollHit.style('display', collapsed ? 'none' : null);
            foot.text(collapsed ? (items.length + ' groups (collapsed)') : (items.length + ' groups'));
            if (collapsed) {
                listContent.attr('transform', 'translate(' + laneX + ',' + (laneY + listTop) + ')');
            }
        }

        btn.on('click', function () {
            state.collapsed = !state.collapsed;
            refreshLegend();
        });
        resetBtn.on('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            state.hiddenGroups = {};
            state.hoverGroup = null;
            if (typeof cfg.onLegendStateChanged === 'function') cfg.onLegendStateChanged();
        });
        refreshLegend();
    }

    /**
     * Same D3 PCA 3D renderer used by Clustering tab and Report export.
     * @param {HTMLElement} host
     * @param {object} payload data + view + legendUiState
     * @param {object} [d3mod] d3 module (parent window or iframe)
     * @param {{ onLegendStateChanged?: function, applyAppHostLayout?: boolean }} [hooks]
     */
    function mount(host, payload, d3mod, hooks) {
        hooks = hooks || {};
        d3mod = d3mod || global.d3 || global.__d3ForPca;
        if (!host || !payload || !d3mod) return false;
        var width = Math.max(420, Number(payload.width) || 980);
        var height = Math.max(300, Number(payload.height) || 760);
        var pcX = Number(payload.pcX) || 0;
        var pcY = Number(payload.pcY) || 1;
        var pcZ = Number(payload.pcZ) || 2;
        var title = payload.title != null ? String(payload.title) : ('PCA 3D: PC' + (pcX + 1) + ' / PC' + (pcY + 1) + ' / PC' + (pcZ + 1));
        var allPoints = Array.isArray(payload.points) ? payload.points : [];
        var legendItems = Array.isArray(payload.legendItems) ? payload.legendItems : [];
        var showLegend = payload.showLegend !== false && legendItems.length > 0;
        var showColumnLabels = !!payload.showColumnLabels;
        var labelStyle = payload.labelStyle && typeof payload.labelStyle === 'object'
            ? payload.labelStyle
            : { size: 10, color: '#1f2937' };
        var showArrows = payload.showArrows !== false;
        var legendLaneWidth = Number(payload.legendLaneWidth);
        if (!Number.isFinite(legendLaneWidth) || legendLaneWidth < 170) legendLaneWidth = 170;

        var legendState = payload.legendUiState;
        if (!legendState || typeof legendState !== 'object') {
            legendState = {
                collapsed: false,
                scroll: 0,
                hiddenGroups: {},
                hoverGroup: null
            };
        }
        if (!legendState.hiddenGroups) legendState.hiddenGroups = {};

        var view = payload.view;
        if (!view || typeof view !== 'object') {
            view = {
                rotX: -0.35,
                rotY: 0.8,
                zoom: 1,
                userAdjusted: false
            };
        }
        if (!(view.zoom > 0)) view.zoom = 1;

        host.innerHTML = '';
        if (hooks.applyAppHostLayout) {
            var plotH = Math.max(300, height);
            host.style.flex = '0 0 auto';
            host.style.height = plotH + 'px';
            host.style.minHeight = plotH + 'px';
            host.style.maxHeight = plotH + 'px';
            host.style.overflow = 'hidden';
        }
        host.style.width = width + 'px';
        host.style.height = height + 'px';
        host.style.minWidth = width + 'px';
        host.style.minHeight = height + 'px';
        host.style.maxWidth = width + 'px';
        host.style.maxHeight = height + 'px';

        var tooltip = getOrCreateTooltip(host);
        var margin = { top: 40, right: showLegend ? legendLaneWidth : 24, bottom: 40, left: 40 };
        var innerW = Math.max(1, width - margin.left - margin.right);
        var innerH = Math.max(1, height - margin.top - margin.bottom);

        function getDrawPoints() {
            var visible = allPoints.filter(function (p) {
                return !(legendState.hiddenGroups && legendState.hiddenGroups[p.groupLabel]);
            });
            return visible.length > 0 ? visible : allPoints.slice();
        }

        function buildNormalized(drawPoints) {
            var xs = drawPoints.map(function (p) { return p.x; });
            var ys = drawPoints.map(function (p) { return p.y; });
            var zs = drawPoints.map(function (p) { return p.z; });
            var xr = (d3mod.max(xs) - d3mod.min(xs)) || 1;
            var yr = (d3mod.max(ys) - d3mod.min(ys)) || 1;
            var zr = (d3mod.max(zs) - d3mod.min(zs)) || 1;
            var cx = (d3mod.max(xs) + d3mod.min(xs)) / 2;
            var cy = (d3mod.max(ys) + d3mod.min(ys)) / 2;
            var cz = (d3mod.max(zs) + d3mod.min(zs)) / 2;
            return drawPoints.map(function (p) {
                return Object.assign({}, p, {
                    nx: (p.x - cx) / xr,
                    ny: (p.y - cy) / yr,
                    nz: (p.z - cz) / zr
                });
            });
        }

        var svg = d3mod.select(host).append('svg').attr('width', width).attr('height', height);
        svg.append('rect').attr('x', 0).attr('y', 0).attr('width', width).attr('height', height).attr('fill', '#ffffff');
        var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        svg.append('text').attr('x', width / 2).attr('y', 24).attr('text-anchor', 'middle').attr('font-size', 16).attr('font-weight', 700).text(title);

        var plotG = g.append('g').attr('transform', 'translate(' + (innerW / 2) + ',' + (innerH / 2) + ')');
        var axisLayer = plotG.append('g');
        var pointLayer = plotG.append('g');
        var arrowLayer = plotG.append('g');
        var labelLayer = plotG.append('g');

        var axes = [
            { name: 'PC' + (pcX + 1), color: '#ef4444', v: { nx: 1, ny: 0, nz: 0 } },
            { name: 'PC' + (pcY + 1), color: '#10b981', v: { nx: 0, ny: 1, nz: 0 } },
            { name: 'PC' + (pcZ + 1), color: '#3b82f6', v: { nx: 0, ny: 0, nz: 1 } }
        ];

        function project(p) {
            var ry = view.rotY;
            var rx = view.rotX;
            var cyy = Math.cos(ry);
            var syy = Math.sin(ry);
            var cxx = Math.cos(rx);
            var sxx = Math.sin(rx);
            var x1 = p.nx * cyy + p.nz * syy;
            var z1 = -p.nx * syy + p.nz * cyy;
            var y2 = p.ny * cxx - z1 * sxx;
            var z2 = p.ny * sxx + z1 * cxx;
            var depth = 2.7 + z2;
            var s = (Math.min(innerW, innerH) * 0.43 * view.zoom) / depth;
            return { x: x1 * s, y: -y2 * s, depth: z2, scale: s };
        }

        function refitZoom(normalized) {
            if (!normalized.length) {
                view.zoom = 1;
                return;
            }
            var oldZoom = view.zoom;
            view.zoom = 1;
            var projFit = normalized.map(function (p) { return project(p); });
            var minX = d3mod.min(projFit, function (p) { return p.x; });
            var maxX = d3mod.max(projFit, function (p) { return p.x; });
            var minY = d3mod.min(projFit, function (p) { return p.y; });
            var maxY = d3mod.max(projFit, function (p) { return p.y; });
            var spanX = Math.max(1, (maxX - minX) || 1);
            var spanY = Math.max(1, (maxY - minY) || 1);
            var targetW = innerW * 0.72;
            var targetH = innerH * 0.68;
            var fitZoom = Math.min(targetW / spanX, targetH / spanY);
            if (Number.isFinite(fitZoom) && fitZoom > 0) {
                view.zoom = Math.max(0.55, Math.min(6.5, fitZoom));
            } else {
                view.zoom = oldZoom;
            }
        }

        var normalized = buildNormalized(getDrawPoints());
        if (!view.userAdjusted && normalized.length > 0) {
            refitZoom(normalized);
        }

        var dataCenter = { cx: 0, cy: 0, cz: 0, xr: 1, yr: 1, zr: 1 };

        function syncDataCenter(drawPoints) {
            var xs = drawPoints.map(function (p) { return p.x; });
            var ys = drawPoints.map(function (p) { return p.y; });
            var zs = drawPoints.map(function (p) { return p.z; });
            dataCenter.xr = (d3mod.max(xs) - d3mod.min(xs)) || 1;
            dataCenter.yr = (d3mod.max(ys) - d3mod.min(ys)) || 1;
            dataCenter.zr = (d3mod.max(zs) - d3mod.min(zs)) || 1;
            dataCenter.cx = (d3mod.max(xs) + d3mod.min(xs)) / 2;
            dataCenter.cy = (d3mod.max(ys) + d3mod.min(ys)) / 2;
            dataCenter.cz = (d3mod.max(zs) + d3mod.min(zs)) / 2;
        }

        syncDataCenter(getDrawPoints());

        function syncViewSnapshot() {
            if (!hooks.syncViewSnapshot) return;
            host._pca3dViewState = {
                rotX: view.rotX,
                rotY: view.rotY,
                zoom: view.zoom,
                innerW: innerW,
                innerH: innerH,
                cx: dataCenter.cx,
                cy: dataCenter.cy,
                cz: dataCenter.cz,
                xr: dataCenter.xr,
                yr: dataCenter.yr,
                zr: dataCenter.zr,
                pcX: pcX,
                pcY: pcY,
                pcZ: pcZ
            };
        }

        function onLegendChanged() {
            if (typeof hooks.onLegendStateChanged === 'function') hooks.onLegendStateChanged();
            else draw3d();
        }

        function draw3d() {
            var drawPoints = getDrawPoints();
            syncDataCenter(drawPoints);
            normalized = buildNormalized(drawPoints);
            syncViewSnapshot();
            var hoveredGroup = legendState.hoverGroup || null;
            var axisProj = axes.map(function (a) {
                return Object.assign({}, a, {
                    p0: project({ nx: 0, ny: 0, nz: 0 }),
                    p1: project(a.v)
                });
            });
            axisLayer.selectAll('line').data(axisProj).join('line')
                .attr('x1', function (d) { return d.p0.x; }).attr('y1', function (d) { return d.p0.y; })
                .attr('x2', function (d) { return d.p1.x; }).attr('y2', function (d) { return d.p1.y; })
                .attr('stroke', function (d) { return d.color; }).attr('stroke-width', 1.5).attr('opacity', 0.9);
            axisLayer.selectAll('text').data(axisProj).join('text')
                .attr('x', function (d) { return d.p1.x + 8; }).attr('y', function (d) { return d.p1.y - 6; })
                .attr('font-size', 11).attr('fill', function (d) { return d.color; }).text(function (d) { return d.name; });

            var projected = normalized.map(function (p) {
                return Object.assign({}, p, { prj: project(p) });
            }).sort(function (a, b) { return a.prj.depth - b.prj.depth; });

            pointLayer.selectAll('path').data(projected, function (d) { return d.sampleId; }).join('path')
                .attr('d', function (d) {
                    var base = Math.max(34, Math.min(160, d.prj.scale * 0.3));
                    var sz = hoveredGroup ? (d.groupLabel === hoveredGroup ? base * 1.22 : base * 0.8) : base;
                    return d3mod.symbol().type(getPcaSymbolType(d3mod, d.symbolKey)).size(sz)();
                })
                .attr('transform', function (d) { return 'translate(' + d.prj.x + ',' + d.prj.y + ')'; })
                .attr('fill', function (d) { return d.color; })
                .attr('stroke', '#111827')
                .attr('stroke-width', 0.6)
                .attr('opacity', function (d) {
                    return hoveredGroup ? (d.groupLabel === hoveredGroup ? 0.98 : 0.16) : 0.9;
                })
                .on('mousemove', function (event, d) {
                    tooltip.style.display = 'block';
                    tooltip.innerHTML = d.hoverHtml || d.sampleId || '';
                    tooltip.style.left = (event.clientX + 14) + 'px';
                    tooltip.style.top = (event.clientY + 14) + 'px';
                })
                .on('mouseleave', function () { tooltip.style.display = 'none'; });

            var labelPool = hoveredGroup
                ? projected.filter(function (p) { return p.groupLabel === hoveredGroup; })
                : projected;
            var labels = showColumnLabels ? labelPool.slice(0, Math.min(labelPool.length, 80)) : [];
            arrowLayer.selectAll('line').data(showArrows ? labels : [], function (d) { return d.sampleId; }).join('line')
                .attr('x1', function (d) { return d.prj.x; }).attr('y1', function (d) { return d.prj.y; })
                .attr('x2', function (d) { return d.prj.x + 6; }).attr('y2', function (d) { return d.prj.y - 6 - (labelStyle.size * 0.22); })
                .attr('stroke', labelStyle.color).attr('stroke-opacity', 0.55).attr('stroke-width', 0.7);
            labelLayer.selectAll('text').data(labels, function (d) { return d.sampleId; }).join('text')
                .attr('x', function (d) { return d.prj.x + 6; }).attr('y', function (d) { return d.prj.y - 6; })
                .attr('font-size', labelStyle.size).attr('fill', labelStyle.color).text(function (d) { return d.sampleId; });
        }

        draw3d();

        if (showLegend) {
            renderLegend(d3mod, svg, {
                items: legendItems,
                x: margin.left + innerW + 18,
                y: margin.top,
                width: Math.max(140, margin.right - 24),
                height: innerH,
                onLegendStateChanged: onLegendChanged
            }, legendState, host.id || 'pca3d');
        }

        svg.append('text').attr('x', margin.left).attr('y', height - 10).attr('font-size', 11).attr('fill', '#4b5563')
            .text('Drag: rotate | Wheel: zoom');

        host.setAttribute('data-nebula-pca3d-interactive', '1');
        host.setAttribute('data-nebula-pca3d-embed-version', '5.06');

        var doc = host.ownerDocument || document;
        var dragStart = null;
        var dragMoveHandler = null;
        var dragUpHandler = null;

        function stopDrag() {
            dragStart = null;
            if (dragMoveHandler) {
                doc.removeEventListener('mousemove', dragMoveHandler, true);
                dragMoveHandler = null;
            }
            if (dragUpHandler) {
                doc.removeEventListener('mouseup', dragUpHandler, true);
                dragUpHandler = null;
            }
        }

        function onWheelZoom(event) {
            event.preventDefault();
            event.stopPropagation();
            var delta = event.deltaY > 0 ? -0.08 : 0.08;
            view.zoom = Math.max(0.45, view.zoom + delta);
            view.userAdjusted = true;
            draw3d();
        }

        svg.on('mousedown', function (event) {
            if (event.button !== 0) return;
            event.preventDefault();
            stopDrag();
            dragStart = { x: event.clientX, y: event.clientY, rx: view.rotX, ry: view.rotY };
            dragMoveHandler = function (e) {
                if (!dragStart) return;
                e.preventDefault();
                var dx = e.clientX - dragStart.x;
                var dy = e.clientY - dragStart.y;
                view.rotY = dragStart.ry + dx * 0.01;
                view.rotX = Math.max(-1.35, Math.min(1.35, dragStart.rx + dy * 0.01));
                view.userAdjusted = true;
                draw3d();
            };
            dragUpHandler = function () { stopDrag(); };
            doc.addEventListener('mousemove', dragMoveHandler, true);
            doc.addEventListener('mouseup', dragUpHandler, true);
        });
        svg.on('mouseleave', function () {
            tooltip.style.display = 'none';
        });

        var svgNode = svg.node();
        if (svgNode) {
            svgNode.addEventListener('wheel', onWheelZoom, { passive: false, capture: true });
        }
        host.addEventListener('wheel', onWheelZoom, { passive: false, capture: true });

        if (hooks.syncViewSnapshot) {
            host._pcaD3ResetView = function () {
                view.rotX = -0.35;
                view.rotY = 0.8;
                view.userAdjusted = false;
                refitZoom(buildNormalized(getDrawPoints()));
                draw3d();
            };
        }

        var visibleCount = allPoints.filter(function (p) {
            return !(legendState.hiddenGroups && legendState.hiddenGroups[p.groupLabel]);
        }).length;
        if (visibleCount === 0 && allPoints.length > 0) {
            svg.append('text')
                .attr('x', margin.left + innerW / 2).attr('y', margin.top + innerH / 2)
                .attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#6b7280')
                .text('All groups hidden. Use legend reset to show points.');
        }
        return true;
    }

    global.NebulaPca3dReportEmbed = {
        D3_CDN: D3_CDN,
        EMBED_VERSION: '5.06',
        mount: mount
    };
    global.NebulaPca3dPlot = global.NebulaPca3dReportEmbed;
})(typeof window !== 'undefined' ? window : this);
