# 知乎暗色网格油猴脚本

将知乎首页重排为深灰多列瀑布流信息流（类似小红书），支持无限加载、展开全文、评论回复与赞同。

## 功能

- 等宽多列瀑布流，列数随页面宽度自适应；卡片顺序按原始信息流从左到右分列
- 快捷键 `Q`：切换信息流图片显隐（不影响顶栏图标）
- 点击标题：新标签打开原文
- 点击内容：当前卡片展开 / 收起全文
- 评论：展开 / 收起、自动加载更多、发评与回复
- 赞同：赞同 / 取消赞同
- 侧栏热榜真实数据；隐藏知乎 Logo 与多余快捷入口

## Edge + 暴力猴安装

1. 安装 [Violentmonkey](https://microsoftedge.microsoft.com/addons/detail/violentmonkey/eeagobfjdenkkddmbclomhiblgggliao)（或 Tampermonkey）
2. 打开 `zhihu-dark-grid.user.js`，由扩展提示安装 / 重新安装
3. 访问 [https://www.zhihu.com/](https://www.zhihu.com/)（需已登录），`Ctrl+F5` 强刷

也可在扩展面板中「从文件安装」或粘贴脚本全文。

## 本地预览

用浏览器打开 `preview.html`，可在不登录知乎的情况下对照布局。

## 说明

- 主要作用于首页推荐流；脚本注入页面主世界以携带登录 Cookie 拉取信息流
- 知乎 DOM / API 常变，若布局或评论接口异常可反馈
- 本地调试可用 `_serve_userscript.py` 在 `http://127.0.0.1:8766/` 提供脚本安装地址
