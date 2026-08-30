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

  const uploadFile = async (file: {
    uri: string;
    name: string;
    type: string;
    size: number;
  }): Promise<UploadResponse | null> => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);

      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/api/uploads`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || body?.message || "Upload failed");
      }

      const data = (await response.json()) as UploadResponse;
      return data;
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Upload failed"));
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadFile, isUploading };
}