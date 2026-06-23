import type { AppLocale } from "@/i18n/routing";

/**
 * Six high-impact cat-care safety facts shown on the Vaccination page. Curated
 * for accuracy (common feline toxins / hazards). `danger` = potentially lethal,
 * `warn` = avoid. Bilingual content lives here (single source) like the FAQ and
 * vaccine catalog; the UI maps `severity` to a color.
 */
export interface CatCareTip {
  readonly id: string;
  readonly emoji: string;
  readonly severity: "danger" | "warn";
  readonly title: Record<AppLocale, string>;
  readonly body: Record<AppLocale, string>;
}

export const CAT_CARE_TIPS: readonly CatCareTip[] = [
  {
    id: "chocolate",
    emoji: "🍫",
    severity: "danger",
    title: { es: "Nada de chocolate", en: "No chocolate" },
    body: {
      es: "La teobromina del chocolate es tóxica para los gatos: puede causar temblores y problemas de corazón. Ni una onza.",
      en: "The theobromine in chocolate is toxic to cats — it can cause tremors and heart problems. Not even a bite.",
    },
  },
  {
    id: "ibuprofen",
    emoji: "💊",
    severity: "danger",
    title: { es: "Ibuprofeno y paracetamol = mortal", en: "Ibuprofen & paracetamol = deadly" },
    body: {
      es: "Nunca des analgésicos humanos: el paracetamol y el ibuprofeno pueden matar a un gato. Solo medicación recetada por tu veterinario.",
      en: "Never give human painkillers: paracetamol and ibuprofen can kill a cat. Vet-prescribed medication only.",
    },
  },
  {
    id: "onion-garlic",
    emoji: "🧅",
    severity: "danger",
    title: { es: "Cebolla y ajo, no", en: "No onion or garlic" },
    body: {
      es: "Cebolla, ajo, puerro y cebollino dañan sus glóbulos rojos y provocan anemia. Cuidado con salsas y comida preparada.",
      en: "Onion, garlic, leek and chives damage their red blood cells and cause anemia. Watch sauces and prepared food.",
    },
  },
  {
    id: "lilies",
    emoji: "🌷",
    severity: "danger",
    title: { es: "Lirios y plantas tóxicas", en: "Lilies and toxic plants" },
    body: {
      es: "Los lirios son letales incluso en cantidades mínimas (fallo renal). Vigila también tulipán, poto, aloe y flor de pascua.",
      en: "Lilies are lethal even in tiny amounts (kidney failure). Also watch out for tulips, pothos, aloe and poinsettia.",
    },
  },
  {
    id: "milk",
    emoji: "🥛",
    severity: "warn",
    title: { es: "La leche les sienta mal", en: "Milk upsets them" },
    body: {
      es: "La mayoría de gatos adultos son intolerantes a la lactosa: la leche de vaca causa diarrea. Ten siempre agua fresca disponible.",
      en: "Most adult cats are lactose intolerant: cow's milk causes diarrhea. Always keep fresh water available.",
    },
  },
  {
    id: "antifreeze",
    emoji: "☠️",
    severity: "danger",
    title: { es: "Anticongelante: peligro mortal", en: "Antifreeze: deadly" },
    body: {
      es: "El etilenglicol sabe dulce y mata con muy poca cantidad. Limpia al instante cualquier derrame en el garaje.",
      en: "Ethylene glycol tastes sweet and kills with a tiny amount. Wipe up any garage spill immediately.",
    },
  },
];
