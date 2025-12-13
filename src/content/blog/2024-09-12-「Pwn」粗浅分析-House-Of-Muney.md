---
title: 「Pwn」粗浅分析 House Of Muney
description: 前几天 ZBR 发了这个 repo，我寻思没听过，看着攻击能力还挺强的，于是浅浅分析一下。
pubDate: 2024-09-19
updatedDate: 2024-09-19
tags:
- Pwn
- heap
authors:
- nova
---

前几天 ZBR 发了这个 repo，我寻思没听过，看着攻击能力还挺强的，于是浅浅分析一下。

简单来说，这个 house 能做这样一件事：在没有泄露的情况下绕过 ASLR 实现代码执行。

而它的利用条件如下：

- Partial RELRO / No RELRO —— 它需要修改 .dynsym 去修改 dlresolve 结果
- 可以分配较大的堆 —— 要使其由 MMAP 分配
- 能够改写这个堆的 prev_size 和 size 字段，使得 IS_MMAPED 位被改写



本文将基于 2.31 的环境，复现 Docker 可以使用下面的 Dockerfile：

```dockerfile
FROM ubuntu:20.04

ENV DEBIAN_FRONTEND noninteractive

# Update
RUN apt-get update -y && apt-get install socat -y gdb vim tmux python3 python3-pip 

# General things needed for pwntools and pwndbg to run
RUN apt-get install git build-essential libssl-dev libffi-dev libxml2-dev libxslt1-dev zlib1g-dev patchelf python3-dev -y 

RUN pip3 install pwn

# Install pwndbg
RUN git clone https://github.com/pwndbg/pwndbg && cd pwndbg && ./setup.sh && cd ../ 

RUN echo "set auto-load safe-path /" >> /root/.gdbinit

# Challenge files to ADD
RUN git clone https://github.com/mdulin2/house-of-muney 

# Fixes the loader and recompiles the binary for us :) 
RUN cd house-of-muney && ./compile.sh
```



<!--truncate-->

## 前置知识

### mmap / munmap

在 `malloc` 时，如果 malloc 的大小大于 `mmap_threshold` 的话，就会利用 `mmap` 系统调用，以页为单位，向上取整拿一些内存出来

这个 `mmap_threshold` 在 x86_64 上一般定义如下，也就是 128KB

```c
#define DEFAULT_MMAP_THRESHOLD_MIN (128 * 1024)
#define DEFAULT_MMAP_THRESHOLD DEFAULT_MMAP_THRESHOLD_MIN

static struct malloc_par mp_ =
{
  .mmap_threshold = DEFAULT_MMAP_THRESHOLD,
};
```



```c title="malloc/malloc.c"
static void *
sysmalloc (INTERNAL_SIZE_T nb, mstate av)
{
  ...


  /*
     If have mmap, and the request size meets the mmap threshold, and
     the system supports mmap, and there are few enough currently
     allocated mmapped regions, try to directly map this request
     rather than expanding top.
   */

  if (av == NULL
      || ((unsigned long) (nb) >= (unsigned long) (mp_.mmap_threshold)
	  && (mp_.n_mmaps < mp_.n_mmaps_max)))
    {
      char *mm;           /* return value from mmap call*/

    try_mmap:
      /*
         Round up size to nearest page.  For mmapped chunks, the overhead
         is one SIZE_SZ unit larger than for normal chunks, because there
         is no following chunk whose prev_size field could be used.

         See the front_misalign handling below, for glibc there is no
         need for further alignments unless we have have high alignment.
       */
      if (MALLOC_ALIGNMENT == 2 * SIZE_SZ)
        size = ALIGN_UP (nb + SIZE_SZ, pagesize);
      else
        size = ALIGN_UP (nb + SIZE_SZ + MALLOC_ALIGN_MASK, pagesize);
      tried_mmap = true;

      /* Don't try if size wraps around 0 */
      if ((unsigned long) (size) > (unsigned long) (nb))
        {
          mm = (char *) (MMAP (0, size, PROT_READ | PROT_WRITE, 0));
          
          if (mm != MAP_FAILED)
            {
              ...
                  p = (mchunkptr) mm;
		  set_prev_size (p, 0);
                  set_head (p, size | IS_MMAPPED);
                }
```

