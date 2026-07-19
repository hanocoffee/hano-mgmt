# Atlas — Market Research Engine (MVP)

AIを使って利益を生み出す事業を作る「Atlas」プロジェクトのMVP。
小規模事業者やフリーランスの具体的な困りごとを収集し、証拠を保持したまま
Pain Pointを抽出・評価し、検証可能な事業案候補を生成するCLI型リサーチエンジンです。

デフォルトでは外部API連携なしで動作します（モックのアナライザーを同梱）。
`ATLAS_ANALYZER=openai` に切り替えると、分析にChatGPT（OpenAI API）を使用します。

開発の進め方は「ChatGPTで壁打ち → Claude Codeで実装」の分担スタイルです。
詳細とコピペ用プロンプト集は [docs/chatgpt-collaboration.md](docs/chatgpt-collaboration.md) を参照。

## アーキテクチャ

```
src/
├── core/                # ドメインの中心（実装に依存しない）
│   ├── types.ts         #   SourceItem / PainPoint / BusinessIdea など
│   ├── source.ts        #   MarketDataSource インターフェース + SourceRegistry
│   ├── analyzer.ts      #   MarketAnalyzer / PainPointExtractor / PainPointEvaluator
│   ├── scoring.ts       #   決定論的スコア計算 + LLM出力の検証
│   ├── pipeline.ts      #   収集 → 保存 → 要約分析（旧フロー）
│   └── pain-pipeline.ts #   2段階Pain Point分析（抽出 → 評価 → 保存）
├── prompts/             # LLMプロンプト（バージョン付き、Analyzerから分離）
│   ├── extract-pain.ts  #   困りごとの抽出
│   └── evaluate-pain.ts #   商業性の評価 + 事業案生成
├── sources/             # データソース実装
│   ├── mock-source.ts   #   サンプルデータ
│   └── file-import.ts   #   手動収集したJSON/JSONLの取り込み
├── analyzers/           # AI分析実装（mock / openai を .env で切替）
├── reports/             # レポート組み立て（Markdown / JSON）
├── storage/             # SQLite（better-sqlite3）+ リポジトリ、バージョン管理式マイグレーション
├── logging/             # Logger インターフェース + JSON Lines 実装
├── config/              # .env 読み込み（dotenv）
├── container.ts         # 依存の組み立て（composition root）
└── cli/index.ts         # CLIエントリポイント（commander）
```

## 分析フロー

```
50投稿 → 80 Pain Points → 20 Clusters → 5 Opportunities
（import）  （analyze-pains:      （clusters:         （report:
             1投稿から複数抽出）    同一課題を統合）     上位クラスタ=市場）
```

## データモデル

「文章の要約」ではなく「何を売るかの判断」のためのモデル:

- **documents** — 収集した生データ（(source_id, external_id)で重複排除）
  - `originalQuote` — 投稿者本人の逐語引用（25〜300文字、必要最小限）。**分析はこれを最優先で使う**
  - `summary` — レポート表示・文脈用の要約。**分析の証拠には使わない**
  - `content` — 全文（あれば）。originalQuoteがない場合の分析フォールバック
- **pain_points** — 抽出された困りごと。6軸スコア（severity / frequency /
  willingness_to_pay / automation_fit / reachability / evidence_quality、
  すべて0-1のCHECK制約付き）と、TypeScriptで決定論的に計算される
  opportunity_score、confidence、cluster_key（同一課題のグルーピング用）を保持
- **evidence** — 各pain pointを裏付ける原文からの逐語引用
- **business_ideas** — pain pointから生成された事業案候補（1つの困りごとから複数可）

スコアはLLMに一発で出させません。LLMは各評価軸を理由・証拠ID付きで返し、
最終スコアは `core/scoring.ts` の重み付き平均で計算します。
**理由のない評価は保存を拒否**し、**証拠のないスコアは0.5でキャップ**します。

**拡張ポイント:**

- **情報源の追加** — `MarketDataSource` を実装し、`container.ts` の
  `buildSourceRegistry()` に登録するだけ。パイプライン・CLI・保存層は変更不要。
- **AI分析の追加** — `MarketAnalyzer` を実装し、`buildAnalyzer()` に登録。
  `.env` の `ATLAS_ANALYZER` で切り替え。
- **テスト** — すべての依存がインターフェース経由なので、フェイク実装と
  `:memory:` SQLiteで高速にテスト可能（`tests/` 参照）。

## セットアップ

