import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Corgi — Commercial Policy Administration',
  description: 'Commercial insurance policy administration, double-entry ledger, claims reserve management, and payment reconciliation platform.',
  openGraph: {
    title: 'Corgi — Commercial Policy Administration',
    description: 'Commercial insurance policy administration, double-entry ledger, claims reserve management, and payment reconciliation platform.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Corgi — Commercial Policy Administration',
    description: 'Commercial insurance policy administration, double-entry ledger, claims reserve management, and payment reconciliation platform.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700&family=Public+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning className="bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-orange-500/15 selection:text-orange-900">
        {children}
      </body>
    </html>
  );
}
