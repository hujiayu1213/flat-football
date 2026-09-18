import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TeacherProfileController } from "./teacher-profile.controller";
import { TeacherProfileService } from "./teacher-profile.service";
import { PrivateFilesService } from "../teacher-application/private-files.service";

@Module({ imports: [AuthModule, DatabaseModule], controllers: [TeacherProfileController], providers: [TeacherProfileService, PrivateFilesService] })
export class TeacherProfileModule {}
