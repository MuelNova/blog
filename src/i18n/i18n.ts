/**
 * 博客多语言内容工具函数
 * 
 * 基于文件名后缀组织多语言内容：
 * - src/content/blog/my-post.md → 默认语言
 * - src/content/blog/my-post.zh.md → 中文版本
 * - src/content/blog/my-post.en.md → 英文版本
 * 
 * 注意：Astro 的 id 会删除文件名中的点号：
 * - my-post.zh.md → ID: "my-postzh"
 * - my-post.md → ID: "my-post"
 * 
 * 因此我们使用 post.filePath 来获取真实的文件名和语言信息
 */

import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Lang } from './config';
import { defaultLang } from './config';

/**
 * 从文件路径中提取语言信息
 * 
 * @param filePath - 文件路径（如 "2025-08-12-walking-for-the-loneliness.zh.md"）
 * @returns 语言代码
 */
function getLangFromFilePath(filePath: string): Lang {
  // 匹配文件名中的语言后缀：.xx.md 或 .xx.mdx
  const match = filePath.match(/\.([a-z]{2})\.(md|mdx)$/);
  if (match && ['en', 'zh'].includes(match[1])) {
    return match[1] as Lang;
  }
  return defaultLang;
}

/**
 * 从文件路径中提取基础文件名（不含语言后缀和扩展名）
 * 
 * @param filePath - 文件路径
 * @returns 基础文件名
 * 
 * @example
 * getBaseNameFromFilePath("my-post.zh.md") // => "my-post"
 * getBaseNameFromFilePath("my-post.md") // => "my-post"
 */
function getBaseNameFromFilePath(filePath: string): string {
  // 提取文件名（不含路径）
  const fileName = filePath.split('/').pop() || filePath;
  
  // 移除语言后缀和文件扩展名
  // my-post.zh.md → my-post
  // my-post.md → my-post
  return fileName
    .replace(/\.([a-z]{2})\.(md|mdx)$/, '') // 移除 .xx.md(x)
    .replace(/\.(md|mdx)$/, '')             // 移除 .md(x)
    .replace(/[\[\]]/g, '');                 // 移除方括号（URL 不安全字符）
}

/**
 * 从文章对象中获取语言信息
 * 
 * 优先级：
 * 1. post.data.lang (frontmatter 中的 lang 字段) - 最高优先级
 * 2. filePath 中的语言后缀（如 .zh.md）
 * 3. defaultLang（回退）
 * 
 * @param post - 文章对象
 * @returns 文章的语言
 */
export function getPostLang(post: CollectionEntry<'blog'>): Lang {
  // 优先级 1: frontmatter 中明确指定的 lang
  if (post.data.lang) {
    return post.data.lang;
  }
  
  // 优先级 2: 从文件路径推断
  if (post.filePath) {
    return getLangFromFilePath(post.filePath);
  }
  
  // 优先级 3: 默认语言
  return defaultLang;
}

/**
 * 从文章对象中获取基础标识（用于匹配不同语言版本）
 * 
 * @param post - 文章对象
 * @returns 基础标识
 */
export function getPostBaseId(post: CollectionEntry<'blog'>): string {
  if (!post.filePath) {
    return post.id;
  }
  return getBaseNameFromFilePath(post.filePath);
}

/**
 * 构建特定语言版本的文章 ID
 * 
 * 注意：由于 Astro 会删除点号，这个函数返回的是实际的 Astro ID
 * 
 * @param post - 源文章对象
 * @param lang - 目标语言
 * @returns Astro 生成的 ID
 */
export function buildPostId(post: CollectionEntry<'blog'>, lang: Lang): string {
  const baseName = getPostBaseId(post);
  
  if (lang === defaultLang) {
    // 默认语言：my-post.md → "my-post"
    return baseName;
  } else {
    // 其他语言：my-post.zh.md → "my-postzh" (点号被删除)
    return `${baseName}${lang}`;
  }
}

/**
 * 获取指定语言的所有文章
 * 
 * @param lang - 目标语言
 * @param options - 过滤选项
 * @returns 该语言的文章列表（按发布日期降序）
 */
