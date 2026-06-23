import Link from "next/link";

/**
 * Auth.js error page. The `error` query param carries the failure reason
 * (e.g. Configuration, AccessDenied, Verification). We keep the copy generic
 * and actionable rather than leaking internals.
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const isExpiredLink = error === "Verification";

  return (
    <section className="w-full rounded-2xl border border-brand-100 bg-white p-8 text-center shadow-sm dark:bg-brand-50">
      <p className="text-5xl" aria-hidden="true">
        😿
      </p>
      <h1 className="mt-3 text-title font-bold">Sign-in problem</h1>
      <p className="mt-2 text-sm text-ink-600">
        {isExpiredLink
          ? "That sign-in link is invalid or has expired. Request a new one."
          : "We couldn't complete sign-in. Please try again."}
      </p>
      <Link
        href="/auth/signin"
        className="mt-6 inline-block rounded-xl bg-brand-600 px-4 py-2 font-medium text-white"
      >
        Try again
      </Link>
    </section>
  );
}
