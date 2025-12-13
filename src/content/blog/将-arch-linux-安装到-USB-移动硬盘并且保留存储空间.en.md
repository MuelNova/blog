---
title: 将 arch-linux 安装到 USB 移动硬盘并且保留存储空间给 Windows 设备使用
description: nova详细描述了将Arch Linux安装到USB移动硬盘并保留部分空间用于Windows设备使用的步骤。以下是主要内容和步骤总结：
pubDate: 2024-03-28
authors:
- nova

---
---
title: Installing Arch Linux on USB External Hard Drive and Reserving Storage Space for Windows Devices
authors: nova
---

Frustrated with syncing data across multiple platforms for years, I suddenly remembered that I still have a SanDisk 256G Gen3.1 USB flash drive I can use, so I decided to research how to install Arch Linux on a USB drive.

Preparation:

- VMWare Workstation
- [Arch Linux image](https://archlinux.org/download/)
- A fast and large capacity USB drive (recommended USB 3.0+, with a size of 50GB or more)

{/* truncate */}

## Environment Setup

### Virtual Machine

Add the Arch Linux image to a virtual machine with default settings. After starting the virtual machine, connect the USB.

![image-20240328154735717](https://oss.nova.gal/img/image-20240328154735717.png)

### Partitioning

Use the following command to view device partition information

```bash
fdisk -l
```

You can see that `/dev/sdb` corresponds to my USB drive, so you can use the following command to perform partitioning operations.

```bash
fdisk /dev/sdb
```

You can use `m` to view the meaning of each command. For brevity, details of each command are not explained here.

First, create a new `GPT` partition table by using `g`. Then, create new partitions for `EFI`, `/`, and `reserved_for_usbdisk` as follows:

```bash
# Create GPT partition table
Command (m for help): g

# EFI partition
Command (m for help): n  # Create new partition
        # Partition number, default
        # Starting sector, default
+300M   # Size, 300MB for EFI partition

# Root partition
Command (m for help): n  # Create new partition
        # Partition number
        # Starting sector, default
+160G   # Size

# USB reserved partition
Command (m for help): n  # Create new partition
        # Partition number
        # Starting sector, default
        # Size, use default to fill the disk
```

Next, set the partition types, which can be viewed using `t` and `L`.

```bash
# EFI
Command (m for help): t  # Change partition type
1       # Partition number
1       # MBR

# Root
Command (m for help): t  # Change partition type
2       # Partition number
23      # Linux Root

# USBDisk
Command (m for help): t  # Change partition type
3       # Partition number
11      # Microsoft base data
```

Use `p` to print the partition table, it should look like this:

![image-20240328155834271](https://oss.nova.gal/img/image-20240328155834271.png)

Save and exit with `w`.

### Set Partition File System Type

```bash
mkfs.ext4 -O "^has_journal" /dev/sdb2  # root
mkfs.fat -F32 /dev/sdb1  # EFI
mkfs.fat -F32 /dev/sdb4  # USBDisk, we use FAT32 due to transferring between Windows devices.
```

## Installation

Mount the root directory to `/mnt`

```bash
mount /dev/sdb2 /mnt
mount /dev/sdb1 /mnt/boot/efi --mkdir
```

Install the necessary kernel and software packages

```bash
pacstrap /mnt base linux linux-firmware base-devel vim dhcpcd iwd intel-ucode amd-ucode
```

## Configuration

### Generate fstab file

```bash
genfstab -U /mnt >> /mnt/etc/fstab
```

Check if the file content is correct.

![image-20240328160656125](https://oss.nova.gal/img/image-20240328160656125.png)

Continue with password setup and new user configuration following other tutorials.

### Configure Secure Boot

Difficult to configure. Cannot use sbctl for signing as we are using a removable device; hence we must use shim for signing.

First, install dependencies

```bash
pacman -Sy git sbsigntools
```

```bash
(sudoer)$ git clone https://aur.archlinux.org/shim-signed && cd shim-signed && makepkg -si
```

Change BOOTX64.EFI to grubx64.efi

```bash
mv /boot/efi/EFI/BOOT/{BOOTX64.EFI,grubx64.efi}
```

Copy from shim-singed EFI files

```bash
cp /usr/share/shim-signed/shimx64.efi /boot/efi/EFI/BOOT/BOOTX64.EFI
cp /usr/share/shim-signed/mmx64.efi /boot/efi/EFI/BOOT/
```

Generate Mok key and sign

```bash
cd /boot/efi
openssl req -newkey rsa:4096 -nodes -keyout MOK.key -new -x509 -sha256 -subj "/CN=Machine Owner Key/" -out MOK.crt
openssl x509 -outform DER -in MOK.crt -out MOK.c
```

Sign both kernel and grub

```bash
sbsign --key MOK.key --cert MOK.crt --output /boot/vmlinuz-linux /boot/vmlinuz-linux
sbsign --key MOK.key --cert MOK.crt --output /boot/efi/EFI/BOOT/grubx64.efi /boot/efi/EFI/BOOT/grubx64.efi
cp ./MOK.cer /boot/efi
```

### Configure Boot Loader

Install `grub` and `efibootmgr`

```bash
pacman -Sy grub efibootmgr
```

Setup grub

```bash
grub-install --target=x86_64-efi --efi-directory=/boot --removable --modules="normal test efi_gop efi_uga search echo linux all_video gfxmenu gfxterm_background gfxterm_menu gfxterm loadenv configfile tpm" --sbat /usr/share/grub/sbat.csv
```

Generate grub configuration

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

### Modify Locale Settings

Switch to `/mnt` for these operations (unless otherwise specified, the following steps take place in the file system after `arch-chroot /mnt`).

Set the timezone

```bash
ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
```

Edit locale settings by uncommenting `en_SG.UTF-8`

```bash
vim /etc/locale.gen
# Uncomment the lines and save
locale-gen
```

Set `local.conf` to `en_SG.UTF-8`

```bash
echo "LANG=en_SG.UTF-8" > /etc/locale.conf
```

### Set Hostname

```bash
echo "MuelNova-Arch" > etc/hostname
```

### Set hosts

Add localhost mappings in hosts file

```bash
vim /etc/hosts

# Add the following two lines and save
# 127.0.0.1        localhost
# ::1            localhost
```

### Configure initramfs

The default initramfs may have issues with different block devices and keyboard support.

To address this, move `block` and `keyboard` hooks before `autodetect` to ensure they are always loaded.

```bash
vim /etc/mkinitcpio.conf

# Modify HOOKS to the following, then save.
# HOOKS=(base udev block keyboard autodetect modconf filesystems fsck)

mkinitcpio -P  # Regenerate initramfs
```

## References

https://carbonateds.com/36.html

[Arch Linux USB (Installation Article) | Zephyr's Blog (zephyrheather.github.io)](https://zephyrheather.github.io/posts/7879abfb)

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
