import { type LanguageModel, type ModelMessage, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import type { DocsIndex } from '../../lib/ai/assistant';

// Snapshot of Ask AI before the prompt and tool changes: the Fumadocs template prompt with a
// Supergate intro, a search tool that returns whole pages, no read tool, and default sampling.
const instructions = [
  'You are an AI assistant for the Supergate documentation site, which covers Cloud (GPU IaaS), Token Factory (OpenAI-compatible inference API), and Bio Pipeline.',
  'Use the `search` tool to retrieve relevant docs context before answering when needed.',
  'A user message may begin with [Client Context], the page they are reading. For questions about "this page", search its title.',
  'The `search` tool returns raw JSON results from documentation. Use those results to ground your answer and cite sources as markdown links using the document `url` field when available.',
  'If you cannot find the answer in search results, say you do not know and suggest a better search query.',
].join('\n');

export function streamBaselineAnswer({
  model,
  index,
  messages,
}: {
  model: LanguageModel;
  index: DocsIndex;
  messages: ModelMessage[];
}) {
  const search = tool({
    description: 'Search the docs content and return raw JSON results.',
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(100).default(10),
    }),
    async execute({ query, limit }) {
      const pages = await index.search(query, { limit });
      return pages.map((page) => ({ id: page.url, doc: page }));
    },
  });

  return streamText({
    model,
    stopWhen: stepCountIs(5),
    tools: { search },
    instructions,
    messages,
    toolChoice: 'auto',
  });
}
