---
title: 【KPWN】一种相对新的 Kernel Elastic Object 结构体 anon_vma_name
description: 水一下。能用作堆喷结构体，可以喷 [kmalloc-8, kmalloc-96]，每次系统调用仅分配一个 obj，并且是 `GFP_KERNEL`
  flag，可以读取（但是 \0 截断），可以释放。
pubDate: 2025-04-14
authors:
- nova
lang: zh
---

水一下。能用作堆喷结构体，可以喷 [kmalloc-8, kmalloc-96]，每次系统调用仅分配一个 obj，并且是 `GFP_KERNEL` flag，可以读取（但是 \0 截断），可以释放。

看论文的时候看到的，但是转了一圈国内好像没有人写过这个结构体？小 size 应该还挺好用的，msg 虽然也可以，但是他是 cg groups 里的，如果想要做这种堆喷就要打 cross cache，麻烦。



可以看到两次系统调用之间只有一次 `__kmalloc` 调用

![image-20250414155042759](https://cdn.nova.gal/img/image-20250414155042759.png)

<!--truncate-->

## 板子

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
#include <string.h>
#include <sys/mman.h>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <sys/wait.h>
#include <sys/syscall.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/prctl.h>
#include <string.h>

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
    pr_info("init addresses\n");
    for (int i = 0; i < 2*ALLOCS; i++) {
        addresses[i] = mmap(0, 1024, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (addresses[i] == MAP_FAILED)
            printf("mmap");
    }
}

void alloc_objs(size_t size)
{
    // size from 0 to 80
    pr_info("allocate %d objs\n", ALLOCS);
    char *buffer;
    buffer = malloc(size);
    memset(buffer, 0x41, size);
    buffer[prev_size - 1] = 0;
    for (size_t i = 0; i < ALLOCS; i++) {
        char store[5];
        memset(store, 0, 5);
        snprintf(store, 5, "%04ld", i);
        memcpy(buffer, store, 4);
        printf("buffer %s len %ld\n", buffer, strlen(buffer));
        rename_vma((unsigned long) addresses[i], 1024, buffer);
    }
}

// free
// rename_vma((unsigned long) addresses[i], 1024, NULL);

// read
// cat /proc/self/maps
```



## 分析

### prctl

https://elixir.bootlin.com/linux/v6.2/source/kernel/sys.c#L2628

一个简单的 wrapper

```c
SYSCALL_DEFINE5(prctl, int, option, unsigned long, arg2, unsigned long, arg3,
		unsigned long, arg4, unsigned long, arg5)
```

```c
	case PR_SET_VMA:
		error = prctl_set_vma(arg2, arg3, arg4, arg5);
		break;
```

所以可以看到函数签名大概是这样的

```c
int prctl(PR_SET_VMA, unsigned long opt, unsigned long addr, unsigned long size, const char* name)
```



#### prctl_set_vma

https://elixir.bootlin.com/linux/v6.2/source/kernel/sys.c#L2301

```c
#ifdef CONFIG_ANON_VMA_NAME

#define ANON_VMA_NAME_MAX_LEN		80
#define ANON_VMA_NAME_INVALID_CHARS	"\\`$[]"

static int prctl_set_vma(unsigned long opt, unsigned long addr,
			 unsigned long size, unsigned long arg)
{
	struct mm_struct *mm = current->mm;
	const char __user *uname;
	struct anon_vma_name *anon_name = NULL;
	int error;

	switch (opt) {
  // highlight-next-line
	case PR_SET_VMA_ANON_NAME:
		uname = (const char __user *)arg;
		if (uname) {
			char *name, *pch;
      
      // highlight-next-line
			name = strndup_user(uname, ANON_VMA_NAME_MAX_LEN);
			if (IS_ERR(name))
				return PTR_ERR(name);

			for (pch = name; *pch != '\0'; pch++) {
				if (!is_valid_name_char(*pch)) {
					kfree(name);
					return -EINVAL;
				}
			}
			/* anon_vma has its own copy */
      // highlight-next-line
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
```

可以看到 check 非常少，只要保证传进来的 name 是 printable，没有 invalid char，并且算上 terminal char 不大于 80 字节即可



#### anon_vma_name_alloc

https://elixir.bootlin.com/linux/v6.2/source/mm/madvise.c#L71

```c
struct anon_vma_name *anon_vma_name_alloc(const char *name)
{
	struct anon_vma_name *anon_name;
	size_t count;

	/* Add 1 for NUL terminator at the end of the anon_name->name */
	count = strlen(name) + 1;
	anon_name = kmalloc(struct_size(anon_name, name, count), GFP_KERNEL);
	if (anon_name) {
		kref_init(&anon_name->kref);
		memcpy(anon_name->name, name, count);
	}

	return anon_name;
}
```

这里就一个 `kmalloc`，flag 是 `GFP_KERNEL`

这里会动态计算 struct anon_vma_name 的大小，套来套去其实就是 `strlen(name) + 1 + sizeof(int)`

```c
struct anon_vma_name {
	struct kref kref;
	/* The name needs to be at the end because it is dynamically sized. */
	char name[];
};

struct kref {
	refcount_t refcount;
};

typedef struct refcount_struct {
	atomic_t refs;
} refcount_t;

typedef struct {
	int counter;
} atomic_t;
```



注意这里不能设置同样的名字，否则会变成一个然后给它的 refcnt + 1，具体可以看 [dup_anon_vma_nam](https://elixir.bootlin.com/linux/v6.2/C/ident/dup_anon_vma_name) 之类的函数



至于 free，那就自然是等到 refcnt 为 0 的时候了，至于怎么减少 refcnt，把它的名字设置成 NULL 即可。

```c
void anon_vma_name_free(struct kref *kref)
{
	struct anon_vma_name *anon_name =
			container_of(kref, struct anon_vma_name, kref);
	kfree(anon_name);
}

```

至于读取，则可以看 https://elixir.bootlin.com/linux/v6.2/source/fs/proc/task_mmu.c#L310

```c
static void
show_map_vma(struct seq_file *m, struct vm_area_struct *vma)
{
	struct anon_vma_name *anon_name = NULL;
	struct mm_struct *mm = vma->vm_mm;
	struct file *file = vma->vm_file;
	vm_flags_t flags = vma->vm_flags;
	unsigned long ino = 0;
	unsigned long long pgoff = 0;
	unsigned long start, end;
	dev_t dev = 0;
	const char *name = NULL;

	if (file) {
		struct inode *inode = file_inode(vma->vm_file);
		dev = inode->i_sb->s_dev;
		ino = inode->i_ino;
		pgoff = ((loff_t)vma->vm_pgoff) << PAGE_SHIFT;
	}

	start = vma->vm_start;
	end = vma->vm_end;
	show_vma_header_prefix(m, start, end, flags, pgoff, dev, ino);
	if (mm)
		anon_name = anon_vma_name(vma);

	/*
	 * Print the dentry name for named mappings, and a
	 * special [heap] marker for the heap:
	 */
	if (file) {
		seq_pad(m, ' ');
		/*
		 * If user named this anon shared memory via
		 * prctl(PR_SET_VMA ..., use the provided name.
		 */
		if (anon_name)
			seq_printf(m, "[anon_shmem:%s]", anon_name->name);
		else
			seq_file_path(m, file, "\n");
		goto done;
	}
```

这个函数会在读 /proc/self/maps 的时候触发，只要解析 `[anon_shmem:%s]` 的 %s 就可以了。
