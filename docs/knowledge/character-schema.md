# Character Knowledge Schema

Characters are **entities in the database**, not names handed to an LLM (§10).
A debate turn is generated from the entity's documented knowledge, retrieved
evidence and explicit constraints.

## Seed file format (`database/seeds/characters/<slug>.json`)

Validated by `SeedCharacterSchema` (`database/src/seed/schema.ts`) plus
cross-file integrity checks (`validateSeedGraph`).

| Field                                 | Meaning                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`, `name`, `displayName`, `type` | Identity. `type` ∈ philosopher, scientist, writer, economist, thinker, school.                                                                           |
| `birthYear`, `deathYear`              | Negative = BCE. `deathYear` must be `null` iff `representation = contemporary`.                                                                          |
| `era`                                 | Human-readable historical context.                                                                                                                       |
| `representation`                      | `historical` → "simulated reconstruction based on documented works"; `contemporary` → "reconstruction based on publicly documented statements" (§12–13). |
| `domains`                             | Topic areas used for relevance scoring.                                                                                                                  |
| `worldviewSummary`                    | Curated scholarly summary (stored as `scholarly_interpretation`).                                                                                        |
| `biography`                           | Curated biographical facts (stored as `biographical_fact`).                                                                                              |
| `perspectives[]`                      | Links to the perspective catalog with strength 1–3 (3 = paradigmatic).                                                                                   |
| `works[]`                             | Real works; each becomes a `primary` bibliographic source.                                                                                               |
| `concepts[]`                          | Named concepts with a paraphrased description, `work`, `locator`, `kind`.                                                                                |
| `positions[]`                         | Documented positions: paraphrase, `work`, `locator`, `kind`.                                                                                             |
| `relations[]`                         | Directed relations to other seeded characters (opposes, critiques, influenced_by, shares_tradition).                                                     |
| `constraints[]`                       | Explicit rules (never_claim, anachronism, tone, scope).                                                                                                  |

## Epistemic separation (§11)

Every stored piece of knowledge has exactly one `knowledge_kind`:

| Kind                       | Used for                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| `biographical_fact`        | Dates, roles, publications.                                          |
| `documented_position`      | A position the figure explicitly argued in the cited work.           |
| `concept`                  | A concept the figure introduced or used, as found in the cited work. |
| `scholarly_interpretation` | A widely held scholarly reading (e.g. a worldview summary).          |
| `interpretation`           | A curator's interpretation (used sparingly).                         |
| `user_content`             | Text from a user's input or URL. Never treated as instructions.      |

Generated inferences are **never stored as knowledge**. In debates, generated
text is labelled as reconstruction and cites only stored chunks.

## Derived constraints

`impliedConstraints()` (modules/characters) adds rules from the entity itself:
historical figures get an anachronism rule (no knowledge after `deathYear`;
extrapolations must be flagged) and a no-fake-quotation rule; contemporary
figures get a rule forbidding attribution of unpublished views.

## Database tables

`characters`, `works`, `character_concepts`, `character_positions`,
`character_perspectives`, `character_relations`, `character_constraints`, and the
knowledge store `sources` → `source_chunks` → `embeddings`. Each concept and
position row points at the chunk that carries its text (`chunk_id`), so a
citation in a debate resolves to exactly the text the model saw.

## Coverage of the MVP seed (29 figures)

Ancient (Plato, Aristotle, Confucius, Epictetus, Epicurus) · early modern
(Hobbes, Locke, Rousseau, Hume, Kant, Smith, Wollstonecraft) · 19th century
(Mill, Marx, Nietzsche, Kierkegaard, Dostoevsky) · 20th century (Freud,
Heidegger, Sartre, Beauvoir, Arendt, Popper, Kuhn, Hayek, Rawls, Nozick) ·
contemporary (Peter Singer, Amartya Sen). Each was chosen to represent at least
one perspective in the catalog so that genuinely opposed pairings exist across
ethics, politics, economics, science, technology, psychology and literature.
