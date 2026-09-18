BEGIN;

ALTER TABLE bookings ADD COLUMN completed_at timestamptz;
UPDATE bookings SET completed_at=updated_at WHERE status='completed' AND completed_at IS NULL;
ALTER TABLE bookings ADD CONSTRAINT bookings_completed_at_check
  CHECK ((status = 'completed') = (completed_at IS NOT NULL));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('booking_requested', 'booking_cancelled', 'booking_confirmed',
                 'booking_declined', 'booking_teacher_cancelled', 'booking_completed',
                 'verification_approved', 'verification_changes_requested', 'verification_rejected'));

COMMIT;
