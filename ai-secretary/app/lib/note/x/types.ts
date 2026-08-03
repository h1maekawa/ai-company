export type OwnedXPost = {
  id: string;
  accountId: string;
  text: string;
  url?: string;
  postedAt?: string;
  source: "ai-secretary" | "manual" | "x-archive";
  genreIds: string[];
  verifiedByUser: boolean;
  finalTextConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type XReferenceNote = {
  id: string;
  accountId?: string;
  postUrl: string;
  excerpt?: string;
  reason: string;
  hookPattern?: string;
  structurePattern?: string;
  emotionalAngle?: string;
  readerProblem?: string;
  ctaPattern?: string;
  createdAt: string;
};

export type XWorkspaceData = {
  ownedPosts: OwnedXPost[];
  referenceNotes: XReferenceNote[];
};
