import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';
import { StaticSearchDialog } from '@/components/search-dialog';
import { Body } from './layout.client';

export const metadata: Metadata = {
  // Absolute origin for OG image URLs, set by the deploy workflow.
  metadataBase: process.env.SITE_ORIGIN ? new URL(process.env.SITE_ORIGIN) : undefined,
};

const geist = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`} suppressHydrationWarning>
      <Body>
        <RootProvider
          search={{ SearchDialog: StaticSearchDialog }}
          i18n={{
            // Shown in the product dropdown on pages outside any product, such as the hub.
            translations: { 'Layout Tab(layout tab trigger)': 'Select a product' },
          }}
        >
          {children}
        </RootProvider>
      </Body>
    </html>
  );
}
