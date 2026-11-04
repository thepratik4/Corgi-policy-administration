import type {Metadata} from 'next';
import {Plus_Jakarta_Sans, Public_Sans, JetBrains_Mono} from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

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
    <html lang="en" className={`${plusJakarta.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning className="bg-[#F8FAFC] text-[#0F172A] antialiased font-sans selection:bg-orange-500/15 selection:text-orange-900">
        {children}
      </body>
    </html>
  );
}
