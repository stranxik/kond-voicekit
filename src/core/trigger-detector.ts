/**
 * Trigger Detector - Detect when to trigger LLM early
 *
 * Uses simple regex patterns to detect verb + object combinations
 * that indicate a complete user intent.
 *
 * This is intentionally simple - no ML, no embeddings.
 * The goal is to detect "create an event tomorrow" as early as possible.
 */

import type { Locale } from "../types/config";

// French action verbs
const VERB_PATTERNS_FR = [
  "créer", "crée", "créé",
  "ajouter", "ajoute", "ajouté",
  "supprimer", "supprime", "supprimé",
  "chercher", "cherche", "recherche",
  "ouvrir", "ouvre",
  "modifier", "modifie", "modifié",
  "envoyer", "envoie", "envoyé",
  "trouver", "trouve", "trouvé",
  "annuler", "annule", "annulé",
  "mettre", "mets", "mis",
  "afficher", "affiche", "affiché",
  "montrer", "montre", "montré",
  "lister", "liste", "listé",
  "rappeler", "rappelle", "rappelé",
  "planifier", "planifie", "planifié",
];

// English action verbs
const VERB_PATTERNS_EN = [
  "create", "add", "delete", "remove",
  "search", "find", "look",
  "open", "modify", "edit", "change",
  "send", "cancel", "set", "put",
  "show", "display", "list",
  "remind", "schedule", "plan",
];

// French objects (entities)
const OBJECT_PATTERNS_FR = [
  "événement", "event", "évènement",
  "contact", "contacts",
  "fichier", "fichiers", "document",
  "calendrier", "agenda",
  "rappel", "reminder",
  "note", "notes",
  "tâche", "tâches", "task",
  "réunion", "meeting",
  "email", "mail", "message",
  "rendez-vous", "rdv",
  "dépense", "expense",
  "objectif", "goal",
  "habitude", "habit",
];

// English objects
const OBJECT_PATTERNS_EN = [
  "event", "events",
  "contact", "contacts",
  "file", "files", "document",
  "calendar", "agenda",
  "reminder", "reminders",
  "note", "notes",
  "task", "tasks",
  "meeting", "meetings",
  "email", "mail", "message",
  "appointment",
  "expense", "expenses",
  "goal", "goals",
  "habit", "habits",
];

// Build regex patterns
const VERB_REGEX = new RegExp(
  `\\b(${[...VERB_PATTERNS_FR, ...VERB_PATTERNS_EN].join("|")})\\b`,
  "i"
);

const OBJECT_REGEX = new RegExp(
  `\\b(${[...OBJECT_PATTERNS_FR, ...OBJECT_PATTERNS_EN].join("|")})\\b`,
  "i"
);

export interface TriggerState {
  hasVerb: boolean;
  hasObject: boolean;
  confidence: number;
  transcript: string;
}

/**
 * Analyze transcript for trigger conditions
 */
export function analyzeTrigger(transcript: string, confidence: number): TriggerState {
  const hasVerb = VERB_REGEX.test(transcript);
  const hasObject = OBJECT_REGEX.test(transcript);

  return {
    hasVerb,
    hasObject,
    confidence,
    transcript,
  };
}

/**
 * Check if we should trigger LLM early
 *
 * Conditions:
 * - verb + object detected
 * - confidence > 80%
 * - (silence will be checked by caller)
 */
export function shouldTriggerEarly(
  transcript: string,
  confidence: number,
  minConfidence: number = 0.80
): boolean {
  const state = analyzeTrigger(transcript, confidence);

  return (
    state.hasVerb &&
    state.hasObject &&
    state.confidence >= minConfidence
  );
}

/**
 * Check if we should commit (send to TTS)
 *
 * Called when UtteranceEnd is received from STT
 */
export function shouldCommit(
  utteranceEnd: boolean,
  isFinal: boolean
): boolean {
  return utteranceEnd || isFinal;
}

/**
 * Extract the likely intent from transcript (for logging/debugging)
 */
