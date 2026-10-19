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
| `.github/workflows/pages.yml` | Checks every pull request; deploys `main` to GitHub Pages and the Ask AI Worker |
| `renovate.json` | Weekly dependency update PRs. Pin each action by SHA with a `# vX.Y.Z` comment, which Renovate needs to update it |

Do not edit generated output in `.source/`, `.next/`, or `out/`.

## Deployment

`main` deploys through `.github/workflows/pages.yml`: the static site to GitHub Pages and
the Ask AI Worker to Cloudflare. Pull requests run the same lint, type checks, build, and a
Worker bundle check (`wrangler deploy --dry-run`) without deploying.

- **Static only.** `next.config.mjs` sets `output: 'export'`, so nothing runs at request
  time: no middleware, no `redirects()`, and no route handlers other than static `GET`.
- **Base path.** On `github.io` the site lives under `/docs` (the repository name),
  so a page such as `/cloud` is served at `/docs/cloud/`. The workflow passes it as
  `NEXT_PUBLIC_BASE_PATH`. Next.js adds it
  to `<Link>` and assets; prefix `basePath` from `lib/shared.ts` yourself for URLs that
  code fetches directly.
- **Custom domain.** Set it in the repository's Pages settings. `configure-pages` then
  reports an empty base path, and no code change is needed. Update `ALLOWED_ORIGINS` and
  `DOCS_BASE_PATH` in `worker/wrangler.jsonc` to match.
- **Worker.** The `deploy-worker` job uses the `production` environment, which only `main`
  may use. It reads `CLOUDFLARE_API_TOKEN` and `OPENROUTER_API_KEY` from that environment's
  secrets and `CLOUDFLARE_ACCOUNT_ID` from its variables, and uploads the OpenRouter key as
  a Worker secret with each version.
- **Turning Ask AI on.** Set the repository variables `ASK_AI_ENABLED=true` and
  `CHAT_API_URL` (the Worker's `/api/chat` URL). Until then the deployed site has no Ask AI
  button, even though the Worker is deployed. Add bot protection first; see issue #1.

## Ask AI (off by default)

Ask AI is a proof of concept and stays off unless `ASK_AI_ENABLED=true` at build or dev
time; otherwise the header has no Ask AI button. GitHub Pages has no server, so the
deployed chat endpoint is a Cloudflare Worker in `worker/`. The Next.js route
`/api/chat` serves the same logic under `pnpm dev` and returns 404 when the flag is off.

| Path | Purpose |
| --- | --- |
| `lib/ai/assistant.ts` | Docs index, `search`/`read` tools, instructions, model list, and `llms*.txt` parsing |
| `lib/ai/types.ts` | Chat message and tool types shared by the panel, the route, and the Worker |
| `app/api/chat/route.ts` | Chat endpoint for `pnpm dev`; builds the index from the docs source |
| `worker/` | Chat endpoint for the static site (Cloudflare Worker, `wrangler.jsonc`) |
| `scripts/build-worker-docs.ts` | Writes the docs the Worker bundles, from `out/llms*.txt` |
| `components/ai/` | Chat panel and layout wrapper |
| `scripts/ask-ai-eval/` | Rule-based eval that compares the current setup with a baseline |

- Keep `lib/ai/assistant.ts` and `lib/ai/types.ts` free of Next.js, Fumadocs, and React
  imports. The Worker and the eval import them outside the app.
- `components/ai/chat`, `components/codeblock.tsx`, `components/tabs`, `components/ui`,
  and `lib/merge-refs.ts` come from the Fumadocs CLI. Biome lint skips them; prefer
  updating them through the CLI over hand edits.
- Run the eval with the dev server up: `pnpm eval:ask-ai`. Free OpenRouter models allow
  50 requests a day, so use `--cases` to run a subset and `--rescore <report>` to
  re-apply the checks without calling the model.

### Worker

The Worker allows only the origins in `ALLOWED_ORIGINS`, limits each client IP to 10
requests a minute, and rejects bodies over 64 KB or conversations over 20 messages. It
bundles the docs at deploy time instead of fetching them per request, to stay within the
free plan's CPU limit.

```bash
cp worker/.dev.vars.example worker/.dev.vars   # then fill in OPENROUTER_API_KEY
pnpm build && pnpm worker:docs                 # bundle the docs from out/
pnpm worker:dev                                # http://localhost:8787/api/chat
```

To try it from the static site, build with `ASK_AI_ENABLED=true` and
`NEXT_PUBLIC_CHAT_API_URL=http://localhost:8787/api/chat`, then serve `out/` under the
base path set in `DOCS_BASE_PATH`. `wrangler.jsonc` pins the Ops account, so log in with
an account that is a member of it. In production the OpenRouter key is a Worker secret,
never a build variable.

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
