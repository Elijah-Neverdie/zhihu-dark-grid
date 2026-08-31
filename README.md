# 知乎暗色网格油猴脚本

**知乎版本：`3.5.10`** · **Quora 子插件：`1.0.0`** · **共享核心：`1.0.0`**

将知乎首页重排为深灰多列瀑布流信息流（类似小红书），支持无限加载、展开全文、评论回复与赞同。

## 双插件架构

本仓库采用「共享核心 + 站点适配」结构，便于后续迭代知乎时同步改进 Quora 的样式与网格能力：

| 文件 | 作用 |
|------|------|
| `dark-grid-shared.user.js` | 共享 CSS 变量、多列网格、卡片 HTML、侧栏壳、`Q` / `Shift+Q` 快捷键 |
| `zhihu-dark-grid.user.js` | 知乎站点适配（API 拦截、评论、浮层、热榜等完整功能） |
| `quora-dark-grid.user.js` | Quora 站点适配（`@require` 共享核心，首页 DOM 抓取 MVP） |

迭代建议：先改 `dark-grid-shared.user.js` 中的通用样式/布局，再在各自站点脚本里补 DOM 选择器或 API 逻辑。

## 安装 / 更新（推荐从 GitHub）

安装地址（暴力猴 / 油猴会从此自动检查更新）：

https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/zhihu-dark-grid.user.js

仓库主页：https://github.com/Elijah-Neverdie/zhihu-dark-grid

1. 安装 [Violentmonkey](https://microsoftedge.microsoft.com/addons/detail/violentmonkey/eeagobfjdenkkddmbclomhiblgggliao)（或 Tampermonkey）
2. 打开上面的 raw 链接，按扩展提示安装
3. 之后在扩展里点「检查更新」即可拉取新版本（以脚本头 `@version` 为准）
4. 访问 [https://www.zhihu.com/](https://www.zhihu.com/)（需已登录），`Ctrl+F5` 强刷

若本地版本号高于 GitHub，扩展会提示「没有更新」——以 GitHub raw 上的 `@version` 为准。

### Quora 子插件

安装地址：

https://raw.githubusercontent.com/Elijah-Neverdie/zhihu-dark-grid/master/quora-dark-grid.user.js

脚本会通过 `@require` 自动拉取共享核心 `dark-grid-shared.user.js`，无需单独安装。访问 [https://www.quora.com/](https://www.quora.com/) 首页即可生效。

本地调试时可将 `@require` 临时改为 `http://127.0.0.1:8766/dark-grid-shared.user.js`。

## 功能

- 等宽多列瀑布流，列数随页面宽度自适应；卡片顺序按原始信息流从左到右分列
- 快捷键 `Q`：切换信息流图片显隐（不影响顶栏图标）
- 快捷键 `Shift+Q`：图片饱和度 `1 → 0.5 → 0` 轮转，刷新后记住
- 点击标题：新标签打开原文
- 点击内容：当前卡片展开 / 收起全文
- 评论：展开 / 收起、自动加载更多、发评与回复
- 赞同：赞同 / 取消赞同
- 侧栏热榜真实数据；隐藏知乎 Logo 与多余快捷入口

### Quora 子插件（MVP）

- 首页暗色多列瀑布流，与知乎插件共用网格样式
- 从原站 DOM 抓取问题标题 / 摘要 / 配图
- `Q` 藏图、`Shift+Q` 饱和度轮转（与知乎一致）
- 点击标题或操作栏「打开」在新标签查看原文
- 侧栏快捷入口（首页 / 关注 / 写回答）

## 版本记录（摘要）

| 版本 | 说明 |
|------|------|
| Quora 1.0.0 | 新增 Quora 子插件与 `dark-grid-shared` 共享核心 |
| 3.5.10 | 浮层灰阶与压暗背景协调；修复高亮回复深底深字不可读 |
| 3.5.9 | `@updateURL` 改 GitHub raw，避免 jsDelivr 缓存导致检测不到新版本 |
| 3.5.8 | 嵌套评论/「返回评论」抽屉统一暗色主题 |
| 3.5.7 | 信息流与侧栏改 flex 双栏强分离；修复评论浮层打开时侧栏交叠 |
| 3.5.6 | 更新源改 jsDelivr，修复 Tampermonkey 检测不到新版本 |
| 3.5.5 | 加强浮窗压暗；修复圆角穿帮；移除内容块底部省略号 |
| 3.5.4 | 内容块展开提示改为居中「...」 |
| 3.5.3 | 浮窗遮罩持续压暗；修复圆角四角穿帮 |
| 3.5.2 | 操作栏赞/踩/喜欢/收藏改走 API，避免只亮图标不生效 |
| 3.5.1 | 操作栏不再搬移原站 React 节点，赞/藏/分享等恢复可用 |
| 3.5.0 | 强制隔离 `App-main` 原站侧栏，修复创作中心/热榜叠层；README 标明版本 |
| 3.4.3 | `Shift+Q` 饱和度轮转并持久化 |
| 3.4.2 | 浮层暗色与压暗背景；配置 GitHub `@updateURL` |
| 3.4.0 | 修复消息浮层误删导致点赞/回复无响应 |

## 本地预览

用浏览器打开 `preview.html`，可在不登录知乎的情况下对照布局。

本地调试可用 `_serve_userscript.py` 在 `http://127.0.0.1:8766/` 提供脚本安装地址。

## 说明

- 主要作用于首页推荐流 / 关注流；其它路由保持原站
- Quora 子插件主要作用于 `/` 与 `/feed`；其它路由保持原站
- 脚本注入页面主世界以携带登录 Cookie 拉取信息流
- 知乎 / Quora DOM 常变，若布局或评论接口异常可反馈
