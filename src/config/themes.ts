/**
 * Theme Configuration System (Using pre-generated colors + Custom Spectre)
 *
 * Colors are pre-generated at build time via `scripts/generate-theme-colors.ts`
 * to avoid runtime Shiki loading issues on some adapters.
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
}

export interface Theme {
	id: string;
	name: string;
	description?: string;
	tone?: 'dark' | 'light';
	colors: ThemeColors;
}

/**
 * Custom Spectre Theme
 * The signature purple theme from Spectre
 */
const spectreTheme: Theme = {
	id: 'spectre',
	name: 'Spectre',
	description: 'Purple dark theme inspired by Spectre',
	tone: 'dark',
	colors: {
		background: '#0a0a0a',
		foreground: '#ffffff',
		foregroundSecondary: '#c7c7c7',
		primary: '#8c5cf5',
		primaryLight: '#a277ff',
		primaryLightest: '#c2a8fd',
		primaryRgb: '140, 92, 245',
		border: '#353535',
		separator: '#353535',
		accent: '#8c5cf5',
		link: '#a277ff',
	},
};

interface GeneratedThemePayload {
	generatedAt: string;
	themes: Array<Omit<Theme, 'colors'> & { colors: ThemeColors }>;
}

const normalizeColors = (colors: ThemeColors): ThemeColors => {
	const foregroundSecondary = colors.foregroundSecondary || colors.foreground;
	const accent = colors.accent || colors.primary || colors.foreground;
	const border = colors.border || accent;
	const separator = colors.separator || border;

	return {
		...colors,
		foregroundSecondary,
		accent,
		border,
		separator,
	};
};

const loadGeneratedThemes = async (): Promise<Theme[]> => {
	const { default: data } = (await import('../generated/theme-colors.json')) as { default: GeneratedThemePayload };
	return data.themes.map((theme) => ({
		...theme,
		colors: normalizeColors(theme.colors),
	}));
};

/**
 * Cache for loaded themes
 */
let themesCache: Theme[] | null = null;

/**
 * Load all themes (Spectre + pre-generated Shiki themes)
 */
export async function getThemes(): Promise<Theme[]> {
	if (themesCache) {
		return themesCache;
	}

	const shikiThemes = await loadGeneratedThemes();

	// Combine Spectre theme (first) with Shiki themes
	themesCache = [spectreTheme, ...shikiThemes];

	return themesCache;
}

/**
 * Get a specific theme by ID
 */
export async function getTheme(id: string): Promise<Theme> {
	const themes = await getThemes();
	const theme = themes.find((t) => t.id === id);
	
	if (!theme) {
		// Return Spectre as fallback
		return themes[0];
	}
	
	return theme;
}

/**
 * Get the default theme (Spectre)
 */
export async function getDefaultTheme(): Promise<Theme> {
	const themes = await getThemes();
	return themes[0];
}

/**
 * Get theme IDs for quick reference
 */
export async function getThemeIds(): Promise<string[]> {
	const themes = await getThemes();
	return themes.map((t) => t.id);
}

/**
 * Get a random theme ID
 */
export async function getRandomThemeId(): Promise<string> {
	const themeIds = await getThemeIds();
	const randomIndex = Math.floor(Math.random() * themeIds.length);
	return themeIds[randomIndex];
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
	const themes = await getThemes();
	return themes.filter((theme) => DARK_THEME_ID_SET.has(theme.id));
}

/**
 * Get light themes only
 */
export async function getLightThemes(): Promise<Theme[]> {
	const themes = await getThemes();
	return themes.filter((theme) => LIGHT_THEME_ID_SET.has(theme.id));
}
