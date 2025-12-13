---
title: 利用 Hyper-V 创建 WSL2 桥接网络并支持 ipv6
description: Nova最近发现无法通过 `localhost:port` 访问WSL2中的服务，借此机会设置了一个虚拟网卡以创建WSL2的桥接网络，这样不仅支持IPv6，还能让局域网直接访问WSL2的服务，无需端口转发。在他的WSL环境中，尽管更新了内核版本，但它显示的仍然是旧版本。
pubDate: 2023-06-03
tags:
- Windows
- cheatsheet
authors:
- nova
lang: zh
---

不知咋了，原来主机是可以直接通过 `localhost:port` 访问 wsl2 里的服务的，但是今天突然就不行了。趁着这个机会搞一下，根据前不久看的文档搞个虚拟网卡做个 WSL2 的桥接，这样不仅能支持 ipv6，也可以直接局域网访问我 wsl2 的服务而不需要做端口转发。反正我的 wsl2 也不是沙箱，就不考虑安全性了 xD。

<!--truncate-->

## 环境

```bash
WSL version: 1.2.5.0
Kernel version: 5.15.90.1
WSLg version: 1.0.51
MSRDC version: 1.2.3770
Direct3D version: 1.608.2-61064218
DXCore version: 10.0.25131.1002-220531-1700.rs-onecore-base2-hyp
Windows version: 10.0.22621.1702
```

不知道为啥内核显示的还是 `5.15.90`，前面已经更新到 `6.1.9` 了，不管它。总而言之，要确保你的 WSL 版本支持 `vmSwitch` 这个选项。

## 创建外部虚拟交换机

win+r 输入 `virtmgmt.msc` 打开 `Hyper-V Manager`，不得不吐槽微软这个缩写是完全记不住。

一图流操作新建一个外部虚拟交换机

![image-20230603224458330](https://cdn.nova.gal/img/image-20230603224458330.png)

![image-20230603225101822](https://cdn.nova.gal/img/image-20230603225101822.png)

## 修改 WSL2 配置文件

我平常使用的配置文件是 `%USERPROFILE%` 下的，你也可以根据你自己的来选，下面就说下我的。

![image-20230603224655913](https://cdn.nova.gal/img/image-20230603224655913.png)

在 `.wslconfig` 里的 `[wsl2]` 下面添加几项

```toml
[wsl2]
# Your Configs
networkingMode=bridged
vmSwitch=WSLBridge  # 替换成你刚才的外部交换机名称
ipv6=true
```

## 重启 WSL

```bash
wsl --shutdown && wsl
```

如果一切顺利，你应该已经拥有桥接网络的 wsl2 了

![image-20230603230219190](https://cdn.nova.gal/img/image-20230603230219190.png)

## 一些问题

这样设置之后主机就没办法直接使用 `localhost:port` 与 wsl2 进行通信了，好像也有点麻烦。

而且 wsl2 会通过 DHCP 拿 IP 的话，万一变动了也挺麻烦的

先用用看吧（
