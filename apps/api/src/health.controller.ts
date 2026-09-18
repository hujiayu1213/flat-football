import { Controller, Get } from "@nestjs/common";
import { DatabaseService } from "./database/database.service";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  status(): { status: string } {
    return { status: "ok" };
  }

  @Get("database")
  async databaseStatus(): Promise<{ status: string }> {
    await this.database.checkConnection();
    return { status: "ok" };
  }
}
