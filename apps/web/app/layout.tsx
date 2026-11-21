import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter, Playfair_Display } from 'next/font/google';
import Script from 'next/script';
import { ServiceWorkerRegistration } from './service-worker-registration';
import { timeZoneScript } from './time-zone-script';
import './globals.css';
import './mockup.css';
import './design-system.css';
import './redesign.css';

const display = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-display', display: 'swap' });
const interfaceFont = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-interface', display: 'swap' });

export const metadata: Metadata = {
  title: 'AVEN.—Your entire world, organised.',
  description: 'A connected workspace for projects, documents, databases, and your day.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/assets/aven-icon.svg', apple: '/assets/aven-icon-192.png' },
  appleWebApp: { capable: true, title: 'AVEN.', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#F8F6F1' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en" className={`${display.variable} ${interfaceFont.variable}`} suppressHydrationWarning>
      <body>
        <Script id="aven-time-zone" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: timeZoneScript }} />
        <Script id="aven-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('aven-theme');if(t==='light'||t==='dark'||t==='system')document.documentElement.dataset.theme=t}catch(e){}" }} />
        <ServiceWorkerRegistration />
        {publishableKey ? <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
