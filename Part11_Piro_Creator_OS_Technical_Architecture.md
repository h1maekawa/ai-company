# Part 11
# Piro Creator OS Technical Architecture

更新日：
2026-07-19

対象：
Piro Creator OS


---

# 1. Technical Vision


## Purpose


Piro Creator OSの技術基盤の目的は、

AI Agent・Knowledge Base・Content System・Analyticsを統合し、

「個人が一人で運営可能なAI Business Infrastructure」

を構築することである。


---

# Technical Philosophy


Piro Creator OSでは、

最新技術を使うことを目的にしない。


重要なのは、

```

Simple

↓

Maintainable

↓

Expandable

↓

Business Ready

```

である。


---

# 2. Overall System Architecture


## High Level Architecture


```

```
                User

                 |

                 |

          Piro Dashboard

                 |

    ----------------------------

    |             |            |
```

Knowledge      AI Agent     Analytics

```
    |             |            |

Obsidian     Python/API    Database

    |             |

    ----------------

                 |

          External Services

                 |

   OpenAI / Claude / Gemini

   X API

   Google API

   Affiliate API
```

```


---

# 3. System Components


Piro Creator OSは以下の6レイヤーで構成する。


```

Layer 1

Knowledge Layer

↓

Layer 2

Automation Layer

↓

Layer 3

AI Agent Layer

↓

Layer 4

Application Layer

↓

Layer 5

Data Layer

↓

Layer 6

Business Layer

```


---

# 4. Layer 1
# Knowledge Layer


## Purpose


Piro Creator OSの記憶。


中心：

Obsidian Vault


---

# Knowledge Structure


推奨構成。


```

Piro_Vault

├ 00_Inbox

├ 01_Brand

├ 02_Research

├ 03_Content

├ 04_Investment

├ 05_Business

├ 06_AI_Agent

├ 07_Templates

├ 08_Analytics

└ 09_Archive

```


---

# Folder Definition


## 00_Inbox


一時保存。


対象：

- アイデア
- メモ
- 気付き


---

## 02_Research


市場調査。


保存：

- AI
- 投資
- キャリア
- ビジネス


---

## 03_Content


制作管理。


保存：

- 記事
- X投稿
- 動画案


---

## 06_AI_Agent


AI設定。


保存：

- Prompt
- Agent Rule
- Version


---

# 5. Layer 2
# Automation Layer


## Purpose


繰り返し作業を自動化。


---

# Technology


## Language

Python


理由：

- AI API連携
- データ処理
- 自動化向き


---

# Directory


```

automation/

├ collectors/

├ agents/

├ generators/

├ analyzers/

└ utils/

```


---

# Collector


役割：

情報取得。


例：

```

news_collector.py

web_collector.py

market_collector.py

```


---

# Generator


役割：

Markdown生成。


例：

```

note_generator.py

research_generator.py

report_generator.py

```


---

# 6. Layer 3
# AI Agent Layer


## Purpose


専門AIチーム。


---

# Agent Architecture


```

Piro Core Agent

|

├ Research Agent

├ Strategy Agent

├ Content Agent

├ Writing Agent

├ SNS Agent

├ Analytics Agent

└ Monetization Agent

```


---

# Agent Structure


各Agent。


```

agent/

├ prompt.md

├ config.yaml

├ main.py

└ output/

```


---

# Agent Processing


```

Input

↓

Prompt

↓

AI Model

↓

Validation

↓

Markdown Output

```


---

# 7. AI Model Strategy


## Multi Model Approach


1つのAIに依存しない。


---

# Recommended Usage


## Claude


用途：

- 長文整理
- 戦略
- 文章品質


---

## GPT


用途：

- 汎用処理
- アイデア
- API連携


---

## Gemini


用途：

- Googleサービス連携
- 大量情報処理


---

# 8. Layer 4
# Application Layer


## Purpose


ユーザーインターフェース。


---

# MVP


最初は不要。


使用：

- Obsidian
- Markdown
- CLI


---

# Phase 2


Web Dashboard。


技術：

```

Next.js

*

Tailwind CSS

*

Supabase

```


---

# Phase 3


Piro Platform。


機能：

- User Login
- Dashboard
- AI Chat
- Content Management


---

# 9. Layer 5
# Data Layer


## Purpose


データ管理。


---

# MVP Database


Supabase


理由：

- PostgreSQL
- Authentication
- API
- Storage


---

# Database Tables


## users


```

id

name

email

created_at

```


---

## contents


```

id

title

category

status

url

views

revenue

```


---

## research


```

id

topic

summary

source

created_at

```


---

## analytics


```

id

metric

value

date

```


---

# 10. Layer 6
# Business Layer


## Purpose


収益管理。


---

# Data


```

Content

↓

Traffic

↓

Conversion

↓

Revenue

```


---

# Revenue Table


```

revenue

id

source

product

click

conversion

amount

date

```


---

# 11. API Architecture


## External APIs


接続候補。


---

# AI API


用途：

Agent実行。


---

# X API


用途：

- 投稿取得
- Analytics


---

# Google API


用途：

- Search Console
- Analytics


---

# Affiliate API


用途：

収益取得。


---

# 12. Deployment Architecture


## MVP


Local Environment


```

Mac

↓

Python

↓

Obsidian

```


---

# Web Phase


推奨。


```

GitHub

↓

Vercel

↓

Next.js

*

Supabase

```


---

# Static Content


Cloudflare Pages


用途：

- Blog
- Landing Page


---

# 13. Git Repository Design


```

Piro-Creator-OS

├ docs

├ app

├ agents

├ automation

├ prompts

├ database

├ vault

└ README.md

```


---

# Git Rule


変更単位：

```

Feature

↓

Commit

↓

Review

↓

Merge

```


---

# 14. Environment Management


## Environment


```

.env

```


管理。


```

OPENAI_API_KEY

CLAUDE_API_KEY

GEMINI_API_KEY

SUPABASE_URL

SUPABASE_KEY

X_API_KEY

```


---

# 15. Security Rule


禁止：

- API Key公開
- 個人情報保存
- 不要な外部共有


---

# 16. Claude Code Development Rule


Claude Codeは、

Piro Creator OS開発担当。


---

# Development Process


```

Requirement

↓

Design

↓

Implementation

↓

Test

↓

Document

```


---

# Coding Rule


## Rule 1

小さく作る。


## Rule 2

READMEを書く。


## Rule 3

変更理由を残す。


## Rule 4

AI生成コードは必ず確認する。


---

# 17. Development Roadmap


## Phase 1

Knowledge OS


期間：

1ヶ月


作成：

- Vault
- Template
- Prompt管理


---

## Phase 2

AI Automation


期間：

2〜3ヶ月


作成：

- Agent
- API
- Generator


---

## Phase 3

Web Platform


期間：

3〜6ヶ月


作成：

- Dashboard
- Authentication
- Database


---

## Phase 4

SaaS


期間：

6ヶ月〜


作成：

- User Management
- Subscription
- AI Service


---

# 18. Final Architecture Vision


最終構成。


```

```
            Piro Creator OS


                   |

          AI Business Layer


                   |
```

---

|             |              |                 |

Knowledge    Content       Analytics       Revenue

|             |              |                 |

Obsidian     Media        Dashboard       Business

```
                   |

                AI Agents
```

```


---

# Final Statement


Piro Creator OSの技術設計は、

高度なシステムを作るためではない。


目的は、

前川弘行という個人の

知識

経験

判断

創造性

をAIによって拡張し、

一人でも運営可能な事業基盤を作ることである。


技術は目的ではなく、

Piroという個人ブランドを成長させるためのインフラである。


END OF PART 11
