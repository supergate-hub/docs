import {
  convertToModelMessages,
  type InferToolOutput,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  tool,
  type UIMessageChunk,
} from 'ai';
import { Document, type DocumentData } from 'flexsearch';
import { z } from 'zod';
import type { ChatUIMessage, ReadTool, SearchTool } from './types';

// Ask AI logic shared by app/api/chat/route.ts, the Cloudflare Worker in worker/, and
// scripts/ask-ai-eval. Keep this module free of Next.js and Fumadocs imports so it runs outside
// the app.

export interface DocsPage {
  url: string;
  title: string;
  description: string;
  content: string;
}

/** Splits llms-full.txt into pages and adds the descriptions listed in llms.txt. */
export function parseLlmsText(full: string, list: string): DocsPage[] {
  const descriptions = new Map(
    [...list.matchAll(/\[[^\]]+\]\((\/[^)]*)\): (.+)$/gm)].map((m) => [m[1], m[2]]),
  );
  const headings = [...full.matchAll(/^# (.+) \((\/[^)]*)\)$/gm)];
  return headings.map((heading, i) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[i + 1]?.index ?? full.length;
    return {
      url: heading[2],
      title: heading[1],
      description: descriptions.get(heading[2]) ?? '',
      content: full.slice(start, end).trim(),
    };
  });
}

const DEFAULT_MODELS =
  'google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,poolside/laguna-s-2.1:free';

/**
 * Reads a comma-separated list of OpenRouter models that support tool calling. OpenRouter tries
 * the fallbacks in order when a model is down or rate-limited, which happens often with free
 * models.
 */
export function resolveModels(value: string | undefined) {
  const [primary, ...fallbacks] = (value || DEFAULT_MODELS)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return { primary, fallbacks };
}

type IndexedPage = DocsPage & DocumentData;

export interface DocsIndex {
  pages: DocsPage[];
  /** Path prefix the site is served under, such as /docs on github.io; empty at a domain root. */
  basePath: string;
  search: (query: string, options: { limit: number; suggest?: boolean }) => Promise<DocsPage[]>;
}

export function createDocsIndex(pages: DocsPage[], { basePath = '' } = {}): DocsIndex {
  const index = new Document<IndexedPage>({
    document: {
      id: 'url',
      index: ['title', 'description', 'content'],
      store: true,
    },
  });
  for (const page of pages) index.add(page as IndexedPage);

  return {
    pages,
    basePath: basePath.replace(/\/$/, ''),
    async search(query, { limit, suggest = false }) {
      const results = await index.searchAsync(query, { limit, suggest, merge: true, enrich: true });
      return results.flatMap(({ doc }) => (doc ? [doc] : []));
    },
  };
}

/**
 * Finds the page a URL or path points to. Browser URLs include the base path, trailing slashes
 * come from trailingSlash in next.config.mjs, and the hub page is "/".
 */
