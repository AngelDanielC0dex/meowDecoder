import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/presentation/components/ui/Button";

export default async function NotFound() {
  const t = await getTranslations("nav");
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-6xl" aria-hidden="true">
        🙀
      </p>
      <h1 className="mt-4 text-title font-bold">404</h1>
      <Link href="/" className="mt-6 inline-block">
        <Button>{t("home")}</Button>
      </Link>
    </div>
  );
}
