---
title: 【NoPaper】A brief talk about SANITIZER
description: :::warning
pubDate: 2024-12-06
updatedDate: 2024-12-06
tags:
- NoPaper
authors:
- nova

---
:::warning
This article is still under active construction
:::

## Before We Begin

A few days ago, I was chatting with my junior [@奇怪的轩轩](https://haoqiguai.fun) about the issue of "not having any truly original content." Thinking it over, I realized I haven't really produced much in the way of original (technical) content—most of my work consists of drawing on and retelling others’ ideas. Its intrinsic value is limited and it’s not very irreplaceable.

Coincidentally, I just started my undergraduate thesis proposal. Although my thesis topic is fairly light, considering all the related work to come, I decided to take it seriously.

Thus, this new series was born. The **NoPaper** series will be akin to a literature review: sharing, translating, and summarizing papers in a specific field from classic works up to the SOTA. I don’t know exactly how it will turn out, but at least it should match the daily/weekly rhythm of something like G.O.S.S.I.P :D

Anyway, for the first installment, I’ve chosen to start with Sanitizers. ~~After all, it will serve as Chapter 1 of my thesis~~

{/* truncate */}

## SoK: Sanitizing for Security

Overview

## Address Sanitizer

> Address Sanitizer (ASan)
>
> Paper: [AddressSanitizer: A Fast Address Sanity Checker | USENIX](https://www.usenix.org/conference/atc12/technical-sessions/presentation/serebryany)
>
> First author: [Konstantin Serebryany](https://research.google.com/pubs/KonstantinSerebryany.html). He initially worked on dynamic program analysis at Google and developed ThreadSanitizer in 2009—considered the ancestor of modern Sanitizers. Notably, he also worked at Intel on compiler technology. As of 2024, he has joined Tesla.
>
> Wiki: [AddressSanitizer · google/sanitizers Wiki](https://github.com/google/sanitizers/wiki/AddressSanitizer)

This paper arguably brought Sanitizers into the mainstream and ASan remains the most widely used sanitizer today.

## A Binary-level Thread Sanitizer or Why Sanitizing on the Binary Level is Hard

> Paper: [A Binary-level Thread Sanitizer or Why Sanitizing on the Binary Level is Hard | USENIX](https://www.usenix.org/conference/usenixsecurity24/presentation/schilling), USENIX Security '24
>
> First author: [Joschua Schilling](https://www.cs1.tf.fau.de/person/joschua-schilling/) (IT Security Infrastructures Lab). He is currently working on a Static Binary Memory Sanitizer. This paper focuses on ThreadSanitizer at the binary level; earlier work included Binary UBSan. It seems he aims to implement sanitizers at the binary level one by one.

In recent years, binary-level sanitizers have been rare. Here are some existing binary-level sanitizer-like implementations I haven’t fully read, but I’ve heard of Valgrind:

> - Derek Bruening and Qin Zhao. Practical memory checking with dr. memory. CGO, 2011.
> - Valgrind Developers. Helgrind: A Thread Error Detector. 2007.
> - Julian Seward and Nicholas Nethercote. Using valgrind to detect undefined value errors with bit-precision. USENIX ATC, 2005.
> - Nicholas Nethercote and Julian Seward. Valgrind: A Framework for Heavyweight Dynamic Binary Instrumentation. ACM SIGPLAN Notices, 2007.

### Contribution

This paper has two main contributions:

- Analysis of challenges and obstacles in porting existing sanitizers to the binary level.
- Implementation of BINTSAN (Binary Thread Sanitizer), including design, implementation, and evaluation for detecting race conditions.
  - Introduces heuristics to recognize atomic operations and minimize performance impact.

### Challenges

Sanitizers like ASan instrument at the IR/source level, embedding runtime checks into the final binary. A practical challenge is that many commercial or closed-source binaries lack source code, so we cannot use ASan on them directly. Binary rewriting tools like [Retrowrite](https://github.com/HexHive/retrowrite) can instrument COTS binaries for partial ASan functionality.

> Sushant Dinesh, Nathan Burow, Dongyan Xu, and Mathias Payer. Retrowrite: Statically Instrumenting COTS Binaries for Fuzzing and Sanitization. IEEE S&P, 2020.

Another challenge is missing source/IR information: Binary Sanitizers lack type, variable, and control-flow metadata. Retrowrite cannot handle global variables or stack objects and doesn’t support PIC or C++ exceptions. Even so, Retrowrite incurs ~50–70% performance overhead.

A third challenge is performance: ASan overhead is around 2×, whereas binary-level sanitizers can reach 5× or more. Dynamic Binary Translation (DBT) techniques used by binary sanitizers are inherently slow, as instrumentation occurs during binary-to-machine-code translation.

## Challenges for Binary Sanitizers

### Information Loss

During compilation, source-level information—control flow, types, memory order, signed/unsigned semantics, debug symbols—is lost. These conceptual gaps between high-level languages and target architectures make binary instrumentation nontrivial.

### Conceptual Differences in Program Representation

At different compilation stages, attributes vary:

- Registers: IR has unlimited virtual registers vs. limited physical registers.
- SSA: IR uses SSA form; assembly does not, complicating tracking of register state.
- Instruction Sets: RISC-based IR vs. CISC x86-64 with many variants and mnemonics. Binary sanitizers often lift machine code back to IR to simplify instrumentation, but this can introduce inaccuracies.

### Success Criteria

Given these challenges, a successful binary sanitizer should satisfy:

1. Correctness
2. Effective error detection
3. Performance (see "Breaking Through Binaries: Compiler-quality Instrumentation for Better Binary-only Fuzzing", USENIX Security '21)
4. Compatibility
5. Scalability (applicable to varied binaries: obfuscated, large, with or without debug symbols)

## Feasibility of Porting Sanitizers to the Binary Level

The authors analyze the feasibility of porting four popular sanitizers (ASan, UBSan, MSan, TSan) to binary level.

- ASan: Lightweight instrumentation and runtime library design make it feasible. Retrowrite implements partial ASan but cannot handle some globals, stack objects, PIC, or C++ exceptions. It still adds 50–70% overhead.
- UBSan: Checks undefined behavior, which doesn’t exist in binaries. Only some checks (e.g., integer overflow) can be done. Others (alignment, indirect call signatures, builtins) require source-level knowledge.
- MSan: Tracks uninitialized memory via shadow memory, which is complex in binaries due to missing register shadowing. Introducing shadow registers breaks compatibility and increases overhead, especially on CISC.

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
