import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getIsAdmin } from "@/server/auth/admin";
import { ADMIN_TOGGLEABLE_FLAGS, getAllFlags } from "@/server/flags";
import { AdminPanel } from "@/presentation/components/admin/AdminPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  // Never indexed: admin surface is private and authorization-gated.
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Authorization resolved server-side; non-admins get a 404 (never reveal it exists).
  if (!(await getIsAdmin())) notFound();

  const flags = await getAllFlags();
  const t = await getTranslations({ locale, namespace: "admin" });

  const initialFlags = ADMIN_TOGGLEABLE_FLAGS.map((key) => ({ key, enabled: flags[key] }));

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-ink-600">{t("subtitle")}</p>

      <AdminPanel initialFlags={initialFlags} />

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink-500">
        {t("infraTitle")}
      </h2>
      <dl className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100">
        <div className="flex items-center justify-between p-4">
          <dt className="text-sm text-ink-700">{t("accountsEnabled")}</dt>
          <dd className="text-sm font-medium">{flags["accounts.enabled"] ? "ON" : "OFF"}</dd>
        </div>
        <div className="flex items-center justify-between p-4">
          <dt className="text-sm text-ink-700">{t("onnxEngine")}</dt>
          <dd className="text-sm font-medium">{flags["engine.onnx"] ? "ON" : "OFF"}</dd>
        </div>
      </dl>
    </section>
  );
}
