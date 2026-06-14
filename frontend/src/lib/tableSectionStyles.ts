/** Blue section titles for hierarchy splits in connection / manufacturing tables. */
export function isBlueSectionTitle(sectionKey: string): boolean {
  const key = sectionKey.startsWith("sec:") ? sectionKey.slice(4) : sectionKey;

  if (key.startsWith("sig:") || key === "_all" || key === "__inline__") {
    return false;
  }
  if (key.startsWith("enc:") || key.startsWith("node:") || key === "__panel__") {
    return true;
  }
  // Vehicle-level section_key is a plain enclosure or node label.
  if (!key.includes(":")) {
    return true;
  }
  return false;
}
