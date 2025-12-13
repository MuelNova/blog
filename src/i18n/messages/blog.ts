import type { SupportedLang } from '../locales';

export const blog: Record<SupportedLang, Record<string, string>> = {
  en: {
    'blog.filters': 'Filters',
    'blog.filterLabel': 'Filter',
    'blog.tags': 'Tags',
    'blog.date': 'Date',
    'blog.dateFilter': 'Date Filter',
    'blog.posts': 'Blog Posts',
    'blog.clearTags': 'Clear tag filter',
    'blog.clearDate': 'Clear date filter',
    'blog.lastUpdated': 'Last updated on',
  },
  zh: {
    'blog.filters': '筛选',
    'blog.filterLabel': '筛选',
    'blog.tags': '标签',
    'blog.date': '日期',
    'blog.dateFilter': '日期筛选',
    'blog.posts': '文章列表',
    'blog.clearTags': '清除标签筛选',
    'blog.clearDate': '清除日期筛选',
    'blog.lastUpdated': '最近更新',
  },
};
