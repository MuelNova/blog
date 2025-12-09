---
title: 「Rust Kernel」从 0 开始造一个内核
description: 我们会在 [rCore](https://github.com/rcore-os/rCore-Tutorial-v3) 的基础上，完成我们自定义的内核。
pubDate: 2024-09-12
updatedDate: 2024-09-17
tags:
- kernel
- rust
authors:
- nova
---

## 在此之前

我们会在 [rCore](https://github.com/rcore-os/rCore-Tutorial-v3) 的基础上，完成我们自定义的内核。

我们使用 Docker 版本进行开发

即

```bash
make docker
```

你可能需要的一些知识前置：

- 操作系统

- Rust

- RISC-V ISA

<!--truncate-->

## 0x00、How OS Binary Works

简单来说，OS 之所以能作为 OS，就是因为它直接与裸机（Bare-metal）进行交互，而不依赖于任何标准库。

```bash
root@dd6bc06ddb03:/mnt/novaos# rustc --version -v
rustc 1.80.0-nightly (f705de596 2024-04-30)
binary: rustc
commit-hash: f705de59625bb76067a5d102edc1575ff23b8845
commit-date: 2024-04-30
host: x86_64-unknown-linux-gnu
release: 1.80.0-nightly
LLVM version: 18.1.4
```

至于什么是标准库，我觉得可以把它理解为 OS < - > App 之间的再一层抽象，用于在 OS 提供的函数的抽象上再进一步抽象成用户库函数，例如上述里的 host 中的 linux-gnu 的 GNU，就是在 Linux Kernel 上再抽象出一个 libc 来，从而在用户态提前的对一些系统调用进行包装、检查等。

> All problems in computer science can be solved by another level of indirection@David Wheeler

例如 [unix 的 stdio.rs](https://github.com/rust-lang/rust/blob/master/library/std/src/sys/pal/unix/stdio.rs)，以及 [windows 的 stdio.rs](https://github.com/rust-lang/rust/blob/master/library/std/src/sys/pal/windows/stdio.rs)，便是不同系统的不同包装，而在这层之上，还有一层运行时库的包装，例如 `GNU` 和 `musl` 便是两个不同的 runtime library，它们便可能在封装细节上有区别，因此要对它们做分别的规定。



因此，如果我们想要制作一个操作系统，那么我们就不能使用 runtime library，也不能指定操作系统 —— 这也意味着我们不能使用大多数 rust 提供的封装 —— rust 就像是运行时库的再上一层抽象，它把运行时库再进行抽象包装。

幸运的是，rust 作为一门面向操作系统的语言，它还有一个 `core` 库，它是几乎与操作系统无关的，主要用于实现 rust 的一些算术操作、错误处理、迭代器等特征

因此，在开发 rust os 的时候，我们显然需要使用 `#![no_std]` 来禁用 std。



## 0x01、My First Bare-Metal Binary

我们接下来将会基于 riscv 进行开发，因此让我们添加 riscv 的 toolchain 以及设置默认 build config

```bash
rustup target add riscv64gc-unknown-none-elf
mkdir .cargo
echo -e "[build]\ntarget = \"riscv64gc-unknown-none-elf\"" > .cargo/config.toml
```

:::info riscv64gc-unknown-none-elf 代表什么？

我们可以给出另一个 target 名称：`x86_64-unknown-linux-gnu`，现在你应该能够理解了这个名称了

`riscv64gc` 是指令集的名称，它是 riscv 的 64 位，拓展了 GC 两个指令集（i.e. 基本整数指令集 I，再加上整数乘除法指令集 M，原子指令集 A，单双精度浮点数指令集 F/D（IMAFD 共同构成了指令集 G），以及压缩指令拓展集 C）

`unknown` 则代表 CPU 厂商未知

`none` 则代表没有操作系统

`elf` 则代表没有运行时库

:::

现在，按照我们上面所说，我们创建一个新的操作系统

```bash
cargo new --bin novaos
```

我们简单将 `println!` macro 去掉，并增加 `#![no_std]` shebang。

```rust
#![no_std]

fn main() {
}

```

结果报错了，嘿嘿

```bash
   Compiling novaos v0.1.0 (/mnt/novaos)
error: `#[panic_handler]` function required, but not found

error: could not compile `novaos` (bin "novaos") due to 1 previous error
```

提示我们需要一个 panic_handler，但是没得 panic_handler

因此我们显然需要自己实现一个 panic_handler，观察原本的 panic_handler，把它的函数签名拿过来，我们直接循环就完事了 —— 这何尝不是一种 panic handling 呢 —— 只要无限循环不就不会再出错了（笑）

```rust title="src/lang_items.rs"
#[panic_handler]
fn panic_handler(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
```

接下来，继续修改 `main.rs`，添加这个 submodule

```rust title="src/main.rs"
#![no_std]

mod lang_items;

fn main() {
}
```

然后还是报错噢：

```bash
  Compiling novaos v0.1.0 (/mnt/novaos)
error: using `fn main` requires the standard library
  |
  = help: use `#![no_main]` to bypass the Rust generated entrypoint and declare a platform specific entrypoint yourself, usually with `#[no_mangle]`

error: could not compile `novaos` (bin "novaos") due to 1 previous error
```

它和我们说，用 `fn main` 作为入口点就需要一个标准库 —— 回想 GNU 下的运行，它会利用 `__start` 和 `__libc_start_main `来做初始化，包括设定程序 envp envc 以及一些随机值等等，因此这个也是能够理解的。

好嘛，继续改呗，按着他的提示，我们可以写出以下代码

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;

#[no_mangle]
fn _start() -> ! {
    loop {}
}

```

编译成功了！虽然它完全跑不起来，哈哈。

## 0x02、Run My First Bare-Metal Binary (AKA OS) using QEMU

残存着一点点对 [jyy OS](https://jyywiki.cn/OS/2024/) 课程的印象，我们仍然能记得，硬件起电后，固件会设置 PC 到固定的地址找 bootloader，然后 bootloader 做完初始化后又会跳到某个固定的地址起内核。

因此，显然我们需要一个 bootloader 来加载我们的内核，[rustsbi](https://github.com/rustsbi/rustsbi) 可以满足我们的要求，我们可以在 rCore 的 bootloader 文件夹下找到它。



我们简单更新一下我们的内核代码，使其将 `t0` 寄存器一直自加

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;


core::arch::global_asm!(
    ".section .text",
    ".global _start",
    "_start:",
        "li t0, 0",
        "1:",
        "addi t0, t0, 1",
        "j 1b"
);

```

简单编译一下，我们用 `readelf` 观察它的段：

```bash
root@dd6bc06ddb03:/mnt/novaos# readelf -S target/riscv64gc-unknown-none-elf/release/novaos
There are 7 section headers, starting at offset 0x2f0:

Section Headers:
  [Nr] Name              Type             Address           Offset
       Size              EntSize          Flags  Link  Info  Align
  [ 0]                   NULL             0000000000000000  00000000
       0000000000000000  0000000000000000           0     0     0
  [ 1] .text             PROGBITS         0000000000011158  00000158
       0000000000000006  0000000000000000  AX       0     0     2
```

可以看到，.text 段在 0x11158 的位置，一般来说，qemu 会把内核放在 `0x80200000` 的位置，这就导致我们 RustSBI 没有办法启动内核 —— `0x80200000` 的位置只有一些 bytes

![image-20240915165446361](https://oss.nova.gal/img/image-20240915165446361.png)

那么这就是链接器要做的一些事情了，我们使用链接脚本来固定这些位置
```ld title="src/linker.ld"
OUTPUT_ARCH(riscv)
ENTRY(_start)

SECTIONS {
    . = 0x80200000;

    .text : {
        *(.text._start)
        *(.text*)
    }
}
```

这里，`.` 设定了程序起始地址，并且将 `_start` 作为入口点

接着，我们设置 Compiler Flag 使其使用我们的链接脚本

```toml title=".cargo/config.toml"
[build]
target = "riscv64gc-unknown-none-elf"

 [target.riscv64gc-unknown-none-elf]
 rustflags = [
     "-Clink-arg=-Tsrc/linker.ld"
 ]
```

再次编译，啊哈，.text 已经设置好了！

```bash
root@5e14f37e4db2:/mnt/novaos# readelf -S target/riscv64gc-unknown-none-elf/release/novaos
There are 7 section headers, starting at offset 0x1198:

Section Headers:
  [Nr] Name              Type             Address           Offset
       Size              EntSize          Flags  Link  Info  Align
  [ 0]                   NULL             0000000000000000  00000000
       0000000000000000  0000000000000000           0     0     0
  [ 1] .text             PROGBITS         0000000080200000  00001000
       0000000000000006  0000000000000000  AX       0     0     2
```



我们直接编写一个 Makefile 来方便测试一下

```makefile
run:
	@echo "Running the application..."
	qemu-system-riscv64 \
		-M virt \
		-nographic \
		-bios ../bootloader/rustsbi-qemu.bin \
		-kernel target/riscv64gc-unknown-none-elf/release/novaos \
		-s -S

dbg:
	@echo "Debugging the application..."
	riscv64-unknown-elf-gdb \
    	-ex 'file target/riscv64gc-unknown-none-elf/release/novaos' \
    	-ex 'set arch riscv:rv64' \
    	-ex 'target remote localhost:1234'
```

```bash
# Session 1
make run

# Session 2
make dbg
```

一进来我们就到了 `0x1000` 的位置，这是 firmware 相关的东西，紧接着他就会到 `0x80000000` 开始跑 rustsbi 的东西，紧接着，开始跳转！

好吧也不紧接着，我 si 了一会还是没到，直接 `b *0x80200000` 了

![image-20240915171734319](https://oss.nova.gal/img/image-20240915171734319.png)

可以看到也是非常成功，那么我们的内核就搭建完成了，也是可以给这篇文章划上一个句号了...吗？



如果你简单思考一下，你就会发现我们 rust 的作用约等于无，内核还是我用 asm 来写的啊？那我用 python 都能搞一个内核出来，这不骗哥们吗？



好吧，于是怀着这种怨念，我们进入下一部分，让我们的内核有更多功能，支持函数调用。



## 0x03、Now Comes A Stack

既然要实现函数调用，那么一定就会存在栈，才能形成函数调用栈。既然如此，现在让我们来实现一个栈吧。

栈是从上往下增长的。我们在内核启动时首先进行栈的分配工作。

具体而言，我们需要操作这么一件事情：为栈分配一个空间，用 SP 和 FP 指代当前栈帧。分配完栈之后，我们跳转到用 rust 写的函数之中去。

为了一致性，我们可以将汇编代码拆到单独的文件里，在这里，我们首先开了一个初始的栈，然后继续调用 `novaos_start` 函数

```assembly title="src/entry.s"
# text
    .section .text
    .globl _start

_start:
    la sp, boot_stack_top
    call novaos_start

# stack
    .section .stack
    .globl boot_stack_lower_bound
    .globl boot_stack_top

boot_stack_lower_bound:
    .space 1024 * 64
    
boot_stack_top:
```

在 main.rs 里，我们利用 `include_str` 宏将其导入

接着，让我们来编写 `novaos_start` 函数

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    loop {}
}
```

编译尝试一下，但是发现它会因为重定位太远的问题而报错，我没有解决，哪怕我们把 .stack 在 ld 里写死，它也不能设置成功。我估计是不是 .section .stack 不应该被使用

```bash
root@5e14f37e4db2:/mnt/novaos# cat src/linker.ld | grep stack  
        *(.bss.stack)
    stack = 0x80400000;
root@5e14f37e4db2:/mnt/novaos# readelf -S target/riscv64gc-unknown-none-elf/release/novaos | grep stack
  [ 3] .stack            PROGBITS         0000000000000000  00001026
```

现在的解决方案就是不用 .stack，而换一个 .data 之类的，再在 ld 里改成 .stack。注意 ld 有缓存，改完之后最好 cargo clean 一下再 build

从某处偷了一个 long_load 宏，但是还是没办法设置 .stack 的位置

```assembly title="src/entry.s"
# text
    .section .text._start
    .globl _start

_start:
    la sp, boot_stack_top

    call novaos_start

# stack
    .section .data.stack
    .globl boot_stack_lower_bound
    .globl boot_stack_top

boot_stack_lower_bound:
    .space 1024 * 64
    
boot_stack_top:
```

```ld title="src/linker.ld"
OUTPUT_ARCH(riscv)
ENTRY(_start)

SECTIONS {
    . = 0x80200000;

    .text : {
        *(.text._start)
        *(.text*)
    }

    .stack : {
        *(.data.stack)
    }
}
```

![image-20240915201316695](https://oss.nova.gal/img/image-20240915201316695.png)

可以看到，sp 已经被设置到了 .stack 段，虽然好像是段头呢怎么（）

```bash
[ 2] .stack            PROGBITS         0000000080200012  00001012
```

好吧，我们很快的注意到我们 boot_stack_top 的定义在栈空间的低地址处，修复

```assembly title="src/entry.s"
# text
    .section .text._start
    .globl _start

_start:
    la sp, boot_stack_top

    call novaos_start

# stack
    .section .data.stack
    .globl boot_stack_lower_bound

boot_stack_lower_bound:
    .space 1024 * 64

    .globl boot_stack_top
boot_stack_top:
```

再简单对齐一下段表

```ld title="src/linker.ld"
OUTPUT_ARCH(riscv)
ENTRY(_start)

SECTIONS {
    . = 0x80200000;

    .text : {
        *(.text._start)
        *(.text*)
    }

    . = ALIGN(4K);

    .stack : {
        *(.data.stack)
    }
}
```

![image-20240915202006353](https://oss.nova.gal/img/image-20240915202006353.png)

非常好栈初始化，使我心潮澎湃。



接下来，我们尝试再嵌套一个函数，看看结果

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    first_try();
}

fn first_try() -> ! {
    let mut x = 0;
    loop {
        x += 1;
    }
}
```

好的，相信现在 compiler 的优化能力，他被优化成 `j novaos_start` 了。那我们来做一个功能，让他清空 stack 上的内容。



首先，我们拿到 lowerbound 和 top，然后我们对他进行初始化。利用 extern c 可以直接拿到我们 .s 里的一些变量。

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    first_try();
}

fn first_try() -> ! {
    extern "C" {
        static mut boot_stack_lower_bound: usize;
        static mut boot_stack_top: usize;
    }
    unsafe {
        (boot_stack_lower_bound..boot_stack_top).for_each(|addr| {
            core::ptr::write_volatile(addr as *mut u8, 0);
        }
        );
    }
    
    loop {}
}
```

实际跑起来，我们会发现似乎寄存器是设置上了，但是只跑了一次？

![image-20240915234517088](https://oss.nova.gal/img/image-20240915234517088.png)

简单调一下，发现它把 boot_stack_top 的值拿出来了，因此生成了一个 0..0 的 Iterator，我们还需要把它转成指针

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    first_try();
}

fn first_try() -> ! {
    extern "C" {
        static mut boot_stack_lower_bound: usize;
        static mut boot_stack_top: usize;
    }
    unsafe {
        let boot_stack_lower_bound_ptr = core::ptr::addr_of!(boot_stack_lower_bound);
        let boot_stack_top_ptr = core::ptr::addr_of!(boot_stack_top);
        (boot_stack_lower_bound_ptr as usize..boot_stack_top_ptr as usize).for_each(|addr|  {
            (addr as *mut u8).write_volatile(0);
        });
    }
    
    loop {}
}
```

![image-20240916001028784](https://oss.nova.gal/img/image-20240916001028784.png)

非常好初始化，证明我们栈没问题... 吗？

我们发现我们到现在都没有在函数开头增长过栈帧，现在强制使用一下看看

```toml title=".cargo/config.toml"
[build]
target = "riscv64gc-unknown-none-elf"

 [target.riscv64gc-unknown-none-elf]
 rustflags = [
     "-Clink-arg=-Tsrc/linker.ld", "-Cforce-frame-pointers=yes"
 ]
```

![image-20240916001332667](https://oss.nova.gal/img/image-20240916001332667.png)

没问题，我们的栈简直太好了！



## 0x04、Put, Then Put

原版 gdb 实在难用，首先我们先安装个 gef 先。我装的这个是群友推荐的对 kernel 特供版 gef

```bash
wget -q https://raw.githubusercontent.com/bata24/gef/dev/install.sh -O- | sed -e 's/pip3 install/pip3 install --break-system-packages/g' | sh
```

此时，我们其实还不能直接控制硬件 —— 我们的内核运行在 Supervisor，而 SBI 运行在 Machine，它才是最底层和硬件交互的，我们就利用它这种 Supervisor Execution Environment 进行交互

我们直接安装 rustsbi 依赖（截止 2024/09/16 的最新版本）

```bash
cargo add sbi-rt@0.0.3
```

再给我们的内核添加一个 sbi 模块吧

```rust title="src/sbi.rs"
pub fn console_putchar(byte: u8) {
    sbi_rt::console_write_byte(byte);
}
```

打印一个 NOVA 试试看

```rust title="src/main.rs"
#![no_std]
#![no_main]

use sbi::console_putchar;

mod lang_items;
mod sbi;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    first_try();
}

fn first_try() -> ! {
    extern "C" {
        static mut boot_stack_lower_bound: usize;
        static mut boot_stack_top: usize;
    }
    unsafe {
        let boot_stack_lower_bound_ptr = core::ptr::addr_of!(boot_stack_lower_bound);
        let boot_stack_top_ptr = core::ptr::addr_of!(boot_stack_top);
        (boot_stack_lower_bound_ptr as usize..boot_stack_top_ptr as usize).for_each(|addr|  {
            (addr as *mut u8).write_volatile(0);
        });
    }
    
    loop {
        console_putchar(b'N');
        console_putchar(b'O');
        console_putchar(b'V');
        console_putchar(b'A');
        console_putchar(b'\n');
    }
}
```

打印不出来，非常神秘的问题。但是用 legacy::console_putchar 又可以。

它提示没有 0x4442434e 这个系统调用号，用 putchar 它是 1，但是看 https://github.com/riscv-non-isa/riscv-sbi-doc/blob/master/src/ext-legacy.adoc 又有一个 replacement eid

![console_write_byte](https://oss.nova.gal/img/image-20240916013616880.png)

那么我们猜测是 bootloader 太老了，简单进行一个更换

克隆 https://github.com/rustsbi/rustsbi-qemu

运行

```bash
cargo build --package rustsbi-qemu --release --target riscv64gc-unknown-none-elf
```

按照编译器提示把 asm_const 这个 feature 去掉即可编译，之后，将编译的二进制文件放到 qemu 的 bios 参数下即可~

```bash
cp rCore-Tutorial-v3/rustsbi-qemu/target/riscv64gc-unknown-none-elf/release/rustsbi-qemu rCore-Tutorial-v3/bootloader
```

```makefile
run:
	@echo "Running the application..."
	qemu-system-riscv64 \
		-M virt \
		-nographic \
		# highlight-next-line
		-bios ../bootloader/rustsbi-qemu \
		-kernel target/riscv64gc-unknown-none-elf/release/novaos \
		-s -S
```

再次尝试，确实可以跑了

```rust title="src/main.rs"
#![no_std]
#![no_main]

use sbi::console_putchar;

mod lang_items;
mod sbi;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    first_try();
}

fn first_try() -> ! {
    extern "C" {
        static mut boot_stack_lower_bound: usize;
        static mut boot_stack_top: usize;
    }
    unsafe {
        let boot_stack_lower_bound_ptr = core::ptr::addr_of!(boot_stack_lower_bound);
        let boot_stack_top_ptr = core::ptr::addr_of!(boot_stack_top);
        (boot_stack_lower_bound_ptr as usize..boot_stack_top_ptr as usize).for_each(|addr|  {
            (addr as *mut u8).write_volatile(0);
        });
    }

    let str = "谁家 OS 还不支持中文啊";
    for c in str.bytes() {
        console_putchar(c);
    }
    
    loop {
        
    }
}
```

```rust title="src/sbi.rs"
pub fn console_putchar(c: u8) {
    // #[allow(deprecated)]
    // sbi_rt::legacy::console_putchar(c);
    sbi_rt::console_write_byte(c);
}
```

![image-20240916021201773](https://oss.nova.gal/img/image-20240916021201773.png)

没问题噢老铁们



那么最后，我们简单实现一个 println! 宏吧

我们可以直接使用 core::fmt::Write 这个特征，它提供了 write_fmt 方法，通过传入一个 fmt::Argument 即可使用格式化后的字符串调用结构体的 write_str 方法。

于是，我们需要实现这么几个东西：

- 实现 Write trait 的结构体，我们可以学习 x86_64 里直接叫 Stdout，为方便起见，我们直接将其设置为类单元结构体

- 为 Stdout 实现 write_str 功能，把每个字符都调用 sbi::console_putchar 打印就好了。

- 实现一个 print 方法
- 实现 print! 宏，它接受可变个参数，最终调用 print 方法
- 实现 println! 宏，它在 print! 的基础上再打印一个换行符

```rust title="src/console.rs"
use crate::sbi::console_putchar;
use core::fmt::{self, Write};

struct Stdout;

impl Write for Stdout {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        for c in s.bytes() {
            console_putchar(c);
        }
        Ok(())
    }
}

pub fn print(args: fmt::Arguments) {
    Stdout.write_fmt(args).unwrap();
}

#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => {
        $crate::console::print(format_args!($($arg)*));
    };
}

#[macro_export]
macro_rules! println {
    () => {
        print!("\n");
    };
    ($($arg:tt)*) => {
        print!("{}\n", format_args!($($arg)*));
    };
}
```

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;
mod sbi;

#[macro_use]
mod console;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    first_try();
}

fn first_try() -> ! {
    let str = "你猜我是谁";
    println!("{}", str);
    loop {
        
    }
}
```

一切看起来都很美好，然而，当我们使用格式化字符串的时候，却打印不出来了

简单 dbg 一下，发现我们 &_start 不在 0x80200000 处了！

```bash
gef> p/x &_start       
$3 = 0x802002b4
```

那么很容易想到很有可能是 &'static 的东西没地方放了

一看段就理解了

```bash
root@5e14f37e4db2:/mnt/novaos# readelf -S target/riscv64gc-unknown-none-elf/release/novaos
There are 22 section headers, starting at offset 0x36510:

Section Headers:
  [Nr] Name              Type             Address           Offset
       Size              EntSize          Flags  Link  Info  Align
  [ 0]                   NULL             0000000000000000  00000000
       0000000000000000  0000000000000000           0     0     0
  [ 1] .rodata..Lanon.d9 PROGBITS         0000000080200000  00001000
       0000000000000005  0000000000000000   A       0     0     1
```

所以我们简单修改 .rodata 段的地址

```ld title="src/linker.ld"
OUTPUT_ARCH(riscv)
ENTRY(_start)

SECTIONS {
    . = 0x80200000;

    .text : {
        *(.text._start)
        *(.text*)
    }

    . = ALIGN(4K);

    .rodata : {
        *(.rodata.*)
    }

    . = ALIGN(4K);

    .stack : {
        *(.data.stack)
    }
}
```

再尝试一次

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;
mod sbi;

#[macro_use]
mod console;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    first_try();
}

fn first_try() -> ! {
    let str: &str = "世界的答案";
    let num: u8 = 42;
    println!("{} {}", str, num);
    
    loop {
        
    }
}
```

```bash
[rustsbi] Implementation     : RustSBI-QEMU Version 0.2.0-alpha.3
[rustsbi] Platform Name      : riscv-virtio,qemu
[rustsbi] Platform SMP       : 1
[rustsbi] Platform Memory    : 0x80000000..0x88000000
[rustsbi] Boot HART          : 0
[rustsbi] Device Tree Region : 0x87000000..0x87000ef2
[rustsbi] Firmware Address   : 0x80000000
[rustsbi] Supervisor Address : 0x80200000
[rustsbi] pmp01: 0x00000000..0x80000000 (-wr)
[rustsbi] pmp02: 0x80000000..0x80200000 (---)
[rustsbi] pmp03: 0x80200000..0x88000000 (xwr)
[rustsbi] pmp04: 0x88000000..0x00000000 (-wr)
世界的答案 42
```

非常自豪，有了 rust 的语法特性之后我们开发内核将如虎添翼。



## 0x05、Test Is A Must

既然有了 rust 的语法特性，我们自然考虑：能不能把集成测试搬进来？

如果你有注意到的话，我们的 main.rs 上一直飘着一个错误：

> can't find crate for `test`

这是因为 test 本身是 std 里的，因此我们需要编写我们自己的 test_runner

[custom_test_frameworks - The Rust Unstable Book (rust-lang.org)](https://doc.rust-lang.org/nightly/unstable-book/language-features/custom-test-frameworks.html?highlight=custom_test#custom_test_frameworks)

在 `main.rs` 头部添加

```rust
#![feature(custom_test_frameworks)]
#![test_runner(crate::test_runner)]
```

这样，任何 #[test_case] 就会被交由 `crate::test_runner` 这个函数来运行

```rust title="src/main.rs"
#[cfg(test)]
pub fn test_runner(tests: &[&dyn Fn()]) {
    println!("Running {} tests", tests.len());
    for test in tests {
        test();
    }
}

#[cfg(test)]
mod tests {
    #[test_case]
    fn foo() {
        assert_eq!(1, 1);
    }
}
```

简单用条件编译搞一下，然后我们运行 `cargo test`，发现它报错，这也是正常，毕竟我们是 x86_64，所以需要设置 runner

```toml title=".cargo/config.toml"
[build]
target = "riscv64gc-unknown-none-elf"

 [target.riscv64gc-unknown-none-elf]
 rustflags = [
     "-Clink-arg=-Tsrc/linker.ld", "-Cforce-frame-pointers=yes"
 ]
 runner = "qemu-system-riscv64 -machine virt -nographic -bios ../bootloader/rustsbi-qemu -kernel"
```

添加 runner 后再 `cargo test`，可以看到正常跑起来了，但是并没有我们预期的 `Running 1 tests` 出现

也是可以想到的啦，因为我们现在没有 main 函数了，它是直接走的 `_start` 然后到了 `novaos_start`

再在 `main.rs` 里添加一个 shebang，这似乎在文档中没有提及，反正直接用就是了

```rust
#![reexport_test_harness_main = "test_main"]

#[no_mangle]
fn novaos_start() -> ! {
    #[cfg(test)]
    {
        test_main();
    }
    first_try();
}
```

```rust title="src/main.rs"
#![no_std]
#![no_main]
#![feature(custom_test_frameworks)]
#![test_runner(crate::test_runner)]
#![reexport_test_harness_main = "test_main"]

mod lang_items;
mod sbi;

#[macro_use]
mod console;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    #[cfg(test)]
    {
        test_main();
    }
    first_try();
}

