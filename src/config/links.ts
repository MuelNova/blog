import type { SupportedLang } from "../i18n/locales";
import { defaultLang } from "../i18n/config";

export interface LinkCardProps {
  link: string;
  linkText: string;
  description: string;
  icon?: string;
}

type LocalizedLink = {
  link: string;
  icon?: string;
  linkText: Record<SupportedLang, string>;
  description: Record<SupportedLang, string>;
};

const localizedLinks: LocalizedLink[] = [
  {
    link: "https://silente.dev/",
    linkText: {
      en: "Shark Blog",
      zh: "Shark Blog",
    },
    description: {
      en: "SilentE is a blockchain guru, killing it in Web3 and fluent in web security.",
      zh: "SilentE 是区块链大师，Web3 米恰飞起来了，又会 Web 安全，太厉害了",
    },
    icon: "https://silente.dev/favicon.svg",
  },
  {
    link: "https://blog.hzao.top/",
    linkText: {
      en: "Hzao's Blog",
      zh: "Hzao's Blog",
    },
    description: {
      en: "Hzao is a Swift expert, WWDC23 Swift Student Challenge winner, and Google intern—ridiculously good.",
      zh: "Hzao 是 Swift 大师，获得了 WWDC23 Swift Student Challenge 大奖，又去 Google 实习，太牛了",
    },
    icon: "https://secure.gravatar.com/avatar/d73560fa4904678be8395e90446b6ffb",
  },
  {
    link: "https://blog.junyu33.me/",
    linkText: {
      en: "Junyu's Blog",
      zh: "Junyu's Blog",
    },
    description: {
      en: "Junyu is a cryptography ace from UESTC; we studied at NUS together, and his PWN chops are sharp.",
      zh: "Junyu 是川大的密码学大师，曾经和我一起在 NUS 进行交流学习，PWN 水平也很高，实在是厉害。",
    },
    icon: "https://junyu33.me/img/avatar.jpg",
  },
  {
    link: "https://rocketma.dev/",
    linkText: {
      en: "RocketMaDev",
      zh: "RocketMaDev",
    },
    description: {
      en: "RocketMa, Pwner, hacks for fun.",
      zh: "RocketMa，Pwner, Hack for Fun.",
    },
    icon: "https://rocketma.dev/images/avatar.png",
  },
  {
    link: "https://www.haoqiguai.site/",
    linkText: {
      en: "奇怪的轩轩",
      zh: "奇怪的轩轩",
    },
    description: {
      en: "Younger teammate who started PWN in sophomore year, progressing fast, loves Nainai Dragon (lol).",
      zh: "同组的学弟，大二开始学 Pwn，进度非常快，喜欢奶龙（笑）",
    },
    icon: "https://img.notionusercontent.com/s3/prod-files-secure%2F647dfbeb-5527-4768-ae58-86e7a56d9e84%2Faa4b7b3e-c7ed-44f7-a747-0f5cbeb2d8bb%2F%E5%A5%B6%E9%BE%991.webp/size/w=800?exp=1765471005&sig=f1dKycUmusJmdbX6LpLw15NKSP12cmaVhm47VaQN1Zs&id=13cf358e-6f8b-8128-a832-000b901b75fa&table=collection&userId=c00961db-e27a-40f1-aa6e-8c40e80b89ee",
  },
  {
    link: "https://www.fei3ei.xyz/",
    linkText: {
      en: "fei3ei",
      zh: "fei3ei",
    },
    description: {
      en: "Reverse engineer from Vidar-Team (Class of 2021), now in game security.",
      zh: "21 届 vidar-tream ( vidar-team? ) 的逆向手，目前在游戏安全",
    },
    icon: "https://www.fei3ei.xyz/favicon.ico",
  },
  {
    link: "https://blog.kingbridges.top/",
    linkText: {
      en: "BRIdGE's blog",
      zh: "BRIdGE's blog",
    },
    description: {
      en: "Gemini says this blog feels human, not AI-written docs—broad, quirky, and a bit cyber-mad.",
      zh: "Gemini: 看起来不像那种由 AI 生成或者堆砌枯燥教程的「技术文档站」，这个博客更有「人味儿」。自称「赛博疯子」可能暗示了博主的涉猎范围很广，想法天马行空，或者对当下的科技生活有着某种狂热甚至戏谑的态度。",
    },
    icon: "https://blog.kingbridges.top/images/avatar.jpg",
  },
  {
    link: "https://bestwing.me/",
    linkText: {
      en: "Swing's blog",
      zh: "Swing's Blog",
    },
    description: {
      en: "CTF Player @FlappyPig @r3kapig · Security researcher",
      zh: "CTF Player @FlappyPig @r3kapig · 安全研究员",
    },
    icon: "https://bestwing.me/images/favicon.svg",
  },
  {
    link: "https://cainyzb.github.io/",
    linkText: {
      en: "Cain's Blog",
      zh: "Cain's Blog",
    },
    description: {
      en: "Misc / AI Pro in @r3kapig & @MoonshotAI, my mentor in MoonshotAI",
      zh: "Misc / AI 大神，在 @r3kapig 和 @MoonshotAI，太有实力了，是我在月暗的 mentor",
    },
    icon: "https://cainyzb.github.io/images/Cain.png",
  },
];

export function getLinksByLang(lang: SupportedLang): LinkCardProps[] {
  return localizedLinks.map(({ link, icon, linkText, description }) => ({
    link,
    icon,
    linkText: linkText[lang] ?? linkText[defaultLang],
    description: description[lang] ?? description[defaultLang],
  }));
}

export { localizedLinks };
