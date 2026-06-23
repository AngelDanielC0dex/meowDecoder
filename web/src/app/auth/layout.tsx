import type { Metadata, Viewport } from "next";
import { THEME_INIT_SCRIPT } from "@/presentation/state/ThemeProvider";
import { PawBackground } from "@/presentation/components/decor/PawBackground";
import "../globals.css";

/**
 * Standalone root layout for the Auth.js flow. These pages live OUTSIDE the
 * [locale] segment (and are excluded from the next-intl middleware) so Auth.js
 * redirects resolve without a locale prefix. Because the project has no
 * app/layout.tsx (next-intl pattern), this segment provides its own <html>/<body>.
 *
 * The auth surface is intentionally minimal and transactional; full UI i18n
 * lives in the localized app under [locale]. It has no theme toggle, but the
 * anti-FOUC script still applies the user's stored/system theme so the login
 * flow matches the rest of the app (light or dark).
 */
export const metadata: Metadata = {
  title: "Sign in — MeowDecoder",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdfa" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1714" },
  ],
  colorScheme: "light dark",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-surface">
        <PawBackground />
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
          {children}
        </main>
      </body>
    </html>
  );
}
