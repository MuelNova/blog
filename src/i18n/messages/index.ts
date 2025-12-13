export const messageModules = ['common', 'home', 'about', 'blog', 'share', 'links'] as const;
export type MessageModuleName = (typeof messageModules)[number];
