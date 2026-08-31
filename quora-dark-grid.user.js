// ==UserScript==
// @name         Quora 暗色网格首页
// @namespace    https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @version      1.0.0
// @description  参考知乎暗色网格插件，将 Quora 首页重排为多列瀑布流（共享 Dark Grid 核心）
// @author       Elijah-Neverdie
// @homepageURL  https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @supportURL   https://github.com/Elijah-Neverdie/zhihu-dark-grid/issues
// @updateURL    https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/quora-dark-grid.user.js
// @downloadURL  https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/quora-dark-grid.user.js
// @match        https://www.quora.com/*
// @match        https://quora.com/*
// @require      https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/dark-grid-shared.user.js
// @run-at       document-idle
// @grant        GM_addStyle
// @connect      www.quora.com
// @connect      quora.com
// ==/UserScript==

(function () {
  "use strict";

  const DG = window.DarkGridShared;
  if (!DG) {
    console.error("[quora-dark-grid] DarkGridShared 未加载，请确认 @require dark-grid-shared.user.js");
    return;
  }

  const { esc, text, strip, fmt, injectCss, createGridEngine, createShell, applyImgSat, getImgSat, bindImageKeys, createRouteWatcher, bindInfiniteScroll } = DG;

  const QUORA_CSS = `
body.zh-dg-v2{background:#141414!important;color:#e8e8e8!important}
body.zh-dg-v2 header,body.zh-dg-v2 [role="banner"]{
  background:rgba(20,20,20,.96)!important;border-bottom:1px solid var(--dg-line)!important;box-shadow:none!important
}
body.zh-dg-v2 input,body.zh-dg-v2 textarea{
  background:var(--dg-elev)!important;border:1px solid var(--dg-line)!important;color:var(--dg-text)!important
}
body.zh-dg-v2 a{color:var(--dg-overlay-link)}
body.zh-dg-v2 a:hover{color:var(--dg-overlay-link-hover)}
/* 原站信息流移入抓取容器 */
body.zh-dg-v2 #main_content,
body.zh-dg-v2 [class*="Feed"],
body.zh-dg-v2 [class*="Home"],
body.zh-dg-v2 main > div:not(#zh-dg-layout):not(#zh-dg-scraper){
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  max-height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important
}
body.zh-dg-v2 #root > div:not(:has(#zh-dg-layout)){
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  opacity:0!important;pointer-events:none!important
}
body.zh-dg-v2 #root > div:has(#zh-dg-layout){
  position:relative!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;
  opacity:1!important;pointer-events:auto!important
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
      <div class="zh-dg-widget"><h3>说明</h3>
        <p class="zh-dg-hotempty">与知乎插件共用 Dark Grid 核心。快捷键 <b>Q</b> 藏图，<b>Shift+Q</b> 饱和度轮转。操作栏「打开」将在新标签打开原文。</p>
      </div>`;
  }

  function parkNative(scraper) {
    const sels = [
      "#main_content",
      '[class*="pagedlist"]',
      '[class*="Home"]',
      '[class*="Feed"]',
      "main > div",
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
    if (/^\/(profile|topic|search|settings|notifications|messages|answer|following|spaces|campaign)/i.test(path)) {
      return false;
    }
    return path.length > 1;
  }

  function pickImage(node) {
    for (const im of node.querySelectorAll("img")) {
      const src = im.getAttribute("data-src") || im.src || "";
      if (src && !src.startsWith("data:") && !/avatar|icon|emoji|svg/i.test(src) && im.width !== 1) {
        return src;
      }
    }
    return "";
  }

  function findFeedRoot() {
    return (
      document.getElementById("zh-dg-scraper") ||
      document.querySelector("#main_content") ||
      document.querySelector('[class*="pagedlist"]') ||
      document.querySelector("main") ||
      document.body
    );
  }

  function findCardRoot(anchor) {
    let el = anchor;
    for (let i = 0; i < 14 && el; i++) {
      const r = el.getBoundingClientRect?.();
      const t = text(el);
      if (r && r.width > 200 && r.height > 80 && t.length > 40) return el;
      el = el.parentElement;
    }
    return anchor.closest("div.q-box, div[class*='q-box'], div[class*='Answer'], article, li") || anchor.parentElement;
  }

  function parseVotes(node) {
    const raw = text(node);
    const m = raw.match(/([\d,.]+[KMB]?)\s*(Upvotes?|upvotes?|赞同|votes?)/i);
    if (!m) return 0;
    let n = m[1].replace(/,/g, "");
    const u = n.slice(-1).toUpperCase();
    if (u === "K") return Math.round(parseFloat(n) * 1000);
    if (u === "M") return Math.round(parseFloat(n) * 1000000);
    return parseInt(n, 10) || 0;
  }

  function fromDom() {
    const scope = findFeedRoot();
    const out = [];
    const anchors = scope.querySelectorAll('a[href*="/"]');
    anchors.forEach((a) => {
      let path = "";
      try {
        path = new URL(a.href, location.origin).pathname;
      } catch (_) {
        return;
      }
      if (!isQuestionPath(path)) return;
      const title = text(a);
      if (!title || title.length < 8) return;
      const cardRoot = findCardRoot(a);
      if (!cardRoot || DOM_SEEN.has(cardRoot)) return;
      const excerptEl =
        cardRoot.querySelector(".q-text, [class*='answer_content'], [class*='qtext'], [class*='rendered_qtext']") ||
        cardRoot.querySelector("span[dir='auto'], p");
      let excerpt = text(excerptEl);
      if (!excerpt || excerpt === title) {
        excerpt = text(cardRoot).replace(title, "").slice(0, 200);
      }
      excerpt = excerpt.replace(/Continue Reading|Read more|展开|收起/gi, "").trim();
      if (excerpt.length < 12) return;
      const href = absQuoraUrl(a.href);
      const img = pickImage(cardRoot);
      DOM_SEEN.add(cardRoot);
      const key = href + "|" + title;
      out.push({
        key,
        kind: "answer",
        id: path.split("/").filter(Boolean).pop() || "",
        title,
        href,
        img,
        excerpt: excerpt.slice(0, 220),
        votes: parseVotes(cardRoot),
        comments: 0,
        sourceEl: cardRoot,
      });
    });
    return out;
  }

  async function loadFullContent(item) {
    if (item.contentHtml) return item.contentHtml;
    const el = item.sourceEl;
    if (el) {
      const rich =
        el.querySelector(".q-text, [class*='answer_content'], [class*='rendered_qtext']") ||
        el.querySelector("span[dir='auto']");
      if (rich) {
        const html = rich.innerHTML || "";
        if (html.trim()) return `<div class="zh-dg-quora-rich">${html}</div>`;
      }
    }
    return `<p>${esc(item.excerpt || "暂无正文，请点标题打开原页")}</p>`;
  }

  function proxyOpen(item) {
    window.open(item.href, "_blank", "noopener");
  }

  function bindCardActions(root) {
    root.addEventListener("click", (ev) => {
      const proxyBtn = ev.target.closest("[data-proxy]");
      const card = ev.target.closest(".zh-dg-card");
      if (!proxyBtn || !card) return;
      ev.preventDefault();
      ev.stopPropagation();
      const key = card.getAttribute("data-key");
      const item = grid.store.get(key);
      if (!item) return;
      const kind = proxyBtn.getAttribute("data-proxy");
      if (kind === "open" || kind === "share" || kind === "comment" || kind === "more") {
        proxyOpen(item);
        return;
      }
      const native = item.sourceEl;
      if (!native) {
        proxyOpen(item);
        return;
      }
      const labels =
        kind === "vote-up"
          ? /upvote|赞同|Upvote/i
          : kind === "vote-down"
            ? /downvote|反对/i
            : kind === "collect"
              ? /bookmark|收藏|save/i
              : kind === "like"
                ? /thank|喜欢|heart/i
                : null;
      if (!labels) {
        proxyOpen(item);
        return;
      }
      const btn = [...native.querySelectorAll("button, a, [role='button']")].find((b) =>
        labels.test((b.getAttribute("aria-label") || "") + (b.textContent || ""))
      );
      if (btn) btn.click();
      else proxyOpen(item);
    });
  }

  function sync() {
    parkNative(document.getElementById("zh-dg-scraper"));
    const items = fromDom();
    if (items.length) grid.render(items);
    shell.placeSideBelowHeader();
    grid.layoutCols();
  }

  function triggerNativeScroll() {
    const sc = document.getElementById("zh-dg-scraper");
    if (!sc) return;
    sc.style.height = "100vh";
    sc.style.overflow = "auto";
    sc.scrollTop = sc.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
    sc.style.height = "120px";
    sc.style.overflow = "hidden";
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
    }, 600);
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
      return;
    }
    if (bootActive) {
      sync();
      return;
    }
    bootActive = true;
    injectCss(QUORA_CSS);
    document.body.classList.remove("zh-dg-hide-imgs");
    applyImgSat(getImgSat());

    grid = createGridEngine(feedState, {
      icons: ["up", "comment", "share", "open"],
      onStatus: () => {},
    });

    shell = createShell({
      hostSelector: "#root, main, body",
      sideHTML: sidePanelHTML(),
      getHeader: () => document.querySelector("header, [role='banner']"),
      parkNative,
      onReady: () => {
        grid.layoutCols();
        sync();
      },
    });

    shell.mount();
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
        bootUi._mt = setTimeout(sync, 220);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      bootUi._mo = mo;

      let n = 0;
      bootUi._timer = setInterval(() => {
        if (!bootActive || !isHome()) return;
        sync();
        shell.placeSideBelowHeader();
        if ([1, 3, 6, 10].includes(n)) loadMore("boot-" + n);
        n += 1;
        if (n > 24) {
          clearInterval(bootUi._timer);
          bootUi._timer = null;
        }
      }, 700);
    }

    sync();
  }

  createRouteWatcher({ isHome, onEnter: bootUi, onLeave: teardownUi });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => (isHome() ? bootUi() : teardownUi()), { once: true });
  } else if (isHome()) bootUi();
})();
