import type { Express, Request, Response, NextFunction } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { LocalStorageService } from "./localStorage";
import { createHmac } from "crypto";
import path from "path";

function isObjectStorageAvailable(): boolean {
  return !!(process.env.PRIVATE_OBJECT_DIR && process.env.PUBLIC_OBJECT_SEARCH_PATHS);
}

function requireAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || process.env.UPLOAD_SIGNING_SECRET || "fallback-upload-secret";
}

function signUploadToken(fileName: string, expiresAt: number): string {
  const payload = `${fileName}:${expiresAt}`;
  const hmac = createHmac("sha256", getSigningSecret());
  hmac.update(payload);
  return hmac.digest("hex");
}

function verifyUploadToken(fileName: string, expiresAt: number, token: string): boolean {
  if (Date.now() > expiresAt) {
    return false;
  }
  const expected = signUploadToken(fileName, expiresAt);
  return expected === token;
}

export function registerObjectStorageRoutes(app: Express): void {
  if (isObjectStorageAvailable()) {
    registerCloudRoutes(app);
  } else {
    registerLocalRoutes(app);
  }
}

function registerCloudRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_MAP));

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function registerLocalRoutes(app: Express): void {
  const localStorageService = new LocalStorageService();
  localStorageService.initialize().catch(console.error);
  const maxFileSize = localStorageService.getMaxFileSize();

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({
          error: `File type '${ext}' is not allowed. Allowed types: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
        });
      }

      if (size && size > maxFileSize) {
        return res.status(400).json({
          error: `File size exceeds maximum allowed size of ${maxFileSize / (1024 * 1024)}MB`,
        });
      }

      const result = await localStorageService.reserveFile(name);

      const expiresAt = Date.now() + 15 * 60 * 1000;
      const token = signUploadToken(result.fileName, expiresAt);

      const appUrl = process.env.APP_URL;
      const baseUrl = appUrl
        ? appUrl.replace(/\/$/, "")
        : `${req.protocol}://${req.get("host")}`;
      const uploadURL = `${baseUrl}/api/uploads/direct/${result.fileName}?token=${token}&expires=${expiresAt}`;

      res.json({
        uploadURL,
        objectPath: result.objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.put("/api/uploads/direct/:fileName", async (req, res) => {
    try {
      const fileName = req.params.fileName;
      const token = req.query.token as string;
      const expires = parseInt(req.query.expires as string, 10);

      if (!token || !expires || !verifyUploadToken(fileName, expires, token)) {
        return res.status(403).json({ error: "Upload not authorized or expired" });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxFileSize) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", async () => {
        try {
          if (totalSize > maxFileSize) {
            await localStorageService.cleanupFile(fileName);
            return res.status(413).json({ error: "File too large" });
          }

          const fileData = Buffer.concat(chunks);
          await localStorageService.writeFile(fileName, fileData);
          res.status(200).json({ success: true });
        } catch (error) {
          console.error("Error saving uploaded file:", error);
          res.status(500).json({ error: "Failed to save file" });
        }
      });

      req.on("error", async () => {
        await localStorageService.cleanupFile(fileName);
      });
    } catch (error) {
      console.error("Error handling upload:", error);
      res.status(500).json({ error: "Failed to handle upload" });
    }
  });

  app.get("/uploads/:fileName", requireAuthenticated, async (req, res) => {
    try {
      const result = await localStorageService.getFile(req.params.fileName);
      if (!result) {
        return res.status(404).json({ error: "File not found" });
      }

      const contentType = getMimeType(req.params.fileName);

      res.set("Content-Type", contentType);
      res.set("Content-Length", String(result.data.length));
      res.send(result.data);
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });
}
