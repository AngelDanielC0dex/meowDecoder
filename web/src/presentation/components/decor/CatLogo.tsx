import Image from "next/image";

/**
 * Brand mark — the `cat_logo.png` image served from /public. Decorative
 * (`alt=""` + `aria-hidden`): the adjacent "MeowDecoder" wordmark is the
 * accessible name of the link it sits in. Sized by the caller via `className`
 * (use a height + `w-auto` so the 520×414 logo keeps its aspect ratio).
 */
export function CatLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/cat_logo.png"
      alt=""
      width={520}
      height={414}
      aria-hidden="true"
      priority
      className={className}
    />
  );
}
