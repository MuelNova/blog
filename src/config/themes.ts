/**
 * Theme Configuration System (Using Shiki + Custom Spectre)
 * 
 * This file defines all available themes for the blog using Shiki's bundled themes
 * plus a custom Spectre theme.
 * Colors are automatically extracted from Shiki themes for consistency with code highlighting.
 * 
 * Total: 60 Shiki bundled themes + 1 Custom Spectre theme = 61 themes
 */

import { extractThemeColors } from '../utils/themeExtractor';
import type { BundledShikiTheme } from 'astro-expressive-code';

export interface Theme {
	/** Unique identifier for the theme */
	id: string;
	/** Display name shown to users */
	name: string;
	/** Optional description of the theme */
	description?: string;
	/** Complete color scheme for the theme */
	colors: {
		// Base colors
		background: string;
		foreground: string;
		foregroundSecondary: string;
		
		// Primary theme colors
		primary: string;
		primaryLight: string;
		primaryLightest: string;
		primaryRgb: string; // Format: "r, g, b" for rgba() usage
		
		// UI element colors
		border: string;
		separator: string;
		accent: string;
		link: string;
	};
}

/**
 * Custom Spectre Theme
 * The signature purple theme from Spectre
 */
const spectreTheme: Theme = {
	id: 'spectre',
	name: 'Spectre',
	description: 'Purple dark theme inspired by Spectre',
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

/**
 * Theme definition with Shiki theme name
 */
interface ThemeDefinition {
	id: string;
	name: string;
	description: string;
	shikiTheme: BundledShikiTheme;
}

/**
 * All available Shiki theme definitions
 * Mapped from Shiki's 60 bundled themes
 */
const themeDefinitions: ThemeDefinition[] = [
	// Dark Themes
	{ id: 'andromeeda', name: 'Andromeeda', description: 'Deep space galaxy dark theme', shikiTheme: 'andromeeda' },
	{ id: 'aurora-x', name: 'Aurora X', description: 'Aurora dark theme', shikiTheme: 'aurora-x' },
	{ id: 'ayu-dark', name: 'Ayu Dark', description: 'Ayu dark theme', shikiTheme: 'ayu-dark' },
	{ id: 'catppuccin-frappe', name: 'Catppuccin Frappé', description: 'Catppuccin Frappé theme', shikiTheme: 'catppuccin-frappe' },
	{ id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', description: 'Catppuccin Macchiato theme', shikiTheme: 'catppuccin-macchiato' },
	{ id: 'catppuccin-mocha', name: 'Catppuccin Mocha', description: 'Catppuccin Mocha theme', shikiTheme: 'catppuccin-mocha' },
	{ id: 'dark-plus', name: 'Dark+', description: 'VS Code default dark theme', shikiTheme: 'dark-plus' },
	{ id: 'dracula', name: 'Dracula', description: 'Classic Dracula dark theme', shikiTheme: 'dracula' },
	{ id: 'dracula-soft', name: 'Dracula Soft', description: 'Dracula soft version', shikiTheme: 'dracula-soft' },
	{ id: 'everforest-dark', name: 'Everforest Dark', description: 'Forest green dark theme', shikiTheme: 'everforest-dark' },
	{ id: 'github-dark', name: 'GitHub Dark', description: 'GitHub dark theme', shikiTheme: 'github-dark' },
	{ id: 'github-dark-default', name: 'GitHub Dark Default', description: 'GitHub default dark', shikiTheme: 'github-dark-default' },
	{ id: 'github-dark-dimmed', name: 'GitHub Dark Dimmed', description: 'GitHub dimmed dark', shikiTheme: 'github-dark-dimmed' },
	{ id: 'github-dark-high-contrast', name: 'GitHub Dark High Contrast', description: 'GitHub high contrast dark', shikiTheme: 'github-dark-high-contrast' },
	{ id: 'gruvbox-dark-hard', name: 'Gruvbox Dark Hard', description: 'Gruvbox hard dark', shikiTheme: 'gruvbox-dark-hard' },
	{ id: 'gruvbox-dark-medium', name: 'Gruvbox Dark Medium', description: 'Gruvbox medium dark', shikiTheme: 'gruvbox-dark-medium' },
	{ id: 'gruvbox-dark-soft', name: 'Gruvbox Dark Soft', description: 'Gruvbox soft dark', shikiTheme: 'gruvbox-dark-soft' },
	{ id: 'houston', name: 'Houston', description: 'Space themed dark', shikiTheme: 'houston' },
	{ id: 'kanagawa-dragon', name: 'Kanagawa Dragon', description: 'Kanagawa dragon dark theme', shikiTheme: 'kanagawa-dragon' },
	{ id: 'kanagawa-wave', name: 'Kanagawa Wave', description: 'Kanagawa wave dark theme', shikiTheme: 'kanagawa-wave' },
	{ id: 'laserwave', name: 'Laserwave', description: 'Laserwave dark theme', shikiTheme: 'laserwave' },
	{ id: 'material-theme', name: 'Material Theme', description: 'Material Design theme', shikiTheme: 'material-theme' },
	{ id: 'material-theme-darker', name: 'Material Theme Darker', description: 'Material darker theme', shikiTheme: 'material-theme-darker' },
	{ id: 'material-theme-ocean', name: 'Material Theme Ocean', description: 'Material ocean theme', shikiTheme: 'material-theme-ocean' },
	{ id: 'material-theme-palenight', name: 'Material Theme Palenight', description: 'Material palenight theme', shikiTheme: 'material-theme-palenight' },
	{ id: 'min-dark', name: 'Min Dark', description: 'Minimalist dark theme', shikiTheme: 'min-dark' },
	{ id: 'monokai', name: 'Monokai', description: 'Classic Monokai theme', shikiTheme: 'monokai' },
	{ id: 'night-owl', name: 'Night Owl', description: 'Night Owl dark theme', shikiTheme: 'night-owl' },
	{ id: 'nord', name: 'Nord', description: 'Nordic dark theme', shikiTheme: 'nord' },
	{ id: 'one-dark-pro', name: 'One Dark Pro', description: 'Atom One Dark Pro', shikiTheme: 'one-dark-pro' },
	{ id: 'plastic', name: 'Plastic', description: 'Plastic dark theme', shikiTheme: 'plastic' },
	{ id: 'poimandres', name: 'Poimandres', description: 'Poimandres dark theme', shikiTheme: 'poimandres' },
	{ id: 'red', name: 'Red', description: 'Red dark theme', shikiTheme: 'red' },
	{ id: 'rose-pine', name: 'Rosé Pine', description: 'Rosé Pine dark theme', shikiTheme: 'rose-pine' },
	{ id: 'rose-pine-moon', name: 'Rosé Pine Moon', description: 'Rosé Pine Moon theme', shikiTheme: 'rose-pine-moon' },
	{ id: 'slack-dark', name: 'Slack Dark', description: 'Slack dark theme', shikiTheme: 'slack-dark' },
	{ id: 'slack-ochin', name: 'Slack Ochin', description: 'Slack Ochin theme', shikiTheme: 'slack-ochin' },
	{ id: 'solarized-dark', name: 'Solarized Dark', description: 'Solarized dark theme', shikiTheme: 'solarized-dark' },
	{ id: 'synthwave-84', name: 'Synthwave \'84', description: 'Cyberpunk synthwave theme', shikiTheme: 'synthwave-84' },
	{ id: 'tokyo-night', name: 'Tokyo Night', description: 'Tokyo Night theme', shikiTheme: 'tokyo-night' },
	{ id: 'vesper', name: 'Vesper', description: 'Vesper dark theme', shikiTheme: 'vesper' },
	{ id: 'vitesse-black', name: 'Vitesse Black', description: 'Vitesse pure black theme', shikiTheme: 'vitesse-black' },
	{ id: 'vitesse-dark', name: 'Vitesse Dark', description: 'Vitesse dark theme', shikiTheme: 'vitesse-dark' },
	
	// Light Themes
	{ id: 'catppuccin-latte', name: 'Catppuccin Latte', description: 'Catppuccin Latte light theme', shikiTheme: 'catppuccin-latte' },
	{ id: 'everforest-light', name: 'Everforest Light', description: 'Forest green light theme', shikiTheme: 'everforest-light' },
	{ id: 'github-light', name: 'GitHub Light', description: 'GitHub light theme', shikiTheme: 'github-light' },
	{ id: 'github-light-default', name: 'GitHub Light Default', description: 'GitHub default light', shikiTheme: 'github-light-default' },
	{ id: 'github-light-high-contrast', name: 'GitHub Light High Contrast', description: 'GitHub high contrast light', shikiTheme: 'github-light-high-contrast' },
	{ id: 'gruvbox-light-hard', name: 'Gruvbox Light Hard', description: 'Gruvbox hard light', shikiTheme: 'gruvbox-light-hard' },
	{ id: 'gruvbox-light-medium', name: 'Gruvbox Light Medium', description: 'Gruvbox medium light', shikiTheme: 'gruvbox-light-medium' },
	{ id: 'gruvbox-light-soft', name: 'Gruvbox Light Soft', description: 'Gruvbox soft light', shikiTheme: 'gruvbox-light-soft' },
	{ id: 'kanagawa-lotus', name: 'Kanagawa Lotus', description: 'Kanagawa lotus light theme', shikiTheme: 'kanagawa-lotus' },
	{ id: 'light-plus', name: 'Light+', description: 'VS Code default light theme', shikiTheme: 'light-plus' },
	{ id: 'material-theme-lighter', name: 'Material Theme Lighter', description: 'Material lighter theme', shikiTheme: 'material-theme-lighter' },
	{ id: 'min-light', name: 'Min Light', description: 'Minimalist light theme', shikiTheme: 'min-light' },
	{ id: 'one-light', name: 'One Light', description: 'Atom One Light', shikiTheme: 'one-light' },
	{ id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', description: 'Rosé Pine Dawn theme', shikiTheme: 'rose-pine-dawn' },
	{ id: 'snazzy-light', name: 'Snazzy Light', description: 'Snazzy light theme', shikiTheme: 'snazzy-light' },
	{ id: 'solarized-light', name: 'Solarized Light', description: 'Solarized light theme', shikiTheme: 'solarized-light' },
	{ id: 'vitesse-light', name: 'Vitesse Light', description: 'Vitesse light theme', shikiTheme: 'vitesse-light' },
];

/**
 * Cache for loaded themes
 */
let themesCache: Theme[] | null = null;

/**
 * Load and generate all themes (Spectre + Shiki themes)
 * This is async because we need to load Shiki themes
 */
export async function getThemes(): Promise<Theme[]> {
	// Return cached themes if available
	if (themesCache) {
		return themesCache;
	}

	console.log(`🎨 Loading ${themeDefinitions.length} Shiki themes + custom Spectre theme...`);

	// Generate themes from Shiki definitions
	const themePromises = themeDefinitions.map(async (def) => {
		const colors = await extractThemeColors(def.shikiTheme);
		return {
			id: def.id,
			name: def.name,
			description: def.description,
			colors,
		};
	});

	const shikiThemes = await Promise.all(themePromises);
	
	// Combine Spectre theme (first) with Shiki themes
	themesCache = [spectreTheme, ...shikiThemes];
	
	console.log(`✅ Successfully loaded ${themesCache.length} themes (1 custom + ${shikiThemes.length} Shiki)`);
	
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
	return themes[0]; // Spectre
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
	const themes = await getDarkThemes();
	return themes.map(t => t.id);
}

/**
 * Get light theme IDs
 */
export async function getLightThemeIds(): Promise<string[]> {
	const themes = await getLightThemes();
	return themes.map(t => t.id);
}

/**
 * Get dark themes only
 */
export async function getDarkThemes(): Promise<Theme[]> {
	const themes = await getThemes();
	// Spectre + all Shiki dark themes (first 43)
	return themes.slice(0, 44); // 1 Spectre + 43 dark Shiki themes
}

/**
 * Get light themes only
 */
export async function getLightThemes(): Promise<Theme[]> {
	const themes = await getThemes();
	// Last 17 are light themes
	return themes.slice(44);
}
