// Mirrors web's DOCUMENT_MIME_BY_EXTENSION / normalizeTradeDocumentContentType (create-shipment.tsx).
// expo-document-picker can report an empty/generic mimeType (e.g. "application/octet-stream")
// for files picked from some providers, so fall back to the file extension.
const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

export function normalizeTradeDocumentContentType(contentType: string | undefined, fileName: string): string {
  const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized && normalized !== "application/octet-stream") {
    return normalized;
  }

  const extension = getFileExtension(fileName);
  return DOCUMENT_MIME_BY_EXTENSION[extension] || "application/octet-stream";
}
