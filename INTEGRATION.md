# factor_scores 表示ページ — oscillator-app への統合手順

## 1. ファイルの配置

このZIPの中身を、`oscillator-app`プロジェクトの対応する場所にそのままコピーしてください。

```
your-oscillator-app/
├── app/
│   └── scores/
│       ├── page.tsx                  ← コピー
│       └── components/
│           ├── RegimeStatus.tsx       ← コピー
│           └── ScoreTable.tsx         ← コピー
├── lib/
│   └── factorScoresQueries.ts         ← コピー
└── types/
    └── factorScores.ts                ← コピー
```

`app/`・`lib/`・`types/`が既に存在する場合は、中身(`scores/`フォルダ、
各ファイル)だけを追加してください。

## 2. 依存パッケージ

`@supabase/supabase-js` が未インストールの場合のみ追加してください
(既にSupabaseを使っているプロジェクトなら、ほぼ確実に入っています)。

```bash
npm install @supabase/supabase-js
```

## 3. 環境変数

`.env.local`(本番はVercelの環境変数設定)に以下を追加してください。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ここにanonキー(service_roleではない方)
```

`production/schema.sql`で設定したテーブルと同じSupabaseプロジェクトの
URLと**anon key**(公開用の読み取りキー)を指定してください。
service_role キーは絶対にここに書かないでください
(フロントエンドに公開されてしまいます)。

このプロジェクトに既存のSupabase環境変数が別の名前
(例: `NEXT_PUBLIC_SUPABASE_KEY`)で設定済みの場合は、
`lib/factorScoresQueries.ts`内の環境変数名をそちらに合わせて
書き換えるか、既存のSupabaseクライアント(`lib/supabase.ts`等)を
再利用する形に差し替えてください(ファイル冒頭にコメントで
その旨を記載しています)。

## 4. 動作確認

```bash
npm run dev
```

`http://localhost:3000/scores` にアクセスして表示を確認してください。

- 上部に日本株・米国株それぞれの現在のレジームが表示されます
- 現在は市場がbull(強気)の間、bear/recoveryスコアの表は
  「対象銘柄はありません」という空状態メッセージになります
  (異常ではありません、`production/compute_scores.py`側の設計通りです)
- 過去のbear局面データがある場合は`/scores?market=us`等で確認できます

## 5. ナビゲーションへのリンク追加(任意)

既存のヘッダー/サイドバー等に、以下のようなリンクを追加してください。

```tsx
<Link href="/scores">因子スコア</Link>
```

## 補足: 動作検証について

このコードはTypeScript(strict mode)の型チェックのみ実行済みです
(サンドボックス環境の制約上、oscillator-appの実際のNext.js環境での
`npm run dev`実行までは確認できていません)。配置後、必ずローカルで
`npm run dev`を実行し、実際の表示を確認してください。

`page.tsx`は Next.js 15 の非同期`searchParams`(`Promise<{...}>`を
`await`する書き方)を使っています。Next.js 14以前を使っている場合は、
以下のように同期的な書き方に変更してください。

```tsx
// Next.js 14以前の場合
interface ScoresPageProps {
  searchParams: { market?: string };
}
export default async function ScoresPage({ searchParams }: ScoresPageProps) {
  const market = searchParams.market === "jp" || searchParams.market === "us"
    ? searchParams.market : undefined;
  // ...
}
```
