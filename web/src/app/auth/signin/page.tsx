import Link from "next/link";
import { signIn } from "@/server/auth/config";

/**
 * Passwordless sign-in. Submitting the email triggers the Auth.js Nodemailer
 * provider, which sends a magic link and redirects to the verify page. The
 * email is collected via a server action so no client JS is required.
 */
export default function SignInPage() {
  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    // Provider id "nodemailer"; Auth.js handles token creation + email + redirect.
    await signIn("nodemailer", { email, redirectTo: "/" });
  }

  return (
    <section
      aria-labelledby="signin-heading"
      className="w-full rounded-2xl border border-brand-100 bg-white p-8 shadow-sm dark:bg-brand-50"
    >
      <h1 id="signin-heading" className="text-title font-bold">
        Sign in to MeowDecoder
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        Enter your email and we&apos;ll send you a secure magic link. No password
        needed. An account lets you save each cat&apos;s history and corrections.
      </p>

      <form action={sendMagicLink} className="mt-6 flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="min-h-11 w-full rounded-lg border border-brand-200 bg-surface px-3 transition-colors focus:border-brand-500"
        />
        <label className="flex items-start gap-2 text-xs text-ink-600">
          <input type="checkbox" name="accept" required className="mt-0.5 size-4 accent-brand-600" />
          <span>
            I have read and accept the{" "}
            <Link href="/en/legal/terms" className="text-brand-700 underline dark:text-brand-300">
              Terms
            </Link>{" "}
            and the{" "}
            <Link href="/en/legal/privacy" className="text-brand-700 underline dark:text-brand-300">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-brand-600 px-4 font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          Send magic link
        </button>
      </form>

      <Link href="/" className="mt-6 block text-center text-sm text-brand-700 underline dark:text-brand-300">
        ← Back to MeowDecoder
      </Link>
    </section>
  );
}
