import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TeacherAvailabilityController } from "./teacher-availability.controller";
import { TeacherAvailabilityService } from "./teacher-availability.service";

@Module({ imports: [AuthModule, DatabaseModule], controllers: [TeacherAvailabilityController], providers: [TeacherAvailabilityService] })
export class TeacherAvailabilityModule {}
