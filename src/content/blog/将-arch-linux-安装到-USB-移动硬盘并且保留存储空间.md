---
title: 将 arch-linux 安装到 USB 移动硬盘并且保留存储空间给 Windows 设备使用
description: nova详细描述了将Arch Linux安装到USB移动硬盘并保留部分空间用于Windows设备使用的步骤。以下是主要内容和步骤总结：
pubDate: 2024-03-28
authors:
- nova
---

苦于多端环境同步多年，突然想到我仍然有一个 SanDisk 256G Gen3.1 的 U 盘可以使用，因此研究一下如何将 arch linux 安装在 U 盘上

前置准备：

- VMWare Workstation
- [Arch Linux 镜像](https://archlinux.org/download/)
- 一个快速的大容量 U 盘（推荐 USB 3.0+，并且大小在 50GB 以上）

<!--truncate-->

## 环境准备

### 虚拟机

在虚拟机上添加 arch linux 镜像，一切默认即可。开启虚拟机后，把 USB 连接。

![image-20240328154735717](https://cdn.nova.gal/img/image-20240328154735717.png)

### 分区

使用命令查看设备分区信息

```bash
fdisk -l
```

![image-20240328154938091](C:\Users\Muel Nova\AppData\Roaming\Typora\typora-user-images\image-20240328154938091.png)

可以看到，`/dev/sdb` 就对应了我的 U 盘，因此可以使用下面的命令进入分区操作。

```bash
fdisk /dev/sdb
```

通过 `m` 可以查看每个命令的含义，在这里节约篇幅不再解释。

首先通过 `g` 创建一个新的 `GPT` 分区表。之后，通过 `n` 创建新的分区，分别是 `EFI`、`\`以及 `reserved_for_usbdisk`

```bash
# 创建 GPT 分区表
Command (m for help): g

# EFI 分区
Command (m for help): n  # 创建新分区
  		# 分区号，默认即可
   		# 扇区，默认即可
+300M	# 大小，EFI 分区 300MB 即可

# 根目录分区
Command (m for help): n  # 创建新分区
  		# 分区号
   		# 扇区，默认即可
+160G	# 大小

# USB 保留分区
Command (m for help): n  # 创建新分区
  		# 分区号
   		# 扇区，默认即可
   		# 大小，直接默认用完


```

之后，设置分区类型，每个对应的类型都可以通过 `t` 之后 `L` 查看。

```bash
# EFI
Command (m for help): t  # 修改分区类型
1  		# 分区号
1		# MBR

# Root
Command (m for help): t  # 修改分区类型
2  		# 分区号
23		# Linux Root

# USBDisk
Command (m for help): t  # 修改分区类型
3 		# 分区号
11		# Microsoft base data
```

使用 `p` 打印分区表，应该是如下的情况

![image-20240328155834271](https://cdn.nova.gal/img/image-20240328155834271.png)

使用 `w` 保存退出

### 设置分区文件系统类型

```bash
mkfs.ext4 -O "^has_journal" /dev/sdb2  # root
mkfs.fat -F32 /dev/sdb1  # EFI
mkfs.fat -F32 /dev/sdb4  # USBDisk，由于我们主要在 Windows 设备之间传输，因此还是使用 FAT32 文件系统。
```

## 安装

使用 `mount` 挂在根目录到 `/mnt` 下

```bash
mount /dev/sdb2 /mnt
mount /dev/sdb1 /mnt/boot/efi --mkdir
```

安装对应的内核以及必要的软件

```bash
pacstrap /mnt base linux linux-firmware base-devel vim dhcpcd iwd intel-ucode amd-ucode
```

## 配置系统

### 生成 fstab 文件

```bash
genfstab -U /mnt >> /mnt/etc/fstab
```

检查文件内容是否正确

![image-20240328160656125](https://cdn.nova.gal/img/image-20240328160656125.png)

### 设置密码以及配置新用户

不再介绍，自行查询其他教程。

### 配置 Secure Boot

非常的难配。我们不能使用 sbctl 来签名，因为我们使用的是 removable device，所以必须用 shim 签名。

首先安装依赖

```bash
pacman -Sy git sbsigntools
```

```bash
(sudoer)$ git clone https://aur.archlinux.org/shim-signed && cd shim-signed && makepkg -si
```

修改 BOOTX64.EFI 为 grubx64.efi

```bash
mv /boot/efi/EFI/BOOT/{BOOTX64.EFI,grubx64.efi}
```

复制 shim-singed 的 efi 过来

```bash
cp /usr/share/shim-signed/shimx64.efi /boot/efi/EFI/BOOT/BOOTX64.EFI
cp /usr/share/shim-signed/mmx64.efi /boot/efi/EFI/BOOT/
```

生成 Mok 密钥，并且签名

```bash
cd /boot/efi
openssl req -newkey rsa:4096 -nodes -keyout MOK.key -new -x509 -sha256 -subj "/CN=Machine Owner Key/" -out MOK.crt
openssl x509 -outform DER -in MOK.crt -out MOK.c
```

需要把内核和 grub 都签名

```bash
sbsign --key MOK.key --cert MOK.crt --output /boot/vmlinuz-linux /boot/vmlinuz-linux
sbsign --key MOK.key --cert MOK.crt --output /boot/efi/EFI/BOOT/grubx64.efi /boot/efi/EFI/BOOT/grubx64.efi
cp ./MOK.cer /boot/efi
```

### 配置引导程序

安装 `grub` 和 `efibootmgr`

```bash
pacman -Sy grub efibootmgr
```

设置 grub

```bash
grub-install --target=x86_64-efi --efi-directory=/boot --removable --modules="normal test efi_gop efi_uga search echo linux all_video gfxmenu gfxterm_background gfxterm_menu gfxterm loadenv configfile tpm" --sbat /usr/share/grub/sbat.csv
```

生成 grub 配置

```bash
grub-mkconfig -o /boot/grub/grub.cfg
```

### mkinitcpio post hook

```bash
vim /etc/initcpio/post/kernel-sbsign
```

```bash
#!/usr/bin/env bash

kernel="$1"
[[ -n "$kernel" ]] || exit 0

# use already installed kernel if it exists
[[ ! -f "$KERNELDESTINATION" ]] || kernel="$KERNELDESTINATION"

keypairs=(/boot/efi/MOK.key /boot/efi/MOK.crt)

for (( i=0; i<${#keypairs[@]}; i+=2 )); do
    key="${keypairs[$i]}" cert="${keypairs[(( i + 1 ))]}"
    if ! sbverify --cert "$cert" "$kernel" &>/dev/null; then
        sbsign --key "$key" --cert "$cert" --output "$kernel" "$kernel"
    fi
done
```

```bash
chmod +x /etc/initcpio/post/kernel-sbsign
```

### 修改区域设置

切换到 /mnt 下进行操作（在未明确标识的情况下，下文都在 `arch-chroot /mnt` 后的文件系统中进行。

```bash
 arch-chroot /mnt
```

我们首先设置时区

```bash
ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
```

编辑区域设置，去掉 `en_US.UTF-8` 和 `zh_CN UTF-8` 的注释

```bash
vim /etc/locale.gen
# 去掉注释保存
locale-gen
```

![image-20240328161233665](https://cdn.nova.gal/img/image-20240328161233665.png)

设置 local.conf 到 `en_SG.UTF-8`

:::info[为什么不设置 zh_CN？或者是用 en_US]

主要是兼容性问题。zh_CN 容易导致 tty 输出为方块，且系统 log 使用英文，更容易找到报错的解决。

使用 en_SG 可以使得系统以

- 24 小时制显示时间；
- A4 为默认纸张大小；
- 公制单位为默认；

:::

```bash
echo "LANG=en_SG.UTF-8" > /etc/locale.conf
```

### 设置主机名

```bash
echo "MuelNova-Arch" > etc/hostname
```

### 设置 hosts

hosts 默认也为空，我们进行 localhost 的映射

```bash
vim /etc/hosts

# 新增下面两行，保存退出
# 127.0.0.1		localhost
# ::1		    localhost
```

![image-20240328162059643](https://cdn.nova.gal/img/image-20240328162059643.png)

### 配置 initramfs

默认的 initramfs 可能存在不同系统块设备和键盘支持的问题

:::info

这是由于 `autodetect` hook 所导致的。`autodetect` hook 试图仅包含引导当前系统所必需的模块。这对于大多数内置系统是有效的，因为启动时连接的硬件通常不会改变。然而，对于 USB 驱动器来说，它可能在不同的硬件之间移动，如果依赖 `autodetect` 来识别硬件，可能无法找到 USB 驱动器上的必要模块，尤其是在不同于安装时的硬件上。

因此，我们把 `block` 和 `keyboard` 两个 hook 放到 `autodetect` 之前，确保它们永远会被加载。

:::

```bash
vim /etc/mkinitcpio.conf

# 将 HOOKS 修改为下面的，然后保存。
# HOOKS=(base udev block keyboard autodetect modconf filesystems fsck)

mkinitcpio -P  # 重新生成 initramfs
```

## 参考资料

https://carbonateds.com/36.html

[Arch Linux USB (安装篇) | Zephyr's Blog (zephyrheather.github.io)](https://zephyrheather.github.io/posts/7879abfb)
