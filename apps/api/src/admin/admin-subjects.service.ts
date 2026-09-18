import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";

interface SubjectRow extends QueryResultRow {
  id: string; name: string; category: "academic" | "sports";
  status: "active" | "hidden"; sort_order: number; teacher_count: number;
}

@Injectable()
export class AdminSubjectsService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<object[]> {
    const rows = await this.database.query<SubjectRow>(
      `SELECT s.id, s.name, s.category, s.status, s.sort_order,
              count(DISTINCT tp.id)::int AS teacher_count
       FROM subjects s
       LEFT JOIN teacher_subjects ts ON ts.subject_id = s.id AND ts.status = 'active'
       LEFT JOIN teacher_profiles tp ON tp.id = ts.teacher_profile_id
         AND tp.status = 'active' AND tp.accepting_bookings = true
       WHERE s.service_key IS NOT NULL
       GROUP BY s.id ORDER BY CASE WHEN s.service_key = 'flag_football' THEN 0 ELSE 1 END, s.sort_order, s.name`,
    );
    return rows.map((row) => ({ id: row.id, name: row.name, category: row.category,
      status: row.status, sortOrder: row.sort_order, teacherCount: row.teacher_count }));
  }

  async create(input: { name: string; category: "academic" | "sports"; sortOrder: number }): Promise<object> {
    void input;
    throw new ConflictException("当前只开放腰旗橄榄球和学科家教两项服务");
  }

  async setStatus(id: string, status: "active" | "hidden"): Promise<object> {
    const rows = await this.database.query<SubjectRow>(
      "UPDATE subjects SET status=$2 WHERE id=$1 AND service_key IS NOT NULL RETURNING id, name, category, status, sort_order", [id, status],
    );
    if (!rows[0]) throw new NotFoundException("教学项目不存在");
    const row = rows[0];
    return { id: row.id, name: row.name, category: row.category, status: row.status, sortOrder: row.sort_order };
  }
}
