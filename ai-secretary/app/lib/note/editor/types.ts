export type ReviewDestination = "x" | "note" | "both";

export type ReviewPurpose =
  | "awareness"
  | "experience"
  | "howto"
  | "product"
  | "values";

export type ReviewStrength = "light" | "structure" | "rewrite";

export type ReviewScore = {
  brandFit: number;
  usefulness: number;
  originality: number;
  readability: number;
  reliability: number;
  total: number;
};

export type LocalAiReviewInput = {
  destination: ReviewDestination;
  purpose: ReviewPurpose;
  originalText: string;
  strength: ReviewStrength;
  keepExpressions: string[];
  additionalFacts: string[];
  requestedBy: string;
};

export type LocalAiReviewResult = {
  revisedText: string;
  xText?: string;
  noteText?: string;
  changes: string[];
  questions: string[];
  score: ReviewScore;
  preservedExpressions: string[];
};

export type LocalAiReviewJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "adopted"
  | "rejected";

export type LocalAiReviewJob = {
  id: string;
  status: LocalAiReviewJobStatus;
  input: LocalAiReviewInput;
  result?: LocalAiReviewResult;
  errorCode?: string;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  claimToken?: string;
  claimedBy?: string;
  claimExpiresAt?: string;
  completedAt?: string;
  adoptedAt?: string;
  rejectedAt?: string;
};

