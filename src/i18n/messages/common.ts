import type { SupportedLang } from '../locales';

export const common: Record<SupportedLang, Record<string, string>> = {
  en: {
    'common.nav.home': 'Home',
    'common.nav.blog': 'Blog',
    'common.nav.about': 'About',
    'common.nav.friends': 'Friends',
    'common.nav.theme': 'Theme',
    'common.nav.language': 'Language',
    'common.theme.dark': 'Dark',
    'common.theme.light': 'Light',
    'common.theme.system': 'System',
    'common.theme.intro': 'Intro',
    'common.mobileMenu': 'Mobile menu',
    'common.footer.rights': 'All rights reserved.',
    'common.toc.title': 'Table of Contents',
  },
  zh: {
    'common.nav.home': '首页',
    'common.nav.blog': '博客',
    'common.nav.about': '关于',
    'common.nav.friends': '友链',
    'common.nav.theme': '主题',
    'common.nav.language': '语言',
    'common.theme.dark': '暗色',
    'common.theme.light': '亮色',
    'common.theme.system': '跟随系统',
    'common.theme.intro': '开场动画',
    'common.mobileMenu': '移动端菜单',
    'common.footer.rights': '保留所有权利。',
    'common.toc.title': '目录',
  },
};
