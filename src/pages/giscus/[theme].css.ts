import type { APIContext } from 'astro';
import { getTheme, getThemeIds } from '../../config/themes';
import type { Theme, ThemeColors } from '../../config/themes';

interface Props {
	theme: Theme;
}

const createGiscusCSS = (colors: ThemeColors) => {
	const { background, foreground, primary, primaryLight, primaryLightest, accent, link } = colors;
	
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
 * Custom Giscus theme for MuelNova's Blog
 * Based on current site theme colors
 */

main {
	/* Syntax highlighting */
	--color-prettylights-syntax-comment: ${rgba(foreground, 0.6)};
	--color-prettylights-syntax-constant: ${primaryLight};
	--color-prettylights-syntax-entity: ${accent};
	--color-prettylights-syntax-keyword: ${primary};
	--color-prettylights-syntax-string: ${primaryLightest};
	--color-prettylights-syntax-variable: ${foreground};
	
	/* Buttons */
	--color-btn-text: ${foreground};
	--color-btn-bg: transparent;
	--color-btn-border: ${rgba(foreground, 0.2)};
	--color-btn-shadow: 0 0 transparent;
	--color-btn-inset-shadow: 0 0 transparent;
	--color-btn-hover-bg: ${rgba(primary, 0.1)};
	--color-btn-hover-border: ${rgba(primary, 0.4)};
	--color-btn-active-bg: ${rgba(primary, 0.15)};
	--color-btn-selected-bg: ${rgba(primary, 0.15)};
	
	/* Primary buttons */
	--color-btn-primary-text: ${background};
	--color-btn-primary-bg: ${primary};
	--color-btn-primary-border: transparent;
	--color-btn-primary-shadow: 0 0 12px ${rgba(primary, 0.3)};
	--color-btn-primary-hover-bg: ${primary};
	--color-btn-primary-selected-bg: ${primary};
	
	/* Foreground colors */
	--color-fg-default: ${foreground};
	--color-fg-muted: ${rgba(foreground, 0.7)};
	--color-fg-subtle: ${rgba(foreground, 0.5)};
	
	/* Canvas/background colors */
	--color-canvas-default: ${background};
	--color-canvas-overlay: ${rgba(foreground, 0.05)};
	--color-canvas-inset: ${rgba(foreground, 0.05)};
	--color-canvas-subtle: ${background};
	
	/* Border colors */
	--color-border-default: ${rgba(foreground, 0.15)};
	--color-border-muted: ${rgba(foreground, 0.1)};
	
	/* Accent colors */
	--color-accent-fg: ${link};
	--color-accent-emphasis: ${primary};
	--color-accent-muted: ${rgba(primary, 0.4)};
	--color-accent-subtle: ${rgba(primary, 0.1)};
	
	/* Neutral colors */
	--color-neutral-muted: ${rgba(foreground, 0.1)};
	
	/* Action list */
	--color-action-list-item-default-hover-bg: ${rgba(foreground, 0.05)};
	
	/* Reactions */
	--color-social-reaction-bg-hover: ${rgba(foreground, 0.1)};
	--color-social-reaction-bg-reacted-hover: ${rgba(primary, 0.15)};
}

/*! Custom styling */

/* Hide reactions count */
.gsc-reactions-count {
	display: none;
}

/* Reverse timeline order - newest comments first */
.gsc-timeline {
	flex-direction: column-reverse;
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

/* Code blocks in comments - 直角设计，符合极简主义 */
div.gsc-comment-content div.highlight pre {
	border-radius: 0;
	border: 0px solid ${rgba(foreground, 0.15)};
	background: ${rgba(foreground, 0.03)};
}

/* Inline code in comments - 直角设计 */
div.gsc-comment-content code {
	border-radius: 0;
	background: ${rgba(foreground, 0.1)};
	padding: 0.125rem 0.375rem;
	color: ${foreground};
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
	color: ${primaryLight};
}
`;
};

export async function GET(context: APIContext) {
	const { theme } = context.props as Props;
	const css = createGiscusCSS(theme.colors);
	
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
