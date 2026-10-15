'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { getProduct } from '@/lib/product';

// Tags <body> with the current product so global.css can switch the accent color.
export function Body({ children }: { children: ReactNode }) {
  const { slug } = useParams();
  const product = getProduct(Array.isArray(slug) ? slug[0] : undefined);

  return (
    <body className={cn('flex flex-col min-h-screen', product && `product-${product}`)}>
      {children}
    </body>
  );
}
