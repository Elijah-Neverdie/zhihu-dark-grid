// ==UserScript==
// @name         知乎暗色网格首页
// @namespace    https://github.com/local/zhihu-dark-grid
// @version      3.3.5
// @description  暗色深灰瀑布流：删除头像遮挡方块
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
  width:100%!important;max-width:none!important;
  position:sticky!important;top:0!important;z-index:10050!important;
  pointer-events:auto!important;isolation:isolate!important;transform:translateZ(0)
}
body.zh-dg-v2 .AppHeader-inner,
body.zh-dg-v2 .AppHeader > div,
body.zh-dg-v2 header[role=banner] > div{
  max-width:none!important;width:100%!important;margin:0!important;padding-left:20px!important;padding-right:20px!important;box-sizing:border-box!important;
  pointer-events:auto!important;position:relative!important;z-index:1!important
}
/* 移除左上角「知乎」字样 / Logo（不要误伤带 svg 的其它入口） */
body.zh-dg-v2 .AppHeader-logo,
body.zh-dg-v2 a.AppHeader-logoLink,
body.zh-dg-v2 .AppHeader .ZhihuLogo,
body.zh-dg-v2 .AppHeader a[aria-label="知乎"],
body.zh-dg-v2 .AppHeader a[aria-label="知乎首页"],
body.zh-dg-v2 .zh-dg-hide-logo{display:none!important}
/* 移除顶栏「直答」入口 */
body.zh-dg-v2 .zh-dg-hide-zhida,
body.zh-dg-v2 .AppHeader a[href*="zhida.zhihu.com"],
body.zh-dg-v2 .AppHeader a[href*="zhida.ai"],
body.zh-dg-v2 header[role=banner] a[href*="zhida.zhihu.com"],
body.zh-dg-v2 header[role=banner] a[href*="zhida.ai"]{
  display:none!important;visibility:hidden!important;pointer-events:none!important;
  width:0!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important
}
/* 确保头像 / 个人入口可点；去掉误加在头像上的方块底 */
body.zh-dg-v2 .AppHeader .AppHeader-profileEntry,
body.zh-dg-v2 .AppHeader .AppHeader-userInfo,
body.zh-dg-v2 .AppHeader .AppHeader-profile,
body.zh-dg-v2 .AppHeader button:has(img.Avatar),
body.zh-dg-v2 .AppHeader a:has(img.Avatar),
body.zh-dg-v2 .AppHeader .Avatar,
body.zh-dg-v2 .AppHeader img.Avatar,
body.zh-dg-v2 header[role=banner] button:has(img.Avatar),
body.zh-dg-v2 header[role=banner] a:has(img.Avatar){
  pointer-events:auto!important;cursor:pointer!important;
  position:relative!important;z-index:20!important;opacity:1!important;visibility:visible!important
}
body.zh-dg-v2 .AppHeader button:has(img.Avatar),
body.zh-dg-v2 .AppHeader a:has(img.Avatar),
body.zh-dg-v2 .AppHeader .AppHeader-profileEntry,
body.zh-dg-v2 .AppHeader .AppHeader-profileEntry.Button,
body.zh-dg-v2 .AppHeader .AppHeader-profileEntry.Button--primary,
body.zh-dg-v2 .AppHeader .AppHeader-profileEntry.Button--blue,
body.zh-dg-v2 header[role=banner] button:has(img.Avatar){
  background:transparent!important;border:0!important;box-shadow:none!important;
  border-radius:50%!important;padding:0!important;margin:0!important;
  min-width:0!important;min-height:0!important;width:auto!important;height:auto!important;
  overflow:visible!important
}
body.zh-dg-v2 .AppHeader .Avatar,
body.zh-dg-v2 .AppHeader img.Avatar,
body.zh-dg-v2 .AppHeader button:has(img.Avatar) img,
body.zh-dg-v2 header[role=banner] img.Avatar{
  border-radius:50%!important;width:32px!important;height:32px!important;
  object-fit:cover!important;display:block!important;
  max-width:32px!important;max-height:32px!important;
  background:transparent!important;box-shadow:none!important
}
/* 顶栏内 Popover 包装勿盖住头像；打开的菜单仍浮在上面 */
body.zh-dg-v2 .AppHeader .Popover{z-index:auto!important;position:relative!important}
body.zh-dg-v2 .AppHeader .Popover-content{
  z-index:300001!important
}
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
/* 隐藏私信未读角标（数字 + 红圈）；不依赖不稳定的 hash 类名 */
.Messages-count,
.css-ybodb,
.zh-dg-hide-msg-badge,
body.zh-dg-v2 .Messages-count,
body.zh-dg-v2 .zh-dg-hide-msg-badge{
  display:none!important;visibility:hidden!important;opacity:0!important;
  width:0!important;height:0!important;min-width:0!important;max-width:0!important;
  padding:0!important;margin:0!important;overflow:hidden!important;font-size:0!important;
  border:0!important;pointer-events:none!important
}
/* 常见伪元素角标 */
a[href*="/messages"]::before,
a[href*="/messages"]::after,
button[aria-label*="私信"]::before,
button[aria-label*="私信"]::after{content:none!important;display:none!important}
#zh-dg-actions,#zh-dg-guess{display:none!important}
body.zh-dg-v2 .SearchBar-input,body.zh-dg-v2 .SearchBar input{
  background:var(--dg-elev)!important;border:1px solid var(--dg-line)!important;border-radius:999px!important;color:var(--dg-text)!important;box-shadow:none!important
}
/* 搜索框与右侧「+」留出间距 */
body.zh-dg-v2 .AppHeader .SearchBar,
body.zh-dg-v2 header[role=banner] .SearchBar{
  margin-right:18px!important
}
body.zh-dg-v2 .AppHeader .SearchBar + *,
body.zh-dg-v2 header[role=banner] .SearchBar + *{
  margin-left:4px!important
}
body.zh-dg-v2 .Button--primary,body.zh-dg-v2 .Button--blue{
  background:#3a3a3a!important;border-color:#4a4a4a!important;color:#fff!important;border-radius:10px!important
}
/* 顶栏提问「+」不要被撑成大方块，且与搜索拉开 */
body.zh-dg-v2 .AppHeader .Button--primary:has(svg):not(:has(img.Avatar)),
body.zh-dg-v2 .AppHeader .Button--blue:has(svg):not(:has(img.Avatar)),
body.zh-dg-v2 .AppHeader button[aria-label*="提问"],
body.zh-dg-v2 .AppHeader a[aria-label*="提问"],
body.zh-dg-v2 .AppHeader .AskButton,
body.zh-dg-v2 .AppHeader [class*="AskQuestion"]{
  margin-left:12px!important;flex-shrink:0!important;
  width:34px!important;height:34px!important;min-width:34px!important;
  padding:0!important;border-radius:50%!important;
  display:inline-flex!important;align-items:center!important;justify-content:center!important
}
/* 原站信息流移出文档流，禁止再撑出整页高度 */
body.zh-dg-v2 .Topstory-container,body.zh-dg-v2 .GlobalSideBar,body.zh-dg-v2 .Topstory-sideBar,
body.zh-dg-v2 .Footer,body.zh-dg-v2 footer,body.zh-dg-v2 .CornerButtons,body.zh-dg-v2 .Adboard,
body.zh-dg-v2 .Topstory,body.zh-dg-v2 .Topstory-mainColumn,body.zh-dg-v2 .TopstoryMain,
body.zh-dg-v2 .App-main > :not(#zh-dg-shell){
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  max-height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;
  margin:0!important;padding:0!important;border:0!important
}
body.zh-dg-v2 #root,body.zh-dg-v2 .App,body.zh-dg-v2 .App-main,body.zh-dg-v2 .App-mainColumn{
  min-height:0!important;height:auto!important;max-height:none!important
}
/* 抓取容器：零尺寸，避免内部原站 DOM 把页面撑高 */
#zh-dg-scraper{
  position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;
  overflow:hidden!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;
  contain:strict!important;margin:0!important;padding:0!important;border:0!important
}
#zh-dg-scraper *{pointer-events:none!important}
/* 主区全宽；侧栏固定在右侧，滚到底不会变成「掉在空白里」 */
#zh-dg-shell{
  max-width:var(--dg-max);margin:12px auto 48px;padding:0 20px 48px;
  display:block;box-sizing:border-box;
  padding-right:calc(var(--dg-side) + 36px)
}
#zh-dg-main{min-width:0;width:100%}
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
  overflow:visible;box-sizing:border-box;transition:border-color .15s ease;
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
/* 原站操作栏：横向、仅图标；收藏/… 弹出层保持可用 */
.zh-dg-foot--native{
  display:block;padding:2px 8px 10px;overflow:visible;position:relative;z-index:5
}
.zh-dg-foot--native .ContentItem-actions,
.zh-dg-foot--native .RichContent-actions{
  display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;
  align-items:center!important;justify-content:flex-start!important;gap:2px!important;
  margin:0!important;padding:4px 0!important;border:0!important;border-top:0!important;
  background:transparent!important;box-shadow:none!important;
  width:100%!important;max-width:100%!important;
  position:relative!important;left:auto!important;right:auto!important;bottom:auto!important;top:auto!important;
  transform:none!important;opacity:1!important;visibility:visible!important;
  pointer-events:auto!important;height:auto!important;max-height:none!important;
  float:none!important;inset:auto!important
}
.zh-dg-foot--native .ContentItem-actions > *,
.zh-dg-foot--native .RichContent-actions > *{
  flex:0 0 auto!important;width:auto!important;max-width:none!important;
  margin:0!important;float:none!important;
  opacity:1!important;visibility:visible!important;pointer-events:auto!important;
  position:relative!important;transform:none!important;
  display:inline-flex!important;align-items:center!important;justify-content:center!important
}
/* 赞同区内部也保持横排 */
.zh-dg-foot--native .VoteButtonGroup,
.zh-dg-foot--native [class*="VoteButton"]{
  display:inline-flex!important;flex-direction:row!important;align-items:center!important;
  width:auto!important
}
.zh-dg-foot--native button,
.zh-dg-foot--native .Button,
.zh-dg-foot--native a,
.zh-dg-foot--native [role="button"]{
  color:#8ab4ff!important;background:transparent!important;border:0!important;
  box-shadow:none!important;pointer-events:auto!important;cursor:pointer!important;
  display:inline-flex!important;align-items:center!important;justify-content:center!important;
  gap:0!important;padding:8px!important;margin:0!important;
  min-width:34px!important;min-height:34px!important;border-radius:8px!important;
  /* 隐藏中文文案与数字，只留图标 */
  font-size:0!important;line-height:0!important;letter-spacing:0!important;
  white-space:nowrap!important;overflow:hidden!important
}
.zh-dg-foot--native button:hover,
.zh-dg-foot--native .Button:hover,
.zh-dg-foot--native a:hover,
.zh-dg-foot--native [role="button"]:hover{
  background:rgba(255,255,255,.08)!important;color:#b4d0ff!important
}
.zh-dg-foot--native svg,
.zh-dg-foot--native .Zi,
.zh-dg-foot--native [class*="Icon"],
.zh-dg-foot--native [class*="icon"]{
  color:#8ab4ff!important;fill:currentColor!important;
  width:18px!important;height:18px!important;min-width:18px!important;
  font-size:18px!important;line-height:18px!important;flex-shrink:0!important;
  display:block!important;opacity:1!important;visibility:visible!important
}
.zh-dg-foot--native path{fill:currentColor!important}
/* 文案节点隐藏（保留 svg / 图标容器） */
.zh-dg-foot--native button > span:not(:has(svg)):not([class*="Icon"]):not([class*="icon"]):not(.Zi),
.zh-dg-foot--native .Button > span:not(:has(svg)):not([class*="Icon"]):not([class*="icon"]):not(.Zi),
.zh-dg-foot--native .Button-label,
.zh-dg-foot--native .VoteButton-text,
.zh-dg-foot--native [class*="Button-text"],
.zh-dg-foot--native [class*="buttonText"]{
  display:none!important;font-size:0!important;width:0!important;height:0!important;
  overflow:hidden!important;margin:0!important;padding:0!important
}
.zh-dg-foot--native .VoteButton--up.is-active,
.zh-dg-foot--native .VoteButton--up[aria-pressed="true"],
.zh-dg-foot--native .is-active{
  color:#c8dcff!important
}
/* 弹出层：收藏夹 / 分享 / 更多菜单（勿用过宽选择器误伤顶栏） */
body.zh-dg-v2 .Modal-wrapper,
body.zh-dg-v2 .Modal,
body.zh-dg-v2 body > .Popover,
body.zh-dg-v2 body > div > .Popover,
body.zh-dg-v2 .Menu.Menu--top,
body.zh-dg-v2 [class*="ShareMenu"],
body.zh-dg-v2 [class*="Favlist"],
body.zh-dg-v2 [class*="favlist"],
body.zh-dg-v2 [class*="CollectionDialog"],
body.zh-dg-v2 [class*="Modal-content"]{
  z-index:300000!important
}
body.zh-dg-v2 body > .Popover .Popover-content,
body.zh-dg-v2 .Menu.Menu--top,
body.zh-dg-v2 [class*="ShareMenu"]{
  background:#2a2a2a!important;border:1px solid rgba(255,255,255,.12)!important;
  color:#e8e8e8!important;box-shadow:0 8px 28px rgba(0,0,0,.45)!important
}
/* 「…」子菜单悬停高亮 */
body.zh-dg-v2 .Menu-item:hover,
body.zh-dg-v2 .Menu-item:focus,
body.zh-dg-v2 [class*="Menu-item"]:hover,
body.zh-dg-v2 [class*="Menu-item"]:focus,
body.zh-dg-v2 body > .Popover .Popover-content button:hover,
body.zh-dg-v2 body > .Popover .Popover-content a:hover,
body.zh-dg-v2 body > .Popover [role="menuitem"]:hover,
body.zh-dg-v2 body > .Popover [role="option"]:hover{
  background:rgba(255,255,255,.12)!important;color:#fff!important
}
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
/* 每列底部「待加载」占位（滚到底时像空卡片槽等待） */
.zh-dg-pending{
  display:block;width:100%;box-sizing:border-box;min-height:168px;
  margin:0;border-radius:14px;overflow:hidden;
  background:linear-gradient(160deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.14);
  position:relative;flex:0 0 auto;
  pointer-events:none
}
.zh-dg-pending::after{
  content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);
  background-size:200% 100%;opacity:.35
}
.zh-dg-pending.is-loading{
  border-color:rgba(255,255,255,.22);
  background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.03))
}
.zh-dg-pending.is-loading::after{
  opacity:1;animation:zhDgShimmer 1.1s linear infinite
}
.zh-dg-pending.is-hidden{display:none!important}
@keyframes zhDgShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
#zh-dg-side{
  position:fixed!important;top:88px!important;right:16px!important;width:var(--dg-side);
  display:flex;flex-direction:column;gap:12px;
  max-height:calc(100vh - 104px);overflow:auto;z-index:20!important;
  box-sizing:border-box;pointer-events:auto
}
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
@media(max-width:900px){
  #zh-dg-shell{padding-right:20px}
  #zh-dg-side{display:none}
}
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
    if (!needRebuild) {
      ensurePendingSlots();
      return [...grid.children];
    }

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
    ensurePendingSlots();
    return cols;
  }

  function appendToCol(col, el) {
    if (!col || !el) return;
    const pending = col.querySelector(":scope > .zh-dg-pending");
    if (pending) col.insertBefore(el, pending);
    else col.appendChild(el);
  }

  function ensurePendingSlots() {
    const cols = [...document.querySelectorAll("#zh-dg-grid > .zh-dg-col")];
    if (!cols.length) return;
    const show = !feedState.ended;
    cols.forEach((col, i) => {
      let slot = col.querySelector(":scope > .zh-dg-pending");
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "zh-dg-pending";
        slot.setAttribute("aria-hidden", "true");
        // 略有高度差，更接近真实卡片槽
        slot.style.minHeight = `${150 + (i % 3) * 28}px`;
        col.appendChild(slot);
      } else if (slot !== col.lastElementChild) {
        col.appendChild(slot);
      }
      slot.classList.toggle("is-hidden", !show);
    });
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

  function hideZhidaEntry() {
    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header");
    if (!header) return;

    const mark = (el) => {
      if (!el || el.nodeType !== 1) return;
      el.classList.add("zh-dg-hide-zhida");
      try {
        el.style.setProperty("display", "none", "important");
      } catch (_) {}
    };

    header.querySelectorAll("a[href*='zhida'], a[href*='zhida.ai']").forEach(mark);

    header.querySelectorAll("a, button, div, span").forEach((el) => {
      const aria = (el.getAttribute("aria-label") || "").replace(/\s+/g, "");
      if (aria === "直答" || aria.includes("知乎直答")) {
        mark(el.closest("a, button") || el);
        return;
      }
      const direct = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.replace(/\s+/g, ""))
        .join("");
      if (direct !== "直答") return;
      // 向上找到整颗胶囊按钮（含图标 +「直答」）
      let p = el;
      for (let i = 0; i < 6 && p && p !== header; i++) {
        const t = (p.textContent || "").replace(/\s+/g, "");
        if (
          (p.matches?.("a, button") || p.getAttribute?.("role") === "button") &&
          t.includes("直答") &&
          t.length <= 12
        ) {
          mark(p);
          return;
        }
        if (t === "直答" || (t.includes("直答") && t.length <= 8 && p.querySelector?.("svg, img"))) {
          mark(p);
          return;
        }
        p = p.parentElement;
      }
    });
  }

  function placeSideBelowHeader() {
    const side = document.getElementById("zh-dg-side");
    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header");
    if (!side) return;
    // 侧栏挂到 body，避免压在 App-main 里盖住顶栏头像
    if (side.parentElement !== document.body) {
      document.body.appendChild(side);
    }
    const bottom = header ? header.getBoundingClientRect().bottom : 64;
    const top = Math.max(72, Math.ceil(bottom + 10));
    side.style.setProperty("top", top + "px", "important");
    side.style.setProperty("z-index", "20", "important");
    side.style.setProperty("max-height", `calc(100vh - ${top + 16}px)`, "important");
  }

  function removeAvatarBlockSquare() {
    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header");
    if (!header) return;

    const imgs = [
      ...header.querySelectorAll("img.Avatar, .Avatar img, img[class*='Avatar']"),
    ];
    if (!imgs.length) return;

    const keep = (el) => {
      if (!el || el.nodeType !== 1) return true;
      if (el === header || el === document.body || el === document.documentElement) return true;
      if (el.id === "zh-dg-shell" || el.id === "zh-dg-main" || el.id === "root") return true;
      if (el.closest?.("#zh-dg-grid, #zh-dg-main")) return true;
      const t = (el.textContent || "").replace(/\s+/g, "");
      // 保留消息/私信/创作中心入口
      if (/^(消息|私信|创作中心)$/.test(t) || (t.length <= 6 && /消息|私信|创作/.test(t))) return true;
      if (el.closest?.("a[href*='messages'], a[href*='inbox'], a[href*='creator']")) return true;
      return false;
    };

    const kill = (el) => {
      if (!el || keep(el)) return false;
      // 侧栏压住头像 → 下移，不删侧栏
      if (el.id === "zh-dg-side" || el.closest?.("#zh-dg-side")) {
        placeSideBelowHeader();
        return true;
      }
      try {
        el.setAttribute("data-zh-dg-killed", "avatar-block");
        el.remove();
        return true;
      } catch (_) {
        try {
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("pointer-events", "none", "important");
          return true;
        } catch (__) {
          return false;
        }
      }
    };

    imgs.forEach((img) => {
      const ir = img.getBoundingClientRect();
      if (ir.width < 10 || ir.height < 10) return;

      // 头像上半区取样：谁盖在上面就删谁
      const pts = [
        [0.22, 0.22],
        [0.35, 0.28],
        [0.5, 0.3],
        [0.28, 0.45],
        [0.45, 0.4],
      ];
      pts.forEach(([fx, fy]) => {
        const x = ir.left + ir.width * fx;
        const y = ir.top + ir.height * fy;
        const topEl = document.elementFromPoint(x, y);
        if (!topEl) return;
        if (topEl === img || img.contains(topEl)) return;
        // 点到包裹头像的按钮本身：检查是否有遮挡子节点
        const wrap = img.closest("button, a, [role='button']");
        if (wrap && (topEl === wrap || wrap.contains(topEl)) && (topEl === img || img.contains(topEl) || topEl.contains(img))) {
          return;
        }
        if (wrap && wrap.contains(topEl) && topEl !== img && !topEl.contains(img)) {
          // 按钮内部的遮挡层（非头像）
          if (!topEl.querySelector?.("img.Avatar, img[class*='Avatar']")) {
            kill(topEl);
            return;
          }
        }
        // 找到可删的最近容器
        let cur = topEl;
        for (let i = 0; i < 6 && cur; i++) {
          if (cur === header || cur.contains?.(img)) break;
          const r = cur.getBoundingClientRect?.();
          if (!r) break;
          const overlapW = Math.min(r.right, ir.right) - Math.max(r.left, ir.left);
          const overlapH = Math.min(r.bottom, ir.bottom) - Math.max(r.top, ir.top);
          if (overlapW > ir.width * 0.25 && overlapH > ir.height * 0.25) {
            if (kill(cur)) return;
          }
          cur = cur.parentElement;
        }
      });

      // 再扫一遍 header 内绝对定位且盖住头像上半的空块
      header.querySelectorAll("div, span, i, b, em, section").forEach((el) => {
        if (el === img || el.contains(img) || img.contains(el)) return;
        if (el.querySelector?.("img.Avatar, svg, input, a, button")) {
          // 若自身就是空装饰块仍可能盖住
          if (el.querySelector("img.Avatar")) return;
        }
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return;
        const r = el.getBoundingClientRect();
        if (r.width < 12 || r.height < 12 || r.width > 120 || r.height > 80) return;
        const overlapW = Math.min(r.right, ir.right) - Math.max(r.left, ir.left);
        const overlapH = Math.min(r.bottom, ir.top + ir.height * 0.7) - Math.max(r.top, ir.top);
        if (overlapW < ir.width * 0.35 || overlapH < ir.height * 0.25) return;
        const txt = (el.textContent || "").replace(/\s+/g, "");
        if (txt.length > 4) return;
        // 空方块 / 几乎无内容 → 删除
        kill(el);
      });
    });

    placeSideBelowHeader();
  }

  function fixHeaderProfileClick() {
    removeAvatarBlockSquare();

    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header");
    if (!header) return;

    const unlock = (el) => {
      if (!el || el.nodeType !== 1) return;
      el.classList.remove("zh-dg-hide-msg-badge");
      try {
        el.style.removeProperty("pointer-events");
        el.style.removeProperty("display");
        el.style.removeProperty("visibility");
        el.style.removeProperty("opacity");
        el.style.setProperty("pointer-events", "auto", "important");
        el.style.setProperty("cursor", "pointer", "important");
      } catch (_) {}
    };

    const clearSquare = (el) => {
      if (!el || el.nodeType !== 1) return;
      try {
        el.style.setProperty("background", "transparent", "important");
        el.style.setProperty("background-color", "transparent", "important");
        el.style.setProperty("border", "0", "important");
        el.style.setProperty("box-shadow", "none", "important");
        el.style.setProperty("border-radius", "50%", "important");
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("overflow", "visible", "important");
      } catch (_) {}
    };

    header.querySelectorAll("img.Avatar, .Avatar img, img[class*='Avatar']").forEach((img) => {
      unlock(img);
      try {
        img.style.setProperty("border-radius", "50%", "important");
        img.style.setProperty("width", "32px", "important");
        img.style.setProperty("height", "32px", "important");
        img.style.setProperty("object-fit", "cover", "important");
        img.style.setProperty("display", "block", "important");
        img.style.setProperty("position", "relative", "important");
        img.style.setProperty("z-index", "30", "important");
      } catch (_) {}
      const hit =
        img.closest("button, a, [role='button'], .AppHeader-profileEntry, .AppHeader-userInfo") ||
        img.parentElement;
      unlock(hit);
      clearSquare(hit);
      if (hit) {
        hit.style.setProperty("z-index", "30", "important");
        hit.style.setProperty("position", "relative", "important");
      }
    });

    // 搜索框与「+」间距
    const sb = header.querySelector(".SearchBar");
    if (sb) {
      sb.style.setProperty("margin-right", "18px", "important");
      const next = sb.nextElementSibling;
      if (next) next.style.setProperty("margin-left", "8px", "important");
    }
  }

  function killMsgBadgeEl(el) {
    if (!el || el.nodeType !== 1) return;
    el.classList.add("zh-dg-hide-msg-badge");
    try {
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("opacity", "0", "important");
      el.style.setProperty("pointer-events", "none", "important");
    } catch (_) {}
  }

  function isDigitBadgeText(t) {
    return /^(\d{1,3}\+?|99\+)$/.test(String(t || "").trim());
  }

  function isRedish(bg) {
    const m = String(bg || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return /#(f{2}|e[0-9a-f]|ff)[0-9a-f]{0,2}[0-4]/i.test(bg || "");
    const r = +m[1],
      g = +m[2],
      b = +m[3];
    return r >= 180 && g <= 120 && b <= 120;
  }

  function hideMessageBadge() {
    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header") ||
      document.body;
    if (!header) return;

    header.querySelectorAll(".Messages-count, .css-ybodb").forEach(killMsgBadgeEl);

    // 找到「私信」文案，向上找入口容器，再清其中角标
    const labelNodes = [];
    header.querySelectorAll("a, button, span, div, p, label").forEach((el) => {
      const aria = el.getAttribute("aria-label") || "";
      if (aria.includes("私信")) labelNodes.push(el);
      // 自身直接文本为「私信」
      const direct = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.replace(/\s+/g, ""))
        .join("");
      if (direct === "私信") labelNodes.push(el);
      if (el.childElementCount === 0 && (el.textContent || "").replace(/\s+/g, "") === "私信") {
        labelNodes.push(el);
      }
    });

    const boxes = new Set();
    labelNodes.forEach((el) => {
      let p = el;
      for (let i = 0; i < 8 && p && p !== header; i++) {
        boxes.add(p);
        // 优先停在可点击入口
        if (p.matches?.("a, button, [role='button']")) break;
        p = p.parentElement;
      }
    });

    // href 含 messages 的入口
    header.querySelectorAll("a[href*='messages'], a[href*='inbox'], a[href*='Message']").forEach((a) => boxes.add(a));

    boxes.forEach((box) => {
      box.querySelectorAll("*").forEach((node) => {
        if (node.closest?.("svg")) return;
        if (node.querySelector?.("svg, img, a, button")) return;
        const full = (node.textContent || "").replace(/\s+/g, "");
        if (full.includes("私信") || full.includes("消息") || full.includes("创作")) return;

        const rect = node.getBoundingClientRect?.();
        const w = rect?.width || 0;
        const h = rect?.height || 0;
        if (w > 36 || h > 36) return;

        let st;
        try {
          st = getComputedStyle(node);
        } catch (_) {
          return;
        }

        const digit = isDigitBadgeText(full);
        const abs = st.position === "absolute" || st.position === "fixed";
        const red = isRedish(st.backgroundColor) || isRedish(st.borderColor);
        // 纯数字小块，或绝对定位的小红点/带数字角标
        if (digit || (abs && (digit || red || (w >= 6 && h >= 6 && w <= 24 && h <= 24 && red)))) {
          killMsgBadgeEl(node);
        }
      });
    });

    try {
      const next = document.title
        .replace(/^\(\d+\s*封私信[，,]\s*/u, "(")
        .replace(/^\(\d+\s*封私信\)\s*/u, "");
      if (next !== document.title) document.title = next;
    } catch (_) {}
  }

  // 尽早、全站持续清理角标（不限于首页）
  function watchMessageBadge() {
    if (watchMessageBadge._on) return;
    watchMessageBadge._on = true;
    const run = () => {
      try {
        hideZhidaEntry();
        hideMessageBadge();
        fixHeaderProfileClick();
      } catch (_) {}
    };
    run();
    setInterval(run, 800);
    const startObs = () => {
      const root = document.querySelector(".AppHeader") || document.body || document.documentElement;
      if (!root || watchMessageBadge._obs) return;
      watchMessageBadge._obs = new MutationObserver(() => {
        clearTimeout(watchMessageBadge._t);
        watchMessageBadge._t = setTimeout(run, 50);
      });
      watchMessageBadge._obs.observe(root, { childList: true, subtree: true, characterData: true });
    };
    if (document.body) startObs();
    else document.addEventListener("DOMContentLoaded", startObs, { once: true });
  }
  watchMessageBadge();

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
        sourceEl: node,
      });
    });
    return out;
  }

  const ACTION_BAR_SEL = ".ContentItem-actions, .RichContent-actions";

  function findCardByKey(key) {
    return [...document.querySelectorAll("#zh-dg-grid .zh-dg-card")].find(
      (c) => c.getAttribute("data-key") === key
    );
  }

  function findActionBar(root) {
    if (!root || !root.querySelector) return null;
    return root.querySelector(ACTION_BAR_SEL);
  }

  function findSourceEl(item) {
    if (!item) return null;
    if (item.sourceEl && document.contains(item.sourceEl)) return item.sourceEl;
    const scope = document.getElementById("zh-dg-scraper") || document;
    const nodes = scope.querySelectorAll(".Card.TopstoryItem, .TopstoryItem");
    for (const node of nodes) {
      if (node.classList.contains("TopstoryItem--advertCard")) continue;
      if (item.id) {
        const id = String(item.id);
        if (item.kind === "answer" && node.querySelector(`a[href*="/answer/${id}"]`)) return node;
        if (item.kind === "article" && node.querySelector(`a[href*="/p/${id}"]`)) return node;
        if (item.kind === "zvideo" && node.querySelector(`a[href*="/zvideo/${id}"]`)) return node;
        if (item.kind === "question" && node.querySelector(`a[href*="/question/${id}"]`)) return node;
      }
      if (item.href) {
        try {
          const path = new URL(item.href, location.origin).pathname;
          if (path.length > 3 && node.querySelector(`a[href*="${path}"]`)) return node;
        } catch (_) {}
      }
      const title = text(node.querySelector(".ContentItem-title, h2"));
      if (title && item.title && title === item.title) return node;
    }
    return null;
  }

  function harvestSourceEls() {
    const scope = document.getElementById("zh-dg-scraper") || document;
    scope.querySelectorAll(".Card.TopstoryItem, .TopstoryItem").forEach((node) => {
      if (node.classList.contains("TopstoryItem--advertCard")) return;
      const title = text(node.querySelector(".ContentItem-title, h2"));
      if (!title) return;
      const a =
        node.querySelector(".ContentItem-title a, h2 a, a[href*='/question/'], a[href*='zhuanlan']") ||
        node.querySelector("a");
      const href = a?.href || location.href;
      const key = href + "|" + title;
      let item = store.get(key);
      if (!item) {
        const mAns = href.match(/answer\/(\d+)/);
        const mArt = href.match(/\/p\/(\d+)/);
        const mZv = href.match(/zvideo\/(\d+)/);
        const id = (mAns && mAns[1]) || (mArt && mArt[1]) || (mZv && mZv[1]);
        if (id) {
          for (const it of store.values()) {
            if (String(it.id) === id) {
              item = it;
              break;
            }
          }
        }
      }
      if (!item) {
        for (const it of store.values()) {
          if (it.title === title) {
            item = it;
            break;
          }
        }
      }
      if (item) item.sourceEl = node;
    });
  }

  function polishNativeActionBar(bar) {
    if (!bar) return;
    bar.style.setProperty("display", "flex", "important");
    bar.style.setProperty("flex-direction", "row", "important");
    bar.style.setProperty("flex-wrap", "nowrap", "important");
    bar.style.setProperty("align-items", "center", "important");
    if (bar.dataset.zhDgAria === "1") return;
    bar.dataset.zhDgAria = "1";
    bar.querySelectorAll("button, a, [role='button'], .Button").forEach((btn) => {
      if (!btn.getAttribute("aria-label")) {
        const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
        if (raw) btn.setAttribute("aria-label", raw.slice(0, 40));
      }
      if (!btn.title) btn.title = btn.getAttribute("aria-label") || "";
    });
  }

  function attachNativeActions(card, item) {
    if (!card || !item) return false;
    const foot = card.querySelector(".zh-dg-foot");
    if (!foot) return false;

    const src = findSourceEl(item);
    if (src) item.sourceEl = src;

    const existing = findActionBar(foot);
    let bar = src ? findActionBar(src) : null;

    // 已挂上且源端没有更新出新栏
    if (existing && (!bar || bar === existing)) {
      foot.classList.add("zh-dg-foot--native");
      polishNativeActionBar(existing);
      return true;
    }
    if (!bar) return !!existing;

    // 在原位置留占位，便于 React 更新时再找回
    if (!bar.closest(".zh-dg-foot")) {
      const ph = document.createElement("div");
      ph.className = "zh-dg-actions-ph";
      ph.setAttribute("data-zh-dg-key", item.key);
      ph.style.cssText = "display:none!important";
      bar.parentNode.insertBefore(ph, bar);
      item._actionsPh = ph;
    }

    foot.innerHTML = "";
    foot.classList.add("zh-dg-foot--native");
    foot.appendChild(bar);
    polishNativeActionBar(bar);
    return true;
  }

  function linkNativeActions() {
    harvestSourceEls();
    for (const [key, item] of store) {
      const card = findCardByKey(key);
      if (!card) continue;
      attachNativeActions(card, item);
    }
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
    ensurePendingSlots();
    document.querySelectorAll("#zh-dg-grid .zh-dg-pending").forEach((el) => {
      el.classList.toggle("is-loading", !!on);
    });
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
      if (card) {
        appendToCol(cols[(orderList.length - 1) % n], card);
        attachNativeActions(card, it);
      }
    });
    // API 先到、DOM 后到：补挂原站操作栏
    queueMicrotask(() => linkNativeActions());
    setTimeout(linkNativeActions, 400);
    setTimeout(linkNativeActions, 1200);
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
    hideZhidaEntry();
    hideMessageBadge();
    fixHeaderProfileClick();
    placeSideBelowHeader();

    if (document.getElementById("zh-dg-shell")) {
      // 去掉与顶栏重复的「快捷入口」
      document.getElementById("zh-dg-loading")?.remove();
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

      // 原站操作栏：保留原生点击（赞/反对/收藏/喜欢/分享/…）
      // 「评论」在隐藏 DOM 内展开不可见，改为打开卡片内评论面板
      const nativeFoot = ev.target.closest(".zh-dg-foot--native");
      if (nativeFoot) {
        const btn = ev.target.closest("button, a, [role='button'], .Button");
        const lab = ((btn && (btn.getAttribute("aria-label") || btn.textContent)) || "")
          .replace(/\s+/g, " ")
          .trim();
        const isComment =
          !!btn &&
          (/评论/.test(lab) || /comment/i.test(btn.className || "")) &&
          !/关闭评论|收起评论/.test(lab);
        if (isComment) {
          ev.preventDefault();
          ev.stopPropagation();
          const open = !card.classList.contains("is-comments");
          card.classList.toggle("is-comments", open);
          if (open) await openComments(card, item);
        }
        return;
      }

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
      ensurePendingSlots();
    }
  }

  function sync() {
    if (!isHome()) return;
    ensureShell();
    ensureScraper();
    harvestSourceEls();
    render(fromDom());
    linkNativeActions();
    ensurePendingSlots();
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
      linkNativeActions();
    });

    // 原站懒渲染操作栏 / React 重建时重新挂到卡片
    const moScrape = new MutationObserver(() => {
      clearTimeout(moScrape._t);
      moScrape._t = setTimeout(linkNativeActions, 200);
    });
    const watchScraper = () => {
      const sc = document.getElementById("zh-dg-scraper");
      if (sc) moScrape.observe(sc, { childList: true, subtree: true });
      else setTimeout(watchScraper, 300);
    };
    watchScraper();
    setInterval(linkNativeActions, 3000);

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
      hideZhidaEntry();
      hideMessageBadge();
      fixHeaderProfileClick();
      if ([2, 4, 8].includes(n)) loadMore("boot-" + n);
      n += 1;
      if (n > 30) clearInterval(timer);
    }, 600);

    setInterval(() => {
      hideZhidaEntry();
      hideMessageBadge();
      fixHeaderProfileClick();
    }, 2000);

    new MutationObserver(() => {
      clearTimeout(bootUi._t);
      bootUi._t = setTimeout(sync, 180);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.body) bootUi();
  else document.addEventListener("DOMContentLoaded", bootUi, { once: true });
})();
