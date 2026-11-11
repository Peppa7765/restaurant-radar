/* ==========================================================================
   避雷吧 · 高分餐厅避雷地图
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var MAP_W = 390, MAP_H = 732;
  var BBOX = { minLng: 121.34, maxLng: 121.58, minLat: 31.09, maxLat: 31.33 };

  var TAGS = ['排队久', '口味一般', '分量少', '服务差', '卫生堪忧', '价格虚高', '预制菜', '环境吵', '疑似刷分'];
  var STAR_HINT = { 1: '1 星 · 踩大雷', 2: '2 星 · 不太行', 3: '3 星 · 一般般', 4: '4 星 · 还不错', 5: '5 星 · 会再来' };

  /* ---------------- 本地存储 ---------------- */
  var KEY = 'avoid-radar.v1';

  function loadStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var obj = JSON.parse(raw) || {};
        return {
          saved: obj.saved || [],
          myReports: obj.myReports || [],
          extraPlaces: obj.extraPlaces || [],
          alerts: obj.alerts !== false
        };
      }
    } catch (e) { /* 忽略隐私模式下的存储异常 */ }
    return { saved: [], myReports: [], extraPlaces: [], alerts: true };
  }

  var store = loadStore();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* noop */ }
  }

  /* ---------------- 状态 ---------------- */
  var state = {
    view: 'map',
    filter: 'all',
    query: '',
    heat: false,
    selected: null,
    sort: 'gap'
  };

  var form = {
    cuisine: 'bbq',
    area: '静安寺',
    rating: 2,
    tags: [],
    anon: true
  };

  var t = { s: 1, x: 0, y: 0 };

  var BASE_KEY = 'avoid-radar.base';
  var base = { mode: 'schematic', tmap: null, loading: null, tiles: false, failed: false };

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function todayStr() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }

  function project(lat, lng) {
    return {
      x: 20 + (lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng) * 350,
      y: 20 + (BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat) * 692
    };
  }

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---------------- 指标 ---------------- */
  function allPlaces() {
    return PLACES.concat(store.extraPlaces || []);
  }

  function getPlace(id) {
    return allPlaces().filter(function (p) { return p.id === id; })[0] || null;
  }

  /* 用户新增记录对避雷指数的影响 */
  function scoreOf(p) {
    var extra = 0;
    (p.records || []).forEach(function (r) {
      if (!r.mine) return;
      extra += (5 - r.rating) * 3 + (r.tags ? r.tags.length * 1.6 : 0);
    });
    return clamp(Math.round((p.heat || 50) + extra), 8, 99);
  }

  function recOf(p) { return 100 - scoreOf(p); }

  function gapOf(p) { return Math.round(p.rating * 20 - recOf(p)); }

  function verdictOf(score) {
    if (score >= 75) return VERDICTS.avoid;
    if (score >= 55) return VERDICTS.caution;
    return VERDICTS.ok;
  }

  function cuisineAvg(p) {
    var peers = allPlaces().filter(function (x) { return x.cuisine === p.cuisine && x.id !== p.id; });
    if (!peers.length) peers = allPlaces().filter(function (x) { return x.id !== p.id; });
    var sum = peers.reduce(function (a, x) { return a + scoreOf(x); }, 0);
    return Math.round(sum / Math.max(1, peers.length));
  }

  function totalReviews(p) {
    return (p.reviews || 0) + (p.records || []).filter(function (r) { return r.mine; }).length;
  }

  function starStr(n) {
    var full = Math.round(n);
    var s = '';
    for (var i = 0; i < 5; i++) s += i < full ? '★' : '☆';
    return s;
  }

  function visiblePlaces() {
    var q = state.query.trim().toLowerCase();
    return allPlaces().filter(function (p) {
      if (state.filter !== 'all' && p.cuisine !== state.filter) return false;
      if (q) {
        var hay = (p.name + ' ' + p.area + ' ' + p.address + ' ' + CUISINES[p.cuisine].label).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortedPlaces() {
    var arr = visiblePlaces().slice();
    if (state.sort === 'rating') {
      arr.sort(function (a, b) { return b.rating - a.rating || scoreOf(b) - scoreOf(a); });
    } else if (state.sort === 'heat') {
      arr.sort(function (a, b) { return scoreOf(b) - scoreOf(a); });
    } else {
      arr.sort(function (a, b) { return gapOf(b) - gapOf(a); });
    }
    return arr;
  }

  /* ---------------- 地图 ---------------- */
  function layoutPins(list) {
    var pts = list.map(function (p) {
      var xy = project(p.lat, p.lng);
      return { p: p, x: xy.x, y: xy.y };
    });

    for (var iter = 0; iter < 90; iter++) {
      var moved = false;
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          var dx = pts[j].x - pts[i].x;
          var dy = pts[j].y - pts[i].y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var min = 33;
          if (d < min) {
            var push = (min - d) / 2 + 0.2;
            dx /= d; dy /= d;
            pts[i].x -= dx * push; pts[i].y -= dy * push;
            pts[j].x += dx * push; pts[j].y += dy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    pts.forEach(function (o) {
      o.x = clamp(o.x, 20, MAP_W - 20);
      o.y = clamp(o.y, 172, MAP_H - 96);
    });
    return pts;
  }

  function isTencent() {
    return base.mode === 'tencent' && !!base.tmap;
  }

  function projectToMap(p) {
    try {
      var pt = base.tmap.projectToContainer(new TMap.LatLng(p.lat, p.lng));
      return { x: pt.x, y: pt.y };
    } catch (e) {
      return { x: -9999, y: -9999 };
    }
  }

  function relaxPoints(pts, min, iterations) {
    for (var iter = 0; iter < iterations; iter++) {
      var moved = false;
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          var dx = pts[j].x - pts[i].x;
          var dy = pts[j].y - pts[i].y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (d < min) {
            var push = (min - d) / 2 + 0.2;
            dx /= d; dy /= d;
            pts[i].x -= dx * push; pts[i].y -= dy * push;
            pts[j].x += dx * push; pts[j].y += dy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return pts;
  }

  /* 真实底图上点更密：按屏幕像素做一次避让，缩放时自然拉开 */
  function screenPoints(list) {
    var pts = list.map(function (p) {
      var xy = projectToMap(p);
      return { p: p, x: xy.x, y: xy.y };
    });
    return relaxPoints(pts, 36, 40);
  }

  function renderPins() {
    if (base.mode === 'tencent' && !base.tmap) return;
    var tencent = isTencent();
    var layer = tencent ? $('#tmapPins') : $('#pinLayer');
    layer.innerHTML = '';
    var list = visiblePlaces();
    var pts = tencent ? screenPoints(list) : layoutPins(list);

    list.forEach(function (p, i) {
      var score = scoreOf(p);
      var v = verdictOf(score);
      var wrap = document.createElement('div');
      wrap.className = 'pin-wrap';
      wrap.setAttribute('data-id', p.id);

      if (tencent) {
        wrap.style.left = pts[i].x + 'px';
        wrap.style.top = pts[i].y + 'px';
      } else {
        wrap.style.left = (pts[i].x / MAP_W * 100) + '%';
        wrap.style.top = (pts[i].y / MAP_H * 100) + '%';
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pin lvl-' + v.cls + (state.selected === p.id ? ' is-selected' : '');
      btn.setAttribute('data-action', 'place');
      btn.setAttribute('data-id', p.id);
      btn.setAttribute('aria-label', p.name + ' 避雷指数 ' + score);
      btn.textContent = score;
      wrap.appendChild(btn);
      layer.appendChild(wrap);
    });
    renderHeat();
  }

  function renderHeat() {
    var tencent = isTencent();
    var layer = tencent ? $('#tmapHeat') : $('#heatLayer');
    layer.innerHTML = '';
    if (!state.heat) return;
    var rgb = { high: '196,58,36', mid: '196,138,30', low: '53,110,78' };
    var list = visiblePlaces();
    var pts = tencent ? screenPoints(list) : layoutPins(list);

    list.forEach(function (p, i) {
      var score = scoreOf(p);
      var v = verdictOf(score);
      var size = 70 + Math.min(70, score * 0.85);
      var el = document.createElement('div');
      el.className = 'heat-blob';
      el.setAttribute('data-id', p.id);

      if (tencent) {
        el.style.left = pts[i].x + 'px';
        el.style.top = pts[i].y + 'px';
      } else {
        el.style.left = (pts[i].x / MAP_W * 100) + '%';
        el.style.top = (pts[i].y / MAP_H * 100) + '%';
      }

      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.background = 'radial-gradient(circle, rgba(' + rgb[v.cls] + ',.8), rgba(' + rgb[v.cls] + ',0) 70%)';
      layer.appendChild(el);
    });
  }

  /* 腾讯地图拖动/缩放时，只更新覆盖层位置，不重建 DOM */
  function syncMapOverlays() {
    if (!isTencent()) return;
    var byId = {};
    screenPoints(visiblePlaces()).forEach(function (o) { byId[o.p.id] = o; });

    $$('#tmapPins .pin-wrap').forEach(function (w) {
      var o = byId[w.getAttribute('data-id')];
      if (!o) return;
      w.style.left = o.x + 'px';
      w.style.top = o.y + 'px';
    });
    $$('#tmapHeat .heat-blob').forEach(function (w) {
      var o = byId[w.getAttribute('data-id')];
      if (!o) return;
      w.style.left = o.x + 'px';
      w.style.top = o.y + 'px';
    });
  }

  function renderPreview() {
    var wrap = $('#previewWrap');
    if (!state.selected) {
      wrap.innerHTML = '<div class="map-hint"><span class="hint-dot"></span>轻点标记，查看避雷报告</div>';
      return;
    }
    var p = getPlace(state.selected);
    if (!p) { state.selected = null; renderPreview(); return; }
    var score = scoreOf(p);
    var v = verdictOf(score);
    var meta = CUISINES[p.cuisine].label + ' · ' + p.area + ' · 人均 ¥' + p.price + ' · 评分 ' + p.rating.toFixed(1);
    wrap.innerHTML =
      '<button class="preview lvl-' + v.cls + '" data-action="place" data-id="' + p.id + '">' +
        '<span class="p-stripe"></span>' +
        '<span class="p-main">' +
          '<span class="p-row"><span class="p-name">' + esc(p.name) + '</span>' +
            '<span class="risk-tag">' + v.label + '</span></span>' +
          '<span class="p-meta">' + esc(meta) + '</span>' +
        '</span>' +
        '<span class="p-score">' + score + '</span>' +
      '</button>';
  }

  function selectPlace(id) {
    state.selected = id;
    renderPins();
    renderPreview();
  }

  function clearSelection() {
    if (!state.selected) return;
    state.selected = null;
    renderPins();
    renderPreview();
  }

  /* ---------------- 地图变换 ---------------- */
  function setTransform(x, y, s) {
    s = clamp(s, 1, 2.8);
    var w = MAP_W, h = MAP_H;
    t = { s: s, x: clamp(x, w - w * s, 0), y: clamp(y, h - h * s, 0) };
    var layer = $('#mapLayer');
    layer.style.transform = 'translate3d(' + t.x + 'px,' + t.y + 'px,0) scale(' + t.s + ')';
    layer.style.setProperty('--inv', String(1 / t.s));
  }

  function zoomAt(cx, cy, s) {
    s = clamp(s, 1, 2.8);
    var px = (cx - t.x) / t.s;
    var py = (cy - t.y) / t.s;
    setTransform(cx - px * s, cy - py * s, s);
  }

  function setupMap() {
    var canvas = $('#mapCanvas');
    var pointers = new Map();
    var drag = null;
    var pinch = null;

    function d2(a, b) {
      var dx = a.x - b.x, dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (isTencent()) return;
      if (e.target.closest('.map-top') || e.target.closest('.map-controls') || e.target.closest('.preview-wrap')) return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false, target: e.target };
      } else if (pointers.size === 2) {
        drag = null;
        var pts = Array.from(pointers.values());
        pinch = { d: d2(pts[0], pts[1]), s: t.s, tx: t.x, ty: t.y, cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinch && pointers.size === 2) {
        var pts = Array.from(pointers.values());
        var rect = canvas.getBoundingClientRect();
        var d = d2(pts[0], pts[1]);
        var mx = (pts[0].x + pts[1].x) / 2 - rect.left;
        var my = (pts[0].y + pts[1].y) / 2 - rect.top;
        var s = clamp(pinch.s * d / pinch.d, 1, 2.8);
        var px = (pinch.cx - rect.left - pinch.tx) / pinch.s;
        var py = (pinch.cy - rect.top - pinch.ty) / pinch.s;
        setTransform(mx - px * s, my - py * s, s);
        return;
      }

      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
        canvas.classList.add('dragging');
      }
      setTransform(drag.tx + dx, drag.ty + dy, t.s);
    });

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (e.type === 'pointerup' && drag && !drag.moved) {
        var el = drag.target;
        var hit = el && el.closest && (el.closest('.pin') || el.closest('button') || el.closest('.preview'));
        if (!hit) clearSelection();
      }
      if (e.type === 'pointerup') {
        drag = null;
        canvas.classList.remove('dragging');
      }
      if (pointers.size === 0) drag = null;
    }

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('wheel', function (e) {
      if (isTencent()) return;
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var s = clamp(t.s * Math.exp(-e.deltaY * 0.0018), 1, 2.8);
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, s);
    }, { passive: false });

    canvas.addEventListener('dblclick', function (e) {
      if (isTencent()) return;
      var rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.min(2.8, t.s * 1.6));
    });

    $('[data-action="zoom-in"]').addEventListener('click', function () {
      if (isTencent()) { base.tmap.setZoom(base.tmap.getZoom() + 1); return; }
      zoomAt(MAP_W / 2, MAP_H / 2, t.s * 1.4);
    });
    $('[data-action="zoom-out"]').addEventListener('click', function () {
      if (isTencent()) { base.tmap.setZoom(base.tmap.getZoom() - 1); return; }
      zoomAt(MAP_W / 2, MAP_H / 2, t.s / 1.4);
    });
    $('[data-action="locate"]').addEventListener('click', function () {
      if (isTencent()) {
        var cfg = window.APP_CONFIG || {};
        var c = cfg.CENTER || { lat: 31.235, lng: 121.452 };
        base.tmap.setCenter(new TMap.LatLng(c.lat, c.lng));
        base.tmap.setZoom(cfg.ZOOM || 11.5);
        toast('已回到上海市中心');
        return;
      }
      setTransform(0, 0, 1);
      toast('已回到静安寺附近 · 演示定位');
    });
    $('[data-action="heat"]').addEventListener('click', function () {
      state.heat = !state.heat;
      this.setAttribute('aria-pressed', state.heat ? 'true' : 'false');
      renderHeat();
      toast(state.heat ? '避雷热力图已开启' : '避雷热力图已关闭');
    });
  }

  /* ---------------- 腾讯地图 ---------------- */
  function showMapNotice(text) {
    var el = $('#mapNotice');
    if (!el) return;
    $('#mapNoticeText').textContent = text;
    el.hidden = false;
  }

  function loadTencentScript() {
    if (window.TMap) return Promise.resolve();
    if (base.loading) return base.loading;

    var cfg = window.APP_CONFIG || {};
    var key = cfg.TENCENT_MAP_KEY;
    if (!key) return Promise.reject(new Error('未配置 Key'));

    var p = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://map.qq.com/api/gljs?v=' + (cfg.TENCENT_MAP_VERSION || '1.exp') +
        '&key=' + encodeURIComponent(key);
      s.async = true;
      var settled = false;
      s.onload = function () {
        settled = true;
        if (window.TMap) resolve();
        else reject(new Error('脚本已返回，但 TMap 未注册（Key 可能无效）'));
      };
      s.onerror = function () {
        if (settled) return;
        reject(new Error('脚本被拦截或网络不可达'));
      };
      document.head.appendChild(s);
      setTimeout(function () {
        if (!settled && !window.TMap) reject(new Error('加载超时'));
      }, 12000);
    });

    base.loading = p;
    p.catch(function () { base.loading = null; });
    return p;
  }

  function initTencentMap() {
    return loadTencentScript().then(function () {
      if (base.tmap) return;
      var el = $('#tmap');
      if (!el) throw new Error('缺少地图容器');

      var cfg = window.APP_CONFIG || {};
      var center = cfg.CENTER || { lat: 31.235, lng: 121.452 };

      /* 容器初始是 hidden（display:none），直接构造会因尺寸为 0 失败。
         先临时显示，此时上面还盖着示意底图，不会闪。 */
      el.hidden = false;
      var map;
      try {
        map = new TMap.Map(el, {
          center: new TMap.LatLng(center.lat, center.lng),
          zoom: cfg.ZOOM || 11.5,
          viewMode: '2D',
          showControl: false,
          baseMap: { type: 'vector' }
        });
      } catch (e) {
        el.hidden = true;
        throw e;
      }

      if (typeof map.projectToContainer !== 'function') {
        el.hidden = true;
        throw new Error('当前 API 版本不支持坐标投影');
      }

      base.tmap = map;

      var sync = function () { syncMapOverlays(); };
      ['bounds_changed', 'zoom', 'zoomend', 'idle', 'resize'].forEach(function (ev) {
        try { map.on(ev, sync); } catch (e) { /* 忽略不支持的事件名 */ }
      });
      try {
        map.on('click', function () { clearSelection(); });
        map.on('tilesloaded', function () {
          base.tiles = true;
          if (base.slow) {
            base.slow = false;
            $('#mapNotice').hidden = true;
          }
        });
      } catch (e) { /* noop */ }
    });
  }

  function fallbackToSchematic(reason) {
    base.failed = true;
    setBase('schematic');
    if (reason) showMapNotice(reason);
  }

  function setBase(mode) {
    var tencent = mode === 'tencent' && !!base.tmap;
    base.mode = tencent ? 'tencent' : 'schematic';

    $('#tmap').hidden = !tencent;
    $('#tmapHeat').hidden = !tencent;
    $('#tmapPins').hidden = !tencent;
    $('#mapLayer').style.display = tencent ? 'none' : '';
    $('#baseBtn').setAttribute('aria-pressed', tencent ? 'true' : 'false');
    document.body.setAttribute('data-base', tencent ? 'tencent' : 'schematic');

    renderPins();
  }

  function enableTencent() {
    if (base.tmap) {
      setBase('tencent');
      return Promise.resolve();
    }
    return initTencentMap().then(function () {
      setBase('tencent');
      setTimeout(function () {
        if (base.mode === 'tencent' && !base.tiles) {
          base.slow = true;
          showMapNotice('底图加载较慢。若一直空白，请检查 Key 的安全域名，或点右下角图层按钮切回示意底图。');
        }
      }, 15000);
    });
  }

  function toggleBase() {
    if (base.mode === 'tencent') {
      setBase('schematic');
      $('#mapNotice').hidden = true;
      try { localStorage.setItem(BASE_KEY, 'schematic'); } catch (e) { /* noop */ }
      toast('已切换到示意底图');
      return;
    }
    toast('正在加载腾讯地图…');
    enableTencent().then(function () {
      try { localStorage.setItem(BASE_KEY, 'tencent'); } catch (e) { /* noop */ }
      if (base.mode === 'tencent') toast('腾讯地图已接入');
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      fallbackToSchematic('腾讯地图加载失败：' + msg + '。请确认 Key 已开通「Web 端(JS API)」，并把当前域名加入安全域名。');
    });
  }

  /* ---------------- 列表 ---------------- */
  function renderFilters() {
    $('#filterRow').innerHTML = FILTERS.map(function (f) {
      return '<button class="chip' + (state.filter === f.id ? ' is-on' : '') + '" data-filter="' + f.id + '">' + f.label + '</button>';
    }).join('');
  }

  function rankCard(p, i) {
    var score = scoreOf(p);
    var v = verdictOf(score);
    var tags = p.tags.slice(0, 3).map(function (x) { return '<span class="mini-tag">' + esc(x.t) + '</span>'; }).join('');
    return '<button class="rank-card lvl-' + v.cls + '" data-action="place" data-id="' + p.id + '">' +
      '<span class="rank-no">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="rank-main">' +
        '<span class="rank-row1">' +
          '<span class="rank-name">' + esc(p.name) + '</span>' +
          '<span class="rank-rating">★ ' + p.rating.toFixed(1) + '</span>' +
        '</span>' +
        '<span class="rank-meta">' + CUISINES[p.cuisine].label + ' · ' + p.area + ' · ¥' + p.price + '/人</span>' +
        '<span class="rank-tags">' + tags + '<span class="rank-rec">推荐度 <b>' + recOf(p) + '%</b></span></span>' +
      '</span>' +
      '<span class="rank-score"><b>' + score + '</b><em>避雷</em></span>' +
    '</button>';
  }

  function renderRank() {
    var list = sortedPlaces();
    $('#rankList').innerHTML = list.length
      ? list.map(rankCard).join('')
      : '<div class="empty">这个筛选下还没有店。<br>换个菜系，或去地图上逛逛。</div>';
    $('#rankCount').textContent = list.length;
  }

  /* ---------------- 我的 ---------------- */
  function renderMe() {
    var saved = store.saved.map(getPlace).filter(Boolean);
    $('#statSaved').textContent = saved.length;
    $('#statReports').textContent = store.myReports.length;
    $('#statHelped').textContent = store.myReports.length ? store.myReports.length * 23 : 0;
    $('#savedHint').textContent = saved.length ? '共 ' + saved.length + ' 家' : '收藏后会显示在这里';
    $('#myHint').textContent = store.myReports.length ? '共 ' + store.myReports.length + ' 条' : '提交后会显示在这里';

    var box = $('#savedList');
    if (!saved.length) {
      box.innerHTML = '<div class="empty">清单还是空的。<br>在详情页点「加入避雷清单」，下次直接翻。</div>';
    } else {
      box.innerHTML = saved.map(function (p) {
        var score = scoreOf(p);
        var v = verdictOf(score);
        return '<button class="saved-item lvl-' + v.cls + '" data-action="place" data-id="' + p.id + '">' +
          '<span class="saved-main">' +
            '<span class="saved-name">' + esc(p.name) + '</span>' +
            '<span class="saved-meta">' + CUISINES[p.cuisine].label + ' · ' + p.area + ' · ¥' + p.price + '/人</span>' +
          '</span>' +
          '<span class="saved-score">' + score + '</span>' +
        '</button>';
      }).join('');
    }

    var mine = $('#myReports');
    if (!store.myReports.length) {
      mine.innerHTML = '<div class="empty">还没有提交记录。<br>踩过的雷，写下来才有用。</div>';
    } else {
      mine.innerHTML = store.myReports.map(function (r) {
        return '<div class="saved-item lvl-mid">' +
          '<span class="saved-main">' +
            '<span class="saved-name">' + esc(r.placeName) + '</span>' +
            '<span class="saved-meta">' + esc(r.area) + ' · ' + r.date + ' · ' + r.rating + ' 星 · ' + esc((r.tags || []).join(' / ') || '未选雷点') + '</span>' +
          '</span>' +
          '<span class="mr-status">待核验</span>' +
        '</div>';
      }).join('');
    }

    var sw = $('#alertsSwitch');
    sw.classList.toggle('is-on', !!store.alerts);
    sw.setAttribute('aria-checked', store.alerts ? 'true' : 'false');
  }

  function renderAll() {
    renderPins();
    renderPreview();
    renderRank();
    renderMe();
  }

  /* ---------------- 视图 ---------------- */
  function switchView(name) {
    state.view = name;
    $$('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.getAttribute('data-view') === name);
    });
    $$('.tab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === name);
    });
    var pad = $('#view-' + name + ' .scroll-pad');
    if (pad) pad.scrollTop = 0;
    if (name === 'rank') renderRank();
    if (name === 'me') renderMe();
    if (name === 'report') {
      setTimeout(function () { $('#placeName').focus({ preventScroll: true }); }, 320);
    }
  }

  /* ---------------- 弹层 ---------------- */
  var sheetOpen = false;

  function openSheet(html) {
    var body = $('#sheetBody');
    body.innerHTML = html;
    body.scrollTop = 0;
    $('#sheet').classList.add('open');
    $('#sheetBackdrop').classList.add('show');
    sheetOpen = true;
  }

  function closeSheet() {
    $('#sheet').classList.remove('open');
    $('#sheetBackdrop').classList.remove('show');
    sheetOpen = false;
  }

  function tagStatsHTML(p) {
    var max = Math.max.apply(null, p.tags.map(function (x) { return x.n; }));
    return '<div class="tag-stats">' + p.tags.map(function (x) {
      return '<div class="tag-stat">' +
        '<span class="ts-name">' + esc(x.t) + '</span>' +
        '<span class="ts-bar"><i style="width:' + Math.round(x.n / max * 100) + '%"></i></span>' +
        '<span class="ts-num">' + x.n + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function recordsHTML(p) {
    var list = p.records.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    return '<div class="tl">' + list.map(function (r) {
      return '<div class="tl-item">' +
        '<div class="tl-head">' +
          '<span class="tl-stars">' + starStr(r.rating) + '</span>' +
          '<span class="tl-date">' + r.date + '</span>' +
          (r.tags || []).slice(0, 2).map(function (tg) { return '<span class="tag-kind">' + esc(tg) + '</span>'; }).join('') +
        '</div>' +
        '<p class="tl-note">' + esc(r.text) + '</p>' +
        '<span class="tl-meta">人均 ¥' + r.price + (r.mine ? ' · 我的记录' : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function detailHTML(p) {
    var score = scoreOf(p);
    var v = verdictOf(score);
    var rec = recOf(p);
    var avg = cuisineAvg(p);
    var saved = store.saved.indexOf(p.id) >= 0;
    var queueText = p.queue ? '排队约 ' + p.queue + ' 分钟' : '基本不用排队';

    var dishes = [];
    (p.good || []).forEach(function (d) { dishes.push('<span class="dish-tag good">推荐 · ' + esc(d) + '</span>'); });
    (p.bad || []).forEach(function (d) { dishes.push('<span class="dish-tag bad">避雷 · ' + esc(d) + '</span>'); });

    return '<div class="detail lvl-' + v.cls + '">' +
      '<div class="stamp">' + v.char + '</div>' +
      '<div class="d-top">' +
        '<span class="risk-tag">' + v.label + '</span>' +
        '<span class="d-type">' + CUISINES[p.cuisine].label + ' · ' + p.area + '</span>' +
      '</div>' +
      '<h2 class="d-title">' + esc(p.name) + '</h2>' +
      '<p class="d-addr">' + esc(p.address) + '</p>' +
      '<p class="d-meta">人均 ¥' + p.price + ' · ' + queueText + ' · ' + totalReviews(p).toLocaleString('en-US') + ' 条评价</p>' +

      '<div class="compare">' +
        '<div class="cmp">' +
          '<span class="cmp-label">平台评分</span>' +
          '<b class="cmp-num">' + p.rating.toFixed(1) + '</b>' +
          '<span class="cmp-sub cmp-stars">' + starStr(p.rating) + '</span>' +
        '</div>' +
        '<div class="cmp-arrow">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h15M14 6l6 6-6 6"/></svg>' +
        '</div>' +
        '<div class="cmp">' +
          '<span class="cmp-label">真实推荐度</span>' +
          '<b class="cmp-num rec">' + rec + '<span>%</span></b>' +
          '<span class="cmp-sub">' + p.records.length + ' 条避雷记录</span>' +
        '</div>' +
      '</div>' +

      '<div class="heat-row">' +
        '<div class="heat-line"><span>避雷指数</span><b>' + score + '<span>/100</span></b><em>同类平均 ' + avg + '</em></div>' +
        '<div class="bar"><i style="width:' + score + '%"></i></div>' +
      '</div>' +

      '<div class="d-section">' +
        '<h3>雷点分布</h3>' +
        tagStatsHTML(p) +
      '</div>' +

      '<blockquote class="quote">“' + esc(p.summary) + '”</blockquote>' +

      '<div class="dish-row">' + dishes.join('') + '</div>' +

      '<div class="d-section">' +
        '<h3>真实记录</h3>' +
        recordsHTML(p) +
      '</div>' +

      '<div class="tip-card"><b>如果一定要去</b><p>' + esc(p.tip) + '</p></div>' +

      '<div class="d-note">推荐度由平台评分与避雷记录综合计算，是主观体验的汇总，不构成对商家的卫生或资质认定。</div>' +

      '<div class="d-actions">' +
        '<button class="btn ' + (saved ? 'btn-saved' : 'btn-ghost') + '" data-action="toggle-save" data-id="' + p.id + '">' +
          (saved ? '已加入清单' : '加入避雷清单') +
        '</button>' +
        '<button class="btn btn-primary" data-action="me-too" data-id="' + p.id + '">我也踩过雷</button>' +
      '</div>' +
      '<p class="d-foot">信息来自用户匿名上报 · <button class="link-btn" data-action="correct">信息有误？</button></p>' +
    '</div>';
  }

  function openPlace(id) {
    var p = getPlace(id);
    if (!p) { toast('没有找到这家店'); return; }
    selectPlace(id);
    openSheet(detailHTML(p));
  }

  /* ---------------- 静态弹层 ---------------- */
  function guideHTML() {
    var secs = GUIDE.map(function (g, i) {
      return '<div class="g-section">' +
        '<h3><span class="g-index">' + (i + 1) + '</span>' + esc(g.title) + '</h3>' +
        '<ul>' + g.items.map(function (it) { return '<li>' + esc(it) + '</li>'; }).join('') + '</ul>' +
      '</div>';
    }).join('');
    return '<div class="g-head">' +
      '<span class="risk-tag lvl-low">榜单规则</span>' +
      '<h2 class="g-title">高分榜为什么需要一张避雷图</h2>' +
      '<p class="g-intro">评分是平均值，避雷是个体经验。这张榜单不否定高分店，只是把「高分但你可能不适合」的部分提前摊开。</p>' +
      '</div>' + secs +
      '<div class="g-tip">原型中的指数与记录均为虚构示例，仅用于展示产品逻辑。</div>';
  }

  function cityHTML() {
    return '<h2 class="sheet-title">选择城市</h2>' +
      '<p class="sheet-sub">目前只开放上海，演示数据也仅覆盖上海。</p>' +
      CITIES.map(function (c) {
        return '<button class="city-item' + (c.ready ? ' is-current' : '') + '" ' + (c.ready ? '' : 'disabled') + '>' +
          '<b>' + c.name + '</b>' +
          '<span class="city-state">' + (c.ready ? '当前城市' : '内测中') + '</span>' +
        '</button>';
      }).join('');
  }

  function dataNoteHTML() {
    return '<h2 class="sheet-title">数据与隐私</h2>' +
      '<p class="sheet-sub">做差评产品，最怕的是变成另一种刷分。</p>' +
      '<div class="g-section" style="margin-top:4px;border-top:0;padding-top:0">' +
        '<ul>' +
          '<li>演示版本内的所有餐厅、评分与记录均为虚构，不对应任何真实商户。</li>' +
          '<li>正式产品中，每条记录需包含具体细节（点了什么、等了多久），并经过人工抽检。</li>' +
          '<li>评分与推荐度是主观体验的汇总，不是卫生、资质或食品安全结论。</li>' +
          '<li>默认不展示昵称与联系方式；只保留商圈、人均与时间。</li>' +
          '<li>商家可对不实记录发起申诉，核实后下架并公示处理结果。</li>' +
          '<li>不收录人身攻击、员工隐私、未经证实的安全指控。</li>' +
        '</ul>' +
      '</div>' +
      '<div class="g-tip">数据保存在本机浏览器（localStorage），不会上传到任何服务器。清除浏览器数据即会重置。</div>';
  }

  function aboutHTML() {
    return '<h2 class="sheet-title">关于避雷吧</h2>' +
      '<p class="sheet-sub">v0.1 交互原型 · 2026</p>' +
      '<div class="g-section" style="margin-top:4px;border-top:0;padding-top:0">' +
        '<ul>' +
          '<li>一句话：把高分榜上「评分与体验落差最大」的店，标进一张可查、可报、可收藏的地图。</li>' +
          '<li>形态：微信小程序 / 移动端 Web。当前为浏览器内的高保真原型。</li>' +
          '<li>技术：原生 HTML / CSS / JavaScript，无框架、无后端，示例数据内置。</li>' +
          '<li>下一步：接入地图底图与 POI 检索、上报审核后台、按商圈订阅。</li>' +
        '</ul>' +
      '</div>' +
      '<div class="g-tip">本原型参考了「避雷地图」类产品的思路，与大众点评及其他平台无关联。</div>';
  }

  function successHTML() {
    return '<div class="success">' +
      '<div class="check">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4.5 4.5L19 7"/></svg>' +
      '</div>' +
      '<h3>记录已提交</h3>' +
      '<p>演示原型中即时生效：这家店的避雷指数与推荐度已重算，榜单和地图同步更新。正式产品会先经过核验。</p>' +
      '<div class="success-actions">' +
        '<button class="btn btn-primary" data-action="goto-map">在地图上看看</button>' +
        '<button class="btn btn-ghost" data-action="close-sheet">继续逛榜单</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 表单 ---------------- */
  function buildChips() {
    $('#cuisineChips').innerHTML = Object.keys(CUISINES).map(function (k) {
      return '<button type="button" class="chip' + (form.cuisine === k ? ' is-on' : '') + '" data-chip="cuisine" data-value="' + k + '">' + CUISINES[k].label + '</button>';
    }).join('');

    $('#areaChips').innerHTML = Object.keys(AREAS).map(function (a) {
      return '<button type="button" class="chip' + (form.area === a ? ' is-on' : '') + '" data-chip="area" data-value="' + a + '">' + a + '</button>';
    }).join('');

    $('#tagChips').innerHTML = TAGS.map(function (tg) {
      return '<button type="button" class="chip' + (form.tags.indexOf(tg) >= 0 ? ' is-on' : '') + '" data-chip="tag" data-value="' + tg + '">' + tg + '</button>';
    }).join('');

    $$('#starRow button').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.dataset.star) <= form.rating);
    });
    $('#starHint').textContent = STAR_HINT[form.rating] || '点星星打分';
  }

  function resetForm() {
    form = { cuisine: 'bbq', area: '静安寺', rating: 2, tags: [], anon: form.anon };
    $('#reportForm').reset();
    $('#placeName').value = '';
    $('#note').value = '';
    $('#priceInput').value = '';
    $('#ratingInput').value = '';
    $('#noteCount').textContent = '0';
    $('#anonSwitch').classList.toggle('is-on', form.anon);
    buildChips();
  }

  function prefillReport(p) {
    form.cuisine = p.cuisine;
    form.area = p.area;
    form.tags = [];
    form.rating = 2;
    buildChips();
    $('#placeName').value = p.name;
    $('#ratingInput').value = p.rating.toFixed(1);
    switchView('report');
    toast('已带入店名，补上你踩到的雷');
  }

  function submitReport() {
    var name = $('#placeName').value.trim();
    if (!name) {
      toast('请先填写餐厅名称');
      $('#placeName').focus();
      return;
    }
    if (!form.rating) {
      toast('请给这次体验打个分');
      return;
    }
    if (!form.tags.length) {
      toast('至少选一个雷点');
      return;
    }

    var price = parseInt($('#priceInput').value, 10);
    if (!price || price <= 0) price = 100;
    var queue = parseInt($('#queueSelect').value, 10) || 0;
    var note = $('#note').value.trim();
    var date = todayStr();
    var ratingIn = parseFloat($('#ratingInput').value);

    var p = allPlaces().filter(function (x) { return x.name === name && x.area === form.area; })[0] ||
            allPlaces().filter(function (x) { return x.name === name; })[0];

    if (!p) {
      var c = AREAS[form.area] || AREAS['静安寺'];
      p = {
        id: 'u' + Date.now(),
        name: name,
        cuisine: form.cuisine,
        area: form.area,
        address: form.area + '（用户标注位置）',
        lat: c.lat + (Math.random() - 0.5) * 0.008,
        lng: c.lng + (Math.random() - 0.5) * 0.01,
        dist: (0.5 + Math.random() * 4).toFixed(1),
        rating: ratingIn >= 0 && ratingIn <= 5 ? ratingIn : 4.5,
        reviews: 0,
        price: price,
        queue: queue,
        heat: 46,
        tags: [],
        summary: note || '新提交的记录，等待更多样本。',
        good: [],
        bad: [],
        tip: '样本还少，建议先看具体记录再决定。',
        records: []
      };
      store.extraPlaces.push(p);
    }

    p.records.push({
      date: date,
      rating: form.rating,
      tags: form.tags.slice(),
      price: price,
      text: note || '未填写补充描述。',
      mine: true
    });

    /* 同步雷点计数 */
    form.tags.forEach(function (tg) {
      var hit = p.tags.filter(function (x) { return x.t === tg; })[0];
      if (hit) hit.n++;
      else p.tags.push({ t: tg, n: 1 });
    });
    if (!p.summary || p.summary.indexOf('新提交') === 0) p.summary = note || p.summary;

    store.myReports.unshift({
      id: 'm' + Date.now(),
      placeId: p.id,
      placeName: p.name,
      area: p.area,
      date: date,
      rating: form.rating,
      tags: form.tags.slice(),
      anon: form.anon
    });
    save();

    resetForm();
    renderAll();
    selectPlace(p.id);
    switchView('map');
    setTimeout(function () { openSheet(successHTML()); }, 260);
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    $$('.tab').forEach(function (b) {
      b.addEventListener('click', function () { switchView(b.getAttribute('data-tab')); });
    });

    $('#filterRow').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.getAttribute('data-filter');
      renderFilters();
      renderPins();
      renderPreview();
      renderRank();
    });

    var input = $('#searchInput');
    input.addEventListener('input', function () {
      state.query = input.value;
      $('#search').classList.toggle('has-value', !!input.value);
      renderPins();
      renderPreview();
      renderRank();
    });
    $('#searchClear').addEventListener('click', function () {
      input.value = '';
      state.query = '';
      $('#search').classList.remove('has-value');
      renderPins();
      renderPreview();
      renderRank();
    });

    $('#sortSeg').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sort]');
      if (!btn) return;
      state.sort = btn.getAttribute('data-sort');
      $$('#sortSeg button').forEach(function (b) { b.classList.toggle('is-on', b === btn); });
      renderRank();
    });

    document.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (!chip) return;
      var kind = chip.getAttribute('data-chip');
      var val = chip.getAttribute('data-value');
      if (kind === 'cuisine' || kind === 'area') {
        form[kind] = val;
      } else {
        var i = form.tags.indexOf(val);
        if (i >= 0) form.tags.splice(i, 1); else form.tags.push(val);
      }
      buildChips();
    });

    $('#starRow').addEventListener('click', function (e) {
      var b = e.target.closest('[data-star]');
      if (!b) return;
      form.rating = Number(b.getAttribute('data-star'));
      buildChips();
    });

    $('#anonSwitch').addEventListener('click', function () {
      form.anon = !form.anon;
      this.classList.toggle('is-on', form.anon);
      this.setAttribute('aria-checked', form.anon ? 'true' : 'false');
    });

    $('#note').addEventListener('input', function () {
      $('#noteCount').textContent = String(this.value.length);
    });

    $('#reportForm').addEventListener('submit', function (e) {
      e.preventDefault();
      submitReport();
    });

    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var action = el.getAttribute('data-action');
      var id = el.getAttribute('data-id');

      switch (action) {
        case 'base': toggleBase(); break;
        case 'dismiss-notice': $('#mapNotice').hidden = true; break;
        case 'place': openPlace(id); break;
        case 'city': openSheet(cityHTML()); break;
        case 'close-sheet': closeSheet(); break;
        case 'guide': openSheet(guideHTML()); break;
        case 'data-note': openSheet(dataNoteHTML()); break;
        case 'about': openSheet(aboutHTML()); break;
        case 'correct': toast('已记录纠错请求，核实后会处理（演示）'); break;
        case 'me-too': {
          var p = getPlace(id);
          closeSheet();
          if (p) setTimeout(function () { prefillReport(p); }, 220);
          break;
        }
        case 'toggle-save': {
          var idx = store.saved.indexOf(id);
          if (idx >= 0) { store.saved.splice(idx, 1); toast('已移出避雷清单'); }
          else { store.saved.push(id); toast('已加入避雷清单'); }
          save();
          renderMe();
          var place = getPlace(id);
          if (place && sheetOpen) openSheet(detailHTML(place));
          break;
        }
        case 'toggle-alerts':
          store.alerts = !store.alerts;
          save();
          renderMe();
          toast(store.alerts ? '已开启榜单更新提醒' : '已关闭提醒');
          break;
        case 'add-photo': toast('演示原型暂不支持上传照片'); break;
        case 'goto-map': closeSheet(); switchView('map'); break;
        default: break;
      }
    });

    $('#sheetBackdrop').addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheetOpen) closeSheet();
    });
  }

  /* 首次打开时放入少量示例收藏，避免「我的」页空白 */
  function seedDemo() {
    if (store.saved.length || store.myReports.length) return;
    store.saved = ['r01', 'r04', 'r14'];
    store.myReports = [
      { id: 'seed1', placeId: 'r04', placeName: '十九味老火锅', area: '淮海路', date: '2026-10-28', rating: 2, tags: ['排队久', '锅底一般'], anon: true },
      { id: 'seed2', placeId: 'r01', placeName: '炭与盐·和牛烧肉', area: '静安寺', date: '2026-10-26', rating: 2, tags: ['分量少', '价格虚高'], anon: true }
    ];
    save();
  }

  /* ---------------- 启动 ---------------- */
  function initBaseMap() {
    var cfg = window.APP_CONFIG || {};
    if (cfg.ENABLE_TENCENT_MAP === false || !cfg.TENCENT_MAP_KEY) return;

    var saved = null;
    try { saved = localStorage.getItem(BASE_KEY); } catch (e) { /* noop */ }
    if (saved === 'schematic') return;

    enableTencent().catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      if (location.protocol === 'file:') {
        showMapNotice('本地文件直接打开时，腾讯底图受 Key 安全域名限制，已使用示意底图。部署到网页（或把域名加入白名单）后即可显示真实地图。');
      } else {
        showMapNotice('腾讯地图未加载（' + msg + '）。当前使用示意底图，可点右下角图层按钮重试。');
      }
    });
  }

  function boot() {
    seedDemo();
    renderFilters();
    buildChips();
    renderAll();
    setTransform(-52, -50, 1.3);
    setupMap();
    bind();
    initBaseMap();

    window.addEventListener('resize', function () {
      if (!isTencent()) return;
      setTimeout(syncMapOverlays, 200);
    });

    /* 支持 #rank / #report / #place=r01 这类直达链接，便于演示与截图 */
    var hash = location.hash.replace('#', '');
    if (hash) {
      var m = hash.match(/^place=(.+)$/);
      if (m) setTimeout(function () { openPlace(m[1]); }, 80);
      else if (['map', 'rank', 'report', 'me'].indexOf(hash) >= 0) switchView(hash);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
