import type { VocalizationClass } from "@/domain/analysis/vocalization";
import type { AppLocale } from "@/i18n/routing";

export interface LocalizedFaq {
  readonly q: string;
  readonly a: string;
}

export interface VocalizationContent {
  /** URL slug, stable, locale-independent. */
  readonly slug: string;
  readonly cls: Exclude<VocalizationClass, "unknown">;
  readonly emoji: string;
  readonly i18n: Record<
    AppLocale,
    {
      readonly name: string;
      /** One-line interpretation shown on result cards. */
      readonly shortMeaning: string;
      /** Friendly paragraph for the result detail + page intro. */
      readonly description: string;
      /** Likely contexts — interpretation, not literal translation. */
      readonly contexts: readonly string[];
      readonly faqs: readonly LocalizedFaq[];
    }
  >;
}

/**
 * Curated, evidence-informed knowledge base. SINGLE SOURCE OF TRUTH:
 * the results UI and the programmatic SEO pages both read from here, so
 * content never drifts and there are no thin/duplicated pages.
 */
export const VOCALIZATIONS: readonly VocalizationContent[] = [
  {
    slug: "meow",
    cls: "meow",
    emoji: "🐱",
    i18n: {
      es: {
        name: "Maullido",
        shortMeaning: "Una petición o saludo dirigido a ti.",
        description:
          "El maullido es una vocalización que los gatos adultos reservan casi exclusivamente para comunicarse con personas, no con otros gatos. Suele ser una forma de pedir algo —comida, atención, acceso a una habitación— o de saludar.",
        contexts: [
          "Pedir comida o agua",
          "Saludar cuando llegas a casa",
          "Pedir atención o juego",
          "Querer abrir o cruzar una puerta",
        ],
        faqs: [
          {
            q: "¿Por qué mi gato maúlla tanto?",
            a: "Los maullidos frecuentes suelen indicar una petición aprendida: el gato ha descubierto que vocalizar consigue tu atención. Cambios bruscos en la frecuencia pueden merecer una revisión veterinaria.",
          },
          {
            q: "¿Los gatos maúllan entre ellos?",
            a: "Rara vez. El maullido adulto está dirigido principalmente a los humanos; entre gatos predominan otras señales como el lenguaje corporal y el olfato.",
          },
        ],
      },
      en: {
        name: "Meow",
        shortMeaning: "A request or greeting aimed at you.",
        description:
          "The meow is a vocalization adult cats reserve almost exclusively for communicating with people, not other cats. It is usually a way to ask for something — food, attention, access to a room — or to greet you.",
        contexts: [
          "Asking for food or water",
          "Greeting you when you arrive",
          "Requesting attention or play",
          "Wanting a door opened or crossed",
        ],
        faqs: [
          {
            q: "Why does my cat meow so much?",
            a: "Frequent meowing usually reflects a learned request: the cat discovered that vocalizing gets your attention. Sudden changes in frequency may warrant a vet check.",
          },
          {
            q: "Do cats meow at each other?",
            a: "Rarely. Adult meowing is mostly directed at humans; between cats, body language and scent dominate.",
          },
        ],
      },
    },
  },
  {
    slug: "purr",
    cls: "purr",
    emoji: "😌",
    i18n: {
      es: {
        name: "Ronroneo",
        shortMeaning: "Normalmente bienestar; a veces autocalmado.",
        description:
          "El ronroneo es una vibración rítmica de baja frecuencia. Aunque se asocia con la satisfacción, también aparece cuando el gato se autocalma ante dolor o estrés, por lo que conviene leerlo junto al contexto.",
        contexts: [
          "Relajación y contacto agradable",
          "Búsqueda de cercanía contigo",
          "Autocalmado ante malestar",
          "Petición suave (ronroneo de solicitud)",
        ],
        faqs: [
          {
            q: "¿El ronroneo siempre significa felicidad?",
            a: "No siempre. La mayoría de las veces indica bienestar, pero los gatos también ronronean para calmarse cuando sienten dolor o ansiedad. El contexto y el lenguaje corporal son clave.",
          },
        ],
      },
      en: {
        name: "Purr",
        shortMeaning: "Usually contentment; sometimes self-soothing.",
        description:
          "The purr is a rhythmic low-frequency vibration. While linked to contentment, it also appears when a cat self-soothes during pain or stress, so it is best read alongside context.",
        contexts: [
          "Relaxation and pleasant contact",
          "Seeking closeness with you",
          "Self-soothing during discomfort",
          "A soft request (solicitation purr)",
        ],
        faqs: [
          {
            q: "Does purring always mean happiness?",
            a: "Not always. Most of the time it signals well-being, but cats also purr to calm themselves when in pain or anxious. Context and body language are key.",
          },
        ],
      },
    },
  },
  {
    slug: "trill",
    cls: "trill",
    emoji: "🎵",
    i18n: {
      es: {
        name: "Trino",
        shortMeaning: "Saludo amistoso y positivo.",
        description:
          "El trino o gorjeo es un sonido breve y melódico con la boca cerrada. Es una señal claramente positiva: invitación a seguir, saludo afectuoso o llamada de una madre a sus crías.",
        contexts: ["Saludo afectuoso", "Invitación a seguirle", "Llamada maternal", "Anticipación positiva"],
        faqs: [
          {
            q: "¿Qué diferencia un trino de un maullido?",
            a: "El trino es más corto, melódico y se emite con la boca cerrada, mientras que el maullido es más abierto y largo. El trino casi siempre es positivo.",
          },
        ],
      },
      en: {
        name: "Trill",
        shortMeaning: "A friendly, positive greeting.",
        description:
          "The trill or chirp is a brief melodic sound made with the mouth closed. It is a clearly positive signal: an invitation to follow, an affectionate greeting, or a mother calling her kittens.",
        contexts: ["Affectionate greeting", "Invitation to follow", "Maternal call", "Positive anticipation"],
        faqs: [
          {
            q: "How is a trill different from a meow?",
            a: "A trill is shorter, melodic and made with a closed mouth, while a meow is more open and longer. Trills are almost always positive.",
          },
        ],
      },
    },
  },
  {
    slug: "hiss",
    cls: "hiss",
    emoji: "😾",
    i18n: {
      es: {
        name: "Bufido",
        shortMeaning: "Advertencia defensiva: necesita espacio.",
        description:
          "El bufido es una expulsión de aire que suena como ruido blanco. Es una señal defensiva inequívoca: el gato se siente amenazado y pide distancia. No es agresión gratuita, sino un aviso para evitar el conflicto.",
        contexts: ["Sentirse amenazado o acorralado", "Defensa de territorio", "Dolor al ser tocado", "Miedo ante un extraño"],
        faqs: [
          {
            q: "¿Qué hago si mi gato bufa?",
            a: "Dale espacio y no lo fuerces. El bufido es una petición de distancia; respetarla previene que escale a un zarpazo. Si bufa al tocar una zona concreta, puede haber dolor.",
          },
        ],
      },
      en: {
        name: "Hiss",
        shortMeaning: "A defensive warning: needs space.",
        description:
          "The hiss is an expulsion of air that sounds like white noise. It is an unmistakable defensive signal: the cat feels threatened and asks for distance. Not gratuitous aggression, but a warning to avoid conflict.",
        contexts: ["Feeling threatened or cornered", "Defending territory", "Pain when touched", "Fear of a stranger"],
        faqs: [
          {
            q: "What should I do if my cat hisses?",
            a: "Give it space and don't force interaction. A hiss is a request for distance; respecting it prevents escalation to a swat. Hissing when a specific area is touched may indicate pain.",
          },
        ],
      },
    },
  },
  {
    slug: "growl",
    cls: "growl",
    emoji: "🙀",
    i18n: {
      es: {
        name: "Gruñido",
        shortMeaning: "Amenaza seria: detente.",
        description:
          "El gruñido es un sonido grave y sostenido. Es una advertencia más intensa que el bufido: el gato está dispuesto a defenderse si la situación continúa. Conviene detener cualquier interacción de inmediato.",
        contexts: ["Conflicto con otro animal", "Defensa de recursos (comida, territorio)", "Miedo intenso", "Dolor"],
        faqs: [
          {
            q: "¿El gruñido y el bufido son lo mismo?",
            a: "Están relacionados pero el gruñido suele indicar una amenaza más sostenida y seria. Ambos piden que cese lo que está incomodando al gato.",
          },
        ],
      },
      en: {
        name: "Growl",
        shortMeaning: "A serious threat: stop.",
        description:
          "The growl is a low, sustained sound. It is a stronger warning than a hiss: the cat is ready to defend itself if the situation continues. Any interaction should stop immediately.",
        contexts: ["Conflict with another animal", "Resource guarding (food, territory)", "Intense fear", "Pain"],
        faqs: [
          {
            q: "Are growling and hissing the same?",
            a: "They are related, but a growl usually signals a more sustained, serious threat. Both ask for whatever is bothering the cat to stop.",
          },
        ],
      },
    },
  },
  {
    slug: "yowl",
    cls: "yowl",
    emoji: "📢",
    i18n: {
      es: {
        name: "Aullido",
        shortMeaning: "Llamada intensa o malestar prolongado.",
        description:
          "El aullido es una vocalización larga y modulada. Puede señalar celo, conflicto territorial, desorientación (frecuente en gatos mayores) o malestar. Su intensidad pide atención al contexto.",
        contexts: ["Celo o búsqueda de pareja", "Conflicto territorial nocturno", "Desorientación en gatos senior", "Malestar o aislamiento"],
        faqs: [
          {
            q: "¿Por qué mi gato aúlla por la noche?",
            a: "En gatos mayores puede deberse a desorientación o pérdida sensorial; en no esterilizados, al celo. Si aparece de forma nueva o persistente, consulta al veterinario.",
          },
        ],
      },
      en: {
        name: "Yowl",
        shortMeaning: "An intense call or prolonged distress.",
        description:
          "The yowl is a long, modulated vocalization. It can signal mating drive, territorial conflict, disorientation (common in older cats), or distress. Its intensity calls for attention to context.",
        contexts: ["Mating or seeking a partner", "Nighttime territorial conflict", "Disorientation in senior cats", "Distress or isolation"],
        faqs: [
          {
            q: "Why does my cat yowl at night?",
            a: "In older cats it may stem from disorientation or sensory loss; in unneutered cats, from mating drive. If it is new or persistent, consult a vet.",
          },
        ],
      },
    },
  },
] as const;

export const getVocalization = (slug: string): VocalizationContent | undefined =>
  VOCALIZATIONS.find((v) => v.slug === slug);

export const getVocalizationByClass = (
  cls: VocalizationClass,
): VocalizationContent | undefined => VOCALIZATIONS.find((v) => v.cls === cls);
