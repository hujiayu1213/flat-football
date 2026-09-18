import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({ imports: [AuthModule, DatabaseModule], controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
