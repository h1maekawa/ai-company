export type PiroWorkflow = "research" | "content" | "x" | "full";

export type PiroRunInput = {
  workflow: PiroWorkflow;
  topic: string;
  audience?: string;
  context?: string;
};

export type PiroArtifact = {
  kind: "research" | "content" | "x";
  path: string;
  markdown: string;
};

export type PiroRunResult = {
  workflow: PiroWorkflow;
  topic: string;
  artifacts: PiroArtifact[];
};
