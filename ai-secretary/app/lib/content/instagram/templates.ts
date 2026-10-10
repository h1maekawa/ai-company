import type { InstagramSlideRole } from "./creativeSpec";

export type InstagramCreativeTemplateId =
  | "product-hero"
  | "three-picks"
  | "five-picks"
  | "comparison"
  | "ranking"
  | "how-to-choose"
  | "personal-pick"
  | "lifestyle";

export type InstagramCreativeTemplate = {
  id: InstagramCreativeTemplateId;
  name: string;
  slideRoles: InstagramSlideRole[];
};

export const INSTAGRAM_CREATIVE_TEMPLATES: readonly InstagramCreativeTemplate[] = [
  { id: "product-hero", name: "Product Hero", slideRoles: ["cover", "product", "reason", "summary", "cta"] },
  { id: "three-picks", name: "3 Picks", slideRoles: ["cover", "product", "product", "product", "summary", "cta"] },
  { id: "five-picks", name: "5 Picks", slideRoles: ["cover", "product", "product", "product", "product", "product", "summary", "cta"] },
  { id: "comparison", name: "Comparison", slideRoles: ["cover", "context", "comparison", "recommendation", "summary", "cta"] },
  { id: "ranking", name: "Ranking", slideRoles: ["cover", "context", "product", "product", "product", "summary", "cta"] },
  { id: "how-to-choose", name: "How to Choose", slideRoles: ["cover", "context", "how-to-choose", "recommendation", "summary", "cta"] },
  { id: "personal-pick", name: "Personal Pick", slideRoles: ["cover", "context", "reason", "recommendation", "summary", "cta"] },
  { id: "lifestyle", name: "Lifestyle", slideRoles: ["cover", "context", "recommendation", "summary", "cta"] },
] as const;

export function instagramCreativeTemplate(id: InstagramCreativeTemplateId): InstagramCreativeTemplate {
  const template = INSTAGRAM_CREATIVE_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown Instagram template: ${id}`);
  return template;
}
