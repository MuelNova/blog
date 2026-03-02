import generatedThemeData from '../generated/theme-colors.json';
import { DEFAULT_THEME_ID } from './theme-runtime';

type ThemeTone = 'dark' | 'light' | undefined;

interface GeneratedThemeMeta {
	id: string;
	tone?: ThemeTone;
}

interface GeneratedThemePayload {
	themes: GeneratedThemeMeta[];
}

const generatedThemes = (generatedThemeData as GeneratedThemePayload).themes;

function uniqueThemeIds(themeIds: string[]): string[] {
	return Array.from(new Set(themeIds));
}

const generatedThemeIds = generatedThemes.map((theme) => theme.id);
const generatedDarkThemeIds = generatedThemes
	.filter((theme) => theme.tone !== 'light')
	.map((theme) => theme.id);
const generatedLightThemeIds = generatedThemes
	.filter((theme) => theme.tone === 'light')
	.map((theme) => theme.id);

export const ALL_THEME_IDS = uniqueThemeIds([DEFAULT_THEME_ID, ...generatedThemeIds]);
export const DARK_THEME_IDS = uniqueThemeIds([DEFAULT_THEME_ID, ...generatedDarkThemeIds]);
export const LIGHT_THEME_IDS = uniqueThemeIds(generatedLightThemeIds);

export const ALL_THEME_ID_SET = new Set(ALL_THEME_IDS);
export const DARK_THEME_ID_SET = new Set(DARK_THEME_IDS);
export const LIGHT_THEME_ID_SET = new Set(LIGHT_THEME_IDS);
