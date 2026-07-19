# 収集ログ（raw-pains-001）

対象: 小規模事業者・フリーランスが繰り返している事務作業の困りごと
目標: 50件（各セグメント10件）

## 集計

| 項目 | 件数 |
| --- | --- |
| 収集件数 | 50 |
| 有効件数 | 48 |
| 重複件数 | 2 |

## 情報源別件数

| sourceId | 件数 | メモ |
| --- | --- | --- |
| reddit-public | 50 | 公開Reddit投稿。contentは原文転載を避けた課題の要約（ChatGPTによる収集・要約） |

## 対象者別件数（targetSegment）

| セグメント | 目標 | 収集済 |
| --- | --- | --- |
| 経理・請求・入金管理 (billing) | 10 | 10 |
| 顧客対応・予約・問い合わせ (customer-support) | 10 | 10 |
| SNS・集客・コンテンツ作成 (marketing-content) | 10 | 10 |
| 見積・契約・書類作成 (documents) | 10 | 10 |
| スケジュール・タスク・外注管理 (task-management) | 10 | 10 |

## 除外理由

| 件数 | 理由 |
| --- | --- |
| 2 | 同一Reddit投稿を別角度の課題として重複使用（externalId重複: 7行目↔40行目、27行目↔29行目）。取り込み時に後の行で上書きされ、有効48件 |

## 作業メモ

- 2026-07-19: raw-pains-001.jsonl（50件）を取り込み。有効48ドキュメント。
  モックアナライザー（mock@1+mock@1）で48 pain point / 48 idea を生成し、
  report-001.md（上位10件）を出力。
- 注意: このデータセットの `content` は原文ではなく課題の要約。宣伝・市場調査
  目的の投稿が混入している可能性あり。`publishedAt` / `author` は未確認のため空欄。
  **上位候補は必ず元URLを開いて再検証すること。**
- 2026-07-19 (Phase 2): originalQuote/summary分離・複数Pain Point抽出・
  クラスタリングを実装。48件を再分析 → 48 pain point → 11クラスタ →
  report-002.md（クラスタ上位: invoice-payment-collection 15件 /
  booking-scheduling 11件 / social-media-content 6件）。
- **次の収集（raw-pains-002）から必須:** `originalQuote` に投稿者本人の
  逐語引用（25〜300文字）を入れる。summaryは別フィールド。現在の001は
  全件要約のみのため、分析はフォールバック動作（品質上限あり）。
- OpenAI API切替はデータ構造確定後（Phase 2データが揃ってから）。
