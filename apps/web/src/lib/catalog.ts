export interface Subject {
  id: string;
  name: string;
  category: "academic" | "sports";
  service_key: "flag_football" | "tutoring";
}

export interface Offering {
  id: string;
  subjectId: string;
  subjectName: string;
  category: "academic" | "sports";
  serviceKey: "flag_football" | "tutoring";
  priceCents: number;
  durationMinutes: number;
  venueRequirements: string | null;
  guardianRequired: boolean;
}

export interface Teacher {
  id: string;
  displayName: string;
  school: string;
  grade: string;
  educationLevel: string;
  academicStrengths: string;
  sportsExperience: string;
  serviceArea: string;
  bio: string;
  offerings: Offering[];
}

const apiBase = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export class CatalogRequestError extends Error {
  constructor(readonly status: number) {
    super(`Catalog request failed: ${status}`);
  }
}

export async function getCatalog<T>(path: string): Promise<T> {
  const response = await fetch(new URL(`/api/${path}`, apiBase), { cache: "no-store" });
  if (!response.ok) throw new CatalogRequestError(response.status);
  return response.json() as Promise<T>;
}
