/**
 * astro-i18n: display-time translation of chart vocabulary.
 *
 * The blueprint stores its calculated values in English (signs, planets,
 * HD types, Gene Key shadow/gift/siddhi names, aspect names). Rather than
 * regenerate stored blueprints per language, we translate the bounded
 * vocabulary at render time. tx() looks a term up in the flat map for the
 * active language and falls back to the original term, so unknown values
 * never break and English is always a safe default.
 *
 * Longer interpretation sentences (HD type/authority/profile meanings,
 * core-planet subtitles) live here too as parallel dictionaries.
 */

// ---------------------------------------------------------------------------
// Flat term map, Spanish
// ---------------------------------------------------------------------------

const ES: Record<string, string> = {
  // Zodiac signs
  Aries: "Aries", Taurus: "Tauro", Gemini: "Géminis", Cancer: "Cáncer",
  Leo: "Leo", Virgo: "Virgo", Libra: "Libra", Scorpio: "Escorpio",
  Sagittarius: "Sagitario", Capricorn: "Capricornio", Aquarius: "Acuario",
  Pisces: "Piscis",

  // Planets and points
  Sun: "Sol", Moon: "Luna", Mercury: "Mercurio", Venus: "Venus",
  Mars: "Marte", Jupiter: "Júpiter", Saturn: "Saturno", Uranus: "Urano",
  Neptune: "Neptuno", Pluto: "Plutón", Chiron: "Quirón",
  NorthNode: "Nodo Norte", Ceres: "Ceres", Earth: "Tierra",
  Rising: "Ascendente", Ascendant: "Ascendente",

  // Elements + modalities (soul map radar axes)
  Fire: "Fuego", Air: "Aire", Water: "Agua",
  Cardinal: "Cardinal", Fixed: "Fijo", Mutable: "Mutable",

  // Aspects
  Trine: "Trígono", Sextile: "Sextil", Conjunction: "Conjunción",
  Opposition: "Oposición", Square: "Cuadratura", Quincunx: "Quincuncio",
  "Semi-Sextile": "Semisextil", "Semi-Square": "Semicuadratura",
  Sesquiquadrate: "Sesquicuadratura", Quintile: "Quintil",
  "Bi-Quintile": "Biquintil", Septile: "Septil", "Bi-Septile": "Biseptil",
  "Tri-Septile": "Triseptil",

  // Human Design types
  Generator: "Generador", "Manifesting Generator": "Generador Manifestante",
  Projector: "Proyector", Manifestor: "Manifestador", Reflector: "Reflector",

  // HD authorities
  Sacral: "Sacral", Emotional: "Emocional", "Solar Plexus": "Plexo Solar",
  Splenic: "Esplénica", "Self-Projected": "Autoproyectada",
  "Mental / Sounding Board": "Mental / Caja de Resonancia",
  Ego: "Ego", Lunar: "Lunar",

  // HD strategies (exact backend strings)
  "Wait a lunar cycle (28 days) before making major decisions":
    "Espera un ciclo lunar (28 días) antes de tomar decisiones importantes",
  "Wait to respond, then inform before acting":
    "Espera para responder, luego informa antes de actuar",
  "Wait to respond": "Espera para responder",
  "Inform before acting": "Informa antes de actuar",
  "Wait for the invitation": "Espera la invitación",

  // HD centers
  Head: "Cabeza", Ajna: "Ajna", Throat: "Garganta", "G Centre": "Centro G",
  G: "Centro G", "Heart / Ego": "Corazón / Ego", Heart: "Corazón",
  Spleen: "Bazo", Root: "Raíz",

  // Gene Keys spheres
  "Life's Work": "Obra de Vida", Evolution: "Evolución",
  Radiance: "Resplandor", Purpose: "Propósito", Attraction: "Atracción",

  // Small UI words used next to chart data
  Type: "Tipo", Strategy: "Estrategia", Authority: "Autoridad",
  Profile: "Perfil", Cross: "Cruz", Gate: "Puerta",
  Shadow: "Sombra", Gift: "Don", Siddhi: "Siddhi",

  // Astrocartography line labels
  "MC Midheaven": "MC Medio Cielo", "IC Nadir": "IC Fondo del Cielo",
  "ASC Rising": "ASC Ascendente", "DSC Setting": "DSC Descendente",

  // Gene Keys shadows (canon order, gates 1-64)
  Entropy: "Entropía", Dislocation: "Dislocación", Chaos: "Caos",
  Intolerance: "Intolerancia", Impatience: "Impaciencia", Conflict: "Conflicto",
  Division: "División", Mediocrity: "Mediocridad", Inertia: "Inercia",
  "Self-Obsession": "Autoobsesión", Obscurity: "Oscuridad", Vanity: "Vanidad",
  Discord: "Discordia", Compromise: "Transigencia", Dullness: "Monotonía",
  Indifference: "Indiferencia", Opinion: "Opinión", Judgment: "Juicio",
  "Co-Dependence": "Codependencia", Superficiality: "Superficialidad",
  Control: "Control", Dishonour: "Deshonra", Complexity: "Complejidad",
  Addiction: "Adicción", Constriction: "Constricción", Pride: "Orgullo",
  Selfishness: "Egoísmo", Purposelessness: "Falta de Propósito",
  "Half-Heartedness": "Tibieza", Desire: "Deseo", Arrogance: "Arrogancia",
  Failure: "Fracaso", Forgetting: "Olvido", Force: "Fuerza Bruta",
  Hunger: "Hambre", Turbulence: "Turbulencia", Weakness: "Debilidad",
  Struggle: "Lucha", Provocation: "Provocación", Exhaustion: "Agotamiento",
  Fantasy: "Fantasía", Expectation: "Expectativa", Deafness: "Sordera",
  Interference: "Interferencia", Dominance: "Dominación",
  Seriousness: "Seriedad", Oppression: "Opresión", Inadequacy: "Insuficiencia",
  Reaction: "Reacción", Corruption: "Corrupción", Agitation: "Agitación",
  Stress: "Estrés", Immaturity: "Inmadurez", Greed: "Codicia",
  Victimization: "Victimismo", Distraction: "Distracción", Unease: "Inquietud",
  Dissatisfaction: "Insatisfacción", Dishonesty: "Deshonestidad",
  Limitation: "Limitación", Psychosis: "Psicosis",
  Intellectualism: "Intelectualismo", Doubt: "Duda", Confusion: "Confusión",

  // Gene Keys gifts
  Freshness: "Frescura", Orientation: "Orientación", Innovation: "Innovación",
  Understanding: "Comprensión", Patience: "Paciencia", Diplomacy: "Diplomacia",
  Guidance: "Guía", Style: "Estilo", Determination: "Determinación",
  Naturalness: "Naturalidad", Idealism: "Idealismo",
  Discrimination: "Discriminación", Discernment: "Discernimiento",
  Competence: "Competencia", Magnetism: "Magnetismo",
  Versatility: "Versatilidad", "Far-Sightedness": "Previsión",
  Integrity: "Integridad", Sensitivity: "Sensibilidad",
  "Self-Assurance": "Autoconfianza", Graciousness: "Gentileza",
  Simplicity: "Simplicidad", Invention: "Invención", Acceptance: "Aceptación",
  Artfulness: "Ingenio", Altruism: "Altruismo", Totality: "Totalidad",
  Commitment: "Compromiso", Lightness: "Ligereza", Leadership: "Liderazgo",
  Preservation: "Preservación", Mindfulness: "Atención Plena",
  Strength: "Fortaleza", Adventure: "Aventura", Humanity: "Humanidad",
  Equality: "Igualdad", Perseverance: "Perseverancia", Dynamism: "Dinamismo",
  Resolve: "Resolución", Anticipation: "Anticipación", Detachment: "Desapego",
  Insight: "Perspicacia", Teamwork: "Trabajo en Equipo", Synthesis: "Síntesis",
  Delight: "Deleite", Transmutation: "Transmutación",
  Resourcefulness: "Recursividad", Revolution: "Revolución",
  Equilibrium: "Equilibrio", Initiative: "Iniciativa", Restraint: "Contención",
  Expansion: "Expansión", Aspiration: "Aspiración", Freedom: "Libertad",
  Enrichment: "Enriquecimiento", Intuition: "Intuición", Vitality: "Vitalidad",
  Intimacy: "Intimidad", Realism: "Realismo", Inspiration: "Inspiración",
  Precision: "Precisión", Inquiry: "Indagación", Imagination: "Imaginación",

  // Gene Keys siddhis
  Beauty: "Belleza", Unity: "Unidad", Innocence: "Inocencia",
  Forgiveness: "Perdón", Timelessness: "Atemporalidad", Peace: "Paz",
  Virtue: "Virtud", Exquisiteness: "Exquisitez",
  Invincibility: "Invencibilidad", Being: "Ser", Light: "Luz",
  Purity: "Pureza", Empathy: "Empatía", Bounteousness: "Abundancia",
  Florescence: "Florecimiento", Mastery: "Maestría",
  Omniscience: "Omnisciencia", Perfection: "Perfección",
  Sacrifice: "Sacrificio", Presence: "Presencia", Valour: "Valor",
  Grace: "Gracia", Quintessence: "Quintaesencia", Silence: "Silencio",
  "Universal Love": "Amor Universal", Invisibility: "Invisibilidad",
  Selflessness: "Desinterés", Immortality: "Inmortalidad",
  Devotion: "Devoción", Rapture: "Arrobamiento", Humility: "Humildad",
  Veneration: "Veneración", Revelation: "Revelación", Majesty: "Majestad",
  Boundlessness: "Infinitud", Compassion: "Compasión", Tenderness: "Ternura",
  Honour: "Honor", Liberation: "Liberación", "Divine Will": "Voluntad Divina",
  Emanation: "Emanación", Celebration: "Celebración", Epiphany: "Epifanía",
  Synarchy: "Sinarquía", Communion: "Comunión", Ecstasy: "Éxtasis",
  Transfiguration: "Transfiguración", Wisdom: "Sabiduría",
  Rebirth: "Renacimiento", Harmony: "Armonía", Awakening: "Despertar",
  Stillness: "Quietud", Superabundance: "Superabundancia",
  Ascension: "Ascensión", Intoxication: "Embriaguez", Clarity: "Claridad",
  Bliss: "Dicha", Transparency: "Transparencia", Justice: "Justicia",
  Sanctity: "Santidad", Impeccability: "Impecabilidad", Truth: "Verdad",
  Illumination: "Iluminación",
};

