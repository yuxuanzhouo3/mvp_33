import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import { SettingsProvider } from '@/lib/settings-context';
import { RegionProvider } from '@/lib/region-context';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { DEFAULT_LANGUAGE } from '@/config';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        <RegionProvider>
          <SettingsProvider>
            <ToastProvider>
              {children}
              <ToastViewport />
            </ToastProvider>
          </SettingsProvider>
        </RegionProvider>
      </body>
    </html>
  );
}
