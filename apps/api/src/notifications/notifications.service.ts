import { Injectable, NotFoundException } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string): Promise<object> {
    const [items, counts] = await Promise.all([
      this.database.query<QueryResultRow>(
        `SELECT n.id, n.type, n.booking_id, n.verification_id, n.created_at, n.read_at,
                s.name AS subject_name, tp.display_name AS teacher_name,
                v.type AS verification_type
         FROM notifications n LEFT JOIN bookings b ON b.id = n.booking_id
         LEFT JOIN teacher_subjects ts ON ts.id = b.teacher_subject_id
         LEFT JOIN subjects s ON s.id = ts.subject_id
         LEFT JOIN teacher_profiles tp ON tp.id = b.teacher_profile_id
         LEFT JOIN verifications v ON v.id = n.verification_id
         WHERE n.recipient_user_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT 100`, [userId],
      ),
      this.database.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL", [userId],
      ),
    ]);
    return { unreadCount: counts[0]?.count ?? 0, items: items.map((row) => ({
      id: row.id, type: row.type, bookingId: row.booking_id, verificationId: row.verification_id,
      verificationType: row.verification_type, createdAt: row.created_at,
      readAt: row.read_at, subjectName: row.subject_name, teacherName: row.teacher_name,
    })) };
  }

  async unreadCount(userId: string): Promise<{ unreadCount: number }> {
    const rows = await this.database.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL", [userId],
    );
    return { unreadCount: rows[0]?.count ?? 0 };
  }

  async read(userId: string, id: string): Promise<object> {
    const rows = await this.database.query<{ id: string }>(
      "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_user_id=$2 RETURNING id", [id, userId],
    );
    if (!rows[0]) throw new NotFoundException("通知不存在");
    return { id, read: true };
  }

  async readAll(userId: string): Promise<object> {
    await this.database.query(
      "UPDATE notifications SET read_at=now() WHERE recipient_user_id=$1 AND read_at IS NULL", [userId],
    );
    return { read: true };
  }
}
