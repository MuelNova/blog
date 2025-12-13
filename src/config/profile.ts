/**
 * Profile configuration
 * Personal information and social links
 */

import type { Social } from '../types';

// Quick info localization helper
export { getQuickInfo } from '../i18n/messages/profile';

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
