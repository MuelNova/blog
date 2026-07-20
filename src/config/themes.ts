/**
 * Theme Configuration System (Muir's Cream)
 *
 * The random Shiki theme pool was removed. Only two static cream themes
 * remain; their colors are also inlined into the document head by
 * `BaseHead.astro` as `:root[data-theme="..."]` CSS variable blocks.
 */

import { DARK_THEME_ID_SET, DARK_THEME_IDS, LIGHT_THEME_ID_SET, LIGHT_THEME_IDS } from './theme-client-data';

export interface ThemeColors {
	background: string;
	foreground: string;
	foregroundSecondary: string;
	primary: string;
	primaryLight: string;
	primaryLightest: string;
	primaryRgb: string; // Format: "r, g, b" for rgba() usage
	border: string;
	separator: string;
	accent: string;
	link: string;
	/* Cream sticker design tokens (used by the giscus theme endpoint) */
	surface: string; // card / raised surface, matches --color-surface in global.css
	primaryDeep: string; // one shade deeper than primary, for hover states
	onPrimary: string; // readable text color on primary-filled buttons
	borderStrong: string; // stronger warm border for 2px sticker strokes
}

export interface Theme {
	id: string;
	name: string;
	description?: string;
	tone?: 'dark' | 'light';
	colors: ThemeColors;
}

/**
 * Cream (light) — the signature warm cream theme, default.
 */
const creamTheme: Theme = {
	id: 'cream',
	name: 'Cream',
	description: 'Soft cream light theme',
	tone: 'light',
	colors: {
		background: '#FFF9F5',
		foreground: '#54453F',
		foregroundSecondary: '#8A7A72',
		primary: '#FFB583',
		primaryLight: '#FFC9A3',
		primaryLightest: '#FFE7D6',
		primaryRgb: '255, 181, 131',
		border: 'rgba(84, 69, 63, 0.18)',
		separator: 'rgba(84, 69, 63, 0.12)',
		accent: '#FFD3E0',
		link: '#3E93A8',
		surface: '#FFF1E8',
		primaryDeep: '#F29B5F',
		onPrimary: '#54453F',
		borderStrong: 'rgba(84, 69, 63, 0.35)',
	},
};

/**
 * Cream Dark — warm cocoa dark theme.
 */
const creamDarkTheme: Theme = {
	id: 'cream-dark',
	name: 'Cream Dark',
	description: 'Soft cream dark theme',
	tone: 'dark',
	colors: {
		background: '#1F1A17',
		foreground: '#F2E9E3',
		foregroundSecondary: '#A89A90',
		primary: '#E89A63',
		primaryLight: '#F0B586',
		primaryLightest: '#F7D2B3',
		primaryRgb: '232, 154, 99',
		border: 'rgba(242, 233, 227, 0.16)',
		separator: 'rgba(242, 233, 227, 0.10)',
		accent: '#E8A7BF',
		link: '#8FC6D4',
		surface: '#2A2320',
		primaryDeep: '#D4884C',
		onPrimary: '#1F1A17',
		borderStrong: 'rgba(242, 233, 227, 0.30)',
	},
};

const themes: Theme[] = [creamTheme, creamDarkTheme];

/**
 * Load all themes (cream + cream-dark)
 */
export async function getThemes(): Promise<Theme[]> {
	return themes;
}

/**
 * Get a specific theme by ID
 */
export async function getTheme(id: string): Promise<Theme> {
	const theme = themes.find((t) => t.id === id);

	if (!theme) {
		// Return cream as fallback
		return themes[0];
	}

	return theme;
}

/**
 * Get the default theme (cream)
 */
export async function getDefaultTheme(): Promise<Theme> {
	return themes[0];
}

/**
 * Get theme IDs for quick reference
 */
export async function getThemeIds(): Promise<string[]> {
	return themes.map((t) => t.id);
}

/**
 * Get dark theme IDs
 */
export async function getDarkThemeIds(): Promise<string[]> {
	return [...DARK_THEME_IDS];
}

/**
 * Get light theme IDs
 */
export async function getLightThemeIds(): Promise<string[]> {
	return [...LIGHT_THEME_IDS];
}

/**
 * Get dark themes only
 */
export async function getDarkThemes(): Promise<Theme[]> {
	return themes.filter((theme) => DARK_THEME_ID_SET.has(theme.id));
}

/**
 * Get light themes only
 */
export async function getLightThemes(): Promise<Theme[]> {
	return themes.filter((theme) => LIGHT_THEME_ID_SET.has(theme.id));
}
