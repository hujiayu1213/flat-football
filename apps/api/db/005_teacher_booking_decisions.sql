BEGIN;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS teacher_response_note varchar(500);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS responded_at timestamptz;

COMMIT;
