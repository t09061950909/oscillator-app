# Oscillator App

投資タイミングを知らせるTSIオシレータアプリ。

## 機能

- 銘柄追加（ティッカー・`SOX*USDJPY`形式の為替換算対応）
- 銘柄一覧・TradingView風チャート（Lightweight Charts v5）
  - ローソク足 + TSIオシレーター（長期12・短期6・シグナル3）
  - ゼロライン -10 / GC矢印マーカー（赤：-10以下、緑：-10以上）
- ゴールデンクロスのブラウザ通知（Service Worker）
- Vercel Cron 日次価格自動更新（JST 08:00）

## セットアップ

### 1. Supabase プロジェクト作成

[supabase.com](https://supabase.com) で新規プロジェクトを作成し、
SQL Editorで `supabase/schema.sql` を実行。

### 2. 環境変数

```bash
cp .env.local.example .env.local
```

| 変数 | 取得場所 |
|------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Settings > API > anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API > service_role |
| `CRON_SECRET` | 任意のランダム文字列（`openssl rand -hex 32`） |

### 3. ローカル起動

```bash
npm install && npm run dev
```

### 4. Vercel デプロイ

```bash
vercel deploy
```

Vercel の Environment Variables に上記4変数を設定。

## ティッカー入力例

| 入力 | 意味 |
|------|------|
| `AAPL` | Apple 株（USD） |
| `9984.T` | ソフトバンクG（JPY） |
| `^SOX*USDJPY` | SOX指数（円換算） |
| `SPY*USDJPY` | SPY ETF（円換算） |

## TSIシグナルの見方

| マーカー色 | 条件 | 意味 |
|-----------|------|------|
| 🔴 赤矢印 | TSI < -10 でゴールデンクロス | 強い買いシグナル |
| 🟢 緑矢印 | TSI ≥ -10 でゴールデンクロス | 買いシグナル |

## 技術スタック

Next.js 16 / TypeScript / Tailwind CSS / Lightweight Charts v5 / Supabase / Vercel
