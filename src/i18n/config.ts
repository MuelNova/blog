import {
  getAbsoluteLocaleUrl,
  getAbsoluteLocaleUrlList,
  getLocaleByPath,
  getPathByLocale,
  getRelativeLocaleUrl,
  getRelativeLocaleUrlList,
  middleware,
  notFound,
  pathHasLocale,
  redirectToDefaultLocale,
  redirectToFallback,
  requestHasLocale,
} from 'astro:i18n';
import { languages, defaultLang, prefixDefaultLocale, monthNames } from './locales';
import type { SupportedLang } from './locales';
import { messageModules, type MessageModuleName } from './messages';
import { common } from './messages/common';
import { home } from './messages/home';
import { about } from './messages/about';
import { blog } from './messages/blog';
import { share } from './messages/share';
import { links } from './messages/links';

type TranslationDict = Record<SupportedLang, Record<string, string>>;

function createEmptyDictionary(): TranslationDict {
  return Object.fromEntries(
    Object.keys(languages).map((lang) => [lang, {} as Record<string, string>])
  ) as TranslationDict;
}

function mergeTranslations(...parts: TranslationDict[]): TranslationDict {
  return parts.reduce((acc, part) => {
    (Object.keys(acc) as SupportedLang[]).forEach((lang) => {
      Object.assign(acc[lang], part[lang] ?? {});
    });
    return acc;
  }, createEmptyDictionary());
}

const dictionaries: Record<MessageModuleName, TranslationDict> = {
  common,
  home,
  about,
  blog,
  share,
  links,
};

const ui: TranslationDict = mergeTranslations(
  ...messageModules.map((name) => dictionaries[name])
);

export function isLang(value: string | undefined): value is SupportedLang {
  return !!value && Object.hasOwn(languages, value);
}

export function useTranslations(lang: SupportedLang): import('./types').TranslationFunction {
  const dict = ui[lang] ?? ui[defaultLang];
  return (key) => dict[key] ?? ui[defaultLang][key] ?? key;
}

export function formatDate(date: Date, lang: SupportedLang) {
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export type Lang = SupportedLang;


// NOTE(theme-loader coupling): ThemeLoader uses locale codes to detect localized home routes
// (e.g. '/', '/zh', '/zh/index.html') during early theme bootstrap.
// If i18n routing strategy changes (locale prefixes, homepage patterns, or default-locale behavior),
// update `src/components/ThemeLoader.astro` homepage detection logic accordingly.
export function resolveLang(pathname: string): Lang {
  try {
    const locale = getLocaleByPath(pathname);
    if (locale && isLang(locale)) return locale;
  } catch (_err) {
    // Path may be default-locale without prefix; fall back safely.
  }
  return defaultLang;
}

export { languages, defaultLang, prefixDefaultLocale, monthNames };
export { messageModules };
export type { SupportedLang };

// 导出类型安全的翻译相关类型
export type { TranslationKey, TranslationFunction } from './types';

export {
  getRelativeLocaleUrl,
  getAbsoluteLocaleUrl,
  getRelativeLocaleUrlList,
  getAbsoluteLocaleUrlList,
  getPathByLocale,
  getLocaleByPath,
  pathHasLocale,
  redirectToDefaultLocale,
  redirectToFallback,
  notFound,
  middleware,
  requestHasLocale,
};
