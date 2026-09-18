import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";
import { PrivateFilesService, SavedFile } from "../teacher-application/private-files.service";
import { OfferingInput } from "../teacher-application/teacher-application.types";

export interface ProfileChangeInput { serviceArea: string; bio: string }
export interface OfferingChangeInput { offerings: OfferingInput[]; sportsExperience: string; academicStrengths: string }
interface ProfileRow extends QueryResultRow {
  id: string; display_name: string; service_area: string; bio: string; sports_experience: string;
  academic_strengths: string;
  status: string; approved_at: Date | null;
}
interface VerificationRow extends QueryResultRow {
  id: string; status: string; review_note: string | null; submitted_at: Date;
  submitted_snapshot: ProfileChangeInput;
}
interface OfferingRow extends QueryResultRow {
  subject_id: string; subject_name: string; category: "academic" | "sports"; status: string;
  price_cents: number; duration_minutes: number; age_range: string;
  venue_requirements: string | null; guardian_required: boolean;
}

@Injectable()
export class TeacherProfileService {
  constructor(private readonly database: DatabaseService, private readonly files: PrivateFilesService) {}

  async mine(userId: string): Promise<object> {
    const profiles = await this.database.query<ProfileRow>(
      "SELECT id, display_name, service_area, bio, status, approved_at FROM teacher_profiles WHERE user_id=$1", [userId],
    );
    const profile = profiles[0];
    if (!profile || profile.status !== "active" || !profile.approved_at) throw new ConflictException("老师资料当前不可修改");
    const changes = await this.database.query<VerificationRow>(
      `SELECT id, status, review_note, submitted_at, submitted_snapshot
       FROM verifications WHERE teacher_profile_id=$1 AND type='profile_change'
       ORDER BY submitted_at DESC, id DESC LIMIT 1`, [profile.id],
    );
    const latest = changes[0];
    return { profileId: profile.id, displayName: profile.display_name,
      serviceArea: profile.service_area, bio: profile.bio,
      latestChange: latest ? { id: latest.id, status: latest.status, reviewNote: latest.review_note,
        submittedAt: latest.submitted_at, proposed: latest.submitted_snapshot } : null };
  }

  async submit(userId: string, input: ProfileChangeInput): Promise<object> {
    return this.database.transaction(async (client) => {
      const profile = (await client.query<ProfileRow>(
        "SELECT id, service_area, bio, status, approved_at FROM teacher_profiles WHERE user_id=$1 FOR UPDATE", [userId],
      )).rows[0];
      if (!profile || profile.status !== "active" || !profile.approved_at) throw new ConflictException("老师资料当前不可修改");
      const pending = await client.query("SELECT 1 FROM verifications WHERE teacher_profile_id=$1 AND status='submitted'", [profile.id]);
      if (pending.rowCount) throw new ConflictException("已有资料正在审核，请等待结果");
      if (profile.service_area === input.serviceArea && profile.bio === input.bio) throw new ConflictException("资料没有变化");
      const result = await client.query<{ id: string }>(
        `INSERT INTO verifications (teacher_profile_id, type, status, submitted_snapshot)
         VALUES ($1,'profile_change','submitted',$2::jsonb) RETURNING id`,
        [profile.id, JSON.stringify(input)],
      );
      return { verificationId: result.rows[0].id, status: "submitted" };
    });
  }

  async myOfferings(userId: string): Promise<object> {
    const profiles = await this.database.query<ProfileRow>(
      "SELECT id, display_name, sports_experience, academic_strengths, status, approved_at FROM teacher_profiles WHERE user_id=$1", [userId],
    );
    const profile = profiles[0];
    if (!profile || profile.status !== "active" || !profile.approved_at) throw new ConflictException("老师资料当前不可修改");
    const [rows, changes] = await Promise.all([
      this.database.query<OfferingRow>(
        `SELECT ts.subject_id, s.name AS subject_name, s.category, s.status,
                ts.price_cents, ts.duration_minutes, ts.age_range, ts.venue_requirements, ts.guardian_required
         FROM teacher_subjects ts JOIN subjects s ON s.id=ts.subject_id
         WHERE ts.teacher_profile_id=$1 AND ts.status='active' AND s.service_key IS NOT NULL
         ORDER BY CASE WHEN s.service_key='flag_football' THEN 0 ELSE 1 END`, [profile.id],
      ),
      this.database.query<VerificationRow>(
        `SELECT id, status, review_note, submitted_at, submitted_snapshot FROM verifications
         WHERE teacher_profile_id=$1 AND type='qualification_change'
         ORDER BY submitted_at DESC, id DESC LIMIT 1`, [profile.id],
      ),
    ]);
    return { displayName: profile.display_name, sportsExperience: profile.sports_experience,
      academicStrengths: profile.academic_strengths,
      offerings: rows.map((row) => ({ subjectId: row.subject_id, subjectName: row.subject_name,
        category: row.category, subjectStatus: row.status, priceCents: row.price_cents,
        durationMinutes: row.duration_minutes, ageRange: row.age_range,
        venueRequirements: row.venue_requirements ?? "", guardianRequired: row.guardian_required })),
      latestChange: changes[0] ? { id: changes[0].id, status: changes[0].status,
        reviewNote: changes[0].review_note, submittedAt: changes[0].submitted_at,
        proposed: changes[0].submitted_snapshot } : null };
  }

