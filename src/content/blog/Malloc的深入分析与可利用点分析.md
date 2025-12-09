---
title: Malloc的源码审计
description: 这篇博客文章主要由作者nova编写，详细分析了glibc库中malloc函数的实现及其可利用的漏洞点。
pubDate: 2022-06-30
tags:
- CTF
- Pwn
- glibc
authors:
- nova
---

<div align='center'>
    <h1>
        Malloc的深入分析与可利用点分析
    </h1>
</div>

不知不觉已经 2 个月没更`BLOG`了，因为这两个月我确实是基本没看过`CTF`（一段时间是拿去代练赚我上头消费花掉的神里绫华的嫁妆了，另一段时间则是拿去做开发了）。今天有闲心又把下的题拿出来看了一看，发现别说堆了，我连`gdb`怎么用都忘了（）

<!--truncate-->

于是下定决心先做点学习笔记。

感觉工程量还是很大的，挖一个坑。

<details>
    <summary>更新日志</summary>
    <h3>2022/05/19</h3> 
    <li>首次部署文档（脑阔转不过来了）</li>
    <li>完成 _int_malloc () 中的 fastbin 部分</li>
    <h3>2022/05/22</h3> 
    <li>完成 _int_malloc () 中的 smallbin, after_smallbin, iteration 部分</li>
    <li>因为太多了，所以决定分开写</li>
</details>

