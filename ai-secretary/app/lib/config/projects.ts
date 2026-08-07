export type CompanyType = "personal" | "company" | "crestix";

export type Project = {
  id: string;
  name: string;
  company: CompanyType;
  priority: "S" | "A" | "B";
  description?: string;
};

export const PROJECTS: Project[] = [
  {
    id: "P001",
    name: "maemichi コンテンツスタジオ",
    company: "personal",
    priority: "S",
    description: "話題を見つけ、本人の考えを加え、確認できる下書きと学習へつなげるコンテンツ事業"
  },
  {
    id: "P002",
    name: "投資資産形成",
    company: "personal",
    priority: "A",
    description: "NISA・高配当株・個別株による長期資産形成"
  },
  {
    id: "C001",
    name: "AI Company OS",
    company: "company",
    priority: "S",
    description: "AI秘書OSの開発・運用・改善"
  }
];

export function getProjectsByCompany(company: CompanyType): Project[] {
  return PROJECTS.filter(p => p.company === company);
}

export function getProjectById(id: string): Project | undefined {
  return PROJECTS.find(p => p.id === id);
}
