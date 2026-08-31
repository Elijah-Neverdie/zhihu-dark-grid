// ==UserScript==
// @name         知乎暗色网格首页
// @namespace    https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @version      3.5.8
// @description  嵌套评论/返回评论抽屉统一暗色主题
// @author       Elijah-Neverdie
// @homepageURL  https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @supportURL   https://github.com/Elijah-Neverdie/zhihu-dark-grid/issues
// @updateURL    https://cdn.jsdelivr.net/gh/Elijah-Neverdie/zhihu-dark-grid@master/zhihu-dark-grid.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/Elijah-Neverdie/zhihu-dark-grid@master/zhihu-dark-grid.user.js
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
    const p = location.pathname.replace(/\/+$/, "") || "/";
    // 仅首页推荐 / 关注流；消息、私信、创作中心、个人页等一律原站
    if (
      p.startsWith("/notifications") ||
      p.startsWith("/messages") ||
      p.startsWith("/inbox") ||
      p.startsWith("/creator") ||
      p.startsWith("/people") ||
      p.startsWith("/question") ||
      p.startsWith("/answer") ||
      p.startsWith("/pin") ||
      p.startsWith("/collection") ||
      p.startsWith("/settings") ||
      p.startsWith("/search") ||
      p === "/hot" ||
      p.startsWith("/hot/")
    ) {
      return false;
    }
    return p === "/" || p === "/follow" || p.startsWith("/follow/");
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
body.zh-dg-v2,body.zh-dg-v2 #root{background:#141414!important;color:#e8e8e8!important}
body.zh-dg-v2{
  --dg-card:#1e1e1e;--dg-card2:#262626;--dg-line:rgba(255,255,255,.08);
  --dg-text:#e8e8e8;--dg-sub:#a3a3a3;--dg-mute:#737373;--dg-accent:#9a9a9a;
  --dg-elev:#242424;--dg-max:100%;--dg-side:280px;--dg-img-sat:1;overflow-x:hidden!important;
  --dg-overlay:#2a2a2a;--dg-overlay-2:#323232;--dg-overlay-3:#3a3a3a;
  --dg-overlay-line:rgba(255,255,255,.14);--dg-overlay-hover:rgba(255,255,255,.08);
  --dg-overlay-link:#cfcfcf;--dg-overlay-link-hover:#f2f2f2
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
/* 隐藏私信未读角标（仅首页改造态） */
body.zh-dg-v2 .Messages-count,
body.zh-dg-v2 .css-ybodb,
body.zh-dg-v2 .zh-dg-hide-msg-badge{
  display:none!important;visibility:hidden!important;opacity:0!important;
  width:0!important;height:0!important;min-width:0!important;max-width:0!important;
  padding:0!important;margin:0!important;overflow:hidden!important;font-size:0!important;
  border:0!important;pointer-events:none!important
}
/* 常见伪元素角标 */
body.zh-dg-v2 a[href*="/messages"]::before,
body.zh-dg-v2 a[href*="/messages"]::after,
body.zh-dg-v2 button[aria-label*="私信"]::before,
body.zh-dg-v2 button[aria-label*="私信"]::after{content:none!important;display:none!important}
body.zh-dg-v2 #zh-dg-actions,body.zh-dg-v2 #zh-dg-guess{display:none!important}
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
/* 原站信息流 / 侧栏移出文档流 */
body.zh-dg-v2 .Topstory-container,body.zh-dg-v2 .GlobalSideBar,body.zh-dg-v2 .Topstory-sideBar,
body.zh-dg-v2 .Footer,body.zh-dg-v2 footer,body.zh-dg-v2 .CornerButtons,body.zh-dg-v2 .Adboard,
body.zh-dg-v2 .Topstory,body.zh-dg-v2 .Topstory-mainColumn,body.zh-dg-v2 .TopstoryMain,
body.zh-dg-v2 .App-main .Sticky,body.zh-dg-v2 .App-main [class*="GlobalSideBar"],
body.zh-dg-v2 .App-main [class*="Topstory-side"],body.zh-dg-v2 .App-main [class*="SideBar"]:not(#zh-dg-side),
body.zh-dg-v2 .App-main [class*="Sidebar"]:not(#zh-dg-side),
body.zh-dg-v2 #root [class*="GlobalSideBar"]:not(#zh-dg-side),
body.zh-dg-v2 #root [class*="Topstory-side"]:not(#zh-dg-side){
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  max-height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;
  margin:0!important;padding:0!important;border:0!important
}
/* 首页改造态：App-main 内只留自建 layout（消息/通知浮层一般挂在 body，不受影响） */
body.zh-dg-v2 .App-main > *:not(#zh-dg-layout){
  position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;
  max-height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;
  margin:0!important;padding:0!important;border:0!important;visibility:hidden!important
}
body.zh-dg-v2 .App-main > #zh-dg-layout{
  position:relative!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;
  max-height:none!important;overflow:visible!important;opacity:1!important;pointer-events:auto!important;
  visibility:visible!important;margin:12px auto 48px!important
}
body.zh-dg-v2 #root,body.zh-dg-v2 .App,body.zh-dg-v2 .App-main,body.zh-dg-v2 .App-mainColumn{
  min-height:0!important;height:auto!important;max-height:none!important
}
/* 消息 / 私信 / 通知浮层压过网格 */
body.zh-dg-v2 .AppHeader [class*="Popover"],
body.zh-dg-v2 .AppHeader .Popover,
body.zh-dg-v2 [class*="Notification"],
body.zh-dg-v2 [class*="Messages"],
body.zh-dg-v2 [class*="Inbox"],
body.zh-dg-v2 [class*="PushNotifications"]{
  z-index:300500!important
}
/* 抓取容器：零尺寸，避免内部原站 DOM 把页面撑高 */
body.zh-dg-v2 #zh-dg-scraper{
  position:fixed!important;left:0!important;top:0!important;width:360px!important;height:120px!important;
  overflow:hidden!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;
  contain:none!important;margin:0!important;padding:0!important;border:0!important
}
body.zh-dg-v2 #zh-dg-scraper *{pointer-events:none!important}
/* 主区 + 侧栏：flex 双栏强分离（避免 fixed 侧栏在浮层 transform 下叠到网格上） */
#zh-dg-layout{
  display:flex;align-items:flex-start;gap:16px;width:100%;max-width:var(--dg-max);
  margin:0 auto;padding:0 20px 48px;box-sizing:border-box
}
#zh-dg-shell{
  flex:1 1 auto;min-width:0;width:auto;max-width:none;margin:0;padding:0;
  display:block;box-sizing:border-box
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
  overflow:visible;box-sizing:border-box;
  transition:border-color .15s ease
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
.zh-dg-media{
  width:100%;border-radius:10px;overflow:hidden;background:#111;margin-bottom:10px;
  aspect-ratio:16/10;max-height:280px;
  transition:max-height .2s ease,opacity .2s ease,margin .2s ease,padding .2s ease
}
.zh-dg-media img{width:100%;height:100%;object-fit:cover;display:block;
  filter:saturate(var(--dg-img-sat,1));transition:filter .2s ease
}
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
.zh-dg-full img,.zh-dg-full video{
  max-width:100%!important;height:auto!important;border-radius:8px;
  filter:saturate(var(--dg-img-sat,1));transition:filter .2s ease
}
.zh-dg-full p{margin:0 0 .8em}
.zh-dg-foot{
  display:flex;align-items:center;gap:2px;padding:6px 10px 12px;
  color:var(--dg-mute);font-size:12px;position:relative;overflow:visible
}
.zh-dg-icons{
  display:flex;align-items:center;flex-wrap:nowrap;gap:2px;width:100%;min-width:0
}
.zh-dg-ico{
  appearance:none;border:0;background:transparent;color:#a8a8a8;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;
  width:32px;height:32px;padding:0;border-radius:8px;flex:0 0 32px;
  font-size:15px;line-height:1;user-select:none
}
.zh-dg-ico:hover{background:rgba(255,255,255,.1);color:#f0f0f0}
.zh-dg-ico.is-on{color:#ffffff}
.zh-dg-ico svg{width:16px;height:16px;display:block;fill:currentColor;flex-shrink:0}
/* 原站操作栏：勿再搬进 slot（会打断 React）；点击时临时浮起 */
.zh-dg-native-slot{display:none!important}
body.zh-dg-v2 #zh-dg-scraper.zh-dg-scraper-live{
  left:0!important;top:0!important;width:100vw!important;height:100vh!important;
  opacity:1!important;overflow:visible!important;z-index:300400!important;
  pointer-events:none!important;contain:none!important
}
body.zh-dg-v2 .zh-dg-native-live{
  position:fixed!important;z-index:300500!important;opacity:1!important;
  pointer-events:auto!important;visibility:visible!important;
  display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;
  background:var(--dg-overlay-2,#323232)!important;border:1px solid var(--dg-overlay-line,rgba(255,255,255,.14))!important;
  border-radius:10px!important;padding:6px 8px!important;box-shadow:0 12px 32px rgba(0,0,0,.55)!important;
  max-width:min(92vw,520px)!important;overflow:visible!important
}
body.zh-dg-v2 .zh-dg-native-live button,
body.zh-dg-v2 .zh-dg-native-live a,
body.zh-dg-v2 .zh-dg-native-live .Button{
  pointer-events:auto!important;color:#e8e8e8!important
}
body.zh-dg-v2 #zh-dg-scraper .zh-dg-native-live,
body.zh-dg-v2 #zh-dg-scraper .zh-dg-native-live *{
  pointer-events:auto!important;visibility:visible!important
}
/* 弹出层：收藏夹 / 分享 / 更多菜单 / 消息 / 评论（勿用过宽选择器误伤顶栏） */
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
body.zh-dg-v2 [class*="ShareMenu"],
body.zh-dg-v2 .AppHeader .Popover-content,
body.zh-dg-v2 .AppHeader [class*="Popover-content"],
body.zh-dg-v2 .PushNotifications,
body.zh-dg-v2 .NotificationList,
body.zh-dg-v2 .Messages-content,
body.zh-dg-v2 [class*="Messages-content"],
body.zh-dg-v2 [class*="Notifications-content"],
body.zh-dg-v2 .Popover-content:has(.PushNotifications),
body.zh-dg-v2 .Popover-content:has([class*="PushNotifications"]),
body.zh-dg-v2 .Popover-content:has(.NotificationList),
body.zh-dg-v2 .Popover-content:has([class*="NotificationList"]){
  background:var(--dg-overlay)!important;border:1px solid var(--dg-overlay-line)!important;
  color:var(--dg-text)!important;box-shadow:0 12px 40px rgba(0,0,0,.55)!important;
  border-radius:12px!important
}
/* 面板根容器（排除 item/tab/header 等子块） */
body.zh-dg-v2 [class*="PushNotifications"]:not([class*="item"]):not([class*="Item"]):not([class*="tab"]):not([class*="Tab"]):not([class*="header"]):not([class*="Header"]):not([class*="footer"]):not([class*="Footer"]):not([class*="count"]),
body.zh-dg-v2 [class*="NotificationList"]:not([class*="Item"]):not([class*="item"]):not([class*="Date"]){
  background:var(--dg-overlay)!important;color:var(--dg-text)!important;
  border-color:var(--dg-overlay-line)!important
}
/* 消息 / 通知面板分区 */
body.zh-dg-v2 .PushNotifications-header,
body.zh-dg-v2 [class*="PushNotifications-header"],
body.zh-dg-v2 .Messages-header,
body.zh-dg-v2 [class*="Messages-header"],
body.zh-dg-v2 .Notifications-footer,
body.zh-dg-v2 .Messages-footer,
body.zh-dg-v2 [class*="Notifications-footer"],
body.zh-dg-v2 [class*="Messages-footer"],
body.zh-dg-v2 .PushNotifications-footer,
body.zh-dg-v2 [class*="PushNotifications-footer"]{
  background:var(--dg-overlay-2)!important;border-color:var(--dg-overlay-line)!important;
  color:var(--dg-sub)!important
}
body.zh-dg-v2 .PushNotifications-item,
body.zh-dg-v2 [class*="PushNotifications-item"],
body.zh-dg-v2 .NotificationList-Item,
body.zh-dg-v2 [class*="NotificationList-Item"],
body.zh-dg-v2 .Messages-item,
body.zh-dg-v2 [class*="Messages-item"]{
  background:transparent!important;color:var(--dg-text)!important;
  border-color:rgba(255,255,255,.06)!important
}
body.zh-dg-v2 .PushNotifications-item:hover,
body.zh-dg-v2 [class*="PushNotifications-item"]:hover,
body.zh-dg-v2 .NotificationList-Item:hover,
body.zh-dg-v2 [class*="NotificationList-Item"]:hover,
body.zh-dg-v2 .Messages-item:hover,
body.zh-dg-v2 [class*="Messages-item"]:hover{
  background:var(--dg-overlay-hover)!important
}
body.zh-dg-v2 .PushNotifications-item a,
body.zh-dg-v2 [class*="PushNotifications-item"] a,
body.zh-dg-v2 .NotificationList-Item a,
body.zh-dg-v2 [class*="NotificationList-Item"] a,
body.zh-dg-v2 .NotificationList-Item-link,
body.zh-dg-v2 [class*="NotificationList-Item-link"]{
  color:var(--dg-text)!important
}
body.zh-dg-v2 .PushNotifications-item a:hover,
body.zh-dg-v2 [class*="PushNotifications-item"] a:hover,
body.zh-dg-v2 .NotificationList-Item a:hover,
body.zh-dg-v2 [class*="NotificationList-Item"] a:hover{
  color:var(--dg-overlay-link-hover)!important
}
body.zh-dg-v2 .PushNotifications-tab,
body.zh-dg-v2 [class*="PushNotifications-tab"],
body.zh-dg-v2 .Messages-tab,
body.zh-dg-v2 [class*="Messages-tab"]{
  color:var(--dg-mute)!important;background:transparent!important
}
body.zh-dg-v2 .PushNotifications-tab.is-active,
body.zh-dg-v2 [class*="PushNotifications-tab"].is-active,
body.zh-dg-v2 .Messages-tab.is-active,
body.zh-dg-v2 [class*="Messages-tab"].is-active{
  color:var(--dg-text)!important
}
body.zh-dg-v2 .PushNotifications time,
body.zh-dg-v2 [class*="PushNotifications"] time,
body.zh-dg-v2 .NotificationList time,
body.zh-dg-v2 [class*="NotificationList"] time,
body.zh-dg-v2 .PushNotifications [class*="time"],
body.zh-dg-v2 [class*="NotificationList"] [class*="time"],
body.zh-dg-v2 [class*="NotificationList"] [class*="meta"]{
  color:var(--dg-mute)!important
}
/* Modal：评论回复等 — 遮罩压暗 + 圆角仅作用于内层面板 */
body.zh-dg-v2 .Modal-wrapper,
body.zh-dg-v2 [class*="Modal-wrapper"]{
  background:rgba(0,0,0,.78)!important;
  backdrop-filter:none!important
}
body.zh-dg-v2 .Modal-backdrop,
body.zh-dg-v2 [class*="Modal-backdrop"]{
  background:rgba(0,0,0,.78)!important
}
body.zh-dg-v2 .Modal-wrapper .Modal,
body.zh-dg-v2 .Modal-wrapper > .Modal,
body.zh-dg-v2 .Modal-wrapper > div,
body.zh-dg-v2 [class*="Modal-wrapper"] [class*="Modal-modal"],
body.zh-dg-v2 [class*="Modal-wrapper"] [role="dialog"]{
  background:transparent!important;border:0!important;box-shadow:none!important;
  border-radius:0!important;overflow:visible!important
}
body.zh-dg-v2 .Modal-wrapper .zh-dg-painted,
body.zh-dg-v2 [class*="Modal-wrapper"] > .zh-dg-painted,
body.zh-dg-v2 [class*="Modal-wrapper"] [class*="Modal-modal"].zh-dg-painted,
body.zh-dg-v2 [class*="Modal-wrapper"] .Modal.zh-dg-painted,
body.zh-dg-v2 [class*="Modal-wrapper"] [role="dialog"].zh-dg-painted{
  background:transparent!important;background-image:none!important
}
body.zh-dg-v2.zh-dg-overlay-open #zh-dg-layout{
  filter:brightness(.48);transition:filter .2s ease
}
body.zh-dg-v2 .Modal-wrapper .Modal-inner,
body.zh-dg-v2 .Modal-wrapper [class*="Modal-inner"],
body.zh-dg-v2 .Modal-wrapper .Modal-content,
body.zh-dg-v2 .Modal-wrapper [class*="Modal-content"]{
  background:var(--dg-overlay)!important;color:var(--dg-text)!important;
  border:1px solid var(--dg-overlay-line)!important;
  box-shadow:0 20px 56px rgba(0,0,0,.72)!important;
  border-radius:12px!important;overflow:hidden!important;
  clip-path:inset(0 round 12px)!important;isolation:isolate!important
}
body.zh-dg-v2 .Modal-inner > *,
body.zh-dg-v2 [class*="Modal-inner"] > *,
body.zh-dg-v2 .Modal-wrapper [class*="Modal-content"] > *{
  border-radius:0!important
}
body.zh-dg-v2 .Modal-header,
body.zh-dg-v2 .Modal-title,
body.zh-dg-v2 [class*="Modal-header"],
body.zh-dg-v2 [class*="Modal-title"],
body.zh-dg-v2 .CommentTopbar,
body.zh-dg-v2 [class*="CommentTopbar"]{
  background:var(--dg-overlay-2)!important;color:var(--dg-text)!important;
  border-color:var(--dg-overlay-line)!important
}
body.zh-dg-v2 .Modal-closeButton,
body.zh-dg-v2 [class*="Modal-close"],
body.zh-dg-v2 button[aria-label="关闭"]{
  color:var(--dg-sub)!important
}
body.zh-dg-v2 .Modal-closeButton:hover,
body.zh-dg-v2 [class*="Modal-close"]:hover,
body.zh-dg-v2 button[aria-label="关闭"]:hover{
  color:var(--dg-text)!important;background:var(--dg-overlay-hover)!important
}
/* 评论弹层内卡片 / 条目：去掉白底 */
body.zh-dg-v2 .Modal-wrapper .Card,
body.zh-dg-v2 .Modal-wrapper .CommentsV2,
body.zh-dg-v2 .Modal-wrapper .CommentItemV2,
body.zh-dg-v2 .Modal-wrapper .NestComment,
body.zh-dg-v2 .Modal-wrapper [class*="CommentsV2"],
body.zh-dg-v2 .Modal-wrapper [class*="CommentItem"],
body.zh-dg-v2 .Modal-wrapper [class*="NestComment"],
body.zh-dg-v2 .Modal-wrapper [class*="CommentList"],
body.zh-dg-v2 .Modal-wrapper [class*="CommentBox"],
body.zh-dg-v2 [role="dialog"] .Card,
body.zh-dg-v2 [role="dialog"] [class*="CommentItem"],
body.zh-dg-v2 [role="dialog"] [class*="NestComment"],
body.zh-dg-v2 [role="dialog"] [class*="CommentsV2"],
body.zh-dg-v2 body > .Popover:has(.CommentTopbar) .Card,
body.zh-dg-v2 body > .Popover:has([class*="CommentTopbar"]) .Card,
body.zh-dg-v2 body > .Popover:has(.CommentTopbar) [class*="CommentItem"],
body.zh-dg-v2 body > .Popover:has([class*="CommentTopbar"]) [class*="CommentItem"],
body.zh-dg-v2 body > .Popover:has(.CommentTopbar) [class*="CommentsV2"],
body.zh-dg-v2 body > div:has(> .CommentTopbar) .CommentItemV2,
body.zh-dg-v2 body > div:has(> .CommentTopbar) [class*="CommentItem"],
body.zh-dg-v2 body > div:has(> [class*="CommentTopbar"]) .CommentItemV2,
body.zh-dg-v2 body > div:has(> [class*="CommentTopbar"]) [class*="CommentItem"]{
  background:var(--dg-overlay)!important;color:var(--dg-text)!important;
  border-color:rgba(255,255,255,.06)!important;box-shadow:none!important
}
/* 嵌套评论抽屉（「返回评论」）— 不一定在 Modal-wrapper 内 */
body.zh-dg-v2 [role="dialog"]:has(.CommentTopbar),
body.zh-dg-v2 [role="dialog"]:has([class*="CommentTopbar"]),
body.zh-dg-v2 body > .Popover:has(.CommentTopbar),
body.zh-dg-v2 body > .Popover:has([class*="CommentTopbar"]),
body.zh-dg-v2 body > div:has(> .CommentTopbar):not(#zh-dg-layout):not(#zh-dg-shell):not(#zh-dg-scraper),
body.zh-dg-v2 body > div:has(> [class*="CommentTopbar"]):not(#zh-dg-layout):not(#zh-dg-shell):not(#zh-dg-scraper){
  background:rgba(0,0,0,.78)!important
}
body.zh-dg-v2 body > .Popover:has(.CommentTopbar) .Popover-content,
body.zh-dg-v2 body > .Popover:has([class*="CommentTopbar"]) .Popover-content,
body.zh-dg-v2 [role="dialog"]:has(.CommentTopbar),
body.zh-dg-v2 [role="dialog"]:has([class*="CommentTopbar"]),
body.zh-dg-v2 body > div:has(> .CommentTopbar):not(#zh-dg-layout) > div:has(.CommentTopbar),
body.zh-dg-v2 body > div:has(> [class*="CommentTopbar"]):not(#zh-dg-layout) > div:has([class*="CommentTopbar"]){
  background:var(--dg-overlay)!important;color:var(--dg-text)!important;
  border:1px solid var(--dg-overlay-line)!important;
  border-radius:12px!important;overflow:hidden!important;
  box-shadow:0 20px 56px rgba(0,0,0,.72)!important
}
body.zh-dg-v2 .CommentsV2,
body.zh-dg-v2 [class*="CommentsV2"],
body.zh-dg-v2 [class*="CommentList"],
body.zh-dg-v2 [class*="CommentScroller"],
body.zh-dg-v2 [class*="CommentBox"],
body.zh-dg-v2 [class*="NestComment"]{
  background:var(--dg-overlay)!important;color:var(--dg-text)!important
}
body.zh-dg-v2 .Modal-wrapper .CommentItemV2-meta,
body.zh-dg-v2 .Modal-wrapper [class*="CommentItem"] [class*="meta"],
body.zh-dg-v2 .Modal-wrapper .CommentItemV2-time,
body.zh-dg-v2 .Modal-wrapper .CommentItemV2-reply,
body.zh-dg-v2 .Modal-wrapper [class*="CommentItem"] button,
body.zh-dg-v2 [role="dialog"] [class*="CommentItem"] [class*="meta"],
body.zh-dg-v2 [role="dialog"] [class*="CommentItem"] button,
body.zh-dg-v2 body > .Popover [class*="CommentItem"] [class*="meta"],
body.zh-dg-v2 body > .Popover [class*="CommentItem"] button{
  color:var(--dg-mute)!important
}
body.zh-dg-v2 .Modal-wrapper a,
body.zh-dg-v2 [role="dialog"] a,
body.zh-dg-v2 body > .Popover:has(.CommentTopbar) a,
body.zh-dg-v2 body > .Popover:has([class*="CommentTopbar"]) a{
  color:var(--dg-overlay-link)!important
}
body.zh-dg-v2 .Modal-wrapper a:hover,
body.zh-dg-v2 [role="dialog"] a:hover,
body.zh-dg-v2 body > .Popover:has(.CommentTopbar) a:hover,
body.zh-dg-v2 body > .Popover:has([class*="CommentTopbar"]) a:hover{
  color:var(--dg-overlay-link-hover)!important
}
body.zh-dg-v2 .Modal-wrapper .AuthorInfo-name,
body.zh-dg-v2 .Modal-wrapper [class*="AuthorInfo"],
body.zh-dg-v2 .Modal-wrapper [class*="UserLink"],
body.zh-dg-v2 [role="dialog"] [class*="AuthorInfo"],
body.zh-dg-v2 [role="dialog"] [class*="UserLink"]{
  color:var(--dg-text)!important
}
body.zh-dg-v2 .Modal-wrapper textarea,
body.zh-dg-v2 .Modal-wrapper input,
body.zh-dg-v2 .Modal-wrapper .Input,
body.zh-dg-v2 .Modal-wrapper [class*="Input"],
body.zh-dg-v2 [role="dialog"] textarea,
body.zh-dg-v2 [role="dialog"] input{
  background:var(--dg-elev)!important;color:var(--dg-text)!important;
  border:1px solid var(--dg-line)!important
}
body.zh-dg-v2 .Modal-wrapper .zh-dg-painted,
body.zh-dg-v2 [class*="Modal-wrapper"] .zh-dg-painted,
body.zh-dg-v2 [role="dialog"] .zh-dg-painted,
body.zh-dg-v2 body > .Popover .zh-dg-painted,
body.zh-dg-v2 body > div:has(.CommentTopbar) .zh-dg-painted,
body.zh-dg-v2 body > div:has([class*="CommentTopbar"]) .zh-dg-painted,
body.zh-dg-v2 .Popover-content .zh-dg-painted,
body.zh-dg-v2 [class*="PushNotifications"] .zh-dg-painted,
body.zh-dg-v2 [class*="NotificationList"] .zh-dg-painted{
  background:var(--dg-overlay-2)!important;color:var(--dg-text)!important
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
/* Q 键：收起图片，0.2s 高度动画（勿用 display:none，否则无法过渡） */
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-media{
  max-height:0!important;min-height:0!important;height:0!important;
  opacity:0!important;margin:0!important;padding:0!important;border:0!important;
  aspect-ratio:unset!important;overflow:hidden!important;
  transition:max-height .2s ease,opacity .2s ease,margin .2s ease
}
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-media img,
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-media picture,
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-media video{
  max-height:0!important;opacity:0!important
}
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-full img,
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-full video,
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-full picture{
  max-height:0!important;opacity:0!important;margin:0!important;
  transition:max-height .2s ease,opacity .2s ease,margin .2s ease;overflow:hidden!important
}
body.zh-dg-hide-imgs .zh-dg-skel-media{
  max-height:0!important;opacity:0!important;margin:0!important;
  transition:max-height .2s ease,opacity .2s ease
}
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
  position:sticky!important;top:var(--dg-side-top,88px)!important;
  flex:0 0 var(--dg-side)!important;width:var(--dg-side)!important;
  display:flex!important;flex-direction:column;gap:12px;
  max-height:calc(100vh - var(--dg-side-top, 88px) - 16px);overflow:auto;
  z-index:2!important;box-sizing:border-box;pointer-events:auto;
  align-self:flex-start
}
.zh-dg-widget{
  background:var(--dg-card)!important;border:1px solid var(--dg-line)!important;
  border-radius:12px;padding:14px;opacity:1!important
}
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
  #zh-dg-layout{padding:0 20px 48px}
  #zh-dg-side{display:none!important}
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

  function ensureLayout() {
    let layout = document.getElementById("zh-dg-layout");
    const host = document.querySelector(".App-main") || document.body;
    const shell = document.getElementById("zh-dg-shell");
    if (!layout) {
      layout = document.createElement("div");
      layout.id = "zh-dg-layout";
      if (shell?.parentElement) {
        shell.parentElement.insertBefore(layout, shell);
        layout.appendChild(shell);
      } else {
        host.prepend(layout);
      }
    } else if (host !== document.body && layout.parentElement !== host && !host.contains(layout)) {
      host.prepend(layout);
    }
    return layout;
  }

  function placeSideBelowHeader() {
    const side = document.getElementById("zh-dg-side");
    if (!side) return;
    const layout = ensureLayout();
    if (side.parentElement !== layout) layout.appendChild(side);
    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header");
    const bottom = header ? header.getBoundingClientRect().bottom : 64;
    const top = Math.max(72, Math.ceil(bottom + 10));
    const topPx = top + "px";
    document.documentElement.style.setProperty("--dg-side-top", topPx);
    document.body?.style.setProperty("--dg-side-top", topPx);
    // 清掉旧版 fixed 侧栏内联样式，避免叠到网格上
    ["position", "right", "left", "top", "max-height", "z-index", "transform"].forEach((k) => {
      side.style.removeProperty(k);
    });
  }

  function isNativeSidebarLike(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === "zh-dg-side" || el.closest("#zh-dg-layout, #zh-dg-scraper")) return false;
    if (el.closest(".Modal-wrapper, [class*='Modal-wrapper'], [role='dialog'], .Popover-content, [class*='Popover-content']")) {
      return false;
    }
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 400 || t.length < 8) return false;
    const hitCreator = t.includes("创作中心") && (t.includes("进入创作中心") || t.includes("草稿"));
    const hitHot = (t.includes("热榜") || t.includes("热门榜单")) && /\d+\s*万热度|\d+\s*热度/.test(t);
    return hitCreator || hitHot;
  }

  function purgeStraySidebars(scraper) {
    if (!scraper) return;
    const roots = [document.body, document.querySelector(".App-main"), document.querySelector("#root")].filter(Boolean);
    roots.forEach((root) => {
      root.querySelectorAll("div.Card, section, aside, div[class*='SideBar'], div[class*='Sidebar']").forEach((el) => {
        if (!isNativeSidebarLike(el)) return;
        const r = el.getBoundingClientRect?.();
        if (r && r.width > 420) return;
        if (!scraper.contains(el)) {
          try {
            scraper.appendChild(el);
          } catch (_) {}
        }
      });
    });
  }

  function parkNativeSidebars(scraper) {
    if (!scraper) return;
    const sels = [
      ".Topstory-container",
      ".GlobalSideBar",
      ".Topstory-sideBar",
      ".Footer",
      "footer",
      ".Topstory",
      ".Topstory-mainColumn",
      ".TopstoryMain",
      ".CornerButtons",
      ".Adboard",
      ".App-main .Sticky",
      '.App-main [class*="GlobalSideBar"]',
      '.App-main [class*="Topstory-side"]',
      '.App-main [class*="SideBar"]',
      '.App-main [class*="Sidebar"]',
    ];
    sels.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el || el.id === "zh-dg-side") return;
        if (el.closest("#zh-dg-layout, #zh-dg-shell, #zh-dg-side, #zh-dg-scraper")) return;
        if (el.closest?.(".Popover-content, [class*='Popover-content'], [role='dialog'], [role='menu']")) return;
        if (!scraper.contains(el)) {
          try {
            scraper.appendChild(el);
          } catch (_) {}
        }
      });
    });
    purgeStraySidebars(scraper);
    // 原站晚注入的「创作中心 / 热榜」卡片（无稳定 class）
    const main = document.querySelector(".App-main");
    if (!main) return;
    main.querySelectorAll("div.Card, section, aside").forEach((el) => {
      if (!el || el.closest("#zh-dg-layout, #zh-dg-shell, #zh-dg-side, #zh-dg-scraper")) return;
      if (el.closest?.(".Popover-content, [class*='Popover-content'], [role='dialog']")) return;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 400) return;
      const hitCreator = t.includes("创作中心") && (t.includes("进入创作中心") || t.includes("草稿"));
      const hitHot = t.includes("热榜") && /\d+\s*万热度|\d+\s*热度/.test(t);
      if (!hitCreator && !hitHot) return;
      const r = el.getBoundingClientRect?.();
      if (r && (r.width > 420 || r.height < 40)) return;
      try {
        scraper.appendChild(el);
      } catch (_) {}
    });
  }

  function ensureScraper() {
    let scraper = document.getElementById("zh-dg-scraper");
    if (!scraper) {
      scraper = document.createElement("div");
      scraper.id = "zh-dg-scraper";
      document.body.appendChild(scraper);
    }
    // 只挪走信息流/侧栏/页脚，绝不吞掉消息/通知浮层
    parkNativeSidebars(scraper);
    return scraper;
  }

  function isHeaderOverlayOpen() {
    const nodes = document.querySelectorAll(
      [
        ".Popover-content",
        "[class*='Popover-content']",
        "[class*='Notification']",
        "[class*='PushNotification']",
        "[class*='Messages-']",
        "[class*='Inbox']",
        "[role='menu']",
        "[role='dialog']",
        "[role='listbox']",
      ].join(",")
    );
    for (const el of nodes) {
      if (!el || el.closest?.("#zh-dg-scraper")) continue;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) return true;
    }
    return false;
  }

  function isProtectedOverlayEl(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      [
        ".Popover",
        "[class*='Popover']",
        "[class*='Notification']",
        "[class*='PushNotification']",
        "[class*='Messages']",
        "[class*='Inbox']",
        "[class*='Menu']",
        "[role='menu']",
        "[role='dialog']",
        "[role='listbox']",
        "#zh-dg-layout",
        "#zh-dg-shell",
        "#zh-dg-side",
      ].join(",")
    );
  }

  function removeAvatarBlockSquare() {
    // 消息/私信浮层打开时绝不动 DOM，否则会闪一下黑框后整层被删掉
    if (isHeaderOverlayOpen()) return;

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
      if (el.id === "zh-dg-shell" || el.id === "zh-dg-layout" || el.id === "zh-dg-main" || el.id === "root") return true;
      if (el.closest?.("#zh-dg-grid, #zh-dg-main")) return true;
      if (isProtectedOverlayEl(el)) return true;
      const t = (el.textContent || "").replace(/\s+/g, "");
      if (/^(消息|私信|创作中心)$/.test(t) || (t.length <= 6 && /消息|私信|创作/.test(t))) return true;
      if (el.closest?.("a[href*='messages'], a[href*='inbox'], a[href*='creator'], a[href*='notifications']")) {
        return true;
      }
      return false;
    };

    const kill = (el) => {
      if (!el || keep(el)) return false;
      if (el.id === "zh-dg-side" || el.closest?.("#zh-dg-side")) {
        placeSideBelowHeader();
        return true;
      }
      // 只处理明确的空遮挡块，避免误删交互层
      const t = (el.textContent || "").replace(/\s+/g, "");
      if (t.length > 0) return false;
      if (el.querySelector?.("a, button, input, img, svg, [role='button']")) return false;
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
        if (topEl === img || img.contains(topEl) || topEl.contains?.(img)) return;
        if (isProtectedOverlayEl(topEl)) return;
        const wrap = img.closest("button, a, [role='button']");
        if (wrap && wrap.contains(topEl)) return;
        let cur = topEl;
        for (let i = 0; i < 4 && cur && cur !== header; i++) {
          if (keep(cur) || cur.contains?.(img)) break;
          const r = cur.getBoundingClientRect?.();
          if (!r) break;
          const overlapW = Math.min(r.right, ir.right) - Math.max(r.left, ir.left);
          const overlapH = Math.min(r.bottom, ir.bottom) - Math.max(r.top, ir.top);
          if (overlapW > ir.width * 0.35 && overlapH > ir.height * 0.35) {
            if (kill(cur)) return;
          }
          cur = cur.parentElement;
        }
      });
    });

    placeSideBelowHeader();
  }

  function classifyHeaderEntry(el) {
    if (!el || el.nodeType !== 1) return null;
    // 浮层内的点赞/回复条目不要当成顶栏入口
    if (isProtectedOverlayEl(el) && !el.closest?.(".AppHeader-userInfo, .AppHeader-profile")) {
      // 仍允许识别顶栏上的入口按钮本身
      const inTriggerOnly = el.closest?.("header, .AppHeader");
      if (!inTriggerOnly || el.closest?.(".Popover-content, [class*='Popover-content'], [role='menu'], [role='dialog']")) {
        return null;
      }
    }

    const a = el.closest?.("a") || (el.tagName === "A" ? el : null);
    const href = (a && a.href) || "";
    const aria = (el.getAttribute?.("aria-label") || a?.getAttribute?.("aria-label") || "").replace(/\s+/g, "");
    // 只用 aria / 短文本，避免把「xxx赞同了你」误判成消息入口
    const direct = [...(el.childNodes || [])]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.replace(/\s+/g, ""))
      .join("");
    const lab = aria || direct;

    if (/\/notifications(?:\/|$|\?)/i.test(href) || aria === "消息" || lab === "消息" || lab === "通知") {
      return { kind: "notifications", href: "https://www.zhihu.com/notifications" };
    }
    if (/\/messages(?:\/|$|\?)|\/inbox(?:\/|$|\?)/i.test(href) || aria === "私信" || lab === "私信") {
      return { kind: "messages", href: "https://www.zhihu.com/messages" };
    }
    if (/\/creator(?:\/|$|\?)/i.test(href) || aria === "创作中心" || lab === "创作中心") {
      return { kind: "creator", href: "https://www.zhihu.com/creator" };
    }
    return null;
  }

  function ensureHeaderShortcuts() {
    const header =
      document.querySelector(".AppHeader") ||
      document.querySelector("header[role=banner]") ||
      document.querySelector("header");
    if (!header) return;

    // 只恢复可点，绝不改写原站 href（改写会破坏消息下拉，变成闪一下就没）
    header.querySelectorAll("a, button, [role='button']").forEach((el) => {
      if (el.closest?.(".Popover-content, [class*='Popover-content'], [role='menu'], [role='dialog']")) return;
      const info = classifyHeaderEntry(el);
      if (!info) return;
      el.classList.remove("zh-dg-hide-msg-badge", "zh-dg-hide-zhida", "zh-dg-hide-logo");
      try {
        el.style.setProperty("pointer-events", "auto", "important");
        el.style.setProperty("visibility", "visible", "important");
        el.style.setProperty("opacity", "1", "important");
        el.style.setProperty("cursor", "pointer", "important");
      } catch (_) {}
    });

    if (header.dataset.zhDgNavBound === "1") return;
    header.dataset.zhDgNavBound = "1";

    header.addEventListener(
      "click",
      (ev) => {
        // 点赞/回复列表在浮层内：完全放行，不要 teardown、不要拦截
        if (
          ev.target.closest?.(
            ".Popover-content, [class*='Popover-content'], [role='menu'], [role='dialog'], [class*='Notification'], [class*='Messages-']"
          )
        ) {
          return;
        }

        const hit = ev.target.closest("a, button, [role='button']");
        if (!hit || !header.contains(hit)) return;
        const info = classifyHeaderEntry(hit);
        if (!info) return;

        // 仅当真正离开首页路由时才卸载；打开下拉浮层时保持网格
        const path0 = location.pathname;
        const maybeTeardown = () => {
          if (!isHome() || location.pathname !== path0) {
            if (document.body?.classList.contains("zh-dg-v2") || document.getElementById("zh-dg-shell")) {
              teardownUi();
            }
          }
        };
        setTimeout(maybeTeardown, 0);
        setTimeout(maybeTeardown, 300);
        setTimeout(maybeTeardown, 800);

        if (ev.ctrlKey || ev.metaKey) {
          // 保留原站行为；若无链接则新开对应页
          const a = hit.closest("a");
          if (!a || !a.href || /javascript:/i.test(a.href)) {
            ev.preventDefault();
            window.open(info.href, "_blank", "noopener");
          }
        }
      },
      true
    );
  }

  function fixHeaderProfileClick() {
    // 浮层打开时只恢复头像可点，不做破坏性清理
    if (isHeaderOverlayOpen()) {
      const header =
        document.querySelector(".AppHeader") ||
        document.querySelector("header[role=banner]") ||
        document.querySelector("header");
      header?.querySelectorAll("img.Avatar, .Avatar img").forEach((img) => {
        try {
          img.style.setProperty("pointer-events", "auto", "important");
          const hit = img.closest("button, a, [role='button']");
          if (hit) hit.style.setProperty("pointer-events", "auto", "important");
        } catch (_) {}
      });
      return;
    }
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
    if (isHeaderOverlayOpen()) return;
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

  // 仅在首页改造态清理角标
  function watchMessageBadge() {
    if (watchMessageBadge._on) return;
    watchMessageBadge._on = true;
    const run = () => {
      if (!isHome() || !document.body?.classList.contains("zh-dg-v2")) return;
      try {
        // 消息浮层打开时：只保证入口可点，禁止清 DOM / 卸页面
        if (isHeaderOverlayOpen()) {
          ensureHeaderShortcuts();
          ensureScraper();
          placeSideBelowHeader();
          return;
        }
        hideZhidaEntry();
        hideMessageBadge();
        fixHeaderProfileClick();
        ensureHeaderShortcuts();
      } catch (_) {}
    };
    run();
    watchMessageBadge._timer = setInterval(run, 800);
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

  function stopWatchMessageBadge() {
    if (watchMessageBadge._timer) {
      clearInterval(watchMessageBadge._timer);
      watchMessageBadge._timer = null;
    }
    if (watchMessageBadge._obs) {
      watchMessageBadge._obs.disconnect();
      watchMessageBadge._obs = null;
    }
    watchMessageBadge._on = false;
  }

  // 浮层内残留白底（哈希 class）→ 刷成主题色
  const OVERLAY_ROOT_SEL = [
    ".Modal-wrapper",
    ".Modal-inner",
    ".Modal-content",
    '[role="dialog"]',
    ".Popover-content",
    '[class*="Popover-content"]',
    '[class*="PushNotifications"]',
    '[class*="NotificationList"]',
    '[class*="Messages-content"]',
    '[class*="Notifications-content"]',
  ].join(",");

  function parseRgb(color) {
    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return null;
    const m = String(color).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
  }

  function isLightSurface(rgb) {
    if (!rgb || rgb.a < 0.2) return false;
    const { r, g, b } = rgb;
    // 近白 / 浅灰底
    if (r >= 232 && g >= 232 && b >= 232) return true;
    if (r >= 248 && g >= 248 && b >= 248) return true;
    if (r >= 190 && g >= 190 && b >= 190 && Math.max(r, g, b) - Math.min(r, g, b) <= 22) return true;
    return false;
  }

  function isDarkText(rgb) {
    if (!rgb || rgb.a < 0.35) return false;
    return rgb.r < 90 && rgb.g < 90 && rgb.b < 90;
  }

  function findModalPanel(wrapper) {
    if (!wrapper) return null;
    const inner = wrapper.querySelector(".Modal-inner, [class*='Modal-inner']");
    if (inner && isVisibleOverlayEl(inner)) return inner;
    const topbar = wrapper.querySelector(".CommentTopbar, [class*='CommentTopbar']");
    if (topbar) {
      let el = topbar.parentElement;
      while (el && el !== wrapper) {
        const r = el.getBoundingClientRect();
        if (r.width > 240 && r.width < window.innerWidth * 0.92 && r.height > 160) return el;
        el = el.parentElement;
      }
    }
    let best = null;
    let bestArea = Infinity;
    wrapper.querySelectorAll('[role="dialog"], [class*="Modal-modal"], [class*="Modal-content"]').forEach((el) => {
      if (!isVisibleOverlayEl(el)) return;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (r.width > 240 && r.width < window.innerWidth * 0.92 && area < bestArea) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function clearModalShellBg(wrapper, panel) {
    if (!wrapper || !panel) return;
    let node = panel.parentElement;
    while (node && node !== wrapper) {
      node.style.setProperty("background", "transparent", "important");
      node.style.setProperty("background-color", "transparent", "important");
      node.style.setProperty("background-image", "none", "important");
      node.style.setProperty("box-shadow", "none", "important");
      node.style.setProperty("border", "none", "important");
      node.style.setProperty("border-radius", "0", "important");
      node = node.parentElement;
    }
    panel.style.setProperty("background", "var(--dg-overlay)", "important");
    panel.style.setProperty("border-radius", "12px", "important");
    panel.style.setProperty("overflow", "hidden", "important");
    panel.style.setProperty("clip-path", "inset(0 round 12px)", "important");
    panel.style.setProperty("border", "1px solid rgba(255,255,255,.08)", "important");
    panel.style.setProperty("box-shadow", "0 20px 56px rgba(0,0,0,.72)", "important");
  }

  function tuneModalOverlay() {
    document.querySelectorAll(".Modal-wrapper, [class*='Modal-wrapper']").forEach((wrapper) => {
      if (!isVisibleOverlayEl(wrapper)) return;
      wrapper.style.setProperty("background", "rgba(0,0,0,.78)", "important");
      const panel = findModalPanel(wrapper);
      if (panel) clearModalShellBg(wrapper, panel);
    });
  }

  function findCommentOverlayPanels() {
    const panels = new Set();
    const topbars = document.querySelectorAll(".CommentTopbar, [class*='CommentTopbar']");
    topbars.forEach((tb) => {
      if (tb.closest("#zh-dg-layout, #zh-dg-shell, #zh-dg-scraper")) return;
      let el = tb.parentElement;
      while (el && el !== document.body) {
        const r = el.getBoundingClientRect();
        if (r.width > 300 && r.height > 240 && r.width < window.innerWidth * 0.96) {
          panels.add(el);
          break;
        }
        el = el.parentElement;
      }
    });
    return [...panels];
  }

  function tuneCommentOverlay() {
    findCommentOverlayPanels().forEach((panel) => {
      const inModal = panel.closest(".Modal-wrapper, [class*='Modal-wrapper']");
      if (inModal && isVisibleOverlayEl(inModal)) return;
      panel.style.setProperty("background", "var(--dg-overlay)", "important");
      panel.style.setProperty("color", "var(--dg-text)", "important");
      panel.style.setProperty("border-radius", "12px", "important");
      panel.style.setProperty("overflow", "hidden", "important");
      panel.style.setProperty("border", "1px solid rgba(255,255,255,.08)", "important");
      let p = panel.parentElement;
      while (p && p !== document.body) {
        const r = p.getBoundingClientRect();
        if (r.width > window.innerWidth * 0.82 && r.height > window.innerHeight * 0.45) {
          p.style.setProperty("background", "rgba(0,0,0,.78)", "important");
          break;
        }
        p = p.parentElement;
      }
    });
    document.querySelectorAll("body > .Popover, body > div > .Popover").forEach((pop) => {
      if (!pop.querySelector(".CommentTopbar, [class*='CommentTopbar']")) return;
      if (!isVisibleOverlayEl(pop)) return;
      pop.style.setProperty("background", "rgba(0,0,0,.78)", "important");
      const content = pop.querySelector(".Popover-content, [class*='Popover-content']");
      if (content) {
        content.style.setProperty("background", "var(--dg-overlay)", "important");
        content.style.setProperty("color", "var(--dg-text)", "important");
        content.style.setProperty("border-radius", "12px", "important");
        content.style.setProperty("overflow", "hidden", "important");
      }
    });
  }

  function paintOverlaySurfaces(root) {
    if (!root || root.nodeType !== 1) return;
    let nodes;
    if (root.matches?.(".Modal-wrapper, [class*='Modal-wrapper']")) {
      const panel = findModalPanel(root);
      if (!panel) return;
      clearModalShellBg(root, panel);
      nodes = [panel, ...panel.querySelectorAll("*")];
    } else {
      nodes = [root, ...root.querySelectorAll("*")];
    }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el || el.nodeType !== 1) continue;
      const tag = el.tagName;
      if (tag === "IMG" || tag === "SVG" || tag === "PATH" || tag === "CANVAS" || tag === "VIDEO" || tag === "IFRAME") {
        continue;
      }
      if (el.closest?.("svg")) continue;
      let st;
      try {
        st = getComputedStyle(el);
      } catch (_) {
        continue;
      }
      const bg = parseRgb(st.backgroundColor);
      if (isLightSurface(bg)) {
        el.classList.add("zh-dg-painted");
        el.style.setProperty("background-color", "#262626", "important");
        el.style.setProperty("background-image", "none", "important");
        const fg = parseRgb(st.color);
        if (isDarkText(fg)) el.style.setProperty("color", "#e8e8e8", "important");
        const bc = parseRgb(st.borderColor);
        if (bc && bc.r > 200 && bc.g > 200 && bc.b > 200) {
          el.style.setProperty("border-color", "rgba(255,255,255,.08)", "important");
        }
      }
    }
  }

  function isVisibleOverlayEl(el) {
    if (!el || el.nodeType !== 1) return false;
    let st;
    try {
      st = getComputedStyle(el);
    } catch (_) {
      return false;
    }
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 48 && r.height > 48;
  }

  function syncOverlayOpenClass() {
    const body = document.body;
    if (!body || !isHome() || !body.classList.contains("zh-dg-v2")) {
      body?.classList.remove("zh-dg-overlay-open");
      return;
    }
    let open = false;
    // 优先：全屏 Modal 遮罩（评论弹层）
    const wrappers = document.querySelectorAll(".Modal-wrapper, [class*='Modal-wrapper']");
    for (const el of wrappers) {
      if (!isVisibleOverlayEl(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.5 && r.height > window.innerHeight * 0.3) {
        open = true;
        break;
      }
    }
    if (!open) {
      const modals = document.querySelectorAll(
        '.Modal-inner, [class*="Modal-modal"], [class*="Modal-content"], [role="dialog"]'
      );
      for (const el of modals) {
        if (!isVisibleOverlayEl(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.height > 160 && r.width > 200) {
          open = true;
          break;
        }
      }
    }
    if (!open) {
      const panels = document.querySelectorAll(
        '[class*="PushNotifications"], .NotificationList, [class*="NotificationList"], .Popover-content, [class*="Popover-content"]'
      );
      for (const el of panels) {
        if (!isVisibleOverlayEl(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.height > 180 && r.width > 240) {
          open = true;
          break;
        }
      }
    }
    body.classList.toggle("zh-dg-overlay-open", open);
  }

  function scanOverlayTheme() {
    if (!isHome() || !document.body?.classList.contains("zh-dg-v2")) {
      document.body?.classList.remove("zh-dg-overlay-open");
      return;
    }
    try {
      syncOverlayOpenClass();
      tuneModalOverlay();
      tuneCommentOverlay();
      purgeStraySidebars(document.getElementById("zh-dg-scraper"));
      document.querySelectorAll(OVERLAY_ROOT_SEL).forEach(paintOverlaySurfaces);
      findCommentOverlayPanels().forEach(paintOverlaySurfaces);
    } catch (_) {}
  }

  function watchOverlayTheme() {
    if (watchOverlayTheme._on) return;
    watchOverlayTheme._on = true;
    scanOverlayTheme();
    watchOverlayTheme._timer = setInterval(scanOverlayTheme, 700);
    const startObs = () => {
      if (watchOverlayTheme._obs || !document.documentElement) return;
      watchOverlayTheme._obs = new MutationObserver(() => {
        clearTimeout(watchOverlayTheme._t);
        watchOverlayTheme._t = setTimeout(scanOverlayTheme, 60);
      });
      watchOverlayTheme._obs.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.body) startObs();
    else document.addEventListener("DOMContentLoaded", startObs, { once: true });
  }

  function stopWatchOverlayTheme() {
    if (watchOverlayTheme._timer) {
      clearInterval(watchOverlayTheme._timer);
      watchOverlayTheme._timer = null;
    }
    if (watchOverlayTheme._obs) {
      watchOverlayTheme._obs.disconnect();
      watchOverlayTheme._obs = null;
    }
    if (watchOverlayTheme._t) {
      clearTimeout(watchOverlayTheme._t);
      watchOverlayTheme._t = null;
    }
    watchOverlayTheme._on = false;
    document.body?.classList.remove("zh-dg-overlay-open");
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
    const rel = t.relationship || {};
    const voting = Number(rel.voting);
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
      voted: voting === 1 || !!rel.vote_up,
      votedDown: voting === -1 || !!rel.vote_down,
      liked: !!(rel.is_thanked || rel.liked || rel.is_liked),
      collected: !!rel.is_favorited,
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

  const ACTION_BAR_SEL =
    ".ContentItem-actions, .RichContent-actions, [class*='ContentItem-actions'], [class*='RichContent-actions']";

  function findCardByKey(key) {
    return [...document.querySelectorAll("#zh-dg-grid .zh-dg-card")].find(
      (c) => c.getAttribute("data-key") === key
    );
  }

  function findActionBar(root) {
    if (!root || !root.querySelector) return null;
    return (
      root.querySelector(ACTION_BAR_SEL) ||
      root.querySelector(".VoteButton")?.closest?.("div, section, footer") ||
      null
    );
  }

  function findSourceEl(item) {
    if (!item) return null;
    if (item.sourceEl && document.contains(item.sourceEl)) return item.sourceEl;
    const scope = document.getElementById("zh-dg-scraper") || document;
    const nodes = scope.querySelectorAll(".Card.TopstoryItem, .TopstoryItem, .ContentItem");
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

  const ICO = {
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 12H5L12 5z"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19L5 7h14l-7 12z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.9 6.2 21l1.1-6.5L2.6 9.8l6.5-.9L12 3z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.2-4.4-9.5-8.2C.4 9.6 2.1 6 5.5 6c1.9 0 3.3 1.1 4.1 2.2C10.4 7.1 11.8 6 13.7 6c3.4 0 5.1 3.6 3 6.8C19.2 16.6 12 21 12 21z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4zM5 6h6v2H7v10h10v-4h2v6H5V6z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>',
  };

  function footIconsHTML(item) {
    const upOn = item?.voted ? " is-on" : "";
    const downOn = item?.votedDown ? " is-on" : "";
    const likeOn = item?.liked ? " is-on" : "";
    const colOn = item?.collected ? " is-on" : "";
    return `<div class="zh-dg-icons">
      <button type="button" class="zh-dg-ico${upOn}" data-proxy="vote-up" title="赞同" aria-label="赞同">${ICO.up}</button>
      <button type="button" class="zh-dg-ico${downOn}" data-proxy="vote-down" title="反对" aria-label="反对">${ICO.down}</button>
      <button type="button" class="zh-dg-ico" data-proxy="comment" title="评论" aria-label="评论">${ICO.comment}</button>
      <button type="button" class="zh-dg-ico${colOn}" data-proxy="collect" title="收藏" aria-label="收藏">${ICO.star}</button>
      <button type="button" class="zh-dg-ico${likeOn}" data-proxy="like" title="喜欢" aria-label="喜欢">${ICO.heart}</button>
      <button type="button" class="zh-dg-ico" data-proxy="share" title="分享" aria-label="分享">${ICO.share}</button>
      <button type="button" class="zh-dg-ico" data-proxy="more" title="更多" aria-label="更多">${ICO.more}</button>
    </div>`;
  }

  function findNativeBtn(bar, kind) {
    if (!bar) return null;
    const btns = [...bar.querySelectorAll("button, a, [role='button'], .Button")];
    const meta = (btn) => {
      const lab = [
        btn.getAttribute("aria-label") || "",
        btn.getAttribute("title") || "",
        btn.getAttribute("data-tooltip") || "",
        btn.textContent || "",
      ]
        .join(" ")
        .replace(/\s+/g, "");
      const cls = String(btn.className || "");
      return lab + " " + cls;
    };
    const matchers = {
      "vote-up": (s) =>
        /VoteButton--up|VoteButton-up|is-active.*up/i.test(s) ||
        (/赞同|upvote|VoteUp/i.test(s) && !/反对|downvote/i.test(s)),
      "vote-down": (s) =>
        /VoteButton--down|VoteButton-down/i.test(s) || /反对|downvote|VoteDown/i.test(s),
      comment: (s) => /评论|Comment/i.test(s) && !/关闭评论|收起评论/.test(s),
      collect: (s) => /收藏|Fav|Bookmark|Collect|Star/i.test(s),
      like: (s) => /喜欢|感谢|Heart|Like|Thanks|Reaction/i.test(s),
      share: (s) => /分享|Share/i.test(s),
      more: (s) => /更多|Options|ActionMenu|MoreButton|Popover|ellipsis/i.test(s) || /⋯|…|\.\.\./.test(s),
    };
    const fn = matchers[kind];
    if (!fn) return null;
    let hit = btns.find((b) => fn(meta(b)));
    if (hit) return hit;
    // SVG-only 按钮：看父级 aria
    hit = btns.find((b) => {
      const p = b.closest("[aria-label], [title]");
      return p && fn(meta(p));
    });
    if (hit) return hit;
    if (kind === "more" && btns.length) return btns[btns.length - 1];
    if (kind === "vote-up") {
      hit = bar.querySelector(".VoteButton--up, button.VoteButton:first-of-type, .VoteButton");
      if (hit && !/down/i.test(hit.className)) return hit;
    }
    if (kind === "vote-down") {
      hit = bar.querySelector(".VoteButton--down");
      if (hit) return hit;
      const votes = [...bar.querySelectorAll(".VoteButton")];
      if (votes.length >= 2) return votes[1];
    }
    return null;
  }

  function restoreNativeBar(item) {
    if (!item) return;
    const bar = item._nativeBar;
    const ph = item._actionsPh;
    if (!bar || !document.contains(bar)) return;
    // 若曾误搬到卡片 slot，尽量塞回原站占位
    if (ph && ph.parentNode && !ph.parentNode.contains(bar)) {
      try {
        ph.parentNode.insertBefore(bar, ph);
        ph.remove();
      } catch (_) {}
      item._actionsPh = null;
    }
    clearNativeLive(bar);
  }

  function clearNativeLive(bar) {
    if (!bar) return;
    bar.classList.remove("zh-dg-native-live");
    if (bar._zhDgPrevStyle != null) {
      bar.style.cssText = bar._zhDgPrevStyle;
      bar._zhDgPrevStyle = null;
    }
    const scraper = document.getElementById("zh-dg-scraper");
    scraper?.classList.remove("zh-dg-scraper-live");
  }

  function floatNativeBar(bar, proxyBtn) {
    if (!bar) return;
    const scraper = document.getElementById("zh-dg-scraper");
    scraper?.classList.add("zh-dg-scraper-live");
    if (bar._zhDgPrevStyle == null) bar._zhDgPrevStyle = bar.style.cssText;
    const r = (proxyBtn || document.body).getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 280);
    const top = Math.min(Math.max(8, r.bottom + 6), window.innerHeight - 56);
    bar.classList.add("zh-dg-native-live");
    bar.style.setProperty("left", left + "px", "important");
    bar.style.setProperty("top", top + "px", "important");
  }

  function ensureNativeBar(item) {
    if (!item) return null;
    const src = findSourceEl(item);
    if (src) item.sourceEl = src;
    restoreNativeBar(item);
    let bar = (src && findActionBar(src)) || item._nativeBar;
    if (bar && !document.contains(bar)) bar = null;
    if (!bar && src) {
      // 尝试点开「阅读全文」以挂载操作栏
      const more = src.querySelector(
        ".ContentItem-more, .RichContent-more, button.ContentItem-expandButton, .Button.ContentItem-rightButton"
      );
      if (more) {
        try {
          more.click();
        } catch (_) {}
        bar = findActionBar(src);
      }
    }
    if (bar) item._nativeBar = bar;
    return bar;
  }

  function parkNativeActions(card, item) {
    if (!card || !item) return false;
    // 不再把操作栏搬进卡片（会打断 React 事件）；只建立引用
    const bar = ensureNativeBar(item);
    return !!bar;
  }

  function linkNativeActions() {
    harvestSourceEls();
    for (const [key, item] of store) {
      const card = findCardByKey(key);
      if (!card) continue;
      // 把误搬进 slot 的栏迁回
      const slot = card.querySelector("[data-native-slot]");
      const stranded = slot?.querySelector?.(ACTION_BAR_SEL);
      if (stranded && item) {
        item._nativeBar = stranded;
        restoreNativeBar(item);
        const src = findSourceEl(item);
        if (src && item._nativeBar && !src.contains(item._nativeBar)) {
          const host =
            src.querySelector(".RichContent, .ContentItem, .Card") || src;
          try {
            host.appendChild(item._nativeBar);
          } catch (_) {}
        }
      }
      parkNativeActions(card, item);
    }
  }

  function dispatchRealClick(el) {
    if (!el) return false;
    try {
      el.focus?.({ preventScroll: true });
    } catch (_) {}
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
      return true;
    } catch (_) {
      try {
        el.click();
        return true;
      } catch (__) {
        return false;
      }
    }
  }

  async function proxyNativeAct(card, item, kind, proxyBtn) {
    if (kind === "comment") {
      const open = !card.classList.contains("is-comments");
      card.classList.toggle("is-comments", open);
      proxyBtn?.classList.toggle("is-on", open);
      if (open) await openComments(card, item);
      return;
    }

    // 赞 / 踩 / 喜欢 / 收藏：走 API，避免假亮图标
    if (kind === "vote-up") {
      await setVote(item, item.voted ? "neutral" : "up", card);
      return;
    }
    if (kind === "vote-down") {
      await setVote(item, item.votedDown ? "neutral" : "down", card);
      return;
    }
    if (kind === "like") {
      await toggleThank(item, proxyBtn);
      return;
    }
    if (kind === "collect") {
      await quickCollect(item, proxyBtn);
      return;
    }
    if (kind === "share") {
      try {
        await navigator.clipboard.writeText(item.href || location.href);
        setStatus("已复制分享链接");
      } catch (_) {
        window.open(item.href, "_blank", "noopener");
        setStatus("已打开原文（可手动分享）");
      }
      return;
    }
    if (kind === "more") {
      // 「更多」依赖原站菜单：浮起真实操作栏供用户点选
      const bar = ensureNativeBar(item);
      if (!bar) {
        window.open(item.href, "_blank", "noopener");
        setStatus("已打开原文");
        return;
      }
      floatNativeBar(bar, proxyBtn);
      setStatus("已唤起原站操作栏，请点击其中的菜单项");
      const onDoc = (ev) => {
        if (
          ev.target.closest?.(
            ".zh-dg-native-live, .Popover-content, [class*='Popover'], .Menu, [class*='Favlist'], [class*='Modal'], [data-proxy='more']"
          )
        ) {
          return;
        }
        clearNativeLive(bar);
        document.removeEventListener("click", onDoc, true);
      };
      setTimeout(() => document.addEventListener("click", onDoc, true), 0);
      return;
    }
  }

  function syncVoteIcons(card, item) {
    if (!card) return;
    card.querySelector('[data-proxy="vote-up"]')?.classList.toggle("is-on", !!item.voted);
    card.querySelector('[data-proxy="vote-down"]')?.classList.toggle("is-on", !!item.votedDown);
  }

  function votersUrl(item) {
    if (item.kind === "article") return `https://www.zhihu.com/api/v4/articles/${item.id}/voters`;
    if (item.kind === "zvideo") return `https://www.zhihu.com/api/v4/zvideos/${item.id}/voters`;
    return `https://www.zhihu.com/api/v4/answers/${item.id}/voters`;
  }

  async function setVote(item, type, card) {
    if (!item?.id || !["answer", "article", "zvideo"].includes(item.kind)) {
      setStatus("当前类型暂不支持投票");
      return;
    }
    const prevUp = !!item.voted;
    const prevDown = !!item.votedDown;
    try {
      await apiFetch(votersUrl(item), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      item.voted = type === "up";
      item.votedDown = type === "down";
      let n = Number(item.votes);
      if (Number.isFinite(n)) {
        if (prevUp && type !== "up") n -= 1;
        if (!prevUp && type === "up") n += 1;
        item.votes = Math.max(0, n);
      }
      syncVoteIcons(card, item);
      setStatus(
        type === "up" ? "已赞同" : type === "down" ? "已反对" : prevUp ? "已取消赞同" : "已取消反对"
      );
    } catch (e) {
      setStatus("投票失败：" + (e && e.message || e));
    }
  }

  async function toggleThank(item, btn) {
    if (!item?.id || !["answer", "article", "zvideo"].includes(item.kind)) {
      setStatus("当前类型暂不支持喜欢");
      return;
    }
    const paths =
      item.kind === "article"
        ? [
            `https://www.zhihu.com/api/v4/articles/${item.id}/likers`,
            `https://www.zhihu.com/api/v4/articles/${item.id}/thankers`,
          ]
        : item.kind === "zvideo"
          ? [`https://www.zhihu.com/api/v4/zvideos/${item.id}/likers`]
          : [
              `https://www.zhihu.com/api/v4/answers/${item.id}/thankers`,
              `https://www.zhihu.com/api/v4/answers/${item.id}/likers`,
            ];
    const wantOn = !item.liked;
    let lastErr = "";
    for (const url of paths) {
      try {
        await apiFetch(url, {
          method: wantOn ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: wantOn ? "{}" : undefined,
        });
        item.liked = wantOn;
        btn?.classList.toggle("is-on", wantOn);
        setStatus(wantOn ? "已喜欢" : "已取消喜欢");
        return;
      } catch (e) {
        lastErr = String(e && e.message || e);
      }
    }
    // reaction 备用
    try {
      const resType = item.kind === "article" ? "article" : item.kind === "zvideo" ? "zvideo" : "answer";
      await apiFetch("https://www.zhihu.com/api/v4/zreaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: resType,
          content_id: String(item.id),
          action: wantOn ? "like" : "cancel_like",
        }),
      });
      item.liked = wantOn;
      btn?.classList.toggle("is-on", wantOn);
      setStatus(wantOn ? "已喜欢" : "已取消喜欢");
    } catch (e) {
      setStatus("喜欢失败：" + (lastErr || e.message || e));
    }
  }

  async function quickCollect(item, btn) {
    if (!item?.id) {
      setStatus("无法收藏：缺少内容 ID");
      return;
    }
    const contentType =
      item.kind === "article" ? "article" : item.kind === "zvideo" ? "zvideo" : "answer";
    try {
      const list = await apiFetch(
        "https://www.zhihu.com/api/v4/collections/all?offset=0&limit=20"
      );
      const cols = list?.data || [];
      if (!cols.length) {
        setStatus("没有可用收藏夹，请先在知乎创建收藏夹");
        return;
      }
      const fav = cols.find((c) => c.is_default) || cols[0];
      const favId = fav.id || fav.collection?.id;
      if (!favId) throw new Error("收藏夹 ID 无效");

      const attempts = [
        {
          url: `https://www.zhihu.com/api/v4/collections/${favId}/contents`,
          body: { content_id: Number(item.id) || item.id, content_type: contentType },
        },
        {
          url: `https://www.zhihu.com/api/v4/collections/contents/${contentType}s/${item.id}`,
          body: { action: "add_collection", collection_id: favId },
        },
        {
          url: `https://www.zhihu.com/api/v4/favlists/${favId}/items`,
          body: { content_id: String(item.id), content_type: contentType },
        },
      ];
      let lastErr = "";
      for (const a of attempts) {
        try {
          await apiFetch(a.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(a.body),
          });
          item.collected = true;
          btn?.classList.add("is-on");
          setStatus(`已收藏到「${fav.title || fav.name || "收藏夹"}」`);
          return;
        } catch (e) {
          lastErr = String(e && e.message || e);
        }
      }
      throw new Error(lastErr || "收藏接口失败");
    } catch (e) {
      // 退回：浮起原站收藏按钮供手点
      const bar = ensureNativeBar(item);
      const native = findNativeBtn(bar, "collect");
      if (bar && native) {
        floatNativeBar(bar, btn);
        setStatus("API 收藏失败，已唤起原站收藏栏：" + (e && e.message || e));
        return;
      }
      setStatus("收藏失败：" + (e && e.message || e));
    }
  }

  async function toggleVote(item, btn) {
    const card = btn?.closest?.(".zh-dg-card") || findCardByKey(item.key);
    await setVote(item, item.voted ? "neutral" : "up", card);
    if (btn && btn.classList?.contains("zh-dg-ico") === false) {
      btn.classList?.toggle?.("is-on", !!item.voted);
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
      </div>
      <div class="zh-dg-foot">${footIconsHTML(item)}</div>
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
        parkNativeActions(card, it);
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

  function sidePanelHTML() {
    return `
      <div class="zh-dg-widget"><h3>创作中心</h3>
        <a class="zh-dg-sbtn primary" href="https://www.zhihu.com/creator">进入创作中心</a>
        <a class="zh-dg-sbtn ghost" href="https://www.zhihu.com/question/waiting">等待收录</a></div>
      <div class="zh-dg-widget"><h3>热门榜单</h3>
        <div class="zh-dg-hotlist" id="zh-dg-hotlist"><div class="zh-dg-hotempty">加载热榜中…</div></div>
        <a class="zh-dg-sbtn ghost" href="https://www.zhihu.com/hot" target="_blank" rel="noopener">查看完整榜单</a></div>`;
  }

  function ensureSidePanel() {
    // 去重：历史 bug 可能留下多个侧栏
    const all = [...document.querySelectorAll("#zh-dg-side")];
    let side = all[0] || null;
    all.slice(1).forEach((el) => el.remove());
    const layout = ensureLayout();
    if (!side) {
      side = document.createElement("aside");
      side.id = "zh-dg-side";
      side.innerHTML = sidePanelHTML();
      layout.appendChild(side);
      loadHotList();
    } else if (side.parentElement !== layout) {
      layout.appendChild(side);
    }
    if (!side.querySelector("#zh-dg-hotlist")) {
      side.innerHTML = sidePanelHTML();
      loadHotList();
    }
    placeSideBelowHeader();
    return side;
  }

  function ensureShell() {
    // 清理旧版残留的快捷按钮 / 猜你想看
    document.getElementById("zh-dg-actions")?.remove();
    document.getElementById("zh-dg-guess")?.remove();
    hideHeaderLogo();
    hideZhidaEntry();
    hideMessageBadge();
    fixHeaderProfileClick();
    ensureHeaderShortcuts();

    if (document.getElementById("zh-dg-shell")) {
      // 去掉与顶栏重复的「快捷入口」
      document.getElementById("zh-dg-loading")?.remove();
      ensureLayout();
      ensureSidePanel();
      document.querySelectorAll("#zh-dg-side .zh-dg-widget").forEach((w) => {
        const h = w.querySelector("h3");
        if (h && /快捷入口/.test(h.textContent || "")) w.remove();
      });
      const hot = document.getElementById("zh-dg-hotlist");
      if (hot && !hot.querySelector(".zh-dg-hotitem")) loadHotList();
      ensureScraper();
      placeSideBelowHeader();
      layoutCols();
      return;
    }
    document.body.classList.add("zh-dg-v2");

    const layout = document.createElement("div");
    layout.id = "zh-dg-layout";
    const shell = document.createElement("div");
    shell.id = "zh-dg-shell";
    shell.innerHTML = `<div id="zh-dg-main">
      <div id="zh-dg-status">正在重建信息流…</div>
      <div id="zh-dg-grid"></div>
      <div id="zh-dg-sentinel"></div>
    </div>`;
    layout.appendChild(shell);

    const host = document.querySelector(".App-main") || document.body;
    host.prepend(layout);
    ensureSidePanel();
    ensureScraper();
    bindCardEvents(shell);
    requestAnimationFrame(() => {
      placeSideBelowHeader();
      layoutCols();
    });
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

      // 统一图标栏：代理到原站按钮 / 卡片内评论
      const proxyBtn = ev.target.closest("[data-proxy]");
      if (proxyBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const kind = proxyBtn.getAttribute("data-proxy");
        await proxyNativeAct(card, item, kind, proxyBtn);
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
        } else {
          card.classList.remove("is-expanded");
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

  function teardownUi() {
    stopWatchMessageBadge();
    stopWatchOverlayTheme();
    if (bootUi._mo) {
      bootUi._mo.disconnect();
      bootUi._mo = null;
    }
    if (bootUi._bootTimer) {
      clearInterval(bootUi._bootTimer);
      bootUi._bootTimer = null;
    }
    if (bootUi._headerTimer) {
      clearInterval(bootUi._headerTimer);
      bootUi._headerTimer = null;
    }
    if (bootUi._linkTimer) {
      clearInterval(bootUi._linkTimer);
      bootUi._linkTimer = null;
    }
    if (bootUi._io) {
      bootUi._io.disconnect();
      bootUi._io = null;
    }

    document.body?.classList.remove("zh-dg-v2", "zh-dg-hide-imgs");

    // 直接丢掉藏起的信息流 DOM，不要塞回 App-main（否则消息/个人页 React 会冲突错乱）
    document.getElementById("zh-dg-scraper")?.remove();
    document.getElementById("zh-dg-layout")?.remove();
    document.getElementById("zh-dg-shell")?.remove();
    document.getElementById("zh-dg-side")?.remove();

    rendered.clear();
    orderList.length = 0;
    store.clear();
    colCount = 0;
    bootUi._active = false;
  }

  function sync() {
    if (!isHome()) {
      teardownUi();
      return;
    }
    ensureShell();
    ensureScraper();
    ensureSidePanel();
    placeSideBelowHeader();
    harvestSourceEls();
    render(fromDom());
    linkNativeActions();
    ensurePendingSlots();
  }

  const IMG_SAT_KEY = "zh-dg-img-sat";
  const IMG_SAT_STEPS = [1, 0.5, 0];

  function getImgSat() {
    try {
      const v = Number(localStorage.getItem(IMG_SAT_KEY));
      if (v === 1 || v === 0.5 || v === 0) return v;
    } catch (_) {}
    return 1;
  }

  function applyImgSat(v) {
    const sat = v === 0.5 || v === 0 || v === 1 ? v : 1;
    const root = document.body || document.documentElement;
    root.style.setProperty("--dg-img-sat", String(sat));
    if (document.body && document.documentElement !== document.body) {
      document.documentElement.style.setProperty("--dg-img-sat", String(sat));
    }
  }

  function cycleImgSat() {
    const cur = getImgSat();
    const i = IMG_SAT_STEPS.indexOf(cur);
    const next = IMG_SAT_STEPS[(i < 0 ? 0 : i + 1) % IMG_SAT_STEPS.length];
    try {
      localStorage.setItem(IMG_SAT_KEY, String(next));
    } catch (_) {}
    applyImgSat(next);
    return next;
  }

  function bootUi() {
    if (!isHome()) {
      teardownUi();
      return;
    }
    if (bootUi._active) {
      sync();
      return;
    }
    bootUi._active = true;
    injectCss();
    document.body.classList.remove("zh-dg-hide-imgs");
    applyImgSat(getImgSat());
    ensureShell();
    sync();
    watchMessageBadge();
    watchOverlayTheme();
    dbg({ event: "boot-v3" });

    if (!bootUi._listenersBound) {
      bootUi._listenersBound = true;

      window.addEventListener("zh-dg-data", (ev) => {
        if (!isHome() || !bootUi._active) return;
        render((ev.detail?.data || []).map(fromApi).filter(Boolean));
        linkNativeActions();
      });

      window.addEventListener(
        "scroll",
        () => {
          if (!isHome() || !bootUi._active) return;
          if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1600) {
            loadMore("scroll");
          }
        },
        { passive: true }
      );

      window.addEventListener(
        "keydown",
        (ev) => {
          if (!isHome() || !bootUi._active) return;
          if (ev.key !== "q" && ev.key !== "Q") return;
          if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
          const t = ev.target;
          if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName))) return;
          ev.preventDefault();
          // Shift+Q：饱和度 1 → 0.5 → 0 轮转（与显隐独立，藏图时也记住）
          if (ev.shiftKey) {
            const next = cycleImgSat();
            const label = next === 1 ? "原色 100%" : next === 0.5 ? "半饱和 50%" : "灰度 0%";
            setStatus("图片饱和度：" + label + "（Shift+Q 切换）");
            return;
          }
          document.body.classList.toggle("zh-dg-hide-imgs");
          const on = document.body.classList.contains("zh-dg-hide-imgs");
          const sat = getImgSat();
          const satHint = sat === 1 ? "" : sat === 0.5 ? " · 半饱和" : " · 灰度";
          setStatus(on ? "已隐藏图片（再按 Q 显示）" + satHint : "已显示图片" + satHint);
        },
        true
      );

      window.addEventListener("resize", () => {
        if (!isHome() || !bootUi._active) return;
        clearTimeout(layoutCols._t);
        layoutCols._t = setTimeout(layoutCols, 120);
      });
    }

    // 原站懒渲染操作栏 / React 重建时重新挂到卡片
    const moScrape = new MutationObserver(() => {
      if (!isHome() || !bootUi._active) return;
      clearTimeout(moScrape._t);
      moScrape._t = setTimeout(linkNativeActions, 200);
    });
    const watchScraper = () => {
      if (!isHome() || !bootUi._active) return;
      const sc = document.getElementById("zh-dg-scraper");
      if (sc) moScrape.observe(sc, { childList: true, subtree: true });
      else setTimeout(watchScraper, 300);
    };
    watchScraper();
    bootUi._linkTimer = setInterval(() => {
      if (isHome() && bootUi._active) linkNativeActions();
    }, 3000);

    const io = new IntersectionObserver(
      (ents) => {
        if (!isHome() || !bootUi._active) return;
        if (ents.some((e) => e.isIntersecting)) loadMore("sentinel");
      },
      { rootMargin: "1600px 0px" }
    );
    bootUi._io = io;
    const watch = () => {
      if (!isHome() || !bootUi._active) return;
      const s = document.getElementById("zh-dg-sentinel");
      if (s) io.observe(s);
      else setTimeout(watch, 200);
    };
    watch();

    let n = 0;
    bootUi._bootTimer = setInterval(() => {
      if (!isHome() || !bootUi._active) return;
      sync();
      hideZhidaEntry();
      hideMessageBadge();
      fixHeaderProfileClick();
      if ([2, 4, 8].includes(n)) loadMore("boot-" + n);
      n += 1;
      if (n > 30) {
        clearInterval(bootUi._bootTimer);
        bootUi._bootTimer = null;
      }
    }, 600);

    bootUi._headerTimer = setInterval(() => {
      if (!isHome() || !bootUi._active) return;
      hideZhidaEntry();
      hideMessageBadge();
      fixHeaderProfileClick();
      ensureHeaderShortcuts();
    }, 2000);

    bootUi._mo = new MutationObserver(() => {
      if (!isHome()) {
        teardownUi();
        return;
      }
      clearTimeout(bootUi._t);
      bootUi._t = setTimeout(sync, 180);
    });
    bootUi._mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // SPA 路由：离开首页立即恢复原站，回到首页再启用
  let lastRoute = location.pathname;
  function checkRoute() {
    const p = location.pathname;
    if (p === lastRoute) {
      // 同路径也校正一次（防止漏卸载）
      if (!isHome() && (document.body?.classList.contains("zh-dg-v2") || document.getElementById("zh-dg-shell"))) {
        teardownUi();
      }
      return;
    }
    lastRoute = p;
    if (isHome()) bootUi();
    else teardownUi();
  }
  const _pushState = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);
  history.pushState = function () {
    const ret = _pushState(...arguments);
    queueMicrotask(checkRoute);
    return ret;
  };
  history.replaceState = function () {
    const ret = _replaceState(...arguments);
    queueMicrotask(checkRoute);
    return ret;
  };
  window.addEventListener("popstate", () => queueMicrotask(checkRoute));
  setInterval(checkRoute, 400);

  if (document.body) {
    if (isHome()) bootUi();
    else teardownUi();
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        if (isHome()) bootUi();
        else teardownUi();
      },
      { once: true }
    );
  }
})();
