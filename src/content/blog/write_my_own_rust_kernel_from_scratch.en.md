---
title: 「Rust Kernel」从 0 开始造一个内核
description: 我们会在 [rCore](https://github.com/rcore-os/rCore-Tutorial-v3) 的基础上，完成我们自定义的内核。
pubDate: 2024-09-12
updatedDate: 2024-09-17
tags:
- Kernel
- rust
authors:
- nova

---
## Before We Begin

We will build our custom kernel on top of [rCore-Tutorial-v3](https://github.com/rcore-os/rCore-Tutorial-v3).

We develop using the Docker environment:

```bash
make docker
```

You should be familiar with:

- Operating system concepts
- Rust programming
- RISC-V ISA

{/* truncate */}

## 0x00 How an OS Binary Works

In simple terms, an OS can run "bare-metal"—it directly interacts with hardware without depending on any standard library.

```bash
root@dd6bc06ddb03:/mnt/novaos# rustc --version -v
rustc 1.80.0-nightly (f705de596 2024-04-30)
... existing version output ...
```

What is the standard library? You can think of it as another layer of abstraction between OS and application. For example, the "gnu" in `x86_64-unknown-linux-gnu` stands for the C standard library (libc) on top of the Linux kernel, providing wrappers and checks for system calls.

> "All problems in computer science can be solved by another level of indirection." – David Wheeler

For instance, [Rust’s `stdio.rs` on Unix](https://github.com/rust-lang/rust/blob/master/library/std/src/sys/pal/unix/stdio.rs) and on Windows handle low-level I/O differently. Above that, different runtime libraries such as `GNU` and `musl` add another layer, each with their own conventions.

Therefore, if we want to write an operating system, we cannot use the runtime library or target any existing OS—this means most of Rust’s usual abstractions are unavailable. Fortunately, Rust provides the `core` library, which is almost OS-agnostic and implements basic arithmetic, error handling, and iterator traits.

When developing a Rust OS, we must disable the standard library:

```rust
#![no_std]
```

## 0x01 My First Bare-Metal Binary

We will target RISC-V. First, add the RISC-V toolchain and configure Cargo:

```bash
rustup target add riscv64gc-unknown-none-elf
mkdir .cargo
cat << 'EOF' > .cargo/config.toml
[build]
target = "riscv64gc-unknown-none-elf"
EOF
```

`riscv64gc-unknown-none-elf` breaks down as:

- `riscv64gc`: 64-bit RISC-V with G (IMAFD) + C extensions
- `unknown`: unknown CPU vendor
- `none`: no underlying OS
- `elf`: no runtime library

Now create a new OS project:

```bash
cargo new --bin novaos
```

Remove the `println!` macro and add `#![no_std]`:

```rust
#![no_std]

fn main() {}
```

Compilation fails:

```bash
error: `#[panic_handler]` function required, but none was found
```

We need to implement our own panic handler. Copy the signature and simply loop forever:

```rust title="src/lang_items.rs"
#[panic_handler]
fn panic_handler(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
```

Include it in `main.rs` and disable the default entrypoint:

```rust title="src/main.rs"
#![no_std]
#![no_main]

mod lang_items;

#[no_mangle]
fn _start() -> ! {
    loop {}
}
```

Compile again—it succeeds (though it does nothing).

## 0x02 Running on QEMU

After power-on, the firmware jumps to a fixed address for the bootloader, which then jumps to the kernel entry point. We use [rustsbi](https://github.com/rustsbi/rustsbi) as our SBI (Supervisor Binary Interface).

Next, write a quick assembly loop to increment `t0`:

```rust title="src/main.rs"
#![no_std]
#![no_main]

core::arch::global_asm!(r#"
    .section .text
    .global _start
    _start:
        li t0,0
    1:  addi t0,t0,1
        j 1b
"#);
```

Inspect with `readelf` to find `.text` at offset `0x11158`. QEMU loads the kernel at `0x80200000`, so we must update the linker script:

```ld title="src/linker.ld"
OUTPUT_ARCH(riscv)
ENTRY(_start)
SECTIONS {
    . = 0x80200000;
    .text : { *(.text._start) *(.text*) }
}
```

Configure Cargo to pass the linker script:

```toml title=".cargo/config.toml"
[build]
target = "riscv64gc-unknown-none-elf"
[target.riscv64gc-unknown-none-elf]
rustflags = ["-Clink-arg=-Tsrc/linker.ld"]
```

Now compile and verify `.text` is at `0x80200000`:

```bash
readelf -S target/riscv64gc-unknown-none-elf/release/novaos
```

Create a simple Makefile to run and debug:

```makefile
run:
	qemu-system-riscv64 -M virt -nographic -bios ../bootloader/rustsbi-qemu.bin \
	    -kernel target/riscv64gc-unknown-none-elf/release/novaos -s -S

dbg:
	riscv64-unknown-elf-gdb \
	    -ex 'file target/riscv64gc-unknown-none-elf/release/novaos' \
	    -ex 'set arch riscv:rv64' \
	    -ex 'target remote localhost:1234'
```

Break at `*0x80200000` and single-step to confirm.

At this point, our minimal kernel runs—but it’s all assembly! Let’s add real functionality.

## 0x03 Introducing a Stack

To support function calls, we need a stack. Allocate and initialize the stack at startup:

```assembly title="src/entry.s"
.section .text._start
.globl _start
_start:
    la sp, boot_stack_top
    call novaos_start

.section .data.stack
.globl boot_stack_lower_bound
boot_stack_lower_bound:
    .space 1024*64
.globl boot_stack_top
boot_stack_top:
```

Include this in `main.rs`:

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
    // clear stack
    extern "C" {
        static mut boot_stack_lower_bound: usize;
        static mut boot_stack_top: usize;
    }
    unsafe {
        let lo = &boot_stack_lower_bound as *const _ as usize;
        let hi = &boot_stack_top as *const _ as usize;
        (lo..hi).for_each(|addr| (addr as *mut u8).write_volatile(0));
    }
    loop {}
}
```

Adjust the linker script to align `.stack` after `.text`.

Force frame pointers to verify the stack is set up correctly:

```toml title=".cargo/config.toml"
rustflags = ["-Clink-arg=-Tsrc/linker.ld", "-Cforce-frame-pointers=yes"]
```

## 0x04 Basic Console I/O

Install a kernel-friendly GDB extension (gef) and use SBI to print characters:

```rust title="src/sbi.rs"
pub fn console_putchar(c: u8) {
    sbi_rt::console_write_byte(c);
}
```

Loop to print "NOVA" and confirm it appears in QEMU. If the legacy SBI call works but `console_write_byte` doesn’t, update the bootloader to the latest `rustsbi-qemu`.

Use a simple string loop:

```rust title="src/main.rs"
loop {
    for &b in b"谁家 OS 还不支持中文啊\n" {
        console_putchar(b);
    }
}
```

## 0x05 Implementing `println!`

Leverage `core::fmt::Write` to build a console writer:

```rust title="src/console.rs"
use core::fmt::{self, Write};
use crate::sbi::console_putchar;

struct Stdout;
impl Write for Stdout {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        for &b in s.as_bytes() {
            console_putchar(b);
        }
        Ok(())
    }
}

pub fn print(args: fmt::Arguments) {
    Stdout.write_fmt(args).unwrap();
}

#[macro_export]
macro_rules! print { ... }
#[macro_export]
macro_rules! println { ... }
```

Then call:

```rust
println!("{} {}", "世界的答案", 42);
```

## 0x06 Testing Framework

Enable custom test frameworks:

```rust
#![feature(custom_test_frameworks)]
#![test_runner(crate::test_runner)]
#![reexport_test_harness_main = "test_main"]
```

Implement `test_runner` and use QEMU as the Cargo test runner.

## 0x07 Shutting Down Gracefully

Add a shutdown SBI call:

```rust title="src/sbi.rs"
pub fn shutdown(failure: bool) -> ! { … }
```

Use it in `panic_handler` to exit QEMU cleanly.

## 0x08 User-Mode Support & Syscalls

Isolate user and supervisor mode. Build a user runtime library (`usr/`) with its own linker script:

```rust title="usr/src/lib.rs"
#![no_std]
#![feature(linkage)]

#[link_section = ".text._start"]
#[no_mangle]
pub extern "C" fn _start() -> ! {
    main();
    panic!("Unreachable");
}

#[linkage = "weak"]
#[no_mangle]
pub extern "C" fn main() -> i32 {
    panic!("User main not implemented.");
}
```

Implement `syscall` via `ecall`, wrap `sys_write`, and replace user-mode `console_putchar` to call the write syscall.

### User Application Example

In `usr/src/bin/first.rs`:

```rust
#![no_std]
#![no_main]

use usr_rt::*;

#[no_mangle]
fn main() -> i32 {
    println!("Hello, world!");
    0
}
```

Run with QEMU’s user-mode emulation to verify.

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
