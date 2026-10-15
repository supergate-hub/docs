import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createUIMessageStreamResponse, toUIMessageStream } from 'ai';
import {
  createDocsIndex,
  type DocsIndex,
  streamDocsAnswer,
  toModelMessages,
} from '@/lib/ai/assistant';
import { askAiEnabled } from '@/lib/shared';
import { source } from '@/lib/source';

let docsIndex: Promise<DocsIndex> | undefined;

async function loadDocsIndex() {
  const pages = await chunkedAll(
    source.getPages().map(async (page) => ({
      url: page.url,
      title: page.data.title,
      description: page.data.description ?? '',
      content: await page.data.getText('processed'),
    })),
  );
  return createDocsIndex(pages);
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

export async function POST(req: Request) {
  if (!askAiEnabled) return new Response('Not Found', { status: 404 });

  const reqJson = await req.json();
  docsIndex ??= loadDocsIndex();

  const result = streamDocsAnswer({
    model: openrouter.chat(primaryModel, { models: fallbackModels }),
    index: await docsIndex,
    messages: await toModelMessages(reqJson.messages ?? []),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
