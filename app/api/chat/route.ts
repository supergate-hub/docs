import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createUIMessageStreamResponse, toUIMessageStream } from 'ai';
import {
  createDocsIndex,
  type DocsIndex,
  resolveModels,
  streamDocsAnswer,
  toModelMessages,
} from '@/lib/ai/assistant';
import { askAiEnabled, basePath } from '@/lib/shared';
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
  return createDocsIndex(pages, { basePath });
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
const models = resolveModels(process.env.OPENROUTER_MODEL);

export async function POST(req: Request) {
  if (!askAiEnabled) return new Response('Not Found', { status: 404 });

  const reqJson = await req.json();
  docsIndex ??= loadDocsIndex();

  const result = streamDocsAnswer({
    model: openrouter.chat(models.primary, { models: models.fallbacks }),
    index: await docsIndex,
    messages: await toModelMessages(reqJson.messages ?? []),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
