---
title: "「BroWithAIInfra」纯种网安老头简单学学 CMU11868"
pubDate: 2026-08-10
description: "Bro is learning AI Infra"
authors: [nova]
lang: zh
math: true
tags:
  - infra
---

:::important[进度]

*08 / 11*：更新了 [Lecture1](https://llmsystem.github.io/llmsystem2026fall/assets/files/llmsys-01-intro-e4fe7d3230b64f7bfc2bfa4e0060be43.pdf)

*08 / 17*：更新了 [Lecture2](https://llmsystem.github.io/llmsystem2026fall/assets/files/llmsys-02-gpu-programming-c914ef6531dd16acd471c6c076508f4e.pdf)



:::

其实自己已经学了很多次了，但是因为没做笔记，于是学完又忘了。

痛定思痛，重新开始吧，正好 CMU11868 26'Fall 的课程也差不多开始了（2026-08-24），不如直接重新来吧（笑

:::important[提示]

课程资源：https://llmsystem.github.io/llmsystem2026fall

由于没有视频，我们将使用 LLM as Teacher 的方法，对应 Skill 可以看 https://github.com/MuelNova/CMU11868_26Fall/skills （IMPORTANT: 为了保护 academic integrity，仓库将会非公开直到 26Fall 课程结束，如有需要可以评论让我添加权限。仓库不包含 slides / extracted files。）。我们默认使用 Sonnet 5 / Opus 5 作为 Teacher Model，辅以 GPT-5.6-sol / Kimi K3 作为 Teacher Assistant Model

:::

:::important[注意]

我没有任何 ML / NLP 或者相关数学知识，所以有些地方会很 silly，之前不写 blog 也是因为这个原因，害怕被厌蠢；与此同时我可能也会有一些地方已经学过 / 了解，所以思维可能又会有点跳跃。

所以这篇博客（及其后续）仅作为参考与记录，你不应该假设它是一篇有质量的，或是教你从 0 开始的 LLM 学习文章。

:::

## Before we start...

我们建立对应的文件夹，下载资源。

我使用 [WebBridge](https://www.kimi.com/zh-cn/features/webbridge) 配合 Claude 将 Slides / Resources 下载下来（书本资源我从 zlib 下下来了 orz，好孩子别学），利用 [MinerU](https://mineru.net/) 解析 PDF 获取 markdown + 图片。

这里 SKILL 没有做太多的干涉，一个写完之后问另外几个 agent 怎么改进，优化了一波。

## Lecture 01 - Introduction to the LLMs

> 题外话，真先进啊，已经把 K3 放到图里了。
> ![Scale of LLMs](https://cdn.nova.gal/img/vscode_picgo_1786354729176.png)

跳过那些讲 LLM 能力的东西，我们只需要知道，Modern LLM focus on:

- **Generalist** —— 通才，把所有任务都可以抽象成 token-based sequence generation。也是直接把像是 NLP 那边的翻译、分类、摘要之类的那套每个任务做一套不同的假设 / 抽象 / 优化全部干翻了。这也是 AI Infra 爽的原因，底层一优化下层应用全受益。
- Instructibility
- Agentic



### Mathematical Foundations

所谓 LLM，本质上就是在做一件事：给定一段 prompt $x$，在产生序列 $y_{1...t-1}$ 的前提下，求产生下一个 token $y_{t}$ 的概率，或者说就是给定一段前缀，输出词表上的概率分布。
$$
P(\text{next word } y_t \mid \text{prompt }x \text{,previous word } y_{1:t-1})
$$
把 next_token 泛化到整个回答，其实也就是这么一个东西：
$$
P(x_{1:T}) = \prod_{t=1}^{T} P(x_t \mid x_{1:t-1})
$$
举一个具体例子:
$$
P(\text{Pittsburgh is a city of bridges})= P(\text{Pittsburgh}) \cdot P(\text{is} \mid \text{Pittsburgh}) \cdot P(\text{a} \mid \text{Pittsburgh is}) \cdots
$$

不难注意这个也就是为什么我们 decode 阶段只能串行，因为必须要知道前序才能算出这个链式的概率，当然其实在训练的时候，因为这个整句话已经是 ground truth 了，其实就可以直接并行去训，叫 *Teacher Forcing*

> 其实现在也有一些 so-called 并行的方案。例如 Speculative Decoding / MTP，但是其实都不是严格意义的并行。我们会在后面的内容里讲。



然后 LLM 一般就是分成三类，Encoder Only / Decoder Only / Encoder & Decoder

其实这里我一直觉得名字很神秘，Encoder 和 Decoder 很容易想成是密码学里面那种编解码的东西。硬要说的话 Encoder 就是编码一个词与其他词之间关系的这么一个东西吧！

#### Encoder-only

对于 Encoder Only，他们是*非自回归（Non-autoregressive, NAR）*的，以 *BERT* 为例，它实际上就是具体在这个 *B(idirection)* 上，它是能看到双向（前、后）信息的，通过掩码预测的方式训练。
$$
P(x_{mask}\mid x)
$$
这个好处一眼就能看出来，以翻译来说，所有的 $y_t$ 都不依赖于 $y_{<t}$，而都只依赖于 $x$，这也就说明我们可以直接并行去生成，速度显然好；

坏处也很明显，之前产生的东西没法看到，这种 *条件独立* 很容易带来 *多峰问题（Multimodality Problem）*，除此之外，也事先需要长度信息。

> 举个最简单的例子：“翻译 teacher成中文“。
>
> 在这个任务上，假设训练集里面 "老师" 和 "先生" 分布平均。
>
> 第一个位置看，选了 "老"；第二个位置看，选了 "生"。
>
> 结果答案就变成了 "老生"。
>
> P(y₁, y₂) ≠ P(y₁)P(y₂)



:::warning[注意]

在 AI review 这段之前的文字的时候，发现其实有一些歧义。也就是我把 *NAR* 的各种特性套在了 *BERT* 上。而事实上，*BERT* 更多处理分类、检索等工作，而不是 *生成* 。

:::

#### Encoder-Decoder

就是 $P(y\mid x)$，encoder 那边把词和词之间关系学明白了。然后整组向量就丢给 decoder，decoder 想看哪个就直接看（也就是交叉注意力）。具体细节后面讲 transformer 的时候再写吧。

encoder-decoder 其实天然适配翻译的活，因为想要翻译，我们一定得看完整个句子，这个天然符合 encoder 的思想（虽然 decode-only 其实也能做到）；同时，翻译更像是一个 bijection 的活，它是一一对应的，这点和摘要啊，问答之类的活还不一样，这就导致我们的交叉注意力其实在这个上面和它的数学形式是更加同构的；此外，翻译也是少有的不缺少配对语料的任务（但是可惜，架不住通用语料比他多了几个数量级，导致这种配对其实直接被学进去了）

#### Decoder-only

现在最流行的形式。之前说到了配对语料的缺失其实就是催生 Decoder-only 架构的最大原因，虽然它纯建模能力不如 Encoder-Decoder，但是得益于数据易得性 / 参数复用 / 推理状态简单等先天优势，所以还是被最广泛使用。
$$
P(X) = \prod_{n=1}^{N} P(x_n \mid x_{1:n-1})
$$


#### Training

一般来说我们都使用 *交叉熵（Cross Entropy, CE）* 损失来表示真实分布与模型分布的差距，或者我平常记它形式靠 *负对数似然（NegativeLogLikelihood, NLL）* —— 这俩在 One-Hot 这种语言标签下其实数学形式是完全一样的，在这种情况下，最小化交叉熵损失其实也就是 *最大似然估计（Maximum Likelihood Estimate, MLE）*。

不过其实差别还是挺大的，因为 CE 其实还有其他性质，而且在非 One-Hot 的情况下，两个就完全不一样了。CE 的数学形式可以写成下面的形式：
$$
CE=-\sum_{v\in V}p(v)\log{q(v)}
$$
其中 $V$ 代表词表，$p$  代表真实分布，$q$ 代表模型分布。

至于为什么和 NLL 一致，是因为在语言模型下面，对于 $v\in V$，只在它的真实位置有 $p(v)=1$，而其他地方都是 $p(v)=0$，因此最后也是：
$$
CE=-\log{q(x_n)}=-\log P_{\theta}(x_n\mid x_{<n})=NLL
$$
当然，其实在 PyTorch 里，我们可以看到 `nn.CrossEntropyLoss(logits, target)  ==  nn.NLLLoss(log_softmax(logits), target)`。所以其实在 PyTorch 里，CE 和 NLL 的区别就是 `logits` 到底传原始的还是 `log_softmax` 之后的而已。当然，在 Infra 层面，这里更是有其他的考量，例如，显存上的考量，我们在后续把一些概念解释后再仔细讲。



不过上面这么说其实容易误导，因为在 PPT 里，CE 其实写成这样：
$$
CE=-\frac{1}{N}\sum_{n=1}^N\log{P_\theta(x_n\mid x_{<n})}
$$
不过仔细分析一下其实就可以发现，我们上面说的 CE 是 **针对于一个 token**，而这里的 CE 则是 **针对于句子里的一个位置**，写完整如下，但是就因为我们刚才说到的 One-Hot 的原因，所以就化简了。
$$
CE = -\frac{1}{N}\sum_{n=1}^{N}\ \underbrace{\sum_{v=1}^{V} p_n(v)\log q_n(v)}_{\text{第 n 个位置的 CE}}
$$


那么如何衡量模型好坏呢？最简单也是 *PPL（Perplexity）*，其实就是套个 $exp$
$$
PPL=\exp(CE)
$$
这是啥意思呢？我们取一个随机模型，它的输出接近均匀分布，每个 token 的概率都是 $\frac{1}{V}$。此时 $CE=-\log\frac{1}{V}=logV$，所以 $PPL=V$；而对于真实分布，也容易算出它的数学下界 $PPL=1$。所以我们可以简单这样理解：PPL 就是代表模型在 **每一步** 上在 **多少个** 等可能的候选之间摇摆。

> 以 [GPT-3](https://github.com/openai/gpt-3) 在 Penn Treebank 上为例，它训练是 300B Tokens，而 zero shot 下，它的 PPL 大概是 20.5

当然除了 PPL，例如 *pass@k* 之类的也在不同的下游任务中进行测量。



###  Challenges

Slide 上就这么一句话。

> **Key system problem**: compute (train/inference) larger LLMs on bigger datasets with fewer resources (GPU/memory/power) faster

也就是四个量：
$$
模型规模\uparrow\space 数据规模\uparrow\space 速度\uparrow\space 资源\downarrow
$$
整个 LLM 其实就是在这四个维度上做优化做 trade off，放到 low-level 上，我们可以把它们拆成 4 个原语

- *MatMul 矩阵乘* ，唯一一个 compute-bound 的原语（相对来说）
- *Reduct 归约*
- *Map 映射*
- *Memory Movement 内存移动*

在 [Data Movement is All You Need](https://arxiv.org/abs/2007.00072) 里面提到，这些几乎不做运算的算子，其实占了接近 $40\%$ 的运行时间。所以，算子优化的一大要点反而是如何减少 *内存移动* 的次数，而不只是如何减少 *计算次数*



当然，上面的思路其实是完全在 low-level 的情况下讨论的，实际上不同的层也有不同的关注要点，而总的效率往往是所有层的效率相乘算出来的。

>  例如，在集群里，我们考虑的可能更多就是 *scheduling* / *scaling* 之类的事情；而在框架层，我们可能更考虑 *easy dev* 。

![challenges to scale to larger LLMs](https://cdn.nova.gal/img/image-20260811020305145.png)

slide 的图其实已经完全描述了整个优化任务，也对应后续课程的不同内容。当然，不只是 scale up，scale down 也是任务之一（量化、蒸馏、端侧部署都需要小模型）



## Lecture 02

> Updated at 2026-08-17

:::warning

之前写 lecture 1 那样实在是太耗费精力了，所以之后我们不再复述一些已经在 slide 中的（顶多截个图），只关注于自己的一些理解 / 思考 / 疑惑。

~~毕竟写出来并不是教学而是记录~~

:::

想要做优化，我们肯定得通过数学的方式定义整个目标。而其实严格意义上来说，算力这件事是我们本身无法操控的，所以其实上最后的优化还是落在了 *算子的计算次数* 以及 *通信* 上面。我们可以以一个 **"平衡点"** 来定义整个优化目标，也就是说，对于一个 $MachineBalance=I$ 的卡来说，每从 HBM 里取 `1Byte` 的数据，我们得至少做 $I$ 次浮点计算，才能配得上这个卡的算力，否则，如果高于它，就是 *compute-bound*，低于它，则是 *memory-bound*，对应了不同的优化目标。

> 而整个课基本上都在不同层的数据传输带宽上做文章。

$$
MachineBalance=\frac{FLOP/s}{Byte/s}
$$

举一个例子，假设某个算子在 A100 上的算术强度是 `I=200FLOP/Byte`，A100 的内存带宽是 `2.04TB/s`，峰值算力是 `312TF`，平衡点是 `153`。问这个算子在 H100 上的情况（H100 内存带宽 `3.35TB/s`，峰值算力 `989TF`，平衡点 `295`）。

不难注意，这个算子在 A100 上属于 compute-bound 的情况，给了这么多字节但是算不完；而在 H100 上则是 memory-bound 的情况，没这么多字节给你算。它在 H100 上的实际算力就是 $3.35*200=670 TF$，也就是 $加速比=\frac{670}{312}=2.15$，而 H100 的算力提升实际上却是 $\frac{989}{312}=3.17$，差了 $\frac{(989-670)}{989}=32\%$。也就是说，我买一张 H100，其实上就用到了它 68% 的性能，也是算一次就亏一次钱。

那咋办呢，看这个公式，增加带宽可以做到，或者换一个词，增加通信效率。例如，*算子融合 (kernel fusion)*，我们把多个算子放在一起做，让各种数据从寄存器里拿出来直接开算，省去了存中间结果以及拿中间结果的 HBM 通信开销，那么带宽也就美美增加了，这也是我们后面会说到的 *FlashAttention* 等的思路。

### warp / block / etc...

感觉刚上手 GPU programming 的时候，应该最容易乱的就是这里。

首先我们应该区分出哪些是软件侧的实现和哪些是硬件侧的实现。

**软件侧：**

一个 Grid 相当于就是 GPU 本身，gridDim 就是一个 Grid 里有多少个 Block

一个 Block 就相当于是一个运行组，这个组里面的所有线程独占一个 SharedMemory

至于 Warp，它更像是软硬件的结合点。但是在写 kernel 的时候，还是要记得，虽然你写是以一个 `thread` 来写，但其实底层还是在调度一个 `warp`，做优化也应该从这一层来思考。

```
Grid                          ← 一次 kernel 启动的全部
├── Block 0                   ← 你指定有几个、每个多大
│   ├── Warp 0  (thread 0-31)     ← ⚠️ 你控制不了，硬件自动切
│   ├── Warp 1  (thread 32-63)
│   └── ...
├── Block 1
└── ...
```

**硬件侧**：

硬件底层是以 SM 作为调度单元的。每个 SM 又有 4 个 Partition，一个 Partition 又有 32 条 Lane。

```
GPU (A6000)
└── 84 × SM  (Streaming Multiprocessor)
    └── 4 × Partition          ← 每个有 1 个 warp scheduler
        └── 32 × Lane          ← 就是所谓的 "CUDA core"
```



聪明的你可能已经发现了，32 Lane，那不就和我们 Warp 有 32 个线程对上了吗？那一个 Partition 其实就是一个 Warp？太聪明了，你已经打通了软硬件的视角。这里的 32 Lane 其实就是每一个 Partition 会同时执行这 32 Lane 的同一条指令。而 4 Partition 自然也就代表每周期可以 issue 4 条不同的 warp 指令了。像这样向上分析，你也就能知道 SM 就是一个 Block 了。

![warp on SM](https://cdn.nova.gal/img/image-20260817182304837.png)

这么一思考，可能大概也许你就能把软硬件的视角打通了，做到写软件思考硬件，哈哈。



举一个🌰

```c++
__global__ void VecAddKernel(int* A, int* B, int* C, int n) {
    int i = blockDim.x * blockIdx.x + threadIdx.x;
    if (i < n) C[i] = A[i] + B[i];
}
// n = 1024
VecAddKernel<<<4, 256>>>(dA, dB, dC, 1024);
```

**软件侧**：

|                   | 数量  | 来源                                                         |
| ----------------- | ----- | ------------------------------------------------------------ |
| block             | 4     | 代码定义，一般就 `ceil(n / blockDim)`，例如这里就是 `ceil(1024 / 256)=4` |
| 每 block 线程     | 256   | 代码定义，一般就固定 `128 / 256`                             |
| **每 block warp** | **8** | `256 / 32`                                                   |
| 总 warp           | 32    | `4 × 8`                                                      |
| 总线程            | 1024  | `4 × 256`                                                    |

**索引怎么算的** —— 以 block 2 的第 5 号线程为例：

$i = \underbrace{256}_{\text{blockDim.x}} \times \underbrace{2}_{\text{blockIdx.x}} + \underbrace{5}_{\text{threadIdx.x}} = 517$

它负责 `C[517] = A[517] + B[517]`。**每个线程只干一个元素**，全部 1024 个线程覆盖整个数组。

**硬件侧**：

- 4 个 block → 派到 **4 个不同的 SM** → 不难发现 84 个 SM 里 **80 个全程闲置**
- 每个 SM 上的 8 个 warp → 均分给该 SM 的 4 个 partition，每个 partition 2 个 warp
- 每个 warp 的 32 个线程 → 32 条 lane 同时执行**同一条指令**



聪明的你一定发现了几个问题：

1. 如果 block 分少了，好像我的 SM 就闲置了啊。

   没错，所以如果可能的话，会推荐 $Block \ge 2\times SM$，给调度器找点事干。但是对于这种 $n=1024$ 的小规模问题，我们也只能优先保证 lane 不空转，也就是 $blockDim\mod 32 = 0$。

   在这种情况下，其实我们这个问题大概就可以分成 `<<<4, 256>>>`, `<<<8, 128>>>`, `<<<32, 32>>>` 这几种情况。

   不妨计算一下，其实他们总的 warp 数都是一样的，区别是用到 SM 的数量不同，第一个用了 4 个 SM，第三个用了 32 个 SM。

   那岂不是无脑选第三个？其实也不然。`<<<4, 256>>>` 每个 SM 内部 8 个 warp，SM 内部的延迟隐藏的比较好。而 `<<<32, 32>>>` 32 个 SM 同时 ISSUE 访存请求，地址请求单元的并行度就高一些

   但是两者在途的访存请求其实总数是一样的，都是 32 个 warp 发起的，所以其实上差距真不大。只要你不写成 `<<<164, 7>>>`，其实区别都不是很大啦。

2. 如果访存由 warp 发起，那岂不是一个 warp 会访存 32 次？

   那就不得不提到合并访存了。在新架构（Maxwell 之后），GPU 一次访存都是以 *32B 的 sector* 为最小访存单位，一个 cache line 就是 $4\times sector=128B$。

   所以一次访存，硬件就会收集 32 个地址，看他们落在哪些 sector 上，从而决定发几个 sector 请求。

   所以从最坏上看，是的，一个 warp 有可能访存 32 次，但我们肯定能确定这人写的是大分代码。

   一般来说我们一个线程可能读一个 float / int，那就是 4B，最优解肯定是都物理连续，这样就只需要 4 次 sector 请求，并且它们位于同一条 cache line 上，爽爆。

   > 说到这里，我们也顺带提一下 CUDA Kernel 里的规范，也就是默认以 threadIdx.x 为变化最快的方向来算 `tid`（数据的最后一维）
   > $$
   > \text{tid}_{\text{linear}} = \text{threadIdx.x} + \text{threadIdx.y}\cdot\text{blockDim.x} + \text{threadIdx.z}\cdot\text{blockDim.x}\cdot\text{blockDim.y}
   > $$
   > 举一个栗子🌰
   >
   > ```c++
   > dim3 block(16, 8);        // 二维 block
   > dim3 grid(10, 10);        // 二维 grid
   > myKernel<<<grid, block>>>(...);
   > ```
   >
   > 问 `thread(3, 5)` 落在它所在 block 的哪个 warp 里？
   >
   > 
   >
   > 一个懂二维数组的人说，这题简单。
   >
   > 一个 block 就是 `thread[16][8]`，所以 `thread[3][5]` 就是 $3\times8+5=29$，第一个 warp，于是他写出了类似我们刚才说的访存 32 次的大分代码。
   >
   > 
   >
   > 其实这里应该以 *矩阵* 的视角来看这个 Dim，`block(16, 8)` 的矩阵，x=16，y=8，应该是 `thread[8][16]`。
   >
   > > 好吧其实写到这里突然觉得挺显然的，但是没错我就是那个懂二维数组的猪头啊。
   >
   > 同理，这也引出了类似 Structure of Arrays 以及 Array of Structures 的问题，相信聪明的读者已经思考出了 Structure of Arrays 是更利于访存合并的，并且联想到了 PyTorch 里的类似 `stride()`、`contiguous` 都和这个有关系。
   >
   > 到 KVCache 的时候我们还会再涉及到这一坨东西。

好吧，突然就把访存合并的东西讲了。那接下来就讲一点分支发散的情况吧，其实都是优化相关的，就是要建立起这个概念：优化一定要从 warp 边界这个思路去考虑。

一个 warp 的 32 个线程**共用一个指令流**，如果遇到线程间结果不同的分支，硬件的做法是：**两条路径都执行一遍，各自用掩码关掉不该活跃的 lane。**
$$
T = T_{\text{if}} + T_{\text{else}}
$$

```c++
if (cond) { A(); }   // 16 lane 活跃，16 lane 空转
else      { B(); }   // 16 lane 活跃，16 lane 空转
```

这个优化手段就只能靠分支边界对齐到 warp 边界来解决

```c++
if (threadIdx.x % 2 == 0)      { ... }   // ❌ 每个 warp 内一半一半 → 2×
if (threadIdx.x / 32 % 2 == 0) { ... }   // ✅ 整个 warp 同进同出 → 零代价
```

不过，如果 `cond` 是一个数据相关的，那就没辙了，这也是我们尽量想要避免的，只能预先按条件把数据分组。（例如，在 MoE 里就叫 Token 按专家分组重排）