  async submitOfferings(userId: string, input: OfferingChangeInput, sportsProof?: Express.Multer.File): Promise<object> {
    const saved: SavedFile[] = [];
    try {
      if (sportsProof) saved.push(await this.files.save("sports_proof", sportsProof));
      return await this.database.transaction(async (client) => {
        const profile = (await client.query<ProfileRow>(
          "SELECT id, status, approved_at, sports_experience, academic_strengths FROM teacher_profiles WHERE user_id=$1 FOR UPDATE", [userId],
        )).rows[0];
        if (!profile || profile.status !== "active" || !profile.approved_at) throw new ConflictException("老师资料当前不可修改");
        const pending = await client.query("SELECT 1 FROM verifications WHERE teacher_profile_id=$1 AND status='submitted'", [profile.id]);
        if (pending.rowCount) throw new ConflictException("已有资料正在审核，请等待结果");
        const ids = input.offerings.map((offering) => offering.subjectId);
        const subjects = (await client.query<{ id: string; category: string; service_key: string }>(
          "SELECT id, category, service_key FROM subjects WHERE id=ANY($1::uuid[]) AND status='active' AND service_key IS NOT NULL", [ids],
        )).rows;
        if (subjects.length !== ids.length) throw new BadRequestException("请选择有效的教学项目");
        const categories = new Map(subjects.map((subject) => [subject.id, subject.category]));
        const hasSports = input.offerings.some((offering) => categories.get(offering.subjectId) === "sports");
        if (subjects.some((subject) => subject.service_key === "tutoring") && input.academicStrengths.length < 2) {
          throw new BadRequestException("选择家教服务时请填写擅长科目");
        }
        if (hasSports && input.sportsExperience.length < 10) throw new BadRequestException("体育课程需填写至少 10 字的运动经历");
        if (!hasSports && sportsProof) throw new BadRequestException("未选择体育项目时无需上传体育证明");
        for (const offering of input.offerings) {
          if (categories.get(offering.subjectId) === "sports" && !offering.venueRequirements) {
            throw new BadRequestException("体育课程需要填写场地与装备要求");
          }
        }
        const current = (await client.query<OfferingRow>(
          `SELECT subject_id, price_cents, duration_minutes, age_range, venue_requirements, guardian_required
           FROM teacher_subjects WHERE teacher_profile_id=$1 AND status='active'`, [profile.id],
        )).rows;
        const normalized = (offerings: OfferingInput[]) => JSON.stringify(offerings.map((item) => ({
          subjectId: item.subjectId, priceCents: item.priceCents, durationMinutes: item.durationMinutes,
          ageRange: item.ageRange, venueRequirements: item.venueRequirements || "", guardianRequired: item.guardianRequired,
        })).sort((a, b) => a.subjectId.localeCompare(b.subjectId)));
        const active = current.map((row) => ({ subjectId: row.subject_id, priceCents: row.price_cents,
          durationMinutes: row.duration_minutes, ageRange: row.age_range,
          venueRequirements: row.venue_requirements ?? "", guardianRequired: row.guardian_required }));
        if (normalized(active) === normalized(input.offerings) && input.sportsExperience === profile.sports_experience
          && input.academicStrengths === profile.academic_strengths) {
          throw new ConflictException("课程资料没有变化");
        }
        const result = await client.query<{ id: string }>(
          `INSERT INTO verifications (teacher_profile_id, type, status, submitted_snapshot)
           VALUES ($1,'qualification_change','submitted',$2::jsonb) RETURNING id`,
          [profile.id, JSON.stringify(input)],
        );
        for (const file of saved) {
          await client.query(
            `INSERT INTO verification_files (verification_id, kind, storage_key, mime_type, byte_size)
             VALUES ($1,$2,$3,$4,$5)`, [result.rows[0].id, file.kind, file.storageKey, file.mimeType, file.byteSize],
          );
        }
        return { verificationId: result.rows[0].id, status: "submitted" };
      });
    } catch (error) {
      await Promise.all(saved.map((file) => this.files.remove(file.storageKey)));
      throw error;
    }
  }
}
