import { ShopWeaverError } from "../errors.js";

export function parseDriveFolderId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ShopWeaverError("DRIVE_FOLDER_ID_INVALID", "Google Drive folder URL or ID is required.");
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/folders\/([^/]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    return trimmed;
  }
  return trimmed;
}
