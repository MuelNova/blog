import type { APIContext } from 'astro';
import { getTheme, getThemeIds } from '../../config/themes';
import type { Theme } from '../../config/themes';

interface Props {
	theme: Theme;
}

const createGiscusCSS = (theme: Theme) => {
	const { colors, tone } = theme;
	const { background, foreground, primary, primaryDeep, primaryLightest, onPrimary, surface, accent, link, border, borderStrong, separator } = colors;

	// Helper function to create rgba colors with alpha
	const rgba = (color: string, alpha: number) => {
		const hex = color.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	};

	return `
/*!
 * Custom Giscus theme for Muir's Cream
 * Cream sticker design: warm cream palette, 2px strokes instead of
 * shadows, generous radii (12-16px controls, pill buttons).
 */

main {
	color-scheme: ${tone === 'dark' ? 'dark' : 'light'};

	/* Sticker radii — matches site scale (cards 20px, code 16px, controls 12px) */
	--borderRadius-small: 8px;
	--borderRadius-medium: 12px;
	--borderRadius-large: 16px;

	/* Syntax highlighting */
	--color-prettylights-syntax-comment: ${rgba(foreground, 0.6)};
	--color-prettylights-syntax-constant: ${primaryDeep};
	--color-prettylights-syntax-entity: ${accent};
	--color-prettylights-syntax-keyword: ${primary};
	--color-prettylights-syntax-string: ${primaryLightest};
	--color-prettylights-syntax-variable: ${foreground};

	/* Buttons — cream surface, 2px warm stroke, no shadow */
	--color-btn-text: ${foreground};
	--color-btn-bg: ${surface};
	--color-btn-border: ${borderStrong};
	--color-btn-shadow: 0 0 transparent;
	--color-btn-inset-shadow: 0 0 transparent;
	--color-btn-hover-bg: ${rgba(primary, 0.15)};
	--color-btn-hover-border: ${primary};
	--color-btn-active-bg: ${rgba(primary, 0.25)};
	--color-btn-active-border: ${primary};
	--color-btn-selected-bg: ${rgba(primary, 0.25)};
	--color-btn-counter-bg: ${rgba(foreground, 0.08)};

	/* Primary buttons — peach fill, warm brown text, hover one shade deeper */
	--color-btn-primary-text: ${onPrimary};
	--color-btn-primary-bg: ${primary};
	--color-btn-primary-border: ${borderStrong};
	--color-btn-primary-shadow: 0 0 transparent;
	--color-btn-primary-inset-shadow: 0 0 transparent;
	--color-btn-primary-hover-bg: ${primaryDeep};
	--color-btn-primary-hover-border: ${borderStrong};
	--color-btn-primary-selected-bg: ${primaryDeep};
	--color-btn-primary-selected-shadow: 0 0 transparent;
	--color-btn-primary-disabled-text: ${rgba(foreground, 0.5)};
	--color-btn-primary-disabled-bg: ${rgba(primary, 0.5)};
	--color-btn-primary-disabled-border: transparent;

	/* Foreground colors */
	--color-fg-default: ${foreground};
	--color-fg-muted: ${rgba(foreground, 0.7)};
	--color-fg-subtle: ${rgba(foreground, 0.5)};

	/* Canvas/background colors — cream background, card surface raised */
	--color-canvas-default: ${background};
	--color-canvas-overlay: ${surface};
	--color-canvas-inset: ${surface};
	--color-canvas-subtle: ${surface};

	/* Border colors — warm brown strokes instead of hairlines */
	--color-border-default: ${border};
	--color-border-muted: ${separator};

	/* Accent colors */
	--color-accent-fg: ${link};
	--color-accent-emphasis: ${primary};
	--color-accent-muted: ${rgba(primary, 0.4)};
	--color-accent-subtle: ${rgba(primary, 0.12)};

	/* Attention/success kept warm */
	--color-attention-subtle: ${rgba(primary, 0.15)};
	--color-success-fg: ${link};

	/* Neutral colors */
	--color-neutral-muted: ${rgba(foreground, 0.08)};

	/* Action list */
	--color-action-list-item-default-hover-bg: ${rgba(foreground, 0.05)};

	/* Reactions */
	--color-social-reaction-bg-hover: ${rgba(primary, 0.12)};
	--color-social-reaction-bg-reacted-hover: ${rgba(primary, 0.2)};
}

/*! Custom cream sticker styling */

/* Body text follows the site system font stack (iframe is cross-origin,
   so no @font-face — JetBrains Mono only when locally installed) */
main,
main textarea,
main input,
main .gsc-comment-content {
	font-family: "Noto Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

main code,
main pre {
	font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* Comment box — raised cream card with 2px sticker stroke */
.gsc-comment-box {
	background: ${surface};
	border: 2px solid ${borderStrong} !important;
	border-radius: 16px !important;
}

.gsc-comment-box-textarea,
.gsc-comment-box-textarea-extras {
	border-radius: 12px;
}

/* Inputs and textareas — 12px radius, 2px warm border */
main textarea,
main input[type="text"],
main input[type="search"] {
	border-radius: 12px !important;
}

main textarea:focus,
main input:focus {
	border-color: ${primary} !important;
	box-shadow: 0 0 0 3px ${rgba(primary, 0.25)} !important;
	outline: none;
}

/* Buttons — pill shape, 2px stroke */
main .btn {
	border-radius: 999px !important;
	border-width: 2px !important;
	font-weight: 600;
}

main .btn-primary {
	font-weight: 700;
}

/* Reaction pills */
.gsc-reaction-button,
.gsc-direct-reaction-button,
.gsc-social-reaction-summary {
	border-radius: 999px !important;
}

.gsc-reaction-button {
	border: 2px solid ${separator} !important;
}

.gsc-reaction-button g-emoji,
.gsc-reaction-button .gsc-reaction-button-count {
	font-family: inherit;
}

/* Hide reactions count */
.gsc-reactions-count {
	display: none;
}

/* Reverse timeline order - newest comments first */
.gsc-timeline {
	flex-direction: column-reverse;
	border-top: 2px dashed ${rgba(primary, 0.45)};
	padding-top: 1rem;
}

/* Header spacing */
.gsc-header {
	padding-bottom: 1rem;
}

/* Comment header spacing */
.gsc-comment-header {
	padding-top: 0.75rem !important;
}

/* Reorder comment sections */
.gsc-comments > .gsc-header {
	order: 1;
}

.gsc-comments > .gsc-comment-box {
	order: 2;
	margin-bottom: 1rem;
}

.gsc-comments > .gsc-timeline {
	order: 3;
}

/* Comment author name */
.gsc-comment-author {
	font-weight: 700;
}

/* Code blocks in comments - 16px radius cream sticker style */
div.gsc-comment-content div.highlight pre {
	border-radius: 16px;
	border: 2px solid ${border};
	background: ${surface};
	padding: 0.75rem 1rem;
}

/* Inline code in comments */
div.gsc-comment-content code {
	border-radius: 6px;
	background: ${rgba(foreground, 0.1)};
	padding: 0.125rem 0.375rem;
	color: ${foreground};
}

/* Blockquotes in comments — dashed cream accent like site prose */
div.gsc-comment-content blockquote {
	border-left: 4px solid ${rgba(primary, 0.6)};
	background: ${rgba(primary, 0.08)};
	border-radius: 0 12px 12px 0;
	padding: 0.25rem 0.75rem;
}

/* Placeholder text */
textarea::placeholder,
input::placeholder {
	color: ${rgba(foreground, 0.5)} !important;
}

/* Reply section spacing */
.gsc-replies {
	padding-top: 0 !important;
}

/* Loading spinner */
main .gsc-loading-image {
	background-image: url("https://github.githubassets.com/images/mona-loading-dimmed.gif");
}

/* Homepage background */
.gsc-homepage-bg {
	background-color: ${background};
}

/* Links */
main a {
	color: ${link};
	text-decoration: none;
}

main a:hover {
	text-decoration: underline;
	color: ${primaryDeep};
}
`;
};

export async function GET(context: APIContext) {
	const { theme } = context.props as Props;
	const css = createGiscusCSS(theme);
	
	return new Response(css, {
		headers: {
			'Access-Control-Allow-Origin': 'https://giscus.app',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Cache-Control': 'public, max-age=31536000, immutable',
			'Content-Type': 'text/css; charset=utf-8',
		},
	});
}

export async function getStaticPaths() {
	const themeIds = await getThemeIds();
	
	const paths = await Promise.all(
		themeIds.map(async (themeId) => {
			const theme = await getTheme(themeId);
			
			return {
				params: { theme: themeId },
				props: { theme },
			};
		})
	);
	
	return paths;
}
