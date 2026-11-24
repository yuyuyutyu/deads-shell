(function () {
  'use strict';
  if (window.__deadsInstalled) return;
  var DEADS_V2 = true;
  window.__deadsInstalled = true;

  var AD_HOST = /(doubleclick|googlesyndication|googleadservices|adservice\.google|adsterra|popads|propellerads|onclickads|exoclick|juicyads|trafficjunky|adnxs|adsrvr|tanx\.com|gdt\.qq\.com|e\.qq\.com|pangolin|pangle|bytedance|kuaishou|umeng|cnzz|51\.la|mobads|cpro\.baidu|adview|applovin|unityads|vungle|chartboost|ironsrc|mopub|inmobi|criteo|taboola|outbrain|mgid|revcontent|adskeeper|splashad|adtrack|csjad|ksad|growingio|sensorsdata|hm\.baidu\.com|google-analytics|googletagmanager)/i;

  var SKIP_TEXT = /^(跳过|跳过广告|跳过预览|跳过\s*\d*|进入|立即进入|skip|skip\s*ad|跳过此广告|关闭|关闭广告|close|×|✕|╳|x)$/i;
  var COUNTDOWN = /(\d{1,2}\s*[sS秒])|s\s*后(跳|关|进)/;

  function log() {
    try {
      window.webkit.messageHandlers.deadsLog.postMessage([].slice.call(arguments).join(' '));
    } catch (e) {}
  }

  window.__deads = { blocked: 0, removed: 0 };

  /* ---------- 1. 直接掐掉广告资源 ---------- */
  function isAdNode(n) {
    if (!n || n.nodeType !== 1) return false;
    var t = n.tagName;
    if (t !== 'IMG' && t !== 'IFRAME' && t !== 'SCRIPT' && t !== 'EMBED' && t !== 'VIDEO' && t !== 'SOURCE') return false;
    var u = n.src || n.getAttribute('src') || n.getAttribute('data-src') || n.getAttribute('href') || '';
    return !!u && AD_HOST.test(u);
  }

  function stripAds(root) {
    var list = root.querySelectorAll ? root.querySelectorAll('img,iframe,script,embed,video,source') : [];
    for (var i = 0; i < list.length; i++) {
      if (isAdNode(list[i])) {
        try { list[i].remove(); window.__deads.blocked++; } catch (e) {}
      }
    }
  }

  /* ---------- 2. 开屏 / 插屏 全屏遮罩 ---------- */
  function bigOverlay(el) {
    try {
      var s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return false;
      var r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.6 || r.height < innerHeight * 0.45) return false;
      return true;
    } catch (e) { return false; }
  }

  function findSkip(root) {
    var all = root.querySelectorAll ? root.querySelectorAll('div,span,a,button,p,i,b,img,svg') : [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var txt = (el.textContent || '').trim();
      if (txt && txt.length <= 12 && SKIP_TEXT.test(txt)) return el;
      var al = (el.getAttribute('alt') || '').trim();
      if (al && SKIP_TEXT.test(al)) return el;
      var cl = (el.className && el.className.toString()) || '';
      var id = el.id || '';
      if (/skip|close|dismiss|btn-?close/i.test(cl + ' ' + id) && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  }

  function killSplash() {
    var stack = [document.body];
    var guard = 0;
    while (stack.length && guard++ < 400) {
      var node = stack.pop();
      if (!node || !node.children) continue;
      for (var i = 0; i < node.children.length; i++) {
        var el = node.children[i];
        if (bigOverlay(el)) {
          var body = el.textContent || '';
          if (COUNTDOWN.test(body) || /广告|advertisement|sponsor|Entertainment|进入/i.test(body) || findSkip(el)) {
            var btn = findSkip(el);
            if (btn) {
              try { btn.click(); btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e) {}
            }
            // 倒计时还在就走神：3 秒后硬拔
            (function (target) {
              setTimeout(function () {
                try {
                  if (target.isConnected && target.parentNode) {
                    target.parentNode.removeChild(target);
                    window.__deads.removed++;
                    log('splash removed');
                  }
                } catch (e) {}
              }, 3000);
            })(el);
          }
        }
        if (el.children && el.children.length) stack.push(el);
      }
    }
  }

  /* ---------- 3. 视频贴片 ---------- */
  function skipVideoAd() {
    var vs = document.querySelectorAll('video');
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      var s = v.currentSrc || v.src || '';
      if (s && AD_HOST.test(s)) {
        try { v.remove(); window.__deads.blocked++; } catch (e) {}
        continue;
      }
      if (v.duration && isFinite(v.duration) && v.duration > 5 && v.currentTime < 6) {
        var box = v.parentElement;
        if (box && findSkip(box)) {
          try { v.currentTime = Math.max(0, v.duration - 1); } catch (e) {}
        }
      }
    }
  }

  /* ---------- 4. 广告 SDK 打桩 ---------- */
  function stub() {
    var noop = function () { return noop; };
    var stubObj = new Proxy({}, {
      get: function (t, k) {
        if (k === 'then') return undefined;
        if (k === 'toString') return function () { return '[stub]'; };
        return stubObj;
      },
      set: function () { return true; },
      apply: function () { return stubObj; }
    });
    var names = ['TTAdSdk', 'ttAdSdk', 'bytedance', 'Pangle', 'pangolin', 'csj', 'GDTAd', 'TencentAd',
                 'adsbygoogle', 'AdMob', 'KSUAd', 'ksAd', 'AppLovin', 'UnityAds', 'Vungle', 'startapp',
                 'adSdk', 'SplashAd', 'InterstitialAd', 'RewardedVideoAd', 'gromore', 'GroMore'];
    for (var i = 0; i < names.length; i++) {
      try { if (!(names[i] in window)) window[names[i]] = stubObj; } catch (e) {}
    }
    try {
      window.adsbygoogle = window.adsbygoogle || { push: noop, loaded: true };
    } catch (e) {}
  }

  /* ---------- 5. 拦截弹窗跳转 ---------- */
  var rawOpen = window.open;
  window.open = function (url) {
    var u = String(url || '');
    if (AD_HOST.test(u) || /about:blank/i.test(u)) {
      log('window.open blocked: ' + u.slice(0, 120));
      return null;
    }
    return rawOpen ? rawOpen.apply(window, arguments) : null;
  };

  /* ---------- 启动 ---------- */
  function boot() {
    stub();
    stripAds(document);
    killSplash();
    skipVideoAd();

    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              if (isAdNode(n)) { try { n.remove(); } catch (e) {} continue; }
              stripAds(n);
            }
          }
        }
      }
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

    // 开屏倒计时通常在 0~15 秒内出现，密集扫一段时间
    var ticks = 0;
    var t = setInterval(function () {
      ticks++;
      killSplash();
      skipVideoAd();
      if (ticks > 40) clearInterval(t);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  log('deads injected');
})();