/** Translate a chart vocabulary term for the active language.
 *  Falls back to the original term, so unknown values never break. */
export function tx(term: string | null | undefined, lang: string): string {
  if (!term) return "";
  if (lang && lang.startsWith("es")) return ES[term] ?? term;
  return term;
}

// ---------------------------------------------------------------------------
// Interpretation sentences (parallel to the English dicts in profile/page.tsx)
// ---------------------------------------------------------------------------

export const ES_HD_TYPE_MEANINGS: Record<string, string> = {
  "Generator": "Estás hecho para responder. Tu energía es sostenible cuando amas lo que haces.",
  "Manifesting Generator": "Estás hecho para responder y moverte rápido. Hacer varias cosas a la vez es tu naturaleza.",
  "Projector": "Estás hecho para guiar. Espera la invitación antes de compartir tu sabiduría.",
  "Manifestor": "Estás hecho para iniciar. Informa a las personas a tu alrededor antes de actuar.",
  "Reflector": "Eres un espejo para tu comunidad. Necesitas un ciclo lunar completo antes de decisiones importantes.",
};

export const ES_HD_AUTHORITY_MEANINGS: Record<string, string> = {
  "Sacral": "Tu instinto sabe antes que tu mente. El sí o no de tu cuerpo es tu verdad.",
  "Emotional": "Necesitas tiempo. Nunca decidas en el pico ni en el bajón. La claridad llega en olas.",
  "Solar Plexus": "Necesitas tiempo. Nunca decidas en el pico ni en el bajón. La claridad llega en olas.",
  "Splenic": "Un susurro silencioso en el momento. Solo habla una vez. Confía en la primera sensación.",
  "Self-Projected": "Háblalo en voz alta. Tu verdad emerge en tu propia voz.",
  "Mental / Sounding Board": "Conversa con personas de confianza. La respuesta llega a través del diálogo.",
  "Ego": "Sabes lo que quieres cuando te comprometes desde el corazón. Comprométete solo cuando sea real.",
  "Lunar": "Reflejas tu entorno. Un ciclo lunar completo antes de cualquier decisión importante.",
};

