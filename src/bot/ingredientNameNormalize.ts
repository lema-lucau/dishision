// §B5 Layer 2: defensive normalisation of a Dishision Bot ingredient name before
// it's matched against (or auto-creates a row in) canonical_ingredient. The
// system prompt (Layer 1) already asks the bot to keep names plain, but a single
// slip like "Parmesan, grated" or "finely chopped onion" would spawn a spurious
// canonical row that duplicates one already in the database. This strips the
// preparation/serving descriptor so the match key is the plain ingredient.
//
// The overriding constraint (spec): preparation words only — NEVER varietal or
// form words that change what the ingredient actually is. "smoked paprika" is a
// different ingredient from "paprika"; "ground cumin" may differ from "cumin
// seeds". A false negative (a descriptor left in) is a minor annoyance; a false
// positive (collapsing two genuinely different ingredients) corrupts data. So
// the lists below are deliberately conservative, and when in doubt we leave the
// name alone.

// Adverbs that only ever qualify a preparation verb ("finely chopped").
const PREP_ADVERBS = ['finely', 'roughly', 'thinly', 'coarsely', 'freshly', 'lightly'];

// Preparation verbs / past participles. Every one describes an action done TO an
// ingredient, not a different ingredient. Notably absent, on purpose: smoked,
// ground, dried, fresh, roasted, toasted, cured, pickled, whole — each of those
// can distinguish one ingredient from another and must survive.
const PREP_VERBS = [
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'cubed', 'julienned',
  'crushed', 'mashed', 'beaten', 'softened', 'melted', 'divided', 'halved', 'quartered',
  'peeled', 'trimmed', 'drained', 'rinsed', 'crumbled', 'zested', 'deseeded', 'seeded',
  'pitted', 'cored', 'whisked', 'cut', 'torn', 'separated',
];

// Trailing serving/prep phrases, matched whole against a comma segment.
const PREP_PHRASES = [
  'to serve', 'to taste', 'for garnish', 'for garnishing', 'for serving',
  'room temperature', 'at room temperature', 'plus extra', 'plus more',
];

const PREP_WORDS = new Set([...PREP_ADVERBS, ...PREP_VERBS]);

function isPrepWord(word: string): boolean {
  const c = word.toLowerCase().replace(/[^a-z]/g, '');
  return c.length > 0 && PREP_WORDS.has(c);
}

// A comma tail ("diced", "finely chopped", "to taste", "diced, divided") counts
// as strippable only if every comma-separated segment is a known prep phrase or
// made up entirely of known prep words. Anything unrecognised (e.g. "skin on",
// "bone in", "cut into 2cm cubes") is left in place — conservative by design.
function isAllPrep(tail: string): boolean {
  const parts = tail.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => PREP_PHRASES.includes(p) || p.split(/\s+/).every(isPrepWord));
}

// Strip preparation/serving descriptors from an ingredient name, returning the
// plain ingredient. Preserves the original casing of the surviving words, and
// never returns empty — if stripping would consume the whole name it's left
// untouched.
export function stripPrepDescriptors(raw: string): string {
  const original = (raw ?? '').trim();
  if (!original) return original;
  let name = original;

  // 1) Comma-suffix form: "chicken breast, diced" -> "chicken breast".
  const comma = name.indexOf(',');
  if (comma > 0) {
    const head = name.slice(0, comma).trim();
    const tail = name.slice(comma + 1).trim();
    if (head && isAllPrep(tail)) name = head;
  }

  // 2) Leading-adjective form: "finely chopped onion" -> "onion". Never strips
  // the final word, so a name that is only prep words survives as-is.
  const words = name.split(/\s+/);
  let i = 0;
  while (i < words.length - 1 && isPrepWord(words[i])) i++;
  if (i > 0) {
    const stripped = words.slice(i).join(' ').trim();
    if (stripped) name = stripped;
  }

  return name || original;
}
