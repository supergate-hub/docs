'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { ReactNode } from 'react';
import type { ChatUIMessage } from '@/lib/ai/types';
import { basePath } from '@/lib/shared';
import { AIChatProvider, AIChatSearch } from './chat';

export type { ChatUIMessage, ReadTool, SearchTool } from '@/lib/ai/types';
export { AIChatPanel, AIChatTrigger, useAIChat } from './chat';

// The static site has no server, so a deployed build points this at the Ask AI Worker. Without
// it, the chat posts to the Next.js route, which only runs under `pnpm dev`.
const chatApiUrl = process.env.NEXT_PUBLIC_CHAT_API_URL || `${basePath}/api/chat/`;

export function AIChat({ children }: { children: ReactNode }) {
  const chat = useChat<ChatUIMessage>({
    id: 'search',
    throttle: 40,
    transport: new DefaultChatTransport({ api: chatApiUrl }),
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
