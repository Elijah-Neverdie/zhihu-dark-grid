// ==UserScript==
// @name         知乎暗色网格首页
// @namespace    https://github.com/local/zhihu-dark-grid
// @version      3.2.5
// @description  暗色深灰瀑布流：按原始顺序分列、无空隙、藏图不换列
// @author       local
// @match        https://www.zhihu.com/*
// @run-at       document-start
// @inject-into  page
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      www.zhihu.com
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";

  const isHome = () => {
    const p = location.pathname;
    return p === "/" || p === "/follow" || p.startsWith("/follow");
  };

  const feedState = {
    nextUrl: null,
    sessionToken: null,
    afterId: null,
    page: 1,
    ended: false,
    loading: false,
    intercepted: 0,
  };

  function dbg(payload) {
    try {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "POST",
          url: "http://127.0.0.1:8767/",
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({ ...payload, href: location.href, t: Date.now() }),
          anonymous: true,
        });
      }
    } catch (_) {}
  }

  function getXsrf() {
    const m = document.cookie.match(/(?:^|;\s*)_xsrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function remember(json, requestUrl) {
    if (!json || typeof json !== "object") return;
    feedState.intercepted += 1;
    if (json.paging?.next) feedState.nextUrl = json.paging.next;
    if (json.paging?.is_end) feedState.ended = true;
    try {
      const u = new URL(requestUrl || feedState.nextUrl || "", location.origin);
      const st = u.searchParams.get("session_token");
      const after = u.searchParams.get("after_id");
      const pn = u.searchParams.get("page_number");
      if (st) feedState.sessionToken = st;
      if (after != null) feedState.afterId = after;
      if (pn) feedState.page = Number(pn) || feedState.page;
    } catch (_) {}
    if (Array.isArray(json.data) && json.data.length) {
      window.dispatchEvent(new CustomEvent("zh-dg-data", { detail: json }));
    }
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const p = _fetch(input, init);
    if (url && /api\/v3\/feed\/topstory\/recommend/i.test(String(url))) {
      p.then((res) => {
        res
          .clone()
          .json()
          .then((j) => remember(j, String(url)))
          .catch(() => {});
      }).catch(() => {});
    }
    return p;
  };
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__zhUrl = url;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__zhUrl && /api\/v3\/feed\/topstory\/recommend/i.test(String(this.__zhUrl))) {
      this.addEventListener("load", () => {
        try {
          remember(JSON.parse(this.responseText), String(this.__zhUrl));
        } catch (_) {}
      });
    }
    return _send.apply(this, arguments);
  };

  function buildNextUrl() {
    if (feedState.nextUrl) return feedState.nextUrl;
    const u = new URL("https://www.zhihu.com/api/v3/feed/topstory/recommend");
    u.searchParams.set("desktop", "true");
    u.searchParams.set("limit", "10");
    u.searchParams.set("action", "down");
    u.searchParams.set("page_number", String((feedState.page || 1) + 1));
    if (feedState.sessionToken) u.searchParams.set("session_token", feedState.sessionToken);
    u.searchParams.set(
      "after_id",
      String(feedState.afterId != null ? feedState.afterId : Math.max((window.__ZH_DG_COUNT__ || 6) - 1, 5))
    );
    return u.toString();
  }

  async function apiFetch(url, options = {}) {
    const headers = Object.assign(
      {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "fetch",
      },
      options.headers || {}
    );
    const xsrf = getXsrf();
    if (xsrf) {
      headers["X-Xsrftoken"] = xsrf;
      headers["x-xsrftoken"] = xsrf;
    }
    const res = await _fetch(url, {
      credentials: "include",
      ...options,
      headers,
    });
    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch (_) {}
    if (!res.ok) {
      const msg =
        (json && (json.error?.message || json.message || json.msg)) ||
        "HTTP " + res.status;
      throw new Error(msg);
    }
    return json != null ? json : raw;
  }

  async function fetchMore() {
    if (feedState.loading || feedState.ended) {
      return { ok: false, reason: feedState.ended ? "ended" : "loading" };
    }
    feedState.loading = true;
    try {
      const url = buildNextUrl();
      const json = await apiFetch(url);
      remember(json, url);
      feedState.page = (feedState.page || 1) + 1;
      dbg({ event: "fetchMore", dataLen: json.data?.length, totalHint: window.__ZH_DG_COUNT__ });
      return { ok: true, json };
    } catch (e) {
      dbg({ event: "fetchMoreError", error: String(e && e.message || e) });
      return { ok: false, reason: String(e && e.message || e) };
    } finally {
      feedState.loading = false;
    }
  }

  const CSS = `
html,body,#root{background:#141414!important;color:#e8e8e8!important}
body.zh-dg-v2{
  --dg-card:#1e1e1e;--dg-card2:#262626;--dg-line:rgba(255,255,255,.08);
  --dg-text:#e8e8e8;--dg-sub:#a3a3a3;--dg-mute:#737373;--dg-accent:#9a9a9a;
  --dg-elev:#242424;--dg-max:100%;--dg-side:280px;overflow-x:hidden!important
}
body.zh-dg-v2 .AppHeader,body.zh-dg-v2 header[role=banner]{
  background:rgba(20,20,20,.96)!important;border-bottom:1px solid var(--dg-line)!important;box-shadow:none!important;
  width:100%!important;max-width:none!important
}
body.zh-dg-v2 .AppHeader-inner,
body.zh-dg-v2 .AppHeader > div,
body.zh-dg-v2 header[role=banner] > div{
  max-width:none!important;width:100%!important;margin:0!important;padding-left:20px!important;padding-right:20px!important;box-sizing:border-box!important
}
/* 移除左上角「知乎」字样 / Logo（不要误伤带 svg 的其它入口） */
body.zh-dg-v2 .AppHeader-logo,
body.zh-dg-v2 a.AppHeader-logoLink,
body.zh-dg-v2 .AppHeader .ZhihuLogo,
body.zh-dg-v2 .AppHeader a[aria-label="知乎"],
body.zh-dg-v2 .AppHeader a[aria-label="知乎首页"],
body.zh-dg-v2 .zh-dg-hide-logo{display:none!important}
/* 恢复顶栏消息/私信等 SVG、图标可见性（深色主题下原 fill 常变成「消失」） */
body.zh-dg-v2 .AppHeader svg,
body.zh-dg-v2 header[role=banner] svg{
  color:#d4d4d4!important;fill:currentColor!important;opacity:1!important;visibility:visible!important;
  width:auto!important;height:auto!important;max-width:28px;max-height:28px
}
body.zh-dg-v2 .AppHeader svg [fill]:not([fill="none"]),
body.zh-dg-v2 header[role=banner] svg [fill]:not([fill="none"]){fill:currentColor!important}
body.zh-dg-v2 .AppHeader svg [stroke]:not([stroke="none"]),
body.zh-dg-v2 header[role=banner] svg [stroke]:not([stroke="none"]){stroke:currentColor!important}
body.zh-dg-v2 .AppHeader img,
body.zh-dg-v2 header[role=banner] img{
  opacity:1!important;visibility:visible!important;display:inline-block!important
}
body.zh-dg-v2 .AppHeader .CssSvgIcon,
body.zh-dg-v2 .AppHeader .Zi,
body.zh-dg-v2 .AppHeader [class*="Icon"]{
  color:#d4d4d4!important;opacity:1!important;visibility:visible!important
}
#zh-dg-actions,#zh-dg-guess{display:none!important}
body.zh-dg-v2 .SearchBar-input,body.zh-dg-v2 .SearchBar input{
  background:var(--dg-elev)!important;border:1px solid var(--dg-line)!important;border-radius:999px!important;color:var(--dg-text)!important;box-shadow:none!important
}
body.zh-dg-v2 .Button--primary,body.zh-dg-v2 .Button--blue{
  background:#3a3a3a!important;border-color:#4a4a4a!important;color:#fff!important;border-radius:10px!important
}
body.zh-dg-v2 .Topstory-container,body.zh-dg-v2 .GlobalSideBar,body.zh-dg-v2 .Topstory-sideBar,
body.zh-dg-v2 .Footer,body.zh-dg-v2 footer,body.zh-dg-v2 .CornerButtons,body.zh-dg-v2 .Adboard{display:none!important}
#zh-dg-scraper{position:fixed!important;left:-10000px!important;top:0!important;width:860px!important;height:80vh!important;overflow:auto!important;opacity:0!important;pointer-events:none!important;z-index:-1!important}
#zh-dg-scraper .Topstory-container,#zh-dg-scraper .Card,#zh-dg-scraper .Topstory-recommend,#zh-dg-scraper .GlobalSideBar{display:block!important;position:static!important;opacity:1!important;height:auto!important;width:auto!important}
#zh-dg-shell{max-width:var(--dg-max);margin:12px auto 64px;padding:0 20px 100px;display:grid;grid-template-columns:minmax(0,1fr) var(--dg-side);gap:16px;align-items:start;box-sizing:border-box}
#zh-dg-main{min-width:0}
#zh-dg-status{color:var(--dg-mute);font-size:12px;margin-bottom:8px;min-height:18px}
/* 按原始顺序从左到右分列；同列内上下紧贴，藏图只收高度、不换列 */
#zh-dg-grid,.zh-dg-skel{
  display:flex;align-items:flex-start;gap:14px;
}
.zh-dg-col{
  flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:14px;
}
.zh-dg-card{
  display:block;width:100%;margin:0;min-width:0;
  background:var(--dg-card);border:1px solid var(--dg-line);border-radius:14px;
  overflow:hidden;box-sizing:border-box;transition:border-color .15s ease;
}
.zh-dg-card:hover{border-color:rgba(255,255,255,.22)}
.zh-dg-card.is-expanded{border-color:rgba(255,255,255,.35)}
.zh-dg-card .hd{padding:14px 14px 0}
.zh-dg-card a.title{
  color:var(--dg-text)!important;text-decoration:none!important;font-size:15px;font-weight:650;
  line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden
}
.zh-dg-card.is-expanded a.title{-webkit-line-clamp:unset;display:block}
.zh-dg-body{padding:10px 14px 0;cursor:pointer}
.zh-dg-media{width:100%;border-radius:10px;overflow:hidden;background:#111;margin-bottom:10px;aspect-ratio:16/10}
.zh-dg-media img{width:100%;height:100%;object-fit:cover;display:block}
.zh-dg-card.has-img .zh-dg-media{aspect-ratio:auto;max-height:280px}
.zh-dg-card.has-img .zh-dg-media img{height:auto;max-height:280px;object-fit:cover}
/* 纯文本卡片 */
.zh-dg-textblock{
  margin:0 0 4px;padding:16px 14px;border-radius:12px;
  background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.06);position:relative;min-height:96px;
}
.zh-dg-textblock::before{
  content:"";position:absolute;left:12px;top:12px;bottom:12px;width:3px;border-radius:3px;
  background:linear-gradient(180deg,#b0b0b0,#6e6e6e)
}
.zh-dg-excerpt{
  margin:0;padding-left:12px;font-size:13px;line-height:1.7;color:var(--dg-sub);
  display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;letter-spacing:.2px
}
.zh-dg-card.is-text .zh-dg-excerpt{-webkit-line-clamp:8;color:#cfcfcf;font-size:14px}
.zh-dg-full{
  display:none;margin-top:8px;padding:12px 14px;border-radius:12px;
  background:rgba(0,0,0,.28);border:1px solid var(--dg-line);
  color:var(--dg-sub);font-size:14px;line-height:1.75;max-height:520px;overflow:auto
}
.zh-dg-card.is-expanded .zh-dg-full{display:block}
.zh-dg-card.is-expanded .zh-dg-excerpt,.zh-dg-card.is-expanded .zh-dg-textblock{display:none}
.zh-dg-full img,.zh-dg-full video{max-width:100%!important;height:auto!important;border-radius:8px}
.zh-dg-full p{margin:0 0 .8em}
.zh-dg-hint{margin-top:8px;font-size:12px;color:var(--dg-mute)}
.zh-dg-foot{
  display:flex;align-items:center;gap:8px;padding:10px 12px 12px;color:var(--dg-mute);font-size:12px
}
.zh-dg-btnx{
  appearance:none;border:0;background:transparent;color:var(--dg-mute);cursor:pointer;
  display:inline-flex;align-items:center;gap:4px;padding:6px 8px;border-radius:8px;font-size:12px
}
.zh-dg-btnx:hover{background:rgba(255,255,255,.05);color:var(--dg-text)}
.zh-dg-btnx.is-on{color:#d0d0d0}
.zh-dg-btnx .ico{color:#c0c0c0}
.zh-dg-more{margin-left:auto}
.zh-dg-comments{
  display:none;margin:0 12px 12px;padding:10px 12px;border-radius:12px;
  background:rgba(0,0,0,.28);border:1px solid var(--dg-line);max-height:420px;overflow:auto
}
.zh-dg-card.is-comments .zh-dg-comments{display:block}
.zh-dg-ccompose{display:flex;flex-direction:column;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.06)}
.zh-dg-ccompose textarea{
  width:100%;min-height:64px;resize:vertical;box-sizing:border-box;border-radius:10px;
  border:1px solid var(--dg-line);background:var(--dg-elev);color:var(--dg-text);
  padding:8px 10px;font-size:13px;line-height:1.5;outline:none
}
.zh-dg-ccompose textarea:focus{border-color:rgba(255,255,255,.28)}
.zh-dg-ccompose .row{display:flex;align-items:center;gap:8px}
.zh-dg-ccompose .hint{flex:1;font-size:11px;color:var(--dg-mute);min-height:16px}
.zh-dg-ccompose .send{
  appearance:none;border:0;border-radius:8px;background:#3f3f3f;color:#fff;
  padding:6px 12px;font-size:12px;cursor:pointer
}
.zh-dg-ccompose .send:disabled{opacity:.5;cursor:not-allowed}
.zh-dg-ccompose .cancel{appearance:none;border:0;background:transparent;color:var(--dg-mute);cursor:pointer;font-size:12px;padding:6px}
.zh-dg-clist{display:flex;flex-direction:column}
.zh-dg-citem{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;line-height:1.55}
.zh-dg-citem:last-child{border-bottom:0}
.zh-dg-citem .an{color:var(--dg-text);font-weight:600;margin-right:6px}
.zh-dg-citem .ct{color:var(--dg-sub);white-space:pre-wrap;word-break:break-word}
.zh-dg-citem .meta{display:flex;align-items:center;gap:10px;margin-top:6px}
.zh-dg-citem .meta button{
  appearance:none;border:0;background:transparent;color:var(--dg-mute);cursor:pointer;font-size:11px;padding:0
}
.zh-dg-citem .meta button:hover{color:#d4d4d4}
.zh-dg-creplies{margin:8px 0 0 12px;padding-left:10px;border-left:2px solid rgba(255,255,255,.08)}
.zh-dg-creplies .zh-dg-citem{padding:6px 0;border-bottom:0}
.zh-dg-cloading,.zh-dg-cempty,.zh-dg-cend{color:var(--dg-mute);font-size:12px;padding:8px 0;text-align:center}
.zh-dg-csentinel{height:1px;width:100%}
/* Q 键：只隐藏信息流卡片里的图，不影响顶栏/侧栏图标 */
body.zh-dg-hide-imgs #zh-dg-grid img,
body.zh-dg-hide-imgs #zh-dg-grid picture,
body.zh-dg-hide-imgs #zh-dg-grid video,
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-media,
body.zh-dg-hide-imgs .zh-dg-skel-media,
body.zh-dg-hide-imgs .zh-dg-full img,
body.zh-dg-hide-imgs .zh-dg-full video{display:none!important}
/* 加载骨架 */
#zh-dg-loading{display:none;margin-top:8px}
#zh-dg-loading.on{display:block}
.zh-dg-skel-card{
  display:block;width:100%;margin:0;
  border-radius:14px;overflow:hidden;background:var(--dg-card);border:1px solid var(--dg-line)
}
.zh-dg-skel-line,.zh-dg-skel-media{
  background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.1),rgba(255,255,255,.04));
  background-size:200% 100%;animation:zhDgShimmer 1.1s linear infinite;border-radius:8px
}
.zh-dg-skel-media{height:140px;border-radius:0;margin-bottom:12px}
.zh-dg-skel-line{height:12px;margin:0 14px 10px}
.zh-dg-skel-line.w60{width:60%}
.zh-dg-skel-line.w80{width:80%}
.zh-dg-skel-line.w40{width:40%;margin-bottom:14px}
@keyframes zhDgShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
#zh-dg-side{position:sticky;top:72px;display:flex;flex-direction:column;gap:12px;align-self:start;max-height:calc(100vh - 88px);overflow:auto}
.zh-dg-widget{background:var(--dg-card);border:1px solid var(--dg-line);border-radius:12px;padding:14px}
.zh-dg-widget h3{margin:0 0 12px;font-size:15px}
.zh-dg-banner{display:none}
.zh-dg-sbtn{display:block;width:100%;height:36px;border-radius:8px;border:0;text-align:center;line-height:36px;text-decoration:none!important;margin-bottom:8px;font-size:13px;box-sizing:border-box}
.zh-dg-sbtn.primary{background:#3a3a3a;color:#fff!important}
.zh-dg-sbtn.ghost{background:var(--dg-elev);color:var(--dg-sub)!important;border:1px solid var(--dg-line)}
.zh-dg-follow{display:flex;gap:10px;align-items:center;padding:8px 0}
.zh-dg-follow .meta{flex:1;min-width:0}
.zh-dg-follow .name{font-size:13px}
.zh-dg-follow .desc{font-size:12px;color:var(--dg-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zh-dg-follow button{border:0;background:#3a3a3a;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px}
.zh-dg-hotlist{display:flex;flex-direction:column;gap:2px;margin:0 0 10px}
.zh-dg-hotitem{
  display:flex;gap:8px;align-items:flex-start;padding:8px 4px;border-radius:8px;
  text-decoration:none!important;color:inherit!important
}
.zh-dg-hotitem:hover{background:rgba(255,255,255,.04)}
.zh-dg-hotitem .rank{
  flex:0 0 18px;font-size:13px;font-weight:700;color:var(--dg-mute);line-height:1.4;text-align:center
}
.zh-dg-hotitem:nth-child(1) .rank,.zh-dg-hotitem:nth-child(2) .rank,.zh-dg-hotitem:nth-child(3) .rank{color:#d4d4d4}
.zh-dg-hotitem .body{flex:1;min-width:0}
.zh-dg-hotitem .ht{
  font-size:13px;line-height:1.45;color:var(--dg-text);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden
}
.zh-dg-hotitem .hm{margin-top:4px;font-size:11px;color:var(--dg-mute)}
.zh-dg-hotempty{font-size:12px;color:var(--dg-mute);padding:4px 0 8px}
#zh-dg-sentinel{height:32px;width:100%}
@media(max-width:900px){#zh-dg-shell{grid-template-columns:1fr}#zh-dg-side{position:static;max-height:none}}
`;

  function injectCss() {
    if (typeof GM_addStyle === "function") GM_addStyle(CSS);
    else {
      const s = document.createElement("style");
      s.textContent = CSS;
      document.documentElement.appendChild(s);
    }
  }

  const rendered = new Set();
  const orderList = []; // 原始纵向顺序
  const SEEN = new WeakSet();
  const store = new Map(); // key -> item meta
  const COL_W = 280;
  const COL_GAP = 14;
  let colCount = 0;

  function calcColCount() {
    const grid = document.getElementById("zh-dg-grid");
    const w = grid?.clientWidth || 0;
    if (w < 40) return Math.max(1, colCount || 1);
    return Math.max(1, Math.floor((w + COL_GAP) / (COL_W + COL_GAP)));
  }

  function cardElByKey(root, key) {
    return [...root.querySelectorAll(".zh-dg-card")].find((el) => el.getAttribute("data-key") === key) || null;
  }

  function ensureColumns(n) {
    const grid = document.getElementById("zh-dg-grid");
    if (!grid) return [];
    const needRebuild =
      colCount !== n ||
      grid.children.length !== n ||
      ![...grid.children].every((c) => c.classList.contains("zh-dg-col"));
    if (!needRebuild) return [...grid.children];

    const cards = orderList.map((k) => cardElByKey(grid, k)).filter(Boolean);
    grid.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const col = document.createElement("div");
      col.className = "zh-dg-col";
      grid.appendChild(col);
    }
    const cols = [...grid.children];
    cards.forEach((card, i) => cols[i % n].appendChild(card));
    colCount = n;
    return cols;
  }

  function layoutCols() {
    ensureColumns(calcColCount());
  }

  function hideHeaderLogo() {
    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header");
    if (!header) return;
    header.querySelectorAll("a").forEach((a) => {
      const label = (a.getAttribute("aria-label") || "").trim();
      const txt = (a.textContent || "").replace(/\s+/g, "").trim();
      // 只隐藏明确的品牌入口，避免把带 svg 的消息/私信链接误藏
      if (label === "知乎" || label === "知乎首页" || txt === "知乎") {
        a.classList.add("zh-dg-hide-logo");
      }
    });
  }

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmt(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return n == null ? "" : String(n);
    if (num >= 10000) return (num / 10000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, "") + " 万";
    return String(num);
  }
  function strip(html) {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return text(d);
  }

  function fromApi(entry) {
    if (!entry || entry.type === "feed_advert") return null;
    const t = entry.target || entry;
    if (!t || typeof t !== "object") return null;

    let kind = t.type || "";
    let id = t.id;
    let title = "";
    let href = "";
    let excerpt = "";
    let img = "";
    let votes = 0;
    let comments = 0;
    let contentHtml = "";

    if (kind === "answer" || t.question) {
      kind = "answer";
      title = t.question?.title || t.title || "";
      href = t.question?.id
        ? `https://www.zhihu.com/question/${t.question.id}/answer/${t.id}`
        : t.url || "";
      excerpt = strip(t.excerpt || t.content || "");
      contentHtml = t.content || "";
      votes = t.voteup_count || 0;
      comments = t.comment_count || 0;
      img = t.thumbnail || t.image_url || "";
      id = t.id;
    } else if (kind === "article") {
      title = t.title || "";
      href = t.url || `https://zhuanlan.zhihu.com/p/${t.id}`;
      excerpt = strip(t.excerpt || t.content || "");
      contentHtml = t.content || "";
      votes = t.voteup_count || 0;
      comments = t.comment_count || 0;
      img = t.image_url || t.thumbnail || t.title_image || "";
    } else if (kind === "question") {
      title = t.title || "";
      href = t.url || `https://www.zhihu.com/question/${t.id}`;
      excerpt = strip(t.excerpt || "");
      comments = t.answer_count || 0;
      votes = t.follower_count || 0;
    } else if (kind === "zvideo") {
      title = t.title || "";
      href = t.url || `https://www.zhihu.com/zvideo/${t.id}`;
      excerpt = strip(t.description || t.excerpt || "");
      img = t.image_url || t.thumbnail || "";
      votes = t.voteup_count || 0;
      comments = t.comment_count || 0;
    } else {
      title = t.title || t.question?.title || "";
      href = t.url || "";
      excerpt = strip(t.excerpt || t.content || "");
      img = t.thumbnail || t.image_url || "";
      kind = kind || "unknown";
    }
    if (!img && entry.common_card?.cover) img = entry.common_card.cover;
    title = String(title || "").trim();
    if (!title) return null;
    const key = (href || "") + "|" + title;
    return {
      key,
      kind,
      id,
      title,
      href: href || location.href,
      img,
      excerpt: excerpt.slice(0, 180),
      votes,
      comments,
      contentHtml,
      voted: false,
    };
  }

  function fromDom() {
    const scope = document.getElementById("zh-dg-scraper") || document;
    const out = [];
    scope.querySelectorAll(".Card.TopstoryItem, .TopstoryItem").forEach((node) => {
      if (SEEN.has(node) || node.classList.contains("TopstoryItem--advertCard")) return;
      const title = text(node.querySelector(".ContentItem-title, h2"));
      if (!title) return;
      const a =
        node.querySelector(".ContentItem-title a, h2 a, a[href*='/question/'], a[href*='zhuanlan']") ||
        node.querySelector("a");
      const href = a?.href || location.href;
      let img = "";
      for (const im of node.querySelectorAll("img")) {
        const src = im.getAttribute("data-actualsrc") || im.src || "";
        if (src && !src.startsWith("data:") && !/avatar|icon|svg/i.test(src)) {
          img = src;
          break;
        }
      }
      const excerpt = text(node.querySelector(".RichContent-inner, .RichText"))
        .replace(/阅读全文|展开全文|收起/g, "")
        .slice(0, 180);
      let kind = "unknown";
      let id = null;
      const mAns = href.match(/answer\/(\d+)/);
      const mArt = href.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/) || href.match(/\/p\/(\d+)/);
      const mZv = href.match(/zvideo\/(\d+)/);
      const mQ = href.match(/question\/(\d+)/);
      if (mAns) {
        kind = "answer";
        id = mAns[1];
      } else if (mArt) {
        kind = "article";
        id = mArt[1];
      } else if (mZv) {
        kind = "zvideo";
        id = mZv[1];
      } else if (mQ) {
        kind = "question";
        id = mQ[1];
      }
      const all = text(node);
      const v = all.match(/([\d.]+ ?万?)?\s*赞同/);
      const c = all.match(/([\d.]+ ?万?)?\s*条?评论/);
      SEEN.add(node);
      out.push({
        key: href + "|" + title,
        kind,
        id,
        title,
        href,
        img,
        excerpt,
        votes: v && v[1] ? v[1] : 0,
        comments: c && c[1] ? c[1] : 0,
        contentHtml: "",
        voted: false,
      });
    });
    return out;
  }

  function cardHTML(item) {
    const isText = !item.img;
    const classes = ["zh-dg-card", isText ? "is-text" : "has-img"].join(" ");
    const bodyInner = isText
      ? `<div class="zh-dg-textblock"><p class="zh-dg-excerpt">${esc(item.excerpt || "点击展开查看完整内容")}</p></div>`
      : `<div class="zh-dg-media"><img src="${esc(item.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>
         ${item.excerpt ? `<p class="zh-dg-excerpt">${esc(item.excerpt)}</p>` : ""}`;
    return `<article class="${classes}" data-key="${esc(item.key)}" data-kind="${esc(item.kind || "")}" data-id="${esc(item.id || "")}">
      <div class="hd"><a class="title" href="${esc(item.href)}" target="_blank" rel="noopener">${esc(item.title)}</a></div>
      <div class="zh-dg-body" data-act="expand">
        ${bodyInner}
        <div class="zh-dg-full" data-full></div>
        <div class="zh-dg-hint">点击内容展开全文</div>
      </div>
      <div class="zh-dg-foot">
        <button type="button" class="zh-dg-btnx" data-act="vote"><span class="ico">▲</span><span data-vote-label>${esc(fmt(item.votes))} 赞同</span></button>
        <button type="button" class="zh-dg-btnx" data-act="comments"><span class="ico">💬</span><span data-cmt-label>${esc(fmt(item.comments))} 评论</span></button>
        <span class="zh-dg-more">···</span>
      </div>
      <div class="zh-dg-comments" data-comments><div class="zh-dg-cloading">加载评论中…</div></div>
    </article>`;
  }

  function setStatus(msg) {
    const el = document.getElementById("zh-dg-status");
    if (!el) return;
    el.textContent = `${msg} · 拦截${feedState.intercepted} · next=${feedState.nextUrl ? "有" : "无"}`;
  }

  function setLoading(on) {
    const box = document.getElementById("zh-dg-loading");
    if (!box) return;
    box.classList.toggle("on", !!on);
  }

  function render(items) {
    const grid = document.getElementById("zh-dg-grid");
    if (!grid) return 0;
    const fresh = items.filter((it) => it && !rendered.has(it.key));
    if (!fresh.length) return 0;
    const cols = ensureColumns(calcColCount());
    const n = cols.length || 1;
    fresh.forEach((it) => {
      rendered.add(it.key);
      store.set(it.key, it);
      orderList.push(it.key);
      const wrap = document.createElement("div");
      wrap.innerHTML = cardHTML(it);
      const card = wrap.firstElementChild;
      if (card) cols[(orderList.length - 1) % n].appendChild(card);
    });
    window.__ZH_DG_COUNT__ = rendered.size;
    setStatus(`已加载 ${rendered.size} 条`);
    return fresh.length;
  }

  function ensureScraper() {
    let scraper = document.getElementById("zh-dg-scraper");
    if (!scraper) {
      scraper = document.createElement("div");
      scraper.id = "zh-dg-scraper";
      document.body.appendChild(scraper);
    }
    [".Topstory-container", ".GlobalSideBar", ".Topstory-sideBar", ".Footer", "footer"].forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!scraper.contains(el) && !el.closest("#zh-dg-shell")) scraper.appendChild(el);
      });
    });
    const main = document.querySelector(".App-main");
    if (main) {
      [...main.children].forEach((child) => {
        if (["zh-dg-shell", "zh-dg-scraper"].includes(child.id)) return;
        scraper.appendChild(child);
      });
    }
  }

  function ensureShell() {
    // 清理旧版残留的快捷按钮 / 猜你想看
    document.getElementById("zh-dg-actions")?.remove();
    document.getElementById("zh-dg-guess")?.remove();
    hideHeaderLogo();

    if (document.getElementById("zh-dg-shell")) {
      // 去掉与顶栏重复的「快捷入口」
      document.querySelectorAll("#zh-dg-side .zh-dg-widget").forEach((w) => {
        const h = w.querySelector("h3");
        if (h && /快捷入口/.test(h.textContent || "")) w.remove();
      });
      let hot = document.getElementById("zh-dg-hotlist");
      if (!hot) {
        const hotWidget = [...document.querySelectorAll("#zh-dg-side .zh-dg-widget")].find((w) =>
          /热门榜单/.test(w.querySelector("h3")?.textContent || "")
        );
        if (hotWidget) {
          const list = document.createElement("div");
          list.className = "zh-dg-hotlist";
          list.id = "zh-dg-hotlist";
          list.innerHTML = `<div class="zh-dg-hotempty">加载热榜中…</div>`;
          const link = hotWidget.querySelector("a.zh-dg-sbtn");
          if (link) hotWidget.insertBefore(list, link);
          else hotWidget.appendChild(list);
          hot = list;
        }
      }
      if (hot && !hot.querySelector(".zh-dg-hotitem")) loadHotList();
      ensureScraper();
      layoutCols();
      return;
    }
    document.body.classList.add("zh-dg-v2");

    const shell = document.createElement("div");
    shell.id = "zh-dg-shell";
    shell.innerHTML = `<div id="zh-dg-main">
      <div id="zh-dg-status">正在重建信息流…</div>
      <div id="zh-dg-grid"></div>
      <div id="zh-dg-loading">
        <div class="zh-dg-skel">${[1, 2, 3, 4, 5, 6]
          .map(
            () => `<div class="zh-dg-skel-card"><div class="zh-dg-skel-media"></div><div class="zh-dg-skel-line w80"></div><div class="zh-dg-skel-line w60"></div><div class="zh-dg-skel-line w40"></div></div>`
          )
          .join("")}</div>
      </div>
      <div id="zh-dg-sentinel"></div>
    </div>
    <aside id="zh-dg-side">
      <div class="zh-dg-widget"><h3>创作中心</h3>
        <a class="zh-dg-sbtn primary" href="https://www.zhihu.com/creator">进入创作中心</a>
        <a class="zh-dg-sbtn ghost" href="https://www.zhihu.com/question/waiting">等待收录</a></div>
      <div class="zh-dg-widget"><h3>热门榜单</h3>
        <div class="zh-dg-hotlist" id="zh-dg-hotlist"><div class="zh-dg-hotempty">加载热榜中…</div></div>
        <a class="zh-dg-sbtn ghost" href="https://www.zhihu.com/hot" target="_blank" rel="noopener">查看完整榜单</a></div>
    </aside>`;

    const host = document.querySelector(".App-main") || document.body;
    host.prepend(shell);
    ensureScraper();
    bindCardEvents(shell);
    loadHotList();
    requestAnimationFrame(layoutCols);
  }

  function parseHotItem(entry, idx) {
    const t = entry?.target || entry || {};
    const title =
      t.title_area?.text ||
      t.title ||
      t.question?.title ||
      entry?.title ||
      "";
    if (!title) return null;
    let href =
      t.link?.url ||
      t.url ||
      t.question?.url ||
      "";
    if (href.includes("api.zhihu.com/questions/")) {
      href = href.replace("https://api.zhihu.com/questions/", "https://www.zhihu.com/question/");
    } else if (href.includes("/questions/")) {
      href = href.replace("/questions/", "/question/");
    }
    if (!href && t.id) href = `https://www.zhihu.com/question/${t.id}`;
    const heat =
      entry?.detail_text ||
      t.metrics_area?.text ||
      t.hot_text ||
      "";
    return {
      rank: idx + 1,
      title: String(title).trim(),
      href: href || "https://www.zhihu.com/hot",
      heat: String(heat || "").trim(),
    };
  }

  async function loadHotList() {
    const box = document.getElementById("zh-dg-hotlist");
    if (!box) return;
    try {
      const urls = [
        "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=10&desktop=true",
        "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=10",
      ];
      let list = [];
      let lastErr = "";
      for (const url of urls) {
        try {
          const j = await apiFetch(url);
          list = (j.data || []).map(parseHotItem).filter(Boolean);
          if (list.length) break;
        } catch (e) {
          lastErr = String(e && e.message || e);
        }
      }
      if (!list.length) {
        box.innerHTML = `<div class="zh-dg-hotempty">热榜加载失败${lastErr ? "：" + esc(lastErr) : ""}</div>`;
        return;
      }
      box.innerHTML = list
        .map(
          (it) => `<a class="zh-dg-hotitem" href="${esc(it.href)}" target="_blank" rel="noopener">
            <span class="rank">${it.rank}</span>
            <span class="body"><span class="ht">${esc(it.title)}</span>${
              it.heat ? `<span class="hm">${esc(it.heat)}</span>` : ""
            }</span>
          </a>`
        )
        .join("");
    } catch (e) {
      box.innerHTML = `<div class="zh-dg-hotempty">热榜加载失败：${esc(String(e && e.message || e))}</div>`;
    }
  }

  async function loadFullContent(item) {
    if (item.contentHtml) return item.contentHtml;
    if (!item.id) return `<p>${esc(item.excerpt || "暂无正文")}</p>`;
    try {
      if (item.kind === "answer") {
        const j = await apiFetch(
          `https://www.zhihu.com/api/v4/answers/${item.id}?include=content,voteup_count,comment_count`
        );
        item.contentHtml = j.content || "";
        if (j.voteup_count != null) item.votes = j.voteup_count;
        if (j.comment_count != null) item.comments = j.comment_count;
      } else if (item.kind === "article") {
        const j = await apiFetch(
          `https://www.zhihu.com/api/v4/articles/${item.id}?include=content,voteup_count,comment_count`
        );
        item.contentHtml = j.content || "";
        if (j.voteup_count != null) item.votes = j.voteup_count;
        if (j.comment_count != null) item.comments = j.comment_count;
      } else {
        item.contentHtml = `<p>${esc(item.excerpt || "此类内容请点标题打开原页")}</p>`;
      }
    } catch (e) {
      item.contentHtml = `<p>${esc(item.excerpt || "正文加载失败，请点标题打开")}</p><p class="zh-dg-cloading">${esc(String(e && e.message || e))}</p>`;
    }
    return item.contentHtml;
  }

  function kindToCommentResource(kind) {
    if (kind === "article") return "articles";
    if (kind === "zvideo") return "zvideos";
    if (kind === "answer") return "answers";
    return "answers";
  }

  function commentCandidateUrls(item) {
    const id = item.id;
    const kind = item.kind || "answer";
    const v5 = (res) =>
      `https://www.zhihu.com/api/v4/comment_v5/${res}/${id}/root_comment?order_by=score&limit=20&offset=`;
    const v4 = (res) =>
      `https://www.zhihu.com/api/v4/${res}/${id}/root_comments?order=normal&limit=20&offset=0&status=open`;
    if (kind === "article") return [{ url: v5("articles"), res: "articles" }, { url: v4("articles"), res: "articles" }];
    if (kind === "zvideo") return [{ url: v5("zvideos"), res: "zvideos" }, { url: v4("zvideos"), res: "zvideos" }];
    if (kind === "answer") return [{ url: v5("answers"), res: "answers" }, { url: v4("answers"), res: "answers" }];
    return [
      { url: v5("answers"), res: "answers" },
      { url: v5("zvideos"), res: "zvideos" },
      { url: v5("articles"), res: "articles" },
      { url: v4("answers"), res: "answers" },
    ];
  }

  function parseCommentRow(c) {
    const author =
      c.author?.name ||
      c.author?.member?.name ||
      c.author?.user?.name ||
      "用户";
    const content = strip(c.content || c.comment_content || c.text || "");
    const children = Array.isArray(c.child_comments) ? c.child_comments.map(parseCommentRow) : [];
    return {
      id: String(c.id || ""),
      author,
      content,
      like: c.like_count || c.vote_count || 0,
      childCount: c.child_comment_count || children.length || 0,
      childNext: c.child_comment_next_offset || "",
      children,
      repliesOpen: children.length > 0,
    };
  }

  function ensureCommentState(item) {
    if (!item.cmt) {
      item.cmt = {
        resource: kindToCommentResource(item.kind),
        next: null,
        ended: false,
        loading: false,
        rows: [],
        replyTo: null,
        inited: false,
      };
    }
    return item.cmt;
  }

  async function fetchCommentPage(item, url) {
    const j = await apiFetch(url);
    const list = Array.isArray(j?.data) ? j.data.map(parseCommentRow) : [];
    return {
      list,
      next: j?.paging?.next || null,
      ended: !!(j?.paging?.is_end || !j?.paging?.next),
    };
  }

  async function initComments(item) {
    const st = ensureCommentState(item);
    if (st.inited && st.rows.length) return { ok: true };
    const cands = commentCandidateUrls(item);
    let lastErr = "";
    for (const c of cands) {
      try {
        const page = await fetchCommentPage(item, c.url);
        if (!page.list.length && !page.ended && !page.next) {
          lastErr = "接口返回空列表";
          continue;
        }
        st.resource = c.res;
        st.rows = page.list;
        st.next = page.next;
        st.ended = page.ended || (!page.next && page.list.length > 0);
        if (!page.list.length && !page.next) st.ended = true;
        st.inited = true;
        return { ok: true };
      } catch (e) {
        lastErr = String(e && e.message || e);
      }
    }
    return { ok: false, error: lastErr || "评论加载失败" };
  }

  async function loadMoreComments(item) {
    const st = ensureCommentState(item);
    if (st.loading || st.ended || !st.next) return;
    st.loading = true;
    try {
      const page = await fetchCommentPage(item, st.next);
      const seen = new Set(st.rows.map((r) => r.id));
      for (const row of page.list) {
        if (!seen.has(row.id)) st.rows.push(row);
      }
      st.next = page.next;
      st.ended = page.ended || !page.next;
    } finally {
      st.loading = false;
    }
  }

  async function loadChildComments(item, rootComment) {
    if (!rootComment?.id) return;
    const offset = rootComment.childNext || "";
    const url = `https://www.zhihu.com/api/v4/comment_v5/comment/${rootComment.id}/child_comment?order_by=ts&limit=20&offset=${encodeURIComponent(offset)}`;
    const j = await apiFetch(url);
    const list = Array.isArray(j?.data) ? j.data.map(parseCommentRow) : [];
    const seen = new Set(rootComment.children.map((c) => c.id));
    for (const row of list) {
      if (!seen.has(row.id)) rootComment.children.push(row);
    }
    rootComment.childNext = "";
    try {
      if (j?.paging?.next) {
        const u = new URL(j.paging.next);
        rootComment.childNext = u.searchParams.get("offset") || "";
      }
    } catch (_) {}
    if (j?.paging?.is_end || !j?.paging?.next) rootComment.childNext = "";
  }

  async function submitComment(item, content, replyToId) {
    const text = String(content || "").trim();
    if (!text) throw new Error("请输入评论内容");
    const res = ensureCommentState(item).resource || kindToCommentResource(item.kind);
    const bodies = [];
    if (replyToId) {
      bodies.push({ content: text, reply_comment_id: replyToId });
      bodies.push({ content: text, comment_id: replyToId });
      bodies.push({ content: `<p>${text}</p>`, reply_comment_id: replyToId });
    } else {
      bodies.push({ content: text });
      bodies.push({ content: `<p>${text}</p>` });
    }
    const urls = [
      `https://www.zhihu.com/api/v4/comment_v5/${res}/${item.id}/comment`,
      `https://www.zhihu.com/api/v4/${res}/${item.id}/comments`,
    ];
    let lastErr = "";
    for (const url of urls) {
      for (const body of bodies) {
        try {
          const j = await apiFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          return j;
        } catch (e) {
          lastErr = String(e && e.message || e);
        }
      }
    }
    throw new Error(lastErr || "发送失败");
  }

  function renderCommentItem(c, depth = 0) {
    const canToggleReplies =
      depth === 0 &&
      ((c.childCount || 0) > 0 || (c.children?.length || 0) > 0 || !!c.childNext);
    const replies =
      depth === 0 && c.repliesOpen && c.children?.length
        ? `<div class="zh-dg-creplies">${c.children.map((ch) => renderCommentItem(ch, 1)).join("")}</div>`
        : "";
    let replyBtn = "";
    if (canToggleReplies) {
      const label = c.repliesOpen ? "收起回复" : "展开更多回复";
      replyBtn = `<button type="button" data-act="cmt-child" data-cid="${esc(c.id)}">${label}</button>`;
    }
    return `<div class="zh-dg-citem" data-cid="${esc(c.id)}">
      <div><span class="an">${esc(c.author)}</span><span class="ct">${esc(c.content)}</span></div>
      <div class="meta">
        <button type="button" data-act="cmt-reply" data-cid="${esc(c.id)}" data-author="${esc(c.author)}">回复</button>
        ${replyBtn}
      </div>
      ${replies}
    </div>`;
  }

  function renderCommentsPanel(item) {
    const st = ensureCommentState(item);
    const replyHint = st.replyTo
      ? `回复 @${st.replyTo.author}`
      : "写评论…";
    const listHtml = st.rows.length
      ? st.rows.map((c) => renderCommentItem(c)).join("")
      : `<div class="zh-dg-cempty">暂无评论，来抢沙发</div>`;
    const foot = st.ended
      ? `<div class="zh-dg-cend">已加载全部评论</div>`
      : `<div class="zh-dg-cloading" data-cmt-loading style="display:${st.loading ? "block" : "none"}">加载更多评论…</div>
         <div class="zh-dg-csentinel" data-cmt-sentinel></div>`;
    return `<div class="zh-dg-ccompose" data-ccompose>
      <textarea data-cmt-input placeholder="${esc(replyHint)}"></textarea>
      <div class="row">
        <span class="hint" data-cmt-hint>${st.replyTo ? esc("回复 @" + st.replyTo.author) : ""}</span>
        ${st.replyTo ? `<button type="button" class="cancel" data-act="cmt-cancel">取消回复</button>` : ""}
        <button type="button" class="send" data-act="cmt-send">发送</button>
      </div>
    </div>
    <div class="zh-dg-clist" data-clist>${listHtml}</div>
    ${foot}`;
  }

  function bindCommentScroll(card, item) {
    const box = card.querySelector("[data-comments]");
    const sen = box?.querySelector("[data-cmt-sentinel]");
    if (!box || !sen) return;
    if (box.__zhCmtIo) box.__zhCmtIo.disconnect();
    const io = new IntersectionObserver(
      async (ents) => {
        if (!ents.some((e) => e.isIntersecting)) return;
        const st = ensureCommentState(item);
        if (st.loading || st.ended || !st.next) return;
        const tip = box.querySelector("[data-cmt-loading]");
        if (tip) tip.style.display = "block";
        await loadMoreComments(item);
        const input = box.querySelector("[data-cmt-input]");
        const keep = input?.value || "";
        const reply = st.replyTo;
        box.innerHTML = renderCommentsPanel(item);
        const input2 = box.querySelector("[data-cmt-input]");
        if (input2) input2.value = keep;
        st.replyTo = reply;
        bindCommentScroll(card, item);
      },
      { root: box, rootMargin: "80px 0px", threshold: 0.01 }
    );
    io.observe(sen);
    box.__zhCmtIo = io;
  }

  async function openComments(card, item) {
    const box = card.querySelector("[data-comments]");
    box.innerHTML = `<div class="zh-dg-cloading">加载评论中…</div>`;
    const r = await initComments(item);
    if (!r.ok && !ensureCommentState(item).rows.length) {
      const tip =
        Number(item.comments) > 0
          ? `评论加载失败${r.error ? "：" + r.error : ""}（显示有 ${fmt(item.comments)} 条）`
          : "暂无评论";
      box.innerHTML = `<div class="zh-dg-cempty">${esc(tip)}</div>`;
      return;
    }
    box.innerHTML = renderCommentsPanel(item);
    bindCommentScroll(card, item);
    // 打开后预取几页，尽量一次看全
    let guard = 0;
    while (!ensureCommentState(item).ended && ensureCommentState(item).next && guard < 8) {
      await loadMoreComments(item);
      guard += 1;
      box.innerHTML = renderCommentsPanel(item);
      bindCommentScroll(card, item);
    }
  }

  async function toggleVote(item, btn) {
    if (!item.id || (item.kind !== "answer" && item.kind !== "article")) {
      setStatus("当前类型暂不支持赞同");
      return;
    }
    const type = item.voted ? "neutral" : "up";
    const url =
      item.kind === "article"
        ? `https://www.zhihu.com/api/v4/articles/${item.id}/voters`
        : `https://www.zhihu.com/api/v4/answers/${item.id}/voters`;
    try {
      await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      item.voted = !item.voted;
      const n = Number(item.votes);
      if (Number.isFinite(n)) item.votes = Math.max(0, n + (item.voted ? 1 : -1));
      btn.classList.toggle("is-on", item.voted);
      const label = btn.querySelector("[data-vote-label]");
      if (label) label.textContent = `${fmt(item.votes)} 赞同`;
    } catch (e) {
      setStatus("赞同失败：" + (e && e.message || e));
    }
  }

  function bindCardEvents(root) {
    root.addEventListener("click", async (ev) => {
      const actEl = ev.target.closest("[data-act]");
      const card = ev.target.closest(".zh-dg-card");
      if (!card) return;
      const key = card.getAttribute("data-key");
      const item = store.get(key);
      if (!item) return;

      // 标题保持默认新标签打开
      if (ev.target.closest("a.title")) return;

      // 评论区内交互不触发展开正文
      if (ev.target.closest("[data-comments]")) {
        ev.stopPropagation();
        const act = actEl?.getAttribute("data-act");
        const box = card.querySelector("[data-comments]");
        const st = ensureCommentState(item);

        if (act === "cmt-cancel") {
          st.replyTo = null;
          const input = box.querySelector("[data-cmt-input]");
          const keep = input?.value || "";
          box.innerHTML = renderCommentsPanel(item);
          const input2 = box.querySelector("[data-cmt-input]");
          if (input2) input2.value = keep;
          bindCommentScroll(card, item);
          return;
        }

        if (act === "cmt-reply") {
          st.replyTo = {
            id: actEl.getAttribute("data-cid"),
            author: actEl.getAttribute("data-author") || "用户",
          };
          const input = box.querySelector("[data-cmt-input]");
          const keep = input?.value || "";
          box.innerHTML = renderCommentsPanel(item);
          const input2 = box.querySelector("[data-cmt-input]");
          if (input2) {
            input2.value = keep;
            input2.focus();
          }
          bindCommentScroll(card, item);
          return;
        }

        if (act === "cmt-child") {
          const cid = actEl.getAttribute("data-cid");
          const rootC = st.rows.find((r) => r.id === cid);
          if (!rootC) return;
          // 已展开 → 收起
          if (rootC.repliesOpen) {
            rootC.repliesOpen = false;
            const input = box.querySelector("[data-cmt-input]");
            const keep = input?.value || "";
            box.innerHTML = renderCommentsPanel(item);
            const input2 = box.querySelector("[data-cmt-input]");
            if (input2) input2.value = keep;
            bindCommentScroll(card, item);
            return;
          }
          // 收起 → 展开（必要时再拉子评论）
          actEl.textContent = "加载中…";
          try {
            const needMore =
              !!rootC.childNext ||
              (rootC.childCount || 0) > (rootC.children?.length || 0) ||
              !(rootC.children?.length);
            if (needMore) await loadChildComments(item, rootC);
            rootC.repliesOpen = true;
            const input = box.querySelector("[data-cmt-input]");
            const keep = input?.value || "";
            box.innerHTML = renderCommentsPanel(item);
            const input2 = box.querySelector("[data-cmt-input]");
            if (input2) input2.value = keep;
            bindCommentScroll(card, item);
          } catch (e) {
            actEl.textContent = "展开失败，重试";
            setStatus("子评论加载失败：" + (e && e.message || e));
          }
          return;
        }

        if (act === "cmt-send") {
          const input = box.querySelector("[data-cmt-input]");
          const btn = actEl;
          const content = input?.value || "";
          btn.disabled = true;
          btn.textContent = "发送中…";
          try {
            await submitComment(item, content, st.replyTo?.id || null);
            st.replyTo = null;
            st.inited = false;
            st.rows = [];
            st.next = null;
            st.ended = false;
            const n = Number(item.comments);
            if (Number.isFinite(n)) item.comments = n + 1;
            const label = card.querySelector("[data-cmt-label]");
            if (label) label.textContent = `${fmt(item.comments)} 评论`;
            await openComments(card, item);
            setStatus("评论已发送");
          } catch (e) {
            btn.disabled = false;
            btn.textContent = "发送";
            const hint = box.querySelector("[data-cmt-hint]");
            if (hint) hint.textContent = "发送失败：" + (e && e.message || e);
            setStatus("评论失败：" + (e && e.message || e));
          }
          return;
        }
        return;
      }

      const act = actEl?.getAttribute("data-act");

      if (act === "vote") {
        ev.preventDefault();
        ev.stopPropagation();
        await toggleVote(item, actEl);
        return;
      }

      if (act === "comments") {
        ev.preventDefault();
        ev.stopPropagation();
        const open = !card.classList.contains("is-comments");
        card.classList.toggle("is-comments", open);
        actEl.classList.toggle("is-on", open);
        if (open) await openComments(card, item);
        return;
      }

      if (act === "expand" || ev.target.closest(".zh-dg-body")) {
        // 点击内容：当前卡片展开/收起全文
        ev.preventDefault();
        const willOpen = !card.classList.contains("is-expanded");
        if (willOpen) {
          const full = card.querySelector("[data-full]");
          full.innerHTML = `<div class="zh-dg-cloading">加载正文中…</div>`;
          card.classList.add("is-expanded");
          const html = await loadFullContent(item);
          full.innerHTML = html || `<p>${esc(item.excerpt || "")}</p>`;
          const hint = card.querySelector(".zh-dg-hint");
          if (hint) hint.textContent = "再次点击内容可收起";
        } else {
          card.classList.remove("is-expanded");
          const hint = card.querySelector(".zh-dg-hint");
          if (hint) hint.textContent = "点击内容展开全文";
        }
      }
    });
  }

  let loading = false;
  async function loadMore(reason) {
    if (!isHome() || loading) return;
    loading = true;
    setLoading(true);
    setStatus(`已加载 ${rendered.size} 条 · 正在加载更多…`);
    try {
      const r = await fetchMore();
      if (r.ok && r.json) {
        render((r.json.data || []).map(fromApi).filter(Boolean));
      }
      render(fromDom());
      dbg({ event: "loadMore", reason, total: rendered.size });
    } finally {
      loading = false;
      setLoading(false);
    }
  }

  function sync() {
    if (!isHome()) return;
    ensureShell();
    ensureScraper();
    render(fromDom());
  }

  function bootUi() {
    if (!isHome()) return;
    injectCss();
    document.body.classList.remove("zh-dg-hide-imgs");
    ensureShell();
    sync();
    dbg({ event: "boot-v3" });

    window.addEventListener("zh-dg-data", (ev) => {
      render((ev.detail?.data || []).map(fromApi).filter(Boolean));
    });

    const io = new IntersectionObserver(
      (ents) => {
        if (ents.some((e) => e.isIntersecting)) loadMore("sentinel");
      },
      { rootMargin: "1600px 0px" }
    );
    const watch = () => {
      const s = document.getElementById("zh-dg-sentinel");
      if (s) io.observe(s);
      else setTimeout(watch, 200);
    };
    watch();

    window.addEventListener(
      "scroll",
      () => {
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1600) {
          loadMore("scroll");
        }
      },
      { passive: true }
    );

    window.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key !== "q" && ev.key !== "Q") return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const t = ev.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName))) return;
        document.body.classList.toggle("zh-dg-hide-imgs");
        const on = document.body.classList.contains("zh-dg-hide-imgs");
        setStatus(on ? "已隐藏图片（再按 Q 显示）" : "已显示图片");
      },
      true
    );

    window.addEventListener("resize", () => {
      clearTimeout(layoutCols._t);
      layoutCols._t = setTimeout(layoutCols, 120);
    });

    let n = 0;
    const timer = setInterval(() => {
      sync();
      if ([2, 4, 8].includes(n)) loadMore("boot-" + n);
      n += 1;
      if (n > 30) clearInterval(timer);
    }, 600);

    new MutationObserver(() => {
      clearTimeout(bootUi._t);
      bootUi._t = setTimeout(sync, 180);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.body) bootUi();
  else document.addEventListener("DOMContentLoaded", bootUi, { once: true });
})();
