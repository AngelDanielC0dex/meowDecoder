import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ContextualAd } from "@/presentation/components/results/ContextualAd";

/**
 * Locks the "honest ads" guarantees from the H-01 fix:
 *  - never shown on clinically sensitive classes (yowl/growl/hiss),
 *  - copy comes from i18n (renders in the active locale, not hardcoded),
 *  - no dead links when there is no real affiliate href.
 */
const messages = {
  ads: {
    sponsored: "Sponsored",
    cta: "See more",
    meow: { title: "Feeders & dispensers", desc: "x" },
    purr: { title: "Beds & blankets", desc: "x" },
    trill: { title: "Interactive toys", desc: "x" },
    unknown: { title: "Snacks & treats", desc: "x" },
  },
};

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("ContextualAd — honest by construction", () => {
  for (const cls of ["yowl", "growl", "hiss"]) {
    it(`renders nothing for clinical class "${cls}"`, () => {
      const { container } = wrap(<ContextualAd predictedClass={cls} />);
      expect(container.firstChild).toBeNull();
    });
  }

  it("renders a labeled sponsored slot for a non-clinical class", () => {
    const { getByText } = wrap(<ContextualAd predictedClass="meow" />);
    expect(getByText("Sponsored")).toBeInTheDocument();
    expect(getByText("Feeders & dispensers")).toBeInTheDocument();
  });

  it("renders no dead link when href is absent", () => {
    const { queryByRole } = wrap(<ContextualAd predictedClass="meow" />);
    expect(queryByRole("link")).toBeNull();
  });

  it("renders a sponsored-marked link when a real href is provided", () => {
    const { getByRole } = wrap(
      <ContextualAd predictedClass="purr" href="https://example.com/aff" />,
    );
    const link = getByRole("link");
    expect(link).toHaveAttribute("rel", expect.stringContaining("sponsored"));
  });
});
