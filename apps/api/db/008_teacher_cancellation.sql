BEGIN;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by varchar(16);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason varchar(500);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
UPDATE bookings SET cancelled_by='parent', cancelled_at=updated_at
WHERE status='cancelled' AND cancelled_by IS NULL;
ALTER TABLE bookings ADD CONSTRAINT bookings_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('parent', 'teacher'));
ALTER TABLE bookings ADD CONSTRAINT bookings_cancelled_actor_check
  CHECK (status <> 'cancelled' OR cancelled_by IS NOT NULL);

ALTER TABLE notifications ALTER COLUMN type TYPE varchar(32);
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('booking_requested', 'booking_cancelled', 'booking_confirmed',
                 'booking_declined', 'booking_teacher_cancelled'));

COMMIT;
