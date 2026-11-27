/* ============================================================
   DeAds shell — 梦影资源社 (myzys.cc)
   这个站是 WordPress 传统站点（服务端渲染），没有 SPA 门户页、没有 Service Worker，
   所以不需要任何广告规则，只保留必要能力：
     1. navigator.standalone 伪装（部分站点会据此决定是否跳"下载 App"）
     2. 跨域导航拦截（window.open / a.click / location）
     3. 跑错域名立刻弹回（回旋镖）
     4. 三连点调试面板
   ============================================================ */
(function () {
  'use strict';
  if (window.__deadsInstalled) return;
  window.__deadsInstalled = 1;

  var __ring = [];
  function log() {
    var s = [].slice.call(arguments).join(' ');
    try { __ring.push(s); if (__ring.length > 40) __ring.shift(); } catch (e) {}
    try { window.webkit.messageHandlers.deadsLog.postMessage(s); } catch (e) {}
  }

  /* --- 1. standalone 伪装 --- */
  try {
    Object.defineProperty(window.navigator, 'standalone', { get: function () { return true; }, configurable: true });
  } catch (e) {}

  function cfg() { return window.__deadsConfig || {}; }
  function homeURL() {
    var t = cfg().targets;
    return (t && t.length) ? t[0] : 'https://myzys.cc/';
  }
  function allowedHosts() {
    var t = cfg().targets || [homeURL()], out = [];
    for (var i = 0; i < t.length; i++) { try { out.push(new URL(t[i]).host); } catch (e) {} }
    return out;
  }
  function sameHost(u) {
    try {
      var h = new URL(String(u), location.href).host;
      var list = allowedHosts();
      for (var i = 0; i < list.length; i++) { if (h === list[i]) return true; }
      return false;
    } catch (e) { return true; }
  }

  /* --- 2. 回旋镖：被带去别的域名立刻弹回 --- */
  try {
    var cur = location.host;
    if (cur && !sameHost(location.href) && !/(^|\.)itguru\.tw$/.test(cur) && !/(^|\.)jsdelivr\.net$/.test(cur)) {
      log('boomerang from ' + cur);
      location.replace(homeURL());
    }
  } catch (e) {}

  /* --- 3. 跨域跳转拦截 --- */
  try {
    var rawOpen = window.open;
    window.open = function (u) {
      try {
        if (u && String(u) !== 'about:blank' && /^https?:/i.test(String(u)) && !sameHost(u)) {
          log('BLOCK window.open ' + String(u).slice(0, 110));
          return null;
        }
      } catch (e) {}
      return rawOpen.apply(window, arguments);
    };
  } catch (e) {}

  try {
    var rawAClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      try {
        if (this.href && /^https?:/i.test(this.href) && !sameHost(this.href)) {
          log('BLOCK a.click ' + this.href.slice(0, 110));
          return;
        }
      } catch (e) {}
      return rawAClick.apply(this, arguments);
    };
  } catch (e) {}

  try {
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || a.target === '_self') return;
      try {
        var abs = new URL(href, location.href);
        if (abs.protocol.indexOf('http') !== 0) return;
        if (!sameHost(abs.href)) {
          ev.preventDefault();
          ev.stopPropagation();
          log('BLOCK link ' + abs.href.slice(0, 110));
        }
      } catch (e) {}
    }, true);
  } catch (e) {}

  try {
    var lp = Object.getPrototypeOf(window.location);
    var ra = lp.assign, rr = lp.replace;
    lp.assign = function (u) {
      if (!sameHost(u)) { log('BLOCK location.assign'); return; }
      return ra.call(this, u);
    };
    lp.replace = function (u) {
      if (!sameHost(u)) { log('BLOCK location.replace'); return; }
      return rr.call(this, u);
    };
  } catch (e) {}

  /* --- 4. 调试面板（三连点） --- */
  window.__deadsReport = function () {
    var out = ['viewport ' + innerWidth + 'x' + innerHeight + '  url=' + location.href.slice(0, 160)];
    try {
      out.push('cfg=' + JSON.stringify(cfg()).slice(0, 150));
      out.push('ua=' + (navigator.userAgent || '').slice(0, 60));
      out.push('title=' + (document.title || '').slice(0, 40));
      out.push('scripts=' + document.scripts.length + '  imgs=' + document.images.length);
      out.push('logs=' + __ring.slice(-14).join(' / '));
    } catch (e) { out.push('diag error: ' + e); }
    return out.join('\n');
  };

  log('deads injected (myzys)');
})();
