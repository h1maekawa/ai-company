/**
 * 検出のしきい値 — v3.1 Phase 3 §6
 *
 * ハードコードを各検出器へ散らさず、ここ1か所で管理する。
 * 実データが溜まった後にここだけを調整すれば効きが変わる。
 *
 * 初期値は要件書の基準どおり。実運用の数字を見て調整する前提の値であり、
 * 「正しい値」ではなく「安全側に倒した出発点」として置いている。
 */

export type EvolutionThresholds = {
  /** 観測窓（日） */
  windowDays: number;
  /** 部署提案だけは長い窓で見る（重い提案なので短期の揺れで出さない） */
  departmentWindowDays: number;

  repeatedTask: { candidate: number; strong: number };
  skillCandidate: { minOccurrences: number; minDistinctTasks: number };
  workflowCandidate: { minSequences: number; minSteps: number };

  newAgent: {
    /** 同一専門カテゴリの最小タスク数 */
    minTasksInCategory: number;
    /** 既存AI社員の業務に占める割合（0〜1） */
    minShareOfAgent: number;
    /** そのカテゴリでの人の修正率（0〜1） */
    highCorrectionRate: number;
  };
  agentSplit: {
    /** 1人が抱える異なる専門領域の数 */
    minDistinctOperations: number;
    minTasks: number;
  };
  agentMerge: {
    /** 窓内のタスクがこれ以下なら統合候補 */
    maxTasks: number;
  };
  newDepartment: {
    /** 同一ドメインに必要なAgent候補数 */
    minAgentCandidates: number;
    /** 30日あたりのタスク量 */
    minTaskVolume: number;
  };

  bottleneck: {
    /** 特定AI社員へのタスク集中（0〜1） */
    concentrationShare: number;
    /** 失敗率（0〜1） */
    failureRate: number;
    /** 再試行率（0〜1） */
    retryRate: number;
    /** 平均処理時間が全体平均の何倍で異常とみなすか */
    latencyMultiplier: number;
    /** 窓内のAPIコスト（USD） */
    apiCostUsd: number;
  };

  humanIntervention: {
    /** 本来不要な人の修正率（0〜1）。承認は含めない */
    highRate: number;
    /** この件数未満は率を計算しない（分母が小さいと率が暴れる） */
    minCompletedTasks: number;
  };

  /** これ未満のサンプル数ではCEOへ提案しない（§1 Shadow Mode） */
  minimumSampleSize: number;
  /** イベント総数がこれ未満なら分析自体を INSUFFICIENT_DATA にする */
  minimumEventsForAnalysis: number;
};

export function defaultThresholds(): EvolutionThresholds {
  return {
    windowDays: 14,
    departmentWindowDays: 30,

    repeatedTask: { candidate: 3, strong: 5 },
    skillCandidate: { minOccurrences: 3, minDistinctTasks: 2 },
    workflowCandidate: { minSequences: 3, minSteps: 2 },

    newAgent: {
      minTasksInCategory: 5,
      minShareOfAgent: 0.3,
      highCorrectionRate: 0.15,
    },
    agentSplit: { minDistinctOperations: 3, minTasks: 10 },
    agentMerge: { maxTasks: 2 },
    newDepartment: { minAgentCandidates: 2, minTaskVolume: 15 },

    bottleneck: {
      concentrationShare: 0.4,
      failureRate: 0.2,
      retryRate: 0.2,
      latencyMultiplier: 1.5,
      apiCostUsd: 50,
    },

    humanIntervention: { highRate: 0.2, minCompletedTasks: 5 },

    minimumSampleSize: 3,
    minimumEventsForAnalysis: 20,
  };
}