fn first_try() -> ! {
    let str = "世界的答案";
    let num: u8 = 42;
    println!("{} {}", str, num);
    loop {
            
    }
}



#[cfg(test)]
pub fn test_runner(tests: &[&dyn Fn()]) {
    println!("Running {} tests", tests.len());
    for test in tests {
        test();
    }
}

#[cfg(test)]
mod tests {
    #[test_case]
    fn foo() {
        assert_eq!(1, 1);
    }
}
```

此时再次运行 `cargo test`，可以看到已经正常输出了，不过在这之后它还是跑了我们的后面的内核，这点就留给后面开关机之后再来做。

## 0x06、Shut My Life Down

一直用 ctrl+a x 来关闭 qemu 实在是不够优雅，让我们来增加一个关机功能。

如法炮制的，我们也是利用 rustsbi 提供的功能来做，这部分就不再详细说了

```rust title="src/sbi.rs"
pub fn console_putchar(c: u8) {
    sbi_rt::console_write_byte(c);
}

pub fn shutdown(failure: bool) -> ! {
    use sbi_rt::{system_reset, Shutdown, NoReason, SystemFailure};
    match failure {
        true => system_reset(Shutdown, SystemFailure),
        false => system_reset(Shutdown, NoReason),
    };

    unreachable!()
    
}
```

接着，我们也可以把 panic_handler 简单完善一下

```rust title="src/lang_items.rs"
use crate::*;
use sbi::shutdown;

