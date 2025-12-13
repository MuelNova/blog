---
title: 浅浅~~美化~~一下 Windows 11
description: 二次元确实屁事多
pubDate: 2023-02-01
tags:
- Windows
- cheatsheet
authors:
- nova
lang: zh
---

# 浅浅~~美化~~一下 Windows 11

闲得无事，随便改改，其实在此之前我就已经对于系统做了一定的美化了（透明任务栏，毛玻璃之类的），不过突然感觉二次元浓度不够，所以再改改。

<!--truncate-->

## BIOS

BIOS 能改的其实就是启动时 BIOS 的 LOGO，在这之前，我已经把它改成了天选姬了（我已经记不得一开始是什么了 LOL），不过为了系统的所谓整体性，还是再把它改一改。

我的 Motherboard 是 [MAG-B660M-MORTAR-DDR4](https://www.msi.com/Motherboard/MAG-B660M-MORTAR-DDR4)，当初没买 Wi-Fi 版实在是一败笔，但这些都是后话了

### 需要的工具

#### [UEFITool](https://github.com/LongSoft/UEFITool)

> UEFITool is a viewer and editor of firmware images conforming to UEFI Platform Interface (PI) Specifications.

我使用的版本是 [UEFITool_0.28.0_win32](https://github.com/LongSoft/UEFITool/releases/tag/0.28.0)

:::caution

注意 `NE Alpha builds` 不支持待会的 `replace` 操作 [#179](https://github.com/LongSoft/UEFITool/issues/179)，不过 `Alpha` 版本更清晰一点（下面的图直到 `replace` 前都是 `Alpha` 版本）

:::

其实修改 BIOS LOGO 并不需要用到 UEFITool，有点大炮射蚊子，过于大材小用了。

一般情况下，使用 ChangeLogo 这个软件即可，但是我也找不到这个软件有没有什么官网或是 git repo，那就不用了（）

#### BIOS（[对于我的主板](https://www.msi.com/Motherboard/MAG-B660M-MORTAR-DDR4/support#bios)）

### 流程

为了方便，我将它们解压到一起。

![image-20230128115232640](https://cdn.nova.gal/img/image-20230128115232640.png)

打开 UEFITool，Ctrl+F 在 `GUID` 中输入 `7BB28B99-61BB-11D5-9A5D-0090273FC14D`，这个 File GUID 是固定的，双击软件下方 `Search` 中的结果即可跳转到 LOGO 的位置。

![image-20230128115739129](https://cdn.nova.gal/img/image-20230128115739129.png)

展开 `Logo` 到可以看到 `Raw section`，确定替换 logo 的位置。

在我的 BIOS 下，只存在一个 `Raw section`，不同的 BIOS 可能存在复数个 `Raw section`，如果存在这样的情况请一个一个确定究竟需要替换哪个文件，通过右键 `Extract body` 保存为 `.bmp` 文件可以预览（当然，你也可以通过 `Body hex view` 肉眼辨 bytes）

![image-20230128120347864](https://cdn.nova.gal/img/image-20230128120347864.png)

之后，准备好你要替换的 `Logo` 文件，`Replace body...`

:::tip

虽然对于 `Logo` 文件没有特别明确的要求，但是仍然推荐使用 `bmp` 格式，且文件大小尽可能 _小于等于_ 原 `Logo.bmp` 文件大小的文件（虽然我的天选姬文件大小远大于原 `Logo.bmp` 文件，但是万一主板不支持就不好办了）

:::

现在，如果替换成功，你应该在原来 `Raw section` 这里看到一个 `Remove` 和一个 `Replace`，之后只需要保存这个 BIOS，并刷入即可。不同 BIOS 的刷写方法不同，不再赘述~~其实是不好截图，手机拍屏又太脏了~~

![image-20230128124020832](https://cdn.nova.gal/img/image-20230128124020832.png)

效果的话，~~用 `画图` 模拟了一下~~好吧 `画图` 用不明白用 `photoshop` 了

![image-20230128125530928](https://cdn.nova.gal/img/image-20230128125530928.png)

## 任务栏

这里就不重新弄了，`Taskbar` 设置如图

![image-20230128125621445](https://cdn.nova.gal/img/image-20230128125621445.png)

配合上 [Start11](https://store.steampowered.com/app/1811010/Start11/)，搞一个透明底栏，改一个开始菜单图标，差不多够用。

![image-20230128131119243](https://cdn.nova.gal/img/image-20230128131119243.png)

![image-20230128131447072](https://cdn.nova.gal/img/image-20230128131447072.png)

## 开始菜单

还是 [Start11](https://store.steampowered.com/app/1811010/Start11/)，搞一个毛玻璃 + 二次元背景

![image-20230128132019936](https://cdn.nova.gal/img/image-20230128132019936.png)

![image-20230128132329849](https://cdn.nova.gal/img/image-20230128132329849.png)

## 右键菜单

~~利用 [TranslucentFlyouts](https://github.com/ALTaleX531/TranslucentFlyouts) 添加亚克力模糊，够了。~~ ~~由于它只支持 win32flayouts 所以并不能模糊目前的 windows11 菜单，加之有任务栏图标就暂时先不使用。~~

好吧，我使用 [ExplorerPatcher](https://github.com/valinet/ExplorerPatcher) 把 windows11 的右键菜单禁用了，然后由于它和 `Start11` 有兼容性问题我又给 `ExplorerPatcher` 卸了，不过这个右键菜单禁用的策略仍然是生效的，乐。现在可以使用这个软件了。

![image-20230128141052232](https://cdn.nova.gal/img/image-20230128141052232.png)

## 资源浏览器

这个选择很多，我用了 [枫の美化工具箱 v1.1.1(测试版)](https://winmoes.com/tools/12948.html)

它可以修改最小化、关闭等按钮的样式和背景，以及资源浏览器的背景，背景支持随机，似乎还有插件可用，不过没仔细研究。

随手喂了几张二次元进去。~~（但实际上我觉得不如 [Files](https://www.microsoft.com/store/productId/9NGHP3DX8HDX) 搞一个毛玻璃效果）~~

它也支持毛玻璃效果，但是似乎有 BUG，在全屏情况下我设置的背景混合色就不生效了，导致泛白戳眼睛。

![image-20230128141826265](https://cdn.nova.gal/img/image-20230128141826265.png)

![image-20230128141859779](https://cdn.nova.gal/img/image-20230128141859779.png)

![image-20230128140324894](https://cdn.nova.gal/img/image-20230128140324894.png)

## 其它

例如各种音效等等，都能直接设置就不赘述了。

## 后记

除了 BIOS 好像没有啥技术含量，都是拿个软件直接凿就完事了。

我是脑残写这玩意。
