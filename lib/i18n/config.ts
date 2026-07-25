import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

export const locales = ["pt", "es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export default getRequestConfig(async ({ locale }) => {
  if (!locale || !isLocale(locale)) notFound();
  return {
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
