import { getContainerRenderer as getMDXRenderer } from '@astrojs/mdx';
import rss from '@astrojs/rss';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getCollection, render } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import { transform, walk } from 'ultrahtml';
import sanitize from 'ultrahtml/transformers/sanitize';
import { SITE_DESCRIPTION, SITE_TITLE } from '../../consts';
import { getPostBaseId, getPostLang } from '../../i18n/i18n';

function decodeHtmlEntities(value) {
	return value
		.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_match, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/\u007f/g, '\n');
}

function escapeHtml(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function stripHtmlTags(value) {
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, ''));
}

function normalizeExpressiveCodeBlocks(html) {
	return html.replace(/<div class="expressive-code">[\s\S]*?<\/figure><\/div>/g, (block) => {
		const languageMatch = block.match(/<pre[^>]*data-language="([^"]+)"/);
		const rawCodeMatch = block.match(/data-code="([\s\S]*?)"/);

		let codeText = rawCodeMatch ? decodeHtmlEntities(rawCodeMatch[1]) : '';
		if (!codeText) {
			const lineMatches = [...block.matchAll(/<div class="ec-line"><div class="code">([\s\S]*?)<\/div><\/div>/g)];
			codeText = lineMatches.map((line) => stripHtmlTags(line[1])).join('\n');
		}

		const normalizedCode = codeText.replace(/\u007f/g, '\n').trimEnd();
		if (!normalizedCode) {
			return '';
		}

		const languageClass = languageMatch ? ` class="language-${languageMatch[1]}"` : '';
		return `<pre><code${languageClass}>${escapeHtml(normalizedCode)}</code></pre>`;
	});
}

function sanitizeFeedHtml(html) {
	return sanitizeHtml(html, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat([
			'img',
			'figure',
			'figcaption',
			'pre',
			'code',
			'span',
			'del',
			'ins',
			'mark',
			'sub',
			'sup',
			'kbd',
			'samp',
			'var',
		]),
		allowedAttributes: {
			a: ['href', 'name', 'target', 'rel'],
			img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
			code: ['class'],
			span: ['class'],
			'*': ['id'],
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		parser: { decodeEntities: true },
	});
}

export async function GET(context) {
	let baseUrl = context.site?.href || 'https://example.com';
	if (baseUrl.at(-1) === '/') {
		baseUrl = baseUrl.slice(0, -1);
	}

	const renderers = await loadRenderers([getMDXRenderer()]);
	const container = await AstroContainer.create({ renderers });

	const posts = (await getCollection('blog'))
		.filter((post) => !post.data.unlisted && getPostLang(post) === 'zh')
		.sort((a, b) => (a.data.pubDate > b.data.pubDate ? -1 : 1));

	const feedItems = [];
	for (const post of posts) {
		const { Content } = await render(post);
		const rawContent = await container.renderToString(Content);
		const cleanedRawContent = normalizeExpressiveCodeBlocks(rawContent);
		const link = `/zh/blog/${getPostBaseId(post)}/`;
		const content = await transform(cleanedRawContent.replace(/^<!DOCTYPE html>/, ''), [
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
		const sanitizedContent = sanitizeFeedHtml(content);

		feedItems.push({
			...post.data,
			link,
			content: sanitizedContent,
		});
	}

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: baseUrl,
		items: feedItems,
	});
}
