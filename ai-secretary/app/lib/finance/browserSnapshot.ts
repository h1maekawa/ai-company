export async function readSnapshot(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "ログインの有効期限が切れました。再ログインしてください" : "Flow+から最新値を取得できません");
  const value = await response.json();
  if (!value || typeof value.stale !== "boolean" || !("data" in value)) throw new Error("Flow+の応答形式が不正です");
  return value;
}
