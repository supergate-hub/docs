import {
  convertToModelMessages,
  type InferToolOutput,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { Document, type DocumentData } from 'flexsearch';
import { z } from 'zod';
import type { ChatUIMessage, ReadTool, SearchTool } from '@/components/ai/search';

// Ask AI logic shared by app/api/chat/route.ts and scripts/ask-ai-eval. Keep this module free of
// Next.js and Fumadocs imports so the eval can run it outside the app.

export interface DocsPage {
  url: string;
  title: string;
  description: string;
  content: string;
}

type IndexedPage = DocsPage & DocumentData;

export interface DocsIndex {
  pages: DocsPage[];
  search: (query: string, options: { limit: number; suggest?: boolean }) => Promise<DocsPage[]>;
}

export function createDocsIndex(pages: DocsPage[]): DocsIndex {
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
    async search(query, { limit, suggest = false }) {
      const results = await index.searchAsync(query, { limit, suggest, merge: true, enrich: true });
      return results.flatMap(({ doc }) => (doc ? [doc] : []));
    },
  };
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
      // Accept absolute URLs from [Client Context] as well as docs paths from search results.
      // Trailing slashes come from trailingSlash in next.config.mjs; the hub page is "/".
      const pathname = new URL(url, 'http://docs.local').pathname.replace(/\/$/, '') || '/';
      const page = index.pages.find((page) => page.url === pathname);
      if (!page) return { error: `No docs page at ${pathname}. Use search to find the right URL.` };

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
