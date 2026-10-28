const sheetIdPattern = /^[A-Za-z0-9-_]{20,}$/;

export function parseSheetId(urlOrId: string) {
  const value = urlOrId.trim();
  if (!value) return null;
  const fromUrl = value.match(/\/spreadsheets\/d\/([A-Za-z0-9-_]+)/);
  if (fromUrl?.[1] && sheetIdPattern.test(fromUrl[1])) return fromUrl[1];
  if (!value.includes("/") && sheetIdPattern.test(value)) return value;
  return null;
}
