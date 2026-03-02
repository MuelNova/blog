import { DEFAULT_THEME_ID, THEME_CHANGE_EVENT, THEME_STORAGE_KEY } from '../config/theme-runtime';

const THEME_PREFERENCE_KEY = 'theme-preference';
const THEME_LOCKED_KEY = 'theme-locked';
const INTRO_ENABLED_KEY = 'intro-enabled';

const THEME_PREFERENCE_VALUES = new Set(['all', 'dark', 'light']);

export type ThemePreference = 'all' | 'dark' | 'light';

export interface ThemeChangeDetail {
	themeId: string;
	previousTheme: string;
	source: string;
}

let currentDefaultThemeId = DEFAULT_THEME_ID;
let validThemeIds: Set<string> | null = null;

export function configureThemeBus(options: {
	defaultThemeId?: string;
	validThemeIds?: string[];
}): void {
	if (options.defaultThemeId && options.defaultThemeId.length > 0) {
		currentDefaultThemeId = options.defaultThemeId;
	}

	if (Array.isArray(options.validThemeIds) && options.validThemeIds.length > 0) {
		validThemeIds = new Set(options.validThemeIds);
	}
}

export function isValidThemeId(themeId: unknown): themeId is string {
	if (typeof themeId !== 'string' || themeId.length === 0) {
		return false;
	}

	if (!validThemeIds) {
		return true;
	}

	return validThemeIds.has(themeId);
}

export function getCurrentTheme(): string {
	const themeId = document.documentElement.getAttribute('data-theme');
	return isValidThemeId(themeId) ? themeId : currentDefaultThemeId;
}

export function getStoredTheme(): string | null {
	try {
		const themeId = localStorage.getItem(THEME_STORAGE_KEY);
		return isValidThemeId(themeId) ? themeId : null;
	} catch {
		return null;
	}
}

function persistTheme(themeId: string): void {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, themeId);
	} catch {}
}

export function setCurrentTheme(
	themeId: string,
	options: {
		persist?: boolean;
		source?: string;
	} = {}
): void {
	if (!isValidThemeId(themeId)) return;

	const { persist = true, source = 'unknown' } = options;
	const previousTheme = getCurrentTheme();

	if (previousTheme === themeId) {
		if (persist) {
			persistTheme(themeId);
		}
		return;
	}

	document.documentElement.setAttribute('data-theme', themeId);

	if (persist) {
		persistTheme(themeId);
	}

	window.dispatchEvent(
		new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, {
			detail: {
				themeId,
				previousTheme,
				source,
			},
		})
	);
}

export function onThemeChange(listener: (detail: ThemeChangeDetail) => void): () => void {
	const handler = (event: Event) => {
		const detail = (event as CustomEvent<ThemeChangeDetail>).detail;
		if (!detail?.themeId) return;
		listener(detail);
	};

	window.addEventListener(THEME_CHANGE_EVENT, handler as EventListener);
	return () => {
		window.removeEventListener(THEME_CHANGE_EVENT, handler as EventListener);
	};
}

export function getThemePreference(fallback: ThemePreference = 'dark'): ThemePreference {
	try {
		const value = localStorage.getItem(THEME_PREFERENCE_KEY);
		if (value && THEME_PREFERENCE_VALUES.has(value)) {
			return value as ThemePreference;
		}
	} catch {}

	return fallback;
}

export function setThemePreference(preference: ThemePreference): void {
	if (!THEME_PREFERENCE_VALUES.has(preference)) return;

	try {
		localStorage.setItem(THEME_PREFERENCE_KEY, preference);
	} catch {}
}

export function isThemeLocked(): boolean {
	try {
		return localStorage.getItem(THEME_LOCKED_KEY) === 'true';
	} catch {
		return false;
	}
}

export function setThemeLocked(locked: boolean): void {
	try {
		localStorage.setItem(THEME_LOCKED_KEY, String(locked));
	} catch {}
}

export function isIntroEnabled(): boolean {
	try {
		return localStorage.getItem(INTRO_ENABLED_KEY) !== 'false';
	} catch {
		return true;
	}
}

export function setIntroEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(INTRO_ENABLED_KEY, String(enabled));
	} catch {}
}
