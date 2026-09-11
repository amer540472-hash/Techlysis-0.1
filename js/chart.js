/* Techlysis — pure-canvas interactive chart.
 *
 * Layout: main price pane (top) + indicator subchart (middle) + volume pane
 * (bottom), with a left price scale, right indicator scale and a time axis.
 * Pan / zoom / crosshair / overlays are all handled here with zero deps.
 */
'use strict';

window.TL = window.TL || {};

TL.chart = (function () {

  var COLORS = {
    bg: '#0a0e14',
    paneBg: '#0d131c',
    grid: '#1b2432',
    axis: '#3a4658',
    text: '#7d8ba1',
    textBright: '#cbd5e1',
    up: '#22c55e',
    down: '#ef4444',
    ema: { 9: '#f59e0b', 21: '#38bdf8', 50: '#a78bfa', 200: '#f472b6' },
    sma: '#94a3b8',
    bb: '#64748b',
    vwap: '#eab308',
    pivot: '#475569',
    sr: '#8b9bb0',
    supply: 'rgba(239,68,68,0.55)',
    supplyFill: 'rgba(239,68,68,0.10)',
    demand: 'rgba(34,197,94,0.55)',
    demandFill: 'rgba(34,197,94,0.10)',
    fvgBull: 'rgba(34,197,94,0.14)',
    fvgBear: 'rgba(239,68,68,0.14)',
    obBull: 'rgba(34,197,94,0.20)',
    obBear: 'rgba(239,68,68,0.20)',
    vp: 'rgba(56,189,248,0.35)',
    entry: '#22d3ee',
    sl: '#ef4444',
    tp: '#22c55e',
    crosshair: '#5b6b82'
  };

  var state = {
    container: null, canvas: null, ctx: null,
    legendEl: null, tooltipEl: null,
    width: 0, height: 0, dpr: 1,
    bars: [], asset: 'XAUUSD', tf: '1h',
    analysis: null, tradePlan: null, showTrade: false,
    indicator: 'RSI',
    viewStart: 0, viewBars: 120,
    mouse: null, dragging: false,
    dragStartX: 0, dragStartView: 0,
    pointers: {},
    settings: null,
    rafPending: false
  };

  var LEFT_MARGIN = 74;
  var RIGHT_MARGIN = 58;
  var TIME_AXIS = 24;
  var TOP_PAD = 8;

  function paneLayout() {
    var h = state.height;
    var main = h - TIME_AXIS - TOP_PAD;
    var volH = Math.max(24, main * 0.12);
    var indH = Math.max(34, main * 0.22);
    var mainH = main - volH - indH;
    return {
      mainTop: TOP_PAD, mainBottom: TOP_PAD + mainH,
      indTop: TOP_PAD + mainH, indBottom: TOP_PAD + mainH + indH,
      volTop: TOP_PAD + mainH + indH, volBottom: TOP_PAD + mainH + indH + volH,
      timeY: h - TIME_AXIS + 6
    };
  }

  function xFor(i) {
    var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
    return LEFT_MARGIN + (i - state.viewStart) * (w / state.viewBars);
  }

  function priceScale() {
    var lo = Infinity, hi = -Infinity;
    var vb = visibleBars();
    for (var i = 0; i < vb.length; i++) {
      if (vb[i].low < lo) lo = vb[i].low;
      if (vb[i].high > hi) hi = vb[i].high;
    }
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }

    var atr = (state.analysis && state.analysis.smc.atr) || (hi - lo) * 0.01;

    function consider(p) { if (p != null && isFinite(p) && p >= lo - atr * 2.5 && p <= hi + atr * 2.5) { if (p < lo) lo = p; if (p > hi) hi = p; } }

    var a = state.analysis;
    if (a) {
      var ind = a.indicators;
      var lev = [ind.pivots && ind.pivots.p, ind.pivots && ind.pivots.r1, ind.pivots && ind.pivots.s1,
        ind.last.ema21, ind.last.ema50, ind.last.ema200, ind.last.vwap];
      for (var i2 = 0; i2 < lev.length; i2++) consider(lev[i2]);
      if (a.vp) { consider(a.vp.vah); consider(a.vp.val); consider(a.vp.poc); }
      if (a.fib) { for (var f = 0; f < a.fib.ret.length; f++) consider(a.fib.ret[f].price); }
      for (var s = 0; s < a.smc.sr.length; s++) consider(a.smc.sr[s].price);
      // zones/OB/FVG only if their band intersects the bar range
      for (var z = 0; z < a.smc.supply.length; z++) { if (a.smc.supply[z].bottom <= hi + atr && a.smc.supply[z].top >= lo - atr) { consider(a.smc.supply[z].top); consider(a.smc.supply[z].bottom); } }
      for (var d = 0; d < a.smc.demand.length; d++) { if (a.smc.demand[d].bottom <= hi + atr && a.smc.demand[d].top >= lo - atr) { consider(a.smc.demand[d].top); consider(a.smc.demand[d].bottom); } }
    }
    if (state.showTrade && state.tradePlan) {
      consider(state.tradePlan.entry); consider(state.tradePlan.sl);
      if (state.tradePlan.tp1) consider(state.tradePlan.tp1.price);
      if (state.tradePlan.tp2) consider(state.tradePlan.tp2.price);
      if (state.tradePlan.tp3) consider(state.tradePlan.tp3.price);
    }
    if (lo >= hi) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.05;
    return { lo: lo - pad, hi: hi + pad };
  }

  function yFor(price, ps) {
    var layout = paneLayout();
    return layout.mainTop + (layout.mainBottom - layout.mainTop) * (1 - (price - ps.lo) / (ps.hi - ps.lo));
  }

  function visibleBars() {
    var start = Math.max(0, Math.floor(state.viewStart));
    var end = Math.min(state.bars.length, Math.ceil(state.viewStart + state.viewBars));
    return state.bars.slice(start, end);
  }

  function clampView() {
    var n = state.bars.length;
    if (!n) return;
    var maxBars = Math.min(1000, n);
    state.viewBars = TL.utils.clamp(state.viewBars, 5, maxBars);
    state.viewStart = TL.utils.clamp(state.viewStart, -state.viewBars * 0.2, n - state.viewBars * 0.8);
    if (state.viewStart > n - 5) state.viewStart = Math.max(0, n - state.viewBars);
  }

  /* ==================== public API ==================== */

  function init(opts) {
    state.container = opts.container;
    state.canvas = opts.canvas;
    state.legendEl = opts.legendEl;
    state.tooltipEl = opts.tooltipEl;
    state.ctx = state.canvas.getContext('2d');
    resize();
    bindEvents();
    window.addEventListener('resize', function () { resize(); requestDraw(); });
    if (window.ResizeObserver) {
      new ResizeObserver(function () { resize(); requestDraw(); }).observe(state.container);
    }
    return api;
  }

  function resize() {
    if (!state.canvas || !state.container) return;
    var rect = state.container.getBoundingClientRect();
    state.dpr = window.devicePixelRatio || 1;
    state.width = Math.max(200, rect.width);
    state.height = Math.max(180, rect.height);
    state.canvas.width = Math.round(state.width * state.dpr);
    state.canvas.height = Math.round(state.height * state.dpr);
    state.canvas.style.width = state.width + 'px';
    state.canvas.style.height = state.height + 'px';
  }

  function setData(bars, asset, tf) {
    state.bars = bars || [];
    state.asset = asset || state.asset;
    state.tf = tf || state.tf;
    var settings = TL.store.get();
    state.viewBars = settings.tools.chart.defaultBars || 120;
    state.viewStart = Math.max(0, state.bars.length - state.viewBars);
    clampView();
    requestDraw();
  }

  function setAnalysis(analysis) { state.analysis = analysis; requestDraw(); }

  function setTradePlan(plan, show) { state.tradePlan = plan; state.showTrade = !!show; requestDraw(); }

  function setIndicator(name) { state.indicator = name || 'RSI'; requestDraw(); }

  function fit() {
    state.viewStart = 0;
    state.viewBars = state.bars.length;
    clampView();
    requestDraw();
  }

  function oneToOne() {
    var def = TL.store.get().tools.chart.defaultBars || 120;
    state.viewBars = def;
    state.viewStart = Math.max(0, state.bars.length - def);
    clampView();
    requestDraw();
  }

  function panBars(deltaBars) {
    state.viewStart += deltaBars;
    clampView();
    requestDraw();
  }

  function zoomAt(centerRatio, factor) {
    var oldBars = state.viewBars;
    state.viewBars = TL.utils.clamp(oldBars / factor, 5, Math.min(1000, state.bars.length));
    var pivot = state.viewStart + centerRatio * oldBars;
    state.viewStart = pivot - centerRatio * state.viewBars;
    clampView();
    requestDraw();
  }

  function zoomIn() { zoomAt(0.5, (TL.store.get().tools.chart.zoomSpeed || 1.2)); }
  function zoomOut() { zoomAt(0.5, 1 / (TL.store.get().tools.chart.zoomSpeed || 1.2)); }

  /* ==================== interaction ==================== */

  function localPos(e) {
    var rect = state.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function bindEvents() {
    var c = state.canvas;

    c.addEventListener('mousedown', function (e) {
      var p = localPos(e);
      state.dragging = true;
      state.dragStartX = p.x;
      state.dragStartView = state.viewStart;
      state.canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', function (e) {
      if (!state.container) return;
      var p = localPos(e);
      state.mouse = p;
      if (state.dragging) {
        var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
        var pxPerBar = w / state.viewBars;
        state.viewStart = state.dragStartView - (p.x - state.dragStartX) / pxPerBar;
        clampView();
        requestDraw();
      }
      requestDraw(); // crosshair redraw
    });
    window.addEventListener('mouseup', function () {
      state.dragging = false;
      state.canvas.style.cursor = 'crosshair';
    });
    c.addEventListener('mouseleave', function () { state.mouse = null; requestDraw(); });

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = localPos(e);
      var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
      var centerRatio = TL.utils.clamp((p.x - LEFT_MARGIN) / w, 0, 1);
      var scrollSpeed = TL.store.get().tools.chart.scrollSpeed || 2;
      if (e.shiftKey) {
        state.viewStart += (e.deltaY > 0 ? 1 : -1) * scrollSpeed;
        clampView();
      } else {
        var factor = (TL.store.get().tools.chart.zoomSpeed || 1.2);
        zoomAt(centerRatio, e.deltaY < 0 ? factor : 1 / factor);
      }
      requestDraw();
    }, { passive: false });

    c.addEventListener('dblclick', function () { fit(); });

    // pointer events for touch pan/pinch
    c.addEventListener('pointerdown', function (e) {
      state.pointers[e.pointerId] = localPos(e);
      state.canvas.setPointerCapture && state.canvas.setPointerCapture(e.pointerId);
      if (Object.keys(state.pointers).length === 1) {
        state.dragging = true; state.dragStartX = state.pointers[e.pointerId].x; state.dragStartView = state.viewStart;
      }
    });
    c.addEventListener('pointermove', function (e) {
      if (!state.pointers[e.pointerId]) return;
      var prev = state.pointers[e.pointerId];
      state.pointers[e.pointerId] = localPos(e);
      var ids = Object.keys(state.pointers);
      if (ids.length === 2) {
        var a = state.pointers[ids[0]], b = state.pointers[ids[1]];
        var pa = state.pointers[ids[0]], pb = state.pointers[ids[1]];
        // simple pinch: compare distance change is complex; use x-span for zoom
        var dist0 = Math.abs(a.x - b.x) || 1;
        var prevA = prev, prevB = null;
        // approximate pinch via movement of second pointer
        var spanPrev = state._lastSpan || dist0;
        var span = dist0;
        zoomAt(0.5, spanPrev / span < 1 ? (TL.store.get().tools.chart.zoomSpeed || 1.2) : 1 / (TL.store.get().tools.chart.zoomSpeed || 1.2));
        state._lastSpan = span;
      } else if (ids.length === 1 && state.dragging) {
        var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
        var pxPerBar = w / state.viewBars;
        state.viewStart = state.dragStartView - (state.pointers[ids[0]].x - state.dragStartX) / pxPerBar;
        clampView();
      }
      requestDraw();
    });
    function endPointer(e) {
      delete state.pointers[e.pointerId];
      state._lastSpan = null;
      if (Object.keys(state.pointers).length === 0) state.dragging = false;
    }
    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', endPointer);

    c.addEventListener('keydown', function (e) {
      var step = TL.store.get().tools.chart.scrollSpeed || 2;
      switch (e.key) {
        case 'ArrowLeft': state.viewStart -= step; clampView(); requestDraw(); e.preventDefault(); break;
        case 'ArrowRight': state.viewStart += step; clampView(); requestDraw(); e.preventDefault(); break;
        case '+': case '=': zoomIn(); e.preventDefault(); break;
        case '-': case '_': zoomOut(); e.preventDefault(); break;
        case 'Home': fit(); e.preventDefault(); break;
      }
    });
  }

  /* ==================== drawing ==================== */

  function requestDraw() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(function () {
      state.rafPending = false;
      draw();
    });
  }

  function draw() {
    if (!state.ctx || !state.canvas) return;
    var ctx = state.ctx;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, state.width, state.height);

    if (!state.bars.length) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading data…', state.width / 2, state.height / 2);
      return;
    }

    var layout = paneLayout();
    var ps = priceScale();
    var start = Math.max(0, Math.floor(state.viewStart));
    var end = Math.min(state.bars.length, Math.ceil(state.viewStart + state.viewBars));
    var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
    var barW = w / state.viewBars;
    var gap = TL.store.get().tools.chart.candleGap || 0.15;
    var bodyW = Math.max(1, barW * (1 - gap));

    // background grids
    drawGrid(ctx, ps, layout);
    drawTimeAxis(ctx, start, end, barW, layout);
    drawPriceAxis(ctx, ps, layout);

    var i;
    // zones & overlays (behind candles)
    drawZones(ctx, ps, layout, start, end, barW);
    drawFVG(ctx, ps, layout, start, end, barW);
    drawOrderBlocks(ctx, ps, layout, start, end, barW);
    drawSR(ctx, ps, layout, start, end, barW);
    drawPivots(ctx, ps, layout, start, end, barW);
    drawFib(ctx, ps, layout, start, end, barW);
    drawVWAP(ctx, ps, layout, start, end, barW);
    drawMA(ctx, ps, layout, start, end, barW);
    drawBB(ctx, ps, layout, start, end, barW);
    drawSwings(ctx, ps, layout, start, end, barW);
    drawBOS(ctx, ps, layout, start, end, barW);

    // candles
    for (i = start; i < end; i++) {
      drawCandle(ctx, i, ps, layout, barW, bodyW);
    }

    // volume profile on right side
    if (state.analysis && state.analysis.vp && TL.store.get().overlays.vp) {
      drawVP(ctx, ps, layout, start, end, barW);
    }

    // trade plan overlay
    if (state.showTrade && state.tradePlan) drawTrade(ctx, ps, layout, start, end, barW);

    // subcharts
    drawVolumePane(ctx, layout, start, end, barW, bodyW);
    drawIndicatorPane(ctx, layout, start, end, barW);

    // crosshair + tooltip
    drawCrosshair(ctx, ps, layout, start, end, barW);

    updateLegend();
  }

  function drawGrid(ctx, ps, layout) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    var ticks = 6;
    for (var i = 0; i <= ticks; i++) {
      var y = layout.mainTop + (layout.mainBottom - layout.mainTop) * i / ticks;
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(state.width - RIGHT_MARGIN, y); ctx.stroke();
    }
    // vertical grid
    var n = 8;
    var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
    for (var v = 0; v <= n; v++) {
      var x = LEFT_MARGIN + w * v / n;
      ctx.beginPath(); ctx.moveTo(x, layout.mainTop); ctx.lineTo(x, layout.mainBottom); ctx.stroke();
    }
  }

  function drawPriceAxis(ctx, ps, layout) {
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var ticks = 6;
    var fmt = function (p) { return TL.utils.fmtPrice(p, state.asset); };
    for (var i = 0; i <= ticks; i++) {
      var price = ps.hi - (ps.hi - ps.lo) * i / ticks;
      var y = layout.mainTop + (layout.mainBottom - layout.mainTop) * i / ticks;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(fmt(price), LEFT_MARGIN - 8, y);
    }
  }

  function drawTimeAxis(ctx, start, end, barW, layout) {
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var n = 7;
    var span = end - start;
    var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
    var labelStep = Math.max(1, Math.ceil(span / n));
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i < n; i++) {
      var idx = start + i * labelStep;
      if (idx >= state.bars.length) break;
      var x = LEFT_MARGIN + w * (idx - state.viewStart) / state.viewBars;
      ctx.beginPath(); ctx.moveTo(x, layout.mainTop); ctx.lineTo(x, state.height); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(TL.utils.fmtTimeShort(state.bars[idx].time, state.tf), x, layout.timeY);
    }
  }

  function drawCandle(ctx, i, ps, layout, barW, bodyW) {
    var b = state.bars[i];
    var x = xFor(i) + barW / 2;
    var up = b.close >= b.open;
    var color = up ? COLORS.up : COLORS.down;
    var yHigh = yFor(b.high, ps);
    var yLow = yFor(b.low, ps);
    var yOpen = yFor(b.open, ps);
    var yClose = yFor(b.close, ps);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    var top = Math.min(yOpen, yClose);
    var h = Math.max(1, Math.abs(yOpen - yClose));
    ctx.fillStyle = color;
    ctx.fillRect(x - bodyW / 2, top, bodyW, h);
  }

  function drawMA(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var ind = state.analysis && state.analysis.indicators;
    if (!ind) return;
    var series = [
      { arr: ind.ema9, on: o.ema9, color: COLORS.ema[9], label: 'EMA9' },
      { arr: ind.ema21, on: o.ema21, color: COLORS.ema[21], label: 'EMA21' },
      { arr: ind.ema50, on: o.ema50, color: COLORS.ema[50], label: 'EMA50' },
      { arr: ind.ema200, on: o.ema200, color: COLORS.ema[200], label: 'EMA200' },
      { arr: ind.sma20, on: o.sma20, color: COLORS.sma, label: 'SMA20' }
    ];
    ctx.lineWidth = 1.4;
    for (var s = 0; s < series.length; s++) {
      if (!series[s].on || !series[s].arr) continue;
      ctx.strokeStyle = series[s].color;
      ctx.beginPath();
      var started = false;
      for (var i = start; i < end; i++) {
        var v = series[s].arr[i];
        if (v == null) continue;
        var x = xFor(i) + barW / 2;
        var y = yFor(v, ps);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawBB(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var ind = state.analysis && state.analysis.indicators;
    if (!o.bb || !ind || !ind.bb) return;
    ctx.strokeStyle = COLORS.bb;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    var bands = [ind.bb.upper, ind.bb.middle, ind.bb.lower];
    for (var b = 0; b < bands.length; b++) {
      ctx.beginPath();
      var started = false;
      for (var i = start; i < end; i++) {
        if (bands[b][i] == null) continue;
        var x = xFor(i) + barW / 2, y = yFor(bands[b][i], ps);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawVWAP(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var ind = state.analysis && state.analysis.indicators;
    if (!o.vwap || !ind || !ind.vwap) return;
    ctx.strokeStyle = COLORS.vwap;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    var started = false;
    for (var i = start; i < end; i++) {
      if (ind.vwap[i] == null) continue;
      var x = xFor(i) + barW / 2, y = yFor(ind.vwap[i], ps);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawZones(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var smc = state.analysis && state.analysis.smc;
    if (!smc) return;
    var x0 = LEFT_MARGIN, x1 = state.width - RIGHT_MARGIN;
    if (o.supply) {
      for (var i = 0; i < smc.supply.length; i++) {
        var z = smc.supply[i];
        var yTop = yFor(z.top, ps), yBot = yFor(z.bottom, ps);
        if (yTop > layout.mainBottom || yBot < layout.mainTop) continue;
        ctx.fillStyle = COLORS.supplyFill;
        ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
        ctx.strokeStyle = COLORS.supply;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, yTop, x1 - x0, yBot - yTop);
        ctx.fillStyle = COLORS.supply;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('SUPPLY', x0 + 4, yTop - 2);
      }
    }
    if (o.demand) {
      for (var j = 0; j < smc.demand.length; j++) {
        var d = smc.demand[j];
        var yT = yFor(d.top, ps), yB = yFor(d.bottom, ps);
        if (yT > layout.mainBottom || yB < layout.mainTop) continue;
        ctx.fillStyle = COLORS.demandFill;
        ctx.fillRect(x0, yT, x1 - x0, yB - yT);
        ctx.strokeStyle = COLORS.demand;
        ctx.strokeRect(x0, yT, x1 - x0, yB - yT);
        ctx.fillStyle = COLORS.demand;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('DEMAND', x0 + 4, yB + 2);
      }
    }
  }

  function drawFVG(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var smc = state.analysis && state.analysis.smc;
    if (!o.fvg || !smc) return;
    for (var i = 0; i < smc.fvg.length; i++) {
      var g = smc.fvg[i];
      if (g.i < start - 1 || g.i > end) continue;
      var x0 = xFor(g.i);
      var x1 = xFor(Math.min(g.i + 3, state.bars.length - 1));
      var yTop = yFor(g.top, ps), yBot = yFor(g.bottom, ps);
      if (yTop > layout.mainBottom || yBot < layout.mainTop) continue;
      ctx.fillStyle = g.type === 'bull' ? COLORS.fvgBull : COLORS.fvgBear;
      ctx.fillRect(x0, yTop, Math.max(4, x1 - x0), yBot - yTop);
      ctx.fillStyle = g.type === 'bull' ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('FVG', x0 + 2, yTop + 8);
    }
  }

  function drawOrderBlocks(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var smc = state.analysis && state.analysis.smc;
    if (!o.orderBlocks || !smc) return;
    for (var i = 0; i < smc.orderBlocks.length; i++) {
      var ob = smc.orderBlocks[i];
      if (ob.baseI < start - 1 || ob.baseI > end) continue;
      var x0 = xFor(ob.baseI);
      var x1 = state.width - RIGHT_MARGIN;
      var yTop = yFor(ob.top, ps), yBot = yFor(ob.bottom, ps);
      if (yTop > layout.mainBottom || yBot < layout.mainTop) continue;
      ctx.fillStyle = ob.type === 'bull' ? COLORS.obBull : COLORS.obBear;
      ctx.fillRect(x0, yTop, Math.max(6, x1 - x0), yBot - yTop);
      ctx.strokeStyle = ob.type === 'bull' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
      ctx.strokeRect(x0, yTop, Math.max(6, x1 - x0), yBot - yTop);
      ctx.fillStyle = ob.type === 'bull' ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(ob.type === 'bull' ? 'OB+' : 'OB−', x0 + 2, yTop + 8);
    }
  }

  function drawSR(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var smc = state.analysis && state.analysis.smc;
    if (!o.sr || !smc) return;
    ctx.setLineDash([6, 4]);
    for (var i = 0; i < smc.sr.length; i++) {
      var l = smc.sr[i];
      var y = yFor(l.price, ps);
      if (y < layout.mainTop || y > layout.mainBottom) continue;
      ctx.strokeStyle = COLORS.sr;
      ctx.lineWidth = l.major ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(LEFT_MARGIN, y);
      ctx.lineTo(state.width - RIGHT_MARGIN, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.textBright;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText((l.type === 'resistance' ? 'R' : 'S') + '(' + l.touches + ')', state.width - RIGHT_MARGIN - 4, y - 1);
    }
    ctx.setLineDash([]);
  }

  function drawPivots(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var ind = state.analysis && state.analysis.indicators;
    if (!o.pivots || !ind || !ind.pivots) return;
    var pv = ind.pivots;
    var rows = [
      { p: pv.r3, l: 'R3' }, { p: pv.r2, l: 'R2' }, { p: pv.r1, l: 'R1' },
      { p: pv.p, l: 'P' }, { p: pv.s1, l: 'S1' }, { p: pv.s2, l: 'S2' }, { p: pv.s3, l: 'S3' }
    ];
    ctx.setLineDash([2, 4]);
    for (var i = 0; i < rows.length; i++) {
      var y = yFor(rows[i].p, ps);
      if (y < layout.mainTop || y > layout.mainBottom) continue;
      ctx.strokeStyle = COLORS.pivot;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(state.width - RIGHT_MARGIN, y); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('P ' + rows[i].l, LEFT_MARGIN + 4, y - 1);
    }
    ctx.setLineDash([]);
  }

  function drawFib(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var fib = state.analysis && state.analysis.fib;
    if (!o.fib || !fib) return;
    ctx.setLineDash([3, 3]);
    for (var i = 0; i < fib.ret.length; i++) {
      var y = yFor(fib.ret[i].price, ps);
      if (y < layout.mainTop || y > layout.mainBottom) continue;
      ctx.strokeStyle = 'rgba(232,232,180,0.6)';
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(state.width - RIGHT_MARGIN, y); ctx.stroke();
      ctx.fillStyle = 'rgba(232,232,180,0.9)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText((fib.ret[i].ratio * 100) + '%', LEFT_MARGIN + 4, y - 1);
    }
    for (var e = 0; e < fib.ext.length; e++) {
      var ye = yFor(fib.ext[e].price, ps);
      if (ye < layout.mainTop || ye > layout.mainBottom) continue;
      ctx.strokeStyle = 'rgba(180,220,232,0.5)';
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, ye); ctx.lineTo(state.width - RIGHT_MARGIN, ye); ctx.stroke();
      ctx.fillStyle = 'rgba(180,220,232,0.8)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText((fib.ext[e].ratio * 100) + '%', state.width - RIGHT_MARGIN - 4, ye - 1);
    }
    ctx.setLineDash([]);
  }

  function drawSwings(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var smc = state.analysis && state.analysis.smc;
    if (!smc) return;
    if (o.swings) {
      for (var i = 0; i < smc.swings.highs.length; i++) {
        var s = smc.swings.highs[i];
        if (s.i < start || s.i > end) continue;
        var x = xFor(s.i) + barW / 2, y = yFor(s.price, ps);
        ctx.fillStyle = COLORS.down;
        drawTriangle(ctx, x, y, 4, 'down');
      }
      for (var j = 0; j < smc.swings.lows.length; j++) {
        var l = smc.swings.lows[j];
        if (l.i < start || l.i > end) continue;
        var xl = xFor(l.i) + barW / 2, yl = yFor(l.price, ps);
        ctx.fillStyle = COLORS.up;
        drawTriangle(ctx, xl, yl, 4, 'up');
      }
    }
    if (o.structure) {
      for (var k = 0; k < smc.structure.length; k++) {
        var st = smc.structure[k];
        if (st.i < start || st.i > end) continue;
        var xs = xFor(st.i) + barW / 2;
        var ys = yFor(st.price, ps) + (st.swing === 'high' ? -10 : 12);
        ctx.fillStyle = st.type === 'HH' || st.type === 'HL' ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(st.type, xs, ys);
      }
    }
  }

  function drawTriangle(ctx, x, y, r, dir) {
    ctx.beginPath();
    if (dir === 'down') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x, y + r); }
    else { ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.lineTo(x, y - r); }
    ctx.closePath();
    ctx.fill();
  }

  function drawBOS(ctx, ps, layout, start, end, barW) {
    var o = TL.store.get().overlays;
    var smc = state.analysis && state.analysis.smc;
    if (!o.bos || !smc) return;
    for (var i = 0; i < smc.bos.length; i++) {
      var b = smc.bos[i];
      if (b.i < start || b.i > end) continue;
      var x = xFor(b.i) + barW / 2;
      var y = yFor(b.price, ps) + (b.dir === 'bull' ? 8 : -8);
      ctx.fillStyle = b.dir === 'bull' ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.dir === 'bull' ? 'BOS ▲' : 'BOS ▼', x, y);
    }
  }

  function drawVP(ctx, ps, layout, start, end, barW) {
    var vp = state.analysis.vp;
    if (!vp) return;
    var x1 = state.width - RIGHT_MARGIN;
    var maxVol = 0;
    for (var i = 0; i < vp.bins.length; i++) maxVol = Math.max(maxVol, vp.bins[i].volume);
    if (!maxVol) return;
    var widthPx = Math.max(20, Math.min(90, vp.width || 60));
    for (var j = 0; j < vp.bins.length; j++) {
      var b = vp.bins[j];
      var yTop = yFor(b.price + (vp.bins[1].price - vp.bins[0].price) / 2, ps);
      var yBot = yFor(b.price - (vp.bins[1].price - vp.bins[0].price) / 2, ps);
      if (yTop > layout.mainBottom || yBot < layout.mainTop) continue;
      var wpx = (b.volume / maxVol) * widthPx;
      ctx.fillStyle = COLORS.vp;
      ctx.fillRect(x1 - wpx, yTop, wpx, Math.max(1, yBot - yTop));
    }
    // POC / VAH / VAL markers
    ctx.strokeStyle = 'rgba(56,189,248,0.9)';
    ctx.setLineDash([2, 3]);
    [['POC', vp.poc], ['VAH', vp.vah], ['VAL', vp.val]].forEach(function (m) {
      var y = yFor(m[1], ps);
      if (y < layout.mainTop || y > layout.mainBottom) return;
      ctx.beginPath(); ctx.moveTo(x1 - widthPx - 2, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = 'rgba(125,211,252,0.95)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(m[0], x1 - widthPx - 4, y - 2);
    });
    ctx.setLineDash([]);
  }

  function drawTrade(ctx, ps, layout, start, end, barW) {
    var plan = state.tradePlan;
    if (!plan) return;
    var x0 = LEFT_MARGIN, x1 = state.width - RIGHT_MARGIN;
    var riskLo = Math.min(plan.entry, plan.sl);
    var riskHi = Math.max(plan.entry, plan.sl);
    var yE = yFor(plan.entry, ps), yS = yFor(plan.sl, ps);
    // entry/SL band shading
    ctx.fillStyle = 'rgba(148,163,184,0.06)';
    ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yE - yS));
    // reward shading (entry → TP1)
    if (plan.tp1) {
      var yT1 = yFor(plan.tp1.price, ps);
      ctx.fillStyle = 'rgba(34,197,94,0.07)';
      ctx.fillRect(x0, Math.min(yE, yT1), x1 - x0, Math.abs(yE - yT1));
    }
    // entry line
    ctx.strokeStyle = COLORS.entry;
    ctx.lineWidth = 1.6;
    line(ctx, x0, yE, x1, yE);
    label(ctx, 'ENTRY ' + TL.utils.fmtPrice(plan.entry, state.asset), x1 - 4, yE - 3, 'right', COLORS.entry);
    // SL line
    ctx.strokeStyle = COLORS.sl;
    ctx.setLineDash([5, 4]);
    line(ctx, x0, yS, x1, yS);
    label(ctx, 'SL ' + TL.utils.fmtPrice(plan.sl, state.asset), x1 - 4, yS - 3, 'right', COLORS.sl);
    ctx.setLineDash([]);
    // TPs
    var tps = [plan.tp1, plan.tp2, plan.tp3];
    var showTp2 = TL.store.get().tools.trade.showTP2;
    var showTp3 = TL.store.get().tools.trade.showTP3;
    for (var t = 0; t < tps.length; t++) {
      if (!tps[t]) continue;
      if (t === 1 && !showTp2) continue;
      if (t === 2 && !showTp3) continue;
      var y = yFor(tps[t].price, ps);
      ctx.strokeStyle = COLORS.tp;
      ctx.setLineDash([3, 3]);
      line(ctx, x0, y, x1, y);
      label(ctx, 'TP' + (t + 1) + ' ' + TL.utils.fmtPrice(tps[t].price, state.asset) + ' (' + tps[t].rr.toFixed(1) + 'R)', x1 - 4, y - 3, 'right', COLORS.tp);
      ctx.setLineDash([]);
    }
  }

  function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

  function label(ctx, text, x, y, align, color) {
    ctx.fillStyle = color;
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = align || 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, x, y);
  }

  function drawVolumePane(ctx, layout, start, end, barW, bodyW) {
    var o = TL.store.get().overlays;
    if (!o.volume) { clearPane(ctx, layout.volTop, layout.volBottom); return; }
    clearPane(ctx, layout.volTop, layout.volBottom);
    var maxV = 0;
    for (var i = start; i < end; i++) maxV = Math.max(maxV, state.bars[i].volume || 0);
    if (!maxV) return;
    var h = layout.volBottom - layout.volTop;
    for (var j = start; j < end; j++) {
      var b = state.bars[j];
      var x = xFor(j) + barW / 2;
      var vh = ((b.volume || 0) / maxV) * (h - 4);
      var y = layout.volBottom - vh - 2;
      ctx.fillStyle = b.close >= b.open ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)';
      ctx.fillRect(x - bodyW / 2, y, Math.max(1, bodyW), vh);
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('VOL', LEFT_MARGIN + 2, layout.volTop + 9);
  }

  function clearPane(ctx, y0, y1) {
    ctx.fillStyle = COLORS.paneBg;
    ctx.fillRect(LEFT_MARGIN, y0, state.width - LEFT_MARGIN - RIGHT_MARGIN, y1 - y0);
  }

  function drawIndicatorPane(ctx, layout, start, end, barW) {
    clearPane(ctx, layout.indTop, layout.indBottom);
    var ind = state.analysis && state.analysis.indicators;
    if (!ind) return;
    var h = layout.indBottom - layout.indTop;
    var name = state.indicator || 'RSI';
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, layout.indTop); ctx.lineTo(state.width - RIGHT_MARGIN, layout.indTop); ctx.stroke();

    function yVal(v, lo, hi) { return layout.indTop + h * (1 - (v - lo) / (hi - lo)); }

    if (name === 'RSI') {
      drawIndScale(ctx, layout, 0, 100, ['30', '50', '70']);
      [30, 70].forEach(function (lv) {
        ctx.strokeStyle = 'rgba(148,163,184,0.4)';
        ctx.setLineDash([3, 3]);
        line(ctx, LEFT_MARGIN, yVal(lv, 0, 100), state.width - RIGHT_MARGIN, yVal(lv, 0, 100));
        ctx.setLineDash([]);
      });
      drawSeries(ctx, ind.rsi, start, end, barW, yVal, 0, 100, '#a78bfa', 1.4);
    } else if (name === 'MACD') {
      var macd = ind.macd;
      var lo = Infinity, hi = -Infinity;
      for (var i = start; i < end; i++) {
        [macd.macd[i], macd.signal[i], macd.hist[i]].forEach(function (v) {
          if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
        });
      }
      if (!isFinite(lo)) { lo = -1; hi = 1; }
      var mid = yVal(0, lo, hi);
      ctx.strokeStyle = 'rgba(148,163,184,0.5)';
      line(ctx, LEFT_MARGIN, mid, state.width - RIGHT_MARGIN, mid);
      // histogram
      for (var j = start; j < end; j++) {
        var hv = macd.hist[j];
        if (hv == null) continue;
        var x = xFor(j) + barW / 2;
        var y0 = yVal(0, lo, hi), y1 = yVal(hv, lo, hi);
        ctx.fillStyle = hv >= 0 ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
        ctx.fillRect(x - 1, Math.min(y0, y1), 2, Math.abs(y1 - y0));
      }
      drawSeries(ctx, macd.macd, start, end, barW, yVal, lo, hi, '#38bdf8', 1.2);
      drawSeries(ctx, macd.signal, start, end, barW, yVal, lo, hi, '#f59e0b', 1.2);
    } else if (name === 'STOCH') {
      drawIndScale(ctx, layout, 0, 100, ['20', '50', '80']);
      [20, 80].forEach(function (lv) {
        ctx.strokeStyle = 'rgba(148,163,184,0.4)';
        ctx.setLineDash([3, 3]);
        line(ctx, LEFT_MARGIN, yVal(lv, 0, 100), state.width - RIGHT_MARGIN, yVal(lv, 0, 100));
        ctx.setLineDash([]);
      });
      drawSeries(ctx, ind.stoch.k, start, end, barW, yVal, 0, 100, '#38bdf8', 1.2);
      drawSeries(ctx, ind.stoch.d, start, end, barW, yVal, 0, 100, '#f59e0b', 1.2);
    }

    ctx.fillStyle = COLORS.text;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(name, LEFT_MARGIN + 2, layout.indTop + 9);
  }

  function drawIndScale(ctx, layout, lo, hi, labels) {
    ctx.fillStyle = COLORS.text;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    var h = layout.indBottom - layout.indTop;
    for (var i = 0; i < labels.length; i++) {
      var v = parseFloat(labels[i]);
      var y = layout.indTop + h * (1 - (v - lo) / (hi - lo));
      ctx.fillText(labels[i], state.width - RIGHT_MARGIN + 6, y + 3);
    }
  }

  function drawSeries(ctx, arr, start, end, barW, yVal, lo, hi, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.2;
    ctx.beginPath();
    var started = false;
    for (var i = start; i < end; i++) {
      if (arr[i] == null) continue;
      var x = xFor(i) + barW / 2;
      var y = yVal(arr[i], lo, hi);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawCrosshair(ctx, ps, layout, start, end, barW) {
    if (!state.mouse) { if (state.tooltipEl) state.tooltipEl.style.display = 'none'; return; }
    var mx = state.mouse.x, my = state.mouse.y;
    var w = state.width - LEFT_MARGIN - RIGHT_MARGIN;
    var inMain = mx >= LEFT_MARGIN && mx <= state.width - RIGHT_MARGIN && my >= layout.mainTop && my <= layout.mainBottom;

    var idx = Math.round(state.viewStart + (mx - LEFT_MARGIN) / barW);
    idx = TL.utils.clamp(idx, 0, state.bars.length - 1);

    ctx.strokeStyle = COLORS.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    // vertical
    var xc = xFor(idx) + barW / 2;
    ctx.beginPath(); ctx.moveTo(xc, layout.mainTop); ctx.lineTo(xc, layout.volBottom); ctx.stroke();
    // horizontal on main
    if (inMain) {
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, my); ctx.lineTo(state.width - RIGHT_MARGIN, my); ctx.stroke();
    }
    ctx.setLineDash([]);

    // price tag on axis
    var priceAt = ps.hi - (my - layout.mainTop) / (layout.mainBottom - layout.mainTop) * (ps.hi - ps.lo);
    if (inMain) {
      ctx.fillStyle = '#111827';
      ctx.fillRect(2, my - 9, LEFT_MARGIN - 4, 18);
      ctx.strokeStyle = COLORS.crosshair;
      ctx.strokeRect(2, my - 9, LEFT_MARGIN - 4, 18);
      ctx.fillStyle = COLORS.textBright;
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(TL.utils.fmtPrice(priceAt, state.asset), 6, my);
    }

    // tooltip
    if (state.tooltipEl) {
      var bar = state.bars[idx];
      if (bar) {
        state.tooltipEl.style.display = 'block';
        state.tooltipEl.innerHTML =
          '<div class="tt-time">' + TL.utils.fmtTime(bar.time, state.tf) + '</div>' +
          '<div class="tt-row"><span>O</span>' + TL.utils.fmtPrice(bar.open, state.asset) + '</div>' +
          '<div class="tt-row"><span>H</span>' + TL.utils.fmtPrice(bar.high, state.asset) + '</div>' +
          '<div class="tt-row"><span>L</span>' + TL.utils.fmtPrice(bar.low, state.asset) + '</div>' +
          '<div class="tt-row"><span>C</span>' + TL.utils.fmtPrice(bar.close, state.asset) + '</div>' +
          '<div class="tt-row"><span>V</span>' + TL.utils.fmtInt(bar.volume) + '</div>';
        var tx = mx + 16, ty = my + 12;
        var rect = state.canvas.getBoundingClientRect();
        if (tx + 150 > rect.width) tx = mx - 160;
        if (ty + 120 > rect.height) ty = my - 120;
        state.tooltipEl.style.left = tx + 'px';
        state.tooltipEl.style.top = ty + 'px';
      }
    }
  }

  function updateLegend() {
    if (!state.legendEl || !state.analysis) return;
    var l = state.analysis.indicators.last;
    var price = state.analysis.price;
    var items = [];
    items.push(['Last', TL.utils.fmtPrice(price, state.asset)]);
    if (l.ema9 != null) items.push(['EMA9', TL.utils.fmtPrice(l.ema9, state.asset)]);
    if (l.ema21 != null) items.push(['EMA21', TL.utils.fmtPrice(l.ema21, state.asset)]);
    if (l.ema50 != null) items.push(['EMA50', TL.utils.fmtPrice(l.ema50, state.asset)]);
    if (l.vwap != null) items.push(['VWAP', TL.utils.fmtPrice(l.vwap, state.asset)]);
    if (l.rsi != null) items.push(['RSI', l.rsi.toFixed(1)]);
    if (l.atr != null) items.push(['ATR', TL.utils.fmtPrice(l.atr, state.asset)]);
    state.legendEl.innerHTML = items.map(function (it) {
      return '<span class="lg"><i>' + TL.utils.esc(it[0]) + '</i> <b>' + TL.utils.esc(it[1]) + '</b></span>';
    }).join('');
  }

  var api = {
    init: init,
    setData: setData,
    setAnalysis: setAnalysis,
    setTradePlan: setTradePlan,
    setIndicator: setIndicator,
    fit: fit,
    oneToOne: oneToOne,
    panBars: panBars,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    redraw: requestDraw,
    resize: resize,
    getState: function () { return state; }
  };

  return api;
})();
