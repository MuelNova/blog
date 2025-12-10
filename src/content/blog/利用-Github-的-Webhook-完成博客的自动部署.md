---
title: 利用 Github 的 Webhook 完成博客的自动部署
description: 博主 nova 厌倦了每次通过 SSH 手动执行 `git pull && npm run build` 来部署博客，因此决定利用 GitHub
  的 Webhook 实现自动部署。文章详细介绍了如何配置 GitHub 的 Webhook，并且提供了链接供读者参考。Webhook 的 URL 配置为公用 IP，content
  type 选择 json，并设置一个随机的 Secret 生成 HMAC 密钥。
pubDate: 2023-05-11
tags:
- cheatsheet
- 小技巧
authors:
- nova
---

突然厌烦了每次要登 ssh，然后 `git pull && npm run build` 来部署 blog，于是就想到了 webhook

不过 `package-lock.json` 的 conflict 还是要自己修，后面想想有没有什么办法（直接把这玩意 ignore 啦！）

<!--truncate-->

## Webhook 配置

[关于 web 挂钩 - GitHub 文档](https://docs.github.com/zh/webhooks-and-events/webhooks/about-webhooks)

直接看这个就完事了，在 REPO->Settings->Webhooks->Add webhook 处添加一个新的 Webhook

![image-20230511190219973](https://cdn.nova.gal/img/image-20230511190219973.png)

![image-20230511190315524](https://cdn.nova.gal/img/image-20230511190315524.png)

URL 就直接填公网 IP 就行，content type 我选了 json。

注意 Secret，这个就是用来生成 HMAC 的密钥，尽量填个随机一点的，后端倒时候也要用。

成功之后它会发送一个 ping，所以可以先不完成添加。

## 后端

后端的思路很简单，监听上面的 URL，等接到 POST 包验证，然后跑命令就行。

用的是 go 的 gin，直接添加就完事了。

代码可以在 [MuelNova/go-github-build-hook](https://github.com/MuelNova/go-github-build-hook) 这里看。

唯一值得注意的大概就是因为 build 时间太长了，所以丢给一个协程自己跑就行，后端直接返回 200。

一开始写完测试的时候一直 timed out，还以为是什么问题。

没错这篇纯水，只是因为我想测试一下它的效果（笑

## 构思

因为 github 提供的消息挺全面的，所以后面估计会稍微的让他更自定义一点？或者添加一个推送啥的给 QQ 机器人，让我知道是什么时候编译完成了
