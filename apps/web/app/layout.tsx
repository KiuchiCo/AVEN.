import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import Script from 'next/script';
import { timeZoneScript } from './time-zone-script';
import './globals.css';

export const metadata: Metadata = {
  title: 'AVEN. — Your entire world, organised.',
  description: 'A connected workspace for projects, documents, databases, and your day.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="aven-time-zone" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: timeZoneScript }} />
        <Script id="aven-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('aven-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
        {publishableKey ? <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
