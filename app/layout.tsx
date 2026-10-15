import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Geist, JetBrains_Mono } from 'next/font/google';
import { Body } from './layout.client';

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
