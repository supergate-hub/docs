import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type InferToolOutput,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
} from 'ai';
import { Document, type DocumentData } from 'flexsearch';
import { z } from 'zod';
import { source } from '@/lib/source';
import type { ChatUIMessage, ReadTool, SearchTool } from '../../../components/ai/search';

interface CustomDocument extends DocumentData {
  url: string;
  title: string;
  description: string;
  content: string;
}
const searchServer = createSearchServer();

async function createSearchServer() {
  const search = new Document<CustomDocument>({
    document: {
      id: 'url',
      index: ['title', 'description', 'content'],
      store: true,
    },
  });

  const docs = await chunkedAll(
    source.getPages().map(async (page) => {
      if (!('getText' in page.data)) return null;

      return {
        title: page.data.title,
        description: page.data.description,
        url: page.url,
        content: await page.data.getText('processed'),
      } as CustomDocument;
    }),
  );

  for (const doc of docs) {
    if (doc) search.add(doc);
  }

  return search;
}

async function chunkedAll<O>(promises: Promise<O>[]): Promise<O[]> {
  const SIZE = 50;
  const out: O[] = [];
  for (let i = 0; i < promises.length; i += SIZE) {
    out.push(...(await Promise.all(promises.slice(i, i + SIZE))));
  }
  return out;
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Comma-separated OpenRouter model IDs that support tool calling. OpenRouter tries the next
// one when a model is down or rate-limited, which happens often with free models.
const [primaryModel, ...fallbackModels] = (
  process.env.OPENROUTER_MODEL ??
  'google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,poolside/laguna-s-2.1:free'
)
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const systemPrompt = [
  'You are the AI assistant for the Supergate documentation site, which covers Cloud (GPU IaaS), Token Factory (OpenAI-compatible inference API), and Bio Pipeline.',
  'Answer only from the documentation. Use `search` to find relevant pages, then `read` the one or two most relevant pages before answering.',
  'A user message may begin with [Client Context], the page the user is reading. For questions about "this page", `read` that page directly.',
  'Never invent URLs, endpoints, API keys, model IDs, prices, limits, or any other value that does not appear in the pages you read.',
  'Keep placeholders such as `<TOKEN_FACTORY_BASE_URL>` and `<model-id>` exactly as written, and tell the user to replace them.',
  'Cite sources as markdown links in the form [Page title](/docs/...), using the `title` and the `url` path exactly as the tools return it. Never add a scheme or domain, and never output raw JSON.',
  "Answer in the same language as the user's question, even though the documentation is in English.",
  'If the documentation does not cover the question, say so and suggest a better search query.',
].join('\n');

export async function POST(req: Request) {
  const reqJson = await req.json();

  const result = streamText({
    model: openrouter.chat(primaryModel, { models: fallbackModels }),
    // Low temperature keeps answers close to the docs. The output cap bounds cost and latency per
    // step and leaves room for reasoning models, which count thinking tokens as output.
    temperature: 0.2,
    maxOutputTokens: 1500,
    // search -> read -> answer takes three steps; the rest allows a retry of each tool.
    stopWhen: stepCountIs(6),
    tools: {
      search: searchTool,
      read: readTool,
    },
    instructions: systemPrompt,
    messages: await convertToModelMessages<ChatUIMessage>(reqJson.messages ?? [], {
      convertDataPart(part) {
        if (part.type === 'data-client')
          return {
            type: 'text',
            text: `[Client Context: ${JSON.stringify(part.data)}]`,
          };
      },
    }),
    toolChoice: 'auto',
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}

const searchTool = tool({
  description:
    'Search the docs and return matching pages with a short snippet each. Use `read` to get the full page.',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async execute({ query, limit }): Promise<InferToolOutput<SearchTool>> {
    const search = await searchServer;
    const options = { limit, merge: true, enrich: true } as const;
    let results = await search.searchAsync(query, options);
    // A multi-word query only matches pages that contain every term, so fall back to pages
    // that match some of them instead of returning nothing.
    if (results.length === 0)
      results = await search.searchAsync(query, { ...options, suggest: true });

    return results.map(({ doc }) => ({
      doc: doc && {
        url: doc.url,
        title: doc.title,
        description: doc.description,
        snippet: snippetOf(doc.content, query),
      },
    }));
  },
}) satisfies SearchTool;

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

const MAX_READ_CHARS = 20_000;

const readTool = tool({
  description:
    'Read the full Markdown of one docs page by its URL or path, such as /docs/token-factory/quickstart.',
  inputSchema: z.object({
    url: z.string(),
  }),
  async execute({ url }): Promise<InferToolOutput<ReadTool>> {
    // Accept absolute URLs from [Client Context] as well as docs paths from search results.
    const pathname = new URL(url, 'http://docs.local').pathname.replace(/\/$/, '');
    const page = source.getPages().find((page) => page.url === pathname);
    if (!page) return { error: `No docs page at ${pathname}. Use search to find the right URL.` };

    const content = await page.data.getText('processed');
    return {
      url: page.url,
      title: page.data.title,
      content: content.slice(0, MAX_READ_CHARS),
      truncated: content.length > MAX_READ_CHARS,
    };
  },
}) satisfies ReadTool;
