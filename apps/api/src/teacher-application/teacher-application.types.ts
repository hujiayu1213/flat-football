import { BadRequestException } from "@nestjs/common";

export interface OfferingInput {
  subjectId: string;
  priceCents: number;
  durationMinutes: number;
  ageRange: string;
  venueRequirements: string;
  guardianRequired: boolean;
}

export interface ApplicationInput {
  displayName: string;
  school: string;
  grade: string;
  educationLevel: string;
  academicStrengths: string;
  serviceArea: string;
  bio: string;
  experience: string;
  sportsExperience: string;
  offerings: OfferingInput[];
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${label}不能为空且不能超过 ${max} 字`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) throw new BadRequestException(`${label}不能超过 ${max} 字`);
  return value.trim();
}

export function parseApplication(value: unknown): ApplicationInput {
  let parsed: unknown;
  try { parsed = JSON.parse(requiredText(value, "申请资料", 20_000)); }
  catch { throw new BadRequestException("申请资料格式无效"); }
  if (!parsed || typeof parsed !== "object") throw new BadRequestException("申请资料格式无效");
  const data = parsed as Record<string, unknown>;
  const offerings = parseOfferings(data.offerings);
  const educationLevel = requiredText(data.educationLevel, "学历阶段", 32);
  if (!["大专在读", "本科在读", "硕士在读", "博士在读"].includes(educationLevel)) {
    throw new BadRequestException("请选择学历阶段");
  }
  return {
    displayName: requiredText(data.displayName, "展示名称", 80),
    school: requiredText(data.school, "学校", 120),
    grade: requiredText(data.grade, "年级", 40),
    educationLevel,
    academicStrengths: optionalText(data.academicStrengths, "擅长科目", 240),
    serviceArea: requiredText(data.serviceArea, "服务区域", 120),
    bio: requiredText(data.bio, "自我介绍", 1000),
    experience: requiredText(data.experience, "教学经历", 1000),
    sportsExperience: optionalText(data.sportsExperience, "运动经历", 1000),
    offerings,
  };
}

export function parseOfferings(value: unknown): OfferingInput[] {
  const data = value;
  if (!Array.isArray(data) || data.length < 1 || data.length > 2) {
    throw new BadRequestException("请选择腰旗橄榄球或学科家教，最多两种服务");
  }
  const seen = new Set<string>();
  const offerings = data.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new BadRequestException("教学项目格式无效");
    const row = item as Record<string, unknown>;
    const subjectId = requiredText(row.subjectId, "教学项目", 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subjectId) || seen.has(subjectId)) {
      throw new BadRequestException("教学项目重复或无效");
    }
    seen.add(subjectId);
    if (!Number.isInteger(row.priceCents) || (row.priceCents as number) < 1000 || (row.priceCents as number) > 200000) {
      throw new BadRequestException("单次价格需在 10 至 2000 元之间");
    }
    if (!Number.isInteger(row.durationMinutes) || (row.durationMinutes as number) < 30 || (row.durationMinutes as number) > 180) {
      throw new BadRequestException("课程时长需在 30 至 180 分钟之间");
    }
    if (typeof row.guardianRequired !== "boolean") throw new BadRequestException("家长陪同要求无效");
    return {
      subjectId,
      priceCents: row.priceCents as number,
      durationMinutes: row.durationMinutes as number,
      ageRange: optionalText(row.ageRange, "适合年龄", 60),
      venueRequirements: optionalText(row.venueRequirements, "场地与装备要求", 500),
      guardianRequired: row.guardianRequired,
    };
  });
  return offerings;
}
