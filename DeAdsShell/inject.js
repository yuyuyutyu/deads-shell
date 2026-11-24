(function () {
  'use strict';

  /* ================= 快播的硬门禁：必须"主屏启动" =================
     bundle 里原话:
       let o = !0 === window.navigator.standalone, A = o;
       if (!l() && (!i || !A)) throw s("重新导向中..."), Error("stop loading")
     也就是说 navigator.standalone 不为 true 就直接跳官网下载页。
     WKWebView 里它是 undefined，这里顶成 true。 */
  try {
    var __sa = { configurable: true, get: function () { return true; } };
    try { Object.defineProperty(window.navigator, 'standalone', __sa); } catch (e) {}
    if (window.navigator.standalone !== true) {
      try { Object.defineProperty(Navigator.prototype, 'standalone', __sa); } catch (e) {}
    }
  } catch (e) {}

  /* 顺手把 display-mode:standalone 也标上，兼容别的写法 */
  try {
    var __mm = window.matchMedia.bind(window);
    window.matchMedia = function (q) {
      if (typeof q === 'string' && q.indexOf('display-mode: standalone') >= 0) {
        return { matches: true, media: q, onchange: null,
                 addListener: function () {}, removeListener: function () {},
                 addEventListener: function () {}, removeEventListener: function () {},
                 dispatchEvent: function () { return false; } };
      }
      return __mm(q);
    };
  } catch (e) {}

  /* ============ 0. 精确命中：styled-components 的 componentId 会原样出现在 class 里 ============
     sc-d78efdd4-0  FloatPromotionContainer  右下角推广浮层
     sc-f7182143-3  FloatAdWrapper           右上角圆图广告
     sc-f7182143-5  FloatAdCloseButton       它的关闭键
     sc-f7182143-4  FloatAdImage
     这几个是纯广告节点，直接 display:none，不参与任何业务逻辑。 */
  function __deadsHideCss() {
    if (document.querySelector('style[data-deads-css]')) return;
    var css = [
      '[class*="sc-d78efdd4-0"]',
      '[class*="sc-f7182143-3"]',
      '[class*="sc-f7182143-4"]',
      '[class*="sc-f7182143-5"]'
    ].join(',') + '{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
    var s = document.createElement('style');
    s.setAttribute('data-deads-css', '1');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  __deadsHideCss();

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



  /* ---------- 7. 排障用：三连点屏幕出黑底面板 ---------- */
  window.__deadsReport = function () {
    var out = [];
    var vw = innerWidth, vh = innerHeight;
    var nodes = document.body ? document.body.querySelectorAll('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META') continue;
      var s;
      try { s = getComputedStyle(el); } catch (e) { continue; }
      if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      var r = el.getBoundingClientRect();
      if (r.width * r.height < vw * vh * 0.05) continue;
      var cls = (el.className || '').toString();
      var sc = cls.match(/sc-[0-9a-z]+-\d+/g);
      out.push((sc ? sc.join(',') : '(no sc)') + ' | ' + tag + ' | ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' | z=' + s.zIndex + ' | ' + cls.slice(0, 60));
      if (out.length > 60) break;
    }
    var head = 'viewport ' + vw + 'x' + vh + '  url=' + location.href.slice(0, 80) + '\n--- fixed/absolute >=5% ---\n';
    return head + (out.length ? out.join('\n') : 'none');
  };

  /* ============ 6. 悬浮/弹窗广告（FloatPromotion / FloatAd） ============
     bundle 里的组件名：FloatPromotionContainer/Close/Image、FloatAdWrapper/Image/CloseButton/CloseIcon
     形态：position:fixed 的图片块 + 一个小方块 X（在图片下方或角上）。
     策略：先找 X 真点它（走 App 自己的关闭逻辑，最干净）；1.2 秒还在就整块删。 */
  function isFloating(el) {
    try {
      var s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      var r = el.getBoundingClientRect();
      if (r.width < 55 || r.height < 55) return false;
      if (r.width > innerWidth * 0.96 && r.height > innerHeight * 0.9) return false; // 全屏交给 killSplash
      // <img>
      var imgs = el.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++) {
        var ir = imgs[i].getBoundingClientRect();
        if (ir.width >= 55 && ir.height >= 55) return true;
      }
      // background-image（快播的推广图就是 background-image / 自定义 source:picture 组件）
      var bg = '' + (s.backgroundImage || '');
      if (bg.indexOf('url(') >= 0 && r.width >= 55 && r.height >= 55) return true;
      var kids = el.querySelectorAll('div,picture,source');
      for (var k = 0; k < kids.length; k++) {
        var ks = getComputedStyle(kids[k]);
        if (('' + ks.backgroundImage).indexOf('url(') >= 0) {
          var kr = kids[k].getBoundingClientRect();
          if (kr.width >= 55 && kr.height >= 55) return true;
        }
      }
      return false;
    } catch (e) { return false; }
  }

  function findCloseButton(root) {
    var all = root.querySelectorAll('div,span,a,button,i,img,svg');
    var best = null, bestScore = -1e9;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10 || r.width > 64 || r.height > 64) continue;
      var txt = (el.textContent || '').trim();
      if (txt.length > 2) continue;
      var score = 0;
      if (/close|skip|btn-?close|x/i.test((el.className || '').toString() + ' ' + (el.id || ''))) score += 3;
      if (el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'I') score += 2;
      if (/^(×|✕|╳|x|X)$/.test(txt)) score += 4;
      // 越靠容器边缘越像关闭键
      var er = root.getBoundingClientRect();
      var dx = Math.min(Math.abs(r.left - er.left), Math.abs(er.right - r.right));
      var dy = Math.min(Math.abs(r.top - er.top), Math.abs(er.bottom - r.bottom));
      if (dx < 24 || dy < 24) score += 2;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return bestScore >= 2 ? best : null;
  }

  function killFloatAds() {
    if (!document.body) return;
    var nodes = document.body.querySelectorAll('div,aside,section');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.__deadsFloat) continue;
      if (!isFloating(el)) continue;
      el.__deadsFloat = 1;
      var btn = findCloseButton(el);
      if (btn) {
        try {
          btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          btn.click();
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } catch (e) {}
      }
      (function (node, target) {
        setTimeout(function () {
          try {
            if (node.isConnected && node.parentNode) {
              // 点了还在 => 直接拔
              var stillVisible = node.getBoundingClientRect().height > 0;
              if (!target || stillVisible) {
                node.parentNode.removeChild(node);
                window.__deads.removed++;
                log('float ad removed');
              }
            }
          } catch (e) {}
        }, 1200);
      })(el, btn);
    }
  }

  /* ---------- 启动 ---------- */
  function boot() {
    stub();
    stripAds(document);
    killSplash();
    killFloatAds();
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
              killFloatAds();
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
      killFloatAds();
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