#[panic_handler]
fn panic_handler(_info: &core::panic::PanicInfo) -> ! {
    match _info.location() {
        Some(location) => {
            println!("Panicked at {}:{} {}", location.file(), location.line(), _info.message().unwrap());
        }
        None => {
            println!("Panicked: {}", _info.message().unwrap());
        }
    }
    shutdown(true);
}
```

```rust title="src/main.rs"
#![no_std]
#![no_main]
#![feature(custom_test_frameworks)]
#![test_runner(crate::test_runner)]
#![feature(panic_info_message)]
// highlight-next-line
#![reexport_test_harness_main = "test_main"]

mod lang_items;
mod sbi;

#[macro_use]
mod console;

core::arch::global_asm!(include_str!("entry.s"));

#[no_mangle]
fn novaos_start() -> ! {
    #[cfg(test)]
    {
        test_main();
    }
    first_try();
}

fn first_try() -> ! {
    let str = "世界的答案";
    let num: u8 = 42;
    println!("{} {}", str, num);
    // highlight-next-line
    panic!("Who Told you that?");
    loop {
            
    }
}



#[cfg(test)]
pub fn test_runner(tests: &[&dyn Fn()]) {
    println!("Running {} tests", tests.len());
    for test in tests {
        test();
    }
}

#[cfg(test)]
mod tests {
    #[test_case]
    fn foo() {
        assert_eq!(1, 1);
    }
}
```



但是说了这么多，似乎我们这个并不能称为操作系统 —— 显然他没有提供一个操作系统应有的功能：作为应用和硬件的中间层，选择应用执行，并且提供系统调用给用户态应用使用。



于是接下来我们将实现一个 BatchSystem



## 0x07、Now Isolate it

既然我们想要实现一个操作系统，内核态和用户态分离就是必不可少的东西。具体而言，RISC V ISA 规定了不同特权等级能够使用的指令子集，而显然存在一些函数（例如 write、read）用户态想要使用的，然而，这种函数会访问硬件，因此必定需要操作系统特权级指令的支持才能做到。因此，我们的操作系统就要提供一个接口，能够让应用程序安全的访问这些硬件，并且在出错时进行错误处理从而不会使得整个内核崩溃。



在 RiscV 上，存在四个特权级，由低到高分别为 User、Supervisor、Hypervisor 和 Machine。对于我们的操作系统来说，我们可以忽略掉 Hypervisor 特权等级，仅在 Supervisor 特权上运行，而 RustSBI 则运行在 Machine 态上，作为 Supervisor 和 Machine 的接口。于是，我们接下来的目标就是实现 Supervisor 到 User 的接口。



为了做到这点，我们必定需要首先考虑一些事情：

1. U <-> S 的转换应该如何实现
2. 如何确保 U 不能访问 S 的内存
3. 如何确保 S 对 U 有控制权

对于第一条，S -> U 那么显然是我们能控制的 —— 我们内核本身就占有 CPU，但是 U -> S 则需要我们进行思考：在哪些情况下，应该转移到 S？

形如你一样的操作系统肯定能够想到：Syscall、Exception 这类的 Trap 操作。



对于 RISCV 来说， 在不同的特权等级下执行 `ecall` 这条指令，将会触发不同的异常，我们也就主要依靠这点来做 syscall

而特权态的切换，也就主要依赖于一些 CSR 寄存器

| CSR 名  | 该 CSR 与 Trap 相关的功能                                    |
| ------- | ------------------------------------------------------------ |
| sstatus | `SPP` 等字段给出 Trap 发生之前 CPU 处在哪个特权级（S/U）等信息 |
| sepc    | 当 Trap 是一个异常的时候，记录 Trap 发生之前执行的最后一条指令的地址 |
| scause  | 描述 Trap 的原因                                             |
| stval   | 给出 Trap 附加信息                                           |
| stvec   | 控制 Trap 处理代码的入口地址                                 |



仔细思考，我们现在编写特权切换的代码还为时尚早 —— 我们还没有做运行程序的代码。所以我们先从用户态程序开始，做一两个 Demo。

### 0x07-A、User  Runtime Library

对于用户程序，我们需要实现一个运行时库 —— 它作为包装 Supervisor 提供的接口，将 unsafe 的代码块转为可供调用的 safe 的函数。

```bash
cargo new usr --lib
```

然后类似的添加 config.toml

```toml title="usr/.cargo/config.toml"
[build]
target = "riscv64gc-unknown-none-elf"

