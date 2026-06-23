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
 *
 * v2: 11 emotional/behavioral states (from 6 acoustic classes).
 */
export const VOCALIZATIONS: readonly VocalizationContent[] = [
  {
    slug: "feliz-contento",
    cls: "feliz_contento",
    emoji: "😊",
    i18n: {
      es: {
        name: "Feliz / Contento",
        shortMeaning: "Tu gato está feliz y relajado contigo.",
        description:
          "El estado de felicidad felina se manifiesta con ronroneos armónicos intercalados con meullidos suaves, orejas hacia adelante y cola relajada. Es la señal más clara de que tu gato se siente seguro y a gusto en su entorno.",
        contexts: [
          "Ronroneo suave al ser acariciado",
          "Meullidos cortos y amigables",
          "Orejas hacia adelante, ojos entrecerrados",
          "Se frota contra ti o contra los muebles",
        ],
        faqs: [
          {
            q: "¿Cómo sé si mi gato está realmente feliz?",
            a: "Un gato feliz ronronea con ritmo estable, tiene las orejas hacia adelante y muestra relajación muscular. Pero el ronroneo también puede indicar other estados — observa el contexto.",
          },
          {
            q: "¿El ronroneo siempre significa felicidad?",
            a: "No siempre. Los gatos también ronronean para calmarse cuando sienten dolor o estrés. La diferencia está en el contexto: un gato relajado y pegado a ti probablemente esté feliz.",
          },
        ],
      },
      en: {
        name: "Happy / Content",
        shortMeaning: "Your cat is happy and relaxed with you.",
        description:
          "Feline happiness manifests as harmonic purring interspersed with soft meows, forward-facing ears, and a relaxed tail. It's the clearest sign your cat feels safe and comfortable.",
        contexts: [
          "Purring softly while being petted",
          "Short, friendly meows",
          "Ears forward, eyes half-closed",
          "Rubbing against you or furniture",
        ],
        faqs: [
          {
            q: "How do I know if my cat is truly happy?",
            a: "A happy cat purrs with a steady rhythm, has ears pointing forward, and shows muscle relaxation. But purring can also indicate other states — observe the context.",
          },
          {
            q: "Does purring always mean happiness?",
            a: "Not always. Cats also purr to self-soothe when in pain or stressed. The difference is context: a relaxed cat snuggled up to you is probably happy.",
          },
        ],
      },
    },
  },
  {
    slug: "trinos",
    cls: "trinos",
    emoji: "🎵",
    i18n: {
      es: {
        name: "Trinos (Saludando)",
        shortMeaning: "Un saludo amistoso y positivo.",
        description:
          "El trino o gorjeo es un sonido breve y melódico emitido con la boca cerrada. Es una señal claramente positiva: invitación a seguirle, saludo afectuoso o llamada de una madre a sus crías.",
        contexts: [
          "Saludo afectuoso cuando llegas a casa",
          "Invitación a seguirle por la casa",
          "Anticipación positiva (hora de comer)",
          "Reconocimiento de otra mascota o persona",
        ],
        faqs: [
          {
            q: "¿Qué diferencia un trino de un maullido?",
            a: "El trino es más corto, melódico y se emite con la boca cerrada, mientras que el maullido es más abierto y largo. Los trinos casi siempre son positivos.",
          },
        ],
      },
      en: {
        name: "Trill (Greeting)",
        shortMeaning: "A friendly, positive greeting.",
        description:
          "The trill or chirp is a brief melodic sound made with the mouth closed. It's a clearly positive signal: an invitation to follow, an affectionate greeting, or a mother calling her kittens.",
        contexts: [
          "Affectionate greeting when you arrive home",
          "Invitation to follow around the house",
          "Positive anticipation (mealtime)",
          "Recognition of another pet or person",
        ],
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
    slug: "enfadado",
    cls: "enfadado",
    emoji: "😾",
    i18n: {
      es: {
        name: "Enfadado",
        shortMeaning: "Tu gato está irritado o frustrado.",
        description:
          "El enfado felino se expresa con gruñidos de baja frecuencia y modulación abrupta. Es una señal de que algo le molesta y pide que cese la situación. A diferencia de la advertencia (bufido), el enfadado implica frustración más que miedo.",
        contexts: [
          "Frustración por no poder alcanzar algo",
          "Irritación al ser molestado",
          "Descontento ante cambios en su entorno",
          "Rechazo a ser manipulado",
        ],
        faqs: [
          {
            q: "¿Enfadado y advertencia son lo mismo?",
            a: "No. La advertencia (bufido/siseo) es defensiva y basada en miedo o amenaza. El enfado (gruñido) indica irritación o frustración. Ambos piden distancia, pero por motivos distintos.",
          },
        ],
      },
      en: {
        name: "Angry",
        shortMeaning: "Your cat is irritated or frustrated.",
        description:
          "Feline anger is expressed with low-frequency growls and abrupt modulation. It signals that something is bothering them and they want the situation to stop. Unlike a warning (hiss), anger implies frustration rather than fear.",
        contexts: [
          "Frustration from not reaching something",
          "Irritation from being bothered",
          "Discontent with environmental changes",
          "Rejection of being handled",
        ],
        faqs: [
          {
            q: "Are angry and warning the same?",
            a: "No. Warnings (hissing) are defensive and based on fear or threat. Anger (growling) indicates irritation or frustration. Both request distance, but for different reasons.",
          },
        ],
      },
    },
  },
  {
    slug: "pelea",
    cls: "pelea",
    emoji: "⚡",
    i18n: {
      es: {
        name: "Pelea",
        shortMeaning: "Conflicto intenso entre gatos.",
        description:
          "Los sonidos de pelea son vocalizaciones de alta intensidad: chillidos estridentes, gruñidos cruzados y transitorios abruptos. Indican confrontación directa entre gatos. Es importante intervenir con precaución — nunca con las manos.",
        contexts: [
          "Conflicto territorial entre gatos",
          "Pelea por recursos (comida, territorio)",
          "Introducción agresiva de un nuevo gato",
          "Agresión redirigida desde frustración",
        ],
        faqs: [
          {
            q: "¿Qué hago si mis gatos se pelean?",
            a: "Haz un ruido fuerte para distraerlos o coloca una barrera física entre ellos. NUNCA uses las manos. Separarlos por un tiempo y reintroducirlos gradualmente es lo más seguro.",
          },
        ],
      },
      en: {
        name: "Fight",
        shortMeaning: "An intense conflict between cats.",
        description:
          "Fight sounds are high-intensity vocalizations: piercing yowls, crossed growls, and abrupt transients. They indicate direct confrontation between cats. Intervene with caution — never with bare hands.",
        contexts: [
          "Territorial conflict between cats",
          "Resource guarding (food, territory)",
          "Aggressive introduction of a new cat",
          "Redirected aggression from frustration",
        ],
        faqs: [
          {
            q: "What should I do if my cats are fighting?",
            a: "Make a loud noise to distract them or place a physical barrier between them. NEVER use your hands. Separate them for a while and reintroduce gradually.",
          },
        ],
      },
    },
  },
  {
    slug: "llamada-madre",
    cls: "llamada_madre",
    emoji: "🐱",
    i18n: {
      es: {
        name: "Llamada de la Madre",
        shortMeaning: "Una madre llamando a sus crías.",
        description:
          "La llamada materna es un patrón melódico descendente dirigido a las crías. Las gatas usan este trino especial para localizar y guiar a sus gatitos. Si escuchas este sonido, hay probablemente gatitos cerca.",
        contexts: [
          "Gata buscando a sus gatitos",
          "Llamada de reagrupamiento",
          "Guía hacia el nido o la comida",
          "Cuidado maternal activo",
        ],
        faqs: [
          {
            q: "¿Todas las gatas hacen este sonido?",
            a: "Las gatas con gatitos sí, como parte del cuidado maternal. Algunas gatas esterilizadas pueden conservar el comportamiento pero sin crías reales.",
          },
        ],
      },
      en: {
        name: "Mother's Call",
        shortMeaning: "A mother calling her kittens.",
        description:
          "The maternal call is a descending melodic pattern directed at kittens. Mother cats use this special trill to locate and guide their kittens. If you hear this sound, there are likely kittens nearby.",
        contexts: [
          "Mother cat searching for her kittens",
          "Regrouping call",
          "Guiding toward the nest or food",
          "Active maternal care",
        ],
        faqs: [
          {
            q: "Do all cats make this sound?",
            a: "Cats with kittens do, as part of maternal care. Some spayed cats may retain the behavior without actual kittens.",
          },
        ],
      },
    },
  },
  {
    slug: "llamada-apareamiento",
    cls: "llamada_apareamiento",
    emoji: "💞",
    i18n: {
      es: {
        name: "Llamada de Apareamiento",
        shortMeaning: "Vocalización de celo o búsqueda de pareja.",
        description:
          "La llamada de apareamiento (caterwaul) es una vocalización prolongada e intensa, con amplias excursiones tonales. Es típica de gatos no esterilizados durante la época de celo. La esterilización elimina este comportamiento.",
        contexts: [
          "Gata en celo buscando pareja",
          "Gato no castrado marcando territorio vocalmente",
          "Llamada nocturna persistente",
          "Comportamiento reproductivo estacional",
        ],
        faqs: [
          {
            q: "¿Cómo dejo de escuchar esto?",
            a: "La esterilización (castración/neutering) elimina las vocalizaciones de celo en la gran mayoría de los casos. Consulta con tu veterinario sobre el momento ideal para la cirugía.",
          },
        ],
      },
      en: {
        name: "Mating Call",
        shortMeaning: "Heat vocalization or mate-seeking.",
        description:
          "The mating call (caterwaul) is a prolonged, intense vocalization with wide tonal excursions. It's typical of unneutered cats during heat. Spaying/neutering eliminates this behavior.",
        contexts: [
          "Female cat in heat seeking a mate",
          "Unneutered male territorial vocalizing",
          "Persistent nighttime calling",
          "Seasonal reproductive behavior",
        ],
        faqs: [
          {
            q: "How do I stop hearing this?",
            a: "Spaying/neutering eliminates heat vocalizations in the vast majority of cases. Consult your vet about the ideal timing for the procedure.",
          },
        ],
      },
    },
  },
  {
    slug: "dolor",
    cls: "dolor",
    emoji: "🆘",
    i18n: {
      es: {
        name: "Dolor",
        shortMeaning: "Tu gato podría estar experimentando dolor.",
        description:
          "Los meullidos de dolor tienen un alto índice de estrés acústico: son agudos, prolongados y urgentes. Los gatos ocultan el dolor por instinto, por lo que una vocalización de este tipo es una señal que no se debe ignorar. Consulta con tu veterinario.",
        contexts: [
          "Dolor agudo por lesión o enfermedad",
          "Malestar post-quirúrgico",
          "Artritis en gatos mayores",
          "Problemas urinarios (especialmente en gatos macho)",
        ],
        faqs: [
          {
            q: "¿Cómo distingo dolor de una llamada de atención?",
            a: "El dolor suena más agudo, prolongado y urgente. Si el comportamiento cambia (deja de comer, se esconde, evita ciertos movimientos), es probablemente dolor. Ante duda, consulta al veterinario.",
          },
        ],
      },
      en: {
        name: "Pain",
        shortMeaning: "Your cat may be experiencing pain.",
        description:
          "Pain meows have high acoustic distress: they're sharp, prolonged, and urgent. Cats instinctively hide pain, so a vocalization like this shouldn't be ignored. Consult your veterinarian.",
        contexts: [
          "Acute pain from injury or illness",
          "Post-surgical discomfort",
          "Arthritis in older cats",
          "Urinary problems (especially in male cats)",
        ],
        faqs: [
          {
            q: "How do I distinguish pain from an attention meow?",
            a: "Pain sounds sharper, more prolonged, and urgent. If behavior changes (stops eating, hides, avoids certain movements), it's likely pain. When in doubt, consult a vet.",
          },
        ],
      },
    },
  },
  {
    slug: "descansando",
    cls: "descansando",
    emoji: "😌",
    i18n: {
      es: {
        name: "Descansando",
        shortMeaning: "Tu gato está tranquilo y relajado.",
        description:
          "El descanso felino se caracteriza por un ronroneo continuo y uniforme, de baja energía y sin meullidos intercalados. A diferencia del estado feliz (que tiene meullidos y más energía), el gato descansando está en un estado pasivo de calma absoluta.",
        contexts: [
          "Ronroneo sostenido y uniforme",
          "Postura relajada, ojos cerrados o entrecerrados",
          "Posición de esfinge o semi-estirada",
          "Calma post-comida o post-juego",
        ],
        faqs: [
          {
            q: "¿Cómo distingo 'descansando' de 'feliz'?",
            a: "El ronroneo de descanso es más uniforme y sostenido, sin meullidos intercalados ni variación de energía. El estado feliz incluye meullidos, mayor interacción y energía variable.",
          },
        ],
      },
      en: {
        name: "Resting",
        shortMeaning: "Your cat is calm and relaxed.",
        description:
          "Feline rest is characterized by a continuous, uniform purr with low energy and no interspersed meows. Unlike the happy state (which has meows and more energy), a resting cat is in a passive state of absolute calm.",
        contexts: [
          "Sustained, uniform purring",
          "Relaxed posture, eyes closed or half-closed",
          "Sphinx or semi-stretched position",
          "Post-meal or post-play calm",
        ],
        faqs: [
          {
            q: "How do I tell 'resting' from 'happy'?",
            a: "Resting purr is more uniform and sustained, without interspersed meows or energy variation. The happy state includes meows, more interaction, and variable energy.",
          },
        ],
      },
    },
  },
  {
    slug: "advertencia",
    cls: "advertencia",
    emoji: "⚠️",
    i18n: {
      es: {
        name: "Advertencia",
        shortMeaning: "Tu gato pide espacio — respétale.",
        description:
          "El bufido (hiss) es una señal defensiva inequívoca: el gato se siente amenazado y pide distancia. No es agresión gratuita — es una advertencia para evitar el conflicto. Respeta el espacio de tu gato cuando bufa.",
        contexts: [
          "Sentirse amenazado o acorralado",
          "Defensa de territorio ante un extraño",
          "Dolor al ser tocado en una zona sensible",
          "Miedo ante un estímulo nuevo o inesperado",
        ],
        faqs: [
          {
            q: "¿Qué hago si mi gato bufa?",
            a: "Dale espacio inmediatamente. El bufido es una petición clara de distancia. Si bufa al tocarle una zona concreta, puede haber dolor — consulta al veterinario.",
          },
        ],
      },
      en: {
        name: "Warning",
        shortMeaning: "Your cat is asking for space — respect it.",
        description:
          "The hiss is an unmistakable defensive signal: your cat feels threatened and is asking for distance. It's not gratuitous aggression — it's a warning to avoid conflict. Respect your cat's space when they hiss.",
        contexts: [
          "Feeling threatened or cornered",
          "Territorial defense against a stranger",
          "Pain when touched in a sensitive area",
          "Fear from a new or unexpected stimulus",
        ],
        faqs: [
          {
            q: "What should I do if my cat hisses?",
            a: "Give them space immediately. A hiss is a clear request for distance. If they hiss when a specific area is touched, there may be pain — consult your vet.",
          },
        ],
      },
    },
  },
  {
    slug: "atencion",
    cls: "atencion",
    emoji: "👀",
    i18n: {
      es: {
        name: "Atención",
        shortMeaning: "Tu gato quiere que le prestes atención.",
        description:
          "Los meullidos de atención son armónicos, de tono ascendente y dirigidos específicamente a los humanos. Son peticiones: de comida, juego, acceso a una habitación, o simplemente compañía. Los gatos adultos rara vez meullan entre ellos.",
        contexts: [
          "Pedir comida o agua",
          "Quer jugar o interactuar",
          "Pedir que se abra una puerta",
          "Saludar al llegar a casa",
        ],
        faqs: [
          {
            q: "¿Por qué mi gato maúlla tanto?",
            a: "Los meullidos frecuentes suelen ser peticiones aprendidas: tu gato descubrió que vocalizar obtiene tu atención. Cambios bruscos en la frecuencia de meullidos pueden merecer una revisión veterinaria.",
          },
        ],
      },
      en: {
        name: "Attention",
        shortMeaning: "Your cat wants your attention.",
        description:
          "Attention meows are harmonic, with a rising tone, directed specifically at humans. They're requests: for food, play, access to a room, or simply company. Adult cats rarely meow at each other.",
        contexts: [
          "Asking for food or water",
          "Wanting to play or interact",
          "Asking for a door to be opened",
          "Greeting you when you arrive",
        ],
        faqs: [
          {
            q: "Why does my cat meow so much?",
            a: "Frequent meowing is usually learned requests: your cat discovered that vocalizing gets your attention. Sudden changes in meowing frequency may warrant a vet check.",
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