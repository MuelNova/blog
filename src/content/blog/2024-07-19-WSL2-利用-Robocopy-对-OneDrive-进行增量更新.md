---
title: WSL2 利用 inotify 对 OneDrive 进行实时同步
description: Nova最近在进行开发项目时，将所有项目文件存储在OneDrive上，并通过软链接在WSL2上进行开发。他发现WSL2的ext4文件系统和NTFS之间的IO操作非常慢，尤其是对于venv和node_modules等文件，这不仅影响了效率，还污染了他的OneDrive。尽管他对此进行了一些优化，但频繁使用`git
  status`等命令让他对当前方案产生了不满。
pubDate: 2024-07-19
updatedDate: 2024-07-19
tags:
- WSL
- cheatsheet
authors:
- nova
---

最近在做一些开发相关的项目，我项目全放在 OneDrive 上，利用 ln -s 做了一个软链接在 WSL2 上进行开发。

WSL2 ext4 和 NTFS 这类跨文件系统的 IO 实在是太慢了，一些 venv, node_modules 也会严重的污染我的 OneDrive，尽管针对这些做了一定的优化，最近高频次的使用 `git status` 等也让我对于这个方案有了一些嫌弃，不过一直都觉得 OneDrive 同步带来的 benefits 远大于这些 side effects，所以一直没管，昨天看到了 Dev Drive，突然就想着不然改一下吧。

考虑到项目一般具有文件数量大，且绝大部分为小文件的特点，我决定将一些特定的文件夹迁移到 wsl2 中，利用 Robocopy，将 OneDrive 与 WSL2 中的内容进行双向同步，通过空间来换效率。

这篇文章将针对我的使用情况进行个性化定制，如果你只是需要备份 WSL2 的东西到 OneDrive，推荐参考 [这篇文章](https://tonym.us/wsl2-backup-to-onedrive-cloud.html)

<!--truncate-->

## Situation

为了明确需求，在这里列出我的一些使用情况，下文中将针对这些情况进行针对性优化。

- **多端开发需求**

  我目前主力的开发设备是 Laptop，然而偶尔也会使用台式机进行开发，台式机拥有 Laptop WSL2 镜像拷贝。因此我们需要考虑 OneDrive -> WSL2 的同步策略，以及文件冲突策略。

  > 我最近更多的在台式机上依赖 RDP 进入 Laptop 进行开发，因此这一条可能不会作为最优先事项考虑。

- **高实时性需求**

  我们不针对 WSL 的存活性进行保证，因此不希望依赖于定时备份，而是希望实时上传。

- **文件元数据**

  现在软链接会导致文件的权限变更。两台电脑的情况下，我总是需要在另一台电脑上首先进行 `git restore --staged .` 以撤销权限的变更。

- **虚拟环境与包缓存**

  一个经典的例子就是 node_modules，我们不希望将冗长繁杂的 node_modules 也传输到 OneDrive，使得上传队列被这些可复现的冗余文件占满。

## Definations

为了简化下文，在这里我们对一些术语 / 习惯做一些约定。

- **OneDrive 路径**：以 `D:\OneDrive\` 作为 OneDrive 的路径，它在 wsl2 里对应于 `/mnt/d/OneDrive/`

## Previous Solution

由于不能确认新的方案是否能够满足我们的需求，同时也作为一个启发，我们简述一下之前的解决方案。

### 同步

最简单的，我们对它进行一个软链接 `ln -sf /mnt/d/OneDrive/workspace ./workspace`

### 包管理

以 `node_modules` 为例，项目路径为 `./workspace/foo-project/`，我创建了一个软链接 `ln -sf $HOME/.local/onedrive/node_modules/foo-project/node_modules ./workspace/foo-project/node_modules`，这样 node_modules 将会安装在 `$HOME/.local/onedrive/node_modules/foo-project/node_modules` 下，而 OneDrive 内则会多一个 0kb 无法上传的文件 `node_modules`

### 热更新

这样操作后，例如 vite, flask, fastapi 在开发模式下依赖于 inotify 的热更机制均无法触发。此时，应该使用 polling (轮询) 模式。

以我的博客框架 [Docusaurus](https://docusaurus.io/) 为例，我修改 `package.json` 里的 start 命令，添加 `--poll` 参数

```json title="package.json"
{
  "name": "",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "docusaurus": "docusaurus",
    // highlight-next-line
    "start": "docusaurus start --poll",
    "build": "docusaurus build",
    "swizzle": "docusaurus swizzle",
    "deploy": "docusaurus deploy",
    "clear": "docusaurus clear",
    "serve": "docusaurus serve",
    "write-translations": "docusaurus write-translations",
    "write-heading-ids": "docusaurus write-heading-ids",
    "typecheck": "tsc"
  },
  ...
}
```

### 文件权限

OneDrive 拉下来似乎是 0777 的权限，反正对于其他的也无所谓了。对于 git 管理的，我就直接 `git restore --staged .` 修，有没提交的那就 `chmod 755` 或者 `chmod 644` 大致的改一下。

### 原解决方案缺陷

- **IO 过慢**

  跨文件系统，无论是创建 venv，还是 git 相关的指令，又或是项目脚本执行一些 IO 密集的任务，都是非常缓慢的。

- 存在几个无法上传的文件，强迫症

![image-20240719162224812](https://cdn.nova.gal/img/image-20240719162224812.png)

## ~~Implementation~~

额，工程问题。不再细说。利用 inotify 监控系统操作，利用 unison 复制。

但是莫名其妙写了一堆自定义的，感觉我完全用不到

见 [2wsync](https://github.com/MuelNova/2wsync)

![image-20240719234343397](https://cdn.nova.gal/img/image-20240719234343397.png)

## Implementation

欸，我有个好主意，为什么我不直接用 Syncthing 做双端同步呢？🤓👌
