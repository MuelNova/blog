import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../../consts';
import { getPostBaseId } from '../../i18n/i18n';

export async function GET(context) {
	const posts = (await getCollection('blog')).filter((post) => !post.data.unlisted);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			...post.data,
			link: `/blog/${getPostBaseId(post)}/`,
		})),
	});
}
