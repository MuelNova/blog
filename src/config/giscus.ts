/**
 * Giscus Configuration
 * https://giscus.app/
 */

import { SITE_URL } from '../consts';

export const giscusConfig = {
	repo: 'MuelNova/Blog',
	repoId: 'R_kgDOIXU0aA',
	category: 'Announcements',
	categoryId: 'DIC_kwDOIXU0aM4CXB7m',
	reactionsEnabled: true,
	inputPosition: 'top' as const,
	lang: 'zh-CN', // 中文
	loading: 'lazy' as const,
    siteUrl: SITE_URL
};

export default giscusConfig;
