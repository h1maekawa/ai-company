# Mobile Department Command + KPI

`/ceo/departments/:id`は既存SSOTを読み取るDepartment Control Pageです。対象はCreator、Fund、Operations、Knowledge、Planning、Engineeringです。

各KPIは`value`、`availability`、`source`、`asOf`を持ちます。取得不能・計算不能な値は`UNKNOWN`で、0へ変換しません。集約APIは`/api/company/departments/:id`です。新しい会計、Task、投資SSOTは作成しません。

Directiveは次の境界を通ります。

1. 自然文入力
2. DRAFTと`AI interpretation` Preview
3. Department、Instruction、Priority、Target KPI、External Action、RiskをCEOが確認
4. 人間確認済みの承認POST
5. 既存Manual Missionまたは既存Engineering RequestへRouting

Fund DirectiveはResearch/Analysis Missionのみです。証券注文には接続せず、`HUMAN_ONLY`と`aiExecutionAllowed: false`を維持します。Engineering DirectiveはIssue作成までで、Protected requestはfail closed、merge/deployは行いません。Creator Directiveも公開処理には接続しません。

全Mutationは既存認証middleware、same-origin検査、Idempotency Keyを利用します。Engineering RuntimeのMacBookローカルstateをWebへ公開せず、GitHub等から確認できない値は`UNKNOWN`として表示します。
