import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./database/database.module";
import { CatalogModule } from "./catalog/catalog.module";
import { AuthModule } from "./auth/auth.module";
import { TeacherApplicationModule } from "./teacher-application/teacher-application.module";
import { AdminModule } from "./admin/admin.module";
import { BookingsModule } from "./bookings/bookings.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { TeacherAvailabilityModule } from "./teacher-availability/teacher-availability.module";
import { TeacherProfileModule } from "./teacher-profile/teacher-profile.module";

@Module({ imports: [DatabaseModule, CatalogModule, AuthModule, TeacherApplicationModule, AdminModule, BookingsModule, NotificationsModule, TeacherAvailabilityModule, TeacherProfileModule], controllers: [HealthController] })
export class AppModule {}
