export const languages = {
  en: 'English',
  zh: '简体中文',
} as const;

export type SupportedLang = keyof typeof languages;
export const defaultLang: SupportedLang = 'en';
export const prefixDefaultLocale = false;

export const monthNames: Record<SupportedLang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  zh: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
};
