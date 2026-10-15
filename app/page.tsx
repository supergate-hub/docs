import Link from 'next/link';
import { basePath } from '@/lib/shared';

// The marketing landing lives elsewhere; this app only serves docs. A static export cannot send
// an HTTP redirect, so this page refreshes to /docs and links there for readers without it.
export default function Home() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${basePath}/docs/`} />
      <p className="p-8">
        Redirecting to the <Link href="/docs">Supergate docs</Link>.
      </p>
    </>
  );
}
