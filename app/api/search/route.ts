import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

// Exported once at build time; the search dialog downloads it and searches in the browser.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
});
