import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { BadRequestException, Injectable } from "@nestjs/common";

export interface SavedFile {
  kind: "student_proof" | "sports_proof";
  storageKey: string;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
}

@Injectable()
export class PrivateFilesService {
  private readonly root: string;

  constructor() {
    const configured = process.env.PRIVATE_UPLOAD_DIR ?? "./data/private-uploads";
    this.root = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }

  async save(kind: SavedFile["kind"], file: Express.Multer.File): Promise<SavedFile> {
    if (!file || file.size < 1 || file.size > 5 * 1024 * 1024) throw new BadRequestException("证明图片大小需在 5MB 以内");
    const bytes = file.buffer;
    const jpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) throw new BadRequestException("证明材料仅支持 JPG 或 PNG 图片");
    const extension = jpeg ? ".jpg" : ".png";
    const storageKey = `${randomUUID()}${extension}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, storageKey), bytes, { flag: "wx", mode: 0o600 });
    return { kind, storageKey, mimeType: jpeg ? "image/jpeg" : "image/png", byteSize: file.size };
  }

  async remove(storageKey: string): Promise<void> {
    await unlink(join(this.root, storageKey)).catch(() => undefined);
  }

  async read(storageKey: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}\.(jpg|png)$/.test(storageKey)) throw new BadRequestException("文件路径无效");
    return readFile(join(this.root, storageKey));
  }
}
