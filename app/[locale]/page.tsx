import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
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
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("title") };
}

export default function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return <DashboardClient />;
}