目前主要写的是`ptmalloc2`，也就是`glibc`的堆实现标准。[源码](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD)在[gnu.org](https://www.gnu.org/software/libc/sources.html)可以看到

使用的是`93ce3e`这个提交的仓库代码。

# 使用 glibc 源码调试程序的方法

在观察源码的过程中，常常需要实战来看代码究竟是怎么运行的。在这里介绍使用`glibc`源码调试的方法。

## 编译安装

在[libc source](https://ftp.gnu.org/gnu/libc/)处下载对应版本的源码并解压，修改`MAKECONFIG`，添加`+cflags += -ggdb3`（可以调试宏）

```sh
tar xvf glibc-2.31.tar.gz
cd glibc-2.31
nano MAKECONFIG # ADD `+cflags += -ggdb3`
export glibc_install=$PWD/build/install # path to the dir you want to install, but don't use the root.
./configure --prefix "$glibc_install"
make && sudo make install
```

## 更换题目动态解释器

### patchelf

```sh
patchelf --set-rpath /home/nova/CTF/glibc-all-in-one/source-libs/glib-2.31/build/install/lib --set-interpreter /home/nova/CTF/glibc-all-in-one/source-libs/glibc-2.31/build/install/lib/ld-linux-x86-64.so.2 malloc
```

### gcc

```sh
gcc -L "${glibc_install}/lib" -I "${glibc_install}/include" -Wl,--rpath="${glibc_install}/lib" -Wl,--dynamic-linker="${glibc_install}/lib/ld-linux-x86-64.so.2" -gdwarf-2 -ggdb3 -o malloc -v malloc.c
```

# 描述

在[#597](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD#l597)可以看到`malloc`的描述

```c
/*
  malloc(size_t n)
  Returns a pointer to a newly allocated chunk of at least n bytes, or null
  if no space is available. Additionally, on failure, errno is
  set to ENOMEM on ANSI C systems.

  If n is zero, malloc returns a minimum-sized chunk. (The minimum
  size is 16 bytes on most 32bit systems, and 24 or 32 bytes on 64bit
  systems.)  On most systems, size_t is an unsigned type, so calls
  with negative arguments are interpreted as requests for huge amounts
  of space, which will often fail. The maximum supported value of n
  differs across systems, but is in all cases less than the maximum
  representable value of a size_t.
*/
```

`malloc`返回一个*至少*n 字节的`chunk`的指针，在没有空间的情况下返回`null`

如果 n 是 0 的话，`malloc`返回一个`minimum_sized`的`chunk`——在 32bit 上一般为 16 字节，在 64bit 上一般为 32 字节（也有可能是 24 字节）

![32bytes_of_malloc(0)](https://oss.nova.gal/img/image-20220519164757635.png)

因为`size_t`是无符号类型，n 是负数通常会导致系统分配一个极大的内存且出现没有足够多的内存分配而失败的情况。

# 原理

在[#3284](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD#l3284)可以看到`malloc`的具体实现函数

```c
#if IS_IN (libc)
void *
__libc_malloc (size_t bytes)
{
  mstate ar_ptr;
  void *victim; // 将要返回的指针地址

  _Static_assert (PTRDIFF_MAX <= SIZE_MAX / 2,
                  "PTRDIFF_MAX is not more than half of SIZE_MAX");

  if (!__malloc_initialized)
    ptmalloc_init (); // 初始化
```

首先它有一个`_Static_assert`来判断`PTRDIFF_MAX`是否小于`SIZE_MAX`的一半，这里的`PTRDIFF_MAX`和`SIZE_MAX`可以看[Numeric limits](https://en.cppreference.com/w/c/types/limits)，只是个判断最大数组的函数。当`__malloc_initialized`不存在时，他先进行了`ptmalloc`的初始化——在大多数`malloc`相关的函数中，它都进行了这个检测。

## ptmalloc_init ()

`ptmalloc_init ()`定义在`arena.c`中，可以在[#312](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/arena.c;h=0a684a720d9648953073bd7d35faca100762c031;hb=HEAD#l312)找到。

```c
static void
ptmalloc_init (void)
{
  ...
#if USE_TCACHE
  tcache_key_initialize (); // 初始化 tcache 的密钥 key
#endif
  thread_arena = &main_arena; // 记录 arena 的指针地址，初始化时记录主线程的 main_arena 指针地址
  malloc_init_state (&main_arena); // 对主线程的 arena 进行初始化

  ...
}
```

为了精简内容，将一部分我们不需要注意的东西省去。

### tcache_key_initialize ()

定义在`malloc.c`中，在[#3159](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD#l3159)可以找到

```c
/* The value of tcache_key does not really have to be a cryptographically
   secure random number.  It only needs to be arbitrary enough so that it does
   not collide with values present in applications.  If a collision does happen
   consistently enough, it could cause a degradation in performance since the
   entire list is checked to check if the block indeed has been freed the
   second time.  The odds of this happening are exceedingly low though, about 1
   in 2^wordsize.  There is probably a higher chance of the performance
   degradation being due to a double free where the first free happened in a
   different thread; that's a case this check does not cover.  */
/* 简单来说，就是生成了一个`tcache`的密钥`key`。
   如果`key`与程序中的数值冲突，且频率较高，
   那么整个列表都要检查该块是否真的被释放了。*/
static void
tcache_key_initialize (void)
{
  if (__getrandom (&tcache_key, sizeof(tcache_key), GRND_NONBLOCK)
      != sizeof (tcache_key))
    {
      tcache_key = random_bits ();
#if __WORDSIZE == 64
      tcache_key = (tcache_key << 32) | random_bits ();
#endif
    }
}
```

### malloc_init_state

定义在`malloc.c`中，在[#1952](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD#l1952)中可以找到

```c
/*
   Initialize a malloc_state struct.

   This is called from ptmalloc_init () or from _int_new_arena ()
   when creating a new arena.
 */

static void
malloc_init_state (mstate av)
{
  int i;
  mbinptr bin;

  /* 将 av 下的所有的 bin 的 fd 和 bk 指针指向自己 */
  for (i = 1; i < NBINS; ++i)
    {
      bin = bin_at (av, i);
      bin->fd = bin->bk = bin;
    }

#if MORECORE_CONTIGUOUS
  if (av != &main_arena)
#endif
  set_noncontiguous (av); // 设置 MORECORE 不返回连续的空间 - 即非主配区
  if (av == &main_arena)
    set_max_fast (DEFAULT_MXFAST); // 设置最大 fast_bin 大小，定义了宏一通计算
  atomic_store_relaxed (&av->have_fastchunks, false); // 原子写入

  av->top = initial_top (av); // 将 top 字段指向 bins
}
```

---

# 原理

回到`__libc_malloc`

```c
#if USE_TCACHE // tcache 相关，深入的放到后面 tcache 的再说
  /* int_free also calls request2size, be careful to not pad twice.  */
  size_t tbytes;
  if (!checked_request2size (bytes, &tbytes)) // 检查填充所需 size 时是否溢出, 并赋值 tbytes 为请求的大小
    {
      __set_errno (ENOMEM);
      return NULL;
    }
  size_t tc_idx = csize2tidx (tbytes); // chunk size to tcache index

  MAYBE_INIT_TCACHE (); // 如果是首次调用就运行 tcache_init ()

  DIAG_PUSH_NEEDS_COMMENT;
  if (tc_idx < mp_.tcache_bins // idx 合法
      && tcache
      && tcache->counts[tc_idx] > 0) // tcache 链不为空
    {
      victim = tcache_get (tc_idx); // 获得chunk
      return tag_new_usable (victim);
    }
  DIAG_POP_NEEDS_COMMENT; // 先从 tcache 取合适的内存
#endif

```

这段具体是`tcache`的**高优先级**的提现，可以知道`malloc`在取内存时都是先从`tcache`中找有无合适的内存的。

```c
  if (SINGLE_THREAD_P) // 单线程
    {
      victim = tag_new_usable (_int_malloc (&main_arena, bytes)); // 使用 _int_malloc 从 main_arena 中取 bytes 大小的内存。
      assert (!victim || chunk_is_mmapped (mem2chunk (victim)) ||
	      &main_arena == arena_for_chunk (mem2chunk (victim)));
      /* 需满足以下至少一点
      	1. 取到了 chunk
      	2. chunk 是 mmap 分配的
      	3. chunk 存在于 main_arena 中 */
      return victim;
    }
  // 多线程
  arena_get (ar_ptr, bytes);

  victim = _int_malloc (ar_ptr, bytes);
  /* Retry with another arena only if we were able to find a usable arena
     before.  */
  // 使用其他的 arena
  if (!victim && ar_ptr != NULL)
    {
      LIBC_PROBE (memory_malloc_retry, 1, bytes);
      ar_ptr = arena_get_retry (ar_ptr, bytes);
      victim = _int_malloc (ar_ptr, bytes);
    }

  if (ar_ptr != NULL)
    __libc_lock_unlock (ar_ptr->mutex);

  victim = tag_new_usable (victim);

  assert (!victim || chunk_is_mmapped (mem2chunk (victim)) ||
          ar_ptr == arena_for_chunk (mem2chunk (victim)));
  return victim;
}
```

多线程的 `malloc` 我们放到`arena`那讲， 先来看看` _int_malloc`

## \_int_malloc ()

定义在`malloc.c`的[#3765](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD#l3765)。这就是`malloc`的关键函数。代码很长，我们分段来看。

```c
static void *
_int_malloc (mstate av, size_t bytes)
{
  INTERNAL_SIZE_T nb;               /* normalized request size */
  unsigned int idx;                 /* associated bin index */
  mbinptr bin;                      /* associated bin */

  mchunkptr victim;                 /* inspected/selected chunk */
  INTERNAL_SIZE_T size;             /* its size */
  int victim_index;                 /* its bin index */

  mchunkptr remainder;              /* remainder from a split */
  unsigned long remainder_size;     /* its size */

  unsigned int block;               /* bit map traverser */
  unsigned int bit;                 /* bit map traverser */
  unsigned int map;                 /* current word of binmap */

  mchunkptr fwd;                    /* misc temp for linking */
  mchunkptr bck;                    /* misc temp for linking */

#if USE_TCACHE
  size_t tcache_unsorted_count;	    /* count of unsorted chunks processed */
#endif
   /*
     Convert request size to internal form by adding SIZE_SZ bytes
     overhead plus possibly more to obtain necessary alignment and/or
     to obtain a size of at least MINSIZE, the smallest allocatable
     size. Also, checked_request2size returns false for request sizes
     that are so large that they wrap around zero when padded and
     aligned.
   */

  if (!checked_request2size (bytes, &nb)) // 同 __libc_malloc , 将 nb 赋值为所需要的大小。
    {
      __set_errno (ENOMEM);
      return NULL;
    }

```

这段主要是定义了一些变量并且将所需的大小转换为`INTERNAL_SIZE_T`方便使用

```c
  /* 如果没有可用的 arena，调用 sysmalloc 从 mmap 中取内存  */
  if (__glibc_unlikely (av == NULL))
    {
      void *p = sysmalloc (nb, av);
      if (p != NULL)
	alloc_perturb (p, bytes);
      return p;
    }
```

这里描述了什么时候需要从`mmap`中使用`sysmalloc`取内存。

### fastbin

下面是取 `fastbin` 的过程

```c
/*
     If the size qualifies as a fastbin, first check corresponding bin.
     This code is safe to execute even if av is not yet initialized, so we
     can try it without checking, which saves some time on this fast path.
   */

#define REMOVE_FB(fb, victim, pp)			\
  do							\
    {							\
      victim = pp;					\
      if (victim == NULL)				\
	break;						\
      pp = REVEAL_PTR (victim->fd);                                     \
      if (__glibc_unlikely (pp != NULL && misaligned_chunk (pp)))       \
	malloc_printerr ("malloc(): unaligned fastbin chunk detected"); \
    }							\
  while ((pp = catomic_compare_and_exchange_val_acq (fb, pp, victim)) \
	 != victim);					\
         /* 遍历 fd 对应的 bins 中是否有空闲的 chunk 块 */
  if ((unsigned long) (nb) <= (unsigned long) (get_max_fast ())) // nb 在 fastbin 范围内
    {
      idx = fastbin_index (nb); // fastbin 下标
      mfastbinptr *fb = &fastbin (av, idx); // fastbin 头部指针
      mchunkptr pp;
      victim = *fb;

      if (victim != NULL)
	{
	  if (__glibc_unlikely (misaligned_chunk (victim))) // 检查 fb 是否对齐
	    malloc_printerr ("malloc(): unaligned fastbin chunk detected 2");

	  if (SINGLE_THREAD_P)
	    *fb = REVEAL_PTR (victim->fd); // 单线程时，取出 victim 的头节点指针赋值给 fb
	  else
	    REMOVE_FB (fb, pp, victim);
```

这个`REMOVE_FB`是重中之重，我们详细理解一下。

我们以`_int_malloc`定义的`pp`和`victim`为准。

未进入`REMOVE_FB`前，我们的结构是这样的

![structure_of_the_first](https://oss.nova.gal/img/image-20220519204208793.png)

首先第一次循环时，`pp = victim`, `victim = pp->fd`

![first_loop](https://oss.nova.gal/img/image-20220519204410001.png)

之后执行`while`，`catomic_compare_and_exchange_val_acq(mem, newval, oldval)`执行逻辑是这样的：如果 `*mem = oldval`，则返回`oldval`，且`*mem = newval`

我们的`mem`是`fb`，`oldval`是`pp`，`newval`是`victim`。显然成立，则第一次循环完毕后我们有`*fb=victim`, `victim = pp`

![end_of_the_first_loop](https://oss.nova.gal/img/image-20220519205349480.png)

是的，`chunk1`从链表上完全脱离了。

```c
	  if (__glibc_likely (victim != NULL)) // 检查取出的 fastbin 大小是否正确
          /* 可以在这里利用伪造 fastbin 大小 */
	    {
	      size_t victim_idx = fastbin_index (chunksize (victim));
	      if (__builtin_expect (victim_idx != idx, 0))
		malloc_printerr ("malloc(): memory corruption (fast)");
	      check_remalloced_chunk (av, victim, nb); // 另一个检查
#if USE_TCACHE
	      /* While we're here, if we see other chunks of the same size,
		 stash them in the tcache.  */
	      size_t tc_idx = csize2tidx (nb);
	      if (tcache && tc_idx < mp_.tcache_bins)
		{
		  mchunkptr tc_victim;

		  /* While bin not empty and tcache not full, copy chunks.  */
           /* 将 fastbin 拆到对应大小的 tcache 中 */
		  while (tcache->counts[tc_idx] < mp_.tcache_count
			 && (tc_victim = *fb) != NULL)
		    {
		      if (__glibc_unlikely (misaligned_chunk (tc_victim)))
			malloc_printerr ("malloc(): unaligned fastbin chunk detected 3");
		      if (SINGLE_THREAD_P)
			*fb = REVEAL_PTR (tc_victim->fd);
		      else
			{
			  REMOVE_FB (fb, pp, tc_victim);
			  if (__glibc_unlikely (tc_victim == NULL))
			    break;
			}
		      tcache_put (tc_victim, tc_idx);
		    }
		}
#endif
	      void *p = chunk2mem (victim); // 指针向后移动 0x10
	      alloc_perturb (p, bytes);
	      return p;
	    }
	}
}
```

### smallbin

`fastbin`过后就是`smallbin`

```c
/*
     If a small request, check regular bin.  Since these "smallbins"
     hold one size each, no searching within bins is necessary.
     (For a large request, we need to wait until unsorted chunks are
     processed to find best fit. But for small ones, fits are exact
     anyway, so we can check now, which is faster.)
   */

  if (in_smallbin_range (nb))
    {
      idx = smallbin_index (nb); // 获取 smallbin 索引
      bin = bin_at (av, idx); // 获取 smallbin chunk 指针

      if ((victim = last (bin)) /* 取最后一个 chunk */ != bin) // victim 等于 bin 则说明smallbin为空
        {
          bck = victim->bk;
	  if (__glibc_unlikely (bck->fd != victim)) // 检查 last chunk -> bk -> fd == last chunk
	    malloc_printerr ("malloc(): smallbin double linked list corrupted");
          set_inuse_bit_at_offset (victim, nb); // 设置 victim 的 inuse 位
          /* 取出 victim 修改链表 */
          bin->bk = bck;
          bck->fd = bin;

          if (av != &main_arena)
	    set_non_main_arena (victim);
          check_malloced_chunk (av, victim, nb);
#if USE_TCACHE
	  /* While we're here, if we see other chunks of the same size,
	     stash them in the tcache.  */
      /* 同 fastbin , 将符合大小的 smallbin 塞入 tcache */
	  size_t tc_idx = csize2tidx (nb);
	  if (tcache && tc_idx < mp_.tcache_bins)
	    {
	      mchunkptr tc_victim;

	      /* While bin not empty and tcache not full, copy chunks over.  */
	      while (tcache->counts[tc_idx] < mp_.tcache_count
		     && (tc_victim = last (bin)) != bin)
		{
		  if (tc_victim != 0)
		    {
		      bck = tc_victim->bk;
		      set_inuse_bit_at_offset (tc_victim, nb);
		      if (av != &main_arena)
			set_non_main_arena (tc_victim);
		      bin->bk = bck;
		      bck->fd = bin;

		      tcache_put (tc_victim, tc_idx);
	            }
		}
	    }
#endif
          void *p = chunk2mem (victim);
          alloc_perturb (p, bytes);
          return p;
        }
    }
```

### after_smallbin

在取出`larginbin`之前，malloc 还对`fastbin`中的一些碎片进行了合并。

```c
/*
     If this is a large request, consolidate fastbins before continuing.
     While it might look excessive to kill all fastbins before
     even seeing if there is space available, this avoids
     fragmentation problems normally associated with fastbins.
     Also, in practice, programs tend to have runs of either small or
     large requests, but less often mixtures, so consolidation is not
     invoked all that often in most programs. And the programs that
     it is called frequently in otherwise tend to fragment.
   */

  else
    {
      idx = largebin_index (nb);
      if (atomic_load_relaxed (&av->have_fastchunks)) // 如果 arena 中含有 fastchunk 便进行碎片整理。
        malloc_consolidate (av);
    }
```

#### malloc_consolidate()

定义在`malloc.c`的[#4704](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD#l4704)

```c
/*
  ------------------------- malloc_consolidate -------------------------

  malloc_consolidate is a specialized version of free() that tears
  down chunks held in fastbins.  Free itself cannot be used for this
  purpose since, among other things, it might place chunks back onto
  fastbins.  So, instead, we need to use a minor variant of the same
  code.
*/

static void malloc_consolidate(mstate av)
{
  mfastbinptr*    fb;                 /* current fastbin being consolidated */
  mfastbinptr*    maxfb;              /* last fastbin (for loop control) */
  mchunkptr       p;                  /* current chunk being consolidated */
  mchunkptr       nextp;              /* next chunk to consolidate */
  mchunkptr       unsorted_bin;       /* bin header */
  mchunkptr       first_unsorted;     /* chunk to link to */

  /* These have same use as in free() */
  mchunkptr       nextchunk;
  INTERNAL_SIZE_T size;
  INTERNAL_SIZE_T nextsize;
  INTERNAL_SIZE_T prevsize;
  int             nextinuse;

  atomic_store_relaxed (&av->have_fastchunks, false);

  unsorted_bin = unsorted_chunks(av);

  /*
    Remove each chunk from fast bin and consolidate it, placing it
    then in unsorted bin. Among other reasons for doing this,
    placing in unsorted bin avoids needing to calculate actual bins
    until malloc is sure that chunks aren't immediately going to be
    reused anyway.
  */
  /* 从第一个 chunk 开始循环，合并所有chunk */
  maxfb = &fastbin (av, NFASTBINS - 1);
  fb = &fastbin (av, 0);
  do {
    p = atomic_exchange_acq (fb, NULL);
    if (p != 0) {
      do {
	{
	  if (__glibc_unlikely (misaligned_chunk (p))) // 指针必须得对齐
	    malloc_printerr ("malloc_consolidate(): "
			     "unaligned fastbin chunk detected");

	  unsigned int idx = fastbin_index (chunksize (p));
	  if ((&fastbin (av, idx)) != fb) // fastbin chunk 检查
	    malloc_printerr ("malloc_consolidate(): invalid chunk size");
	}

	check_inuse_chunk(av, p);
	nextp = REVEAL_PTR (p->fd);

	/* Slightly streamlined version of consolidation code in free() */
	size = chunksize (p);
	nextchunk = chunk_at_offset(p, size);
	nextsize = chunksize(nextchunk);

	if (!prev_inuse(p)) {
	  prevsize = prev_size (p);
	  size += prevsize;
	  p = chunk_at_offset(p, -((long) prevsize));
      /* 检查 prevsize 和 size 是否相等 */
	  if (__glibc_unlikely (chunksize(p) != prevsize))
	    malloc_printerr ("corrupted size vs. prev_size in fastbins");
	  unlink_chunk (av, p); // 将 prev chunk unlink
	}

	if (nextchunk != av->top) {
	  nextinuse = inuse_bit_at_offset(nextchunk, nextsize);

	  if (!nextinuse) {
	    size += nextsize;
	    unlink_chunk (av, nextchunk);
	  } else
	    clear_inuse_bit_at_offset(nextchunk, 0);

       /* 在链表头部插入 p */
	  first_unsorted = unsorted_bin->fd;
	  unsorted_bin->fd = p;
	  first_unsorted->bk = p;

	  if (!in_smallbin_range (size)) {
	    p->fd_nextsize = NULL;
	    p->bk_nextsize = NULL;
	  }

	  set_head(p, size | PREV_INUSE);
	  p->bk = unsorted_bin;
	  p->fd = first_unsorted;
	  set_foot(p, size);
	}
    // next chunk = av -> top, 合并到topchunk中
	else {
	  size += nextsize;
	  set_head(p, size | PREV_INUSE);
	  av->top = p;
	}

      } while ( (p = nextp) != 0);

    }
  } while (fb++ != maxfb);
}
```

首先将与该块相邻的下一块的 PREV_INUSE 置为 1。如果相邻的上一块未被占用，则合并，再判断相邻的下一块是否被占用，若未被占用，则合并。不管是否完成合并，都会把`fastbin`或者完成合并以后的 bin 放到`unsortbin`中。（如果与`top chunk`相邻，则合并到`top chunk`中）

### iteration

~~真长啊都，脑阔晕了~~

```c
/*
     Process recently freed or remaindered chunks, taking one only if
     it is exact fit, or, if this a small request, the chunk is remainder from
     the most recent non-exact fit.  Place other traversed chunks in
     bins.  Note that this step is the only place in any routine where
     chunks are placed in bins.

     The outer loop here is needed because we might not realize until
     near the end of malloc that we should have consolidated, so must
     do so and retry. This happens at most once, and only when we would
     otherwise need to expand memory to service a "small" request.
   */

#if USE_TCACHE
  INTERNAL_SIZE_T tcache_nb = 0;
  size_t tc_idx = csize2tidx (nb);
  if (tcache && tc_idx < mp_.tcache_bins)
    tcache_nb = nb;
  int return_cached = 0; // 标记合适大小的 chunk 被放入 tcache

  tcache_unsorted_count = 0; // 处理过的 unsorted chunk 数量
```

循环， 将`unsorted_bin`放入对应的`bin`中

```c
  for (;; )
    {
      int iters = 0;
      while ((victim = unsorted_chunks (av)->bk) != unsorted_chunks (av)) // 是否取尽所有 unsorted chunks
        {
          bck = victim->bk;
          size = chunksize (victim);
          mchunkptr next = chunk_at_offset (victim, size);
          // 一些安全检查（可恶）
          if (__glibc_unlikely (size <= CHUNK_HDR_SZ)
              || __glibc_unlikely (size > av->system_mem))
            malloc_printerr ("malloc(): invalid size (unsorted)");
          if (__glibc_unlikely (chunksize_nomask (next) < CHUNK_HDR_SZ)
              || __glibc_unlikely (chunksize_nomask (next) > av->system_mem))
            malloc_printerr ("malloc(): invalid next size (unsorted)");
          if (__glibc_unlikely ((prev_size (next) & ~(SIZE_BITS)) != size))
            malloc_printerr ("malloc(): mismatching next->prev_size (unsorted)");
          if (__glibc_unlikely (bck->fd != victim)
              || __glibc_unlikely (victim->fd != unsorted_chunks (av)))
            malloc_printerr ("malloc(): unsorted double linked list corrupted");
          if (__glibc_unlikely (prev_inuse (next)))
            malloc_printerr ("malloc(): invalid next->prev_inuse (unsorted)");

          /*
             If a small request, try to use last remainder if it is the
             only chunk in unsorted bin.  This helps promote locality for
             runs of consecutive small requests. This is the only
             exception to best-fit, and applies only when there is
             no exact fit for a small chunk.
           */


          if (in_smallbin_range (nb) && // 在 smallbin 范围内
              bck == unsorted_chunks (av) && // unsorted_bin 只有一个 chunk
              victim == av->last_remainder && // 为 last_remainder
              (unsigned long) (size) > (unsigned long) (nb + MINSIZE)) // size 大于 nb + MINSIZE , 即 chunk 拿走 nb 的内存后仍能成为一个chunk
            {
              /* split and reattach remainder */
              remainder_size = size - nb;
              remainder = chunk_at_offset (victim, nb); // 剩余的 remainder
              unsorted_chunks (av)->bk = unsorted_chunks (av)->fd = remainder; // 重新构建 unsorted_bin 链表
              av->last_remainder = remainder;
              remainder->bk = remainder->fd = unsorted_chunks (av);
              if (!in_smallbin_range (remainder_size))
                {
                  remainder->fd_nextsize = NULL;
                  remainder->bk_nextsize = NULL;
                }

              set_head (victim, nb | PREV_INUSE |
                        (av != &main_arena ? NON_MAIN_ARENA : 0)); // nb 的标志位
              set_head (remainder, remainder_size | PREV_INUSE); // remainder的标志位
              set_foot (remainder, remainder_size);

              check_malloced_chunk (av, victim, nb);
              void *p = chunk2mem (victim);
              alloc_perturb (p, bytes);
              return p; // 返回 nb
            }

          // 妈妈滴，又检查。
          /* remove from unsorted list */
          if (__glibc_unlikely (bck->fd != victim))
            malloc_printerr ("malloc(): corrupted unsorted chunks 3");

          // 取出头部的 chunk
          unsorted_chunks (av)->bk = bck;
          bck->fd = unsorted_chunks (av);

          /* Take now instead of binning if exact fit */

          if (size == nb)
            {
              // 设置标记位
              set_inuse_bit_at_offset (victim, size);
              if (av != &main_arena)
		set_non_main_arena (victim);
#if USE_TCACHE
	      /* Fill cache first, return to user only if cache fills.
		 We may return one of these chunks later.  */
	      if (tcache_nb
		  && tcache->counts[tc_idx] < mp_.tcache_count)
		{
           // 把 victim 丢到 tcache 里，而不是返回
           // 因为大多数情况下，刚被需要的大小有更大的概率被继续需要，所以就把相同大小的 chunk 丢进 tcache 中
		  tcache_put (victim, tc_idx);
		  return_cached = 1;
		  continue;
		}
	      else
		{
#endif
              check_malloced_chunk (av, victim, nb);
              void *p = chunk2mem (victim);
              alloc_perturb (p, bytes);
              return p;
#if USE_TCACHE
		}
#endif
            }

          /* place chunk in bin */

          if (in_smallbin_range (size)) // 放到 small bin 里
            {
              victim_index = smallbin_index (size);
              bck = bin_at (av, victim_index);
              fwd = bck->fd;
            }
          else
            {
              victim_index = largebin_index (size);
              bck = bin_at (av, victim_index);
              fwd = bck->fd;

              /* maintain large bins in sorted order */
              if (fwd != bck) // largin 不为空
                {
                  /* Or with inuse bit to speed comparisons */
                  size |= PREV_INUSE; // PREV_INUSE 置 1
                  /* if smaller than smallest, bypass loop below */
                  assert (chunk_main_arena (bck->bk));
                  /* 最小直接插入 large bin 尾部 */
                  if ((unsigned long) (size)
		      < (unsigned long) chunksize_nomask (bck->bk))
                    {
                      fwd = bck;
                      bck = bck->bk;

                      victim->fd_nextsize = fwd->fd;
                      victim->bk_nextsize = fwd->fd->bk_nextsize;
                      fwd->fd->bk_nextsize = victim->bk_nextsize->fd_nextsize = victim;
                    }
                  else
                    {
                      assert (chunk_main_arena (fwd));
                      /* 找到第一个不大于 victim 的chunk */
                      while ((unsigned long) size < chunksize_nomask (fwd))
                        {
                          fwd = fwd->fd_nextsize;
			  assert (chunk_main_arena (fwd));
                        }

                      if ((unsigned long) size
			  == (unsigned long) chunksize_nomask (fwd))
                        /* 如果一样大就插到 fwd 的下一个的chunk, 不用加入 nextsize 减少计算 */
                        /* Always insert in the second position.  */
                        fwd = fwd->fd;
                      else
                        {
                          /* 否则插入到 fwd 前面，添加 nextsize */
                          victim->fd_nextsize = fwd;
                          victim->bk_nextsize = fwd->bk_nextsize;
                          if (__glibc_unlikely (fwd->bk_nextsize->fd_nextsize != fwd))
                            malloc_printerr ("malloc(): largebin double linked list corrupted (nextsize)");
                          fwd->bk_nextsize = victim;
                          victim->bk_nextsize->fd_nextsize = victim;
                        }
                      bck = fwd->bk;
                      if (bck->fd != fwd)
                        malloc_printerr ("malloc(): largebin double linked list corrupted (bk)");
                    }
                }
              else // large bin 为空
                victim->fd_nextsize = victim->bk_nextsize = victim;
            }

          // 插入链表
          mark_bin (av, victim_index);
          victim->bk = bck;
          victim->fd = fwd;
          fwd->bk = victim;
          bck->fd = victim;

#if USE_TCACHE
      /* If we've processed as many chunks as we're allowed while
	 filling the cache, return one of the cached ones.  */
      // 如果 tcache 满了从 tcache 中拿 chunk
      ++tcache_unsorted_count;
      if (return_cached
	  && mp_.tcache_unsorted_limit > 0
	  && tcache_unsorted_count > mp_.tcache_unsorted_limit)
	{
	  return tcache_get (tc_idx);
	}
#endif

#define MAX_ITERS       10000
          if (++iters >= MAX_ITERS)
            break;
        }

#if USE_TCACHE
      /* If all the small chunks we found ended up cached, return one now.  */
      // while 循环结束后， 从 tcache 里拿 chunk
      if (return_cached)
	{
	  return tcache_get (tc_idx);
	}
#endif
```

在`sort chunk`过程中没有找到合适的`chunk`的情况下才在接下里的代码中找合适的`chunk`

```c
       /*
         If a large request, scan through the chunks of current bin in
         sorted order to find smallest that fits.  Use the skip list for this.
       */

      if (!in_smallbin_range (nb))
        {
          bin = bin_at (av, idx);

          /* skip scan if empty or largest chunk is too small */
          // 如果 large bin 非空 且 第一个 chunk 大小 >= nb
          if ((victim = first (bin)) != bin
	      && (unsigned long) chunksize_nomask (victim)
	        >= (unsigned long) (nb))
            {
              // 从最小的开始找，找到第一个 size >= nb 的 chunk
              victim = victim->bk_nextsize;
              while (((unsigned long) (size = chunksize (victim)) <
                      (unsigned long) (nb)))
                victim = victim->bk_nextsize;

              /* Avoid removing the first entry for a size so that the skip
                 list does not have to be rerouted.  */
              // 如果 victim 不是最后一个 且 victim->fd 和它大小一致，返回下一个，因为他不由 nextsize 维护
              if (victim != last (bin)
		  && chunksize_nomask (victim)
		    == chunksize_nomask (victim->fd))
                victim = victim->fd;

              remainder_size = size - nb;
              unlink_chunk (av, victim); // 取出 victim

              /* Exhaust */
              // 如果剩余不足最小 chunk 就给他丢掉
              if (remainder_size < MINSIZE)
                {
                  set_inuse_bit_at_offset (victim, size);
                  if (av != &main_arena)
		    set_non_main_arena (victim);
                }
              /* Split */
              // 否则拆到 unsorted_bin 里
              else
                {
                  remainder = chunk_at_offset (victim, nb);
                  /* We cannot assume the unsorted list is empty and therefore
                     have to perform a complete insert here.  */
                  bck = unsorted_chunks (av);
                  fwd = bck->fd;
		  if (__glibc_unlikely (fwd->bk != bck))
		    malloc_printerr ("malloc(): corrupted unsorted chunks");
                  remainder->bk = bck;
                  remainder->fd = fwd;
                  bck->fd = remainder;
                  fwd->bk = remainder;
                  if (!in_smallbin_range (remainder_size))
                    {
                      remainder->fd_nextsize = NULL;
                      remainder->bk_nextsize = NULL;
                    }
                  set_head (victim, nb | PREV_INUSE |
                            (av != &main_arena ? NON_MAIN_ARENA : 0));
                  set_head (remainder, remainder_size | PREV_INUSE);
                  set_foot (remainder, remainder_size);
                }
              check_malloced_chunk (av, victim, nb);
              void *p = chunk2mem (victim);
              alloc_perturb (p, bytes);
              return p;
            }
        }

      /*
         Search for a chunk by scanning bins, starting with next largest
         bin. This search is strictly by best-fit; i.e., the smallest
         (with ties going to approximately the least recently used) chunk
         that fits is selected.

         The bitmap avoids needing to check that most blocks are nonempty.
         The particular case of skipping all bins during warm-up phases
         when no chunks have been returned yet is faster than it might look.
       */
	  /* 有点没看懂，这部分 */

      ++idx; // 下一个 large bin
      bin = bin_at (av, idx);
	  // 一个 block 就是 32 个连续的 bin，每个 block 有一个 map 来标注对应的 bin 中是否有空闲 chunk
      block = idx2block (idx);
      map = av->binmap[block]; // 一个 int , 32bit, 有空闲 chunk 的 bin 的 bit 为 1，否则为 0
      bit = idx2bit (idx); // 将 idx 对应的 bit 设置为 1，其他为 0

      for (;; )
        {
          /* Skip rest of block if there are no more set bits in this block.  */
          /* bit > map 则说明该 block 中的 bin 中的 chunk 空闲块都比所需的 chunk 小。直接跳过循环。 */
          if (bit > map || bit == 0)
            {
              do
                {
                  // 如果一直没有可用的 block 则就直接使用 top chunk
                  if (++block >= BINMAPSIZE) /* out of bins */
                    goto use_top;
                }
              while ((map = av->binmap[block]) == 0);　// 该 block 没有空闲 chunk

              // 找到当前 block 的第一个 bin
              bin = bin_at (av, (block << BINMAPSHIFT));
              bit = 1;
            }

          /* Advance to bin with set bit. There must be one. */
          // 当前的 bin 不可用时，搜寻下一个 bin
          while ((bit & map) == 0)
            {
              bin = next_bin (bin);
              bit <<= 1; // 使用下一个 chunk
              assert (bit != 0);
            }

          /* Inspect the bin. It is likely to be non-empty */
          // 从最小的一个 chunk 开始
          victim = last (bin);

          /*  If a false alarm (empty bin), clear the bit. */
          // bin 是空的话更新 binmap 的值，找下一个 bin
          if (victim == bin)
            {
              av->binmap[block] = map &= ~bit; /* Write through */
              bin = next_bin (bin);
              bit <<= 1;
            }

          else
            {
              // 非空就取出 chunk 并且进行拆分和拼接
              size = chunksize (victim);

              /*  We know the first chunk in this bin is big enough to use. */
              // 第一个 chunk （最大的一个）已经够用了
              assert ((unsigned long) (size) >= (unsigned long) (nb));

              remainder_size = size - nb;

              /* unlink */
              unlink_chunk (av, victim);

              /* Exhaust */
              if (remainder_size < MINSIZE)
                {
                  set_inuse_bit_at_offset (victim, size);
                  if (av != &main_arena)
		    set_non_main_arena (victim);
                }

              /* Split */
              else
                {
                  remainder = chunk_at_offset (victim, nb);

                  /* We cannot assume the unsorted list is empty and therefore
                     have to perform a complete insert here.  */
                  bck = unsorted_chunks (av);
                  fwd = bck->fd;
		  if (__glibc_unlikely (fwd->bk != bck))
		    malloc_printerr ("malloc(): corrupted unsorted chunks 2");
                  remainder->bk = bck;
                  remainder->fd = fwd;
                  bck->fd = remainder;
                  fwd->bk = remainder;

                  /* advertise as last remainder */
                  if (in_smallbin_range (nb))
                    av->last_remainder = remainder;
                  if (!in_smallbin_range (remainder_size))
                    {
                      remainder->fd_nextsize = NULL;
                      remainder->bk_nextsize = NULL;
                    }
                  set_head (victim, nb | PREV_INUSE |
                            (av != &main_arena ? NON_MAIN_ARENA : 0));
                  set_head (remainder, remainder_size | PREV_INUSE);
                  set_foot (remainder, remainder_size);
                }
              check_malloced_chunk (av, victim, nb);
              void *p = chunk2mem (victim);
              alloc_perturb (p, bytes);
              return p;
            }
        }
```

```c
    use_top:
      /*
         If large enough, split off the chunk bordering the end of memory
         (held in av->top). Note that this is in accord with the best-fit
         search rule.  In effect, av->top is treated as larger (and thus
         less well fitting) than any other available chunk since it can
         be extended to be as large as necessary (up to system
         limitations).

         We require that av->top always exists (i.e., has size >=
         MINSIZE) after initialization, so if it would otherwise be
         exhausted by current request, it is replenished. (The main
         reason for ensuring it exists is that we may need MINSIZE space
         to put in fenceposts in sysmalloc.)
       */

      victim = av->top;
      size = chunksize (victim);

      if (__glibc_unlikely (size > av->system_mem))
        malloc_printerr ("malloc(): corrupted top size");
      // top chunk 拆 nb 之后 还能独立成为一个 chunk 的话
      if ((unsigned long) (size) >= (unsigned long) (nb + MINSIZE))
        {
          remainder_size = size - nb;
          remainder = chunk_at_offset (victim, nb);
          av->top = remainder;
          set_head (victim, nb | PREV_INUSE |
                    (av != &main_arena ? NON_MAIN_ARENA : 0));
          set_head (remainder, remainder_size | PREV_INUSE);

          check_malloced_chunk (av, victim, nb);
          void *p = chunk2mem (victim);
          alloc_perturb (p, bytes);
          return p;
        }

      /* When we are using atomic ops to free fast chunks we can get
         here for all block sizes.  */
	  // 不够拆, 还有 fastbin 的话就合并 fastbin
      else if (atomic_load_relaxed (&av->have_fastchunks))
        {
          malloc_consolidate (av);
          /* restore original bin index */
          if (in_smallbin_range (nb))
            idx = smallbin_index (nb);
          else
            idx = largebin_index (nb);
        }

      /*
         Otherwise, relay to handle system-dependent cases
       */
	  // 否则，调用 sysmalloc 再向操作系统请求内存
      else
        {
          void *p = sysmalloc (nb, av);
          if (p != NULL)
            alloc_perturb (p, bytes);
          return p;
        }
    }
}
```

# 总结

浅偷一张图，我觉得总结全了。

![img](https://oss.nova.gal/img/20210928234156-9c2ced00-2072-1.png)
