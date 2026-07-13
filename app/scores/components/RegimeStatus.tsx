import type { MarketRegimeRow, Regime } from "@/types/factorScores";
import { MARKET_LABEL, REGIME_LABEL } from "@/types/factorScores";

// Streamlitダッシュボードと配色を統一(緑=bull/赤=bear/グレー=range/オレンジ=recovery)
const REGIME_STYLE: Record<Regime, string> = {
  bull: "bg-emerald-50 text-emerald-700 border-emerald-200",
  bear: "bg-red-50 text-red-700 border-red-200",
  range: "bg-gray-100 text-gray-700 border-gray-200",
  recovery: "bg-orange-50 text-orange-700 border-orange-200",
};

export function RegimeStatus({ regimes }: { regimes: MarketRegimeRow[] }) {
  if (regimes.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        レジームデータがまだありません。日次バッチの初回実行をお待ちください。
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {regimes.map((r) => (
        <div
          key={r.market}
          className={`rounded-lg border px-4 py-3 flex items-center justify-between ${REGIME_STYLE[r.regime]}`}
        >
          <div>
            <div className="text-xs opacity-70">{MARKET_LABEL[r.market]}</div>
            <div className="text-lg font-semibold">{REGIME_LABEL[r.regime]}</div>
          </div>
          <div className="text-right text-xs opacity-70">
            <div>{r.date}</div>
            {r.close != null && <div>{r.close.toLocaleString()}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
