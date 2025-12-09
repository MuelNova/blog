/**
 * Markdown utility functions
 */

/**
 * Strip Markdown syntax from text
 * Useful for displaying plain text in previews
 */
export function stripMarkdown(text: string): string {
	if (!text) return '';
	
	return text
		// Remove images: ![alt](url)
		.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
		// Remove links: [text](url) -> text
		.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
		// Remove bold/italic: **text** or *text* -> text
		.replace(/(\*\*|__)(.*?)\1/g, '$2')
		.replace(/(\*|_)(.*?)\1/g, '$2')
		// Remove inline code: `code` -> code
		.replace(/`([^`]+)`/g, '$1')
		// Remove headers: ## text -> text
		.replace(/^#+\s+/gm, '')
		// Remove blockquotes: > text -> text
		.replace(/^>\s+/gm, '')
		// Remove HTML tags
		.replace(/<\/?[^>]+(>|$)/g, '')
		// Clean up extra whitespace
		.replace(/\s+/g, ' ')
		.trim();
}
