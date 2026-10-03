import type { Db } from '@philax/database';
import type { Perspective } from '@philax/types';

export interface CatalogPerspective extends Perspective {
  contrasts: string[];
}

export class PerspectiveRepository {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<CatalogPerspective[]> {
    const { rows } = await this.db.query<CatalogPerspective>(
      `SELECT id, slug, label, description, assumptions, "values", relevant_domains AS "relevantDomains", contrasts
       FROM perspectives ORDER BY slug`,
    );
    return rows;
  }
}
