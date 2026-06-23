import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ContextualAd } from "@/presentation/components/results/ContextualAd";

/**
 * Locks the "honest ads" guarantees for v2 (3 macro-categories):
 *  - Ads are grouped into wellbeing, alert, natural (never individual emotional states).
 *  - Alert-category states (pelea, dolor, advertencia) show vet/insurance ads.
 *  - Copy comes from i18n (renders in the active locale, not hardcoded).
 *  - No dead links when there is no real affiliate href.
 */
const messages = {
  ads: {
    sponsored: "Sponsored",
    cta: "See more",
    wellbeing: { title: "Snacks, toys & comfort", desc: "x" },
    alert: { title: "Vet care & pet insurance", desc: "x" },
    natural: { title: "Learn more about cat behavior", desc: "x" },
  },
};

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("ContextualAd — honest by construction (v2)", () => {
  it("renders a wellbeing ad for feliz_contento", () => {
    const { getByText } = wrap(<ContextualAd predictedClass="feliz_contento" />);
    expect(getByText("Snacks, toys & comfort")).toBeInTheDocument();
  });

  it("renders an alert ad for dolor", () => {
    const { getByText } = wrap(<ContextualAd predictedClass="dolor" />);
    expect(getByText("Vet care & pet insurance")).toBeInTheDocument();
  });

  it("renders a natural ad for llamada_madre", () => {
    const { getByText } = wrap(<ContextualAd predictedClass="llamada_madre" />);
    expect(getByText("Learn more about cat behavior")).toBeInTheDocument();
  });

  it("renders no dead link when href is absent", () => {
    const { queryByRole } = wrap(<ContextualAd predictedClass="atencion" />);
    expect(queryByRole("link")).toBeNull();
  });

  it("renders a sponsored-marked link when a real href is provided", () => {
    const { getByRole } = wrap(
      <ContextualAd predictedClass="trinos" href="https://example.com/aff" />,
    );
    const link = getByRole("link");
    expect(link).toHaveAttribute("rel", expect.stringContaining("sponsored"));
  });

  it("falls back to natural category for unknown classes", () => {
    const { getAllByText } = wrap(<ContextualAd predictedClass="unknown" />);
    const elements = getAllByText("Learn more about cat behavior");
    expect(elements.length).toBeGreaterThanOrEqual(1);
    expect(elements[0]!).toBeInTheDocument();
  });
});