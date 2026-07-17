# Atlas — Market Research Engine (MVP)

AIを使って利益を生み出す事業を作る「Atlas」プロジェクトのMVP。
複数の情報源から市場データを収集し、AI分析でインサイト（要約・センチメント・キーワード・機会スコア）を生成してSQLiteに保存するCLIツールです。

デフォルトでは外部API連携なしで動作します（モックのデータソース・アナライザーを同梱）。
`ATLAS_ANALYZER=openai` に切り替えると、分析にChatGPT（OpenAI API）を使用します。

開発の進め方は「ChatGPTで壁打ち → Claude Codeで実装」の分担スタイルです。
詳細とコピペ用プロンプト集は [docs/chatgpt-collaboration.md](docs/chatgpt-collaboration.md) を参照。

## アーキテクチャ

```
src/
├── core/            # ドメインの中心（実装に依存しない）
│   ├── types.ts     #   SourceItem / StoredDocument / AnalysisResult など
│   ├── source.ts    #   MarketDataSource インターフェース + SourceRegistry
│   ├── analyzer.ts  #   MarketAnalyzer インターフェース
│   └── pipeline.ts  #   収集 → 保存 → 分析 → 保存 のオーケストレーション
├── sources/         # データソース実装（ここにAPI連携を追加していく）
│   └── mock-source.ts
├── analyzers/       # AI分析実装
│   ├── mock-analyzer.ts    # オフライン用ヒューリスティック
│   └── openai-analyzer.ts  # ChatGPT (OpenAI API) 分析
├── storage/         # SQLite（better-sqlite3）+ リポジトリ
├── logging/         # Logger インターフェース + JSON Lines 実装
├── config/          # .env 読み込み（dotenv）
├── container.ts     # 依存の組み立て（composition root）
└── cli/index.ts     # CLIエントリポイント（commander）
```

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

## 使い方

```bash
# 開発モード（ビルド不要）
pnpm dev sources                 # 登録済みデータソース一覧
pnpm dev collect --query coffee  # データ収集のみ
pnpm dev analyze                 # 保存済みデータの分析のみ
pnpm dev run --query ai          # 収集 + 分析（フルパイプライン）
pnpm dev report                  # 最新インサイトの表示

# ビルドして実行
pnpm build
pnpm start run --query coffee
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
