import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { LocalStorageService } from "./localStorage";
import { getObjectAclPolicy, ObjectPermission } from "./objectAcl";
import { createHmac } from "crypto";
import path from "path";
import { getIntegrationEnv } from "../../services/integration-runtime";

// Object/upload routes live outside the `/api/` prefix, so they are not covered
// by the global API limiter — guard file serving against scraping/DoS here.
const fileServeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

function isObjectStorageAvailable(): boolean {
  return !!(getIntegrationEnv("PRIVATE_OBJECT_DIR") && getIntegrationEnv("PUBLIC_OBJECT_SEARCH_PATHS"));
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

function resolveRequestBaseUrl(req: Request): string {
  const origin = req.get("origin");
  if (origin && origin !== "null") {
    return origin.replace(/\/$/, "");
  }

  const referer = req.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
    }
  }

  return `${req.protocol}://${req.get("host")}`;
}

export function registerObjectStorageRoutes(app: Express): void {
  if (isObjectStorageAvailable()) {
    registerCloudRoutes(app);
  } else {
    registerLocalRoutes(app);
  }
}

function validateUploadRequest(
  req: Request,
  res: Response,
): { name: string; size?: number; contentType?: string } | null {
  const { name, size, contentType } = req.body;

  if (!name) {
    res.status(400).json({
      error: "Missing required field: name",
    });
    return null;
  }

  return { name, size, contentType };
}

function registerCloudRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  const handleCloudUploadUrlRequest = async (req: Request, res: Response) => {
    try {
      const uploadRequest = validateUploadRequest(req, res);
      if (!uploadRequest) {
        return;
      }
      const { name, size, contentType } = uploadRequest;

      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({
          error: `File type '${ext}' is not allowed. Allowed types: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
        });
      }
      if (size && size > MAX_UPLOAD_BYTES) {
        return res.status(400).json({
          error: `File size exceeds maximum allowed size of ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`,
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
  };

  app.post("/api/uploads/request-url", requireAuthenticated, handleCloudUploadUrlRequest);
  app.post("/api/public/uploads/request-url", handleCloudUploadUrlRequest);

  app.get("/objects/:objectPath(*)", fileServeLimiter, async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      // Access control: public objects are served freely; everything else
      // requires an authenticated session. When the object carries an ACL
      // policy we enforce it, otherwise authenticated access is allowed for
      // legacy objects uploaded before ACL metadata existed.
      const aclPolicy = await getObjectAclPolicy(objectFile);
      const isPublicRead = aclPolicy?.visibility === "public";
      if (!isPublicRead) {
        const userId = req.session?.userId;
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        if (aclPolicy) {
          const allowed = await objectStorageService.canAccessObjectEntity({
            userId,
            objectFile,
            requestedPermission: ObjectPermission.READ,
          });
          if (!allowed) {
            return res.status(403).json({ error: "Forbidden" });
          }
        }
      }

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
// Advisory cap enforced at upload-URL request time for the cloud path (the
// actual PUT goes straight to the bucket, so this blocks oversized/typed
// requests up front rather than guaranteeing a hard server-side limit).
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function registerLocalRoutes(app: Express): void {
  const localStorageService = new LocalStorageService();
  localStorageService.initialize().catch(console.error);
  const maxFileSize = localStorageService.getMaxFileSize();

  const handleLocalUploadUrlRequest = async (req: Request, res: Response) => {
    try {
      const uploadRequest = validateUploadRequest(req, res);
      if (!uploadRequest) {
        return;
      }
      const { name, size, contentType } = uploadRequest;

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

      const baseUrl = resolveRequestBaseUrl(req);
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
  };

  app.post("/api/uploads/request-url", requireAuthenticated, handleLocalUploadUrlRequest);
  app.post("/api/public/uploads/request-url", handleLocalUploadUrlRequest);

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

  app.get("/uploads/:fileName", fileServeLimiter, requireAuthenticated, async (req, res) => {
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
