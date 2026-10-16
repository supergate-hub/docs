import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createUIMessageStreamResponse, toUIMessageStream } from 'ai';
import {
  createDocsIndex,
  resolveModels,
  streamDocsAnswer,
  toModelMessages,
} from '../../lib/ai/assistant';
// Written by `pnpm worker:docs` from the docs build.
import pages from './generated/docs.json';

interface Env {
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  ALLOWED_ORIGINS: string;
  DOCS_BASE_PATH: string;
  CHAT_RATE_LIMITER: RateLimit;
}

// The chat panel sends the whole conversation each turn, so these bound a single request.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 20;

let docsIndex: ReturnType<typeof createDocsIndex> | undefined;

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== '/api/chat' && pathname !== '/api/chat/') return text(404, 'Not Found');

    // Browsers only: other origins get no CORS headers and are refused outright.
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS);
    if (!cors) return text(403, 'Forbidden');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return text(405, 'Method Not Allowed', cors);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.CHAT_RATE_LIMITER.limit({ key: ip });
    if (!success) return text(429, 'Too many requests. Please wait a minute.', cors);

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
      return text(413, 'Request too large.', cors);
    let messages: unknown;
    try {
      messages = (JSON.parse(body) as { messages?: unknown }).messages;
    } catch {
      return text(400, 'Invalid JSON.', cors);
    }
    if (!Array.isArray(messages)) return text(400, 'Missing messages.', cors);
    if (messages.length > MAX_MESSAGES)
      return text(413, 'This conversation is too long. Start a new chat.', cors);

    docsIndex ??= createDocsIndex(pages, { basePath: env.DOCS_BASE_PATH });
    const models = resolveModels(env.OPENROUTER_MODEL);
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

    const result = streamDocsAnswer({
      model: openrouter.chat(models.primary, { models: models.fallbacks }),
      index: docsIndex,
      messages: await toModelMessages(messages),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
      headers: cors,
    });
  },
} satisfies ExportedHandler<Env>;

function corsHeaders(origin: string | null, allowed: string): Record<string, string> | undefined {
  const origins = allowed.split(',').map((value) => value.trim());
  if (!origin || !origins.includes(origin)) return undefined;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function text(status: number, message: string, headers?: Record<string, string>): Response {
  return new Response(message, { status, headers });
}
