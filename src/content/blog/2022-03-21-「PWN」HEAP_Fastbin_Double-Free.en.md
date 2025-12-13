---
title: 「PWN」HEAP - Fastbin - Double Free
description: 这篇博客文章由nova撰写，主要讨论了在PWN攻防中如何利用Fastbin的Double Free漏洞进行攻击。
pubDate: 2022-03-21
tags:
- CTF
- Pwn
authors:
- nova

---
Double Free is an easily exploitable vulnerability in the Fastbin, let's examine it.

# Principle

The overall principle is quite simple, as explained on [ctf-wiki](https://ctf-wiki.org/pwn/linux/user-mode/heap/ptmalloc2/fastbin-attack/#fastbin-double-free). The main idea is that due to the way the fastbin checks are implemented, it only checks the head of the linked list and does not clear `prev_in_use` when freeing a chunk.

There is relevant source code available in the link provided as well.

{/* truncate */}

# Testing

We will use the demonstrations provided in [how2heap](https://github.com/shellphish/how2heap) using [fastbin_dup.c](https://github.com/shellphish/how2heap/blob/master/glibc_2.31/fastbin_dup.c) and [fastbin_dup_into_stack.c](https://github.com/shellphish/how2heap/blob/master/glibc_2.23/fastbin_dup_into_stack.c).

## fastbin_dup.c

To facilitate the process, we disable ASLR (Address Space Layout Randomization).

```sh
gcc -g -m64 -no-pie fastbin_dup.c -o fastbin_dup
```

In this example, the tcache is prefilled to facilitate operations in the fastbin.

![prefill of tcache](https://oss.nova.gal/img/image-20220321115447065.png)

Set a breakpoint at `line 20` and step through the execution to observe the process.

![image-20220321140323823](https://oss.nova.gal/img/image-20220321140323823.png)

Initially, it allocates three chunks and frees the first one. You can see that the first chunk `a` is now in the fastbins.

![image-20220321141109457](https://oss.nova.gal/img/image-20220321141109457.png)

When we free `a` again at this point, the program crashes because the fastbin check verifies if the head matches the chunk being freed.

The bypass method is straightforward - free another chunk before freeing `a`. Jump to `line 40` to observe the operation.

![image-20220321141752410](https://oss.nova.gal/img/image-20220321141752410.png)

The current linked list structure can be referred to in `ctf-wiki` ![img](https://oss.nova.gal/img/fastbin_free_chunk3.png)

Next, we allocate again. Based on the allocation mechanism, we know that it will first allocate from the head of the fastbin.

![image-20220321142120620](https://oss.nova.gal/img/image-20220321142120620.png)

![image-20220321142135871](https://oss.nova.gal/img/image-20220321142135871.png)

![image-20220321142159911](https://oss.nova.gal/img/image-20220321142159911.png)

You can see that `a` and `c` now point to the same chunk.

## fastbin_dup_into_stack.c

Similarly, we disable ASLR and use `glibc-2.23` as the dynamic linker.

```sh
gcc -g -m64 -no-pie fastbin_dup_into_stack.c -o fastbin_dup_into_stack
patchelf --set-rpath /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ --set-interpreter /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ld-2.23.so fastbin_dup_into_stack
```

Now that we understand how Double Free works, let's see how to exploit it using this file.

Similar to [fastbin_dup.c](#fastbin_dup.c), it allocates 3 chunks. Jump to line 34 to observe the process after Double Free is completed.

A new chunk `d` is allocated, which takes the chunk indicated by `a`. At this moment, the chunk indicated by `a` is a controllable fastbin chunk, allowing potential exploitation.

Note the following code snippet:

```c
	stack_var = 0x20;

	fprintf(stderr, "Now, we overwrite the first 8 bytes of the data at %p to point right before the 0x20.\n", a);
	*d = (unsigned long long) (((char*)&stack_var) - sizeof(d));
```

Setting `stack_var` to `0x20` is to forge a `fake_chunk`, as the size consistency is required during checks.

![image-20220321144456020](https://oss.nova.gal/img/image-20220321144456020.png)

The line `*d = (unsigned long long) (((char*)&stack_var) - sizeof(d));` modifies the contents of `d` to point to `&stack_var - 8`. This effectively changes the chunk that `d` represents to still be in the fastbin, with the data in that location representing `fd`.

![image-20220321143928311](https://oss.nova.gal/img/image-20220321143928311.png)

It changes the content of `d` to `&stack_var - 8`, pointing to an address on the stack represented by the `fd` at `0x40500`.

Next, by obtaining this chunk, arbitrary writes can be performed.

# Real-World Application

We have taken two basic template challenges for experimentation.

## Samsara

First, make necessary preparations.

```sh
patchelf --set-rpath /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ --set-interpreter /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ld-2.23.so samsara
```

![image-20220321150904705](https://oss.nova.gal/img/image-20220321150904705.png)

By analyzing, we can understand the functions `add`, `delete`, and `edit`. Pay attention to `lair` and `kingdom`.

Observing the menu, we can see that `lair` is very close to `pwn`.

![image-20220321151231353](https://oss.nova.gal/img/image-20220321151231353.png)

By obtaining the address of `lair`, we can also naturally get the address of `pwn`.

Exploit code has been provided for the demonstration.

## ACTF-2019_Message

Slightly more complex, with ASLR fully enabled.

Observing the vulnerability during `delete`, the program fails to zero out the pointers when freeing, only zeroing the size location.

![image-20220321160539186](https://oss.nova.gal/img/image-20220321160539186.png)

Based on the `show` and `edit` functions, if we can modify `array[4 * idx + 2]`, we can achieve arbitrary read/write operations.

The key lies in creating a `fake chunk` on the `array`, following the previous approach.

Set a breakpoint at `line 34` after Double Free is completed.

The chunk `3` content/fd can be pointed to the `array`, allowing for the creation of a `fake chunk`.

Ensure that the size of the first chunk is larger by `0x10` than the other chunks.

```python
add(0x20, b'aaaaaa')  # 0
add(0x10, b'aaaaaa')
add(0x10, b'aaaaaa')
delete(1)
delete(2)
delete(1)
add(0x10, p64(0x602060-0x08))  # 3
```

This sets up a `fake_chunk` at `0x602060-0x08`. Now, the chunk size at `0x602060` can be set, and the chunk address of `0` can be modified based on the `fake_chunk`.

Continue with the alloc and free operations to create a `fake chunk`.

![image-20220321165333289](https://oss.nova.gal/img/image-20220321165333289.png)

Arbitrary reads and writes are now possible. Retrieve the `libc_base` value next.

```python
add(0x10, p64(elf.got['puts']))  # 6 -> fake

puts_addr = u64(show(0).ljust(8, b'\x00'))
libc_base = puts_addr - libc.sym['puts']
print(hex(libc_base))
```

With the `libc_base` obtained, consider how to call `system`. Due to the `FULL RELRO` protection, modifying the `GOT table` is challenging. Using `__free_hook()` appears to be the most suitable option.

Update the `6` content to point to `__free_hook()`, and modify the `0` content to `system()` to achieve the modification.

![__free_hook() has write permissions](https://oss.nova.gal/img/image-20220321173758716.png)

```python
system = libc_base + libc.sym['system']
free_hook = libc_base + libc.sym['__free_hook']
print(hex(free_hook))

edit(6, p64(free_hook))
edit(0, p64(system))
```

Continue by creating a chunk containing `/bin/sh` and freeing it to obtain a shell.

Exploit:

```python
# Exploit code provided for demonstration, adapt as needed
# Source: https://github.com/shellphish/how2heap
```

{/* AI */}
