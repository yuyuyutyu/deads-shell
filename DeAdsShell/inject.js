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
      '[class*="sc-f7182143-5"]',
      '[class*="sc-1fedb97a-0"]',
      '[class*="sc-1fedb97a-1"]',
      '[class*="sc-1fedb97a-2"]'
    ].join(',') + '{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
    var s = document.createElement('style');
    s.setAttribute('data-deads-css', '1');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  __deadsHideCss();

  /* ============ 0b. 远端规则：不重装就能更新广告选择器 ============
     原生壳（v9 起）会注入 window.__deadsConfig；老壳没有，就在 JS 里自己拉。
     两个源：jsDelivr 镜像 → GitHub raw，任一个通即可。拉不到就用内置默认值。 */
  function __deadsFetchConfig() {
    if (window.__deadsConfig && window.__deadsConfig.hideSelectors) return;
    var urls = [
      'https://cdn.jsdelivr.net/gh/yuyuyutyu/deads-shell@main/deads-config.json',
      'https://raw.githubusercontent.com/yuyuyutyu/deads-shell/main/deads-config.json'
    ];
    var i = 0;
    (function next() {
      if (i >= urls.length) return;
      var url = urls[i++];
      var done = false;
      var ac = null;
      try { ac = new AbortController(); } catch (e) {}
      var timer = setTimeout(function () { done = true; try { ac && ac.abort(); } catch (e) {} next(); }, 2500);
      fetch(url, { cache: 'no-store', signal: ac ? ac.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cfg) {
          clearTimeout(timer);
          if (done || !cfg) return;
          done = true;
          window.__deadsConfig = cfg;
          var old = document.querySelector('style[data-deads-css]');
          if (old && old.parentNode) old.parentNode.removeChild(old);
          __deadsHideCss();
          log('remote config loaded');
        })
        .catch(function () { clearTimeout(timer); if (!done) next(); });
    })();
  }
  __deadsFetchConfig();


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

  /* 只隐藏，永不 removeChild。
     React 的 portal 被外部删掉后，下一次 reconcile 会抛 NotFoundError，
     整棵树崩掉 -> 就是你说的"一滑动全部灰屏"。 */
  function hideEl(el) {
    if (!el || el.nodeType !== 1 || el.__deadsHidden) return;
    try {
      el.__deadsHidden = 1;
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    } catch (e) {}
  }

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
        try { hideEl(list[i]); window.__deads.blocked++; } catch (e) {}
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
          var flat = body.replace(/\s+/g, '');
          // 纯数字倒计时（5 / 5s / 5秒）也要认，很多开屏只画一个数字
          var isCountdown = COUNTDOWN.test(body) || /^\d{1,2}(s|秒)?$/.test(flat) || /(^|[^\d])\d{1,2}(s|秒)$/.test(flat);
          var isAdWord = /广告|advertisement/i.test(body);
          if (isCountdown || isAdWord) {
            var btn = findSkip(el);
            if (btn) {
              try { btn.click(); btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e) {}
            }
            // 倒计时还在就走神：3 秒后硬拔
            (function (target) {
              setTimeout(function () {
                try {
                  if (target.isConnected && target.parentNode) {
                    hideEl(target);
                    window.__deads.removed++;
                    log('splash removed');
                  }
                } catch (e) {}
              }, 1500);
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
        try { hideEl(v); window.__deads.blocked++; } catch (e) {}
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

    // 额外：把全屏浮层的子节点类名也列出来，方便定位"跳过"按钮
    var deep = [];
    for (var k = 0; k < nodes.length; k++) {
      var n2 = nodes[k];
      var s2;
      try { s2 = getComputedStyle(n2); } catch (e) { continue; }
      if (s2.position !== 'fixed' && s2.position !== 'absolute') continue;
      var r2 = n2.getBoundingClientRect();
      if (r2.width * r2.height < vw * vh * 0.9) continue;
      var kids = n2.querySelectorAll('*');
      var shown = 0;
      deep.push('== overlay ' + (n2.className || '(no class)') + ' kids=' + kids.length);
      for (var q = 0; q < kids.length && shown < 14; q++) {
        var kk = kids[q];
        var rk = kk.getBoundingClientRect();
        if (rk.width < 20 || rk.height < 10) continue;
        var tk = (kk.textContent || '').trim().slice(0, 10);
        deep.push('   <' + kk.tagName + '> ' + (kk.className || '') + ' | ' + Math.round(rk.width) + 'x' + Math.round(rk.height) + ' | "' + tk + '"');
        shown++;
      }
      break;
    }
    if (deep.length) out.push('', '--- fullscreen overlay children ---', deep.join('\n'));


    try {
      var rs = performance.getEntriesByType('resource').map(function (e) { return e.name; })
                 .filter(function (u) { return /\.js(\?|$)/.test(u); }).slice(-25);
      if (rs.length) out.push('', '--- scripts loaded ---', rs.join('\n'));
    } catch (e) {}

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
      // 纯图片、几乎没文案才算广告（业务浮层一定有文字）
      var txt = (el.textContent || '').replace(/\s+/g, '');
      if (txt.length > 8) return false;
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
      // 绝不点击（这类广告的 X 常常是跳转陷阱），只隐藏
      hideEl(el);
      window.__deads.removed++;
      log('float ad hidden');
    }
  }


  /* ============ 8. 公告弹窗：把"广告内容"和"黑色遮罩"一起收掉 ============
     bundle 里的结构：
       sc-38c554ad-0  Styled__Wrapper  position:fixed;width:100%;height:100%;
                                     z-index:var(--layer-fullpage-modal);background:rgba(0,0,0,.5)
                                     —— 这层是全屏遮罩，挡住所有点击
       sc-1fedb97a-0  Styled__Wrapper  广告卡（居中，z-index:999），它的 onClick=handleCancel
     只藏内容不藏遮罩，遮罩就会一直盖着，于是"能看见、点不动、暗暗的"。
     做法：先对内容派发一次 click（走 App 自己的 handleCancel，队列前进一位），
           1 秒后内容若还在，连遮罩一起隐藏（只在遮罩里含广告卡时才动它，别误伤系统公告）。 */
  function __deadsAnnSel() {
    var c = __deadsCfg().announcementSelectors;
    return (c && c.length) ? '[class*="' + c[0] + '"]' : '[class*="sc-1fedb97a-0"]';
  }
  function __deadsBdSel() {
    var c = __deadsCfg().backdropSelectors;
    return (c && c.length) ? '[class*="' + c[0] + '"]' : '[class*="sc-38c554ad-0"]';
  }

  function dismissAnnouncementAd() {
    var wrap = document.querySelector(__deadsAnnSel());
    if (!wrap) return;
    if (!wrap.__deadsClicked) {
      wrap.__deadsClicked = 1;
      try { wrap.click(); } catch (e) {}
      log('announcement ad dismissed');
    }
    setTimeout(function () {
      var still = document.querySelector(__deadsAnnSel());
      if (!still) return;
      hideEl(still);
      var bd = document.querySelector(__deadsBdSel());
      if (bd) { hideEl(bd); log('announcement backdrop hidden'); }
    }, 900);
  }


  /* ============ 9. 通用兜底：空的半透明全屏遮罩 ============
     场景：后台换了弹窗组件，我们没来得及更新选择器，
     结果内容被挡住/关闭后只剩一层 rgba 黑幕吃触摸。
     判定：fixed/absolute + 覆盖 ≥90% 视口 + 背景带透明度 + z-index ≥ 10 + 没有任何可交互或媒体子元素。
     正常弹层一定带 button/img/input，不会被误伤。 */
  function killEmptyBackdrops() {
    if (!document.body) return;
    var vw = innerWidth, vh = innerHeight;
    var nodes = document.body.querySelectorAll('div,section,aside');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.__deadsHidden || el.__deadsBdChecked) continue;
      var s;
      try { s = getComputedStyle(el); } catch (e) { continue; }
      if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      var r = el.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.height < vh * 0.85) continue;
      var m = ('' + s.backgroundColor).match(/rgba?\(([^)]+)\)/);
      var alpha = 1;
      if (m) { var ps = m[1].split(','); if (ps.length === 4) alpha = parseFloat(ps[3]); }
      if (!(alpha < 0.95)) continue;
      var z = parseInt(s.zIndex, 10); if (isNaN(z)) z = 0;
      if (z < 10) continue;
      if (el.querySelector('button,input,textarea,select,a[href],img,video,canvas,svg')) { el.__deadsBdChecked = 1; continue; }
      hideEl(el);
      log('empty backdrop hidden');
    }
  }


  /* ============ 10. 视频贴片（播放前倒计时广告）============
     判据：视频时长 ≤ 45s（正片不会这么短）、还没播完、并且屏幕上出现倒计时/跳过字样。
     动作：把 currentTime 拖到片尾，让贴片瞬间结束；不删视频节点，不破坏播放器状态。 */
  function killPreroll() {
    var vs = document.querySelectorAll('video');
    if (!vs.length) return;
    var overlay = null;
    var all = document.querySelectorAll('div,span,p');
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || '').replace(/\s+/g, '');
      if (!t || t.length > 14) continue;
      if (/^\d{1,2}(s|秒)?$/.test(t) || /跳过|广告/.test(t)) { overlay = all[i]; break; }
    }
    if (!overlay) return;
    for (var v = 0; v < vs.length; v++) {
      var el = vs[v];
      try {
        if (!el.duration || !isFinite(el.duration) || el.duration > 45 || el.duration < 1) continue;
        if (el.currentTime >= el.duration - 1) continue;
        el.currentTime = Math.max(0, el.duration - 0.2);
        log('preroll skipped, dur=' + el.duration.toFixed(1));
      } catch (e) {}
    }
  }


  /* ============ 11. 网飞猫专用（2026-11 实测 DOM）============
     实测面板读数：
       播放页  DIV | z=101 | custom-player-ad-container is-preroll     ← 贴片广告层
       启动页  DIV | 0,0 430x932 | fixed-page / mask / bar-box(z=99)   ← 带"跳过"的引导/开屏层
     */
  function __deadsN04Css() {
    if (document.querySelector('style[data-deads-n04]')) return;
    var s = document.createElement('style');
    s.setAttribute('data-deads-n04', '1');
    s.textContent = [
      '[class*="custom-player-ad-container"]{opacity:0!important;pointer-events:none!important;}',
      '[class*="is-preroll"]{opacity:0!important;pointer-events:none!important;}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }


  function insideOverlay(el) {
    var n = el;
    for (var i = 0; i < 8 && n && n !== document.body; i++, n = n.parentElement) {
      var s;
      try { s = getComputedStyle(n); } catch (e) { continue; }
      if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      var r = n.getBoundingClientRect();
      if (r.width * r.height >= innerWidth * innerHeight * 0.35) return true;
    }
    return false;
  }

  function findSkipAny(root) {
    var best = null, bestScore = -1;
    var all = (root || document).querySelectorAll('div,span,a,button,i,img,svg,p,label');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      var t = (el.textContent || '').trim();
      var cls = (el.className && el.className.toString()) || '';
      var aria = (el.getAttribute && (el.getAttribute('aria-label') || '')) || '';
      var score = -1;
      if (/^跳过/.test(t) && t.length <= 10) score = 12;
      else if (t.indexOf('跳过') >= 0 && t.length <= 10) score = 10;
      else if (/skip/i.test(cls + ' ' + aria) && t.length <= 10) score = 8;
      else if (/^(×|✕|╳)$/.test(t)) score = 6;
      else if (/close|关闭/i.test(cls + ' ' + aria) && t.length <= 10 && insideOverlay(el)) score = 4;
      if (score < 0) continue;
      if (!insideOverlay(el)) score -= 6;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return bestScore >= 3 ? best : null;
  }

  function hardClick(el) {
    try {
      var r = el.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new TouchEvent('touchstart', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new TouchEvent('touchend', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.click();
    } catch (e) {
      try { el.click(); } catch (e2) {}
    }
  }

  // 只认"跳过"，不要别的词，避免误伤
  function findSkipStrict(root) {
    var all = (root || document).querySelectorAll('div,span,a,button,i,img,svg,p');
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || '').trim();
      if (!t || t.length > 8) continue;
      if (/^(跳过|跳过广告|跳过\s*\d*|skip|skip\s*ad|关闭广告|×|✕|╳)$/i.test(t)) return all[i];
    }
    return null;
  }

  // 贴片广告：静音 + 拖到片尾 + 隐藏整层
  function killPlayerAd() {
    var nodes = document.querySelectorAll('[class*="custom-player-ad-container"],[class*="is-preroll"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.__deadsAdKilled) continue;
      el.__deadsAdKilled = 1;
      // 1) 点它自带的跳过键（真按钮 .ad-skip-btn）
      var skipBtn = el.querySelector('.ad-skip-btn, [class*="ad-skip-btn"]');
      if (skipBtn) {
        try { skipBtn.classList.remove('is-disabled'); } catch (e) {}
        if (!skipBtn.__deadsSkipped) { skipBtn.__deadsSkipped = 1; hardClick(skipBtn); log('ad-skip-btn clicked'); }
      }
      // 2) 把广告 video 静音并拖到片尾，触发 ENDED -> 插件 removeAdContainer + next()
      var vs = el.querySelectorAll('video');
      for (var v = 0; v < vs.length; v++) {
        try { vs[v].muted = true; } catch (e) {}
        try { vs[v].play(); } catch (e) {}
        try {
          if (vs[v].duration && isFinite(vs[v].duration) && vs[v].duration > 0.3) {
            vs[v].currentTime = vs[v].duration - 0.05;
          }
        } catch (e) {}
      }
      // duration 可能还没出来，300ms 后再补一刀
      setTimeout(function (node) {
        try {
          var vv = node.querySelectorAll('video');
          for (var q = 0; q < vv.length; q++) {
            try {
              if (vv[q].duration && isFinite(vv[q].duration) && vv[q].duration > 0.3) {
                vv[q].muted = true;
                vv[q].currentTime = vv[q].duration - 0.05;
              }
            } catch (e) {}
          }
        } catch (e) {}
        hideEl(node);
      }, 300);
      log('player preroll killed');
    }
  }

  // 开屏/引导层：有"跳过"就点它（App 自己的逻辑），再整层隐藏
  function killGuideOverlay() {
    // 只点"跳过"，让 App 自己卸载，绝不隐藏整层（隐藏 fixed-page 会把整页弄空白）
    var skip = findSkipAny(document);
    if (!skip || skip.__deadsSkipped) return;
    skip.__deadsSkipped = 1;
    hardClick(skip);
    log('clicked skip: ' + ((skip.textContent || '').trim() || skip.className).toString().slice(0, 24));
  }

  function n04Main() {
    __deadsN04Css();
    killPlayerAd();
    killGuideOverlay();
  }


  /* ============ 12. 启动页（launch-box）专用 ============
     实测 DOM（2026-11）：
       fixed-page > fixed-inner > launch-box
         > content-box > SECTION.m-i-w > IMG(430x805)   ← 开屏广告大图
         > mask / footer-box / bar-box
         > status-box (430x42) "3秒 点击跳过"            ← 倒计时+跳过
      启动失败时 status-btn 文案变成 "启动异常, 点击重试"
     策略：把广告大图直接藏掉，启动页保留（不影响初始化）；跳过键照点；
           万一初始化失败，自动点"重试"最多 3 次。 */
  function __deadsLaunchCss() {
    if (document.querySelector('style[data-deads-launch]')) return;
    var s = document.createElement('style');
    s.setAttribute('data-deads-launch', '1');
    s.textContent = '[class*="launch-box"] [class*="m-i-w"]{display:none!important;visibility:hidden!important;}' +
                    '[class*="launch-box"] [class*="status-box"]{opacity:0!important;}';
    (document.head || document.documentElement).appendChild(s);
  }

  var __launchRetry = 0, __launchRetryAt = 0;
  function retryLaunchError() {
    var btn = document.querySelector('[class*="status-btn"]');
    if (!btn) return;
    var t = (btn.textContent || '');
    if (t.indexOf('启动异常') < 0 && t.indexOf('重试') < 0) return;
    if (__launchRetry >= 3) return;
    var now = Date.now();
    if (now - __launchRetryAt < 2500) return;
    __launchRetryAt = now;
    __launchRetry++;
    hardClick(btn);
    log('launch error -> retry #' + __launchRetry);
  }

  function launchMain() {
    __deadsLaunchCss();
    retryLaunchError();
  }


  /* ============ 13. 贴片等待 7 秒：压缩定时器 + 点隐形跳过 ============
     现象：广告层被藏了，但 App 仍要等它自己的 7 秒计时结束才放开正片，中途点播放会被暂停。
     做法：
       1) 只要贴片层存在于 DOM（哪怕被我们 display:none），就把 5~12 秒的 setTimeout 压到 150ms；
       2) 贴片层内的"跳过"元素不再用 rect 过滤（display:none 时 rect 是 0，以前就是这样漏掉的），
          纯按 class/文本命中就点。 */
  var __rawSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay) {
    try {
      if (typeof delay === 'number' && delay >= 5000 && delay <= 12000) {
        var adLayer = document.querySelector ? document.querySelector('[class*="is-preroll"],[class*="custom-player-ad-container"]') : null;
        if (adLayer) {
          log('timer compress ' + delay + ' -> 150');
          delay = 150;
        }
      }
    } catch (e) {}
    var extra = [];
    for (var i = 2; i < arguments.length; i++) extra.push(arguments[i]);
    return __rawSetTimeout.apply(window, [fn, delay].concat(extra));
  };

  function findHiddenSkip(root) {
    if (!root) return null;
    var all = root.querySelectorAll('div,span,a,button,i,p,label');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var t = (el.textContent || '').trim();
      var cls = (el.className && el.className.toString()) || '';
      if (/^跳过/.test(t) && t.length <= 12) return el;
      if (/skip/i.test(cls) && t.length <= 12) return el;
      if (/^(×|✕|╳)$/.test(t)) return el;
      if (/close/i.test(cls) && t.length <= 12) return el;
    }
    return null;
  }


  /* ============ 14. 贴片倒计时其实是 setInterval，不是 setTimeout ============
     反编译 3409.xxx.js（播放器插件）看到：
       adContainer.className = 'custom-player-ad-container is-preroll'
       adContainer.innerHTML 含 <span class="ad-skip-btn is-disabled">
       倒计时：this.timer = setInterval(...) 每秒 -1，到 0 才 next()
       点跳过：if (elapsed - 1 >= canSkipAfter) { clearInterval(timer); next(); }
     所以 v15 压 setTimeout 完全没效果。这里直接压 setInterval。 */
  var __rawSetInterval = window.setInterval;
  window.setInterval = function (fn, delay) {
    try {
      if (typeof delay === 'number' && delay >= 500 && delay <= 3000) {
        var adLayer = document.querySelector ? document.querySelector('[class*="custom-player-ad-container"]') : null;
        if (adLayer) {
          log('interval compress ' + delay + ' -> 15');
          delay = 15;
        }
      }
    } catch (e) {}
    var extra = [];
    for (var i = 2; i < arguments.length; i++) extra.push(arguments[i]);
    return __rawSetInterval.apply(window, [fn, delay].concat(extra));
  };

  /* ---------- 启动 ---------- */
  function boot() {
    stub();
    stripAds(document);
    n04Main();
    launchMain();
    dismissAnnouncementAd();
    killEmptyBackdrops();

    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              if (isAdNode(n)) { try { hideEl(n); } catch (e) {} continue; }
              stripAds(n);
              n04Main();
              dismissAnnouncementAd();
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
      dismissAnnouncementAd();
      killEmptyBackdrops();
      n04Main();
      launchMain();
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
