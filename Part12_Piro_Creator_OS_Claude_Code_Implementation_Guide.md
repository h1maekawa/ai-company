# Part 12
# Piro Creator OS Claude Code Implementation Guide

更新日：
2026-07-19

対象：
Piro Creator OS


---

# 1. Purpose


## 目的


本ドキュメントは、

Claude CodeをPiro Creator OS開発エンジニアとして活用するための実装仕様書である。


Claude Codeは単なるコード生成ツールではなく、

以下を担当する。


```

設計理解

↓

コード実装

↓

ファイル管理

↓

自動化構築

↓

改善提案

```


---

# 2. Claude Code Role Definition


## Role


Claude Codeは、

「Piro Creator OS Technical Engineer」

として動作する。


---

# Responsibilities


担当範囲：


## Development


- Python Script作成
- API連携
- Agent実装
- Web Application開発


---

## Architecture


- Folder設計
- Database設計
- Component設計


---

## Maintenance


- Bug Fix
- Refactoring
- Documentation


---

# 3. Initial Claude Code System Prompt


以下をClaude Code起動時の基本指示として使用する。


```

あなたはPiro Creator OSの専属AIエンジニアです。

目的：

前川弘行がAI時代において、
個人ブランド・メディア・事業を構築するための
AI Business Operating Systemを開発すること。

あなたは以下を理解してください。

Project:

Piro Creator OS

Vision:

個人の知識・経験・AI活用能力を資産化し、
一人でも運営可能なAIビジネス基盤を作る。

Development Principle:

Simple

Maintainable

Expandable

Business Ready

必ず、

1. 要件確認
2. 設計
3. 実装
4. テスト
5. ドキュメント更新

の順番で進めてください。

コードを書く前に、
必ず現在の構造を確認してください。

勝手に大規模変更を行わないでください。

```

---

# 4. Development Workflow


Claude Code開発フロー。


```

Requirement

↓

Repository Analysis

↓

Implementation Plan

↓

Coding

↓

Testing

↓

Documentation

↓

Commit

```


---

# 5. Repository Initialization


## Project Name


```

Piro-Creator-OS

```


---

# Initial Structure


```

Piro-Creator-OS

├ README.md

├ docs

│
├ vault

│
├ agents

│
├ automation

│
├ prompts

│
├ scripts

│
├ database

│
├ app

│
├ config

│
└ logs

```


---

# Directory Purpose


## docs


仕様書管理。


保存：

- Architecture
- Strategy
- Requirement


---

## vault


Obsidian連携。


保存：

- Knowledge
- Research
- Content


---

## agents


AI Agent。


例：

```

research_agent

content_agent

writer_agent

analytics_agent

```


---

## automation


自動処理。


例：

```

collector

generator

scheduler

```


---

## prompts


AI指示管理。


保存：

- System Prompt
- Agent Prompt
- Template


---

# 6. MVP Implementation Order


開発順序。


---

# Phase 1

## Knowledge Base System


目的：

Piroの記憶基盤。


実装。


```

vault/

templates/

metadata/

```


---

## Task


Claude Code指示：


```

Obsidian用のPiro Creator OS Vault構造を作成してください。

必要なFolder:

00_Inbox

01_Brand

02_Research

03_Content

04_Investment

05_Business

06_AI_Agent

07_Templates

08_Analytics

09_Archive

またMarkdown Templateを作成してください。

```


---

# Phase 2

# Markdown Automation


目的：

情報整理自動化。


作成。


```

create_note.py

template_loader.py

markdown_generator.py

```


---

# Task


Claude Code指示。


```

Markdownファイル生成システムを作成してください。

入力:

title

category

content

出力:

Obsidian Vault内Markdown

```


---

# Phase 3

# Research Agent


目的：

市場調査自動化。


構成。


```

agents/

research/

├ main.py

├ prompt.md

└ config.yaml

```


---

# Task


```

Research Agentを作成してください。

機能:

* Topic入力
* AI分析
* Markdown出力

保存先:

vault/02_Research

```


---

# Phase 4

# Content Agent


目的：

記事企画。


機能。


```

Keyword

↓

Idea

↓

Outline

↓

Article Plan

```


---

# Phase 5

# Writing Agent


目的：

記事制作支援。


機能。


```

Research

↓

Draft

↓

SEO Check

↓

Final Draft

```


---

# Phase 6

# SNS Agent


目的：

X投稿生成。


機能。


```

Article

↓

10 Post Ideas

↓

Thread Generation

```


---

# 7. Agent Development Standard


全Agent共通。


Structure:


```

agent_name/

main.py

prompt.md

config.yaml

README.md

output/

```


---

# main.py Rule


必須。


```

Input

↓

Validation

↓

Processing

↓

Output

↓

Log

```


---

# 8. Prompt Management


## Version Control


Prompt変更は禁止ではなく、

管理する。


例：


```

research_prompt_v1.md

research_prompt_v2.md

research_prompt_v3.md

```


---

# Prompt Rule


変更時：

記録。


```

Why changed?

Expected improvement?

Result?

```


---

# 9. Database Implementation


## Initial


Database不要。


Markdown中心。


---

## Later


Supabase導入。


Tables:


```

contents

research

analytics

revenue

users

```


---

# 10. Environment Setup


## Required


Python:


```

Python 3.12+

```


---

# Package Example


```

openai

anthropic

google-generativeai

python-dotenv

pandas

requests

```


---

# Environment File


```

.env

```


Example:


```

OPENAI_API_KEY=

ANTHROPIC_API_KEY=

GEMINI_API_KEY=

SUPABASE_URL=

SUPABASE_KEY=

```


---

# 11. Testing Rule


## Before Completion


必ず確認。


```

Function Test

↓

Error Check

↓

Output Check

↓

Documentation

```


---

# 12. Git Management


## Commit Rule


Format:


```

feat:

fix:

docs:

refactor:

```


Example:


```

feat: add research agent

fix: markdown generation bug

docs: update architecture

```


---

# 13. Daily Development Routine


## Development Cycle


```

Morning

↓

Check Issue

↓

Implement

↓

Test

↓

Document

↓

Commit

```


---

# 14. First 30 Day Development Plan


## Week 1


Foundation。


完成：

✅ Repository

✅ Vault

✅ Templates


---

## Week 2


Automation。


完成：

✅ Markdown Generator

✅ Research Workflow


---

## Week 3


AI Agent。


完成：

✅ Research Agent

✅ Content Agent


---

## Week 4


Publishing。


完成：

✅ Writing Agent

✅ X Generator


---

# 15. Definition of Done


MVP完成条件。


## Knowledge


✅ Obsidian管理可能


---

## AI


✅ Research Agent

✅ Content Agent

✅ Writing Agent


---

## Automation


✅ Markdown自動生成

✅ Workflow稼働


---

## Business


✅ Content制作可能

✅ Affiliate導線管理可能


---

# Final Statement


Claude Codeは、

単なる開発補助ではない。


Piro Creator OSを実現するための

AI開発パートナー

として利用する。


最終的には、

```

Idea

↓

Research

↓

Creation

↓

Publishing

↓

Analysis

↓

Business Growth

```

までを一人で回せる

AI-powered Creator Business System

を構築する。


END OF PART 12
