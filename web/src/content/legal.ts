import type { AppLocale } from "@/i18n/routing";

/**
 * Legal content (Terms of Service + Privacy Policy), localized. Kept as data so
 * the pages render identically in both locales and the copy lives in one place.
 *
 * NOTE: this is a solid, protective baseline written by an engineer — it is NOT
 * a substitute for review by a qualified lawyer before public launch. The most
 * critical clauses (AI is informational, NOT veterinary advice; medical-data
 * handling; liability limitation) are explicit by design.
 */
export interface LegalSection {
  readonly heading: string;
  readonly body: readonly string[];
}
export interface LegalDoc {
  readonly title: string;
  readonly updated: string;
  readonly intro: string;
  readonly sections: readonly LegalSection[];
}

const UPDATED = "2026-06-21";

const TERMS: Record<AppLocale, LegalDoc> = {
  es: {
    title: "Términos y Condiciones",
    updated: UPDATED,
    intro:
      "Al usar MeowDecoder aceptas estos Términos. Si no estás de acuerdo, no uses la aplicación.",
    sections: [
      {
        heading: "1. Qué es MeowDecoder",
        body: [
          "MeowDecoder es una herramienta de análisis acústico que clasifica vocalizaciones felinas por tipo y contexto aproximado, con un nivel de confianza. Es una guía interpretativa orientativa, no una traducción literal ni una verdad científica absoluta.",
        ],
      },
      {
        heading: "2. El asistente de IA es informativo — NO es un veterinario",
        body: [
          "MeowDecoder incluye un asistente de IA dentro del historial de tu gato. Es una herramienta de software de carácter EXCLUSIVAMENTE informativo y educativo que te ayuda a organizar y entender la información que tú registras. NO es un veterinario, NO presta servicios veterinarios y NO constituye diagnóstico, tratamiento ni consejo médico profesional.",
          "Sus respuestas pueden contener errores. No tomes decisiones sobre la salud de tu gato basándote únicamente en la app. Ante cualquier signo de enfermedad, dolor, emergencia o duda, acude a un veterinario colegiado; en una emergencia, contacta de inmediato con un servicio veterinario.",
        ],
      },
      {
        heading: "3. Cuentas",
        body: [
          "Algunas funciones (historial, perfiles, correcciones, historial médico) requieren una cuenta. Eres responsable de la actividad de tu cuenta y de la veracidad de los datos que introduces.",
        ],
      },
      {
        heading: "4. Tu contenido",
        body: [
          "El audio que analizas se procesa en tu dispositivo. Solo se sube a nuestros servidores si lo autorizas explícitamente (p. ej. guardar historial o donar audio para mejorar el modelo). Conservas la titularidad de tu contenido; nos concedes una licencia limitada para prestarte el servicio.",
        ],
      },
      {
        heading: "5. Suscripción Premium",
        body: [
          "Las funciones Premium se ofrecen mediante suscripción de pago. Los usuarios Premium no ven publicidad. La facturación, renovación y cancelación se rigen por las condiciones mostradas en el momento de la compra.",
        ],
      },
      {
        heading: "6. Limitación de responsabilidad",
        body: [
          "El servicio se ofrece \"tal cual\", sin garantías de exactitud. En la medida permitida por la ley, no nos hacemos responsables de daños derivados del uso o de decisiones tomadas a partir de los resultados de la app, incluidas decisiones sobre la salud de tu mascota.",
        ],
      },
      {
        heading: "7. Cambios y contacto",
        body: [
          "Podemos actualizar estos Términos; los cambios relevantes se notificarán. Para cualquier consulta, contacta a través de los canales indicados en la app.",
        ],
      },
    ],
  },
  en: {
    title: "Terms & Conditions",
    updated: UPDATED,
    intro:
      "By using MeowDecoder you accept these Terms. If you disagree, do not use the app.",
    sections: [
      {
        heading: "1. What MeowDecoder is",
        body: [
          "MeowDecoder is an acoustic-analysis tool that classifies feline vocalizations by type and approximate context, with a confidence level. It is an interpretive guide, not a literal translation nor absolute scientific truth.",
        ],
      },
      {
        heading: "2. The AI assistant is informational — NOT a veterinarian",
        body: [
          "MeowDecoder includes an AI assistant inside your cat's record. It is a software tool that is STRICTLY informational and educational, helping you organize and understand the information you log. It is NOT a veterinarian, does NOT provide veterinary services, and does NOT constitute diagnosis, treatment or professional medical advice.",
          "Its answers may contain errors. Do not make decisions about your cat's health based solely on the app. For any sign of illness, pain, emergency or doubt, see a licensed veterinarian; in an emergency, contact a veterinary service immediately.",
        ],
      },
      {
        heading: "3. Accounts",
        body: [
          "Some features (history, profiles, corrections, medical log) require an account. You are responsible for your account activity and the accuracy of the data you enter.",
        ],
      },
      {
        heading: "4. Your content",
        body: [
          "Audio you analyze is processed on your device. It is uploaded to our servers only if you explicitly allow it (e.g. saving history or donating audio to improve the model). You keep ownership of your content; you grant us a limited license to operate the service.",
        ],
      },
      {
        heading: "5. Premium subscription",
        body: [
          "Premium features are offered via paid subscription. Premium users see no ads. Billing, renewal and cancellation follow the terms shown at purchase.",
        ],
      },
      {
        heading: "6. Limitation of liability",
        body: [
          'The service is provided "as is", without warranty of accuracy. To the extent permitted by law, we are not liable for damages arising from use of, or decisions made from, the app\'s results — including decisions about your pet\'s health.',
        ],
      },
      {
        heading: "7. Changes and contact",
        body: [
          "We may update these Terms; material changes will be notified. For questions, reach us through the channels indicated in the app.",
        ],
      },
    ],
  },
};

