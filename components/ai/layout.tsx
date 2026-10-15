'use client';
import { type DocsLayoutProps, DocsLayout as Layout } from 'fumadocs-ui/layouts/spacious';
import { AIChat, AIChatPanel, useAIChat } from './search';

// The Spacious layout opens the chat from its header Ask AI button (components/header-actions.tsx).
export function DocsLayout(props: DocsLayoutProps) {
  return (
    <AIChat>
      <ChatLayout {...props} />
    </AIChat>
  );
}

function ChatLayout(props: DocsLayoutProps) {
  const { open, setOpen } = useAIChat();

  return <Layout {...props} aiChat={{ open, onOpenChange: setOpen, panel: <AIChatPanel /> }} />;
}
