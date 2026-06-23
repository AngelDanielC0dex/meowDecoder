"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import QRCode from "qrcode";
import { buildCardShareUrl, type CardSharePayload } from "@/domain/cat/card-share";
import { Button } from "@/presentation/components/ui/Button";

/**
 * Share + QR for a presentation card. "Share" uses the Web Share API to send the
 * actual PNG file (photo included) where supported (mobile); everywhere else it
 * falls back to the social links + QR, which point at the public `/card?d=…`
 * page that reconstructs the card from the URL. The QR is generated locally
 * (qrcode lib) — nothing leaves the device.
 */
export function ShareCard({
  payload,
  getPng,
}: {
  payload: CardSharePayload;
  /** Returns the rendered card PNG (the canvas) for native file sharing. */
  getPng: () => Promise<Blob | null>;
}) {
  const t = useTranslations("cards");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");

  // Build the absolute URL on the client (needs window.origin) for the live card.
  useEffect(() => {
    setShareUrl(buildCardShareUrl(window.location.origin, locale, payload));
  }, [payload, locale]);

  async function nativeShare() {
    const text = t("shareText", { name: payload.n });
    const blob = await getPng();
    const file = blob ? new File([blob], `${payload.n}-card.png`, { type: "image/png" }) : null;
    // Best path: share the real image file (mobile share sheet → WhatsApp, IG…).
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: payload.n, text });
        return;
      } catch {
        /* user cancelled — fall through to the link options */
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: payload.n, text, url: shareUrl });
        return;
      } catch {
        /* cancelled */
      }
    }
    setOpen(true); // no native share → reveal social links + QR
  }

  async function toggleQr() {
    setOpen(true);
    if (!qr && shareUrl) setQr(await QRCode.toDataURL(shareUrl, { width: 320, margin: 1 }));
  }

  const text = t("shareText", { name: payload.n });
  const u = encodeURIComponent(shareUrl);
  const txt = encodeURIComponent(text);
  const networks = [
    { id: "whatsapp", label: "WhatsApp", icon: "🟢", href: `https://wa.me/?text=${txt}%20${u}` },
    { id: "telegram", label: "Telegram", icon: "✈️", href: `https://t.me/share/url?url=${u}&text=${txt}` },
    { id: "x", label: "X", icon: "✖️", href: `https://twitter.com/intent/tweet?url=${u}&text=${txt}` },
    { id: "facebook", label: "Facebook", icon: "📘", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "email", label: "Email", icon: "✉️", href: `mailto:?subject=${txt}&body=${txt}%20${u}` },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void nativeShare()}>
          🔗 {t("share")}
        </Button>
        <Button variant="ghost" onClick={() => void toggleQr()} aria-expanded={open}>
          ▦ {t("qr")}
        </Button>
      </div>

      {open && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <p className="mb-2 text-sm font-medium">{t("shareVia")}</p>
          <ul className="flex flex-wrap gap-2">
            {networks.map((n) => (
              <li key={n.id}>
                <a
                  href={n.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("shareOn", { network: n.label })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-surface px-3 text-sm ring-1 ring-brand-200 transition-colors hover:bg-brand-50"
                >
                  <span aria-hidden="true">{n.icon}</span>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>

          {qr && (
            <div className="mt-4 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={t("qrAlt", { name: payload.n })} width={180} height={180} className="rounded-lg bg-white p-2" />
              <a href={qr} download={`${payload.n}-card-qr.png`} className="text-sm text-brand-700 underline dark:text-brand-300">
                {t("downloadQr")}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
