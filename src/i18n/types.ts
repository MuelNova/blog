/**
 * i18n 类型定义
 * 
 * 提供翻译键的类型安全和自动补全
 */

import type { common } from './messages/common';
import type { home } from './messages/home';
import type { about } from './messages/about';
import type { blog } from './messages/blog';
import type { share } from './messages/share';
import type { links } from './messages/links';
import type { SupportedLang } from './locales';

/**
 * 从所有消息模块中提取键的联合类型
 */
type ExtractKeys<T> = T extends Record<SupportedLang, infer Messages>
  ? Messages extends Record<string, string>
    ? keyof Messages
    : never
  : never;

/**
 * 所有翻译键的联合类型
 * 
 * @example
 * const key: TranslationKey = 'common.nav.home';  // ✅ 正确
 * const key: TranslationKey = 'common.nav.homee'; // ❌ TypeScript 错误
 */
export type TranslationKey =
  | ExtractKeys<typeof common>
  | ExtractKeys<typeof home>
  | ExtractKeys<typeof about>
  | ExtractKeys<typeof blog>
  | ExtractKeys<typeof share>
  | ExtractKeys<typeof links>;

/**
 * 翻译函数类型
 */
export type TranslationFunction = (key: TranslationKey) => string;

/**
 * 按命名空间分组的翻译键类型
 */
export type CommonKeys = ExtractKeys<typeof common>;
export type HomeKeys = ExtractKeys<typeof home>;
export type AboutKeys = ExtractKeys<typeof about>;
export type BlogKeys = ExtractKeys<typeof blog>;
export type ShareKeys = ExtractKeys<typeof share>;
export type LinksKeys = ExtractKeys<typeof links>;
