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

*08/11*：更新了[Lecture1](https://llmsystem.github.io/llmsystem2026fall/assets/files/llmsys-01-intro-e4fe7d3230b64f7bfc2bfa4e0060be43.pdf)

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

## Lecture 01

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



然后 LLM 一般就是分成三类，Encoder Only / Decoder Only / Encoder & Decoder

其实这里我一直觉得名字很神秘，Encoder 和 Decoder 很容易想成是密码学里面那种编解码的东西。硬要说的话 Encoder 就是编码一个词与其他词之间关系的这么一个东西吧！

#### Encoder-only

对于 Encoder Only，他们是*非自回归（Non-autoregressive, NAR）*的，以 *BERT* 为例，它实际上就是具体在这个 *B(idirection)* 上，它是能看到双向（前、后）信息的，通过掩码预测的方式训练。
$$
P(x_{mask}\mid x)
$$
这个好处一眼就能看出来，以翻译来说，所有的 $y_t$ 都不依赖于 $y_{<t}$，而都只依赖于 $x$，这也就说明我们可以直接并行去生成，速度显然好；

坏处也很明显，之前产生的东西没法看到，这种 *条件独立* 很容易带来 *多峰问题（Multimodality Problem）*。

> 举个最简单的例子：“翻译 teacher成中文“。
>
> 在这个任务上，假设训练集里面 "老师" 和 "先生" 分布平均。
>
> 第一个位置看，选了 "老"；第二个位置看，选了 "生"。
>
> 结果答案就变成了 "老生"。
>
> $P(y_1,y_2)\ne P(y_1)P(y_2)$

除此之外，这种 Encoder-only 的模型也事先需要长度信息，所以一般不咋用。

:::danger 注意

在 AI review 这段的时候，发现其实有一些歧义。其实也就是我把 *NAR* 的各种特性套在了 *BERT* 上。而事实上，*BERT* 更多处理分类、检索等工作，而不是 *生成* 。

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