export function extractIntent(transcript: string): { verb: string | null; object: string | null } {
  const verbMatch = transcript.match(VERB_REGEX);
  const objectMatch = transcript.match(OBJECT_REGEX);

  return {
    verb: verbMatch ? verbMatch[0].toLowerCase() : null,
    object: objectMatch ? objectMatch[0].toLowerCase() : null,
  };
}

// =============================================================================
// Backchannel Detection
// =============================================================================

// French backchannel patterns (acknowledgments that don't need LLM response)
const BACKCHANNEL_FR = [
  /^(mm-?h?m+|hm+|uhm?)\.?$/i,
  /^(oui|ouais|ouep|ok|okay|d'accord|d'acc)\.?$/i,
  /^(entendu|compris|pigé|je vois)\.?$/i,
  /^(ah|ah bon|ah oui|ah d'accord)\.?$/i,
  /^(bien|très bien|parfait|super|génial)\.?$/i,
  /^(merci|thanks)\.?$/i,
];

// English backchannel patterns
const BACKCHANNEL_EN = [
  /^(mm-?h?m+|uh-?huh|hm+|uhm?)\.?$/i,
  /^(yeah|yep|yup|yes|ok|okay|sure|got it)\.?$/i,
  /^(i see|i understand|right|exactly|correct)\.?$/i,
  /^(ah|oh|oh i see|oh ok|oh okay)\.?$/i,
  /^(good|great|nice|perfect|awesome)\.?$/i,
  /^(thanks|thank you)\.?$/i,
];

/**
 * Check if transcript is a backchannel (acknowledgment that doesn't need a response)
 *
 * Backchannels are short utterances like "mm-hmm", "oui", "ok" that indicate
 * the user is listening but not asking a question or giving an instruction.
 *
 * @param transcript - The transcript to check
 * @param confidence - STT confidence score
 * @param locale - "fr" or "en"
 * @returns true if this is a backchannel
 */
export function isBackchannel(
  transcript: string,
  confidence: number,
  locale: Locale = "fr"
): boolean {
  const trimmed = transcript.trim().toLowerCase();
  const patterns = locale === "fr" ? BACKCHANNEL_FR : BACKCHANNEL_EN;

  // Must be short, high confidence, and match a pattern
  return (
    patterns.some(p => p.test(trimmed)) &&
    transcript.length < 25 &&
    confidence > 0.75
  );
}

// =============================================================================
// Incomplete Utterance Detection
// =============================================================================

// French incomplete clause patterns (trailing conjunctions, unfinished phrases)
const INCOMPLETE_PATTERNS_FR = [
  // "X je/tu/il" patterns - user about to say what they'll do
  /\b(là je|et je|mais je|donc je|alors je|quand je|si je|comme je)\s*$/i,
  /\b(là tu|et tu|mais tu|donc tu|alors tu|quand tu|si tu)\s*$/i,
  /\b(là il|et il|mais il|donc il|alors il|quand il|si il)\s*$/i,
  /\b(là on|et on|mais on|donc on|alors on|quand on|si on)\s*$/i,
  /\b(là c'est|et c'est|mais c'est|donc c'est|alors c'est)\s*$/i,
  // Verb starters
  /\b(je vais|il faut|c'est pour|parce que)\s*$/i,
  /\b(je voudrais|j'aimerais|je pense que|je crois que|je suis en train de)\s*$/i,
  // Conjunctions at end
  /\b(et|mais|ou|donc|car|puis|alors|ensuite|que|qui)\s*$/i,
  // Subordinate clause starters
  /\b(pour que|afin de|avant de|après avoir|en train de)\s*$/i,
  // Infinitive patterns (de + verb, à + verb)
  /\b(de ne pas|de pas|à ne pas|pour ne pas)\s*$/i,
  /\b(de|à|pour|sans|avec|dans|sur|sous|par)\s+(le|la|les|l'|me|te|se|nous|vous|un|une|des|mon|ma|mes|ton|ta|tes|son|sa|ses)?\s*$/i,
  // Mid-sentence prepositions
  /\b(par rapport|au niveau|en ce qui|du fait|à propos)\s*(de|que|du)?\s*$/i,
  /\b(c'est|ce n'est pas|il y a|il n'y a pas|ça)\s*$/i,
  // Trailing pronouns (user cut off mid-word)
  /\b(je|tu|il|elle|on|nous|vous|ils|elles)\s*$/i,
  // Trailing articles/determiners (about to say a noun)
  /\b(le|la|les|l'|un|une|des|du|de la|ce|cette|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\s*$/i,
  // Relative pronouns
  /\b(qui|que|dont|où|lequel|laquelle|lesquels|lesquelles)\s*$/i,
];

// English incomplete clause patterns
const INCOMPLETE_PATTERNS_EN = [
  // "X I/you/he" patterns
  /\b(so i|and i|but i|then i|when i|if i|as i|because i)\s*$/i,
  /\b(so you|and you|but you|then you|when you|if you)\s*$/i,
  /\b(so it|and it|but it|then it|when it|if it)\s*$/i,
  /\b(so that|and that|but that|then that|what)\s*$/i,
  // Verb starters
  /\b(i will|i want to|i need to|i'm going to|i have to)\s*$/i,
  /\b(i would like|i think that|i believe that|i was)\s*$/i,
  // Conjunctions at end
  /\b(and|but|or|so|because|then|also|that|which|who)\s*$/i,
  // Subordinate clause starters
  /\b(in order to|before i|after i|while i)\s*$/i,
  // Infinitive patterns (to + verb, not to)
  /\b(to not|not to|to be|to have|to do|to get|to make|to take)\s*$/i,
  /\b(to|for|with|without|about|from|into)\s+(the|a|an|my|your|his|her|its|our|their|this|that|some)?\s*$/i,
  // Mid-sentence prepositions
  /\b(about the|regarding|in terms of|with respect to|according to)\s*$/i,
  /\b(it's|it is|there is|there are|this is|that is|here's|here is)\s*$/i,
  /\b(i'm|i am|we're|we are|you're|you are|they're|they are|he's|she's)\s*$/i,
  // Trailing pronouns
  /\b(i|you|he|she|it|we|they)\s*$/i,
  // Trailing articles/determiners
  /\b(the|a|an|this|that|these|those|my|your|his|her|its|our|their|some|any)\s*$/i,
  // Relative pronouns
  /\b(who|whom|whose|which|that|where|when)\s*$/i,
];

/**
 * Check if utterance is likely incomplete (user is mid-sentence)
 *
 * Uses multiple heuristics:
 * 1. Pattern matching for incomplete clauses
 * 2. Terminal punctuation check
 * 3. Minimum word count
 * 4. Partial word detection
 * 5. Unusual word endings (likely cut-off mid-word)
 *
 * @param transcript - The transcript to check
 * @param locale - "fr" or "en"
 * @returns true if utterance appears incomplete
 */
export function isLikelyIncomplete(
  transcript: string,
  locale: Locale = "fr"
): boolean {
  const patterns = locale === "fr" ? INCOMPLETE_PATTERNS_FR : INCOMPLETE_PATTERNS_EN;
  const trimmed = transcript.trim();

  // Empty or very short = incomplete
  if (trimmed.length < 3) {
    return true;
  }

  // Check for incomplete patterns
  if (patterns.some(p => p.test(trimmed))) {
    return true;
  }

  // Check for trailing ellipsis
  if (/\.{2,}$/.test(trimmed) || /…$/.test(trimmed)) {
    return true;
  }

  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const hasTerminalPunctuation = /[.!?。？！]$/.test(trimmed);
  const lastWord = words[words.length - 1]?.replace(/[.,!?;:]$/, "") || "";

  // Detect partial words - words cut off mid-syllable
  if (lastWord.length >= 3 && !hasTerminalPunctuation) {
    // French: Words rarely end in these consonant clusters
    const partialWordFR = /[bcdfghjklmnpqrstvwxz]{2,}$|[aeiou][bcdfghjklmnpqrstvwxz]$/i;
    // English: Words rarely end in these patterns
    const partialWordEN = /[bcdfghjklmnpqrstvwxz]{2,}$|[aeiou][bcdfghjklmnpqrstvwxz]$/i;

    // Common valid endings to exclude
    const validEndingsFR = /^(ant|ent|eur|eux|ait|ais|ont|ons|ez|er|ir|re|le|ne|me|te|se|de|que|ce|est|et|en|an|on|un|ou|au|eu|il|al|el|ol|ul|ar|or|ur|is|us|as|os|es)$/i;
    const validEndingsEN = /^(ing|tion|ness|ment|able|ible|ful|less|ous|ive|ant|ent|er|or|ed|ly|ty|ry|al|el|ol|ul|ar|is|us|as|os|es|en|on|an|in|at|it|ut|et)$/i;

    const lastThree = lastWord.slice(-3);
    const lastTwo = lastWord.slice(-2);
    const isPartial = locale === "fr" ? partialWordFR : partialWordEN;
    const validEndings = locale === "fr" ? validEndingsFR : validEndingsEN;

    // If matches partial pattern AND doesn't match valid endings
    if (isPartial.test(lastWord) && !validEndings.test(lastThree) && !validEndings.test(lastTwo)) {
      return true;
    }
  }

  // Single word without punctuation is likely incomplete
  if (wordCount === 1 && !hasTerminalPunctuation) {
    const completeCommands = locale === "fr"
      ? /^(stop|arrête|annule|cancel|non|no|oui|yes|ok|merci|bonjour|salut)$/i
      : /^(stop|cancel|no|yes|ok|thanks|hello|hi|bye)$/i;
    if (!completeCommands.test(trimmed)) {
      return true;
    }
  }

  // Short sentences (< 4 words) without terminal punctuation are suspicious
  if (wordCount < 4 && !hasTerminalPunctuation) {
    const functionWords = locale === "fr"
      ? /^(je|tu|il|elle|on|nous|vous|ils|elles|le|la|les|un|une|des|de|du|à|pour|avec|dans|sur|que|qui|ce|cette|mon|ma|ton|ta|son|sa)$/i
      : /^(i|you|he|she|it|we|they|the|a|an|to|for|with|in|on|that|which|who|this|my|your|his|her)$/i;
    if (functionWords.test(lastWord)) {
      return true;
    }
  }

  // Last word is very short (1-2 chars) and not punctuated = probably partial
  if (lastWord.length <= 2 && !hasTerminalPunctuation) {
    const validShortWords = locale === "fr"
      ? /^(ok|ça|là|ou|si|ni|ne|eu|pu|su|vu|lu|bu|du|va|ça)$/i
      : /^(ok|no|so|go|do|to|up|on|in|at|be|we|me|he|if|it|as|an|am)$/i;
    if (!validShortWords.test(lastWord)) {
      return true;
    }
  }

  // Ends with a comma = definitely incomplete
  if (/,\s*$/.test(trimmed)) {
    return true;
  }

  return false;
}

// =============================================================================
// Semantic Completion Detection
// =============================================================================

// French patterns that indicate a complete utterance
const COMPLETE_PATTERNS_FR = [
  // Polite endings
  /\b(s'il te plaît|s'il vous plaît|svp|stp)\.?$/i,
  // Gratitude (turn-ending)
  /\b(merci|merci beaucoup|merci bien|je t'en prie|de rien)\.?$/i,
  // Conclusions
  /\b(voilà|c'est tout|c'est ça|c'est bon|ça y est|terminé)\.?$/i,
  // Short definitive answers
  /\b(oui|non|peut-être|je ne sais pas|aucune idée|pas du tout)\.?$/i,
  // Agreement/acknowledgment (turn-ending)
  /\b(d'accord|ok|okay|bien sûr|évidemment|entendu|compris|très bien)\.?$/i,
  // Positive closure
  /\b(parfait|super|génial|excellent|nickel|top|impeccable)\.?$/i,
  // Goodbye / farewell
  /\b(au revoir|à bientôt|à plus|à plus tard|salut|ciao|bonne journée|bonne soirée)\.?$/i,
  // Explicit end signals
  /\b(j'ai fini|j'ai terminé|c'est terminé|c'est fait|fini|done)\.?$/i,
  // Commands that are complete
  /\b(stop|arrête|annule|continue|vas-y|go)\.?$/i,
];

// English patterns that indicate a complete utterance
const COMPLETE_PATTERNS_EN = [
  // Polite endings
  /\b(please|if you would|if you could|if you don't mind)\.?$/i,
  // Gratitude
  /\b(thanks|thank you|thank you very much|thanks a lot|appreciate it)\.?$/i,
  // Conclusions
  /\b(that's it|that's all|i'm done|all set|all good|we're good)\.?$/i,
  // Short definitive answers
  /\b(yes|no|maybe|i don't know|not sure|no idea|absolutely|definitely)\.?$/i,
  // Agreement/acknowledgment
  /\b(okay|ok|alright|sure|of course|understood|got it|sounds good)\.?$/i,
  // Positive closure
  /\b(perfect|great|awesome|excellent|wonderful|fantastic|nice)\.?$/i,
  // Goodbye / farewell
  /\b(bye|goodbye|see you|see you later|later|take care|have a good one)\.?$/i,
  // Explicit end signals
  /\b(i'm done|i'm finished|that's everything|finished|done|complete)\.?$/i,
  // Commands that are complete
  /\b(stop|cancel|continue|go ahead|proceed|let's go)\.?$/i,
];

/**
 * Check if utterance is likely complete (semantically finished)
 *
 * Detects patterns that indicate the user has finished their turn:
 * - Polite endings (please, s'il vous plaît)
 * - Gratitude (thanks, merci)
 * - Conclusions (that's all, voilà)
 * - Short definitive answers (yes, no)
 * - Commands (stop, continue)
 *
 * @param transcript - The transcript to check
 * @param locale - "fr" or "en"
 * @returns true if utterance appears complete
 */
export function isLikelyComplete(
  transcript: string,
  locale: Locale = "fr"
): boolean {
  const patterns = locale === "fr" ? COMPLETE_PATTERNS_FR : COMPLETE_PATTERNS_EN;
  const trimmed = transcript.trim();

  // Check for semantic completion patterns
  if (patterns.some(p => p.test(trimmed))) {
    return true;
  }

  // Terminal punctuation is a strong completion signal
  if (/[.!?。？！]$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Linguistic analysis signals for turn-taking decisions
 */
export interface LinguisticSignals {
  endsWithTerminal: boolean;  // . ! ?
  isQuestion: boolean;
  hasIncompleteClause: boolean;
  trailingConjunction: boolean;
  wordCount: number;
}

/**
 * Analyze linguistic signals in transcript
 */
export function analyzeLinguisticSignals(
  transcript: string,
  locale: Locale = "fr"
): LinguisticSignals {
  const trimmed = transcript.trim();
  const patterns = locale === "fr" ? INCOMPLETE_PATTERNS_FR : INCOMPLETE_PATTERNS_EN;

  return {
    endsWithTerminal: /[.!?。？！]$/.test(trimmed),
    isQuestion: /\?$/.test(trimmed) || /^(est-ce|qu'est|pourquoi|comment|où|quand|qui|what|where|when|why|how|who|is|are|do|does|can|could)/i.test(trimmed),
    hasIncompleteClause: patterns.some(p => p.test(trimmed)),
    trailingConjunction: /\b(et|mais|ou|and|but|or)\s*$/i.test(trimmed),
    wordCount: trimmed.split(/\s+/).filter(w => w.length > 0).length,
  };
}
