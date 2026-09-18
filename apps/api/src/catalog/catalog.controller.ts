import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { CatalogService } from "./catalog.service";

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("subjects")
  subjects(): Promise<unknown[]> {
    return this.catalog.subjects();
  }

  @Get("teachers")
  teachers(@Query("category") categoryValue?: unknown, @Query("subjectId") subjectIdValue?: unknown, @Query("area") areaValue?: unknown): Promise<unknown[]> {
    const category = this.singleValue(categoryValue);
    const subjectId = this.singleValue(subjectIdValue);
    const area = this.singleValue(areaValue);
    if (category && category !== "academic" && category !== "sports") throw new BadRequestException("Invalid category");
    if (subjectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subjectId)) throw new BadRequestException("Invalid subjectId");
    if (area && area.length > 60) throw new BadRequestException("Area is too long");
    return this.catalog.teachers({ category, subjectId, area: area?.trim() });
  }

  @Get("teachers/:id")
  teacher(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.catalog.teacher(id);
  }

  private singleValue(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw new BadRequestException("Invalid filter");
    return value;
  }
}
