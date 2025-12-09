import fs from 'node:fs/promises';
import path from 'node:path';
import { loadShikiTheme, type BundledShikiTheme, type ExpressiveCodeTheme } from 'astro-expressive-code';

interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  shikiTheme: BundledShikiTheme;
  tone: 'dark' | 'light';
}

interface GeneratedTheme {
  id: string;
  name: string;
  description: string;
  tone: 'dark' | 'light';
  colors: {
    background: string;
    foreground: string;
    foregroundSecondary: string;
    primary: string;
    primaryLight: string;
    primaryLightest: string;
    primaryRgb: string;
    border: string;
    separator: string;
    accent: string;
    link: string;
  };
}

const outputPath = path.join(process.cwd(), 'src/generated/theme-colors.json');

// Order matters: dark themes first, then light themes.
const themeDefinitions: ThemeDefinition[] = [
  // Dark Themes
  { id: 'andromeeda', name: 'Andromeeda', description: 'Deep space galaxy dark theme', shikiTheme: 'andromeeda', tone: 'dark' },
  { id: 'aurora-x', name: 'Aurora X', description: 'Aurora dark theme', shikiTheme: 'aurora-x', tone: 'dark' },
  { id: 'ayu-dark', name: 'Ayu Dark', description: 'Ayu dark theme', shikiTheme: 'ayu-dark', tone: 'dark' },
  { id: 'catppuccin-frappe', name: 'Catppuccin Frappé', description: 'Catppuccin Frappé theme', shikiTheme: 'catppuccin-frappe', tone: 'dark' },
  { id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', description: 'Catppuccin Macchiato theme', shikiTheme: 'catppuccin-macchiato', tone: 'dark' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', description: 'Catppuccin Mocha theme', shikiTheme: 'catppuccin-mocha', tone: 'dark' },
  { id: 'dark-plus', name: 'Dark+', description: 'VS Code default dark theme', shikiTheme: 'dark-plus', tone: 'dark' },
  { id: 'dracula', name: 'Dracula', description: 'Classic Dracula dark theme', shikiTheme: 'dracula', tone: 'dark' },
  { id: 'dracula-soft', name: 'Dracula Soft', description: 'Dracula soft version', shikiTheme: 'dracula-soft', tone: 'dark' },
  { id: 'everforest-dark', name: 'Everforest Dark', description: 'Forest green dark theme', shikiTheme: 'everforest-dark', tone: 'dark' },
  { id: 'github-dark', name: 'GitHub Dark', description: 'GitHub dark theme', shikiTheme: 'github-dark', tone: 'dark' },
  { id: 'github-dark-default', name: 'GitHub Dark Default', description: 'GitHub default dark', shikiTheme: 'github-dark-default', tone: 'dark' },
  { id: 'github-dark-dimmed', name: 'GitHub Dark Dimmed', description: 'GitHub dimmed dark', shikiTheme: 'github-dark-dimmed', tone: 'dark' },
  { id: 'github-dark-high-contrast', name: 'GitHub Dark High Contrast', description: 'GitHub high contrast dark', shikiTheme: 'github-dark-high-contrast', tone: 'dark' },
  { id: 'gruvbox-dark-hard', name: 'Gruvbox Dark Hard', description: 'Gruvbox hard dark', shikiTheme: 'gruvbox-dark-hard', tone: 'dark' },
  { id: 'gruvbox-dark-medium', name: 'Gruvbox Dark Medium', description: 'Gruvbox medium dark', shikiTheme: 'gruvbox-dark-medium', tone: 'dark' },
  { id: 'gruvbox-dark-soft', name: 'Gruvbox Dark Soft', description: 'Gruvbox soft dark', shikiTheme: 'gruvbox-dark-soft', tone: 'dark' },
  { id: 'houston', name: 'Houston', description: 'Space themed dark', shikiTheme: 'houston', tone: 'dark' },
  { id: 'kanagawa-dragon', name: 'Kanagawa Dragon', description: 'Kanagawa dragon dark theme', shikiTheme: 'kanagawa-dragon', tone: 'dark' },
  { id: 'kanagawa-wave', name: 'Kanagawa Wave', description: 'Kanagawa wave dark theme', shikiTheme: 'kanagawa-wave', tone: 'dark' },
  { id: 'laserwave', name: 'Laserwave', description: 'Laserwave dark theme', shikiTheme: 'laserwave', tone: 'dark' },
  { id: 'material-theme', name: 'Material Theme', description: 'Material Design theme', shikiTheme: 'material-theme', tone: 'dark' },
  { id: 'material-theme-darker', name: 'Material Theme Darker', description: 'Material darker theme', shikiTheme: 'material-theme-darker', tone: 'dark' },
  { id: 'material-theme-ocean', name: 'Material Theme Ocean', description: 'Material ocean theme', shikiTheme: 'material-theme-ocean', tone: 'dark' },
  { id: 'material-theme-palenight', name: 'Material Theme Palenight', description: 'Material palenight theme', shikiTheme: 'material-theme-palenight', tone: 'dark' },
  { id: 'min-dark', name: 'Min Dark', description: 'Minimalist dark theme', shikiTheme: 'min-dark', tone: 'dark' },
  { id: 'monokai', name: 'Monokai', description: 'Classic Monokai theme', shikiTheme: 'monokai', tone: 'dark' },
  { id: 'night-owl', name: 'Night Owl', description: 'Night Owl dark theme', shikiTheme: 'night-owl', tone: 'dark' },
  { id: 'nord', name: 'Nord', description: 'Nordic dark theme', shikiTheme: 'nord', tone: 'dark' },
  { id: 'one-dark-pro', name: 'One Dark Pro', description: 'Atom One Dark Pro', shikiTheme: 'one-dark-pro', tone: 'dark' },
  { id: 'plastic', name: 'Plastic', description: 'Plastic dark theme', shikiTheme: 'plastic', tone: 'dark' },
  { id: 'poimandres', name: 'Poimandres', description: 'Poimandres dark theme', shikiTheme: 'poimandres', tone: 'dark' },
  { id: 'red', name: 'Red', description: 'Red dark theme', shikiTheme: 'red', tone: 'dark' },
  { id: 'rose-pine', name: 'Rosé Pine', description: 'Rosé Pine dark theme', shikiTheme: 'rose-pine', tone: 'dark' },
  { id: 'rose-pine-moon', name: 'Rosé Pine Moon', description: 'Rosé Pine Moon theme', shikiTheme: 'rose-pine-moon', tone: 'dark' },
  { id: 'slack-dark', name: 'Slack Dark', description: 'Slack dark theme', shikiTheme: 'slack-dark', tone: 'dark' },
  { id: 'slack-ochin', name: 'Slack Ochin', description: 'Slack Ochin theme', shikiTheme: 'slack-ochin', tone: 'dark' },
  { id: 'solarized-dark', name: 'Solarized Dark', description: 'Solarized dark theme', shikiTheme: 'solarized-dark', tone: 'dark' },
  { id: 'synthwave-84', name: 'Synthwave 84', description: 'Cyberpunk synthwave theme', shikiTheme: 'synthwave-84', tone: 'dark' },
  { id: 'tokyo-night', name: 'Tokyo Night', description: 'Tokyo Night theme', shikiTheme: 'tokyo-night', tone: 'dark' },
  { id: 'vesper', name: 'Vesper', description: 'Vesper dark theme', shikiTheme: 'vesper', tone: 'dark' },
  { id: 'vitesse-black', name: 'Vitesse Black', description: 'Vitesse pure black theme', shikiTheme: 'vitesse-black', tone: 'dark' },
  { id: 'vitesse-dark', name: 'Vitesse Dark', description: 'Vitesse dark theme', shikiTheme: 'vitesse-dark', tone: 'dark' },

  // Light Themes
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', description: 'Catppuccin Latte light theme', shikiTheme: 'catppuccin-latte', tone: 'light' },
  { id: 'everforest-light', name: 'Everforest Light', description: 'Forest green light theme', shikiTheme: 'everforest-light', tone: 'light' },
  { id: 'github-light', name: 'GitHub Light', description: 'GitHub light theme', shikiTheme: 'github-light', tone: 'light' },
  { id: 'github-light-default', name: 'GitHub Light Default', description: 'GitHub default light', shikiTheme: 'github-light-default', tone: 'light' },
  { id: 'github-light-high-contrast', name: 'GitHub Light High Contrast', description: 'GitHub high contrast light', shikiTheme: 'github-light-high-contrast', tone: 'light' },
  { id: 'gruvbox-light-hard', name: 'Gruvbox Light Hard', description: 'Gruvbox hard light', shikiTheme: 'gruvbox-light-hard', tone: 'light' },
  { id: 'gruvbox-light-medium', name: 'Gruvbox Light Medium', description: 'Gruvbox medium light', shikiTheme: 'gruvbox-light-medium', tone: 'light' },
  { id: 'gruvbox-light-soft', name: 'Gruvbox Light Soft', description: 'Gruvbox soft light', shikiTheme: 'gruvbox-light-soft', tone: 'light' },
  { id: 'kanagawa-lotus', name: 'Kanagawa Lotus', description: 'Kanagawa lotus light theme', shikiTheme: 'kanagawa-lotus', tone: 'light' },
  { id: 'light-plus', name: 'Light+', description: 'VS Code default light theme', shikiTheme: 'light-plus', tone: 'light' },
  { id: 'material-theme-lighter', name: 'Material Theme Lighter', description: 'Material lighter theme', shikiTheme: 'material-theme-lighter', tone: 'light' },
  { id: 'min-light', name: 'Min Light', description: 'Minimalist light theme', shikiTheme: 'min-light', tone: 'light' },
  { id: 'one-light', name: 'One Light', description: 'Atom One Light', shikiTheme: 'one-light', tone: 'light' },
  { id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', description: 'Rosé Pine Dawn theme', shikiTheme: 'rose-pine-dawn', tone: 'light' },
  { id: 'snazzy-light', name: 'Snazzy Light', description: 'Snazzy light theme', shikiTheme: 'snazzy-light', tone: 'light' },
  { id: 'solarized-light', name: 'Solarized Light', description: 'Solarized light theme', shikiTheme: 'solarized-light', tone: 'light' },
  { id: 'vitesse-light', name: 'Vitesse Light', description: 'Vitesse light theme', shikiTheme: 'vitesse-light', tone: 'light' },
];

function flattenThemeColors(theme: ExpressiveCodeTheme): Record<string, string> {
  const scoped = theme.settings.reduce((acc, item) => {
    const { scope, settings } = item;
    const { foreground } = settings;
    if (scope && foreground) {
      for (const s of scope) {
        acc[s] = foreground.toLowerCase().trim();
      }
    }
    return acc;
  }, {} as Record<string, string>);
  return { ...theme.colors, ...scoped };
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  const [_, r, g, b] = result;
  return `${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}`;
}

function lightenColor(hex: string, percent = 15): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  const r = Math.min(255, parseInt(result[1], 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, parseInt(result[2], 16) + Math.round(255 * percent / 100));
  const b = Math.min(255, parseInt(result[3], 16) + Math.round(255 * percent / 100));
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function deriveColors(colors: Record<string, string>) {
  const getColor = (keys: string[], fallback: string): string => {
    for (const key of keys) {
      if (colors[key]) return colors[key].toLowerCase();
    }
    return fallback;
  };

  const background = getColor(['editor.background'], '#000000');
  const foreground = getColor(['editor.foreground', 'foreground'], '#ffffff');
  const primary = getColor(
    [
      'activityBarBadge.background',
      'button.background',
      'focusBorder',
      'terminal.ansiBlue',
      'textLink.foreground',
      'editor.foreground',
    ],
    '#0080ff',
  );

  const primaryLight = lightenColor(primary, 15);
  const primaryLightest = lightenColor(primary, 30);
  const primaryRgb = hexToRgb(primary);
  const accent = primary;
  const link = primaryLight;
  const border = getColor(['panel.border', 'contrastBorder'], accent);
  const separator = border;
  const foregroundSecondary = getColor(['editorLineNumber.foreground', 'descriptionForeground'], foreground);

  return {
    background,
    foreground,
    foregroundSecondary,
    primary,
    primaryLight,
    primaryLightest,
    primaryRgb,
    border,
    separator,
    accent,
    link,
  };
}

async function main() {
  const themes: GeneratedTheme[] = [];

  for (const def of themeDefinitions) {
    const shikiTheme = await loadShikiTheme(def.shikiTheme);
    const flat = flattenThemeColors(shikiTheme);
    const colors = deriveColors(flat);
    themes.push({ id: def.id, name: def.name, description: def.description, tone: def.tone, colors });
    console.log(`✓ ${def.id}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    themes,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`
Generated ${themes.length} themes to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
