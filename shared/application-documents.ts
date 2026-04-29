export const COMPANY_APPLICATION_DOCUMENTS = [
  { type: "TAX_CERTIFICATE", label: "Tax Certificate" },
  { type: "COMMERCIAL_REGISTRATION", label: "Commercial Registration" },
  { type: "ESTABLISHMENT_CONTRACT", label: "Establishment Contract" },
  { type: "DIRECTOR_ID", label: "Director ID" },
] as const;

export type CompanyApplicationDocumentType =
  typeof COMPANY_APPLICATION_DOCUMENTS[number]["type"];

export interface ApplicationDocumentReference {
  path: string;
  name?: string | null;
  type?: CompanyApplicationDocumentType | null;
  label?: string | null;
}

const COMPANY_APPLICATION_DOCUMENT_LABELS = new Map(
  COMPANY_APPLICATION_DOCUMENTS.map((document) => [document.type, document.label] as const),
);

function fallbackDocumentName(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] || "Document";
}

export function getCompanyApplicationDocumentLabel(
  type: CompanyApplicationDocumentType,
): string {
  return COMPANY_APPLICATION_DOCUMENT_LABELS.get(type) || "Document";
}

export function serializeApplicationDocumentReference(
  document: ApplicationDocumentReference,
): string {
  return JSON.stringify({
    path: document.path,
    name: document.name || fallbackDocumentName(document.path),
    type: document.type || null,
    label:
      document.label ||
      (document.type ? getCompanyApplicationDocumentLabel(document.type) : "Document"),
  });
}

export function parseApplicationDocumentReference(
  rawValue: string,
): ApplicationDocumentReference {
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === "object" && typeof parsed.path === "string") {
      const type =
        typeof parsed.type === "string" &&
        COMPANY_APPLICATION_DOCUMENT_LABELS.has(parsed.type as CompanyApplicationDocumentType)
          ? (parsed.type as CompanyApplicationDocumentType)
          : null;

      return {
        path: parsed.path,
        name:
          typeof parsed.name === "string" && parsed.name.trim().length > 0
            ? parsed.name
            : fallbackDocumentName(parsed.path),
        type,
        label:
          typeof parsed.label === "string" && parsed.label.trim().length > 0
            ? parsed.label
            : type
              ? getCompanyApplicationDocumentLabel(type)
              : "Document",
      };
    }
  } catch {
    // Fall back to legacy path-only document references.
  }

  return {
    path: rawValue,
    name: fallbackDocumentName(rawValue),
    type: null,
    label: "Document",
  };
}

export function getMissingCompanyApplicationDocumentTypes(
  rawDocuments: string[] | null | undefined,
): CompanyApplicationDocumentType[] {
  const documentTypes = new Set(
    (rawDocuments || [])
      .map((document) => parseApplicationDocumentReference(document).type)
      .filter((type): type is CompanyApplicationDocumentType => Boolean(type)),
  );

  return COMPANY_APPLICATION_DOCUMENTS.map((document) => document.type).filter(
    (type) => !documentTypes.has(type),
  );
}
