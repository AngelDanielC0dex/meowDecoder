"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: replaces the ROOT layout when it itself throws, so it
 * cannot rely on providers, i18n or shared styling. Kept minimal and bilingual
 * inline. Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Something went wrong · Algo salió mal
        </h1>
        <p style={{ color: "#57534e" }}>
          An unexpected error occurred. · Ha ocurrido un error inesperado.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: "0.5rem",
            background: "#a34715",
            color: "white",
            padding: "0.6rem 1.2rem",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again · Reintentar
        </button>
      </body>
    </html>
  );
}
