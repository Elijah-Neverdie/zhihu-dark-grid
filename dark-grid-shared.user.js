// ==UserScript==
// @name         Dark Grid Shared Core
// @namespace    https://github.com/Elijah-Neverdie/zhihu-dark-grid
// @version      1.0.0
// @description  知乎 / Quora 暗色网格子插件共享布局、样式与工具库（由站点脚本 @require 加载）
// @author       Elijah-Neverdie
// @grant        GM_addStyle
// ==/UserScript==

(function (global) {
  "use strict";

  const VERSION = "1.0.0";
  const COL_W = 280;
  const COL_GAP = 14;
  const IMG_SAT_KEY = "zh-dg-img-sat";

  const CSS_CORE = `
body.zh-dg-v2,body.zh-dg-v2 #root{background:#141414!important;color:#e8e8e8!important}
body.zh-dg-v2{
  --dg-card:#1e1e1e;--dg-card2:#262626;--dg-line:rgba(255,255,255,.08);
  --dg-text:#e8e8e8;--dg-sub:#a3a3a3;--dg-mute:#737373;--dg-accent:#9a9a9a;
  --dg-elev:#242424;--dg-max:100%;--dg-side:280px;--dg-img-sat:1;overflow-x:hidden!important;
  --dg-overlay:#3a3a3a;--dg-overlay-2:#424242;--dg-overlay-3:#4c4c4c;
  --dg-overlay-line:rgba(255,255,255,.14);--dg-overlay-hover:rgba(255,255,255,.1);
  --dg-overlay-link:#e0e0e0;--dg-overlay-link-hover:#ffffff;
  --dg-overlay-body:#f0f0f0;--dg-overlay-sub:#b0b0b0;--dg-overlay-mute:#8a8a8a
}
body.zh-dg-v2 #zh-dg-scraper{
  position:fixed!important;left:0!important;top:0!important;width:360px!important;height:120px!important;
  overflow:hidden!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;
  contain:none!important;margin:0!important;padding:0!important;border:0!important
}
body.zh-dg-v2 #zh-dg-scraper *{pointer-events:none!important}
#zh-dg-layout{
  display:flex;align-items:flex-start;gap:16px;width:100%;max-width:var(--dg-max);
  margin:0 auto;padding:0 20px 48px;box-sizing:border-box
}
#zh-dg-shell{flex:1 1 auto;min-width:0;width:auto;max-width:none;margin:0;padding:0;display:block;box-sizing:border-box}
#zh-dg-main{min-width:0;width:100%}
#zh-dg-status{color:var(--dg-mute);font-size:12px;margin-bottom:8px;min-height:18px}
#zh-dg-grid,.zh-dg-skel{display:flex;align-items:flex-start;gap:14px}
.zh-dg-col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:14px}
.zh-dg-card{
  display:block;width:100%;margin:0;min-width:0;background:var(--dg-card);border:1px solid var(--dg-line);
  border-radius:14px;overflow:visible;box-sizing:border-box;transition:border-color .15s ease
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
  aspect-ratio:16/10;max-height:280px;transition:max-height .2s ease,opacity .2s ease,margin .2s ease,padding .2s ease
}
.zh-dg-media img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(var(--dg-img-sat,1));transition:filter .2s ease}
.zh-dg-card.has-img .zh-dg-media{aspect-ratio:auto;max-height:280px}
.zh-dg-card.has-img .zh-dg-media img{height:auto;max-height:280px;object-fit:cover}
.zh-dg-textblock{
  margin:0 0 4px;padding:16px 14px;border-radius:12px;
  background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.06);position:relative;min-height:96px
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
  display:none;margin-top:8px;padding:12px 14px;border-radius:12px;background:rgba(0,0,0,.28);
  border:1px solid var(--dg-line);color:var(--dg-sub);font-size:14px;line-height:1.75;max-height:520px;overflow:auto
}
.zh-dg-card.is-expanded .zh-dg-full{display:block}
.zh-dg-card.is-expanded .zh-dg-excerpt,.zh-dg-card.is-expanded .zh-dg-textblock{display:none}
.zh-dg-full img,.zh-dg-full video{max-width:100%!important;height:auto!important;border-radius:8px;filter:saturate(var(--dg-img-sat,1))}
.zh-dg-full p{margin:0 0 .8em}
.zh-dg-foot{display:flex;align-items:center;gap:2px;padding:6px 10px 12px;color:var(--dg-mute);font-size:12px}
.zh-dg-icons{display:flex;align-items:center;flex-wrap:nowrap;gap:2px;width:100%;min-width:0}
.zh-dg-ico{
  appearance:none;border:0;background:transparent;color:#a8a8a8;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;
  border-radius:8px;flex:0 0 32px;font-size:15px;line-height:1;user-select:none
}
.zh-dg-ico:hover{background:rgba(255,255,255,.1);color:#f0f0f0}
.zh-dg-ico.is-on{color:#ffffff}
.zh-dg-ico svg{width:16px;height:16px;display:block;fill:currentColor;flex-shrink:0}
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-media{
  max-height:0!important;min-height:0!important;height:0!important;opacity:0!important;
  margin:0!important;padding:0!important;border:0!important;aspect-ratio:unset!important;overflow:hidden!important
}
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-media img{max-height:0!important;opacity:0!important}
body.zh-dg-hide-imgs #zh-dg-grid .zh-dg-full img{max-height:0!important;opacity:0!important;margin:0!important;overflow:hidden!important}
.zh-dg-pending{
  display:block;width:100%;box-sizing:border-box;min-height:168px;margin:0;border-radius:14px;overflow:hidden;
  background:linear-gradient(160deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.14);position:relative;flex:0 0 auto;pointer-events:none
}
.zh-dg-pending.is-loading{border-color:rgba(255,255,255,.22)}
.zh-dg-pending.is-hidden{display:none!important}
@keyframes zhDgShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
#zh-dg-side{
  position:sticky!important;top:var(--dg-side-top,88px)!important;flex:0 0 var(--dg-side)!important;
  width:var(--dg-side)!important;display:flex!important;flex-direction:column;gap:12px;
  max-height:calc(100vh - var(--dg-side-top, 88px) - 16px);overflow:auto;z-index:2!important;
  box-sizing:border-box;pointer-events:auto;align-self:flex-start
}
.zh-dg-widget{background:var(--dg-card)!important;border:1px solid var(--dg-line)!important;border-radius:12px;padding:14px;opacity:1!important}
.zh-dg-widget h3{margin:0 0 12px;font-size:15px}
.zh-dg-sbtn{display:block;width:100%;height:36px;border-radius:8px;border:0;text-align:center;line-height:36px;text-decoration:none!important;margin-bottom:8px;font-size:13px;box-sizing:border-box}
.zh-dg-sbtn.primary{background:#3a3a3a;color:#fff!important}
.zh-dg-sbtn.ghost{background:var(--dg-elev);color:var(--dg-sub)!important;border:1px solid var(--dg-line)}
.zh-dg-hotlist{display:flex;flex-direction:column;gap:2px;margin:0 0 10px}
.zh-dg-hotitem{display:flex;gap:8px;align-items:flex-start;padding:8px 4px;border-radius:8px;text-decoration:none!important;color:inherit!important}
.zh-dg-hotitem:hover{background:rgba(255,255,255,.04)}
.zh-dg-hotitem .rank{flex:0 0 18px;font-size:13px;font-weight:700;color:var(--dg-mute);line-height:1.4;text-align:center}
.zh-dg-hotitem .body{flex:1;min-width:0}
.zh-dg-hotitem .ht{font-size:13px;line-height:1.45;color:var(--dg-text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.zh-dg-hotitem .hm{margin-top:4px;font-size:11px;color:var(--dg-mute)}
.zh-dg-hotempty{font-size:12px;color:var(--dg-mute);padding:4px 0 8px}
#zh-dg-sentinel{height:32px;width:100%}
body.zh-dg-v2.zh-dg-overlay-open #zh-dg-layout{filter:brightness(.55) saturate(.85);pointer-events:none}
body.zh-dg-v2.zh-dg-overlay-open #zh-dg-layout *{pointer-events:none}
@media(max-width:900px){#zh-dg-layout{padding:0 20px 48px}#zh-dg-side{display:none!important}}
`;

  const ICO = {
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 12H5L12 5z"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19L5 7h14l-7 12z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.9 6.2 21l1.1-6.5L2.6 9.8l6.5-.9L12 3z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.2-4.4-9.5-8.2C.4 9.6 2.1 6 5.5 6c1.9 0 3.3 1.1 4.1 2.2C10.4 7.1 11.8 6 13.7 6c3.4 0 5.1 3.6 3 6.8C19.2 16.6 12 21 12 21z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4zM5 6h6v2H7v10h10v-4h2v6H5V6z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"/></svg>',
  };

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

  function injectCss(extraCss) {
    const css = CSS_CORE + (extraCss || "");
    if (typeof GM_addStyle === "function") GM_addStyle(css);
    else {
      const s = document.createElement("style");
      s.textContent = css;
      document.documentElement.appendChild(s);
    }
  }

  function footIconsHTML(item, icons) {
    const list = icons || ["up", "down", "comment", "star", "heart", "share", "more"];
    const proxyMap = {
      up: "vote-up",
      down: "vote-down",
      comment: "comment",
      star: "collect",
      heart: "like",
      share: "share",
      more: "more",
      open: "open",
    };
    const onMap = {
      "vote-up": item?.voted,
      "vote-down": item?.votedDown,
      like: item?.liked,
      collect: item?.collected,
    };
    const titleMap = {
      up: "赞同",
      down: "反对",
      comment: "评论",
      star: "收藏",
      heart: "喜欢",
      share: "分享",
      more: "更多",
      open: "打开原文",
    };
    const parts = list.map((k) => {
      const proxy = proxyMap[k] || k;
      const on = onMap[proxy] ? " is-on" : "";
      return `<button type="button" class="zh-dg-ico${on}" data-proxy="${proxy}" title="${titleMap[k] || k}" aria-label="${titleMap[k] || k}">${ICO[k] || ""}</button>`;
    });
    return `<div class="zh-dg-icons">${parts.join("")}</div>`;
  }

  function cardHTML(item, icons) {
    const isText = !item.img;
    const classes = ["zh-dg-card", isText ? "is-text" : "has-img"].join(" ");
    const bodyInner = isText
      ? `<div class="zh-dg-textblock"><p class="zh-dg-excerpt">${esc(item.excerpt || "点击展开查看完整内容")}</p></div>`
      : `<div class="zh-dg-media"><img src="${esc(item.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>${
          item.excerpt ? `<p class="zh-dg-excerpt">${esc(item.excerpt)}</p>` : ""
        }`;
    return `<article class="${classes}" data-key="${esc(item.key)}" data-kind="${esc(item.kind || "")}" data-id="${esc(item.id || "")}">
      <div class="hd"><a class="title" href="${esc(item.href)}" target="_blank" rel="noopener">${esc(item.title)}</a></div>
      <div class="zh-dg-body" data-act="expand">${bodyInner}<div class="zh-dg-full" data-full></div></div>
      <div class="zh-dg-foot">${footIconsHTML(item, icons)}</div>
    </article>`;
  }

  function createGridEngine(feedState, opts) {
    const rendered = new Set();
    const orderList = [];
    const store = new Map();
    let colCount = 0;
    const onStatus = opts?.onStatus || (() => {});
    const onCardRendered = opts?.onCardRendered;
    const icons = opts?.icons;

    function cardElByKey(root, key) {
      return [...root.querySelectorAll(".zh-dg-card")].find((el) => el.getAttribute("data-key") === key) || null;
    }

    function calcColCount() {
      const grid = document.getElementById("zh-dg-grid");
      const w = grid?.clientWidth || 0;
      if (w < 40) return Math.max(1, colCount || 1);
      return Math.max(1, Math.floor((w + COL_GAP) / (COL_W + COL_GAP)));
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
          slot.style.minHeight = `${150 + (i % 3) * 28}px`;
          col.appendChild(slot);
        } else if (slot !== col.lastElementChild) col.appendChild(slot);
        slot.classList.toggle("is-hidden", !show);
      });
    }

    function ensureColumns(n) {
      const grid = document.getElementById("zh-dg-grid");
      if (!grid) return [];
      const needRebuild =
        colCount !== n || grid.children.length !== n || ![...grid.children].every((c) => c.classList.contains("zh-dg-col"));
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

    function layoutCols() {
      ensureColumns(calcColCount());
    }

    function setLoading(on) {
      ensurePendingSlots();
      document.querySelectorAll("#zh-dg-grid .zh-dg-pending").forEach((el) => {
        el.classList.toggle("is-loading", !!on);
      });
    }

    function setStatus(msg) {
      const el = document.getElementById("zh-dg-status");
      if (el) el.textContent = msg;
      onStatus(msg);
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
        wrap.innerHTML = cardHTML(it, icons);
        const card = wrap.firstElementChild;
        if (card) {
          appendToCol(cols[(orderList.length - 1) % n], card);
          onCardRendered?.(card, it);
        }
      });
      setStatus(`已加载 ${rendered.size} 条`);
      return fresh.length;
    }

    function bindExpandEvents(root, loadFull) {
      root.addEventListener("click", async (ev) => {
        const card = ev.target.closest(".zh-dg-card");
        if (!card) return;
        if (ev.target.closest("a.title") || ev.target.closest("[data-proxy]")) return;
        const key = card.getAttribute("data-key");
        const item = store.get(key);
        if (!item) return;
        const body = card.querySelector("[data-act='expand']");
        if (!body || !body.contains(ev.target)) return;
        ev.preventDefault();
        const expanded = card.classList.toggle("is-expanded");
        if (expanded) {
          const box = card.querySelector("[data-full]");
          if (box && !box.dataset.loaded) {
            box.innerHTML = '<p class="zh-dg-hotempty">加载中…</p>';
            const html = await (loadFull ? loadFull(item) : Promise.resolve(`<p>${esc(item.excerpt || "")}</p>`));
            box.innerHTML = html;
            box.dataset.loaded = "1";
          }
        }
      });
    }

    return {
      rendered,
      orderList,
      store,
      render,
      layoutCols,
      setStatus,
      setLoading,
      ensureColumns,
      bindExpandEvents,
      reset() {
        rendered.clear();
        orderList.length = 0;
        store.clear();
        colCount = 0;
        const grid = document.getElementById("zh-dg-grid");
        if (grid) grid.innerHTML = "";
      },
    };
  }

  function createShell(opts) {
    const hostSelector = opts?.hostSelector || "body";
    const sideHTML = opts?.sideHTML || "";
    const onReady = opts?.onReady;
    const getHeader = opts?.getHeader || (() => document.querySelector("header"));

    function ensureLayout() {
      let layout = document.getElementById("zh-dg-layout");
      const host = document.querySelector(hostSelector) || document.body;
      const shell = document.getElementById("zh-dg-shell");
      if (!layout) {
        layout = document.createElement("div");
        layout.id = "zh-dg-layout";
        if (shell?.parentElement) {
          shell.parentElement.insertBefore(layout, shell);
          layout.appendChild(shell);
        } else host.prepend(layout);
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
      const header = getHeader();
      const bottom = header ? header.getBoundingClientRect().bottom : 64;
      const topPx = Math.max(72, Math.ceil(bottom + 10)) + "px";
      document.documentElement.style.setProperty("--dg-side-top", topPx);
      document.body?.style.setProperty("--dg-side-top", topPx);
      ["position", "right", "left", "top", "max-height", "z-index", "transform"].forEach((k) => {
        side.style.removeProperty(k);
      });
    }

    function ensureSidePanel() {
      const all = [...document.querySelectorAll("#zh-dg-side")];
      let side = all[0] || null;
      all.slice(1).forEach((el) => el.remove());
      const layout = ensureLayout();
      if (!side) {
        side = document.createElement("aside");
        side.id = "zh-dg-side";
        side.innerHTML = sideHTML;
        layout.appendChild(side);
      } else if (side.parentElement !== layout) layout.appendChild(side);
      placeSideBelowHeader();
      return side;
    }

    function ensureScraper() {
      let sc = document.getElementById("zh-dg-scraper");
      if (!sc) {
        sc = document.createElement("div");
        sc.id = "zh-dg-scraper";
        document.body.appendChild(sc);
      }
      opts?.parkNative?.(sc);
      return sc;
    }

    function mount() {
      if (document.getElementById("zh-dg-shell")) {
        ensureLayout();
        ensureSidePanel();
        ensureScraper();
        placeSideBelowHeader();
        onReady?.();
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
      const host = document.querySelector(hostSelector) || document.body;
      host.prepend(layout);
      ensureSidePanel();
      ensureScraper();
      requestAnimationFrame(() => {
        placeSideBelowHeader();
        onReady?.();
      });
    }

    function teardown() {
      document.getElementById("zh-dg-layout")?.remove();
      document.getElementById("zh-dg-scraper")?.remove();
      document.body?.classList.remove("zh-dg-v2", "zh-dg-hide-imgs", "zh-dg-overlay-open");
      document.documentElement.style.removeProperty("--dg-side-top");
      document.body?.style.removeProperty("--dg-side-top");
    }

    return { mount, teardown, ensureLayout, ensureScraper, placeSideBelowHeader, ensureSidePanel };
  }

  function getImgSat() {
    const v = Number(localStorage.getItem(IMG_SAT_KEY));
    return v === 0 || v === 0.5 ? v : 1;
  }
  function applyImgSat(v) {
    const sat = v === 0 || v === 0.5 ? v : 1;
    document.documentElement.style.setProperty("--dg-img-sat", String(sat));
    document.body?.style.setProperty("--dg-img-sat", String(sat));
    localStorage.setItem(IMG_SAT_KEY, String(sat));
    return sat;
  }
  function cycleImgSat() {
    const cur = getImgSat();
    const next = cur === 1 ? 0.5 : cur === 0.5 ? 0 : 1;
    return applyImgSat(next);
  }

  function bindImageKeys(isActive, setStatus) {
    window.addEventListener(
      "keydown",
      (ev) => {
        if (!isActive()) return;
        if (ev.key !== "q" && ev.key !== "Q") return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const t = ev.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName))) return;
        ev.preventDefault();
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
  }

  function createRouteWatcher({ isHome, onEnter, onLeave }) {
    let lastRoute = location.pathname + location.search;
    function checkRoute() {
      const p = location.pathname + location.search;
      if (p === lastRoute) {
        if (!isHome() && document.getElementById("zh-dg-shell")) onLeave();
        return;
      }
      lastRoute = p;
      if (isHome()) onEnter();
      else onLeave();
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
    return checkRoute;
  }

  function bindInfiniteScroll({ isActive, onNearEnd, rootMargin }) {
    window.addEventListener(
      "scroll",
      () => {
        if (!isActive()) return;
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1600) onNearEnd("scroll");
      },
      { passive: true }
    );
    const io = new IntersectionObserver(
      (ents) => {
        if (!isActive()) return;
        if (ents.some((e) => e.isIntersecting)) onNearEnd("sentinel");
      },
      { rootMargin: rootMargin || "1600px 0px" }
    );
    const watch = () => {
      const s = document.getElementById("zh-dg-sentinel");
      if (s) io.observe(s);
      else setTimeout(watch, 200);
    };
    watch();
    return io;
  }

  global.DarkGridShared = {
    VERSION,
    CSS_CORE,
    ICO,
    esc,
    fmt,
    text,
    strip,
    injectCss,
    cardHTML,
    footIconsHTML,
    createGridEngine,
    createShell,
    getImgSat,
    applyImgSat,
    cycleImgSat,
    bindImageKeys,
    createRouteWatcher,
    bindInfiniteScroll,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : window);
