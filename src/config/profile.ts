/**
 * Profile configuration
 * Personal information and social links
 */

import type { Social } from '../types';

/**
 * Quick info displayed in profile card
 */
export const QUICK_INFO = [
	'Pwning Systems since 1895',
	'Full Queue Developer',
	'Computer Master when Using AI',
];

/**
 * Social media links
 */
export const SOCIAL_LINKS: Social[] = [
	{
		name: 'GitHub',
		url: 'https://github.com/MuelNova',
		icon: 'ph:github-logo-duotone',
	},
	{
		name: 'X (Twitter)',
		url: 'https://x.com/NovaNoir_',
		icon: 'ph:x-logo-duotone',
	},
	{
		name: 'Email',
		url: 'mailto:muel@nova.gal',
		icon: 'ph:envelope-duotone',
	},
];
