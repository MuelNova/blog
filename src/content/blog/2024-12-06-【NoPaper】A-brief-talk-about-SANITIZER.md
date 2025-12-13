---
title: 【NoPaper】A brief talk about SANITIZER
description: :::warning
pubDate: 2024-12-06
updatedDate: 2024-12-06
tags:
- NoPaper
authors:
- nova
lang: zh
---

:::warning

这篇文章仍然在积极建设中

:::

## 在此之前

前几天和学弟 [@奇怪的轩轩](https://haoqiguai.fun) 聊天的时候，聊到了 "没有自己原创性的内容" 的问题。仔细想想，我好像也没有啥原创性的产出（指技术相关，小作文还是写的挺多而）。绝大多数的内容都是借鉴与转述，含金量不高，不可替代性不高。

恰巧最近本科毕设开题，虽然本科毕设比较水，但考虑到之后各种相关的事情，所以还是决定认真对待。



于是，有了本系列文章。 ***NoPaper*** 系列大概会类似于文献综述一般，将某一个领域从经典到 SOTA 的文章进行分享 / 翻译 / 总结，具体我也不知道能做成啥样，至少要比得上 G.O.S.S.I.P 这类日更 / 周更吧 :D



总之， 第一篇选择从 Sanitizer 开始。~~毕竟要作为我毕设的第一章~~

<!--truncate-->

## SoK: Sanitizing for Security

综述



## Address Sanitizer

> Address Sanitizer, 简称 ASan
>
> 论文链接：[AddressSanitizer: A Fast Address Sanity Checker | USENIX](https://www.usenix.org/conference/atc12/technical-sessions/presentation/serebryany)
>
> 一作：[Konstantin Serebryany](https://research.google.com/pubs/KonstantinSerebryany.html)，大佬一开始在 Google 做动态程序分析，然后 09 年搞了个 ThreadSanitizer，算是 Sanitizer 的开山鼻祖。值得一提的大佬之前还在 Intel 干，主要就是做编译器那边的活。今年（2024）大佬跑特斯拉去了。
>
> Wiki: [AddressSanitizer · google/sanitizers Wiki](https://github.com/google/sanitizers/wiki/AddressSanitizer)

这篇应该算是让 Sanitizer 正式进入大众视野的一篇，也是目前应用最广泛的一种 Sanitizer。



## A Binary-level Thread Sanitizer or  Why Sanitizing on the Binary Level is Hard

> 论文链接：[A Binary-level Thread Sanitizer or Why Sanitizing on the Binary Level is Hard | USENIX](https://www.usenix.org/conference/usenixsecurity24/presentation/schilling)，USENIX' 24
>
> 一作：[Joschua Schilling - IT Security Infrastructures Lab](https://www.cs1.tf.fau.de/person/joschua-schilling/)（应该是），我看到他现在也在做 Static Binary Memory Sanitizer，这篇是 Thread Sanitizer，之前好像还做了 Binary UBSan，感觉是想要往这方面把 sanitizer 都做一遍。

近年来少有的 Binary Level 的 Sanitizer。

这里给出一些已有的 Binary Level Sanitizer-like 的实现，没读过，但是 Valgrind 听过很多次，挖个坑。

> Derek Bruening and Qin Zhao. Practical memory checking with dr. memory. In IEEE/ACM International Symposium on Code Generation and Optimization (CGO), pages 213–223. IEEE, 2011.
>
> Valgrind Developers. Helgrind: A Thread Error Detector. [https://valgrind.org/docs/manual/hgmanual.html](https://valgrind.org/docs/manual/hg-manual.html), 2007.
>
> Julian Seward and Nicholas Nethercote. Using valgrind to detect  undefined value errors with bit-precision. In USENIX Annual Technical  Conference (ATC), 2005.
>
> Nicholas Nethercote and Julian Seward. Valgrind: A Framework for  Heavyweight Dynamic Binary Instrumentation. ACM SIGPLAN Notices,  42(6):89–100, 2007.

### Contribution

这篇文章主要的贡献有两点

- 在 binary level 对现有的一些 sanitization 方案做了分析（移植的挑战、障碍）
- 实现了 BINTSAN (Binary Thread Sanitizer)，进行了设计实现和评估，用于分析 race condition 的情况。
  - 在实现过程中，引入了一些启发式操作识别原子操作，最小化性能影响

### Challenges

对于已有的大部分 Sanitizer，例如 ASan 等，都是在 IR/Source 层面插桩，直接将 runtime checks 嵌入到最终的二进制文件里。然而，一个现实挑战就是市面上很多软件（闭源驱动、商业软件）等是没有源码的，因此我们没有办法利用 ASan 之类的 Sanitizer 对这类二进制程序进行运行时漏洞发现。当然，其实这句话并不完全正确，因为存在有 [Retrowrite](https://github.com/HexHive/retrowrite) 这种二进制重写方案能对二进制进行插桩，从而实现 ASan 的部分功能。

> Sushant Dinesh, Nathan Burow, Dongyan Xu, and Mathias Payer. Retrowrite: Statically Instrumenting COTS Binaries for Fuzzing and Sanitization. In IEEE Symposium on Security and Privacy (S&P), 2020.



另一个难点就是缺失了源代码和 IR 信息，Binary Sanitizer 不能做到和 SourceCode Sanitizer 一样利用很多插桩时候就嵌入的信息进行推断（例如，变量类型）。（这也是 Retrowrite 插桩 ASan 无法解决的问题）



第三个难点就是开销，ASan 的开销在 ~2x 左右，而一般 Binary Sanitizer 可能*会到 5x 甚至更高*（~~记得看过这么一个说法，没找到原文，未查证~~应该是 Valgrind 原文或者 SoK:Sanitizing for security 里）。当然，在 fuzz 领域，也存在一些 binary level 的 instrumentation optimization（例如 [Breaking Through Binaries: Compiler-quality Instrumentation for Better Binary-only Fuzzing | USENIX' 21](https://www.usenix.org/conference/usenixsecurity21/presentation/nagy)），感觉也可以借鉴

一般来说，Binary Sanitizer 都利用的是动态插桩技术（Dynamic Binary Translation, DBT），因此性能特别差

> 简单来说，DBT 就是在 Assembly -> Machine Code 的 Translation 过程中，动态的添加指令实现插桩。因此可想而知效率并不会很高。



### Challenges for Binary Sanitizers

#### 信息丢失

在 Compilation 过程中，很多源代码的信息会丢失 —— 控制流信息，类型信息，内存顺序，符号 (主要指的是变量类型的 signed / unsigned)，以及调试信息等等。这种信息丢失是由于源代码和目标架构之间的 "概念性差异" (conceptual differences) 引起的，因此对于不同的架构 / 编译器 / 编译器选项，都可能存在不同的对应关系。

例如 Undefined Behavior，这种概念就是 C/C++ 的高阶语言产生的一个概念，用于指导编译器优化。自然，经过编译器编译之后，这种概念在二进制层面就不存在了，因为编译器已经利用了这个信息，并生成了具体的指令。

#### 程序表示形式的概念性差异 

这其实就是在编译的不同阶段，（主要）由于编译器不同而导致的差异问题。具体来说，就是源代码、IR 和汇编代码三个层面，有不同的属性，这些属性可能会简化 / 阻碍静态分析。

- 寄存器：IR 层面支持无限多个数的寄存器，而物理寄存器是有限的。
- SSA：IR 层面使用 SSA（Static Single-Assignment，确保每个寄存器只会被赋值一次），而汇编不能提供这一属性。这实际就是二进制分析的根本影响，因为我们需要考虑寄存器状态。
- 指令集：对于 RISC 和 CISC 也有区别。因为 IR 其实一般用的是 RISC，而 x86-64 支持各种变体和助记符。这就要求 binary sanitizer 其实要支持每一种指令，所以说的话如果做 binary sanitizer，一般就会把二进制提升到 IR 层面用于化简，但这样自然也会带来不准确性。

### Success Criteria

谈到了如上的 Challenge，那么也就能够针对 binary sanitizer 的成功性提出几个方面的点：

1. Correctness
2. Effective Error Detection
3. Performance，具体可以看 Breaking through Binaries: Compiler-quality Instrumentation  for better Binaryonly Fuzzing. In USENIX Security Symposium, 2021.
4. Compatibility
5. Scalability，这里的可拓展性主要表现在能够适用于尽可能多类型的二进制文件，例如混淆过的，文件体积特别大的，或者说有调试符号的以及没有调试符号的。

### Feasibility of porting sanitizers to the binary level

在这里，作者分析了当前最流行的四种 Sanitizer（ASan、UBSan、MSan、TSan）移植到二进制层面的可行性。

对于 ASan 来说，因为他的插桩比较轻量，而且基本上逻辑都是由 ASan 的 runtime-library 实现，所以其实能够较好的应用二进制目标。但是由于信息丢失，它的 effectiveness 会差一点。RETROWRITE 已经实现了这一部分功能，但是他没法对全局变量或者单独的栈对象进行 sanitization，并且由于 RETROWRITE 自己的限制，它也只能用于非 PIC 且没有 C++ 异常处理的程序。然而即使比较轻量，RETROWRITE 还是会带来接近 50~70% 的性能开销。

对于 UBSan 来说，因为它使用多个小的且独立的 checks，且都是独立实现，所以和其他的 Sanitizer 都不同。对于 binary level UBSan 来说，问题就在于未定义行为在二进制层面上是不存在的，你必须要重建原始意图，然后去断定源代码中的行为是不是未定义的。当然，UBSan 检查非常多（28 项），所以其实有一些是能够在二进制层面做的（10 项），但基本就是一些整数溢出的检查。其他的则需要一些源代码的知识，例如说对齐（Alignment），间接调用的函数签名（Function Signatures of Indirect Calls），以及编译器 builtins 的调用等等，这些做起来就非常复杂，并且容易出错了。

> 具体哪些能做可以看论文的 Table7

对于 MSan 来说，其实和 ASan 类似，它也用了一个 runtime-library 来实现。然而不同的是，由于它需要在程序执行过程中正确追踪那些未初始化的内存，它的插桩会更重一些。具体来说，它把内存状态存在 shadow memory 里，在内存访问和修改的时候就会更新这个内存状态，这在二进制层面就很复杂了，因为寄存器的内容也会影响这个初始状态（寄存器保存了一个没有初始化的内存，然后再把寄存器的内容，即这个未初始化内存的指针保存在另一个没有初始化内存的位置）。这就要求 shadow propagation 需要考虑寄存器和寄存器内容，就需要引入 shadow register 的概念，这在原本的 MSan 中是没有的，这样就会破坏前面提到的 "Compatibility" 的 Criteria。更重要的是，之前提到了 RISC 和 CISC 的内容，如果引入 shadow register，就要求对于所有和寄存器有关的指令都被插桩，这个性能开销就有点大了。
