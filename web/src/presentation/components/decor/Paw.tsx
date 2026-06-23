/**
 * A single cat paw-print glyph (four toe beans + one metacarpal pad), drawn with
 * `currentColor` so callers control the tint via text color or a CSS variable.
 *
 * Purely decorative by default (`aria-hidden`); pass a `title` only when a paw is
 * used as meaningful imagery (then it becomes `role="img"` with an accessible
 * name). Used by the animated <PawBackground> and available as a brand accent.
 */
export function Paw({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* Toe beans, splayed in a gentle arc */}
      <ellipse cx="16" cy="25" rx="6" ry="8" transform="rotate(-18 16 25)" />
      <ellipse cx="26.5" cy="16" rx="6.2" ry="9" transform="rotate(-7 26.5 16)" />
      <ellipse cx="37.5" cy="16" rx="6.2" ry="9" transform="rotate(7 37.5 16)" />
      <ellipse cx="48" cy="25" rx="6" ry="8" transform="rotate(18 48 25)" />
      {/* Metacarpal pad: plump rounded blob, a touch wider at the top */}
      <path d="M32 30c8.5 0 15.5 5.6 15.5 13 0 6.4-4.7 10.4-10.3 10.4-2.4 0-3.6-1.1-5.2-1.1s-2.8 1.1-5.2 1.1C21.2 53.4 16.5 49.4 16.5 43c0-7.4 7-13 15.5-13z" />
    </svg>
  );
}