```bash
cd atlas
pnpm install
cp .env.example .env   # 必要に応じて編集
```

## 使い方: 手動収集 → Pain Point分析 → 事業案レポート

メインのワークフロー。手動で集めた困りごと（50件目標）を投入し、
評価済みの事業機会レポートを出します。

### 1. 収集データをJSONLで用意する

1行1レコード。**`originalQuote`（投稿者本人の逐語引用）を必ず入れること** —
AIは本人の言葉から深刻さや緊急性を判断するため、要約では情報量が大きく落ちます。

```jsonl
{"title": "Invoice chasing", "originalQuote": "I hate chasing invoices every month. I spend hours emailing clients and still don't get paid.", "summary": "請求書の催促が精神的につらい", "url": "https://...", "metadata": {"targetSegment": "billing"}}
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `originalQuote` | 推奨 | 本人の発言の逐語引用。25〜300文字、必要最小限（source-policy参照）。分析の主入力 |
| `summary` | 任意 | Atlas用の要約。レポート表示・文脈用。証拠には使われない |
| `content` | 任意 | 全文。originalQuoteがない場合のフォールバック |
| `title` / `url` / `publishedAt` / `author` / `metadata` | 任意 | 出典情報（externalId省略時は内容ハッシュで自動採番、再投入しても重複しない） |

※ `originalQuote` / `content` / `summary` のどれか1つは必須。originalQuoteなしの
レコードは取り込み時に警告が出ます（要約フォールバック分析になるため品質が落ちる）。

### 2. 投入 → 分析 → クラスタ → レポート

```bash
pnpm dev import data/research/raw-pains-001.jsonl  # SQLiteへ取り込み
pnpm dev analyze-pains                             # 抽出（1投稿→複数可）→ 評価
pnpm dev pains                                     # pain pointをスコア順に表示
pnpm dev clusters                                  # 同一課題のクラスタ一覧
pnpm dev ideas                                     # 事業案をスコア順に表示
pnpm dev report --format markdown --top 10         # クラスタ+上位pain pointのレポート
```

クラスタは`cluster_key`のトークン類似度（Jaccard≥0.5）で同一課題を統合し、
`スコア = 0.7×平均opportunity + 0.3×文書数の広がり(上限5)` でランク付けします。
複数の投稿が同じ問題を指しているクラスタ＝「市場」として上位5件をレポートに出します。

ChatGPT分析で実行する場合は `.env` に `ATLAS_ANALYZER=openai` と
`OPENAI_API_KEY` を設定してから `analyze-pains` を実行します。
`--all` で全ドキュメントを再分析（プロンプト改定後など）。

### その他のコマンド

```bash
pnpm dev sources                 # 登録済みデータソース一覧
pnpm dev collect --query coffee  # データソースからの収集
pnpm dev run --query ai          # 収集 + 要約分析（旧フロー）
pnpm dev insights                # 要約インサイトの表示

# ビルドして実行
pnpm build
pnpm start report --format markdown
```

ログはJSON Linesでstderrに出力されるため、stdout（結果）と分離されています。

## テスト

```bash
pnpm test        # vitest（SQLiteは :memory: を使用）
pnpm typecheck
```

## Docker

```bash
cd atlas
docker compose build
docker compose run --rm atlas run --query coffee
docker compose run --rm atlas report
```

データは名前付きボリューム `atlas-data` の `/data/atlas.db` に永続化されます。

## 環境変数（.env）

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `ATLAS_DB_PATH` | `data/atlas.db` | SQLiteファイルのパス（`:memory:` 可） |
| `ATLAS_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `ATLAS_ANALYZER` | `mock` | `mock` / `openai` |
| `OPENAI_API_KEY` | — | `openai` 使用時に必須 |
| `ATLAS_OPENAI_MODEL` | `gpt-4o-mini` | 分析に使うOpenAIモデル |
| `ATLAS_OPENAI_BASE_URL` | OpenAI公式 | OpenAI互換エンドポイントの上書き |

### ChatGPT分析を使う

```bash
# .env に設定
ATLAS_ANALYZER=openai
OPENAI_API_KEY=sk-...

pnpm dev run --query coffee   # 分析がChatGPTで実行される
```

## 今後のロードマップ（案）

1. 実データソースの追加（ニュースAPI、RSS、SNS、ECレビューなど）
2. インサイトの時系列比較・トレンド検出
3. レポート出力（Markdown / HTML）と定期実行
