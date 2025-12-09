---
title: 简单记录在服务器 Docker 上使用 Qemu 安装 Win11
description: 大概是需要 CPU Host 才行，具体可以看 cpuinfo
pubDate: 2024-10-26
authors:
- nova
---

大概是需要 CPU Host 才行，具体可以看 cpuinfo

首先前置条件 qemu 套装安装就不再详细说明了。

<!--truncate-->

## 准备

下载 [Win11 镜像]([Download Windows 11](https://www.microsoft.com/en-in/software-download/windows11?msockid=2007961680cd69562d6f829d811f6891))

下载 [virtio windows driver](https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/)

## 安装

### 创建 qcow2 磁盘

```bash
qemu-img create -f qcow2 ./windows11.qcow2 120G
```

### 启动 qemu

```c
#!/bin/sh

qemu-system-x86_64 \
  -enable-kvm \
  -smp 12,cores=6,threads=2 \
  -m 12G \
  -machine usb=on \
  -device usb-tablet \
  -cpu host \
  -vga virtio \
  -device e1000,netdev=net0 \
  -netdev user,id=net0,net=192.168.20.0/24,dhcpstart=192.168.20.20 \
  -drive file=windows11.qcow2,if=virtio \
  -drive file=virtio-win-0.1.262.iso,index=1,media=cdrom \
  -drive file=Windows.iso,index=2,media=cdrom \
  -vnc :1
```

其中 Windows.iso 就是 win 安装镜像，windows11.qcow2 是刚才创建的 win 磁盘，virtio 就是刚才下的 virtio driver

注意此时开启了 vnc 5091 端口，所以我用 `ssh -L 5091:localhost:5091 root@ip -p port` 做了 SSH 端口转发

### vnc 连接

我在 arch 上用了 `tigervnc`

```bash
vncviewer localhost:5091
```

就可以进去了



之后就要绕过安装时候的 TPM，我这里使用的是注册表绕过的方案。在安装界面 shift+f10 打开 CMD 开 regedit

定位到 `HKEY_LOCAL_MACHINE\SYSTEM\Setup` 创建一个名为 `LabConfig` 的注册表键

然后创建以下 3 项目 DWORD（32 位）值，并将其值设置为1：

- BypassTPMCheck

- BypassSecureBootCheck

- BypassRAMCheck

  

  ![注册表编辑器](https://img.sysgeek.cn/img/2024/03/bypass-hardware-check-windows-11-p6.jpeg)

之后一路走，就可以走到选择安装磁盘的位置。

此时选择 `Load Driver`，找到 `virtio-win`，便可以选择对应的架构

![image-20241026172516934](https://oss.nova.gal/img/image-20241026172516934.png)

选了之后就能看到磁盘了，之后就可以一路安装。

## 参考

[技术|使用 QEMU 尝鲜 Windows 11](https://linux.cn/article-13523-1.html)

[Windows 11：3 种方法轻松绕过 TPM、CPU 和安全启动检测 - 系统极客](https://www.sysgeek.cn/bypass-hardware-check-windows-11/)

组内资源
