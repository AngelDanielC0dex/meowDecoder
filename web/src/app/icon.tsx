import { ImageResponse } from "next/og";

/**
 * Generated app icon (favicon + PWA). Replaces the previously-referenced but
 * missing /icon-192.png and /icon-512.png static files. Served at /icon and
 * auto-linked by Next; also referenced by the web manifest.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#bf3568",
          borderRadius: 96,
          fontSize: 320,
        }}
      >
        🐾
      </div>
    ),
    { ...size },
  );
}
