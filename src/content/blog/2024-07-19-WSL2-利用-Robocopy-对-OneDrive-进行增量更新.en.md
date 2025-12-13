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
Recently, I've been working on some development projects, and I keep all my projects on OneDrive, using `ln -s` to create a symbolic link in WSL2 for development.

The IO performance across file systems like WSL2 ext4 and NTFS is painfully slow. Some venv and node_modules also heavily pollute my OneDrive. Despite some optimizations, frequent use of commands like `git status` has made me somewhat dissatisfied with this approach. However, I've always felt that the benefits of OneDrive synchronization outweigh these side effects, so I haven't done anything about it. Yesterday, I came across Dev Drive and suddenly thought, why not change it?

Considering that projects typically involve a large number of files, mostly small ones, I decided to migrate certain folders to WSL2 and use Robocopy to synchronize content bidirectionally between OneDrive and WSL2, trading space for efficiency.

This article will be tailored to my specific use case. If you just need to back up WSL2 content to OneDrive, I recommend referring to [this article](https://tonym.us/wsl2-backup-to-onedrive-cloud.html).

{/* truncate */}

## Situation

To clarify the requirements, I'll list some of my usage scenarios here, which will be targeted for optimization in the following text.

- **Multi-device Development Needs**

  My primary development device is a laptop, but I occasionally use a desktop for development, which has a copy of the laptop's WSL2 image. Therefore, we need to consider the synchronization strategy from OneDrive to WSL2 and file conflict strategies.

  > I've been relying more on RDP to develop on my laptop from the desktop, so this might not be the top priority.

- **High Real-time Needs**

  We do not guarantee the liveliness of WSL, so we do not want to rely on scheduled backups but rather real-time uploads.

- **File Metadata**

  Soft links currently cause changes in file permissions. With two computers, I always need to run `git restore --staged .` on the other computer first to revert the permission changes.

- **Virtual Environments and Package Caches**

  A classic example is node_modules. We do not want to transfer the lengthy and complex node_modules to OneDrive, filling the upload queue with these reproducible redundant files.

## Definitions

To simplify the following text, we will make some conventions regarding terminology and habits.

- **OneDrive Path**: The path to OneDrive is `D:\OneDrive\`, which corresponds to `/mnt/d/OneDrive/` in WSL2.

## Previous Solution

Since we cannot confirm whether the new solution will meet our needs, and also as an inspiration, we briefly describe the previous solution.

### Synchronization

The simplest approach is to create a symbolic link: `ln -sf /mnt/d/OneDrive/workspace ./workspace`.

### Package Management

Taking `node_modules` as an example, with the project path being `./workspace/foo-project/`, I created a symbolic link: `ln -sf $HOME/.local/onedrive/node_modules/foo-project/node_modules ./workspace/foo-project/node_modules`. This way, node_modules will be installed under `$HOME/.local/onedrive/node_modules/foo-project/node_modules`, while OneDrive will have an additional 0kb file `node_modules` that cannot be uploaded.

### Hot Reload

After this operation, mechanisms like inotify-based hot reload for development modes in vite, flask, and fastapi will not trigger. In this case, polling mode should be used.

Taking my blog framework [Docusaurus](https://docusaurus.io/) as an example, I modified the start command in `package.json` to add the `--poll` parameter:

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

### File Permissions

OneDrive seems to download files with 0777 permissions, which doesn't matter for others. For git-managed files, I just fix them with `git restore --staged .`, and for those not yet committed, I roughly change them with `chmod 755` or `chmod 644`.

### Defects of the Previous Solution

- **Slow IO**

  Cross-file system operations, whether creating a venv, git-related commands, or project scripts performing IO-intensive tasks, are very slow.

- There are several files that cannot be uploaded, which is a bit of a compulsion.

![image-20240719162224812](https://oss.nova.gal/img/image-20240719162224812.png)

## ~~Implementation~~

Well, it's an engineering issue. I won't go into details. Using inotify to monitor system operations and unison for copying.

But I ended up writing a bunch of custom stuff that I don't think I'll ever use.

See [2wsync](https://github.com/MuelNova/2wsync).

![image-20240719234343397](https://oss.nova.gal/img/image-20240719234343397.png)

## Implementation

Hey, I've got a great idea, why don't I just use Syncthing for bidirectional synchronization between devices? 🤓👌

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
