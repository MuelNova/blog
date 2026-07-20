import type { SupportedLang } from "../locales";

export const home: Record<SupportedLang, Record<string, string>> = {
  en: {
    "home.intro": "If you see this, you know I'm still developing this site.",
    "home.latestPosts": "Latest Posts",
    "home.socials.title": "Socials",
    "hero.subtitle": "Pwning the world with my waifus.",
    // Caveat is a latin-only font, so the sticker stays English in both locales.
    "hero.sticker": "Simply Nova desu!",
  },
  zh: {
    "home.intro": "如果你看到这里，说明我还在开发这个站点。",
    "home.latestPosts": "最新文章",
    "home.socials.title": "社交链接",
    "hero.subtitle": "Pwning the world with my waifus.",
    "hero.sticker": "Tada no Nova!",
  },
};
