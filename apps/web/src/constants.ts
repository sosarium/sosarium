export const title: string = 'Sosarium';
export const description: string = 'View and edit Ultima Online files.';
export const keywords: string[] = ['sosarium', 'ultima online', 'mul', 'uop', 'uo client'];

export const siteUrl: string =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3000';

export const repoUrl: string = 'https://github.com/sosarium/sosarium';
