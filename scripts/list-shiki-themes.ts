/**
 * List all available Shiki bundled themes
 */

import { bundledThemes } from 'shiki';

console.log('📋 Available Shiki Themes:\n');
console.log(`Total: ${Object.keys(bundledThemes).length} themes\n`);

const themes = Object.keys(bundledThemes).sort();

for (const theme of themes) {
	console.log(`  - ${theme}`);
}

console.log('\n✅ Done!');
