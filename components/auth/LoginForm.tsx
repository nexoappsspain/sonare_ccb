"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Music2 } from "lucide-react";
import { loginSchema } from "@/lib/auth/schemas";
import { useToast } from "@/components/shared/ToastProvider";

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" && !errors.email) errors.email = t("invalidEmail");
        if (field === "password" && !errors.password)
          errors.password = t("passwordTooShort");
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });

      if (!result || result.error) {
        setFormError(t("invalidCredentials"));
        return;
      }

      toast.success(t("loginSuccess"));
      router.push(`/${locale}`);
      router.refresh();
    } catch {
      setFormError(t("invalidCredentials"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-md">
      <div className="card p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Music2 className="h-10 w-10 text-accent" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-neutral-100">
            {tCommon("appName")}
          </h1>
          <p className="text-sm text-neutral-400">{t("loginTitle")}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="login-email" className="text-sm text-neutral-300">
              {t("email")}
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-field"
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="login-password"
              className="text-sm text-neutral-300"
            >
              {t("password")}
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-field"
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={isSubmitting}
            aria-label={t("loginButton")}
          >
            {isSubmitting && (
              <Loader2
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {t("loginButton")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link
            href={`/${locale}/auth/register`}
            className="text-accent hover:underline"
          >
            {t("noAccount")}
          </Link>
        </p>
      </div>
    </div>
  );
}
