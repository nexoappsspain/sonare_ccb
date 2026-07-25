import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, unstable_setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale, locales } from "@/lib/i18n/config";
import { ToastProvider } from "@/components/shared/ToastProvider";
import { SessionProviderWrapper } from "@/components/shared/SessionProvider";

export const metadata: Metadata = {
  title: { default: "CCB Sonare Music", template: "%s | CCB Sonare Music" },
  description:
    "DAW web multi-pista para musicos de qualquer instrumento. Grave, misture e exporte.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(locale)) notFound();
  // Habilita renderizacao estatica com next-intl (APIs de servidor).
  unstable_setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <body>
        <NextIntlClientProvider messages={messages}>
          <SessionProviderWrapper>
            <ToastProvider>{children}</ToastProvider>
          </SessionProviderWrapper>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