[target.riscv64gc-unknown-none-elf]
rustflags = [
    "-Clink-args=-Tsrc/linker.ld",
]
```

接下来我们思考 Runtime Library 应该如何实现

我们可以通过这种方式来做：固定 runtime library 的入口点，让它调用特定函数（i.e. main 函数），而在不同的用户程序里，它将会和 runtime library 一起被编译，并且通过 linkage 覆盖 runtime library 的 main 函数（也就是说 runtime 的 main 只是为了让编译器开心而已）

```rust title="usr/src/lib.rs"
#![no_std]
#![feature(linkage)]

#[link_section = ".text._start"]
#[no_mangle]
pub extern "C" fn _start() -> ! {
    main();
    panic!("No way to be here");
}

#[linkage = "weak"]
#[no_mangle]
pub extern "C" fn main() -> i32 {
    panic!("Main function not implemented.");
}
```

我们将 _start 作为启动点，简单先实现一下。



接下来，我们编写 linker.ld，使 runtime library 被加载在固定地址

```ld title="usr/src/linker.ld"
OUTPUT_ARCH(riscv)
ENTRY(_start)

SECTIONS {
    . = 0x80400000;

    .text : {
        *(.text._start)
        *(.text*)
    }

    .rodata : {
        *(.rodata .rodata.*)
    }
}
```



至于其他的 panic_handler 等，我们可以暂时直接从 OS 里复制过来

```rust title="usr/src/lang_items.rs"
#[panic_handler]
fn panic_handler(_info: &core::panic::PanicInfo) -> ! {
    match _info.location() {
        Some(location) => {
            println!("Panicked at {}:{} {}", location.file(), location.line(), _info.message().unwrap());
        }
        None => {
            println!("Panicked: {}", _info.message().unwrap());
        }
    }
    loop {}
}
```

```rust title="susr/src/console.rs"
use core::fmt::{self, Write};

