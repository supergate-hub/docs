export interface EvalCase {
  id: string;
  question: string;
  /** The page the user is reading, sent the way the chat panel sends [Client Context]. */
  page?: { path: string; title: string };
  expect: {
    language: 'en' | 'ko';
    /** At least one of these docs paths must be linked. */
    cites?: string[];
    /** Must appear verbatim, such as placeholders the docs use instead of real values. */
    placeholders?: string[];
    /** Must appear, case-insensitive. */
    mentions?: string[];
    /** The docs do not cover the question, so the answer must say so. */
    admitsUnknown?: boolean;
    /** The docs list no prices, so the answer must not state one. */
    noPrices?: boolean;
  };
}

export const cases: EvalCase[] = [
  {
    id: 'tf-base-url-en',
    question: 'How do I set the base URL when calling Token Factory with the OpenAI Python SDK?',
    expect: {
      language: 'en',
      cites: ['/token-factory/quickstart', '/token-factory/migrate-from-openai'],
      placeholders: ['<TOKEN_FACTORY_BASE_URL>'],
    },
  },
  {
    id: 'tf-base-url-ko',
    question: 'OpenAI Python SDK로 Token Factory를 호출하려면 base URL을 어떻게 설정하나요?',
    expect: {
      language: 'ko',
      cites: ['/token-factory/quickstart', '/token-factory/migrate-from-openai'],
      placeholders: ['<TOKEN_FACTORY_BASE_URL>'],
    },
  },
  {
    id: 'this-page-summary',
    question: 'Summarize this page',
    page: { path: '/cloud/quickstart', title: 'Quickstart' },
    expect: {
      language: 'en',
      cites: ['/cloud/quickstart'],
      mentions: ['SSH'],
    },
  },
  {
    id: 'price-not-in-docs',
    question: 'How much does DeepSeek cost per million tokens on Token Factory?',
    expect: {
      language: 'en',
      admitsUnknown: true,
      noPrices: true,
    },
  },
  {
    id: 'bio-tool-not-in-docs-ko',
    question: 'Bio Pipeline에서 AlphaFold를 사용할 수 있나요?',
    expect: {
      language: 'ko',
      admitsUnknown: true,
    },
  },
  {
    id: 'endpoints-multi-word',
    question: 'For steady high-volume traffic, should I use serverless or dedicated endpoints?',
    expect: {
      language: 'en',
      cites: ['/token-factory/endpoints'],
      mentions: ['dedicated'],
    },
  },
];
