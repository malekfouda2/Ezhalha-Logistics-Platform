import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export class LocalStorageService {
  private uploadDir: string;
  private initialized: boolean = false;

  constructor() {
    this.uploadDir = path.resolve(UPLOAD_DIR);
  }

  async initialize(): Promise<void> {
    await ensureDir(this.uploadDir);
    this.initialized = true;
  }

  async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  getMaxFileSize(): number {
    return MAX_FILE_SIZE;
  }

  async reserveFile(originalName: string): Promise<{ objectPath: string; fileName: string }> {
    await this.ensureReady();
    const ext = path.extname(originalName) || "";
    const fileName = `${randomUUID()}${ext}`;
    const objectPath = `/uploads/${fileName}`;
    return { objectPath, fileName };
  }

  async writeFile(fileName: string, data: Buffer): Promise<void> {
    await this.ensureReady();
    const safeName = path.basename(fileName);
    const filePath = path.join(this.uploadDir, safeName);
    await fs.writeFile(filePath, data);
  }

  async cleanupFile(fileName: string): Promise<void> {
    try {
      const safeName = path.basename(fileName);
      const filePath = path.join(this.uploadDir, safeName);
      await fs.unlink(filePath);
    } catch {
    }
  }

  async getFile(fileName: string): Promise<{ data: Buffer; filePath: string } | null> {
    await this.ensureReady();
    const safeName = path.basename(fileName);
    const filePath = path.join(this.uploadDir, safeName);
    try {
      const data = await fs.readFile(filePath);
      return { data, filePath };
    } catch {
      return null;
    }
  }
}