struct Stdout;

impl Write for Stdout {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        for c in s.bytes() {
            console_putchar(c);
        }
        Ok(())
    }
}

pub fn print(args: fmt::Arguments) {
    Stdout.write_fmt(args).unwrap();
}

#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => {
        $crate::console::print(format_args!($($arg)*));
    };
}

#[macro_export]
macro_rules! println {
    () => {
        print!("\n");
    };
    ($($arg:tt)*) => {
        print!("{}\n", format_args!($($arg)*));
    };
}
```

```rust title="usr/src/lib.rs"
#![no_std]
#![feature(linkage)]
#![feature(panic_info_message)]


#[macro_use]
mod console;
mod lang_items;

#[link_section = ".text.entry"]
#[no_mangle]
pub extern "C" fn _start() -> ! {
    main();
    panic!("No way to be here");
}

#[linkage = "weak"]
#[no_mangle]
pub extern "C" fn main() -> i32 {
    panic!("Main function not implemented.");
}
```

注意唯一的不同点，就是我们现在需要实现用户态的 println，因此我们需要编写用户态的 syscall，而非直接利用 sbi

新建一个 `syscall.rs`，为了方便在 qemu 上测试我们的用户态程序，我们使 syscall 满足 RISCV syscall convention

- a0~a6 存储参数
- a7 存储 syscall number
- a0 同时存储返回值
- 使用 ecall 指令

首先要实现的自然是 write，它接受 3 个参数，因此我们先实现一个 3 个参数的 syscall 先

```rust title="usr/src/syscall.rs"
use core::arch::asm;


