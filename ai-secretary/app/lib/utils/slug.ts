/**
 * Formats a string to a safe URL-friendly / file-system-friendly slug.
 * Removes spaces, non-alphanumeric symbols, and converts to lowercase.
 */
export function toSlug(text: string): string {
  if (!text) return "untitled";

  let slug = text
    .trim()
    .toLowerCase()
    // Replace spaces (both half and full width) and underscores with hyphens
    .replace(/[\s_　]+/g, "-")
    // Strip characters that are not alphanumeric or hyphens
    // This enforces clean English slugs as requested by the title-slug requirement
    .replace(/[^a-z0-9\-]/g, "")
    // Deduplicate consecutive hyphens
    .replace(/-+/g, "-")
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, "");

  // Fallback if the slug becomes empty (e.g., input was pure Japanese and translation failed)
  if (!slug) {
    slug = "item";
  }

  return slug;
}
