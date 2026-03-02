import { getContainerRenderer as getMDXRenderer } from '@astrojs/mdx';
import rss from '@astrojs/rss';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getCollection, render } from 'astro:content';
import { transform, walk } from 'ultrahtml';
import sanitize from 'ultrahtml/transformers/sanitize';
import { SITE_DESCRIPTION, SITE_TITLE } from '../../consts';
import { getPostBaseId } from '../../i18n/i18n';

export async function GET(context) {
	let baseUrl = context.site?.href || 'https://example.com';
	if (baseUrl.at(-1) === '/') {
		baseUrl = baseUrl.slice(0, -1);
	}

	const renderers = await loadRenderers([getMDXRenderer()]);
	const container = await AstroContainer.create({ renderers });

	const posts = (await getCollection('blog'))
		.filter((post) => !post.data.unlisted)
		.sort((a, b) => (a.data.pubDate > b.data.pubDate ? -1 : 1));

	const feedItems = [];
	for (const post of posts) {
		const { Content } = await render(post);
		const rawContent = await container.renderToString(Content);
		const link = `/blog/${getPostBaseId(post)}/`;
		const content = await transform(rawContent.replace(/^<!DOCTYPE html>/, ''), [
			async (node) => {
				await walk(node, (currentNode) => {
					if (currentNode.name === 'a' && currentNode.attributes.href?.startsWith('/')) {
						currentNode.attributes.href = baseUrl + currentNode.attributes.href;
					}
					if (currentNode.name === 'img' && currentNode.attributes.src?.startsWith('/')) {
						currentNode.attributes.src = baseUrl + currentNode.attributes.src;
					}
				});
				return node;
			},
			sanitize({ dropElements: ['script', 'style'] }),
		]);

		feedItems.push({
			...post.data,
			link,
			content,
		});
	}

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: baseUrl,
		items: feedItems,
	});
}
