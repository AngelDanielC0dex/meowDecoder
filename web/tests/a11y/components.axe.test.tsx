import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { axe } from "jest-axe";
import messages from "@/i18n/messages/en.json";
import { ThemeProvider } from "@/presentation/state/ThemeProvider";
import { ThemeToggle } from "@/presentation/components/layout/ThemeToggle";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { ConfidenceBar } from "@/presentation/components/results/ConfidenceBar";
import { ContextualAd } from "@/presentation/components/results/ContextualAd";

/**
 * Automated accessibility gate. Renders key presentational components with the
 * real providers (i18n + theme) and asserts axe-core finds zero violations
 * (ARIA, names, roles, structure). Note: color-contrast is not evaluated in
 * jsdom — that is verified manually in both themes.
 *
 * `region` is disabled because components are rendered in isolation (outside the
 * page's landmark structure), which would otherwise flag a false positive.
 */
function renderWithProviders(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider>{node}</ThemeProvider>
    </NextIntlClientProvider>,
  );
}

async function expectNoViolations(node: React.ReactNode): Promise<void> {
  const { container } = renderWithProviders(node);
  const results = await axe(container, { rules: { region: { enabled: false } } });
  expect(results.violations).toEqual([]);
}

describe("a11y (axe-core) — key presentational components", () => {
  it("ThemeToggle", async () => {
    await expectNoViolations(<ThemeToggle />);
  });

  it("SignInGate", async () => {
    await expectNoViolations(<SignInGate context="history" />);
  });

  it("ConfidenceBar", async () => {
    await expectNoViolations(
      <ConfidenceBar probability={0.82} certainty="high" label="Confidence" />,
    );
  });

  it("ContextualAd (with affiliate link)", async () => {
    await expectNoViolations(<ContextualAd predictedClass="dolor" href="https://example.com/x" />);
  });
});
