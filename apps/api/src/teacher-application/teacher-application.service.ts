import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";
import { PrivateFilesService, SavedFile } from "./private-files.service";
import { ApplicationInput } from "./teacher-application.types";

interface SubjectRow extends QueryResultRow { id: string; category: "academic" | "sports"; service_key: string }
interface ProfileRow extends QueryResultRow { id: string; status: string }
interface ApplicationRow extends QueryResultRow {
  profile_id: string;
  profile_status: string;
  verification_id: string | null;
  verification_status: string | null;
  submitted_at: Date | null;
  review_note: string | null;
  submitted_snapshot: ApplicationInput | null;
}

@Injectable()
export class TeacherApplicationService {
  constructor(private readonly database: DatabaseService, private readonly files: PrivateFilesService) {}

  async mine(userId: string): Promise<object> {
    const rows = await this.database.query<ApplicationRow>(
      `SELECT tp.id AS profile_id, tp.status AS profile_status,
              v.id AS verification_id, v.status AS verification_status,
              v.submitted_at, v.review_note, v.submitted_snapshot
       FROM teacher_profiles tp
       LEFT JOIN LATERAL (
         SELECT id, status, submitted_at, review_note, submitted_snapshot
         FROM verifications WHERE teacher_profile_id = tp.id AND type = 'initial'
         ORDER BY submitted_at DESC, id DESC LIMIT 1
       ) v ON true
       WHERE tp.user_id = $1`, [userId],
    );
    if (!rows[0]) return { status: "not_started" };
    const row = rows[0];
    return {
      status: row.verification_status ?? row.profile_status,
      verificationId: row.verification_id,
      submittedAt: row.submitted_at,
      reviewNote: row.review_note,
      application: row.submitted_snapshot,
    };
  }

  async submit(userId: string, input: ApplicationInput, studentProof: Express.Multer.File, sportsProof?: Express.Multer.File): Promise<object> {
    const saved: SavedFile[] = [];
    try {
      saved.push(await this.files.save("student_proof", studentProof));
      if (sportsProof) saved.push(await this.files.save("sports_proof", sportsProof));
      return await this.database.transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
        const subjectIds = input.offerings.map((offering) => offering.subjectId);
        const subjects = (await client.query<SubjectRow>(
          "SELECT id, category, service_key FROM subjects WHERE id = ANY($1::uuid[]) AND status = 'active' AND service_key IS NOT NULL", [subjectIds],
        )).rows;
        if (subjects.length !== subjectIds.length) throw new BadRequestException("请选择有效的教学项目");
        const categories = new Map(subjects.map((subject) => [subject.id, subject.category]));
        const hasSports = subjects.some((subject) => subject.category === "sports");
        if (subjects.some((subject) => subject.service_key === "tutoring") && input.academicStrengths.length < 2) {
          throw new BadRequestException("请选择家教服务时请填写擅长科目");
        }
        if (hasSports && input.sportsExperience.length < 10) throw new BadRequestException("请填写至少 10 字的运动经历");
        if (!hasSports && sportsProof) throw new BadRequestException("未选择体育项目时无需上传体育资质证明");
        for (const offering of input.offerings) {
          if (categories.get(offering.subjectId) === "sports" && !offering.venueRequirements) {
            throw new BadRequestException("体育课程需要填写场地与装备要求");
          }
        }

        const existing = (await client.query<ProfileRow>(
          "SELECT id, status FROM teacher_profiles WHERE user_id = $1 FOR UPDATE", [userId],
        )).rows[0];
        if (existing && (existing.status === "active" || existing.status === "paused")) {
          throw new ConflictException("已通过审核的老师资料暂不支持在此重新申请");
        }
        if (existing) {
          const pending = await client.query("SELECT 1 FROM verifications WHERE teacher_profile_id = $1 AND status = 'submitted'", [existing.id]);
          if (pending.rowCount) throw new ConflictException("申请正在审核中，请勿重复提交");
        }
        let profileId = existing?.id;
        if (profileId) {
          await client.query(
            `UPDATE teacher_profiles SET display_name=$2, school=$3, grade=$4, education_level=$5,
             academic_strengths=$6, service_area=$7, bio=$8, experience=$9, sports_experience=$10,
             status='pending', accepting_bookings=false, updated_at=now()
             WHERE id=$1`,
            [profileId, input.displayName, input.school, input.grade, input.educationLevel,
              input.academicStrengths, input.serviceArea, input.bio, input.experience, input.sportsExperience],
          );
        } else {
          profileId = (await client.query<{ id: string } & QueryResultRow>(
            `INSERT INTO teacher_profiles (user_id, display_name, school, grade, education_level,
             academic_strengths, service_area, bio, experience, sports_experience)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [userId, input.displayName, input.school, input.grade, input.educationLevel,
              input.academicStrengths, input.serviceArea, input.bio, input.experience, input.sportsExperience],
          )).rows[0].id;
        }
        const verificationId = (await client.query<{ id: string } & QueryResultRow>(
          `INSERT INTO verifications (teacher_profile_id, type, status, submitted_snapshot)
           VALUES ($1, 'initial', 'submitted', $2::jsonb) RETURNING id`, [profileId, JSON.stringify(input)],
        )).rows[0].id;
        for (const file of saved) {
          await client.query(
            `INSERT INTO verification_files (verification_id, kind, storage_key, mime_type, byte_size)
             VALUES ($1,$2,$3,$4,$5)`,
            [verificationId, file.kind, file.storageKey, file.mimeType, file.byteSize],
          );
        }
        return { status: "submitted", verificationId };
      });
    } catch (error) {
      await Promise.all(saved.map((file) => this.files.remove(file.storageKey)));
      throw error;
    }
  }
}
