// Types the docs bundle that `pnpm worker:docs` writes, so type checks pass before it exists.
declare module '*/generated/docs.json' {
  const pages: import('../../lib/ai/assistant').DocsPage[];
  export default pages;
}
