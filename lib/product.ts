// Top-level folders under content/docs that are product tabs.
export const products = ['cloud', 'token-factory', 'bio'] as const;

export type Product = (typeof products)[number];

export function getProduct(segment: string | undefined): Product | undefined {
  return products.find((product) => product === segment);
}