const PRIVACY: Record<AppLocale, LegalDoc> = {
  es: {
    title: "Política de Privacidad",
    updated: UPDATED,
    intro:
      "Explicamos qué datos tratamos, para qué, y tus derechos. Diseñamos la app con minimización de datos por defecto.",
    sections: [
      {
        heading: "1. Audio",
        body: [
          "El audio se procesa localmente en tu navegador. No se sube salvo que lo autorices (guardar en historial o donarlo para entrenamiento). Si lo guardas, se almacena comprimido (Opus) para minimizar tamaño.",
        ],
      },
      {
        heading: "2. Cuenta y perfiles",
        body: [
          "Guardamos tu email (para el acceso sin contraseña) y los perfiles de gato que crees (nombre, foto, raza, edad). Puedes editarlos o eliminarlos.",
        ],
      },
      {
        heading: "3. Datos de salud (historial médico)",
        body: [
          "El historial médico y de vacunas que introduzcas es información sensible. Se almacena cifrada, se trata con consentimiento explícito, y NUNCA se usa para entrenar modelos. Puedes exportarlo o borrarlo en cualquier momento.",
        ],
      },
      {
        heading: "4. El asistente de IA y tus datos",
        body: [
          "Cuando consultas al asistente de IA, inyectamos de forma contextual SOLO los fragmentos necesarios (perfil, vacunas, resumen de maullidos recientes) para generar una respuesta informativa. Estos datos no se usan para entrenar el modelo ni se comparten con terceros con fines publicitarios.",
        ],
      },
      {
        heading: "5. Terceros que usamos",
        body: [
          "Base de datos (Supabase), envío de emails de acceso (Resend), protección anti-bots (Cloudflare Turnstile) y, para usuarios no Premium, redes publicitarias. Cada proveedor trata datos según su propia política.",
        ],
      },
      {
        heading: "6. Tus derechos",
        body: [
          "Puedes acceder, rectificar, exportar y eliminar tus datos. Al eliminar tu cuenta se borran tus gatos, sesiones, correcciones e historial médico asociados.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: UPDATED,
    intro:
      "We explain what data we process, why, and your rights. The app is built with data minimization by default.",
    sections: [
      {
        heading: "1. Audio",
        body: [
          "Audio is processed locally in your browser. It is not uploaded unless you allow it (save to history or donate for training). If saved, it is stored compressed (Opus) to minimize size.",
        ],
      },
      {
        heading: "2. Account and profiles",
        body: [
          "We store your email (for passwordless sign-in) and the cat profiles you create (name, photo, breed, age). You can edit or delete them.",
        ],
      },
      {
        heading: "3. Health data (medical log)",
        body: [
          "The medical and vaccination history you enter is sensitive information. It is stored encrypted, processed with explicit consent, and is NEVER used to train models. You can export or delete it at any time.",
        ],
      },
      {
        heading: "4. The AI assistant and your data",
        body: [
          "When you query the AI assistant, we contextually inject ONLY the necessary snippets (profile, vaccines, recent meow summary) to generate an informational answer. This data is not used to train the model nor shared with third parties for advertising.",
        ],
      },
      {
        heading: "5. Third parties we use",
        body: [
          "Database (Supabase), sign-in email delivery (Resend), anti-bot protection (Cloudflare Turnstile) and, for non-Premium users, advertising networks. Each provider handles data under its own policy.",
        ],
      },
      {
        heading: "6. Your rights",
        body: [
          "You can access, rectify, export and delete your data. Deleting your account removes your cats, sessions, corrections and associated medical history.",
        ],
      },
    ],
  },
};

export function getLegalDoc(kind: "terms" | "privacy", locale: AppLocale): LegalDoc {
  return (kind === "terms" ? TERMS : PRIVACY)[locale];
}
