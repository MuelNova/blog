/**
 * Shiki Theme Color Extractor
 * 
 * This utility extracts colors from Shiki's bundled themes and maps them
 * to our blog's theme structure.
 * 
 * Based on MultiTerm's implementation using astro-expressive-code.
 */

import { loadShikiTheme, type BundledShikiTheme, type ExpressiveCodeTheme } from 'astro-expressive-code';

async function loadThemeSafely(themeName: BundledShikiTheme): Promise<ExpressiveCodeTheme | null> {
	try {
		return await loadShikiTheme(themeName);
	} catch (err) {
		// On some adapters the bundled theme loader fails (e.g., worker builds). In that case we fall back.
		console.warn(`[themeExtractor] Primary load failed for "${themeName}"`, err);
		return null;
	}
}

/**
 * Flatten Shiki theme colors (from MultiTerm's utils.ts)
 * Combines theme.colors with scoped textmate settings
 */
export function flattenThemeColors(theme: ExpressiveCodeTheme): {
	[key: string]: string;
} {
	const scopedThemeSettings = theme.settings.reduce(
		(acc, item) => {
			const { scope, settings } = item;
			const { foreground } = settings;
			if (scope && foreground) {
				for (const s of scope) {
					acc[s] = foreground.toLowerCase().trim();
				}
			}
			return acc;
		},
		{} as { [key: string]: string },
	);
	return { ...theme.colors, ...scopedThemeSettings };
}

/**
 * Extract and map colors from a Shiki theme to our theme structure
 */
export async function extractThemeColors(themeName: BundledShikiTheme) {
	// Load the Shiki theme using astro-expressive-code with fallbacks for worker bundling.
	let colors: Record<string, string>;
	const shikiTheme = await loadThemeSafely(themeName);
	if (shikiTheme) {
		colors = flattenThemeColors(shikiTheme);
	} else {
		// Graceful fallback: use a simple palette so build does not break.
		console.warn(`[themeExtractor] Failed to load Shiki theme "${themeName}", falling back to default palette.`);
		colors = {
			'editor.background': '#0a0a0a',
			'editor.foreground': '#ffffff',
			'activityBarBadge.background': '#8c5cf5',
			'button.background': '#8c5cf5',
			'focusBorder': '#8c5cf5',
			'terminal.ansiBlue': '#8c5cf5',
			'color.foreground': '#ffffff',
			'foreground': '#ffffff',
			'primary': '#8c5cf5',
			'link': '#a277ff',
		};
	}
	
	// Helper to get color with fallback
	const getColor = (keys: string[], fallback: string): string => {
		for (const key of keys) {
			if (colors[key]) {
				return colors[key].toLowerCase();
			}
		}
		return fallback;
	};

	// Helper to extract RGB values from hex color
	const hexToRgb = (hex: string): string => {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (result) {
			const r = parseInt(result[1], 16);
			const g = parseInt(result[2], 16);
			const b = parseInt(result[3], 16);
			return `${r}, ${g}, ${b}`;
		}
		return '0, 0, 0';
	};

	// Helper to lighten a color (simple version)
	const lightenColor = (hex: string, percent: number = 15): string => {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) return hex;
		
		const r = Math.min(255, parseInt(result[1], 16) + Math.round(255 * percent / 100));
		const g = Math.min(255, parseInt(result[2], 16) + Math.round(255 * percent / 100));
		const b = Math.min(255, parseInt(result[3], 16) + Math.round(255 * percent / 100));
		
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	};

	// Extract colors with intelligent fallbacks (following MultiTerm's pattern)
	const background = getColor(
		['editor.background'],
		'#000000'
	);

	const foreground = getColor(
		['editor.foreground', 'foreground'],
		'#ffffff'
	);

	// For primary color, try to use a prominent color from the theme
	// Different themes use different colors for accents
	const primary = getColor(
		[
			'activityBarBadge.background',
			'button.background',
			'focusBorder',
			'terminal.ansiBlue',
			'textLink.foreground',
			'editor.foreground',
		],
		'#0080ff'
	);

	const primaryLight = lightenColor(primary, 15);
	const primaryLightest = lightenColor(primary, 30);
	const primaryRgb = hexToRgb(primary);

	// MultiTerm doesn't define separate border/separator colors
	// Instead, uses accent/foreground with opacity in CSS
	const accent = primary;
	const link = primaryLight;

	return {
		background,
		foreground,
		primary,
		primaryLight,
		primaryLightest,
		primaryRgb,
		accent,
		link,
	};
}

/**
 * Check if a theme exists in Shiki's bundled themes
 */
export async function hasTheme(themeName: string): Promise<boolean> {
	try {
		await loadShikiTheme(themeName as BundledShikiTheme);
		return true;
	} catch {
		return false;
	}
}
