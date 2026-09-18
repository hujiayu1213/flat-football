import { ConflictException, Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";

interface ProfileRow extends QueryResultRow {
  id: string; display_name: string; status: string; accepting_bookings: boolean;
}

@Injectable()
export class TeacherAvailabilityService {
  constructor(private readonly database: DatabaseService) {}

  async mine(userId: string): Promise<object> {
    const rows = await this.database.query<ProfileRow>(
      "SELECT id, display_name, status, accepting_bookings FROM teacher_profiles WHERE user_id=$1", [userId],
    );
    if (!rows[0] || rows[0].status !== "active") throw new ConflictException("老师资料当前不支持调整接单状态");
    return this.map(rows[0]);
  }

  async update(userId: string, acceptingBookings: boolean): Promise<object> {
    const rows = await this.database.query<ProfileRow>(
      `UPDATE teacher_profiles SET accepting_bookings=$2, updated_at=now()
       WHERE user_id=$1 AND status='active' AND approved_at IS NOT NULL
       RETURNING id, display_name, status, accepting_bookings`, [userId, acceptingBookings],
    );
    if (!rows[0]) throw new ConflictException("老师资料当前不支持调整接单状态");
    return this.map(rows[0]);
  }

  private map(row: ProfileRow): object {
    return { profileId: row.id, displayName: row.display_name, status: row.status,
      acceptingBookings: row.accepting_bookings };
  }
}
