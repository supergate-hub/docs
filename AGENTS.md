# AGENTS.md

Guidance for AI coding agents and contributors working in this repository.
`CLAUDE.md` imports this file, so keep all shared rules here.

## Project

Public documentation site for Supergate's three products, built with
[Fumadocs](https://fumadocs.dev) on Next.js (App Router) and Fumadocs MDX.

| Product | Content folder | URL |
| --- | --- | --- |
| Cloud (GPU IaaS) | `content/docs/cloud/` | `/cloud` |
| Token Factory (OpenAI-compatible inference API) | `content/docs/token-factory/` | `/token-factory` |
| Bio Pipeline | `content/docs/bio/` | `/bio` |

The marketing landing site is a separate project. This app only serves docs, so the
docs live at the site root and the hub page is `/`. The site is a static export
published to GitHub Pages; see [Deployment](#deployment).

**This repository is public.** Everything committed here is visible to anyone.

## Commands

Use pnpm. The version is pinned in `package.json`.

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm lint           # Biome lint and format check
pnpm types:check    # next typegen + tsc
pnpm build          # static export to out/
pnpm start          # serve out/ locally
```

Run `pnpm lint`, `pnpm types:check`, and `pnpm build` before committing.

## Layout

| Path | Purpose |
| --- | --- |
| `content/docs/` | All docs pages (MDX) and sidebar config (`meta.json`) |
| `content/docs/index.mdx` | Docs hub that links to each product |
| `lib/source.ts` | Content source, loader, and `llms.txt` rendering |
| `lib/shared.ts` | App name, routes, base path, GitHub repo used by page links, and the Ask AI flag |
| `lib/layout.shared.tsx` | Nav options shared by layouts |
| `components/mdx.tsx` | Components available in MDX without imports |
| `components/search-dialog.tsx` | Search dialog that queries the exported index in the browser |
| `app/(docs)/` | Docs layout and the catch-all page route at the site root |
| `app/api/search/` | Search index, exported at build time |
| `app/llms.txt`, `app/llms-full.txt`, `app/llms.mdx` | Machine-readable docs for AI agents |
| `app/og/` | Generated Open Graph images |
| `.github/workflows/pages.yml` | Builds every pull request; builds and deploys `main` to GitHub Pages |

Do not edit generated output in `.source/`, `.next/`, or `out/`.

## Deployment

`main` deploys to GitHub Pages through `.github/workflows/pages.yml`. Pull requests run
the same lint and build without deploying.

- **Static only.** `next.config.mjs` sets `output: 'export'`, so nothing runs at request
  time: no middleware, no `redirects()`, and no route handlers other than static `GET`.
- **Base path.** On `github.io` the site lives under `/docs` (the repository name),
  so a page such as `/cloud` is served at `/docs/cloud/`. The workflow passes it as
  `NEXT_PUBLIC_BASE_PATH`. Next.js adds it
  to `<Link>` and assets; prefix `basePath` from `lib/shared.ts` yourself for URLs that
  code fetches directly.
- **Custom domain.** Set it in the repository's Pages settings. `configure-pages` then
  reports an empty base path, and no code change is needed.

## Ask AI (off by default)

Ask AI is a proof of concept. It runs only when `ASK_AI_ENABLED=true` under `pnpm dev`;
otherwise the header has no Ask AI button and `/api/chat` returns 404. It cannot run on
GitHub Pages, which has no server. See `.env.example` for the OpenRouter settings it needs.

| Path | Purpose |
| --- | --- |
| `lib/ai/assistant.ts` | Docs index, `search`/`read` tools, instructions, and model settings |
| `app/api/chat/route.ts` | Chat endpoint; builds the index from the docs source |
| `components/ai/` | Chat panel and layout wrapper |
| `scripts/ask-ai-eval/` | Rule-based eval that compares the current setup with a baseline |

- Keep `lib/ai/assistant.ts` free of Next.js and Fumadocs imports. The eval imports it
  outside the app.
- `components/ai/chat`, `components/codeblock.tsx`, `components/tabs`, `components/ui`,
  and `lib/merge-refs.ts` come from the Fumadocs CLI. Biome lint skips them; prefer
  updating them through the CLI over hand edits.
- Run the eval with the dev server up: `pnpm eval:ask-ai`. Free OpenRouter models allow
  50 requests a day, so use `--cases` to run a subset and `--rescore <report>` to
  re-apply the checks without calling the model.

## Content rules

- Each product is a root folder (`"root": true` in its `meta.json`), which makes
  it a sidebar tab. Put product pages inside their product folder, never at the
  top level of `content/docs/`.
- Every page needs `title` and `description` in frontmatter. Search, `llms.txt`,
  and OG images use them.
- Sidebar order comes from the `pages` array in `meta.json`. A page that is not
  listed there does not appear in the sidebar, so add new pages to it. Group
  pages with `"---Separator---"` entries.
- Write docs in English, in plain and direct sentences.
- For code samples in several languages, use code-block tabs with
  `tab-group="lang"` (Python, JavaScript, cURL) so the reader's choice persists
  across pages. For console vs CLI steps, use
  `<Tabs groupId="interface" persist items={['Console', 'CLI']}>`.
- Link to other pages with relative file paths (`./quickstart.mdx`) or absolute
  docs URLs (`/cloud/quickstart`).
- Mark unfinished pages with a `<Callout type="warn" title="Draft">` at the top.

### Page templates

- **Token Factory quickstart and guides**: show the OpenAI SDK with a changed
  `base_url` first, in Python, JavaScript, and cURL tabs.
- **Bio task page** (`bio/tasks/`): comparison table of candidate tools
  (inputs, outputs, capabilities), then recommendations by situation.
- **Bio tool page** (`bio/tools/`): modes, then required and optional
  parameters for each mode by API field name, then outputs and an example job.
- **API reference**: generate from the OpenAPI spec with `fumadocs-openapi`
  rather than writing it by hand.

## Public repository rules

- Never commit secrets, real API keys, internal hostnames, unreleased product
  details, customer names, or internal pricing. Use placeholders such as
  `<TOKEN_FACTORY_BASE_URL>` and `<model-id>`.
- Never commit competitive analysis or screenshots of third-party sites.
  `rea-captures/` is ignored for this reason.
- Keep `.env*` files out of Git. Commit only `.env.example` if one is needed.

## Git

- Commit messages follow Conventional Commits in English
  (for example `docs(token-factory): add streaming guide`).
- Do not push or open pull requests unless asked.
