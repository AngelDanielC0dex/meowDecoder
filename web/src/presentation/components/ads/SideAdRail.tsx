import { AdSlot } from "./AdSlot";

/**
 * Persistent side advertising rail. Only shown from the `xl` breakpoint up
 * (≥1280px) so it never squeezes the main content on phones, tablets or small
 * laptops — keeping the app fully responsive. The slot is sticky so it stays in
 * view while the user scrolls a long result/history page.
 *
 * The rails reserve their width at the layout level (see LocaleLayout), so the
 * centered content column never reflows when ads load.
 */
export function SideAdRail({ side }: { side: "left" | "right" }) {
  return (
    <aside
      aria-hidden="true"
      data-ad-rail={side}
      className="hidden w-40 shrink-0 py-8 xl:block 2xl:w-[300px]"
    >
      <div className="sticky top-24">
        <AdSlot slotId={`rail-${side}`} format="vertical" />
      </div>
    </aside>
  );
}
