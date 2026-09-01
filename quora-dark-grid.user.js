// ==UserScript==
// @name         Quora 暗色网格首页
// @namespace    https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @version      1.0.3
// @description  Quora 首页暗色多列瀑布流；W 切换原站对比；GraphQL 拦截加速加载
// @author       Elijah-Neverdie
// @homepageURL  https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @supportURL   https://github.com/Elijah-Neverdie/zhihu-dark-grid/issues
// @updateURL    https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/quora-dark-grid.user.js
// @downloadURL  https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/quora-dark-grid.user.js
// @match        https://www.quora.com/*
// @match        https://quora.com/*
// @require      https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/dark-grid-shared.user.js
// @run-at       document-start
// @inject-into  page
// @grant        GM_addStyle
// @connect      www.quora.com
// @connect      quora.com
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  "use strict";

  const DG =
    (typeof globalThis !== "undefined" && globalThis.DarkGridShared) ||
    window.DarkGridShared;

  if (!DG) {
    console.error("[quora-dark-grid] DarkGridShared 未加载");
    return;
  }

  const { esc, text, injectCss, createGridEngine, createShell, applyImgSat, getImgSat, bindImageKeys, bindNativeViewKey, createRouteWatcher, bindInfiniteScroll } = DG;

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
  max-height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;visibility:hidden!important
}
body.zh-dg-v2 #root > div:not(:has(#zh-dg-layout)):not(:has(#zh-dg-scraper)){
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  opacity:0!important;pointer-events:none!important;visibility:hidden!important
}
/* 泵送加载：临时全视口滚动原站 Feed，触发 Quora 懒加载 */
body.zh-dg-v2 #zh-dg-scraper.zh-dg-scraper-live{
  position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;
  overflow:auto!important;opacity:0.02!important;z-index:2!important;pointer-events:none!important;contain:none!important
}
body.zh-dg-v2 #zh-dg-scraper.zh-dg-scraper-live *{pointer-events:none!important}
/* W 键：切换原站 UI 对比 */
body.zh-dg-v2.zh-dg-native-view{background:revert!important;color:revert!important}
body.zh-dg-v2.zh-dg-native-view #zh-dg-layout,
body.zh-dg-v2.zh-dg-native-view #zh-dg-side{display:none!important}
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper{
  position:relative!important;left:auto!important;top:auto!important;width:100%!important;height:auto!important;
  max-height:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important;
  pointer-events:auto!important;z-index:4!important;margin:0!important;padding:0!important;border:0!important
}
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper #main_content,
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper #main_content > *,
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper .qu-PageWrapper,
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="PageWrapper"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="HomePage"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="HomeMain"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="HomeFeed"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="SideBar"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="RightBar"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="LeftRail"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="RightRail"],
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper .pagedlist,
body.zh-dg-v2.zh-dg-native-view #zh-dg-scraper [class*="pagedlist"]{
  position:relative!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;
  max-height:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important;
  pointer-events:auto!important;margin:revert!important;padding:revert!important;border:revert!important
}
body.zh-dg-v2.zh-dg-native-view header,
body.zh-dg-v2.zh-dg-native-view [role="banner"]{
  background:revert!important;border-bottom:revert!important;box-shadow:revert!important;color:revert!important
}
body.zh-dg-v2.zh-dg-native-view input,
body.zh-dg-v2.zh-dg-native-view textarea{
  background:revert!important;border:revert!important;color:revert!important
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

  const feedState = { ended: false, loading: false, pumpAttempts: 0, gqlHits: 0 };
  const DOM_SEEN = new WeakSet();
  let grid;
  let shell;
  let bootActive = false;
  let fillChain = Promise.resolve();

  function targetCount() {
    const w = document.getElementById("zh-dg-grid")?.clientWidth || window.innerWidth - 360;
    const cols = Math.max(2, Math.floor((w + 14) / (280 + 14)));
    const rows = Math.max(3, Math.ceil(window.innerHeight / 300) + 2);
    return cols * rows;
  }

  function sidePanelHTML() {
    return `
      <div class="zh-dg-widget"><h3>Quora 快捷入口</h3>
        <a class="zh-dg-sbtn primary" href="https://www.quora.com/" target="_blank" rel="noopener">首页</a>
        <a class="zh-dg-sbtn ghost" href="https://www.quora.com/following" target="_blank" rel="noopener">关注</a>
        <a class="zh-dg-sbtn ghost" href="https://www.quora.com/answer" target="_blank" rel="noopener">写回答</a>
      </div>
      <div class="zh-dg-widget"><h3>Dark Grid</h3>
        <p class="zh-dg-hotempty">快捷键 <b>Q</b> 藏图，<b>Shift+Q</b> 饱和度，<b>W</b> 切换原站 UI 对比。</p>
      </div>`;
  }

  function parkNative(scraper) {
    if (!scraper) return;
    [
      "#main_content",
      ".qu-PageWrapper",
      '[class*="PageWrapper"]',
      '[class*="HomePage"]',
      ".pagedlist",
      '[class*="pagedlist"]',
      '[class*="HomeMain"]',
      '[class*="HomeFeed"]',
    ].forEach((sel) => {
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
    if (!node) return "";
    if (typeof node === "string") return /https?:\/\//.test(node) ? node : "";
    if (node.url && /https?:\/\//.test(node.url)) return node.url;
    if (node.imageUrl) return node.imageUrl;
    if (!node.querySelectorAll) return "";
    for (const im of node.querySelectorAll("img")) {
      const src = im.getAttribute("data-src") || im.src || "";
      if (src && !src.startsWith("data:") && !/avatar|icon|emoji|svg|favicon/i.test(src) && (im.naturalWidth || im.width) > 40) {
        return src;
      }
    }
    return "";
  }

  function gqlPlain(node) {
    if (!node) return "";
    if (typeof node === "string") return node.replace(/\s+/g, " ").trim();
    if (node.legacyPlainText) return String(node.legacyPlainText).trim();
    if (node.plainText) return String(node.plainText).trim();
    if (node.text) return gqlPlain(node.text);
    if (Array.isArray(node.sections)) return node.sections.map(gqlPlain).filter(Boolean).join(" ").trim();
    if (node.content) return gqlPlain(node.content);
    if (node.excerpt) return gqlPlain(node.excerpt);
    return "";
  }

  function buildItem({ title, href, excerpt, img, votes, id, kind, sourceEl }) {
    title = String(title || "").trim();
    href = absQuoraUrl(href || location.href);
    excerpt = String(excerpt || title || "").trim();
    if (!title || title.length < 6) return null;
    if (excerpt.length < 6) excerpt = title;
    return {
      key: href + "|" + title + "|" + (id || excerpt.slice(0, 32)),
      kind: kind || "answer",
      id: id || "",
      title,
      href,
      img: img || "",
      excerpt: excerpt.slice(0, 240),
      votes: Number(votes) || 0,
      comments: 0,
      sourceEl: sourceEl || null,
    };
  }

  function fromGraphQLNode(node) {
    if (!node || typeof node !== "object") return null;
    const q = node.question || node.target?.question || node.story?.question || node.post?.question;
    const title =
      q?.title ||
      node.questionTitle ||
      node.title ||
      node.target?.title ||
      node.story?.title ||
      gqlPlain(node.question) ||
      "";
    if (!title || title.length < 6) return null;

    let href =
      q?.url ||
      node.url ||
      node.permalink ||
      node.target?.url ||
      node.story?.url ||
      "";
    if (!href && q?.qid) href = `https://www.quora.com/q/${q.qid}`;
    if (!href && q?.id) href = `https://www.quora.com/q/${q.id}`;
    if (!href && node.tribeItemUrl) href = node.tribeItemUrl;

    const ans =
      node.answer ||
      node.target?.answer ||
      node.story?.answer ||
      node.combinedAnswerFeedItem?.answer ||
      node;
    let excerpt =
      gqlPlain(ans?.content) ||
      gqlPlain(ans?.excerpt) ||
      gqlPlain(node.content) ||
      gqlPlain(node.excerpt) ||
      gqlPlain(node.summary) ||
      gqlPlain(node.description) ||
      "";
    if (!excerpt) excerpt = title;

    const votes =
      ans?.numUpvotes ??
      ans?.upvoteCount ??
      node.numUpvotes ??
      node.upvoteCount ??
      node.voteCount ??
      0;

    const img =
      pickImage(ans?.thumbnail) ||
      pickImage(node.thumbnail) ||
      pickImage(node.image) ||
      pickImage(node);

    const id = String(ans?.aid || ans?.id || node.id || q?.qid || q?.id || "").trim();

    return buildItem({ title, href, excerpt, img, votes, id, kind: "answer" });
  }

  function fromGraphQL(data) {
    const out = [];
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || depth > 16) return;
      if (Array.isArray(node)) {
        node.forEach((v) => walk(v, depth + 1));
        return;
      }
      if (typeof node !== "object") return;
      const item = fromGraphQLNode(node);
      if (item && !seen.has(item.key)) {
        seen.add(item.key);
        out.push(item);
      }
      for (const k of Object.keys(node)) {
        if (k === "__typename" || k === "viewer") continue;
        walk(node[k], depth + 1);
      }
    };
    walk(data, 0);
    return out;
  }

  function onNetworkJson(data) {
    if (!bootActive || !grid) return;
    const items = fromGraphQL(data);
    if (!items.length) return;
    feedState.gqlHits += 1;
    const n = grid.render(items);
    if (n) grid.layoutCols();
    maybeFill("gql");
  }

  function installNetworkHook() {
    if (installNetworkHook._on) return;
    installNetworkHook._on = true;
    const isGql = (url) => /graphql|gql_para|gql-para|gql_POST/i.test(String(url || ""));

    const origFetch = window.fetch;
    window.fetch = function (...args) {
      const res = origFetch.apply(this, args);
      try {
        const url = args[0]?.url || args[0] || "";
        if (isGql(url)) {
          res
            .then((r) => {
              if (!r.ok) return;
              return r
                .clone()
                .json()
                .then(onNetworkJson)
                .catch(() => {});
            })
            .catch(() => {});
        }
      } catch (_) {}
      return res;
    };

    const xOpen = XMLHttpRequest.prototype.open;
    const xSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._zhDgUrl = url;
      return xOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener(
        "load",
        function () {
          try {
            if (!isGql(this._zhDgUrl)) return;
            onNetworkJson(JSON.parse(this.responseText));
          } catch (_) {}
        },
        { once: true }
      );
      return xSend.apply(this, args);
    };
  }

  installNetworkHook();

  function findFeedRoot() {
    const sc = document.getElementById("zh-dg-scraper");
    if (sc?.querySelector(".q-text, [class*='answer'], a[href], button")) return sc;
    return (
      document.querySelector("#main_content") ||
      document.querySelector('[class*="pagedlist"]') ||
      document.querySelector('[class*="HomeFeed"]') ||
      document.body
    );
  }

  function isUpvoteEl(el) {
    const s = ((el.getAttribute("aria-label") || "") + (el.textContent || "")).replace(/\s+/g, " ");
    return /upvote|Upvote/i.test(s) && !/downvote|Downvote/i.test(s);
  }

  function findCardRootFrom(node) {
    let el = node;
    for (let i = 0; i < 20 && el; i++) {
      const r = el.getBoundingClientRect?.();
      const t = text(el);
      if (r && r.width > 200 && r.height > 60 && t.length > 30) return el;
      el = el.parentElement;
    }
    return node.closest(
      '[class*="pagedlist_item"], [class*="FeedStory"], [class*="FeedUnit"], [class*="Story"], div.q-box, article, li'
    );
  }

  function findQuestionLink(cardRoot) {
    if (!cardRoot) return null;
    let best = null;
    let bestScore = 0;
    cardRoot.querySelectorAll("a[href]").forEach((a) => {
      let path = "";
      try {
        path = new URL(a.href, location.origin).pathname;
      } catch (_) {
        return;
      }
      if (!isQuestionPath(path)) return;
      const t = text(a);
      if (t.length < 6) return;
      const score = t.length + (a.matches("h1 a, h2 a, h3 a, strong, span[dir='auto']") ? 25 : 0);
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
    if (!title || title.length < 6) return null;
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
    if (!excerpt || excerpt === title) excerpt = text(cardRoot).replace(title, "").slice(0, 260);
    excerpt = excerpt.replace(/Continue Reading|Read more|Upvote|Downvote|Comment|Share|Follow|⋯/gi, " ").trim();
    if (excerpt.length < 6) excerpt = title;
    const href = absQuoraUrl(titleA.href);
    DOM_SEEN.add(cardRoot);
    return buildItem({
      title,
      href,
      excerpt,
      img: pickImage(cardRoot),
      votes: parseVotes(cardRoot),
      id: path.split("/").filter(Boolean).pop() || "",
      sourceEl: cardRoot,
    });
  }

  function fromDom() {
    const scope = findFeedRoot();
    const out = [];
    const seenKeys = new Set();

    const push = (item) => {
      if (item && !seenKeys.has(item.key)) {
        seenKeys.add(item.key);
        out.push(item);
      }
    };

    scope.querySelectorAll("button, [role='button'], .q-click-wrapper, a, div").forEach((el) => {
      if (!isUpvoteEl(el)) return;
      push(parseCard(findCardRootFrom(el), findQuestionLink(findCardRootFrom(el))));
    });

    scope.querySelectorAll('[class*="pagedlist_item"], [class*="FeedStory"], [class*="FeedUnit"], [class*="Story"]').forEach((cardRoot) => {
      push(parseCard(cardRoot, findQuestionLink(cardRoot)));
    });

    scope.querySelectorAll(".q-text, [class*='answer_content'], .puppeteer_test_answer_content").forEach((rich) => {
      const cardRoot = findCardRootFrom(rich);
      push(parseCard(cardRoot, findQuestionLink(cardRoot)));
    });

    if (out.length < 4) {
      scope.querySelectorAll("a[href]").forEach((a) => {
        let path = "";
        try {
          path = new URL(a.href, location.origin).pathname;
        } catch (_) {
          return;
        }
        if (!isQuestionPath(path)) return;
        push(parseCard(findCardRootFrom(a), a));
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

  function sync() {
    const sc = document.getElementById("zh-dg-scraper") || shell?.ensureScraper?.();
    parkNative(sc);
    const items = fromDom();
    const n = items.length ? grid.render(items) : 0;
    if (!n && grid.rendered.size === 0) {
      grid.setStatus(`Dark Grid 已启用 · 正在拉取…（GraphQL ${feedState.gqlHits} 次）`);
    } else {
      grid.setStatus(`已加载 ${grid.rendered.size} 条 · DOM+${feedState.gqlHits}`);
    }
    shell?.placeSideBelowHeader?.();
    grid.layoutCols();
    return grid.rendered.size;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function pumpNativeFeed(rounds) {
    const sc = document.getElementById("zh-dg-scraper");
    if (!sc) return;
    sc.classList.add("zh-dg-scraper-live");
    const prev = sc.style.cssText;
    try {
      for (let i = 0; i < rounds; i++) {
        const before = grid.rendered.size;
        sc.scrollTop = sc.scrollHeight;
        window.scrollTo(0, document.documentElement.scrollHeight);
        sc.dispatchEvent(new WheelEvent("wheel", { deltaY: 1200, bubbles: true, cancelable: true }));
        window.dispatchEvent(new WheelEvent("wheel", { deltaY: 1200, bubbles: true, cancelable: true }));
        await sleep(280);
        sync();
        if (grid.rendered.size >= targetCount()) break;
        if (grid.rendered.size === before && i >= 3) break;
      }
    } finally {
      sc.classList.remove("zh-dg-scraper-live");
      sc.style.cssText = prev;
    }
  }

  function maybeFill(reason) {
    if (!bootActive || !isHome()) return;
    if (grid.rendered.size >= targetCount()) return;
    if (feedState.pumpAttempts >= 25) return;
    queueFill(reason);
  }

  function queueFill(reason) {
    fillChain = fillChain.then(() => ensureFilled(reason)).catch(() => {});
  }

  async function ensureFilled(reason) {
    if (!bootActive || !isHome() || feedState.loading) return;
    if (grid.rendered.size >= targetCount()) return;
    feedState.loading = true;
    feedState.pumpAttempts += 1;
    grid.setLoading(true);
    grid.setStatus(`已加载 ${grid.rendered.size} 条 · 正在填充…`);
    try {
      sync();
      await pumpNativeFeed(8);
      sync();
    } finally {
      feedState.loading = false;
      grid.setLoading(false);
      grid.setStatus(`已加载 ${grid.rendered.size} 条 · ${reason || "fill"}`);
    }
    if (grid.rendered.size < targetCount() && feedState.pumpAttempts < 25) {
      setTimeout(() => maybeFill("retry"), 500);
    }
  }

  function loadMore(reason) {
    queueFill(reason || "scroll");
  }

  function teardownUi() {
    if (!bootActive) return;
    bootActive = false;
    feedState.pumpAttempts = 0;
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
      maybeFill("resync");
      return true;
    }
    bootActive = true;
    feedState.pumpAttempts = 0;
    injectCss(QUORA_CSS);
    document.body.classList.add("zh-dg-v2");
    document.body.classList.remove("zh-dg-hide-imgs", "zh-dg-native-view");
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
        queueFill("boot");
      },
    });

    shell.mount();
    const layout = document.getElementById("zh-dg-layout");
    if (layout) insertLayoutAfterHeader(layout);

    const shellEl = document.getElementById("zh-dg-shell");
    if (shellEl) {
      grid.bindExpandEvents(shellEl, loadFullContent);
      bindCardActions(shellEl);
    }

    if (!bootUi._bound) {
      bootUi._bound = true;
      bindImageKeys(() => bootActive && isHome(), (msg) => grid.setStatus(msg));
      bindNativeViewKey(() => bootActive && isHome(), (msg) => grid.setStatus(msg));
      bindInfiniteScroll({ isActive: () => bootActive && isHome(), onNearEnd: loadMore, rootMargin: "2400px 0px" });

      window.addEventListener("resize", () => {
        if (!bootActive || !isHome()) return;
        clearTimeout(bootUi._rt);
        bootUi._rt = setTimeout(() => {
          grid.layoutCols();
          maybeFill("resize");
        }, 120);
      });

      const mo = new MutationObserver(() => {
        if (!isHome()) {
          teardownUi();
          return;
        }
        if (!bootActive) return;
        clearTimeout(bootUi._mt);
        bootUi._mt = setTimeout(() => {
          sync();
          maybeFill("mut");
        }, 120);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });

      const scMo = () => {
        const sc = document.getElementById("zh-dg-scraper");
        if (!sc) {
          setTimeout(scMo, 300);
          return;
        }
        const obs = new MutationObserver(() => {
          if (!bootActive) return;
          clearTimeout(scMo._t);
          scMo._t = setTimeout(sync, 80);
        });
        obs.observe(sc, { childList: true, subtree: true });
      };
      scMo();
    }

    sync();
    queueFill("boot");
    return true;
  }

  function tryBoot() {
    if (!isHome()) return;
    if (document.body) bootUi();
    else bootUi._retry = setTimeout(tryBoot, 200);
  }

  createRouteWatcher({ isHome, onEnter: tryBoot, onLeave: teardownUi });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryBoot, { once: true });
  } else {
    tryBoot();
  }
})();