export const ES_HD_PROFILE_MEANINGS: Record<string, string> = {
  "1/3": "Investigador / Mártir. Aprendes investigando y por ensayo y error.",
  "1/4": "Investigador / Oportunista. Construyes sobre cimientos profundos y redes de confianza.",
  "2/4": "Ermitaño / Oportunista. Necesitas soledad para desarrollar maestría, luego tu red te llama.",
  "2/5": "Ermitaño / Hereje. Necesitas tiempo a solas pero la gente proyecta soluciones prácticas en ti.",
  "3/5": "Mártir / Hereje. Aprendes por experiencia y te ven como quien resuelve problemas prácticos.",
  "3/6": "Mártir / Modelo a Seguir. Primera mitad de la vida: ensayo y error. Segunda: convertirte en el ejemplo.",
  "4/6": "Oportunista / Modelo a Seguir. Tu red lo es todo. Te conviertes en una autoridad de confianza.",
  "5/1": "Hereje / Investigador. La gente proyecta cualidades de salvador en ti.",
  "5/2": "Hereje / Ermitaño. Te llaman desde la soledad para resolver los problemas de otros.",
  "6/2": "Modelo a Seguir / Ermitaño. Tres fases de vida: ensayo, retiro, ejemplo.",
  "6/3": "Modelo a Seguir / Mártir. Guiado por la experiencia. Lo vives antes de enseñarlo.",
};

export const ES_CORE_SUBTITLES: Record<string, string> = {
  Sun: "Tu identidad esencial, cómo brillas",
  Moon: "Tu naturaleza emocional, cómo sientes",
  Rising: "Tu máscara exterior, cómo te ve el mundo",
};
