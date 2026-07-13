import Link from "next/link";
import { getCurrentRegimes, getScoreRanking } from "@/lib/factorScoresQueries";
import { RegimeStatus } from "./components/RegimeStatus";
import { ScoreTable } from "./components/ScoreTable";
import type { Market } from "@/types/factorScores";

export const revalidate = 300; // 5分キャッシュ(1日1回しか更新されないデータのため)

interface ScoresPageProps {
  searchParams: Promise<{ market?: string }>;
}

export default async function ScoresPage({ searchParams }: ScoresPageProps) {
  const params = await searchParams;
  const market: Market | undefined =
    params.market === "jp" || params.market === "us" ? params.market : undefined;

  const [regimes, bearRows, recoveryRows] = await Promise.all([
    getCurrentRegimes(),
    getScoreRanking({ market, scoreType: "bear", limit: 50 }),
    getScoreRanking({ market, scoreType: "recovery", limit: 50 }),
  ]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold">オシレーター因子スコア</h1>
        <p className="text-sm text-gray-500 mt-1">
          日次バッチで計算された、bear/recoveryレジームの複合スコア上位銘柄。
        </p>
      </div>

      <section>
        <h2 className="text-base font-semibold mb-2">現在のレジーム</h2>
        <RegimeStatus regimes={regimes} />
      </section>

      <nav className="flex gap-2 text-sm">
        <Link
          href="/scores"
          className={`px-3 py-1 rounded-full border ${!market ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
        >
          全市場
        </Link>
        <Link
          href="/scores?market=jp"
          className={`px-3 py-1 rounded-full border ${market === "jp" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
        >
          日本株
        </Link>
        <Link
          href="/scores?market=us"
          className={`px-3 py-1 rounded-full border ${market === "us" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
        >
          米国株
        </Link>
      </nav>

      <section className="space-y-8">
        <ScoreTable
          title="Bearスコア上位銘柄"
          rows={bearRows}
          scoreType="bear"
          emptyRegimeLabel="強気(bull)またはレンジ(range)"
        />
        <ScoreTable
          title="Recoveryスコア上位銘柄"
          rows={recoveryRows}
          scoreType="recovery"
          emptyRegimeLabel="弱気(bear)以外"
        />
      </section>
    </main>
  );
}
