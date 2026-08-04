import { articleBlocks, draftBlocks, postToSlack } from "./blocks";

/**
 * 選ばれたリサーチ候補からX・noteの下書きを作り、Slackへ返す。
 * ボタン操作と会話操作が同じ生成処理を使うための共通サービス。
 */
export async function generateCandidateInBackground(
  clusterId: string,
  kind: "x" | "note" | "both",
  articleType: "free" | "paid",
  destination?: { channel?: string; threadTs?: string },
  authorViewpoint?: { text: string; confirmedByUser: boolean }
): Promise<void> {
  if (!authorViewpoint?.confirmedByUser || !authorViewpoint.text.trim()) {
    await postToSlack(
      "投稿を作る前に、このニュースについての考えを教えてください。本人の考えを確認するまで下書きは生成しません。",
      undefined,
      destination
    );
    return;
  }
  if (!process.env.APP_BASE_URL) {
    await postToSlack("APP_BASE_URL が未設定のため、生成を実行できませんでした。", undefined, destination);
    return;
  }

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

  const cluster = clusters.find((candidate) => candidate.id === clusterId);
  if (!cluster) {
    await postToSlack("その候補が見つかりませんでした。", undefined, destination);
    return;
  }
  if (cluster.blocked) {
    await postToSlack(
      `このテーマは安全基準により下書きを作れません: ${cluster.blockReason ?? "対象外のテーマ"}`,
      undefined,
      destination
    );
    return;
  }

  const clusterItems = items.filter((item) => cluster.researchItemIds.includes(item.id));
  const genreId = cluster.genreIds[0] ?? typesMod.DEFAULT_GENRES[0].id;
  const genre =
    ideaFile.genres.find((item) => item.id === genreId) ??
    typesMod.DEFAULT_GENRES.find((item) => item.id === genreId) ??
    typesMod.DEFAULT_GENRES[0];
  const selected = experienceLib.usableExperiences(experiences, cluster.matchedExperienceIds);
  const pastPosts = drafts.map((draft) => ({
    label: `過去投稿(${draft.id})`,
    text: draft.text,
  }));

  if (kind === "x" || kind === "both") {
    const account =
      typesMod.accountForGenre(brandFile.xAccounts, genre.id) ?? brandFile.xAccounts[0];
    if (!account) {
      await postToSlack("Xアカウントが登録されていないため、X下書きを作れませんでした。", undefined, destination);
    } else {
      const result = await generate.generateXPosts({
        cluster,
        items: clusterItems,
        experiences: selected,
        brand: brandFile.brand,
        genre,
        account,
        purpose: "reach",
        pastPosts,
        authorViewpoint: authorViewpoint.text,
      });
      if (result.drafts.length > 0) {
        await store.saveSocialDrafts([...result.drafts, ...drafts]);
        await postToSlack(
          result.warning
            ? `✅ X投稿案ができました（${result.warning}）`
            : "✅ X投稿案ができました",
          result.drafts.flatMap((draft) => draftBlocks(draft)),
          destination
        );
      } else {
        await postToSlack(
          `X投稿を作れませんでした: ${result.warning ?? "不明なエラー"}`,
          undefined,
          destination
        );
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
      authorViewpoint: authorViewpoint.text,
    });
    if (result.error) {
      await postToSlack(`note記事を作れませんでした: ${result.error}`, undefined, destination);
    } else if (result.article) {
      const queue = await store.loadNoteQueue();
      await store.saveNoteQueue({ ...queue, articles: [result.article, ...queue.articles] });
      const blocks = articleBlocks(result.article);
      if (result.warning) {
        blocks.unshift({
          type: "section",
          text: { type: "mrkdwn", text: `⚠️ ${result.warning}` },
        });
      }
      await postToSlack(
        "✅ note記事の下書きができました。外部公開はせず、確認待ちで保存しています。",
        blocks,
        destination
      );
    }
  }

  await store.saveClusters(
    clusters.map((candidate) =>
      candidate.id === clusterId ? { ...candidate, status: "used" as const } : candidate
    )
  );
}
