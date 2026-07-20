import type { SupportedLang } from '../locales';

export const home: Record<SupportedLang, Record<string, string>> = {
  en: {
    'home.intro': "If you see this, you know I'm still developing this site.",
    'home.latestPosts': 'Latest Posts',
    'home.socials.title': 'Socials',
    'hero.subtitle': 'welcome to my creamy corner',
    // Caveat is a latin-only font, so the sticker stays English in both locales.
    'hero.sticker': 'have a sweet day!',
  },
  zh: {
    'home.intro': '如果你看到这里，说明我还在开发这个站点。',
    'home.latestPosts': '最新文章',
    'home.socials.title': '社交链接',
    'hero.subtitle': '欢迎来到我的奶油小站',
    'hero.sticker': 'have a sweet day!',
  },
};
