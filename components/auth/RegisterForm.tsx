"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Music2 } from "lucide-react";
import { registerSchema } from "@/lib/auth/schemas";
import { useToast } from "@/components/shared/ToastProvider";

const INSTRUMENT_KEYS = [
  "clarinet",
  "accordion",
  "flute",
  "violin",
  "guitar",
  "electricGuitar",
  "bass",
  "piano",
  "electricPiano",
  "organ",
  "drums",
  "percussion",
  "voice",
  "saxophone",
  "trumpet",
  "trombone",
  "cello",
  "other",
] as const;

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function RegisterForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tInstruments = useTranslations("settings.instruments");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [instrument, setInstrument] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const errors: FieldErrors = {};
    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      instrument: instrument || undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" && !errors.email) errors.email = t("invalidEmail");
        if (field === "password" && !errors.password)
          errors.password = t("passwordTooShort");
      }
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = t("passwordMismatch");
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0 && parsed.success;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          instrument: instrument || undefined,
        }),
      });

      if (response.status === 409) {
        setFieldErrors({ email: t("emailInUse") });
        return;
      }
      if (!response.ok) {
        toast.error(tErrors("generic"));
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        toast.success(t("registerSuccess"));
        router.push(`/${locale}/auth/login`);
        return;
      }

      toast.success(t("registerSuccess"));
      router.push(`/${locale}`);
      router.refresh();
    } catch {
      toast.error(tErrors("networkError"));
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
          <p className="text-sm text-neutral-400">{t("registerTitle")}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="register-name" className="text-sm text-neutral-300">
              {t("name")}
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="input-field"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="register-email" className="text-sm text-neutral-300">
              {t("email")}
            </label>
            <input
              id="register-email"
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
              htmlFor="register-password"
              className="text-sm text-neutral-300"
            >
              {t("password")}
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
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

          <div className="flex flex-col gap-1">
            <label
              htmlFor="register-confirm-password"
              className="text-sm text-neutral-300"
            >
              {t("confirmPassword")}
            </label>
            <input
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="input-field"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
            />
            {fieldErrors.confirmPassword && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="register-instrument"
              className="text-sm text-neutral-300"
            >
              {t("mainInstrument")}
            </label>
            <select
              id="register-instrument"
              value={instrument}
              onChange={(event) => setInstrument(event.target.value)}
              className="input-field"
            >
              <option value="">{t("mainInstrument")}</option>
              {INSTRUMENT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {tInstruments(key)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={isSubmitting}
            aria-label={t("registerButton")}
          >
            {isSubmitting && (
              <Loader2
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {t("registerButton")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link
            href={`/${locale}/auth/login`}
            className="text-accent hover:underline"
          >
            {t("hasAccount")}
          </Link>
        </p>
      </div>
    </div>
  );
}
