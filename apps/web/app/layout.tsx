import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AVEN. — Your entire world, organised.',
  description: 'A connected workspace for projects, documents, databases, and your day.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
