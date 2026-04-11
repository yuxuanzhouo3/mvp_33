import type { Metadata } from "next";
import "./globals.css";
import { SettingsProvider } from '@/lib/settings-context';
import { RegionProvider } from '@/lib/region-context';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { DEFAULT_LANGUAGE } from '@/config';
import { ClientErrorLogger } from '@/components/debug/client-error-logger';
import { AuthFetchInstaller } from '@/components/auth/auth-fetch-installer';
import { MpLoginBridge } from '@/components/auth/mp-login-bridge';

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
      <head>
        <script
          type="text/javascript"
          src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"
        ></script>
      </head>
      <body className="font-sans antialiased">
        <RegionProvider>
          <SettingsProvider>
            <ClientErrorLogger />
            <AuthFetchInstaller />
            <MpLoginBridge />
            {children}
            <Toaster />
            <SonnerToaster position="top-center" richColors />
          </SettingsProvider>
        </RegionProvider>
      </body>
    </html>
  );
}


