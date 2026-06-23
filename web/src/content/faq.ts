import type { AppLocale } from "@/i18n/routing";

/**
 * Landing FAQ content. Rendered as a visible accordion AND emitted as
 * schema.org FAQPage JSON-LD (rich results). Kept as data so the visible copy
 * and the structured data never drift apart — one source, two consumers.
 */
export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export const FAQ: Record<AppLocale, readonly FaqItem[]> = {
  es: [
    {
      question: "¿MeowDecoder traduce literalmente lo que dice mi gato?",
      answer:
        "No. Es un clasificador de vocalizaciones: identifica el tipo de maullido y un contexto aproximado con un nivel de confianza. La ciencia felina no respalda una traducción palabra por palabra; cuando la señal es ambigua, te lo decimos.",
    },
    {
      question: "¿Mi audio es privado?",
      answer:
        "Sí. El audio se procesa en tu dispositivo y no se sube a ningún servidor salvo que lo autorices explícitamente (guardar en tu historial o donarlo para mejorar el modelo).",
    },
    {
      question: "¿Necesito una cuenta para usarlo?",
      answer:
        "No para analizar sonidos. Una cuenta gratuita te permite guardar el historial de cada gato, corregir resultados y acceder a funciones para usuarios registrados.",
    },
    {
      question: "¿Funciona sin conexión?",
      answer:
        "El análisis funciona en el navegador. Tras la primera carga, el modelo queda cacheado en tu dispositivo, así que puedes analizar incluso sin conexión.",
    },
    {
      question: "¿Es un diagnóstico veterinario?",
      answer:
        "No. MeowDecoder es una guía informativa y educativa, no un diagnóstico. Ante cualquier duda sobre la salud de tu gato, consulta a un veterinario colegiado.",
    },
  ],
  en: [
    {
      question: "Does MeowDecoder literally translate what my cat says?",
      answer:
        "No. It is a vocalization classifier: it identifies the type of meow and an approximate context with a confidence level. Feline science does not support word-for-word translation; when the signal is ambiguous, we tell you.",
    },
    {
      question: "Is my audio private?",
      answer:
        "Yes. Audio is processed on your device and is never uploaded unless you explicitly allow it (saving to your history or donating it to improve the model).",
    },
    {
      question: "Do I need an account to use it?",
      answer:
        "Not to analyze sounds. A free account lets you save each cat's history, correct results and access features for registered users.",
    },
    {
      question: "Does it work offline?",
      answer:
        "Analysis runs in the browser. After the first load the model is cached on your device, so you can analyze even without a connection.",
    },
    {
      question: "Is this a veterinary diagnosis?",
      answer:
        "No. MeowDecoder is an informational, educational guide, not a diagnosis. For any concern about your cat's health, consult a licensed veterinarian.",
    },
  ],
};