export async function getPostsByLang(
  lang: Lang,
  options?: { includeUnlisted?: boolean }
): Promise<CollectionEntry<'blog'>[]> {
  const allPosts = await getCollection('blog');
  
  return allPosts
    .filter(post => {
      // 排除未列出的文章（除非明确要求包含）
      if (!options?.includeUnlisted && post.data.unlisted) {
        return false;
      }
      
      return getPostLang(post) === lang;
    })
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/**
 * 查找文章的指定语言翻译版本
 * 
 * @param post - 源文章对象
 * @param targetLang - 目标语言
 * @returns 翻译版本的文章，如果不存在则返回 null
 */
export async function getPostTranslation(
  post: CollectionEntry<'blog'>,
  targetLang: Lang
): Promise<CollectionEntry<'blog'> | null> {
  const baseId = getPostBaseId(post);
  const allPosts = await getCollection('blog');
  
  // 查找具有相同 baseId 和目标语言的文章
  return allPosts.find(p => 
    getPostBaseId(p) === baseId && getPostLang(p) === targetLang
  ) ?? null;
}

/**
 * 获取文章的所有可用语言版本
 * 
 * @param post - 文章对象
 * @returns 所有语言版本的数组
 */
export async function getPostLanguages(
  post: CollectionEntry<'blog'>
): Promise<Array<{ lang: Lang; post: CollectionEntry<'blog'> }>> {
  const baseId = getPostBaseId(post);
  const allPosts = await getCollection('blog');
  
  const versions: Array<{ lang: Lang; post: CollectionEntry<'blog'> }> = [];
  
  // 查找所有相关文章
  for (const p of allPosts) {
    if (getPostBaseId(p) === baseId) {
      versions.push({ lang: getPostLang(p), post: p });
    }
  }
  
  // 按语言排序（默认语言优先）
  return versions.sort((a, b) => {
    if (a.lang === defaultLang) return -1;
    if (b.lang === defaultLang) return 1;
    return a.lang.localeCompare(b.lang);
  });
}

/**
 * 检查文章是否有翻译版本
 * 
 * @param post - 文章对象
 * @returns 是否存在多个语言版本
 */
export async function hasTranslations(post: CollectionEntry<'blog'>): Promise<boolean> {
  const languages = await getPostLanguages(post);
  return languages.length > 1;
}

/**
 * 获取所有文章，优先显示指定语言的版本
 * 
 * @param lang - 目标语言
 * @param options - 过滤选项
 * @returns 文章列表，每篇文章优先返回目标语言版本（按发布日期降序）
 * 
 * @example
 * // 如果有 my-post.md 和 my-post.zh.md
 * // 在中文界面下，返回 my-post.zh
 * // 在英文界面下，返回 my-post.md
 * // 如果只有 my-post.md，两种语言都返回它
 */
export async function getAllPostsWithPreferredLang(
  lang: Lang,
  options?: { includeUnlisted?: boolean }
): Promise<CollectionEntry<'blog'>[]> {
  const allPosts = await getCollection('blog');
  
  // 按 baseId 分组
  const postsByBaseId = new Map<string, CollectionEntry<'blog'>[]>();
  
  for (const post of allPosts) {
    // 排除未列出的文章（除非明确要求包含）
    if (!options?.includeUnlisted && post.data.unlisted) {
      continue;
    }
    
    const baseId = getPostBaseId(post);
    if (!postsByBaseId.has(baseId)) {
      postsByBaseId.set(baseId, []);
    }
    postsByBaseId.get(baseId)!.push(post);
  }
  
  // 为每个 baseId 选择最合适的版本
  const selectedPosts: CollectionEntry<'blog'>[] = [];
  
  for (const posts of postsByBaseId.values()) {
    let selectedPost = posts.find(p => getPostLang(p) === lang);
    // 如果没有目标语言版本，选择默认语言版本
    if (!selectedPost) {
      selectedPost = posts.find(p => getPostLang(p) === defaultLang);
    }
    
    // 如果还是没有，选择第一个版本
    if (!selectedPost) {
      selectedPost = posts[0];
    }
    
    selectedPosts.push(selectedPost);
  }
  
  // 按发布日期降序排序
  return selectedPosts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