mm 之后，他会设置 chunk 的 size 第二位 IS_MMAPED 为 1

![image-20240919012047253](https://cdn.nova.gal/img/image-20240919012047253.png)

实际分配后我们可以发现，它的位置就在 libc.so.6 的高地址一点点，那么假如说 `0x7f98000~0x7fc1000` 这个大小不够我们分配，它就会反之从 `anon_7fff7da2` 那里往低地址分配。而显然这个地址和我们 libc 是紧挨着的，这也就是我们能够不需要 leak 地址的关键。

![image-20240919021930678](https://cdn.nova.gal/img/image-20240919021930678.png)

那么对于这种 mmaped_chunk，自然 free 也会有一套额外逻辑

```c title="malloc/malloc.c"

static void
munmap_chunk (mchunkptr p)
{
  size_t pagesize = GLRO (dl_pagesize);
  INTERNAL_SIZE_T size = chunksize (p);
    ...

  uintptr_t mem = (uintptr_t) chunk2mem (p);
  uintptr_t block = (uintptr_t) p - prev_size (p);
  size_t total_size = prev_size (p) + size;
    ...
  if (__glibc_unlikely ((block | total_size) & (pagesize - 1)) != 0
      || __glibc_unlikely (!powerof2 (mem & (pagesize - 1))))
    malloc_printerr ("munmap_chunk(): invalid pointer");
    ...

  __munmap ((char *) block, total_size);
}
```

完整性检查只会检查这个 chunk 是否是对齐的，却完全没有检查 prevsize 位以及 size，也就是说我们显然能够 munmap 任意大小，或者是任意地址符合条件的 chunk

### symbol resolving

如果你熟悉 ret2dlresolve，那么你对于这部分一定不陌生。

简单来说，ELF 中会存放一些外部库的 PLT 表：例如，你在一个动态链接的代码里使用了 printf，它就会有一个 printf 的 PLT 表项。同时存在的还有对应的 GOT 表项。而 PLT 其实就是一个 GOT 表的指针

在函数调用时，他其实就是进行了这么一个操作：`call *printf@plt`，初始时，GOT 表项并非指向实际函数，而是指向 `printf@plt + 6` 的位置，进行解析流程，解析完成后，GOT 表项就直接指向实际函数。



而在 `plt+6` 的地方，就进行形如下面汇编一样的操作

```assembly
push 0x1;  // 某个数字
jmp PLT[0];
```

`PLT[0] `处则是存的固定的代码

```assembly
push GOT[1];
jmp GOT[2];
```

其中，GOT[2] 存的是 `__dl_runtime_resolve` 的地址，GOT[1] 存的是一个 link_map 结构体，用于取出 `.dynamic` 段地址，从而获取其他段的地址

因此我们可以理解，解析这活它就是干了这么一件事

`__dl_runtime_resolve(GOT[1], SOME_NUMBER)`，而 0x1，0x2 这些，就是由 PLT 表项决定，从而解析出不同的函数。



那么具体的解析过程呢？这里面涉及多个结构体以及多个段，我们不再花费篇幅。

但是简单来说，它通过 `.rel.plt` 段和偏移找到对应的 `Elf32_rel` 结构体（在 64 位下是 `Elf64_rela` 结构体），通过结构体里的 `r_info` 字段找到 symbol index，根据这个 symbol index 在 `.dynsym` 里找到对应的 `Elf32_sym` 结构体，最后根据这个结构体里的 `st_name`，在 `.strtab` 里找到对应的符号名称指针，从而在最后使用 libc 基址加上一定偏移计算出实际地址。



## 实际利用

按照上面说的，我们首先分配两个极大的 chunk 1 和 2，这样 2 会在 1 下面

我们修改 2 的 chunk_size，使其包含 1 + 2 + 我们想要的 libc 界面

![image-20240919023647709](https://cdn.nova.gal/img/image-20240919023647709.png)

![image-20240919023832772](https://cdn.nova.gal/img/image-20240919023832772.png)

可以看到这个 chunk 包含了一部分 libc-2.31.so 的界面，而 free 之后这些界面被回收了

```c
pwndbg> vmmap
LEGEND: STACK | HEAP | CODE | DATA | RWX | RODATA
             Start                End Perm     Size Offset File
          0x3fe000           0x400000 rw-p     2000      0 /home/ctf/challenge/munmap_rewrite
          0x400000           0x401000 r--p     1000   2000 /home/ctf/challenge/munmap_rewrite
          0x401000           0x402000 r-xp     1000   3000 /home/ctf/challenge/munmap_rewrite
          0x402000           0x403000 r--p     1000   4000 /home/ctf/challenge/munmap_rewrite
          0x403000           0x404000 rw-p     1000   4000 /home/ctf/challenge/munmap_rewrite
          0x404000           0x425000 rw-p    21000      0 [heap]
    0x7ffff7e28000     0x7ffff7e38000 r--p    10000  15000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7e38000     0x7ffff7f77000 r-xp   13f000  25000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7f77000     0x7ffff7fbf000 r--p    48000 164000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fbf000     0x7ffff7fc0000 ---p     1000 1ac000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fc0000     0x7ffff7fc3000 r--p     3000 1ac000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fc3000     0x7ffff7fc6000 rw-p     3000 1af000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fc6000     0x7ffff7fcc000 rw-p     6000      0 [anon_7ffff7fc6]
    0x7ffff7fcc000     0x7ffff7fd0000 r--p     4000      0 [vvar]
    0x7ffff7fd0000     0x7ffff7fd2000 r-xp     2000      0 [vdso]
    0x7ffff7fd2000     0x7ffff7fd3000 r--p     1000      0 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7fd3000     0x7ffff7ff3000 r-xp    20000   1000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ff3000     0x7ffff7ffb000 r--p     8000  21000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ffc000     0x7ffff7ffd000 r--p     1000  29000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ffd000     0x7ffff7ffe000 rw-p     1000  2a000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ffe000     0x7ffff7fff000 rw-p     1000      0 [anon_7ffff7ffe]
    0x7ffffffde000     0x7ffffffff000 rw-p    21000      0 [stack]
```

此时，我们在分配一个大于刚才修改后 size 的值的 chunk

可以看到它覆盖了libc 开头的一些段，且原来不可写的地址变为可写了！

```c
LEGEND: STACK | HEAP | CODE | DATA | RWX | RODATA
             Start                End Perm     Size Offset File
          0x3fe000           0x400000 rw-p     2000      0 /home/ctf/challenge/munmap_rewrite
          0x400000           0x401000 r--p     1000   2000 /home/ctf/challenge/munmap_rewrite
          0x401000           0x402000 r-xp     1000   3000 /home/ctf/challenge/munmap_rewrite
          0x402000           0x403000 r--p     1000   4000 /home/ctf/challenge/munmap_rewrite
          0x403000           0x404000 rw-p     1000   4000 /home/ctf/challenge/munmap_rewrite
          0x404000           0x425000 rw-p    21000      0 [heap]
    // highlight-next-line
    0x7ffff7b27000     0x7ffff7e28000 rw-p   301000      0 [anon_7ffff7b27]
    0x7ffff7e28000     0x7ffff7e38000 r--p    10000  15000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7e38000     0x7ffff7f77000 r-xp   13f000  25000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7f77000     0x7ffff7fbf000 r--p    48000 164000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fbf000     0x7ffff7fc0000 ---p     1000 1ac000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fc0000     0x7ffff7fc3000 r--p     3000 1ac000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fc3000     0x7ffff7fc6000 rw-p     3000 1af000 /home/ctf/challenge/2.31/libc-2.31.so
    0x7ffff7fc6000     0x7ffff7fcc000 rw-p     6000      0 [anon_7ffff7fc6]
    0x7ffff7fcc000     0x7ffff7fd0000 r--p     4000      0 [vvar]
    0x7ffff7fd0000     0x7ffff7fd2000 r-xp     2000      0 [vdso]
    0x7ffff7fd2000     0x7ffff7fd3000 r--p     1000      0 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7fd3000     0x7ffff7ff3000 r-xp    20000   1000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ff3000     0x7ffff7ffb000 r--p     8000  21000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ffc000     0x7ffff7ffd000 r--p     1000  29000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ffd000     0x7ffff7ffe000 rw-p     1000  2a000 /home/ctf/challenge/2.31/ld-2.31.so
    0x7ffff7ffe000     0x7ffff7fff000 rw-p     1000      0 [anon_7ffff7ffe]
    0x7ffffffde000     0x7ffffffff000 rw-p    21000      0 [stack]
```

那么接下来我们就可以开始伪造工作了。

值得注意的是，由于映射后内存全部被初始化为 0，因此如果我们仅伪造 Elf64_sym 结构体，将会出错 —— GNU 使用一些哈希操作和 bloom filter 来快速确定是否存在符号，因此，我们还需要重设 `.gnu.hash` 的内容



如何做到？除了啃源码阅读它的原理然后重构外，我们还有另一个方法：gdb 单步，在没有 override 的情况下正常的去调试它，然后获取它们对应的值。

:::info

关于 GNU HASH ELF 的底层原理，你可以看 [这篇](https://blogs.oracle.com/solaris/post/gnu-hash-elf-sections)
:::

略过繁琐的细节，具体来说，我们需要设置这么一些量，它们大多在 `link_map` 结构体中，我们可以通过 GOT[1] 项拿到：

![image-20240919032057600](https://cdn.nova.gal/img/image-20240919032057600.png)

- l_gnu_bitmask
- l_gnu_bucket
- l_gnu_chain_zero
- 需要修改函数的 Elf64_sym 结构体



调试过程大体来说是这样的：我们调用一个函数（例如我们要把 exit 修改为 system，那么我们就调用 exit），然后跟踪它进入 `__dl_fixup` 函数，观察哪些情况下它需要从 map（也就是 link_map 结构体）中拿取变量，那么我们就记录下变量相对于 libc_base 的偏移与变量的值，再在修改后的 libc 对应位置填上对应的值



例如 bitmask，我们在第一次 link_map 值还未空时啥都看不到，第二次循环的时候到这里就有一个值了，那么我们记录这个位置，以及它的值

![image-20240919034149944](https://cdn.nova.gal/img/image-20240919034149944.png)



最后我们伪造这个 Elf64_Sym，至于怎么找，一般就是从 link_map 的 l_info 里找 .symtab，然后去算偏移。在图中我们可以看到，我们左边修改 st_value 为 0x459e7，这是 system 相对 libc 的偏移，因此调用 exit("/bin/sh") 就会触发 system("/bin/sh")

![image-20240919035433900](https://cdn.nova.gal/img/image-20240919035433900.png)

## 总结

这个攻击流程看起来非常的轻松，不过需要我们能够溢出 size 位，且能分配极大的 chunk

我自己尝试的时候，在 2.40 的 arch 上 free 就炸了，应该是 2.38/2.39 新加的 libc got 表保护相关的原因？（不确定）

后面伪造的流程也比较复杂，没有一个自动化或者说系统化的方法。



但总的来说，还是可以设置一些 CTF 谜题的。



## 参考资料

[qualys.com/2020/05/19/cve-2005-1513/remote-code-execution-qmail.txt](https://www.qualys.com/2020/05/19/cve-2005-1513/remote-code-execution-qmail.txt)

[House of Muney - Leakless Heap Exploitation Technique ~ House of Muney - 无泄漏堆利用技术 (maxwelldulin.com)](https://maxwelldulin.com/BlogPost?post=6967456768)

[mdulin2/house-of-muney: Code execution via corrupting mmap malloc chunks with ASLR bypass (github.com)](https://github.com/mdulin2/house-of-muney)
