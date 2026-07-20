# Part 6
# Piro Creator OS MVP Development Plan

更新日：
2026-07-19

対象：
Piro Creator OS


---

# 1. Development Philosophy


## 開発目的


Piro Creator OSの開発目的は、

「高度なAIシステムを作ること」

ではない。


目的は、

> 前川弘行自身の情報収集・思考整理・発信・収益化を高速化する個人用AI経営基盤を作ること。


---

# Development Principle


Piro Creator OSでは以下を重視する。


```

Simple

↓

Useful

↓

Repeatable

↓

Automated

↓

Scalable

```


---

# Avoid


初期段階では以下を作らない。


- 完全自動コンテンツ生成
- 完全自動SNS投稿
- 大規模SaaS
- 複雑な管理画面
- 不要なデータベース化


理由：

最初に必要なのは、

「使われる仕組み」

であり、

「技術的にすごいシステム」

ではないため。


---

# 2. MVP Definition


## MVP Goal


3ヶ月以内に、

以下を実現する。


```

情報収集

↓

AI分析

↓

知識保存

↓

記事制作

↓

SNS投稿

↓

結果分析

```


を一連の流れとして動かす。


---

# MVP Scope


## Core Functions


### 1.

Knowledge Management


### 2.

AI Research Assistant


### 3.

Content Creation Assistant


### 4.

SNS Creation Assistant


### 5.

Basic Analytics


---

# MVP完成イメージ


```

情報

↓

Obsidian

↓

AI Agent

↓

Markdown生成

↓

note / X投稿

↓

分析

↓

改善

```


---

# 3. Feature Priority


## Priority A

# 必須機能


---

# Feature 1

## Obsidian Knowledge System


目的：

Piro Creator OSの記憶。


機能：

- Folder管理
- Template管理
- Metadata管理
- Tag管理


完成条件：

情報を蓄積できる。


---

# Feature 2

## AI Research Agent


目的：

市場調査を高速化。


入力：

```

テーマ
キーワード
URL

```


処理：

```

情報収集

↓

要約

↓

分析

↓

Markdown化

```


出力：

```

Research_Report.md

```


---

# Feature 3

## Content Planning Agent


目的：

記事企画支援。


処理：

```

市場情報

↓

読者課題分析

↓

記事テーマ生成

↓

優先順位決定

```


出力：

```

Content_Idea.md

```


---

# Feature 4

## Writing Assistant


目的：

記事制作時間短縮。


機能：

- Outline生成
- Draft作成
- SEO改善
- タイトル生成


---

# Feature 5

## X Post Generator


目的：

SNS運用効率化。


入力：

```

記事URL

↓

要約

↓

投稿案生成

```


出力：

```

X_Posts.md

```


---

# Priority B

# 追加機能


---

## Analytics Dashboard


管理：

- 投稿数
- PV
- CTR
- Revenue


---

## Content Database


管理：

- 記事一覧
- 状態
- 成果


---

## Revenue Tracker


管理：

- Affiliate
- Product
- Sales


---

# Priority C

# 将来機能


---

## AI Secretary


個人秘書AI。


機能：

- タスク管理
- スケジュール
- リマインド


---

## Multi Agent System


複数AI協調。


例：

```

Research Agent

↓

Writer Agent

↓

Marketing Agent

↓

Revenue Agent

```


---

## SaaS化


外部提供。


---

# 4. Initial System Architecture


## MVP Architecture


```text
             User

              |

              |

          Obsidian

              |

              |

      Python Automation

              |

              |

          AI API

              |

              |

      Generated Markdown

              |

              |

      Content Platform
```


---

# 5. Repository Structure


推奨Git構成。


```

Piro_Creator_OS

├ README.md

├ docs

│
├ vault

│
├ agents

│
├ scripts

│
├ prompts

│
├ data

│
├ dashboard

│
└ config

```


---

# Directory Definition


## vault


Obsidian管理。


保存：

- Knowledge
- Content
- Research


---

## agents


AI Agentコード。


例：

```

research_agent.py

content_agent.py

analytics_agent.py

```


---

## scripts


自動化。


例：

```

create_note.py

generate_article.py

export_report.py

```


---

## prompts


AI指示管理。


保存：

- System Prompt
- Agent Prompt
- Template


---

# 6. Claude Code Development Specification


## Claude Code Role


Claude Codeは、

Piro Creator OSの開発エンジニア。


担当：

- コード生成
- ファイル構成
- 自動化
- API連携
- Debug


---

# Claude Code Development Rule


## Rule 1


小さく作る。


```

One Feature

↓

Test

↓

Improve

```


---

## Rule 2


すべてMarkdown中心。


理由：

AIが理解しやすい。


---

## Rule 3


人間判断を残す。


AI：

- 提案
- 整理
- 生成


人間：

- 選択
- 判断
- 公開


---

# 7. First Automation Features


## Automation 1

# Markdown Generator


目的：

メモ作成高速化。


Input：

```

Title

Category

Content

```


Output：

```

Formatted Markdown

```


---

# Automation 2

# Research Collector


目的：

情報収集。


処理：

```

URL

↓

取得

↓

要約

↓

保存

```


---

# Automation 3

# Content Generator


目的：

記事制作補助。


処理：

```

Research

↓

Outline

↓

Draft

```


---

# Automation 4

# X Post Generator


目的：

SNS展開。


処理：

```

Article

↓

10 Post Ideas

↓

選択

```


---

# 8. Data Design


## Content Data


Example:


```yaml
---
title:
category:
status:
published:
url:
views:
revenue:
tags:
---
```

---

# Research Data

```yaml
---
source:
date:
topic:
summary:
importance:
---
```

---

# Revenue Data

```yaml
---
content:
product:
click:
conversion:
revenue:
---
```

---

# 9. Development Roadmap

# Week 1

## Foundation

実施：

* Repository作成
* Obsidian整理
* Template作成
* Git管理

成果：

Knowledge Base完成

---

# Week 2

## AI Assistant

実施：

* Research Agent
* Content Agent

成果：

AIによる記事準備可能

---

# Week 3

## Publishing Workflow

実施：

* X Generator
* note Workflow

成果：

投稿サイクル完成

---

# Week 4

## Analytics

実施：

* KPI管理
* Report生成

成果：

改善可能状態

---

# 10. 90 Day Roadmap

# Month 1

## Build

目標：

Piro Creator OS基盤完成。

成果：

* Vault
* Agent
* Workflow

---

# Month 2

## Growth

目標：

発信量増加。

実施：

* X運用
* note投稿
* SEO記事

---

# Month 3

## Monetization

目標：

初収益。

実施：

* Affiliate改善
* Product企画
* CV分析

---

# 11. Definition of Done

## MVP完成条件

以下を満たすこと。

---

## Knowledge

✅ Obsidian管理可能

---

## AI

✅ Research Agent稼働

✅ Content Agent稼働

---

## Publishing

✅ X投稿生成可能

✅ note記事制作可能

---

## Analytics

✅ 成果確認可能

---

## Business

✅ Affiliate導線存在

---

# Final Statement

Piro Creator OS MVPの目的は、

完璧なAIシステムを作ることではない。

目的は、

前川弘行自身が、

「情報を集める」

↓

「知識化する」

↓

「発信する」

↓

「収益化する」

↓

「改善する」

というサイクルを、

一人でも継続できる状態を作ることである。

このMVPが、

将来的な

Piro AI

Piro SaaS

Piro Community

への基盤となる。

END OF PART 6
