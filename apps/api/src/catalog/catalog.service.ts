import { Injectable, NotFoundException } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";

interface SubjectRow extends QueryResultRow {
  id: string;
  name: string;
  category: "academic" | "sports";
  service_key: "flag_football" | "tutoring";
}

interface TeacherRow extends QueryResultRow {
  id: string;
  display_name: string;
  school: string;
  grade: string;
  education_level: string;
  academic_strengths: string;
  sports_experience: string;
  service_area: string;
  bio: string;
  offerings: unknown;
}

const teacherSelect = `
  SELECT tp.id, tp.display_name, tp.school, tp.grade, tp.education_level,
         tp.academic_strengths, tp.sports_experience, tp.service_area, tp.bio,
    json_agg(json_build_object(
      'id', ts.id, 'subjectId', s.id, 'subjectName', s.name,
      'category', s.category, 'serviceKey', s.service_key, 'priceCents', ts.price_cents,
      'durationMinutes', ts.duration_minutes,
      'venueRequirements', ts.venue_requirements,
      'guardianRequired', ts.guardian_required
    ) ORDER BY CASE WHEN s.service_key='flag_football' THEN 0 ELSE 1 END) AS offerings
  FROM teacher_profiles tp
  JOIN users u ON u.id = tp.user_id AND u.status = 'active'
  JOIN teacher_subjects ts ON ts.teacher_profile_id = tp.id AND ts.status = 'active'
  JOIN subjects s ON s.id = ts.subject_id AND s.status = 'active' AND s.service_key IS NOT NULL
  WHERE tp.status = 'active' AND tp.accepting_bookings = true AND tp.approved_at IS NOT NULL
`;

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}

  subjects(): Promise<SubjectRow[]> {
    return this.database.query<SubjectRow>(
      `SELECT id, name, category, service_key FROM subjects
       WHERE status='active' AND service_key IS NOT NULL
       ORDER BY CASE WHEN service_key='flag_football' THEN 0 ELSE 1 END`,
    );
  }

  async teachers(filters: { category?: string; subjectId?: string; area?: string }): Promise<unknown[]> {
    const rows = await this.database.query<TeacherRow>(
      `${teacherSelect}
       AND ($1::text IS NULL OR s.category = $1)
       AND ($2::uuid IS NULL OR s.id = $2)
       AND ($3::text IS NULL OR strpos(lower(tp.service_area), lower($3)) > 0)
       GROUP BY tp.id
       ORDER BY bool_or(s.service_key='flag_football') DESC, tp.approved_at DESC, tp.id
       LIMIT 50`,
      [filters.category || null, filters.subjectId || null, filters.area || null],
    );
    return rows.map(this.mapTeacher);
  }

  async teacher(id: string): Promise<unknown> {
    const rows = await this.database.query<TeacherRow>(
      `${teacherSelect} AND tp.id = $1 GROUP BY tp.id`, [id],
    );
    if (!rows.length) throw new NotFoundException("Teacher not found");
    return this.mapTeacher(rows[0]);
  }

  private mapTeacher(row: TeacherRow): object {
    return {
      id: row.id,
      displayName: row.display_name,
      school: row.school,
      grade: row.grade,
      educationLevel: row.education_level,
      academicStrengths: row.academic_strengths,
      sportsExperience: row.sports_experience,
      serviceArea: row.service_area,
      bio: row.bio,
      offerings: row.offerings,
    };
  }
}
