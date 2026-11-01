import type { Pool } from 'pg';
import type { AreaDto } from '../../shared/api-types.js';

export async function listAreas(pool: Pool): Promise<AreaDto[]> {
  const { rows } = await pool.query<AreaDto>(
    'select id, name, sort_order as "sortOrder" from areas order by sort_order asc'
  );

  return rows;
}
