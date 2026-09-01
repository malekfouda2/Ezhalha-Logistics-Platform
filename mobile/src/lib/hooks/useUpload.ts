// hooks/useUpload.ts
import { useState } from "react";
import { api, API_BASE_URL } from "@/api/client";
import { getAccessToken } from "@/api/tokens";

export interface UploadedFileMetadata {
  name: string;
  contentType: string;
  size: number;
}

export interface UploadResponse {
  objectPath: string;
  metadata: UploadedFileMetadata;
}

interface UseUploadOptions {
  onError?: (error: Error) => void;
}

export function useUpload({ onError }: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);

  // Mirrors web's two-step presigned-URL flow (client/src/hooks/use-upload.ts):
  // request an upload URL for the metadata, then PUT the file bytes to it directly.
  const uploadFile = async (file: {
    uri: string;
    name: string;
    type: string;
    size: number;
  }): Promise<UploadResponse | null> => {
    setIsUploading(true);
    try {
      const token = getAccessToken();

      const requestUrlResponse = await fetch(`${API_BASE_URL}/api/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!requestUrlResponse.ok) {
        const body = await requestUrlResponse.json().catch(() => ({}));
        throw new Error(body?.error || body?.message || "Failed to get upload URL");
      }

      const { uploadURL, objectPath, metadata } = (await requestUrlResponse.json()) as {
        uploadURL: string;
        objectPath: string;
        metadata: UploadedFileMetadata;
      };

      const fileBlob = await (await fetch(file.uri)).blob();
      const putResponse = await fetch(uploadURL, {
        method: "PUT",
        body: fileBlob,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!putResponse.ok) {
        throw new Error("Failed to upload file to storage");
      }

      return { objectPath, metadata };
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Upload failed"));
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadFile, isUploading };
}