fn syscall(id: usize, args: [usize; 3]) -> isize {
    let mut ret: isize;
    unsafe {
        asm!(
            "ecall",
            inlateout("x10") args[0] => ret,
            in("x11") args[0],
            in("x12") args[1],
            in("x17") id
        );
    }
    ret
}
```

在这里就是 [asm! 宏 ](https://doc.rust-lang.org/reference/inline-assembly.html)的含金量了，它可以将寄存器和变量绑定，且支持 in|late|out 的绑定方式绑定两个变量

接着我们包装 sys_write

```rust
use core::arch::asm;

const SYS_WRITE: usize = 64;


fn syscall(id: usize, args: [usize; 3]) -> isize {
    let mut ret: isize;
    unsafe {
        asm!(
            "ecall",
            inlateout("x10") args[0] => ret,
            in("x11") args[0],
            in("x12") args[1],
            in("x17") id
        );
    }
    ret
}

pub fn sys_write(fd: usize, buffer: usize, len: usize) -> isize {
    syscall(SYS_WRITE, [fd, buffer, len])
}
```

:::warning

如果你注意到的话，这里我们 syscall 写错了，他应该是 args[0]、args[1]、args[2]

这个 bug 让我之后调了快一个小时，留以自省

:::

然后我们在 lib 里再进行进一步封装

```rust title="usr/src/lib.rs"
mod syscall;

