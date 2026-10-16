import type { InferUITool, Tool, UIMessage } from 'ai';

// Message and tool types shared by the chat panel, the Next.js route, and the Worker. Kept free of
// React so the Worker can type-check against it.

export type SearchTool = Tool<
  { query: string; limit: number },
  { doc?: { url: string; title: string; description?: string; snippet?: string } | null }[]
>;

export type ReadTool = Tool<
  { url: string },
  { url: string; title: string; content: string; truncated: boolean } | { error: string }
>;

/** The page a question is asked from, sent as a `data-client` part. */
export interface ChatClientData {
  location: string;
  title: string;
}

export type ChatUIMessage = UIMessage<
  never,
  { client: ChatClientData },
  { search: InferUITool<SearchTool>; read: InferUITool<ReadTool> }
>;
