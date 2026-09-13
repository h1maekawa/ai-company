/**
 * Canary の Review 契約 — Phase 10-A の回帰防止
 *
 * Canary はモデルへ `{"ack":"CANARY_OK","message":"..."}` を求める。
 * Quality Review は expectedOutputs を「成果物に literal で含まれるか」で見るため、
 * ここへモデルが実際に返す語を置かないと、何を返しても WARN になり Canary が永久に失敗する。
 * （Production Canary の初回実行がこれで FAIL した。）
 *
 * objective も同じ理由で、モデル出力に現れる語を含める必要がある。
 * quality.alignment は case-sensitive な substring 判定のため、
 * 大文字の "CANARY_OK" をそのまま置く。
 *
 * reviewer.ts と同様、この module は依存を持たない。テストから直接読めるようにするため。
 */

/** モデルへ要求する ack 値。schema 検証と Review の両方がこれを見る */
export const CANARY_ACK = "CANARY_OK";

/** Quality Review へ渡す目的。出力に現れる語を含めること */
export const CANARY_OBJECTIVE = `${CANARY_ACK} acknowledgement`;

/** Quality Review が literal 一致で探す項目 */
export const CANARY_EXPECTED_OUTPUTS = [CANARY_ACK];

/** Security Review へ渡す外部内容。Canary は合成データしか使わない */
export const CANARY_EXTERNAL_CONTEXT = "Synthetic canary data.";