use syscall::sys_write;

pub fn write(fd: usize, buffer: usize, len: usize) -> isize { sys_write(fd, buffer, len) }
```

此时，我们的用户态程序只需要 extern 一下我们的 lib，就可以调用 write 方法执行系统调用了

别忘了 console.rs，我们现在在用户态中，console_putchar 不再能用了，让我们把他改成 write

```rust title="usr/src/console.rs"
use core::fmt::{self, Write};

use super::write;

const STDOUT: usize = 1;

struct Stdout;

impl Write for Stdout {
    fn write_str(&mut self, s: &str) -> core::fmt::Result {
        let buffer = s.as_bytes();
        write(STDOUT, buffer.as_ptr() as usize, buffer.len());
        Ok(())
    }
}

pub fn print(args: fmt::Arguments) {
    Stdout.write_fmt(args).unwrap();
}

#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => {
        $crate::console::print(format_args!($($arg)*));
    };
}

#[macro_export]
macro_rules! println {
    () => {
        print!("\n");
    };
    ($($arg:tt)*) => {
        print!("{}\n", format_args!($($arg)*));
    };
}
```



### 0x07-B、User App

现在，让我们写一个用户态程序试试吧

新建一个文件夹 bin，写一个

```rust title="usr/src/bin/first.rs"
#![no_std]
#![no_main]

use usr_rtm::*;  // 注意这里是我 usr/Cargo.toml 里设置的 name

#[no_mangle]
fn main() -> i32 {
    println!("Hello, world!");
    0
}
```

发现出错了，因为我们没有把 console 导出为 pub module，所以它宏展开成了 crate::console::print 这个 private module 的 pub func

简单修改导出 mod 为 pub 即可

然后就是编译的时候有概率遇到 ld section overlap 的问题

:::info

尝试了一下，应该是 cargo workspace 的问题？所以接下来我们把 usr 目录移到了根目录下的 novaos_usr 文件夹

:::

![image-20240917024040034](https://oss.nova.gal/img/image-20240917024040034.png)



之后我们使用 qemu-riscv64 运行一下看看，非常好

![image-20240917034016487](https://oss.nova.gal/img/image-20240917033342479.png)

![image-20240917034119337](C:\Users\nova\AppData\Roaming\Typora\typora-user-images\image-20240917034119337.png)
