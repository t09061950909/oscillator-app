import type { FactorScoreRow } from "@/types/factorScores";

interface ScoreTableProps {
  title: string;
  rows: FactorScoreRow[];
  scoreType: "bear" | "recovery";
  emptyRegimeLabel: string; // 例: "強気(bull)" — 空の理由を説明するために使う
}

export function ScoreTable({ title, rows, scoreType, emptyRegimeLabel }: ScoreTableProps) {
  const scoreKey = scoreType === "bear" ? "bear_score" : "recovery_score";
  const rankKey = scoreType === "bear" ? "rank_bear" : "rank_recovery";

  return (
    <div>
      <h2 className="text-base font-semibold mb-2">{title}</h2>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
          現在、対象銘柄はありません。市場が{emptyRegimeLabel}のレジームでは、
          このスコアは意図的に算出されません(異常ではありません)。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">順位</th>
                <th className="px-3 py-2 text-left font-medium">銘柄</th>
                <th className="px-3 py-2 text-left font-medium">市場</th>
                <th className="px-3 py-2 text-right font-medium">終値</th>
                <th className="px-3 py-2 text-right font-medium">スコア</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={`${row.market}-${row.symbol}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">{row[rankKey]}</td>
                  <td className="px-3 py-2 font-medium">{row.symbol}</td>
                  <td className="px-3 py-2 text-gray-500 uppercase">{row.market}</td>
                  <td className="px-3 py-2 text-right">
                    {row.close != null ? row.close.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row[scoreKey] != null ? row[scoreKey]!.toFixed(3) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
