import Link from "next/link";

/**
 * Shown right after a magic link is requested (Auth.js `verifyRequest` page).
 * No secrets here — purely an instruction to check the inbox.
 */
export default function VerifyRequestPage() {
  return (
    <section className="w-full rounded-2xl border border-brand-100 bg-white p-8 text-center shadow-sm dark:bg-brand-50">
      <p className="text-5xl" aria-hidden="true">
        📬
      </p>
      <h1 className="mt-3 text-title font-bold">Check your email</h1>
      <p className="mt-2 text-sm text-ink-600">
        We sent you a secure sign-in link. Open it on this device to finish
        signing in. The link expires shortly for your security.
      </p>
      <Link href="/" className="mt-6 block text-sm text-brand-700 underline dark:text-brand-300">
        ← Back to MeowDecoder
      </Link>
    </section>
  );
}
