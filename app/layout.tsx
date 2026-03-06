import type { Metadata } from "next";
import "./globals.css";
import { SettingsProvider } from '@/lib/settings-context';
import { RegionProvider } from '@/lib/region-context';
import { Toaster } from '@/components/ui/toaster';
import { DEFAULT_LANGUAGE } from '@/config';
import { ClientErrorLogger } from '@/components/debug/client-error-logger';

export const metadata: Metadata = {
  title: "Enterprise Chat - Company Communication Platform",
  description: "Modern enterprise chat application for workplace collaboration, supporting direct messages, channels, and group conversations",
    generator: 'v0.app'
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_LANGUAGE}>
      <body className="font-sans antialiased">
        <RegionProvider>
          <SettingsProvider>
            <ClientErrorLogger />
            {children}
            <Toaster />
          </SettingsProvider>
        </RegionProvider>
      </body>
    </html>
  );
}
