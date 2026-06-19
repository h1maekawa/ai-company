import { Octokit } from "@octokit/rest";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";

const octokit = new Octokit({
  auth: GITHUB_TOKEN || undefined,
});

export async function getFileContent(path: string): Promise<{ content: string; sha: string | null }> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path,
    });

    if (Array.isArray(data)) {
      throw new Error(`Path "${path}" is a directory, not a file.`);
    }

    if ("content" in data && data.encoding === "base64") {
      const decodedContent = Buffer.from(data.content, "base64").toString("utf-8");
      return { content: decodedContent, sha: data.sha };
    }

    return { content: "", sha: null };
  } catch (error: any) {
    if (error.status === 404) {
      return { content: "", sha: null };
    }
    throw error;
  }
}

export async function updateFileContent(
  path: string,
  content: string,
  message: string,
  sha: string | null
): Promise<void> {
  const contentBase64 = Buffer.from(content, "utf-8").toString("base64");

  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    message,
    content: contentBase64,
    sha: sha || undefined,
  });
}
