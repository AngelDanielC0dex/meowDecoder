"use client";

import { usePremium } from "@/presentation/hooks/usePremium";
import { SideAdRail } from "./SideAdRail";
import { AdSlot } from "./AdSlot";

/**
 * Wraps an app surface (recorder, history) with persistent side ad rails on
 * xl+ screens. Used ONLY on tool pages — never on the landing, which must stay
 * 100% ad-free for conversion. Premium users get no rails (and the content
 * simply centers full-width).
 */
export function AdRailsLayout({ children }: { children: React.ReactNode }) {
  const isPremium = usePremium();
  if (isPremium) return <>{children}</>;
  return (
    <div className="mx-auto flex w-full max-w-[1760px] justify-center gap-6 xl:px-4">
      <SideAdRail side="left" />
      <div className="min-w-0 flex-1">
        {children}
        {/* Below xl there are no side rails, so phones/tablets get a single
            responsive leaderboard under the content instead of nothing. */}
        <div className="mt-10 flex justify-center xl:hidden">
          <AdSlot slotId="content-bottom" format="horizontal" />
        </div>
      </div>
      <SideAdRail side="right" />
    </div>
  );
}
