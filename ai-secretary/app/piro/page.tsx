import { redirect } from "next/navigation";

/**
 * Creator Workflow は Note事業部 (/note) へ統合済み。
 * 既存のブックマーク・ホーム画面アイコンから来た場合のために転送する。
 */
export default function LegacyCreatorRedirectPage() {
  redirect("/note");
}
