import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { RegisterForm } from "@/components/auth/RegisterForm";
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
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("registerTitle") };
}

export default function RegisterPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <main className="min-h-dvh px-4 pb-16">
      <RegisterForm />
    </main>
  );
}
