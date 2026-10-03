# Source Policy

1. **No invented sources or citations (§14–16, §58).** Every citation shown in a
   debate resolves to a stored `source_chunks` row in that debate's evidence pool.
   Turns citing anything else are rejected and regenerated.
2. **Priority:** primary sources → academic sources → high-quality secondary
   sources → reliable publications. `source_type` records which.
3. **Seed sources are bibliographic.** The MVP seed references real works by
   author, title and original publication year. URLs are deliberately omitted
   because they could not be verified when the seed was written (ADR-009). The UI
   says "Bibliographic reference (no verified link yet)" instead of showing a
   fabricated link.
4. **Paraphrase, not quotation.** Seed knowledge is paraphrased and labelled as
   such in the UI. Direct quotations may only be added by a curator who has
   checked the exact wording against an edition, recorded in `locator`.
5. **Locators are optional but must be correct.** When a chapter or section was
   not certain, the locator is `null` rather than guessed.
6. **Curated profiles.** Biographies and worldview summaries are attached to a
   per-figure source titled "Philax curated profile", type `secondary`, with a
   note that claims are pending citation verification. This is honest
   provenance, not a claim of external publication.
7. **User-provided content** (text and URLs) is stored as a private
   `user-provided` source owned by the user, deleted with their debate or account,
   and never retrievable by other users (enforced in the retrieval SQL).
8. **Untrusted content.** Retrieved and user text is always passed to models as
   delimited data, never as instructions (see `docs/ai/architecture.md`).
9. **Curation workflow.** Edit JSON under `database/seeds`, run `pnpm db:seed`
   (validated, idempotent; changed chunks are retired, not deleted) and, if
   embeddings are configured, `pnpm knowledge:index`.