export function findPage(index: DocsIndex, url: string): DocsPage | undefined {
  let pathname: string;
  try {
    pathname = new URL(url, 'http://docs.local').pathname;
  } catch {
    return undefined;
  }
  const { basePath } = index;
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`)))
    pathname = pathname.slice(basePath.length);
  pathname = pathname.replace(/\/$/, '') || '/';
  return index.pages.find((page) => page.url === pathname);
}

export const assistantInstructions = [
  'You are the AI assistant for the Supergate documentation site, which covers Cloud (GPU IaaS), Token Factory (OpenAI-compatible inference API), and Bio Pipeline.',
  'Answer only from the documentation. Use `search` to find relevant pages, then `read` the one or two most relevant pages before answering.',
  'A user message may begin with [Client Context], the page the user is reading. For questions about "this page", `read` that page directly.',
  'Never invent URLs, endpoints, API keys, model IDs, prices, limits, or any other value that does not appear in the pages you read.',
  'Keep placeholders such as `<TOKEN_FACTORY_BASE_URL>` and `<model-id>` exactly as written, and tell the user to replace them.',
  'Cite sources as markdown links in the form [Page title](/token-factory/quickstart), using the `title` and the `url` path exactly as the tools return it. Never add a scheme or domain, and never output raw JSON.',
  "Answer in the same language as the user's question, even though the documentation is in English.",
  'If the documentation does not cover the question, say so and suggest a better search query.',
].join('\n');

const MAX_READ_CHARS = 20_000;

export function createDocsTools(index: DocsIndex) {
  const search = tool({
    description:
      'Search the docs and return matching pages with a short snippet each. Use `read` to get the full page.',
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    async execute({ query, limit }): Promise<InferToolOutput<SearchTool>> {
      let pages = await index.search(query, { limit });
      // A multi-word query only matches pages that contain every term, so fall back to pages
      // that match some of them instead of returning nothing.
      if (pages.length === 0) pages = await index.search(query, { limit, suggest: true });

      return pages.map((page) => ({
        doc: {
          url: page.url,
          title: page.title,
          description: page.description,
          snippet: snippetOf(page.content, query),
        },
      }));
    },
  }) satisfies SearchTool;

  const read = tool({
    description:
      'Read the full Markdown of one docs page by its URL or path, such as /token-factory/quickstart.',
    inputSchema: z.object({
      url: z.string(),
    }),
    async execute({ url }): Promise<InferToolOutput<ReadTool>> {
      // Accepts absolute URLs from [Client Context] as well as docs paths from search results.
      const page = findPage(index, url);
      if (!page) return { error: `No docs page at ${url}. Use search to find the right URL.` };

      return {
        url: page.url,
        title: page.title,
        content: page.content.slice(0, MAX_READ_CHARS),
        truncated: page.content.length > MAX_READ_CHARS,
      };
    },
  }) satisfies ReadTool;

  return { search, read };
}

/** ~300 characters around the first query term found in the content. */
function snippetOf(content: string, query: string): string {
  const lower = content.toLowerCase();
  const hit = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (hit ?? 0) - 100);
  return content
    .slice(start, start + 300)
    .replace(/\s+/g, ' ')
    .trim();
}

const CITATION = /【([^】]*)】/g;
/** Longest text held after an unclosed 【 before it is sent as plain text. */
const MAX_CITATION_CHARS = 500;

/**
 * Some models cite sources in lenticular brackets, such as 【/cloud/quickstart】 or
 * 【{"url":"/cloud/quickstart","title":"Quickstart"}】, whatever the instructions say. Turns each
 * into a markdown link to the page it names and drops citations that name no page. `before` is
 * the character preceding `text`, so a link is not glued to the previous word.
 */
export function rewriteCitations(text: string, index: DocsIndex, before = ''): string {
  return text.replace(CITATION, (_match, inner: string, offset: number) => {
    const page = citedPage(inner, index);
    if (!page) return '';
    const previous = offset > 0 ? text[offset - 1] : before;
    const space = previous && !/\s/.test(previous) ? ' ' : '';
    return `${space}[${page.title}](${page.url})`;
  });
}

function citedPage(inner: string, index: DocsIndex): DocsPage | undefined {
  const value = inner.trim();
  if (value.startsWith('{')) {
    try {
      const cited = JSON.parse(value) as { url?: unknown; id?: unknown; doc?: { url?: unknown } };
      const url = [cited.url, cited.doc?.url, cited.id].find((v) => typeof v === 'string');
      return typeof url === 'string' ? findPage(index, url) : undefined;
    } catch {
      return undefined;
    }
  }
  const url = value.match(/https?:\/\/\S+|\/\S*/)?.[0];
  return url ? findPage(index, url) : undefined;
}

/**
 * Applies rewriteCitations to the text of a UI message stream. A citation can span several
 * deltas, so text from an unclosed 【 is held until its 】 arrives or the text part ends.
 */
export function citationLinks(index: DocsIndex): TransformStream<UIMessageChunk, UIMessageChunk> {
  const held = new Map<string, string>();
  const lastChar = new Map<string, string>();

  return new TransformStream({
    transform(chunk, controller) {
      if (chunk.type === 'text-delta') {
        let text = (held.get(chunk.id) ?? '') + chunk.delta;
        held.delete(chunk.id);
        const open = text.lastIndexOf('【');
        if (open !== -1 && !text.includes('】', open) && text.length - open <= MAX_CITATION_CHARS) {
          held.set(chunk.id, text.slice(open));
          text = text.slice(0, open);
        }
        const delta = rewriteCitations(text, index, lastChar.get(chunk.id));
        if (delta) {
          lastChar.set(chunk.id, delta.slice(-1));
          controller.enqueue({ ...chunk, delta });
        }
        return;
      }
      if (chunk.type === 'text-end') {
        // An unclosed 【 is not a citation; send it as written.
        const rest = held.get(chunk.id);
        if (rest) controller.enqueue({ type: 'text-delta', id: chunk.id, delta: rest });
        held.delete(chunk.id);
        lastChar.delete(chunk.id);
      }
      controller.enqueue(chunk);
    },
  });
}

/** Converts chat UI messages, turning the page the user is reading into a text prefix. */
export function toModelMessages(messages: ChatUIMessage[]): Promise<ModelMessage[]> {
  return convertToModelMessages<ChatUIMessage>(messages, {
    convertDataPart(part) {
      if (part.type === 'data-client')
        return {
          type: 'text',
          text: `[Client Context: ${JSON.stringify(part.data)}]`,
        };
    },
  });
}

export function streamDocsAnswer({
  model,
  index,
  messages,
}: {
  model: LanguageModel;
  index: DocsIndex;
  messages: ModelMessage[];
}) {
  return streamText({
    model,
    // Low temperature keeps answers close to the docs. The output cap bounds cost and latency per
    // step and leaves room for reasoning models, which count thinking tokens as output.
    temperature: 0.2,
    maxOutputTokens: 1500,
    // search -> read -> answer takes three steps; the rest allows a retry of each tool.
    stopWhen: stepCountIs(6),
    tools: createDocsTools(index),
    instructions: assistantInstructions,
    messages,
    toolChoice: 'auto',
  });
}
