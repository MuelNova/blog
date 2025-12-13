import type { SupportedLang } from '../locales';
import { defaultLang } from '../locales';

const quickInfo: Record<SupportedLang, string[]> = {
  en: [
    'Pwning Systems since 1895',
    'Full Queue Developer',
    'Computer Master when Using AI',
  ],
  zh: [
    '自 1895 年起开始 Pwn 系统',
    '全队列工程师',
    '计算机大师（使用 AI 时）',
  ],
} as const;

export function getQuickInfo(lang: SupportedLang) {
  return quickInfo[lang] ?? quickInfo[defaultLang];
}
