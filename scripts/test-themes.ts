/**
 * Test script to verify Shiki theme extraction
 * Run with: node --loader tsx scripts/test-themes.ts
 */

import { getThemes, getDefaultTheme } from '../src/config/themes';

async function testThemes() {
	console.log('🎨 Testing Shiki Theme Extraction...\n');

	try {
		// Load all themes
		const themes = await getThemes();
		
		console.log(`✅ Successfully loaded ${themes.length} themes:\n`);
		
		// Display each theme's colors
		for (const theme of themes) {
			console.log(`📦 ${theme.name} (${theme.id})`);
			console.log(`   Description: ${theme.description}`);
			console.log(`   Colors:`);
			console.log(`     Background: ${theme.colors.background}`);
			console.log(`     Foreground: ${theme.colors.foreground}`);
			console.log(`     Primary: ${theme.colors.primary}`);
			console.log(`     Border: ${theme.colors.border}`);
			console.log('');
		}

		// Test default theme
		const defaultTheme = await getDefaultTheme();
		console.log(`✨ Default theme: ${defaultTheme.name}\n`);

		console.log('✅ All tests passed!');
	} catch (error) {
		console.error('❌ Error testing themes:', error);
		process.exit(1);
	}
}

testThemes();
