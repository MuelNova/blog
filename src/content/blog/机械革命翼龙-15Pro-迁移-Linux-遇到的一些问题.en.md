---
title: 机械革命翼龙 15Pro 迁移 Linux 遇到的一些问题
description: 博客作者nova记录了迁移Linux到机械革命翼龙15Pro时解决的几个关键问题。由于这款电脑对Linux硬件支持欠缺，nova遇到了键盘失灵、蓝牙模块无效、显卡驱动无法安装以及休眠后立即唤醒的问题。
pubDate: 2024-05-30
authors:
- nova

---
Buying a cost-effective non-mainstream laptop comes with consequences, as there is no hardware adaptation for Linux, and no plans to support it. After using it for a week, I managed to solve about three issues: keyboard malfunction, inactive Bluetooth module, inability to install graphics card drivers, and immediate wake-up from sleep. Here is a brief overview of how I tackled them.

{/* truncate */}

## Keyboard Malfunction

Although there are many solutions available online for this issue, using DSDT on my device did not work. In the end, I fixed this problem by patching the kernel.

The root cause of this problem is that the BIOS incorrectly sets the keyboard's high-level trigger and low-level trigger, which requires preventing ACPI from overriding it with a table. You can refer to the details in the patch.

> From c33381bad489668de6f78f39bc9424e5de781964 Mon Sep 17 00:00:00 2001
> From: MuelNova <muel@nova.gal>
> Date: Sun, 26 May 2024 14:20:57 +0800
> Subject: [PATCH] ACPI: resource: Do IRQ override on MECHREVO Yilong15 Series
> GM5HG0A
>
> MECHREVO Yilong15 Series has a DSDT table that describes IRQ 1 as ActiveLow while the kernel is overriding it to Edge_High. This prevents the internal keyboard from working. This patch prevents this issue by adding this laptop to the override table that prevents the kernel from overriding this IRQ
>
> Signed-off-by: MuelNova <muel@nova.gal>

```diff
---
 drivers/acpi/resource.c | 6 ++++++
 1 file changed, 6 insertions(+)

diff --git a/drivers/acpi/resource.c b/drivers/acpi/resource.c
index b5bf8b81a..fed3c5e1b 100644
--- a/drivers/acpi/resource.c
+++ b/drivers/acpi/resource.c
@@ -540,6 +540,12 @@ static const struct dmi_system_id irq1_level_low_skip_override[] = {
  * to have a working keyboard.
  */
 static const struct dmi_system_id irq1_edge_low_force_override[] = {
+       {
+               /* MECHREVO Yilong15 Series GM5HG0A */
+               .matches = {
+                       DMI_MATCH(DMI_BOARD_NAME, "GM5HG0A"),
+               },
+       },
        {
                /* XMG APEX 17 (M23) */
                .matches = {
--
2.45.1
```

## Bluetooth

The Bluetooth issue is caused by the network card module being too new and not yet included in `btusb.c`. Although it was merged upstream [here](https://github.com/torvalds/linux/commit/8c0401b7308cb7f37fb85bb84f6dfd0df749fd43) two weeks ago, it has not been updated in the corresponding software sources. Therefore, the solution is to compile the latest kernel.

## Graphics Card

Due to compiling the latest kernel, the installation of graphics card drivers failed. Since the kernel is not stable yet, NVIDIA drivers are not prepared for adaptation. An issue arises from a destructive change in the kernel, where the function `follow_pfn` was removed, causing NVIDIA compilation failure.

To address this, a patch can be applied as per [#642](https://github.com/NVIDIA/open-gpu-kernel-modules/issues/642#issuecomment-2124213782) shown below.

```diff
diff --git a/kernel-open/nvidia/os-mlock.c b/kernel-open/nvidia/os-mlock.c
index 46f99a1..b8f4100 100644
--- a/kernel-open/nvidia/os-mlock.c
+++ b/kernel-open/nvidia/os-mlock.c
@@ -30,11 +30,21 @@ static inline int nv_follow_pfn(struct vm_area_struct *vma,
                                 unsigned long address,
                                 unsigned long *pfn)
 {
-#if defined(NV_UNSAFE_FOLLOW_PFN_PRESENT)
-    return unsafe_follow_pfn(vma, address, pfn);
-#else
-    return follow_pfn(vma, address, pfn);
-#endif
+    int status = 0;
+    spinlock_t *ptl;
+    pte_t *ptep;
+
+    if (!(vma->vm_flags & (VM_IO | VM_PFNMAP)))
+        return status;
+
+    status = follow_pte(vma, address, &ptep, &ptl);
+    if (status)
+        return status;
+    *pfn = pte_pfn(ptep_get(ptep));
+
+    // The lock is acquired inside follow_pte()
+    pte_unmap_unlock(ptep, ptl);
+    return 0;
 }

 /*!
```

With this patch, I resolved the issue by installing `nvidia-open-dkms`, and then modifying `dkms.conf` under `/usr/src/nvidia-xxx.xx/`, applying the patch first in the make section.

```c title=/usr/src/nvidia-xxx.xx/dkms.conf
...
```

## Sleep Issue

The specific symptom was waking up immediately after entering sleep mode.

My experience was very similar to that of [this person in the group](https://bugzilla.kernel.org/show_bug.cgi?id=218829).

The problem was resolved by [this commit](https://lore.kernel.org/all/20221012221028.4817-1-mario.limonciello@amd.com/T/).

To determine the wake-up interrupt:

```bash
cat /sys/power/pm_wakeup_irq
cat /proc/interrupts
```

If the interrupt is `pinctrl_amd`, you most likely encountered the same issue. Run the following commands as root to enable DEBUG and then sleep again:

```bash
...
```

Check `dmesg` to see if there are instances of `GPIO $N$ is active: 0xSOMEADDR`.

If found, add the following parameter in the kernel parameters to block the GPIO interface:

```bash
gpiolib_acpi.ignore_interrupt=AMDI0030:00@$N$  # Replace $N$ with your GPIO interface number
```

After rebooting, the issue should be resolved.

## Conclusion

Although this may seem short, I encountered numerous pitfalls, compiled the kernel many times, rolled back changes many times, and stayed up late countless nights. This is the reality for those who prefer using the latest hardware with the latest kernel.

There are too many references to list them all, so I will not include any here.

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
