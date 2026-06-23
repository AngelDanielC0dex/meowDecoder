import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // Architectural layering. domain ← application ← {infrastructure, presentation}.
      // Enforced with core ESLint to avoid an extra plugin dependency.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/infrastructure/*", "@/presentation/*", "@/app/*", "@/server/*"],
              message:
                "domain/ and application/ must not import from outer layers. Define a port in application/ports instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Outer layers may import freely (the restriction above only protects the core,
    // so we disable it outside domain/ and application/).
    files: [
      "src/infrastructure/**",
      "src/presentation/**",
      "src/app/**",
      "src/server/**",
      "src/i18n/**",
      "src/content/**",
      "tests/**",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // Generated/build artifacts — never lint these. `next-env.d.ts` is emitted
    // by Next and contains a triple-slash reference the TS rule would flag.
    ignores: [".next/**", "next-env.d.ts", "node_modules/**", "drizzle/**", "public/**"],
  },
];

export default config;
