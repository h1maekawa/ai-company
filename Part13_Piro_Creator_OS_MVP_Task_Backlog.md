# Part 13
# Piro Creator OS MVP Task Backlog

更新日：
2026-07-19

プロジェクト：
Piro Creator OS

対象：
Claude Code / AI Development Agent


---

# 0. Document Purpose


## 目的


本ドキュメントは、

Piro Creator OS MVP開発を実行するためのタスク管理仕様書である。


Part12：

Claude Code Implementation Guide


で定義した開発方針を、

実際に実装可能なTask単位へ分解する。


---

# Development Philosophy


Piro Creator OS開発では、

最初から巨大なサービスを作らない。


優先順位。


```

Use

↓

Validate

↓

Improve

↓

Scale

```


---

# MVP Definition


## Piro Creator OS MVPとは


以下を実現した状態。


```

情報収集

↓

AI分析

↓

Markdown保存

↓

コンテンツ生成

↓

SNS展開

↓

収益管理

```


---

# MVP Goal


最終的な目的。


> 前川弘行自身が毎日利用でき、知識・発信・収益化を加速できる個人AI経営OSを作る。


---

# 1. Development Roadmap


## Phase Structure


```

Phase 0

Environment

↓

Phase 1

Knowledge OS

↓

Phase 2

Automation

↓

Phase 3

AI Agents

↓

Phase 4

Content Engine

↓

Phase 5

Analytics

↓

Phase 6

Platform

```


---

# Phase 0
# Environment Setup


期間：

1週間以内


目的：

開発基盤構築。


---

# TASK-001

## Repository Setup


Status：

TODO


Priority：

★★★★★


## Purpose


Piro Creator OS開発環境を作成する。


---

## Implementation


Create:


```

Piro-Creator-OS/

├ README.md

├ docs/

├ vault/

├ agents/

├ automation/

├ prompts/

├ scripts/

├ database/

└ logs/

```


---

## Definition of Done


完了条件。


```

Git管理開始

README存在

Folder構造完成

```


---

# TASK-002

## Development Environment Setup


Status：

TODO


Priority：

★★★★★


---

## Requirements


Install:


```

Python 3.12+

Node.js

Git

Claude Code

```


---

## Definition of Done


```

python --version

node --version

git --version

```

確認完了。


---

# Phase 1
# Knowledge OS


目的：

Piroの知識資産管理基盤を作る。


---

# TASK-101

## Obsidian Vault Structure


Priority：

★★★★★


---

## Create


```

Piro_Vault/

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

```


---

## Definition of Done


```

Obsidianで正常表示

Folder利用可能

```


---

# TASK-102

## Markdown Template System


Priority：

★★★★★


---

## Create Templates


```

Research_Template.md

Content_Template.md

Investment_Template.md

Book_Template.md

Meeting_Template.md

```


---

## Template Format


```yaml
---
title:
category:
tags:
created:
updated:
status:
---
```

---

# TASK-103

## Knowledge Metadata System

目的：

AI検索可能な状態にする。

---

## Required Metadata

```
category

topic

source

summary

related

status
```

---

# Phase 2

# Automation System

目的：

手作業削減。

---

# TASK-201

## Markdown Generator

File:

```
automation/markdown_generator.py
```

---

## Function

Input:

```
title

category

content
```

Output:

```
Obsidian Markdown File
```

---

# TASK-202

## Auto Folder Organizer

目的：

カテゴリ別自動保存。

Example:

```
AI

↓

02_Research/AI


Investment

↓

04_Investment
```

---

# TASK-203

## Daily Note Generator

目的：

日次ログ自動作成。

Output:

```
Daily_YYYYMMDD.md
```

---

# Phase 3

# AI Agent System

目的：

AI社員化。

---

# TASK-301

## Base Agent Framework

Priority：

★★★★★

Create:

```
agents/base_agent.py
```

---

## Required Function

```
load_prompt()

execute()

validate()

save_output()
```

---

# TASK-302

# Research Agent

Priority：

★★★★★

Purpose：

市場調査。

---

## Input

```
Topic

Keyword

Purpose
```

---

## Output

```
Research_Report.md
```

保存。

```
vault/02_Research
```

---

# TASK-303

# Content Planning Agent

Priority：

★★★★

Purpose：

記事企画。

---

Input:

```
Theme

Audience

Goal
```

Output:

```
Article_Idea.md
```

---

# TASK-304

# Writing Agent

Priority：

★★★★

Purpose：

記事制作補助。

---

Input:

```
Research

Outline
```

Output:

```
Draft.md
```

---

# TASK-305

# X Content Agent

Priority：

★★★

Purpose：

SNS展開。

Output:

```
X_Posts.md

Thread.md
```

---

# Phase 4

# Content Engine

目的：

1情報100展開。

---

# TASK-401

## Content Pipeline

Flow:

```
Research

↓

Article

↓

X

↓

SEO

↓

Affiliate
```

---

# TASK-402

## Content Calendar

Create:

```
Editorial_Calendar.md
```

管理。

```
Date

Topic

Platform

Status
```

---

# Phase 5

# Revenue System

目的：

収益管理。

---

# TASK-501

## Affiliate Database

Create:

```
Affiliate_DB.md
```

管理:

```
Product

URL

Category

CTR

CV

Revenue
```

---

# TASK-502

## Monetization Score AI

AI評価。

Criteria:

```
Traffic

Conversion

Brand Fit

Revenue Potential
```

---

# Phase 6

# Analytics System

目的：

改善。

---

# TASK-601

## Weekly Report Generator

Output:

```
Weekly_Report.md
```

内容:

```
Published Content

Traffic

Revenue

Improvement
```

---

# TASK-602

## KPI Dashboard

Future:

Technology:

```
Next.js

Supabase
```

---

# 2. Kanban Management

## Status Definition

```
BACKLOG

↓

TODO

↓

DOING

↓

REVIEW

↓

DONE
```

---

# 3. Task Management Rule

すべての開発はTask ID管理。

Example:

```
TASK-302

Research Agent Implementation

Status:
DOING

Owner:
Claude Code

Output:
Research_Report.md
```

---

# 4. Claude Code Execution Prompt

基本依頼形式。

```
あなたはPiro Creator OS Engineerです。

以下TASKを実装してください。


TASK ID:

目的:

現在状態:

必要Output:

Definition of Done:

実装後、

変更ファイル一覧

実行方法

確認結果

を報告してください。
```

---

# 5. 90 Day Development Plan

## Month 1

Knowledge + Agent

完成。

```
Vault

Templates

Research Agent

Content Agent
```

---

## Month 2

Automation

完成。

```
Markdown Generator

SNS Agent

Affiliate Management
```

---

## Month 3

Analytics

完成。

```
Dashboard

Reports

Optimization System
```

---

# 6. MVP Completion Checklist

## Knowledge

□ Vault完成

□ Template完成

□ Metadata完成

---

## AI

□ Research Agent

□ Content Agent

□ Writing Agent

□ SNS Agent

---

## Automation

□ Markdown生成

□ Folder整理

□ Daily Note

---

## Business

□ Affiliate管理

□ KPI確認

□ Weekly Review

---

# Final Statement

Piro Creator OS MVP開発の目的は、

高度な技術システムを作ることではない。

目的は、

前川弘行の

```
経験

知識

判断

創造性
```

をAIによって拡張し、

一人でも継続的に価値提供・収益化できる仕組みを作ることである。

このBacklogを基準に、

Claude Codeと段階的に実装を進める。

END OF PART 13
