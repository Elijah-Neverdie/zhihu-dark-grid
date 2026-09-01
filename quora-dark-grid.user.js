// ==UserScript==
// @name         Quora 暗色网格首页
// @namespace    https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @version      1.0.1
// @description  参考知乎暗色网格插件，将 Quora 首页重排为多列瀑布流（共享 Dark Grid 核心）
// @author       Elijah-Neverdie
// @homepageURL  https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @supportURL   https://github.com/Elijah-Neverdie/zhihu-dark-grid/issues
// @updateURL    https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/quora-dark-grid.user.js
// @downloadURL  https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/quora-dark-grid.user.js
// @match        https://www.quora.com/*
// @match        https://quora.com/*
// @require      https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/dark-grid-shared.user.js
// @run-at       document-end
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      www.quora.com
// @connect      quora.com
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  "use strict";

  const DG =
    (typeof globalThis !== "undefined" && globalThis.DarkGridShared) ||
    (typeof unsafeWindow !== "undefined" && unsafeWindow.DarkGridShared) ||
    window.DarkGridShared;

  if (!DG) {
    console.error("[quora-dark-grid] DarkGridShared 未加载。请确认已安装且 @require 可访问 GitHub raw。");
    return;
  }

  const { esc, text, injectCss, createGridEngine, createShell, applyImgSat, getImgSat, bindImageKeys, createRouteWatcher, bindInfiniteScroll } = DG;

  const QUORA_CSS = `
body.zh-dg-v2{background:#141414!important;color:#e8e8e8!important}
body.zh-dg-v2 header,body.zh-dg-v2 [role="banner"]{
  background:rgba(20,20,20,.96)!important;border-bottom:1px solid var(--dg-line)!important;box-shadow:none!important;
  position:sticky!important;top:0!important;z-index:10050!important
}
body.zh-dg-v2 input,body.zh-dg-v2 textarea{
  background:var(--dg-elev)!important;border:1px solid var(--dg-line)!important;color:var(--dg-text)!important
}
body.zh-dg-v2 #zh-dg-layout{
  position:relative!important;z-index:5!important;width:100%!important;max-width:none!important;
  margin:12px auto 48px!important;padding:0 20px 48px!important;box-sizing:border-box!important;
  opacity:1!important;visibility:visible!important;pointer-events:auto!important
}
/* 隐藏原站三栏：左 Spaces / 中 Feed / 右广告 */
body.zh-dg-v2 #main_content,
body.zh-dg-v2 #main_content > *,
body.zh-dg-v2 .qu-PageWrapper,
body.zh-dg-v2 [class*="PageWrapper"],
body.zh-dg-v2 [class*="HomePage"],
body.zh-dg-v2 [class*="HomeMain"],
body.zh-dg-v2 [class*="HomeFeed"],
body.zh-dg-v2 [class*="SideBar"],
body.zh-dg-v2 [class*="RightBar"],
body.zh-dg-v2 [class*="LeftRail"],
body.zh-dg-v2 [class*="RightRail"],
body.zh-dg-v2 .pagedlist,
body.zh-dg-v2 [class*="pagedlist"]{
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  max-height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;
  visibility:hidden!important
}
body.zh-dg-v2 #root > div:not(:has(#zh-dg-layout)):not(:has(#zh-dg-scraper)){
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  opacity:0!important;pointer-events:none!important;visibility:hidden!important
}
`;

  const isHome = () => {
    const p = location.pathname.replace(/\/+$/, "") || "/";
    if (
      p.startsWith("/notifications") ||
      p.startsWith("/messages") ||
      p.startsWith("/settings") ||
      p.startsWith("/profile") ||
      p.startsWith("/search") ||
      p.startsWith("/topic/") ||
      p === "/following" ||
      p.startsWith("/following/")
    ) {
      return false;
    }
    return p === "/" || p === "/feed" || p.startsWith("/feed/");
  };

  const feedState = { ended: false, loading: false };
  const DOM_SEEN = new WeakSet();
  let grid;
  let shell;
  let bootActive = false;

  function sidePanelHTML() {
    return `
      <div class="zh-dg-widget"><h3>Quora 快捷入口</h3>
        <a class="zh-dg-sbtn primary" href="https://www.quora.com/" target="_blank" rel="noopener">首页</a>
        <a class="zh-dg-sbtn ghost" href="https://www.quora.com/following" target="_blank" rel="noopener">关注</a>
        <a class="zh-dg-sbtn ghost" href="https://www.quora.com/answer" target="_blank" rel="noopener">写回答</a>
      </div>
      <div class="zh-dg-widget"><h3>Dark Grid</h3>
        <p class="zh-dg-hotempty">快捷键 <b>Q</b> 藏图，<b>Shift+Q</b> 饱和度轮转。点击卡片正文展开，标题在新标签打开。</p>
      </div>`;
  }

  function parkNative(scraper) {
    if (!scraper) return;
    const sels = [
      "#main_content",
      ".qu-PageWrapper",
      '[class*="PageWrapper"]',
      '[class*="HomePage"]',
      ".pagedlist",
      '[class*="pagedlist"]',
      '[class*="HomeMain"]',
      '[class*="HomeFeed"]',
    ];
    sels.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el || el.closest("#zh-dg-layout, #zh-dg-scraper, #zh-dg-side")) return;
        if (!scraper.contains(el)) {
          try {
            scraper.appendChild(el);
          } catch (_) {}
        }
      });
    });
  }

  function insertLayoutAfterHeader(layout) {
    const header = document.querySelector("header, [role='banner']");
    if (header?.parentElement) {
      header.insertAdjacentElement("afterend", layout);
      return;
    }
    document.body.prepend(layout);
  }

  function absQuoraUrl(href) {
    if (!href) return location.href;
    try {
      return new URL(href, location.origin).href;
    } catch (_) {
      return href;
    }
  }

  function isQuestionPath(path) {
    if (!path || path === "/") return false;
    if (
      /^\/(profile|topic|search|settings|notifications|messages|answer|following|spaces|campaign|about|careers|contact|press|terms|privacy|help|business|api|languages|advertise|cookie|acceptable|copyright|jobs|brand)/i.test(
        path
      )
    ) {
      return false;
    }
    const slug = path.replace(/^\//, "");
    return slug.length > 3 && slug.includes("-");
  }

  function pickImage(node) {
    for (const im of node.querySelectorAll("img")) {
      const src = im.getAttribute("data-src") || im.src || "";
      if (src && !src.startsWith("data:") && !/avatar|icon|emoji|svg|favicon/i.test(src) && (im.naturalWidth || im.width) > 40) {
        return src;
      }
    }
    return "";
  }

  function findFeedRoot() {
    const sc = document.getElementById("zh-dg-scraper");
    if (sc?.querySelector("a[href], .q-text, [class*='answer']")) return sc;
    return (
      document.querySelector("#main_content") ||
      document.querySelector('[class*="pagedlist"]') ||
      document.querySelector('[class*="HomeFeed"]') ||
      document.querySelector("main") ||
      document.body
    );
  }

  function isUpvoteEl(el) {
    const s = ((el.getAttribute("aria-label") || "") + (el.textContent || "")).replace(/\s+/g, " ");
    return /upvote|Upvote|赞同/i.test(s) && !/downvote|Downvote/i.test(s);
  }

  function findCardRootFrom(node) {
    let el = node;
    for (let i = 0; i < 18 && el; i++) {
      const r = el.getBoundingClientRect?.();
      const t = text(el);
      if (r && r.width > 240 && r.height > 100 && t.length > 50) return el;
      el = el.parentElement;
    }
    return node.closest(
      '[class*="pagedlist_item"], [class*="FeedStory"], [class*="FeedUnit"], div.q-box, article, li'
    );
  }

  function findQuestionLink(cardRoot) {
    if (!cardRoot) return null;
    const links = [...cardRoot.querySelectorAll('a[href]')];
    let best = null;
    let bestScore = 0;
    links.forEach((a) => {
      let path = "";
      try {
        path = new URL(a.href, location.origin).pathname;
      } catch (_) {
        return;
      }
      if (!isQuestionPath(path)) return;
      const t = text(a);
      if (t.length < 8) return;
      const score = t.length + (a.querySelector("h1, h2, h3, strong, span[dir='auto']") ? 20 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    });
    return best;
  }

  function parseVotes(node) {
    const raw = text(node);
    const m = raw.match(/([\d,.]+[KMB]?)\s*(Upvotes?|upvotes?|votes?)/i);
    if (!m) return 0;
    let n = m[1].replace(/,/g, "");
    const u = n.slice(-1).toUpperCase();
    if (u === "K") return Math.round(parseFloat(n) * 1000);
    if (u === "M") return Math.round(parseFloat(n) * 1000000);
    return parseInt(n, 10) || 0;
  }

  function parseCard(cardRoot, titleA) {
    if (!cardRoot || !titleA || DOM_SEEN.has(cardRoot)) return null;
    const title = text(titleA);
    if (!title || title.length < 8) return null;
    let path = "";
    try {
      path = new URL(titleA.href, location.origin).pathname;
    } catch (_) {
      return null;
    }
    const excerptEl =
      cardRoot.querySelector(
        ".q-text, [class*='answer_content'], [class*='qtext'], [class*='rendered_qtext'], .puppeteer_test_answer_content"
      ) || cardRoot.querySelector("span[dir='auto'], p");
    let excerpt = text(excerptEl);
    if (!excerpt || excerpt === title) {
      excerpt = text(cardRoot).replace(title, "").slice(0, 240);
    }
    excerpt = excerpt.replace(/Continue Reading|Read more|Upvote|Downvote|Comment|Share|Follow|⋯/gi, " ").trim();
    if (excerpt.length < 10) return null;
    const href = absQuoraUrl(titleA.href);
    DOM_SEEN.add(cardRoot);
    return {
      key: href + "|" + title,
      kind: "answer",
      id: path.split("/").filter(Boolean).pop() || "",
      title,
      href,
      img: pickImage(cardRoot),
      excerpt: excerpt.slice(0, 220),
      votes: parseVotes(cardRoot),
      comments: 0,
      sourceEl: cardRoot,
    };
  }

  function fromDom() {
    const scope = findFeedRoot();
    const out = [];
    const seenKeys = new Set();

    // 策略 1：从 Upvote 按钮向上找卡片（最稳）
    scope.querySelectorAll("button, [role='button'], .q-click-wrapper, a").forEach((el) => {
      if (!isUpvoteEl(el)) return;
      const cardRoot = findCardRootFrom(el);
      const titleA = findQuestionLink(cardRoot);
      const item = parseCard(cardRoot, titleA);
      if (item && !seenKeys.has(item.key)) {
        seenKeys.add(item.key);
        out.push(item);
      }
    });

    // 策略 2：feed 列表项
    scope.querySelectorAll('[class*="pagedlist_item"], [class*="FeedStory"], [class*="FeedUnit"]').forEach((cardRoot) => {
      const titleA = findQuestionLink(cardRoot);
      const item = parseCard(cardRoot, titleA);
      if (item && !seenKeys.has(item.key)) {
        seenKeys.add(item.key);
        out.push(item);
      }
    });

    // 策略 3：问题链接兜底
    if (!out.length) {
      scope.querySelectorAll('a[href]').forEach((a) => {
        let path = "";
        try {
          path = new URL(a.href, location.origin).pathname;
        } catch (_) {
          return;
        }
        if (!isQuestionPath(path)) return;
        const cardRoot = findCardRootFrom(a);
        const item = parseCard(cardRoot, a);
        if (item && !seenKeys.has(item.key)) {
          seenKeys.add(item.key);
          out.push(item);
        }
      });
    }

    return out;
  }

  async function loadFullContent(item) {
    if (item.contentHtml) return item.contentHtml;
    const el = item.sourceEl;
    if (el) {
      const rich =
        el.querySelector(".q-text, [class*='answer_content'], [class*='rendered_qtext'], .puppeteer_test_answer_content") ||
        el.querySelector("span[dir='auto']");
      if (rich?.innerHTML?.trim()) return `<div class="zh-dg-quora-rich">${rich.innerHTML}</div>`;
    }
    return `<p>${esc(item.excerpt || "暂无正文，请点标题打开原页")}</p>`;
  }

  function bindCardActions(root) {
    root.addEventListener("click", (ev) => {
      const proxyBtn = ev.target.closest("[data-proxy]");
      const card = ev.target.closest(".zh-dg-card");
      if (!proxyBtn || !card) return;
      ev.preventDefault();
      ev.stopPropagation();
      const item = grid.store.get(card.getAttribute("data-key"));
      if (!item) return;
      const kind = proxyBtn.getAttribute("data-proxy");
      if (kind === "open" || kind === "share" || kind === "comment") {
        window.open(item.href, "_blank", "noopener");
        return;
      }
      const native = item.sourceEl;
      const btn = native
        ? [...native.querySelectorAll("button, a, [role='button']")].find((b) =>
            /upvote|Upvote/i.test((b.getAttribute("aria-label") || "") + (b.textContent || ""))
          )
        : null;
      if (btn) btn.click();
      else window.open(item.href, "_blank", "noopener");
    });
  }

  function ensureMountedLayout() {
    let layout = document.getElementById("zh-dg-layout");
    if (!layout) {
      shell?.mount();
      layout = document.getElementById("zh-dg-layout");
    }
    if (layout) {
      const header = document.querySelector("header, [role='banner']");
      if (header && layout.previousElementSibling !== header) insertLayoutAfterHeader(layout);
    }
    return layout;
  }

  function sync() {
    const sc = document.getElementById("zh-dg-scraper") || shell?.ensureScraper?.();
    parkNative(sc);
    const items = fromDom();
    if (items.length) grid.render(items);
    else grid.setStatus(`Dark Grid 已启用 · 等待抓取内容…（${items.length} 条）`);
    shell?.placeSideBelowHeader?.();
    grid.layoutCols();
  }

  function triggerNativeScroll() {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const sc = document.getElementById("zh-dg-scraper");
    if (sc) {
      sc.style.height = "100vh";
      sc.style.overflow = "auto";
      sc.scrollTop = sc.scrollHeight;
      sc.style.height = "120px";
      sc.style.overflow = "hidden";
    }
  }

  function loadMore(reason) {
    if (feedState.loading) return;
    feedState.loading = true;
    grid.setLoading(true);
    triggerNativeScroll();
    setTimeout(() => {
      sync();
      feedState.loading = false;
      grid.setLoading(false);
      grid.setStatus(`已加载 ${grid.rendered.size} 条 · ${reason || ""}`);
    }, 800);
  }

  function teardownUi() {
    if (!bootActive) return;
    bootActive = false;
    shell?.teardown();
    grid?.reset();
  }

  function bootUi() {
    if (!isHome()) {
      teardownUi();
      return false;
    }
    if (bootActive) {
      sync();
      return true;
    }
    bootActive = true;
    injectCss(QUORA_CSS);
    document.body.classList.add("zh-dg-v2");
    document.body.classList.remove("zh-dg-hide-imgs");
    applyImgSat(getImgSat());

    grid = createGridEngine(feedState, { icons: ["up", "comment", "share", "open"] });
    shell = createShell({
      hostSelector: "body",
      sideHTML: sidePanelHTML(),
      getHeader: () => document.querySelector("header, [role='banner']"),
      parkNative,
      onReady: () => {
        const layout = document.getElementById("zh-dg-layout");
        if (layout) insertLayoutAfterHeader(layout);
        grid.layoutCols();
        sync();
      },
    });

    shell.mount();
    ensureMountedLayout();

    const shellEl = document.getElementById("zh-dg-shell");
    if (shellEl) {
      grid.bindExpandEvents(shellEl, loadFullContent);
      bindCardActions(shellEl);
    }

    if (!bootUi._bound) {
      bootUi._bound = true;
      bindImageKeys(() => bootActive && isHome(), (msg) => grid.setStatus(msg));
      bindInfiniteScroll({ isActive: () => bootActive && isHome(), onNearEnd: loadMore });
      window.addEventListener("resize", () => {
        if (!bootActive || !isHome()) return;
        clearTimeout(bootUi._rt);
        bootUi._rt = setTimeout(() => grid.layoutCols(), 120);
      });
      const mo = new MutationObserver(() => {
        if (!isHome()) {
          teardownUi();
          return;
        }
        if (!bootActive) return;
        clearTimeout(bootUi._mt);
        bootUi._mt = setTimeout(sync, 250);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });

      let n = 0;
      bootUi._timer = setInterval(() => {
        if (!bootActive || !isHome()) return;
        ensureMountedLayout();
        sync();
        shell.placeSideBelowHeader();
        if ([1, 3, 6, 10, 15].includes(n)) loadMore("boot-" + n);
        n += 1;
        if (n > 30) {
          clearInterval(bootUi._timer);
          bootUi._timer = null;
        }
      }, 800);
    }

    sync();
    return true;
  }

  function tryBoot() {
    if (!isHome()) return;
    if (bootUi()) return;
    bootUi._retry = (bootUi._retry || 0) + 1;
    if (bootUi._retry < 40) setTimeout(tryBoot, 500);
  }

  createRouteWatcher({ isHome, onEnter: tryBoot, onLeave: teardownUi });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryBoot, { once: true });
  } else {
    tryBoot();
  }
})();
