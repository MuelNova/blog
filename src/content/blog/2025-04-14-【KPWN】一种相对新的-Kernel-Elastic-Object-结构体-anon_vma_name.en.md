---
title: 【KPWN】一种相对新的 Kernel Elastic Object 结构体 anon_vma_name
description: 水一下。能用作堆喷结构体，可以喷 [kmalloc-8, kmalloc-96]，每次系统调用仅分配一个 obj，并且是 `GFP_KERNEL`
  flag，可以读取（但是 \0 截断），可以释放。
pubDate: 2025-04-14
authors:
- nova

---
A quick note: this can be used as a heap-spray object. You can spray sizes in the range [kmalloc-8, kmalloc-96], with each system call allocating exactly one object under the `GFP_KERNEL` flag. The name is readable (though truncated at `\0`), and you can free it.

I saw this in a paper, but after checking around I found no one in China has written about this struct. Its small size makes it quite useful. You could also use `msg` (message queues), but those live in cgroup groups and to heap spray you’d need cross-cache techniques, which is cumbersome.

You can see between two syscalls there is only one `__kmalloc` invocation:

![image-20250414155042759](https://oss.nova.gal/img/image-20250414155042759.png)

{/* truncate */}

## Code Skeleton
```c
#define _GNU_SOURCE
#include <sched.h>
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <sys/mman.h>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <sys/wait.h>
#include <sys/syscall.h>
#include <sys/socket.h>
#include <sys/prctl.h>

#define PAGE_SIZE (1 << 12)

#define ALLOCS 2048*4
static size_t times[ALLOCS];
static void *addresses[2*ALLOCS];

#ifndef PR_SET_VMA
#define PR_SET_VMA 0x53564d41
#define PR_SET_VMA_ANON_NAME 0
#endif
int rename_vma(unsigned long addr, unsigned long size, char *name)
{
    int res;
    res = prctl(PR_SET_VMA, PR_SET_VMA_ANON_NAME, addr, size, name);
    if (res < 0)
        printf("prctl");
    return res;
}

void init_vma_name(void)
{
    printf("init addresses\n");
    for (int i = 0; i < 2*ALLOCS; i++) {
        addresses[i] = mmap(0, 1024, PROT_READ | PROT_WRITE,
                            MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (addresses[i] == MAP_FAILED)
            printf("mmap");
    }
}

void alloc_objs(size_t size)
{
    // size from 0 to 80
    printf("allocate %d objs\n", ALLOCS);
    char *buffer;
    buffer = malloc(size);
    memset(buffer, 0x41, size);
    buffer[size - 1] = 0;
    for (size_t i = 0; i < ALLOCS; i++) {
        char store[5];
        memset(store, 0, 5);
        snprintf(store, 5, "%04ld", i);
        memcpy(buffer, store, 4);
        printf("buffer %s len %ld\n", buffer, strlen(buffer));
        rename_vma((unsigned long)addresses[i], 1024, buffer);
    }
}

// To free:
// rename_vma((unsigned long)addresses[i], 1024, NULL);

// To read names:
// cat /proc/self/maps
```

## Analysis

### prctl Wrapper

The `prctl` syscall is defined as:

```c
SYSCALL_DEFINE5(prctl, int, option,
                unsigned long, arg2,
                unsigned long, arg3,
                unsigned long, arg4,
                unsigned long, arg5)
```

For the `PR_SET_VMA` option, it calls:

```c
case PR_SET_VMA:
    error = prctl_set_vma(arg2, arg3, arg4, arg5);
    break;
```

So the user API is:
```c
int prctl(int PR_SET_VMA,
          unsigned long opt,
          unsigned long addr,
          unsigned long size,
          const char *name);
```

#### prctl_set_vma Implementation

In `kernel/sys.c`:

```c
#ifdef CONFIG_ANON_VMA_NAME

#define ANON_VMA_NAME_MAX_LEN 80
#define ANON_VMA_NAME_INVALID_CHARS "\\`$[]"

static int prctl_set_vma(unsigned long opt,
                         unsigned long addr,
                         unsigned long size,
                         unsigned long arg)
{
    struct mm_struct *mm = current->mm;
    const char __user *uname;
    struct anon_vma_name *anon_name = NULL;
    int error;

    switch (opt) {
    case PR_SET_VMA_ANON_NAME:
        uname = (const char __user *)arg;
        if (uname) {
            char *name, *pch;
            name = strndup_user(uname, ANON_VMA_NAME_MAX_LEN);
            if (IS_ERR(name))
                return PTR_ERR(name);
            for (pch = name; *pch != '\0'; pch++) {
                if (!is_valid_name_char(*pch)) {
                    kfree(name);
                    return -EINVAL;
                }
            }
            anon_name = anon_vma_name_alloc(name);
            kfree(name);
            if (!anon_name)
                return -ENOMEM;
        }

        mmap_write_lock(mm);
        error = madvise_set_anon_name(mm, addr, size, anon_name);
        mmap_write_unlock(mm);
        anon_vma_name_put(anon_name);
        break;
    default:
        error = -EINVAL;
    }
    return error;
}
#endif
```

Checks are minimal: ensure the name is printable, contains no invalid chars, and length (including terminator) ≤ 80.

#### anon_vma_name_alloc

In `mm/madvise.c`:

```c
struct anon_vma_name *anon_vma_name_alloc(const char *name)
{
    struct anon_vma_name *anon_name;
    size_t count;

    count = strlen(name) + 1; // include NUL
    anon_name = kmalloc(struct_size(anon_name, name, count), GFP_KERNEL);
    if (anon_name) {
        kref_init(&anon_name->kref);
        memcpy(anon_name->name, name, count);
    }
    return anon_name;
}
```

It allocates ```strlen(name)+1 + sizeof(kref)``` bytes with `GFP_KERNEL`.

Note: if you reuse the same name, refcount increments instead of allocating a new struct (see `dup_anon_vma_name`). To free, set the name to `NULL` and let the refcount go to zero.

#### Reading the Names

When you read `/proc/self/maps`, the kernel calls:

```c
static void show_map_vma(struct seq_file *m, struct vm_area_struct *vma)
{
    struct anon_vma_name *anon_name = NULL;
    ...
    if (mm)
        anon_name = anon_vma_name(vma);
    if (file) {
        if (anon_name)
            seq_printf(m, "[anon_shmem:%s]", anon_name->name);
        else
            seq_file_path(m, file, "\n");
        goto done;
    }
    ...
}
```

This outputs `[anon_shmem:<name>]`, which you can parse to retrieve your sprayed names.

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
