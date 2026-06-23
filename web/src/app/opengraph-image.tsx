import { ImageResponse } from "next/og";

/**
 * Generated Open Graph / Twitter card image (1200×630), applied site-wide so
 * every shared link shows a branded preview — no static asset to maintain.
 * Next emits the og:image and twitter:image meta automatically from this file.
 */
export const alt = "MeowDecoder — Feline acoustic intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "linear-gradient(135deg, #fdf2f6 0%, #f6c2d6 100%)",
          color: "#1c1917",
          fontSize: 64,
          fontWeight: 700,
        }}
      >
        <div style={{ fontSize: 140 }}>🐾</div>
        <div style={{ color: "#bf3568" }}>MeowDecoder</div>
        <div style={{ fontSize: 34, fontWeight: 500, color: "#57534e" }}>
          Analyze and interpret your cat&apos;s vocalizations
        </div>
      </div>
    ),
    { ...size },
  );
}
