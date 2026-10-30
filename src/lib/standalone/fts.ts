/**
 * The full-text search of the standalone demo, as Postgres's `russian` configuration does it for `document_chunks.fts`
 * (`to_tsvector('russian', text)`) and `websearch_to_tsquery('russian', query)`: the words lower-cased, the stop words
 * dropped, the Russian words stemmed by Snowball's algorithm. The Latin words are only lower-cased (Postgres stems
 * them in English) and `ts_rank` is approximated by the frequency of the query's words.
 */

const VOWELS = 'аеиоуыэюя'

/** Postgres's `russian.stop`. */
const RUSSIAN_STOP = new Set(
  (
    'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня ' +
    'еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там ' +
    'потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже ' +
    'себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее ' +
    'сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про ' +
    'всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им ' +
    'более всегда конечно всю между'
  ).split(' '),
)

/** Postgres's `english.stop`, the commonest of it. */
const ENGLISH_STOP = new Set(
  (
    'a an and are as at be but by for if in into is it no not of on or such that the their then there these they ' +
    'this to was will with i me my we our you your he him his she her its what which who whom am were been being ' +
    'have has had do does did from up down out off over under again so than too very can just'
  ).split(' '),
)

const PERFECTIVE_1 = ['вшись', 'вши', 'в']
const PERFECTIVE_2 = ['ившись', 'ывшись', 'ивши', 'ывши', 'ив', 'ыв']
const REFLEXIVE = ['ся', 'сь']
const ADJECTIVE = [
  'ими',
  'ыми',
  'его',
  'ого',
  'ему',
  'ому',
  'ее',
  'ие',
  'ые',
  'ое',
  'ей',
  'ий',
  'ый',
  'ой',
  'ем',
  'им',
  'ым',
  'ом',
  'их',
  'ых',
  'ую',
  'юю',
  'ая',
  'яя',
  'ою',
  'ею',
]
const PARTICIPLE_1 = ['ем', 'нн', 'вш', 'ющ', 'щ']
const PARTICIPLE_2 = ['ивш', 'ывш', 'ующ']
const VERB_1 = ['ешь', 'нно', 'ете', 'йте', 'ла', 'на', 'ли', 'ем', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'й', 'л', 'н']
const VERB_2 = [
  'ейте',
  'уйте',
  'ила',
  'ыла',
  'ена',
  'ите',
  'или',
  'ыли',
  'ило',
  'ыло',
  'ено',
  'ует',
  'уют',
  'ены',
  'ить',
  'ыть',
  'ишь',
  'ей',
  'уй',
  'ил',
  'ыл',
  'им',
  'ым',
  'ен',
  'ят',
  'ит',
  'ыт',
  'ую',
  'ю',
]
const NOUN = [
  'иями',
  'ями',
  'ами',
  'ией',
  'иям',
  'ием',
  'иях',
  'ев',
  'ов',
  'ие',
  'ье',
  'еи',
  'ии',
  'ей',
  'ой',
  'ий',
  'ям',
  'ем',
  'ам',
  'ом',
  'ах',
  'ях',
  'ию',
  'ью',
  'ия',
  'ья',
  'а',
  'е',
  'и',
  'й',
  'о',
  'у',
  'ы',
  'ь',
  'ю',
  'я',
]
const SUPERLATIVE = ['ейше', 'ейш']
const DERIVATIONAL = ['ость', 'ост']

const byLength = (list: string[]) => [...list].sort((a, b) => b.length - a.length)
const SORTED = {
  perfective1: byLength(PERFECTIVE_1),
  perfective2: byLength(PERFECTIVE_2),
  adjective: byLength(ADJECTIVE),
  participle1: byLength(PARTICIPLE_1),
  participle2: byLength(PARTICIPLE_2),
  verb1: byLength(VERB_1),
  verb2: byLength(VERB_2),
  noun: byLength(NOUN),
}

/** The longest ending of `list` the word (from `start`) ends with; `group1` needs а or я before it. */
function ending(word: string, start: number, list: readonly string[], group1 = false): string | null {
  for (const e of list) {
    if (!word.endsWith(e) || word.length - e.length < start) continue
    if (group1) {
      const before = word[word.length - e.length - 1]
      if (word.length - e.length - 1 < start || (before !== 'а' && before !== 'я')) continue
    }
    return e
  }
  return null
}

/** The longest of the two groups' endings (the first group's needs а or я before it). */
function either(word: string, start: number, one: readonly string[], two: readonly string[]): string | null {
  const a = ending(word, start, one, true)
  const b = ending(word, start, two)
  if (a && b) return a.length >= b.length ? a : b
  return a ?? b
}

