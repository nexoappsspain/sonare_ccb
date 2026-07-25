import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { locales } from "@/lib/i18n/config";

export function generateStaticParams() {
  if (!Array.isArray(locales) || (locales as readonly string[]).length === 0) return [{ locale: "pt" }];
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "settings" });
  return { title: t("title") };
}

export default function SettingsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return <SettingsClient />;
}
