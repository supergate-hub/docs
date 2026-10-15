# AGENTS.md

Guidance for AI coding agents and contributors working in this repository.
`CLAUDE.md` imports this file, so keep all shared rules here.

## Project

Public documentation site for Supergate's three products, built with
[Fumadocs](https://fumadocs.dev) on Next.js (App Router) and Fumadocs MDX.

| Product | Content folder | URL |
| --- | --- | --- |
| Cloud (GPU IaaS) | `content/docs/cloud/` | `/docs/cloud` |
| Token Factory (OpenAI-compatible inference API) | `content/docs/token-factory/` | `/docs/token-factory` |
| Bio Pipeline | `content/docs/bio/` | `/docs/bio` |

The marketing landing site is a separate project. This app only serves docs, and
`/` redirects to `/docs`.

**This repository is public.** Everything committed here is visible to anyone.

## Commands

Use pnpm. The version is pinned in `package.json`.

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm lint           # Biome lint and format check
pnpm types:check    # next typegen + tsc
pnpm build
```

Run `pnpm lint`, `pnpm types:check`, and `pnpm build` before committing.

## Layout

| Path | Purpose |
| --- | --- |
| `content/docs/` | All docs pages (MDX) and sidebar config (`meta.json`) |
| `content/docs/index.mdx` | Docs hub that links to each product |
| `lib/source.ts` | Content source, loader, and `llms.txt` rendering |
| `lib/shared.ts` | App name, routes, and GitHub repo used by page links |
| `lib/layout.shared.tsx` | Nav options shared by layouts |
| `components/mdx.tsx` | Components available in MDX without imports |
| `app/docs/` | Docs layout and page route |
| `app/api/search/` | Search endpoint (Orama, built at build time) |
| `app/llms.txt`, `app/llms-full.txt`, `app/llms.mdx` | Machine-readable docs for AI agents |
| `app/og/` | Generated Open Graph images |
| `proxy.ts` | Serves Markdown for `*.md` URLs and `Accept: text/markdown` |

Do not edit generated output in `.source/` or `.next/`.

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
  docs URLs (`/docs/cloud/quickstart`).
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