/** Snowball's Russian stemmer (snowballstem.org/algorithms/russian), as Postgres's `russian_stem`. */
export function stemRussian(input: string): string {
  let word = input.replace(/ё/g, 'е')
  let rv = word.length
  for (let i = 0; i < word.length; i += 1)
    if (VOWELS.includes(word[i])) {
      rv = i + 1
      break
    }
  let r1 = word.length
  for (let i = 1; i < word.length; i += 1)
    if (!VOWELS.includes(word[i]) && VOWELS.includes(word[i - 1])) {
      r1 = i + 1
      break
    }
  let r2 = word.length
  for (let i = r1 + 1; i < word.length; i += 1)
    if (!VOWELS.includes(word[i]) && VOWELS.includes(word[i - 1])) {
      r2 = i + 1
      break
    }
  const cut = (e: string | null) => {
    if (e) word = word.slice(0, word.length - e.length)
    return Boolean(e)
  }

  // Step 1.
  if (!cut(either(word, rv, SORTED.perfective1, SORTED.perfective2))) {
    cut(ending(word, rv, REFLEXIVE))
    const adjective = ending(word, rv, SORTED.adjective)
    if (adjective) {
      cut(adjective)
      cut(either(word, rv, SORTED.participle1, SORTED.participle2))
    } else if (!cut(either(word, rv, SORTED.verb1, SORTED.verb2))) {
      cut(ending(word, rv, SORTED.noun))
    }
  }
  // Step 2.
  if (word.length > rv && word.endsWith('и')) word = word.slice(0, -1)
  // Step 3.
  cut(ending(word, r2, DERIVATIONAL))
  // Step 4.
  if (word.length - 2 >= rv && word.endsWith('нн')) word = word.slice(0, -1)
  else if (cut(ending(word, rv, SUPERLATIVE))) {
    if (word.length - 2 >= rv && word.endsWith('нн')) word = word.slice(0, -1)
  } else if (word.length > rv && word.endsWith('ь')) word = word.slice(0, -1)
  return word
}

const CYRILLIC = /[а-яё]/

/** A word's lexeme, or `null` for a stop word. */
export function lexemeOf(word: string): string | null {
  const lower = word.toLowerCase()
  if (CYRILLIC.test(lower)) {
    const plain = lower.replace(/ё/g, 'е')
    return RUSSIAN_STOP.has(plain) ? null : stemRussian(plain)
  }
  if (ENGLISH_STOP.has(lower)) return null
  return lower
}

const WORD = /[\p{L}\p{N}]+/gu

/** A text's lexemes and their positions, as `to_tsvector('russian', text)`. */
export function toVector(text: string): Map<string, number[]> {
  const vector = new Map<string, number[]>()
  let position = 0
  for (const match of text.matchAll(WORD)) {
    position += 1
    const lexeme = lexemeOf(match[0])
    if (!lexeme) continue
    const list = vector.get(lexeme)
    if (list) list.push(position)
    else vector.set(lexeme, [position])
  }
  return vector
}

/** A query of `websearch_to_tsquery`: the groups joined by `or`, each a list of terms that must all match. */
export type TsQuery = { all: { lexemes: string[]; negated: boolean }[] }[]

/** `websearch_to_tsquery('russian', text)`: `"a phrase"`, `-not`, `or`; the other words all needed. */
export function toQuery(text: string): TsQuery {
  const groups: TsQuery = [{ all: [] }]
  const tokens = text.match(/-?"[^"]*"?|\S+/g) ?? []
  for (const raw of tokens) {
    if (raw.toLowerCase() === 'or') {
      if (groups[groups.length - 1].all.length > 0) groups.push({ all: [] })
      continue
    }
    const negated = raw.startsWith('-')
    const body = negated ? raw.slice(1) : raw
    const lexemes = [...body.matchAll(WORD)].map((m) => lexemeOf(m[0])).filter((l): l is string => l !== null)
    if (lexemes.length === 0) continue
    // A quoted phrase keeps its words in order; an unquoted word split by a hyphen too (`wi-fi`).
    groups[groups.length - 1].all.push({ lexemes, negated })
  }
  return groups.filter((g) => g.all.length > 0)
}

const phraseAt = (vector: Map<string, number[]>, lexemes: readonly string[]) => {
  const first = vector.get(lexemes[0])
  if (!first) return 0
  let count = 0
  for (const p of first) if (lexemes.every((l, i) => vector.get(l)?.includes(p + i))) count += 1
  return count
}

/** `vector @@ query`. */
export function matches(vector: Map<string, number[]>, query: TsQuery): boolean {
  return query.some((group) => group.all.every((term) => phraseAt(vector, term.lexemes) > 0 !== term.negated))
}

/**
 * An approximation of `ts_rank(vector, query)`: of the matching group, the occurrences of each wanted term, each
 * counting less than the one before (`1 - 1/(1 + n)`), over the document's length.
 */
export function rank(vector: Map<string, number[]>, query: TsQuery): number {
  let best = 0
  let size = 0
  for (const positions of vector.values()) size += positions.length
  for (const group of query) {
    let score = 0
    for (const term of group.all) {
      if (term.negated) continue
      const n = phraseAt(vector, term.lexemes)
      score += 1 - 1 / (1 + n)
    }
    best = Math.max(best, score / Math.log2(2 + size))
  }
  return best
}
