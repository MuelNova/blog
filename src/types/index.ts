/**
 * Shared TypeScript types for the blog
 */

/**
 * Social media link with icon
 */
export interface Social {
	name: string;
	url: string;
	icon: string; // Iconify name (e.g., "ph:github-logo-duotone")
}

/**
 * Blog post data structure
 */
export interface Post {
	id: string;
	data: {
		title: string;
		pubDate: Date;
		description?: string;
		heroImage?: any;
		unlisted?: boolean;
	};
}

/**
 * Quick info item for profile
 */
export type QuickInfo = string;
