import { verifySlackRequest } from "@/app/lib/integrations/slack/verify";
import { ACTIONS, draftBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";
import { claimOnce } from "@/app/lib/note/publishing/queue";
import {
  loadClusters,
  loadSocialDrafts,
  saveClusters,
  saveSocialDrafts,
} from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SlackAction = { action_id?: string; value?: string };
type SlackPayload = {
  user?: { id?: string; name?: string };
  actions?: SlackAction[];
  response_url?: string;
  trigger_id?: string;
};

function ok(text: string): Response {
  return new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
  });
}

/** ボタン押下を受ける。二度押しは idempotency key で1回に潰す */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const verified = await verifySlackRequest(
    raw,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature")
  );
  if (!verified.ok) {
    return new Response(JSON.stringify({ error: verified.reason }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = new URLSearchParams(raw);
  let payload: SlackPayload;
  try {
    payload = JSON.parse(params.get("payload") ?? "{}") as SlackPayload;
  } catch {
    return ok("操作を解釈できませんでした");
  }

  const action = payload.actions?.[0];
  if (!action?.action_id || !action.value) return ok("操作が読み取れませんでした");

  const actionId = action.action_id;
  const value = action.value;
  const user = payload.user?.name ?? payload.user?.id ?? "unknown";

  // 同じボタンの二度押しで二重に走らせない
  if (!(await claimOnce(`slack:${actionId}:${value}:${user}`))) {
    return ok("この操作は既に受け付けています。");
  }

  try {
    switch (actionId) {
      case ACTIONS.skip: {
        const clusters = await loadClusters();
        await saveClusters(
          clusters.map((c) => (c.id === value ? { ...c, status: "rejected" as const } : c))
        );
        return ok("この候補を見送りにしました。");
      }

      case ACTIONS.addExperience:
        return ok(
          "体験を追加してください: Note事業部 → 体験ライブラリ から登録できます。\n登録後に `/maemichi candidates` を実行すると、体験が紐づいた状態で再評価されます。"
        );

      case ACTIONS.makeX:
      case ACTIONS.makeFreeNote:
      case ACTIONS.makePaidNote:
      case ACTIONS.makeBoth: {
        const kind =
          actionId === ACTIONS.makeX
            ? "x"
            : actionId === ACTIONS.makeBoth
              ? "both"
              : "note";
        const articleType = actionId === ACTIONS.makePaidNote ? "paid" : "free";

        // 生成は時間がかかるので、先に応答してから裏で走らせる
        void generateInBackground(value, kind, articleType).catch((error) =>
          console.error("[slack/actions] 生成失敗:", error)
        );
        return ok("作成を開始しました。できたらこのチャンネルへ送ります。");
      }

      case ACTIONS.discard: {
        const drafts = await loadSocialDrafts();
        await saveSocialDrafts(
          drafts.map((d) =>
            d.id === value ? { ...d, status: "discarded" as const, updatedAt: new Date().toISOString() } : d
          )
        );
        return ok("下書きを削除しました。");
      }

      case ACTIONS.removeLink: {
        const drafts = await loadSocialDrafts();
        await saveSocialDrafts(
          drafts.map((d) =>
            d.id === value
              ? {
                  ...d,
                  text: d.text.replace(/https?:\/\/\S+/g, "").replace(/\[PR\]\s*/g, "").trim(),
                  urls: [],
                  affiliateId: undefined,
                  needsDisclosure: false,
                  updatedAt: new Date().toISOString(),
                }
              : d
          )
        );
        return ok("リンクとPR表記を外しました。");
      }

      case ACTIONS.bufferQueue:
      case ACTIONS.bufferNow:
      case ACTIONS.bufferSchedule:
        return ok(
          "Bufferへの送信はNote事業部の投稿キュー画面から実行してください（安全確認のため、Slackからの即時投稿は無効にしています）。"
        );

      case ACTIONS.moreConcrete:
      case ACTIONS.moreMaemichi:
      case ACTIONS.regenerate:
        return ok("作り直しはNote事業部の画面から行えます。");

      case ACTIONS.noteFinalize:
        return ok("note記事の確定は、価格と有料境界を確認したうえで画面から行ってください。");

      default:
        return ok("未対応の操作です。");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "処理に失敗しました";
    console.error("[slack/actions] 失敗:", error);
    return ok(`エラー: ${message}`);
  }
}

/** 生成して結果をSlackへ返す */
async function generateInBackground(
  clusterId: string,
  kind: "x" | "note" | "both",
  articleType: "free" | "paid"
): Promise<void> {
  const base = process.env.APP_BASE_URL;
  if (!base) {
    await postToSlack("APP_BASE_URL が未設定のため、生成を実行できませんでした。");
    return;
  }

  // 内部APIを叩くのではなく、直接ライブラリを呼ぶ方が安全なため動的importで実行する
  const [{ loadAffiliates, loadBrand, loadIdeas }, store, generate, experienceLib, typesMod] =
    await Promise.all([
      import("@/app/lib/note/store"),
      import("@/app/lib/note/research/store"),
      import("@/app/lib/note/research/generate"),
      import("@/app/lib/note/research/experience"),
      import("@/app/lib/note/types"),
    ]);

  const [clusters, items, experiences, brandFile, ideaFile, drafts] = await Promise.all([
    store.loadClusters(),
    store.loadResearchInbox(),
    store.loadExperiences(),
    loadBrand(),
    loadIdeas(),
    store.loadSocialDrafts(),
  ]);
  await loadAffiliates();

  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) {
    await postToSlack("その候補が見つかりませんでした。");
    return;
  }

  const clusterItems = items.filter((i) => cluster.researchItemIds.includes(i.id));
  const genreId = cluster.genreIds[0] ?? typesMod.DEFAULT_GENRES[0].id;
  const genre =
    ideaFile.genres.find((g) => g.id === genreId) ??
    typesMod.DEFAULT_GENRES.find((g) => g.id === genreId) ??
    typesMod.DEFAULT_GENRES[0];
  const selected = experienceLib.usableExperiences(experiences, cluster.matchedExperienceIds);
  const pastPosts = drafts.map((d) => ({ label: `過去投稿(${d.id})`, text: d.text }));

  if (kind === "x" || kind === "both") {
    const account =
      typesMod.accountForGenre(brandFile.xAccounts, genre.id) ?? brandFile.xAccounts[0];
    if (account) {
      const result = await generate.generateXPosts({
        cluster,
        items: clusterItems,
        experiences: selected,
        brand: brandFile.brand,
        genre,
        account,
        purpose: "reach",
        pastPosts,
      });
      if (result.drafts.length > 0) {
        await store.saveSocialDrafts([...result.drafts, ...drafts]);
        await postToSlack(
          result.warning ? `X投稿案ができました（${result.warning}）` : "X投稿案ができました",
          result.drafts.flatMap((d) => draftBlocks(d))
        );
      } else {
        await postToSlack(`X投稿を作れませんでした: ${result.warning ?? "不明なエラー"}`);
      }
    }
  }

  if (kind === "note" || kind === "both") {
    const result = await generate.generateNoteArticle({
      cluster,
      items: clusterItems,
      experiences: selected,
      brand: brandFile.brand,
      genre,
      articleType,
      pastPosts,
    });
    if (result.error) {
      await postToSlack(`note記事を作れませんでした: ${result.error}`);
    } else if (result.article) {
      const queue = await store.loadNoteQueue();
      await store.saveNoteQueue({ ...queue, articles: [result.article, ...queue.articles] });
      await postToSlack(
        [
          `note記事の下書きができました（${result.article.articleType}）`,
          `*${result.article.title}*`,
          result.warning ? `注意: ${result.warning}` : "",
          "価格と公開はNote事業部の画面から確認してください。",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  await store.saveClusters(
    clusters.map((c) => (c.id === clusterId ? { ...c, status: "used" as const } : c))
  );
}
