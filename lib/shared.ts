import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Supergate Docs';
/** Prefix for URLs that Next.js does not rewrite itself, such as fetch() targets. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'supergate-hub',
  repo: 'docs',
  branch: 'main',
};

/** Ask AI is a proof of concept, so it stays off unless ASK_AI_ENABLED=true (server-side only). */
export const askAiEnabled = process.env.ASK_AI_ENABLED === 'true';

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
