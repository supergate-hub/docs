'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type InferUITool, type Tool, type UIMessage } from 'ai';
import type { ReactNode } from 'react';
import { basePath } from '@/lib/shared';
import { type AIChatClientData, AIChatProvider, AIChatSearch } from './chat';

export { AIChatPanel, AIChatTrigger, useAIChat } from './chat';

export type SearchTool = Tool<
  { query: string; limit: number },
  { doc?: { url: string; title: string; description?: string; snippet?: string } | null }[]
>;

export type ReadTool = Tool<
  { url: string },
  { url: string; title: string; content: string; truncated: boolean } | { error: string }
>;

export type ChatUIMessage = UIMessage<
  never,
  { client: AIChatClientData },
  { search: InferUITool<SearchTool>; read: InferUITool<ReadTool> }
>;

export function AIChat({ children }: { children: ReactNode }) {
  const chat = useChat<ChatUIMessage>({
    id: 'search',
    throttle: 40,
    transport: new DefaultChatTransport({
      // Matches trailingSlash in next.config.mjs, which would otherwise redirect the POST.
      api: `${basePath}/api/chat/`,
    }),
  });

  return (
    <AIChatProvider
      chat={chat}
      renderPart={renderPart}
      suggestions={[
        'Summarize this page',
        'How do I call Token Factory with the OpenAI SDK?',
        'How do I create a GPU instance?',
      ]}
    >
      {children}
    </AIChatProvider>
  );
}

function renderPart(part: ChatUIMessage['parts'][number], live: boolean) {
  if (part.type === 'tool-search') return <AIChatSearch part={part} live={live} />;
}
