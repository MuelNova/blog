---
title: 我是如何在 astro 里让 giscus 匹配主题样式的？
description: 我爱魔改
pubDate: 2026-03-02
tags:
- blog
authors:
- nova
lang: zh

---

在去年年底的时候，我看着 2025 年整年都没有写几篇有价值的博客，于是痛定思痛将博客引擎换成了 [Astro](https://astro.build/) 以希望激励自己写作欲望（似乎失败了），主题也基本上从头 AI Vibe coding 了，这次博客的主题是一种 "不确定性"，为此我~~扒~~设计了大量色板切换的核心外观。

对于评论插件，我仍然选择了 [giscus](https://giscus.app/) —— 这是我从之前 [Docusaurus](https://docusaurus.io/) 就一直在使用的，接入较为方便，使用起来也比较轻松，有一个 [GitHub](https://github.com/) 账号就可以了。然而，如果你仅停留在 giscus 官方文档的话，你会发现 giscus *几乎*只能从它的几个 preset 中进行主题的选择 —— 尽管它拥有自定义 css 的功能，但仍然只能设置一个 URL，修改整个 `iframe` 所引用的 css 文件，无法实现动态的修改。

## 之前的方案
我在之前的 [blog(Docusaurus)](https://docu.nova.gal) 里，其实做过一版够用的实现。但是当时我似乎并没有关注过这一点，因为当时主要是利用的 [@giscus/react](https://github.com/giscus/giscus-component/tree/main/react) 这个 component 直接做的，完全没有额外的实现：
```ts
giscus.theme =
  useColorMode().colorMode === 'dark'
    ? giscus.darkCss || 'transparent_dark'
    : giscus.lightCss || 'light';
```

然而在新的博客框架下，单纯的设置 `data-theme` 并不会导致 giscus 重新渲染。

根据源码溯源，在 Docusaurus 里，当 `useColorMode()` 变化时，React 组件会重渲染，`theme` 这个 prop 也会变化；而 `@giscus/react` 底层的 `giscus-component` 会在属性变化时把配置变更通过 `postMessage` 发给 iframe，所以主题能跟着变。

但在现在这套 Astro 实现里，我是直接注入 `https://giscus.app/client.js`，这就导致 `data-theme` 只在脚本初始化时读取一次，而后续改变页面外层状态（`html[data-theme]` / `localStorage`）并不会修改 giscus iframe 内部配置，也不会因为外层 DOM 属性变化自动重渲染。

## 现在的方案

简而言之，在 Docusaurus 的那套实现里，主题动态更新的能力直接由 `react` 和 `@giscus/react` 封装好的。但在现在的 `astro` 实现里，主题同步逻辑需要我自己显式写出来。

### 为什么不直接用 giscus component

~~好问题，问倒我了~~其实主要的想法还是为了实现 “多主题 id -> 对应 CSS URL” 的映射的一个 demo 测试，就算换成 giscus component，我依然要维护主题监听与状态桥接，并且更加不利于调试，当时主要是做的可行性测试，所以就没有上 component~~（其实是 AI 没用 component）~~

### 实现思路

理清了之前的实现思路，目标就比较简单了。

主要实现可以拆成三层：

- `src/pages/giscus/[theme].css.ts`：为每个主题生成一份可访问的 giscus CSS；
- `src/components/Giscus.astro`：首次加载 giscus 时，给 `data-theme` 传当前主题对应的 URL；
- 同一个组件里监听主题变化，用 `postMessage` 调用 giscus 的 `setConfig` 实时切换主题。

为主题生成 css 其实是比较复杂的，因为我这边站点主题实现的就很复杂，它本身就是直接在编译期提取生成的。但好在当时写的时候专门写了一个 `src/config/themes.ts` 统一管理，所以可以直接新增一个动态路由：`/giscus/[theme].css`

```ts
const createGiscusCSS = (colors: ThemeColors) => {
  const { background, foreground, primary, primaryLight, primaryLightest, accent, link } = colors;

  return `
main {
  --color-fg-default: ${foreground};
  --color-canvas-default: ${background};
  --color-btn-primary-bg: ${primary};
  --color-accent-fg: ${link};
  // ... 
}
`;
};
```

在 `getStaticPaths()` 里把所有主题都枚举一遍，构建时就能直接出所有主题的 css 了，也是非常 legacy 的方案了。

```ts
export async function getStaticPaths() {
  const themeIds = await getThemeIds();
  return Promise.all(
    themeIds.map(async (themeId) => ({
      params: { theme: themeId },
      props: { theme: await getTheme(themeId) },
    }))
  );
}
```

这里还加了一个关键响应头：

```ts
'Access-Control-Allow-Origin': 'https://giscus.app'
```

因为 CSS 是被 `giscus.app` 域下的 `iframe` 请求的，必须解决跨域问题。


在 `src/components/Giscus.astro` 里，主要就靠下面几行代码读取当前主题，其实也是比较 legacy 的方案，比较不鲁棒吧！

```ts
const currentTheme = localStorage.getItem('theme')
  || document.documentElement.getAttribute('data-theme')
  || 'spectre';

const themeUrl = `${origin}/giscus/${currentTheme}.css`;
script.setAttribute('data-theme', themeUrl);
```

但是因为我有一个随机主题的能力，所以其实 theme 就是这样存进去 localStorage 的，所以也不是不能用。

其实一开始我是想直接改全局的 css 变量的，但是在测试之后发现并不可行。因为 giscus 渲染后是个 `iframe`，你外面的 CSS 变量根本打不进去。所以切换主题只能走 giscus 提供的消息机制，也是通过前面的 `@giscus/react` 看到的。

我在组件里做了两种监听：

- `storage` 事件：覆盖多标签页同步；
- `MutationObserver`：监听 `<html data-theme="...">` 的变化。

拿到新主题后，发送：

```ts
giscusFrame.contentWindow?.postMessage(
  { giscus: { setConfig: { theme: `${origin}/giscus/${themeId}.css` } } },
  'https://giscus.app'
);
```

## 后续的优化

其实写之前觉得还是有说法的，感觉之前为了这个事情搞了很多。但是现在写下来感觉特别的 legacy，哈哈。

后续的话估计会把主题这个搞成一个接口 + 更新总线，然后让 Giscus 直接订阅事件更新，而不是自己监听，这样可能会更加好一点。
