/**
 * Renders JSON-LD structured data. Server component — emitted in the initial
 * HTML so crawlers see it without executing JS.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Controlled, server-built object; not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
