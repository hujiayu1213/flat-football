import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrivateFilesService } from "../teacher-application/private-files.service";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminSubjectsService } from "./admin-subjects.service";

@Module({ imports: [AuthModule], controllers: [AdminController], providers: [AdminService, AdminSubjectsService, PrivateFilesService] })
export class AdminModule {}
