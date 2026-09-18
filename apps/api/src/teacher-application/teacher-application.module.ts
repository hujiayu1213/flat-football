import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrivateFilesService } from "./private-files.service";
import { TeacherApplicationController } from "./teacher-application.controller";
import { TeacherApplicationService } from "./teacher-application.service";

@Module({ imports: [AuthModule], controllers: [TeacherApplicationController], providers: [TeacherApplicationService, PrivateFilesService] })
export class TeacherApplicationModule {}
