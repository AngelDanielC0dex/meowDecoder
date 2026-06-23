"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/presentation/hooks/useAuth";

/**
 * Header account control. Renders nothing until the accounts feature is enabled
 * for the deployment, so the header is unchanged in the current local-first
 * mode. Once enabled: a "Sign in" link for anonymous visitors, or a "Sign out"
 * button for authenticated users.
 *
 * Sign-in uses next/link (not the next-intl Link) so the URL is NOT locale
 * prefixed — the Auth.js pages live outside the [locale] segment.
 */
export function AccountMenu() {
  const t = useTranslations("auth");
  const { accountsEnabled, isAuthenticated, status } = useAuth();

  if (!accountsEnabled || status === "loading") return null;

  if (isAuthenticated) {
    return (
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="rounded-lg px-3 py-2 text-sm text-ink-600 transition-colors hover:bg-brand-50 hover:text-ink-900"
      >
        {t("signOut")}
      </button>
    );
  }

  return (
    <Link
      href="/auth/signin"
      className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
    >
      {t("signIn")}
    </Link>
  );
}
