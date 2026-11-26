import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter, Playfair_Display } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';
import { ErrorReporting } from './error-reporting';
import { ServiceWorkerRegistration } from './service-worker-registration';
import { timeZoneScript } from './time-zone-script';
import './globals.css';
import './mockup.css';
import './design-system.css';
import './redesign.css';

const display = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-display', display: 'swap' });
const interfaceFont = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-interface', display: 'swap' });

const themeScript = "try{var t=localStorage.getItem('aven-theme');if(t==='light'||t==='dark'||t==='system')document.documentElement.dataset.theme=t}catch(e){}";

export const metadata: Metadata = {
  title: 'AVEN.—Your entire world, organised.',
  description: 'A connected workspace for projects, documents, databases, and your day.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/assets/aven-icon.svg', apple: '/assets/aven-icon-192.png' },
  appleWebApp: { capable: true, title: 'AVEN.', statusBarStyle: 'default' },
};

// viewportFit: cover lets the page use the whole screen of a phone; the layout then keeps clear of the notch and home indicator with the safe-area insets.
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F8F6F1' }, { media: '(prefers-color-scheme: dark)', color: '#2B2A27' }], viewportFit: 'cover' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined; // reading the request makes every page render per request, which a script nonce needs
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en" className={`${display.variable} ${interfaceFont.variable}`} suppressHydrationWarning>
      {/* A plain head script, not next/script: beforeInteractive waits for the main bundle, which is after the first paint,
          so a dark theme first painted light and then faded across. This runs before the body is drawn. */}
      <head><script id="aven-theme" nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Script id="aven-time-zone" nonce={nonce} strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: timeZoneScript }} />
        <ErrorReporting />
        <ServiceWorkerRegistration />
        {publishableKey ? <ClerkProvider publishableKey={publishableKey} nonce={nonce}>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
