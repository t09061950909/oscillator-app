'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { createBrowserSupabase } from '@/lib/supabase';
import Auth from '@/components/Auth';
import { 
  Wallet, PieChart as ChartIcon, Settings, RefreshCcw, TrendingUp, Trash2, Search, 
  ChevronRight, BarChart3, Filter, SortDesc, SortAsc, 
  PlusCircle, Edit3, Save, X, CheckSquare, Square, Info, ExternalLink, Database, Plus,
  TrendingDown, History
} from 'lucide-react';

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, LabelList,
  LineChart, Line, CartesianGrid, XAxis, YAxis, AreaChart, Area
} from 'recharts';

const COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#4D5360', '#C9CBCF', '#8AC249', '#EA4335', '#00ACC1', '#FBBC05', '#E91E63', '#673AB7', '#009688'];

const tooltipStyle = {
  backgroundColor: '#ffffff',
  border: '2px solid #e2e8f0',
  borderRadius: '12px',
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
  fontSize: '11px',
  fontWeight: 'bold',
  color: '#1e293b',
  padding: '12px',
  zIndex: 9999,
};

const CustomTooltip = ({ active, payload, currencyRate = 1 }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = payload[0].value;
    const label = data.recorded_date
      ? new Date(data.recorded_date).toLocaleDateString('ja-JP')
      : (data.date || payload[0].name);
    return (
      <div style={tooltipStyle as any}>
        <p className="text-slate-400 mb-1 font-black">{label}</p>
        <p className="text-blue-600 font-black">¥{Math.floor(value * currencyRate).toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

const renderPieLabel = ({ name, percent }: any) =>
  percent > 0.05 ? `${name.substring(0, 7)}(${(percent * 100).toFixed(0)}%)` : '';

// 円グラフ用：全体に占める割合が thresholdPct(%) 未満の項目を「その他」に合算する
// thresholdPct が 0 または未指定の場合は何もしない（元データをそのまま返す）
const groupOthers = (data: { name: string; value: number }[], thresholdPct: number) => {
  if (!thresholdPct || thresholdPct <= 0) return data;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return data;
  const kept: { name: string; value: number }[] = [];
  let otherSum = 0;
  data.forEach(d => {
    const pct = (d.value / total) * 100;
    if (pct < thresholdPct) {
      otherSum += d.value;
    } else {
      kept.push(d);
    }
  });
  if (otherSum > 0) {
    kept.push({ name: 'その他', value: otherSum });
  }
  return kept;
};

const DonutCenter = ({ label, value, sub }: any) => (
  <div
    className="absolute inset-0 flex flex-col items-center justify-center text-center rounded-full"
    style={{ pointerEvents: 'none', zIndex: 0 }}
  >
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-1">{label}</p>
    <p className="text-base md:text-xl font-black tracking-tighter leading-tight">¥{Math.floor(value || 0).toLocaleString()}</p>
    {sub && <p className={`text-[10px] font-black ${sub.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>{sub}</p>}
  </div>
);

const MarketTabs = ({ active, onChange }: { active: MarketType[]; onChange: (v: MarketType[]) => void }) => {
  const items: MarketType[] = ['日本株', '米国株', '投資信託'];
  const toggle = (m: MarketType) => {
    if (active.includes(m)) {
      onChange(active.filter(x => x !== m));
    } else {
      onChange([...active, m]);
    }
  };
  return (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4 w-fit mx-auto md:mx-0 shadow-inner overflow-x-auto no-scrollbar">
      <button
        onClick={() => onChange([])}
        className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${active.length === 0 ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}>
        全て
      </button>
      {items.map(m => (
        <button key={m} onClick={() => toggle(m)}
          className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${active.includes(m) ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}>
          {m}{active.includes(m) && active.length > 0 ? ' ✓' : ''}
        </button>
      ))}
    </div>
  );
};

// 口座区分フィルター（特定口座/NISA/iDeCo）。MarketTabsと同じ複数選択チップ方式
const TaxTabs = ({ active, onChange }: { active: TaxCategoryType[]; onChange: (v: TaxCategoryType[]) => void }) => {
  const items: TaxCategoryType[] = ['特定口座', 'NISA', 'iDeCo'];
  const toggle = (t: TaxCategoryType) => {
    if (active.includes(t)) {
      onChange(active.filter(x => x !== t));
    } else {
      onChange([...active, t]);
    }
  };
  return (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4 w-fit mx-auto md:mx-0 shadow-inner overflow-x-auto no-scrollbar">
      <button
        onClick={() => onChange([])}
        className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${active.length === 0 ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-emerald-500'}`}>
        全て
      </button>
      {items.map(t => (
        <button key={t} onClick={() => toggle(t)}
          className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${active.includes(t) ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-emerald-500'}`}>
          {t}{active.includes(t) && active.length > 0 ? ' ✓' : ''}
        </button>
      ))}
    </div>
  );
};

type MarketType = '全て' | '日本株' | '米国株' | '投資信託';
type TaxCategoryType = '特定口座' | 'NISA' | 'iDeCo';
type RangeType = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
type CyclicalType = '景気敏感' | '中立' | 'ディフェンシブ';

// ブラウザ用Supabaseクライアント（モジュールスコープで1度だけ生成し使い回す）
const supabase = createBrowserSupabase();

export default function PortfolioPage() {
  // ── 共通 state ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('assets');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(['all']);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  // 複数選択対応：空配列 = 全て表示
  const [assetMarketFilter, setAssetMarketFilter] = useState<MarketType[]>([]);
  const [divMarketFilter, setDivMarketFilter]   = useState<MarketType[]>([]);
  // 口座区分フィルター（特定口座/NISA/iDeCo）：資産タブ・配当タブそれぞれ独立
  const [assetTaxFilter, setAssetTaxFilter] = useState<TaxCategoryType[]>([]);
  const [divTaxFilter, setDivTaxFilter]     = useState<TaxCategoryType[]>([]);
  // 銘柄構成円グラフ：この％未満の銘柄は「その他」にまとめる（空/0 = まとめない）
  // localStorage から前回の設定を復元
  const [stockOtherThresholdPct, setStockOtherThresholdPct] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('asset_other_threshold_pct') || '';
  });
  // 銘柄別配当円グラフ：同上（配当タブ用）
  const [divOtherThresholdPct, setDivOtherThresholdPct] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('div_other_threshold_pct') || '';
  });
  const [sortKey, setSortKey] = useState('marketValueJPY');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  // 保有銘柄一覧：米国株の表示通貨切替（円/ドル）。日本株には影響しない
  const [holdingsCurrencyDisplay, setHoldingsCurrencyDisplay] = useState<'JPY' | 'USD'>('JPY');
  // localStorage から前回の税引き設定を復元（なければ税引き後）
  const [isTaxIncluded, setIsTaxIncluded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('div_tax_setting');
    return saved !== null ? saved === 'true' : true;
  });
  // 確定月 / 支払月 切替（localStorage で永続化）
  const [divDateMode, setDivDateMode] = useState<'ex' | 'pay'>(() => {
    if (typeof window === 'undefined') return 'pay';
    return (localStorage.getItem('div_date_mode') as 'ex' | 'pay') || 'pay';
  });
  // 月別棒グラフで選択した月
  const [selectedDivMonth, setSelectedDivMonth] = useState<number | null>(null);
  const [mobileChartIndex, setMobileChartIndex] = useState(0);
  const [historyRange, setHistoryRange] = useState<RangeType>('1Y');

  const [session, setSession] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [stockData, setStockData] = useState<{ [key: string]: any }>({});
  const [usdjpy, setUsdjpy] = useState(150);
  const [history, setHistory] = useState<any[]>([]);
  const [showCharts, setShowCharts] = useState(false);

  const [detailedStockInfo, setDetailedStockDetail] = useState<any>(null);
  const [detailChartRange, setDetailChartRange] = useState<'1W'|'1M'|'3M'|'6M'|'1Y'|'3Y'>('1Y');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [priceLoadProgress, setPriceLoadProgress] = useState<{ done: number; total: number } | null>(null);
  const [waCodeInput, setWaCodeInput] = useState('');
  const [fundSymbolInput, setFundSymbolInput] = useState('');
  const [customDivMonths, setCustomDivMonths] = useState('');
  // 配当月編集モーダル
  const [editDivTarget, setEditDivTarget] = useState<any>(null);   // 編集対象holding
  const [editDivMonths, setEditDivMonths] = useState('');          // 編集中の支払月 // 日本株の支払月（手動入力）
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [newAccName, setNewAccName]     = useState('');
  const [newAccBroker, setNewAccBroker] = useState('');
  const [newAccType, setNewAccType]     = useState('証券');

  // ── 実績配当 ──────────────────────────────────────────
  const [actualDividends, setActualDividends] = useState<any[]>([]);
  const [showActualDivForm, setShowActualDivForm] = useState(false);
  const [actualDivYear,   setActualDivYear]   = useState(new Date().getFullYear());
  const [actualDivMonth,  setActualDivMonth]  = useState(new Date().getMonth() + 1);
  const [actualDivAmount, setActualDivAmount] = useState('');
  const [actualDivNote,   setActualDivNote]   = useState('');
  const [newAccountName, setNewAccountName] = useState('');

  // ── 売却モーダル state ───────────────────────────────────
  const [sellTarget, setSellTarget] = useState<any>(null);
  const [sellQty, setSellQty] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  // 売却単価の入力通貨（米国株のみ切替可能。日本株は常にJPY）
  const [sellCurrency, setSellCurrency] = useState<'JPY' | 'USD'>('JPY');
  const [sellDate, setSellDate] = useState(new Date().toISOString().split('T')[0]);
  const [sellMemo, setSellMemo] = useState('');
  const [sellLoading, setSellLoading] = useState(false);

  // ── 買い増しモーダル state ─────────────────────────────────
  const [buyTarget, setBuyTarget] = useState<any>(null);
  const [buyQty, setBuyQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyLoading, setBuyLoading] = useState(false);

  // ── 売却履歴タブ state ───────────────────────────────────
  const [sellHistory, setSellHistory] = useState<any[]>([]);
  const [sellDateFrom, setSellDateFrom] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [sellDateTo, setSellDateTo] = useState(new Date().toISOString().split('T')[0]);

  // ── 資産履歴手動登録 state ─────────────────────────────────
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [historyFormDate, setHistoryFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyFormAmount, setHistoryFormAmount] = useState('');
  const [historyFormAccount, setHistoryFormAccount] = useState('all');

  // ── 初期化 ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const timer = setTimeout(() => setShowCharts(true), 1500);
    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session) { fetchExchangeRate(); fetchCachedData(); fetchSellHistory(); fetchActualDividends(); }
    // USD/JPYレートは起動時に自動取得。株価は「更新」ボタンで手動取得。
  }, [session]);

  // accounts が取得された後に fetchHistory を実行（口座名マッピングのため）
  useEffect(() => {
    if (session && accounts.length > 0) fetchHistory();
  }, [session, accounts]);

  useEffect(() => {
    if (activeTab === 'sell' && session) fetchSellHistory();
  }, [activeTab]);

  // ── データ取得 ───────────────────────────────────────────
  const fetchExchangeRate = async () => {
    try {
      const res = await fetch('/api/stock?symbol=JPY=X');
      const data = await res.json();
      if (data.price) setUsdjpy(Number(data.price));
    } catch (e) {}
  };

  // ── DBキャッシュのみ読み込んで即時表示（外部API呼び出しなし）──
  const fetchCachedData = async () => {
    const { data: accs } = await supabase.from('accounts').select('*').order('created_at');
    const { data: holds } = await supabase
      .from('holdings')
      .select('*, last_price, last_currency, last_fetched_at, cached_stock_data');
    if (accs) setAccounts(accs);
    if (!holds) return;
    setHoldings(holds);

    // cached_stock_data を stockData にセット（25時間以内のキャッシュのみ有効）
    const cachedData: any = {};
    const now = Date.now();
    const CACHE_MAX_AGE_HOURS = 25;
    for (const h of holds) {
      if (h.cached_stock_data && h.last_fetched_at) {
        const ageHours = (now - new Date(h.last_fetched_at).getTime()) / (1000 * 60 * 60);
        if (ageHours < CACHE_MAX_AGE_HOURS) {
          cachedData[h.symbol] = h.cached_stock_data;
        }
      }
    }
    if (Object.keys(cachedData).length > 0) setStockData(cachedData);
  };

  // ── 外部APIから最新価格を取得してDB・画面に反映（手動更新ボタン用）──
  const fetchAllData = async () => {
    // まずDBからholdings一覧を取得（未ロードの場合に備えて）
    const { data: accs } = await supabase.from('accounts').select('*').order('created_at');
    const { data: holds } = await supabase
      .from('holdings')
      .select('*, last_price, last_currency, last_fetched_at, cached_stock_data');
    if (accs) setAccounts(accs);
    if (!holds) return;
    setHoldings(holds);

    // 全銘柄を取得対象に（キャッシュスキップなし・全て最新取得）
    const targets: { symbol: string; url: string }[] = [];
    const processed = new Set<string>();
    for (const h of holds) {
      if (processed.has(h.symbol)) continue;
      processed.add(h.symbol);
      const isFund = /^[0-9A-Z]{7,8}$/.test(h.symbol) && !h.symbol.endsWith('.T');
      const url = isFund && h.wa_code
        ? `/api/stock?symbol=${h.symbol}&wa_code=${h.wa_code}`
        : `/api/stock?symbol=${h.symbol}`;
      targets.push({ symbol: h.symbol, url });
    }

    if (targets.length === 0) return;

    setPriceLoadProgress({ done: 0, total: targets.length });

    // セマフォで並列数制御（同時3リクエスト）
    const CONCURRENCY = 3;
    let doneCount = 0;
    const semaphore = {
      running: 0,
      queue: [] as (() => void)[],
      acquire() {
        return new Promise<void>(resolve => {
          if (this.running < CONCURRENCY) { this.running++; resolve(); }
          else { this.queue.push(() => { this.running++; resolve(); }); }
        });
      },
      release() {
        this.running--;
        const next = this.queue.shift();
        if (next) next();
      },
    };

    await Promise.all(targets.map(async ({ symbol, url }) => {
      await semaphore.acquire();
      try {
        const res  = await fetch(url);
        const data = await res.json();
        if (!data.error) {
          // 画面に即時反映
          setStockData((prev: any) => ({ ...prev, [symbol]: data }));
          // DBキャッシュを更新（cron/daily と同様）
          const now = new Date().toISOString();
          await supabase
            .from('holdings')
            .update({
              last_price:        data.price,
              last_currency:     data.currency || 'JPY',
              last_fetched_at:   now,
              cached_stock_data: data,
            })
            .eq('symbol', symbol);
        }
      } catch (_e) {
        // 個別銘柄の失敗は他を止めない
      } finally {
        semaphore.release();
        doneCount++;
        setPriceLoadProgress({ done: doneCount, total: targets.length });
      }
    }));

    setPriceLoadProgress(null);
  };

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from('asset_history')
      .select('*')
      .eq('user_id', session?.user?.id)
      .order('recorded_date', { ascending: true }); // グラフ用に昇順
    if (error) { console.error('fetchHistory error:', error); return; }
    if (data) {
      // account_id から口座名を解決（accounts テーブルとの FK がないため手動マッピング）
      const enriched = data.map(item => ({
        ...item,
        accounts: accounts.find(a => a.id === item.account_id) || null,
      }));
      setHistory(enriched);
      // 設定タブ一覧は降順で表示
      setHistoryList([...enriched].reverse());
    }
  };

  // ── 実績配当 取得 ─────────────────────────────────────────
  const fetchActualDividends = async () => {
    const { data, error } = await supabase
      .from('dividends')
      .select('*')
      .eq('user_id', session?.user?.id)
      .order('pay_date', { ascending: true });
    if (error) console.error('fetchActualDividends error:', error);
    if (data) setActualDividends(data);
  };

  // ── 実績配当 手動登録 ─────────────────────────────────────
  const handleAddActualDiv = async () => {
    if (!actualDivAmount) { alert('金額を入力してください'); return; }
    const amount = parseFloat(actualDivAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount < 0) { alert('正しい金額を入力してください'); return; }

    // pay_date を「年月の1日」として生成
    const payDate = `${actualDivYear}-${String(actualDivMonth).padStart(2, '0')}-01`;

    // 既存チェック（同年月）
    const { data: existing } = await supabase
      .from('dividends')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('pay_date', payDate)
      .eq('symbol', '月次合計')    // 月次合計レコードの識別
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('dividends')
        .update({ amount: amount, memo: actualDivNote || null })
        .eq('id', (existing as any).id);
      if (error) { alert('更新失敗: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('dividends').insert([{
        user_id:  session.user.id,
        pay_date: payDate,
        amount:   amount,
        currency: 'JPY',
        symbol:   '月次合計',   // NOT NULL 制約対応
        name:     '月次配当合計',
        tax_type: '特定口座',
        memo:     actualDivNote || null,
      }]);
      if (error) { alert('登録失敗: ' + error.message); return; }
    }
    setActualDivAmount('');
    setActualDivNote('');
    setShowActualDivForm(false);
    fetchActualDividends();
  };

  const handleDeleteActualDiv = async (id: string) => {
    if (!confirm('この実績配当を削除しますか？')) return;
    await supabase.from('dividends').delete().eq('id', id);
    fetchActualDividends();
  };

  // ── 資産履歴 手動登録 ─────────────────────────────────────
  const handleAddHistory = async () => {
    if (!historyFormDate || !historyFormAmount) { alert('日付と金額を入力してください'); return; }
    const amount = parseFloat(historyFormAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount < 0) { alert('正しい金額を入力してください'); return; }

    const targetAccounts = historyFormAccount === 'all' ? accounts : accounts.filter(a => a.id === historyFormAccount);
    if (targetAccounts.length === 0) { alert('口座が見つかりません'); return; }

    const entries = targetAccounts.map(acc => ({
      user_id: session.user.id,
      account_id: acc.id,
      total_value_jpy: historyFormAccount === 'all' ? amount / accounts.length : amount,
      recorded_date: historyFormDate,
    }));

    // UNIQUE制約なしでも動くように：既存チェック後にinsert/update
    let hasError = false;
    for (const entry of entries) {
      const { data: existing } = await supabase
        .from('asset_history')
        .select('id')
        .eq('user_id', entry.user_id)
        .eq('account_id', entry.account_id)
        .eq('recorded_date', entry.recorded_date)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('asset_history')
          .update({ total_value_jpy: entry.total_value_jpy })
          .eq('id', (existing as any).id);
        if (error) { console.error('update error:', error); hasError = true; }
      } else {
        const { error } = await supabase.from('asset_history').insert([entry]);
        if (error) { console.error('insert error:', error); hasError = true; }
      }
    }

    if (hasError) { alert('一部の保存に失敗しました。コンソールを確認してください。'); return; }
    setShowHistoryForm(false);
    setHistoryFormAmount('');
    fetchHistory();
    alert('資産履歴を登録しました');
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('この履歴を削除しますか？')) return;
    await supabase.from('asset_history').delete().eq('id', id);
    fetchHistory();
  };

  const fetchSellHistory = async () => {
    const { data } = await supabase
      .from('sell_history')
      .select('*, accounts(name)')
      .order('sell_date', { ascending: false });
    if (data) setSellHistory(data);
  };

  // ── 手動更新（更新ボタン押下時） ──────────────────────────
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchExchangeRate();
      await fetchAllData(); // 外部APIから最新価格を取得してDBキャッシュも更新
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── 口座操作 ─────────────────────────────────────────────
  const toggleAccountSelection = (id: string) => {
    if (id === 'all') { setSelectedAccountIds(['all']); return; }
    let next = selectedAccountIds.filter(i => i !== 'all');
    next = next.includes(id) ? next.filter(i => i !== id) : [...next, id];
    setSelectedAccountIds(next.length === 0 || next.length === accounts.length ? ['all'] : next);
  };

  const addAccount = () => { setShowAddAccountForm(true); };

  const handleAddAccount = async () => {
    if (!newAccName.trim()) { alert('口座名を入力してください'); return; }
    const { error } = await supabase.from('accounts').insert([{
      name:    newAccName.trim(),
      broker:  newAccBroker.trim() || null,
      type:    newAccType,
      user_id: session.user.id,
    }]);
    if (error) { alert('追加失敗: ' + error.message); return; }
    setShowAddAccountForm(false);
    setNewAccName(''); setNewAccBroker(''); setNewAccType('証券');
    fetchCachedData();
  };

  const updateAccountName = async (id: string) => {
    await supabase.from('accounts').update({ name: newAccountName }).eq('id', id);
    setEditingAccountId(null); fetchCachedData();
  };

  // ── 銘柄操作 ─────────────────────────────────────────────
  const toggleCyclical = async (holdingId: string, current: string) => {
    const types: CyclicalType[] = ['景気敏感', '中立', 'ディフェンシブ'];
    const next = types[(types.indexOf(current as CyclicalType) + 1) % types.length];
    await supabase.from('holdings').update({ cyclical_override: next }).eq('id', holdingId);
    fetchCachedData();
  };

  const handleAddStock = async (e: any) => {
    e.preventDefault();
    const form = e.target;
    const accountId = form.accountId.value;
    const qty = parseFloat(form.quantity.value) || 0;
    const prc = parseFloat(form.price.value) || 0;
    const tax = form.taxType.value;
    const isFund = /^[0-9A-Z]{7,8}$/.test(selectedStock.symbol) && !selectedStock.symbol.endsWith('.T');
    const isJP   = selectedStock.symbol.endsWith('.T');
    const existing = holdings.find(h => h.symbol === selectedStock.symbol && h.account_id === accountId && h.tax_type === tax);
    const insertData: any = {
      account_id:    accountId,
      user_id:       session.user.id,
      symbol:        selectedStock.symbol,
      quantity:      qty,
      average_price: prc,
      tax_type:      tax,
      asset_class:   isFund ? '投資信託' : '株式',
    };
    if (isFund && selectedStock.wa_code) insertData.wa_code = selectedStock.wa_code;
    // カスタム支払月をDBに保存
    if (customDivMonths) {
      const parsed = customDivMonths.split(',').map(m => parseInt(m.trim())).filter(m => m >= 1 && m <= 12);
      if (parsed.length > 0) insertData.div_months = parsed.join(',');
    }
    if (existing) {
      await supabase.from('holdings').update({ quantity: qty, average_price: prc }).eq('id', existing.id);
    } else {
      await supabase.from('holdings').insert([insertData]);
    }
    setSelectedStock(null);
    setSearchQuery('');
    setWaCodeInput('');
    setFundSymbolInput('');
    setCustomDivMonths('');
    // 投信の場合、取得済み情報をstockDataキャッシュに即時反映
    if (isFund && selectedStock.price) {
      setStockData((prev: any) => ({
        ...prev,
        [selectedStock.symbol]: {
          price:          selectedStock.price,
          currency:       'JPY',
          name:           selectedStock.name,
          jpName:         selectedStock.jpName || selectedStock.name,
          sector:         '投資信託',
          cyclical:       '中立',
          dividendYield:  0,
          dividendRate:   selectedStock.dividendRate || 0,
          dividendMonths: [],
          wa_code:        selectedStock.wa_code,
          fundDividends:  selectedStock.fundDividends || [],
        },
      }));
    }
    fetchCachedData();
    setActiveTab('assets');
  };

  const handleManualAdd = () => {
    const symbol = prompt('銘柄コード（例: 0331418A）');
    if (!symbol) return;
    const name = prompt('銘柄名（例: eMAXIS Slim 全世界株式）');
    const price = prompt('現在の基準価額（1口/1株あたり）');
    if (name && price) {
      setSelectedStock({ symbol, name, price: parseFloat(price), currency: 'JPY', sector: '投資信託', cyclical: '中立', dividendYield: 0, dividendRate: 0 });
    }
  };

  // ── 売却処理 ─────────────────────────────────────────────
  // ── 買い増し処理 ────────────────────────────────────────────
  const openBuyModal = (h: any) => {
    setBuyTarget(h);
    const info = stockData[h.symbol];
    const rate = info?.currency === 'USD' ? usdjpy : 1;
    // 現在の株価を初期値にセット（なければ取得単価）
    setBuyPrice(String(Math.round((info?.price || h.average_price) * rate)));
    setBuyQty('');
  };

  const handleBuy = async () => {
    if (!buyTarget) return;
    const newQty   = parseFloat(buyQty);
    const newPrice = parseFloat(buyPrice);
    if (!newQty || !newPrice || newQty <= 0 || newPrice <= 0) {
      alert('保有数と平均取得単価を正しく入力してください');
      return;
    }
    setBuyLoading(true);
    try {
      const { error } = await supabase
        .from('holdings')
        .update({ quantity: newQty, average_price: newPrice })
        .eq('id', buyTarget.id);
      if (error) { alert('更新に失敗しました: ' + error.message); return; }
      setBuyTarget(null);
      fetchCachedData();
    } finally {
      setBuyLoading(false);
    }
  };

  const openSellModal = (h: any) => {
    setSellTarget(h);
    setSellQty(String(h.quantity));
    const info = stockData[h.symbol];
    const isUSD = info?.currency === 'USD';
    const rate = isUSD ? usdjpy : 1;
    // 米国株は初期表示もドル建てにする（円換算の二度手間を避ける）
    setSellCurrency(isUSD ? 'USD' : 'JPY');
    setSellPrice(isUSD
      ? String(Number((info?.price || h.average_price || 0)).toFixed(2))
      : String(Math.round((info?.price || h.average_price) * rate))
    );
    setSellDate(new Date().toISOString().split('T')[0]);
    setSellMemo('');
  };

  const handleSell = async () => {
    if (!sellTarget) return;
    const qty = parseFloat(sellQty);
    const rawPrice = parseFloat(sellPrice);
    if (!qty || !rawPrice || qty <= 0 || rawPrice <= 0) { alert('数量と売却単価を正しく入力してください'); return; }
    if (qty > sellTarget.quantity) { alert(`保有数（${sellTarget.quantity}）を超えています`); return; }

    setSellLoading(true);
    const info = stockData[sellTarget.symbol];
    const rate = info?.currency === 'USD' ? usdjpy : 1;
    // ドル入力時は現在のUSDJPYレートで円換算してから記録（DB上は一貫してJPYで保存）
    const price = sellCurrency === 'USD' ? rawPrice * usdjpy : rawPrice;
    const avgCostJPY = Number(sellTarget.average_price) * rate;
    const realizedGain = (price - avgCostJPY) * qty;
    const jpName = info?.jpName || info?.name || sellTarget.symbol;

    const { error: sellErr } = await supabase.from('sell_history').insert([{
      user_id:       session.user.id,
      account_id:    sellTarget.account_id,
      symbol:        sellTarget.symbol,
      name:          jpName,
      sell_date:     sellDate,
      sell_price:    price,
      quantity:      qty,
      average_price: avgCostJPY,
      currency:      'JPY',
      tax_type:      sellTarget.tax_type,
      realized_gain: realizedGain,
      memo:          sellMemo,
    }]);

    if (sellErr) { alert('売却記録の保存に失敗しました: ' + sellErr.message); setSellLoading(false); return; }

    // 全売却なら削除・一部売却なら数量を減算
    const remaining = sellTarget.quantity - qty;
    if (remaining <= 0.000001) {
      await supabase.from('holdings').delete().eq('id', sellTarget.id);
    } else {
      await supabase.from('holdings').update({ quantity: remaining }).eq('id', sellTarget.id);
    }

    setSellLoading(false);
    setSellTarget(null);
    fetchCachedData();
    fetchSellHistory();
    alert(`売却を記録しました\n実現損益: ${realizedGain >= 0 ? '+' : ''}¥${Math.floor(realizedGain).toLocaleString()}`);
  };

  // ── 配当タブ設定（localStorage永続化） ──────────────────────
  const handleTaxToggle = (val: boolean) => {
    setIsTaxIncluded(val);
    localStorage.setItem('div_tax_setting', String(val));
  };
  const handleDivDateMode = (val: 'ex' | 'pay') => {
    setDivDateMode(val);
    localStorage.setItem('div_date_mode', val);
  };

  // ── 円グラフ「その他」まとめ閾値（localStorage永続化） ──────────
  const handleStockOtherThreshold = (val: string) => {
    setStockOtherThresholdPct(val);
    localStorage.setItem('asset_other_threshold_pct', val);
  };
  const handleDivOtherThreshold = (val: string) => {
    setDivOtherThresholdPct(val);
    localStorage.setItem('div_other_threshold_pct', val);
  };

  // ── 配当月編集 ───────────────────────────────────────────
  const handleSaveDivMonths = async () => {
    if (!editDivTarget) return;
    const parsed = editDivMonths
      .split(',')
      .map(m => parseInt(m.trim()))
      .filter(m => m >= 1 && m <= 12);
    const value = parsed.length > 0 ? parsed.join(',') : null;
    await supabase.from('holdings').update({ div_months: value }).eq('id', editDivTarget.id);
    setEditDivTarget(null);
    setEditDivMonths('');
    fetchCachedData();
  };

  // ── 配当月編集 ───────────────────────────────────────────
  const saveCurrentToHistory = async () => {
    if (!confirm('本日の履歴を更新(上書き)しますか？')) return;
    const today = new Date().toISOString().split('T')[0];
    const entries = accounts.map(acc => {
      const accHoldings = holdings.filter(h => h.account_id === acc.id);
      const total = accHoldings.reduce((sum, h) => {
        const info = stockData[h.symbol];
        const rate    = info?.currency === 'USD' ? usdjpy : 1;
        const isFundH = h.asset_class === '投資信託' || info?.sector === '投資信託';
        const price_  = Number(info?.price || h.average_price || 0) * rate;
        const val     = isFundH ? price_ * h.quantity / 10000 : price_ * h.quantity;
        return sum + val;
      }, 0);
      return { user_id: session.user.id, account_id: acc.id, total_value_jpy: total, recorded_date: today };
    });
    // 既存チェック後にinsert/update（UNIQUE制約不要）
    let saveError = false;
    for (const entry of entries) {
      const { data: existing } = await supabase
        .from('asset_history')
        .select('id')
        .eq('user_id', entry.user_id)
        .eq('account_id', entry.account_id)
        .eq('recorded_date', entry.recorded_date)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase.from('asset_history').update({ total_value_jpy: entry.total_value_jpy }).eq('id', (existing as any).id);
        if (error) { console.error(error); saveError = true; }
      } else {
        const { error } = await supabase.from('asset_history').insert([entry]);
        if (error) { console.error(error); saveError = true; }
      }
    }
    if (saveError) alert('一部保存失敗。コンソールを確認してください'); else { alert('履歴を更新しました'); fetchHistory(); }
  };

  const handlePasswordChange = async (e: any) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: e.target.password.value });
    if (error) alert(error.message); else alert('パスワードを更新しました');
  };

  const showStockDetail = async (h: any) => {
    setLoading(true);
    setDetailChartRange('1Y'); // 詳細表示時は常に1Yにリセット
    try {
      const isFund = /^[0-9A-Z]{7,8}$/.test(h.symbol) && !h.symbol.endsWith('.T');
      if (isFund) {
        const cached = stockData[h.symbol] || {};
        let fundDetail: any = {};
        if (h.wa_code) {
          const res = await fetch(`/api/fund?wa_code=${h.wa_code}`);
          if (res.ok) fundDetail = await res.json();
        }
        setDetailedStockDetail({
          symbol:         h.symbol,
          jpName:         fundDetail.name || cached.jpName || cached.name || h.symbol,
          name:           fundDetail.name || cached.name || h.symbol,
          price:          fundDetail.price || cached.price || h.average_price,
          date:           fundDetail.date  || null,
          currency:       'JPY',
          sector:         '投資信託',
          changeAmount:   fundDetail.changeAmount || null,
          changeRate:     fundDetail.changeRate   || null,
          aum:            fundDetail.aum_million_jpy || null,
          dividendYield:  0,
          trailingPE:     null,
          priceToBook:    null,
          chartData:      [],
          fundDividends:  fundDetail.dividends || cached.fundDividends || [],
          latestDividend: fundDetail.latestDividend || null,
          wa_code:        h.wa_code,
          isFund:         true,
        });
      } else {
        const url = `/api/stock?symbol=${h.symbol}`;
        const res = await fetch(url);
        const data = await res.json();
        setDetailedStockDetail({ ...data, symbol: h.symbol });
      }
    } catch (e) {
      setDetailedStockDetail({ symbol: h.symbol, jpName: h.jpName });
    } finally { setLoading(false); }
  };

  // チャート期間変更時に再取得
  const changeDetailChartRange = async (range: '1W'|'1M'|'3M'|'6M'|'1Y'|'3Y') => {
    if (!detailedStockInfo || detailedStockInfo.isFund) return;
    setDetailChartRange(range);
    try {
      const rangeMap = { '1W': '5d', '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y', '3Y': '3y' };
      const res = await fetch(`/api/stock?symbol=${detailedStockInfo.symbol}&range=${rangeMap[range]}`);
      const data = await res.json();
      if (data.chartData) {
        setDetailedStockDetail((prev: any) => ({ ...prev, chartData: data.chartData }));
      }
    } catch (e) {}
  };

  // ── 銘柄検索 ─────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length < 1) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/stock?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (e) { setSearchResults([]); }
      setIsSearching(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectStock = async (item: any) => {
    setLoading(true);
    const isFund = /^[0-9A-Z]{7,8}$/.test(item.symbol) && !item.symbol.endsWith('.T');
    try {
      // 投信かつWAコード入力済みの場合はfund APIも呼び出す
      const url = isFund && waCodeInput
        ? `/api/stock?symbol=${item.symbol}&wa_code=${waCodeInput}`
        : `/api/stock?symbol=${item.symbol}`;
      const res = await fetch(url);
      const data = await res.json();
      setSelectedStock({ ...data, wa_code: isFund ? waCodeInput : undefined });
    } finally { setLoading(false); }
  };

  // ── NISA生涯投資枠 消化状況 ──────────────────────────────
  // 資産クラス/口座区分フィルターの影響を受けない「口座選択」のみのスコープで算出
  // 現在保有分の簿価（取得価額）合計から算出。売却により復活した枠は考慮していない。
  // 年間投資枠（成長240万円/年・つみたて120万円/年）は購入日データがないため未算出。
  const nisaQuota = useMemo(() => {
    const GROWTH_SUB_LIMIT   = 12_000_000; // 成長投資枠：生涯上限（内数）
    const LIFETIME_TOTAL_LIMIT = 18_000_000; // 生涯非課税保有限度額（成長+つみたて合算）

    const scoped = holdings.filter(h => selectedAccountIds.includes('all') || selectedAccountIds.includes(h.account_id));

    let growthCost = 0, tsumitateCost = 0;
    scoped.forEach(h => {
      if (h.tax_type !== 'NISA(成長)' && h.tax_type !== 'NISA(つみたて)') return;
      const info = stockData[h.symbol];
      const rate = info?.currency === 'USD' ? usdjpy : 1;
      const isFundH = h.asset_class === '投資信託' || info?.sector === '投資信託';
      const avgJPY = Number(h.average_price || 0) * rate;
      const cost = isFundH ? avgJPY * h.quantity / 10000 : avgJPY * h.quantity;
      if (h.tax_type === 'NISA(成長)') growthCost += cost;
      else tsumitateCost += cost;
    });

    const totalCost = growthCost + tsumitateCost;
    return {
      growthCost, tsumitateCost, totalCost,
      growthLimit: GROWTH_SUB_LIMIT,
      totalLimit: LIFETIME_TOTAL_LIMIT,
      growthPct: Math.min(100, GROWTH_SUB_LIMIT > 0 ? growthCost / GROWTH_SUB_LIMIT * 100 : 0),
      totalPct:  Math.min(100, LIFETIME_TOTAL_LIMIT > 0 ? totalCost / LIFETIME_TOTAL_LIMIT * 100 : 0),
    };
  }, [holdings, selectedAccountIds, stockData, usdjpy]);

  // ── 集計 ─────────────────────────────────────────────────
  const processedData = useMemo(() => {
    const getBaseData = (filter: MarketType[], taxFilter: TaxCategoryType[]) => {
      let totalValue = 0, totalCost = 0, totalDivPre = 0, totalDivPost = 0;
      // 総資産・総コストはフィルター前の全銘柄で計算（別途 allList ループ）
      // ※ allList のループは後述の detailed ループとは別に計算する
      const sectorMapAsset: any = {}, stockMapAsset: any = {}, cyclicalMapAsset: any = { '景気敏感': 0, 'ディフェンシブ': 0, '中立': 0 };
      const sectorMapDiv: any  = {}, stockMapDiv: any  = {}, cyclicalMapDiv: any  = { '景気敏感': 0, 'ディフェンシブ': 0, '中立': 0 };
      const monthsData = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0, actual: 0, stocks: [] as any[] }));

      // 口座フィルター適用（全銘柄ベース → 総資産計算に使用）
      const allList = holdings.filter(h => selectedAccountIds.includes('all') || selectedAccountIds.includes(h.account_id));
      // 資産クラスフィルター（銘柄構成グラフ・評価額合計・配当の内訳すべてに適用）
      let list = allList;
      if (filter.length > 0) {
        list = list.filter(h => {
          const info = stockData[h.symbol];
          const isJP   = h.symbol.endsWith('.T');
          const isUS   = info?.currency === 'USD' && !isJP;
          const isFund = info?.sector === '投資信託' || h.asset_class === '投資信託';
          return filter.some(f => {
            if (f === '日本株')   return isJP;
            if (f === '米国株')   return isUS;
            if (f === '投資信託') return isFund;
            return true;
          });
        });
      }
      // 口座区分フィルター（特定口座/NISA/iDeCo）。資産クラスフィルターとはAND条件
      if (taxFilter.length > 0) {
        list = list.filter(h => {
          const isNisaH  = ['NISA(成長)', 'NISA(つみたて)'].includes(h.tax_type);
          const isIdecoH = h.tax_type === 'iDeCo';
          return taxFilter.some(t => {
            if (t === 'NISA')     return isNisaH;
            if (t === 'iDeCo')    return isIdecoH;
            if (t === '特定口座') return !isNisaH && !isIdecoH;
            return true;
          });
        });
      }
      // ── 総資産・総コストを「フィルター後」の銘柄で計算 ──
      // フィルター選択時（日本株/米国株/投資信託）は選択した資産クラスの合計のみを表示する
      // info（株価）がロード済みの銘柄のみ集計（未ロード時に取得単価で計算するのを防止）
      list.forEach(h => {
        const info = stockData[h.symbol];
        if (!info?.price) return; // 株価未取得はスキップ（ロード完了後に再計算される）
        const rate    = info.currency === 'USD' ? usdjpy : 1;
        const isFundH = h.asset_class === '投資信託' || info.sector === '投資信託';
        const price_  = Number(info.price) * rate;
        const avg_    = Number(h.average_price || 0) * rate;
        totalValue += isFundH ? price_ * h.quantity / 10000 : price_ * h.quantity;
        totalCost  += isFundH ? avg_   * h.quantity / 10000 : avg_   * h.quantity;
      });

      const detailed = list.map(h => {
        const info = stockData[h.symbol];
        const rate = info?.currency === 'USD' ? usdjpy : 1;
        const isNisa  = ['NISA(成長)', 'NISA(つみたて)'].includes(h.tax_type);
        const isIdeco = h.tax_type === 'iDeCo';
        const isUSD   = info?.currency === 'USD';
        const isFundHolding = h.asset_class === '投資信託' || info?.sector === '投資信託';
        // 投信：quantity = 保有口数、price = 基準価額（1口あたり円）
        // 評価額 = 基準価額 × 保有口数 / 10000
        // 株式：price × quantity
        const currentPriceJPY = Number(info?.price || h.average_price || 0) * rate;
        const avgPriceJPY     = Number(h.average_price || 0) * rate;
        const valueJPY = isFundHolding
          ? currentPriceJPY * h.quantity / 10000
          : currentPriceJPY * h.quantity;
        const costJPY = isFundHolding
          ? avgPriceJPY * h.quantity / 10000
          : avgPriceJPY * h.quantity;

        // 配当月（div_months手動入力を最優先）
        let divMonths: number[] = [];
        if (h.div_months) {
          // 手動登録した支払月を最優先（投信・日本株共通）
          divMonths = h.div_months.split(',').map((m: string) => parseInt(m.trim())).filter((m: number) => m >= 1 && m <= 12);
        } else if (isFundHolding) {
          // 投信：WAから取得したdividendMonths（前年実績）
          divMonths = info?.dividendMonths || [];
        } else {
          divMonths = info?.dividendMonths?.length
            ? info.dividendMonths
            : (isUSD ? [1, 4, 7, 10] : [6, 12]);
        }

        // 配当単価の計算
        // 投信：月次分配金単価（円/口）× 支払月数 = 年間分配金
        // 株式：annualDividendRate（年間配当レート）を使用
        const singleDivRate = isFundHolding
          // 投信: annualDividendRate = 年間分配金合計（円/口×10000）
          // dividendRate = 月次単価。annualDividendRate が取れていればそちらを優先
          ? (info?.annualDividendRate || (info?.dividendRate || 0) * Math.max(divMonths.length, 1))
          : (() => {
            // 株式: dividendRate = 1株あたり年間配当額（円 or USD）
            if (info?.dividendRate && info.dividendRate > 0) return info.dividendRate;
            // フォールバック: price × dividendYield（小数スケール正規化済み）
            const yield_ = info?.dividendYield || 0;
            const price_  = Number(info?.price || 0);
            return price_ * yield_;
          })();

        // 投信：singleDivJPY = 1口あたり年間分配金（÷10000で口あたり換算）
        // 株式：singleDivJPY = 1株あたり年間配当（円換算）
        const singleDivJPY = isFundHolding
          ? singleDivRate / 10000
          : singleDivRate * rate;
        const divPreTotal = singleDivJPY * h.quantity;
        let divPostTotal = divPreTotal;
        if (isIdeco) {
          divPostTotal = divPreTotal;
        } else if (isNisa && isUSD) {
          divPostTotal = divPreTotal * 0.9;
        } else if (isNisa && !isUSD) {
          divPostTotal = divPreTotal;
        } else if (isUSD) {
          divPostTotal = divPreTotal * 0.9 * (1 - 0.20315);
        } else {
          divPostTotal = divPreTotal * (1 - 0.20315);
        }
        const activeDivTotal = isTaxIncluded ? divPostTotal : divPreTotal;
        // totalValue/totalCostはallListで計算済み。配当のみ加算
        totalDivPre += divPreTotal; totalDivPost += divPostTotal;

        const jpName = info?.jpName || info?.name || h.name || h.symbol;
        const sec    = info?.sector || 'その他';
        const cyc    = h.cyclical_override || info?.cyclical || '中立';

        sectorMapAsset[sec]  = (sectorMapAsset[sec]  || 0) + valueJPY;
        stockMapAsset[jpName]= (stockMapAsset[jpName]|| 0) + valueJPY;
        cyclicalMapAsset[cyc]= (cyclicalMapAsset[cyc]|| 0) + valueJPY;
        sectorMapDiv[sec]    = (sectorMapDiv[sec]    || 0) + activeDivTotal;
        stockMapDiv[jpName]  = (stockMapDiv[jpName]  || 0) + activeDivTotal;
        cyclicalMapDiv[cyc]  = (cyclicalMapDiv[cyc]  || 0) + activeDivTotal;

        // 確定月：支払月の3ヶ月前
        const exMonths: number[] = divMonths.map((m: number) => (m - 3 + 12) % 12 || 12);
        const targetMonths = divDateMode === 'pay' ? divMonths : exMonths;
        targetMonths.forEach(m => {
          const amt = activeDivTotal / targetMonths.length;
          monthsData[m - 1].amount += amt;
          monthsData[m - 1].stocks.push({ symbol: h.symbol, name: jpName, amount: amt, account: accounts.find((a: any) => a.id === h.account_id)?.name || '未設定' });
        });

        return {
          ...h, jpName, currentPriceJPY, avgPriceJPY, singleDivJPY,
          marketValueJPY: valueJPY,
          profitLoss:     valueJPY - costJPY,
          profitRate:     costJPY > 0 ? ((valueJPY - costJPY) / costJPY) * 100 : 0,
          annualDiv:      activeDivTotal,
          divYield: isFundHolding
            ? (currentPriceJPY > 0 ? (singleDivRate / currentPriceJPY) * 100 : 0)
            : (info?.dividendYield || 0) * 100,
          annualRate:     costJPY > 0 ? (divPreTotal / costJPY * 100) : 0,
          sector: sec, cyclical: cyc,
          accountName: accounts.find((a: any) => a.id === h.account_id)?.name,
          payMonths: targetMonths.join(','),
          changeAmount: info?.changeAmount ?? null,
          changeRate:   info?.changeRate   ?? null,
          // ドル表示切替用：米国株のみ意味を持つ生のUSD建て値
          isUSD,
          currentPriceUSD: Number(info?.price || h.average_price || 0),
          avgPriceUSD:     Number(h.average_price || 0),
          marketValueUSD:  rate > 0 ? valueJPY / rate : valueJPY,
          profitLossUSD:   rate > 0 ? (valueJPY - costJPY) / rate : (valueJPY - costJPY),
        };
      });

      // 値の大きい順にソート（すべての円グラフ・凡例表示に反映）
      const toPie = (map: any) => Object.entries(map)
        .map(([name, value]) => ({ name, value: Number(value) }))
        .sort((a, b) => b.value - a.value);
      return {
        totalValue, totalCost,
        totalDiv: isTaxIncluded ? totalDivPost : totalDivPre,
        assetPies: { stock: toPie(stockMapAsset), sector: toPie(sectorMapAsset), cyclical: toPie(cyclicalMapAsset) },
        divPies:   { stock: toPie(stockMapDiv),   sector: toPie(sectorMapDiv),   cyclical: toPie(cyclicalMapDiv) },
        monthlyDividends: monthsData, holdings: detailed,
      };
    };

    const assetDataResult = getBaseData(assetMarketFilter, assetTaxFilter);
    const divDataResult   = getBaseData(divMarketFilter, divTaxFilter);

    // 実績配当を月別にマッピング（当年分のみ・pay_date から year/month を解析）
    const currentYear = new Date().getFullYear();
    actualDividends.forEach(d => {
      if (!d.pay_date) return;
      const dt = new Date(d.pay_date + 'T00:00:00');
      if (dt.getFullYear() !== currentYear) return;
      const idx = dt.getMonth(); // 0-indexed
      divDataResult.monthlyDividends[idx].actual =
        (divDataResult.monthlyDividends[idx].actual || 0) + (d.amount || 0);
    });
    const sortedHoldings  = [...assetDataResult.holdings].sort((a: any, b: any) => {
      const vA = a[sortKey], vB = b[sortKey];
      return sortOrder === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
    });

    const historyMap: any = {};
    history.forEach(item => {
      if (selectedAccountIds.includes('all') || selectedAccountIds.includes(item.account_id)) {
        historyMap[item.recorded_date] = (historyMap[item.recorded_date] || 0) + item.total_value_jpy;
      }
    });
    const aggregatedHistory = Object.entries(historyMap)
      .map(([date, value]) => ({ recorded_date: date, total_value_jpy: value }))
      .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));

    const filteredHistory = aggregatedHistory.filter(item => {
      if (historyRange === 'ALL') return true;
      // タイムゾーンズレを防ぐため日付文字列をそのまま比較
      const itemDate = new Date(item.recorded_date + 'T00:00:00');
      const diffDays = (Date.now() - itemDate.getTime()) / 86400000;
      return diffDays <= ({ '1D': 2, '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366 } as any)[historyRange];
    });

    return { assetDataResult, divDataResult, sortedHoldings, filteredHistory };
  }, [holdings, stockData, usdjpy, selectedAccountIds, assetMarketFilter, divMarketFilter, assetTaxFilter, divTaxFilter, isTaxIncluded, sortKey, sortOrder, accounts, history, historyRange, divDateMode, actualDividends]);

  // ── 売却履歴フィルタ・サマリー ────────────────────────────
  const filteredSellHistory = useMemo(() =>
    sellHistory.filter(s =>
      s.sell_date >= sellDateFrom && s.sell_date <= sellDateTo &&
      (selectedAccountIds.includes('all') || selectedAccountIds.includes(s.account_id))
    ), [sellHistory, sellDateFrom, sellDateTo, selectedAccountIds]);

  const sellSummary = useMemo(() => ({
    totalGain: filteredSellHistory.reduce((s, r) => s + (r.realized_gain || 0), 0),
    totalSold: filteredSellHistory.reduce((s, r) => s + r.sell_price * r.quantity, 0),
    winCount:  filteredSellHistory.filter(r => (r.realized_gain || 0) >= 0).length,
    total:     filteredSellHistory.length,
  }), [filteredSellHistory]);

  // ── 保有銘柄一覧：米国株のドル/円表示切替ヘルパー ─────────
  // 米国株かつUSD表示選択時のみドル表示。日本株・投信は常に円表示のまま
  const showUSD = (h: any) => h.isUSD && holdingsCurrencyDisplay === 'USD';
  const fmtPrice = (h: any, jpyVal: number, usdVal: number) =>
    showUSD(h) ? `$${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `¥${Math.floor(jpyVal).toLocaleString()}`;
  const fmtSigned = (h: any, jpyVal: number, usdVal: number) => {
    const v = showUSD(h) ? usdVal : jpyVal;
    const sym = showUSD(h) ? '$' : '¥';
    const disp = showUSD(h) ? Math.abs(v).toFixed(2) : Math.floor(Math.abs(v)).toLocaleString();
    return `${v >= 0 ? '+' : '-'}${sym}${disp}`;
  };

  if (!session) return <Auth />;

  // ── 売却モーダルの損益プレビュー計算 ─────────────────────
  const sellPreviewGain = (() => {
    if (!sellTarget || !sellQty || !sellPrice) return null;
    const info = stockData[sellTarget.symbol];
    const rate = info?.currency === 'USD' ? usdjpy : 1;
    const priceJPY = sellCurrency === 'USD' ? parseFloat(sellPrice) * usdjpy : parseFloat(sellPrice);
    return (priceJPY - Number(sellTarget.average_price) * rate) * parseFloat(sellQty);
  })();

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 pb-20 font-sans overflow-hidden font-black">

      {/* ══════════════════════════════════════
          配当月編集モーダル
      ══════════════════════════════════════ */}
      {editDivTarget && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-black text-slate-800">配当月を編集</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{editDivTarget.jpName || editDivTarget.symbol}</p>
              </div>
              <button onClick={() => setEditDivTarget(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={18}/></button>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-[10px] text-blue-600">
              <p className="font-black mb-1">支払月をカンマ区切りで入力</p>
              <p>例）トヨタ: <code className="bg-blue-100 px-1 rounded">6,12</code></p>
              <p>例）毎月分配: <code className="bg-blue-100 px-1 rounded">1,2,3,4,5,6,7,8,9,10,11,12</code></p>
              <p>例）四半期（米国株）: <code className="bg-blue-100 px-1 rounded">1,4,7,10</code></p>
              <p className="mt-1 text-blue-400">空欄にすると自動取得に戻ります</p>
            </div>
            <input
              type="text"
              placeholder="例: 6,12"
              className="w-full p-4 bg-slate-100 rounded-xl outline-none text-base font-bold focus:ring-2 focus:ring-blue-300"
              value={editDivMonths}
              onChange={e => setEditDivMonths(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setEditDivMonths(''); }}
                className="flex-1 py-3 bg-slate-100 text-slate-500 font-black rounded-xl text-sm active:scale-95 transition-all">
                クリア（自動）
              </button>
              <button
                onClick={handleSaveDivMonths}
                className="flex-1 py-3 bg-blue-600 text-white font-black rounded-xl text-sm active:scale-95 transition-all">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          売却モーダル
      ══════════════════════════════════════ */}
      {sellTarget && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-black text-slate-800">売却</h2>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5">{sellTarget.jpName || sellTarget.symbol}</p>
                <p className="text-[10px] text-slate-400">保有数: {Number(sellTarget.quantity).toLocaleString()}</p>
              </div>
              <button onClick={() => setSellTarget(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={18}/></button>
            </div>

            <div className="space-y-4 text-xs font-black">
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">売却日</label>
                <input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)}
                  className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">売却数量</label>
                  <input type="number" step="any" value={sellQty} onChange={e => setSellQty(e.target.value)}
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest">
                      売却単価（{sellCurrency === 'USD' ? '$' : '円'}）
                    </label>
                    {stockData[sellTarget.symbol]?.currency === 'USD' && (
                      <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0">
                        {(['JPY', 'USD'] as const).map(c => (
                          <button key={c} type="button"
                            onClick={() => {
                              // 通貨切替時、現在の入力値を新しい通貨に換算し直す
                              const cur = parseFloat(sellPrice);
                              if (!isNaN(cur) && cur > 0) {
                                const converted = c === 'USD' ? cur / usdjpy : cur * usdjpy;
                                setSellPrice(c === 'USD' ? converted.toFixed(2) : String(Math.round(converted)));
                              }
                              setSellCurrency(c);
                            }}
                            className={`px-2 py-0.5 rounded text-[9px] font-black transition-all ${sellCurrency === c ? 'bg-white shadow-sm text-red-500' : 'text-slate-400'}`}>
                            {c === 'USD' ? '$' : '¥'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input type="number" step="any" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">メモ（任意）</label>
                <input type="text" value={sellMemo} onChange={e => setSellMemo(e.target.value)}
                  placeholder="利確・損切りの理由など"
                  className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" />
              </div>

              {/* 損益プレビュー */}
              {sellPreviewGain !== null && (
                <div className={`p-3 rounded-xl text-center ${sellPreviewGain >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className="text-[10px] text-slate-400 mb-1">予想実現損益</p>
                  <p className={`text-xl font-black ${sellPreviewGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {sellPreviewGain >= 0 ? '+' : ''}¥{Math.floor(sellPreviewGain).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            <button onClick={handleSell} disabled={sellLoading}
              className="w-full py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50 text-sm">
              {sellLoading ? '処理中...' : '売却を確定する'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          買い増しモーダル
      ══════════════════════════════════════ */}
      {buyTarget && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-black text-slate-800">買い増し</h2>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5">{buyTarget.jpName || buyTarget.symbol}</p>
                <p className="text-[10px] text-slate-400">現在: {Number(buyTarget.quantity).toLocaleString()}{buyTarget.asset_class === '投資信託' ? '口' : '株'} · 取得単価 ¥{Math.floor(Number(buyTarget.average_price)).toLocaleString()}</p>
              </div>
              <button onClick={() => setBuyTarget(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={18}/></button>
            </div>

            <div className="space-y-4 text-xs font-black">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">更新後の保有数</label>
                  <input type="number" step="any" value={buyQty} onChange={e => setBuyQty(e.target.value)}
                    placeholder={String(buyTarget.quantity)}
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">更新後の平均単価（円）</label>
                  <input type="number" step="any" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                    placeholder={String(Math.floor(Number(buyTarget.average_price)))}
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" />
                </div>
              </div>
            </div>

            <button onClick={handleBuy} disabled={buyLoading}
              className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50 text-sm">
              {buyLoading ? '処理中...' : '更新する'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          銘柄詳細モーダル
      ══════════════════════════════════════ */}
      {detailedStockInfo && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col text-xs font-black">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl text-slate-800 leading-tight font-black">{detailedStockInfo.jpName || detailedStockInfo.name}</h2>
                <p className="text-[10px] text-slate-400 font-bold">{detailedStockInfo.symbol} • {detailedStockInfo.sector}</p>
                {detailedStockInfo.wa_code && (
                  <p className="text-[10px] text-amber-500">WAコード: {detailedStockInfo.wa_code}</p>
                )}
              </div>
              <button onClick={() => setDetailedStockDetail(null)} className="p-2 hover:bg-slate-200 rounded-full"><X /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">

              {/* 投信の場合 */}
              {detailedStockInfo.isFund ? (
                <>
                  {/* 基準価額サマリー */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    {[
                      { label: '基準価額', value: detailedStockInfo.price ? `¥${Number(detailedStockInfo.price).toLocaleString()}` : '-', color: '' },
                      {
                        label: '前日比',
                        value: detailedStockInfo.changeAmount != null
                          ? `${detailedStockInfo.changeAmount >= 0 ? '+' : ''}${detailedStockInfo.changeAmount}円 (${detailedStockInfo.changeRate}%)`
                          : detailedStockInfo.changeRate != null
                            ? `${detailedStockInfo.changeRate >= 0 ? '+' : ''}${detailedStockInfo.changeRate}%`
                            : '-',
                        color: detailedStockInfo.changeRate != null
                          ? detailedStockInfo.changeRate >= 0 ? 'text-emerald-600' : 'text-red-500'
                          : '',
                      },
                      { label: '純資産総額', value: detailedStockInfo.aum ? `${Number(detailedStockInfo.aum).toLocaleString()}百万円` : '-', color: '' },
                      { label: '評価基準日', value: detailedStockInfo.date || '-', color: '' },
                    ].map((item, i) => (
                      <div key={i} className="bg-slate-50 p-4 rounded-2xl border">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{item.label}</p>
                        <p className={`text-sm font-black ${item.color || 'text-slate-700'}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* 分配金履歴 */}
                  {detailedStockInfo.fundDividends?.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">分配金履歴</h3>
                      <div className="bg-slate-50 rounded-2xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[9px] uppercase text-slate-400 border-b">
                              <th className="p-3 text-left">年</th>
                              <th className="p-3 text-right">年間合計</th>
                              <th className="p-3 text-left">月別明細</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detailedStockInfo.fundDividends.map((d: any, i: number) => (
                              <tr key={i} className="hover:bg-slate-100 transition-colors">
                                <td className="p-3 font-black">{d.year}年</td>
                                <td className={`p-3 text-right font-black ${d.totalAmount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  ¥{d.totalAmount.toLocaleString()}
                                </td>
                                <td className="p-3">
                                  {d.monthlyDetails?.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {d.monthlyDetails.map((m: any, j: number) => (
                                        <span key={j} className={`text-[9px] px-1.5 py-0.5 rounded font-black ${m.amount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                          {m.date}: ¥{m.amount}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 text-[10px]">明細なし</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {(!detailedStockInfo.fundDividends || detailedStockInfo.fundDividends.length === 0) && (
                    <p className="text-center text-slate-300 italic py-4">分配金なし（無分配ファンド）</p>
                  )}

                  {/* WAリンク */}
                  <div className="pt-2 text-center">
                    {detailedStockInfo.wa_code && (
                      <a href={`https://www.wealthadvisor.co.jp/snapshot/${detailedStockInfo.wa_code}`}
                        target="_blank" className="inline-flex items-center gap-2 text-amber-600 text-xs hover:underline mr-4">
                        <ExternalLink size={14}/> ウエルスアドバイザーで詳細を見る
                      </a>
                    )}
                    <a href={`https://finance.yahoo.co.jp/quote/${detailedStockInfo.symbol}`}
                      target="_blank" className="inline-flex items-center gap-2 text-blue-600 text-xs hover:underline">
                      <ExternalLink size={14}/> Yahoo Finance
                    </a>
                  </div>
                </>
              ) : (
                /* 株式・ETFの場合（既存のチャート表示） */
                <>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={14}/> 株価推移
                      </h3>
                      {/* レンジ切替 */}
                      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl shadow-inner">
                        {(['1W','1M','3M','6M','1Y','3Y'] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => changeDetailChartRange(r)}
                            className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${detailChartRange === r ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="h-64 w-full bg-slate-50 rounded-3xl p-4 shadow-inner">
                      {detailedStockInfo.chartData?.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={detailedStockInfo.chartData}>
                            <defs>
                              <linearGradient id="colorCloseD" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                            <XAxis dataKey="date" axisLine={false} tickLine={false}
                              tickFormatter={t => {
                                const d = new Date(t);
                                if (detailChartRange === '1W' || detailChartRange === '1M') {
                                  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric' });
                                }
                                if (detailChartRange === '3M' || detailChartRange === '6M' || detailChartRange === '1Y') {
                                  return d.toLocaleString('ja-JP', { month: 'short' });
                                }
                                // 3Y
                                return d.toLocaleString('ja-JP', { year: '2-digit', month: 'short' });
                              }}
                              tick={{ fontSize: 10 }}/>
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              domain={['auto', 'auto']}
                              width={45}
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v: number) =>
                                detailedStockInfo.currency === 'USD'
                                  ? `$${v.toFixed(v >= 100 ? 0 : 2)}`
                                  : v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
                              }
                            />
                            <Tooltip content={<CustomTooltip currencyRate={detailedStockInfo.currency === 'USD' ? usdjpy : 1}/>}/>
                            <Area type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={3} fill="url(#colorCloseD)"/>
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-300 italic">データ取得中...</div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                    {[
                      { label: '現在値', value: `¥${Math.floor((detailedStockInfo.price || 0) * (detailedStockInfo.currency === 'USD' ? usdjpy : 1)).toLocaleString()}`, color: '' },
                      {
                        label: '前日比',
                        value: detailedStockInfo.changeAmount != null
                          ? `${detailedStockInfo.changeAmount >= 0 ? '+' : ''}${detailedStockInfo.changeAmount} (${detailedStockInfo.changeRate}%)`
                          : detailedStockInfo.changeRate != null
                            ? `${detailedStockInfo.changeRate >= 0 ? '+' : ''}${detailedStockInfo.changeRate}%`
                            : '-',
                        color: detailedStockInfo.changeRate != null
                          ? detailedStockInfo.changeRate >= 0 ? 'text-emerald-600' : 'text-red-500'
                          : '',
                      },
                      { label: '利回り', value: `${((detailedStockInfo.dividendYield || 0) * 100).toFixed(2)}%`, color: '' },
                      { label: 'PER', value: detailedStockInfo.trailingPE?.toFixed(1) || '-', color: '' },
                      { label: 'PBR', value: detailedStockInfo.priceToBook?.toFixed(1) || '-', color: '' },
                    ].map((item, i) => (
                      <div key={i} className="bg-slate-50 p-4 rounded-2xl border">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{item.label}</p>
                        <p className={`text-sm font-black ${item.color || 'text-slate-700'}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 text-center">
                    <a href={`https://finance.yahoo.co.jp/quote/${detailedStockInfo.symbol}`} target="_blank"
                      className="inline-flex items-center gap-2 text-blue-600 text-xs hover:underline">
                      <ExternalLink size={14}/> Yahoo Financeでさらに詳しく
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          ヘッダー
      ══════════════════════════════════════ */}
      {/* 案2: 価格ロード進捗バー ── ヘッダー上部に表示 */}
      {priceLoadProgress && (
        <div className="fixed top-0 left-0 right-0 z-[300]">
          <div className="h-1 bg-slate-200">
            <div
              className="h-1 bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.round((priceLoadProgress.done / priceLoadProgress.total) * 100)}%` }}
            />
          </div>
          <div className="bg-blue-600 text-white text-[10px] font-black px-3 py-0.5 flex justify-between items-center">
            <span className="opacity-70">最新価格に更新中...</span>
            <span>{priceLoadProgress.done} / {priceLoadProgress.total}</span>
          </div>
        </div>
      )}
      <header className="bg-white border-b px-4 py-3 flex justify-between items-center z-40 shadow-sm">
        <h1 className="text-xl font-black text-blue-600 flex items-center gap-1 italic">
          <ChartIcon size={22} fill="#2563eb"/>管理
        </h1>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 flex items-center gap-2 shadow-sm text-[10px] font-black">
            <span className="text-slate-400 uppercase">USD/JPY</span>
            <span className="text-slate-700">¥{usdjpy.toFixed(2)}</span>
          </div>
          {/* 更新ボタン */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="最新価格に更新"
            className={`p-2 rounded-full border shadow-sm transition-all active:scale-95 text-[10px] font-black flex items-center gap-1.5
              ${isRefreshing
                ? 'bg-slate-100 text-slate-300 cursor-not-allowed border-slate-200'
                : 'bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border-slate-200'
              }`}>
            <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''}/>
            <span className="hidden sm:inline">{isRefreshing ? '更新中...' : '更新'}</span>
          </button>
          <div className="relative">
            <button onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              className="bg-slate-100 rounded-full px-4 py-2 text-[10px] font-black border border-slate-200 shadow-sm active:scale-95 transition-all">
              口座 ({selectedAccountIds.includes('all') ? '全て' : `${selectedAccountIds.length}件`})
            </button>
            {isAccountMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border p-2 z-[100] text-xs font-black">
                <button onClick={() => toggleAccountSelection('all')} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl">
                  {selectedAccountIds.includes('all') ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16} className="text-slate-300"/>}
                  <span>全て選択</span>
                </button>
                <div className="h-px bg-slate-100 my-1 mx-2"/>
                {accounts.map(acc => (
                  <button key={acc.id} onClick={() => toggleAccountSelection(acc.id)} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl text-left">
                    {selectedAccountIds.includes(acc.id) ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16} className="text-slate-300"/>}
                    <span className="truncate">{acc.name}</span>
                  </button>
                ))}
                <button onClick={() => setIsAccountMenuOpen(false)} className="w-full mt-2 py-2 bg-slate-900 text-white rounded-xl">閉じる</button>
              </div>
            )}
          </div>
          <button onClick={() => setActiveTab('add')} className="p-2 bg-blue-600 text-white rounded-full shadow-lg active:scale-95 transition-all">
            <PlusCircle size={20}/>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════
          メインコンテンツ
      ══════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto p-3 md:p-8 max-w-7xl mx-auto w-full font-black">

        {/* ── 資産タブ ── */}
        {activeTab === 'assets' && (
          <div className="space-y-6 animate-in fade-in">
            <MarketTabs active={assetMarketFilter} onChange={setAssetMarketFilter}/>
            <TaxTabs active={assetTaxFilter} onChange={setAssetTaxFilter}/>

            {/* NISA生涯投資枠 消化状況（保有中のNISA銘柄がある場合のみ表示） */}
            {nisaQuota.totalCost > 0 && (
              <div className="bg-white p-5 rounded-[2rem] border shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-black">NISA生涯投資枠 消化状況</h3>
                  <span className="text-[9px] text-slate-400 font-bold">簿価（取得価額）ベース・現在レート換算</span>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-black mb-1.5">
                    <span className="text-slate-600">合計（成長 + つみたて）</span>
                    <span>¥{Math.floor(nisaQuota.totalCost).toLocaleString()} <span className="text-slate-400 font-bold">/ ¥{nisaQuota.totalLimit.toLocaleString()}</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${nisaQuota.totalPct}%` }}/>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-black mb-1.5">
                    <span className="text-slate-600">うち成長投資枠（内数上限）</span>
                    <span>¥{Math.floor(nisaQuota.growthCost).toLocaleString()} <span className="text-slate-400 font-bold">/ ¥{nisaQuota.growthLimit.toLocaleString()}</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${nisaQuota.growthPct}%` }}/>
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed">
                  ※ 売却により復活した枠は考慮していません（現在保有中の簿価合計のみで計算）。年間投資枠（成長240万円/年・つみたて120万円/年）の消化状況は購入日データを保持していないため未対応です。
                </p>
              </div>
            )}

            {/* 円グラフ3種 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: '銘柄構成',   data: groupOthers(processedData.assetDataResult.assetPies.stock, parseFloat(stockOtherThresholdPct) || 0) },
                { title: 'セクター構成', data: processedData.assetDataResult.assetPies.sector },
                { title: '景気影響構成', data: processedData.assetDataResult.assetPies.cyclical },
              ].map((chart, idx) => (
                <div key={idx} className={`${idx === mobileChartIndex ? 'block' : 'hidden'} md:block bg-white p-5 rounded-[2rem] border shadow-sm h-[420px]`}>
                  <h3 className="text-[10px] uppercase mb-2 tracking-widest text-center flex items-center justify-center gap-1.5 flex-wrap">
                    <span>{chart.title}</span>
                    {idx === 0 && (
                      <span className="flex items-center gap-1 normal-case text-slate-400 font-bold">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={stockOtherThresholdPct}
                          onChange={e => handleStockOtherThreshold(e.target.value)}
                          placeholder="0"
                          className="w-12 text-[10px] border border-slate-200 rounded px-1 py-0.5 text-center text-slate-600 focus:outline-none focus:border-blue-400"
                          title="この％未満の銘柄をその他にまとめる"
                        />
                        <span>%未満をその他へ</span>
                      </span>
                    )}
                  </h3>
                  <div className="h-[90%] w-full relative">
                    <DonutCenter
                      label="評価額合計"
                      value={processedData.assetDataResult.totalValue}
                      sub={`${processedData.assetDataResult.totalValue - processedData.assetDataResult.totalCost >= 0 ? '+' : ''}${Math.floor(processedData.assetDataResult.totalValue - processedData.assetDataResult.totalCost).toLocaleString()} (${(processedData.assetDataResult.totalCost > 0 ? (processedData.assetDataResult.totalValue - processedData.assetDataResult.totalCost) / processedData.assetDataResult.totalCost * 100 : 0).toFixed(1)}%)`}
                    />
                    {showCharts && chart.data.length > 0 ? (
                      <div className="absolute inset-0" style={{ zIndex: 10 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 30, bottom: 30, left: 30, right: 30 }}>
                            <Pie data={chart.data} innerRadius="55%" outerRadius="75%" paddingAngle={2} dataKey="value" label={renderPieLabel} labelLine style={{ fontSize: '9px' }}>
                              {chart.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>} wrapperStyle={{ zIndex: 9999 }}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs italic" style={{ zIndex: 10 }}>データなし</div>
                    )}
                  </div>
                </div>
              ))}
              {/* モバイル: グラフ選択タブ */}
              <div className="flex md:hidden bg-slate-100 p-1 rounded-2xl gap-1">
                {['地域別', 'セクタ', '口座別'].map((label, i) => (
                  <button key={i} onClick={() => setMobileChartIndex(i)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${
                      mobileChartIndex === i ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 資産推移 */}
            <div className="bg-white p-8 rounded-[3rem] border shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-400">総資産推移</h3>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-full text-[9px]">
                  {(['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'] as RangeType[]).map(r => (
                    <button key={r} onClick={() => setHistoryRange(r)}
                      className={`px-4 py-1.5 rounded-full transition-all ${historyRange === r ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="h-72 w-full text-[10px]">
                {showCharts && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={processedData.filteredHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="recorded_date" axisLine={false} tickLine={false}
                        tickFormatter={t => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} dy={10}/>
                      <YAxis axisLine={false} tickLine={false} tickFormatter={v => (v / 10000).toFixed(0) + '万'} dx={-5} domain={['auto', 'auto']}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Line type="linear" dataKey="total_value_jpy" stroke="#2563eb" strokeWidth={4}
                        dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }}/>
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 保有銘柄一覧 */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-2 text-sm">
                <h3 className="uppercase flex items-center gap-2 tracking-tighter"><Filter size={14}/> 保有銘柄一覧</h3>
                <div className="flex items-center gap-2">
                  <div className="flex bg-white border rounded-full p-0.5 shadow-sm" title="米国株の表示通貨（日本株には影響しません）">
                    {(['JPY', 'USD'] as const).map(c => (
                      <button key={c} onClick={() => setHoldingsCurrencyDisplay(c)}
                        className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${holdingsCurrencyDisplay === c ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}>
                        {c === 'USD' ? '$' : '¥'}
                      </button>
                    ))}
                  </div>
                  <select className="bg-white border text-[10px] px-3 py-1.5 rounded-full outline-none font-black"
                    value={sortKey} onChange={e => setSortKey(e.target.value)}>
                    <option value="created_at">登録順</option>
                    <option value="symbol">コード順</option>
                    <option value="divYield">利回り順</option>
                    <option value="marketValueJPY">評価額順</option>
                    <option value="profitLoss">損益順</option>
                    <option value="annualRate">年利順</option>
                  </select>
                  <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="p-1.5 bg-white border rounded-full active:bg-slate-100 shadow-sm">
                    {sortOrder === 'desc' ? <SortDesc size={14}/> : <SortAsc size={14}/>}
                  </button>
                </div>
              </div>
              {/* デスクトップ: テーブル表示 */}
              <div className="hidden md:block bg-white rounded-[2rem] border shadow-sm overflow-hidden overflow-x-auto text-xs">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-slate-50 text-[9px] uppercase border-b h-12 font-black">
                      <th className="p-3 pl-6">銘柄名・コード</th>
                      <th className="p-3 text-right">取得額 / 保有数</th>
                      <th className="p-3 text-right">株価 / 前日比</th>
                      <th className="p-3 text-right">評価額 / 損益</th>
                      <th className="p-3 text-right">配当（年）</th>
                      <th className="p-3 text-center">配当月</th>
                      <th className="p-3">セクタ / 影響</th>
                      <th className="p-3">口座</th>
                      <th className="p-3 text-center">詳細</th>
                      <th className="p-3 text-center">売却</th>
                      <th className="p-3 text-center">購入</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {processedData.sortedHoldings.map((h: any) => (
                      <tr key={h.id} className="hover:bg-blue-50/30 transition-colors h-16 group">
                        <td className="p-3 pl-6 max-w-[200px]">
                          <div className="text-[14px] font-black leading-tight line-clamp-1">{h.jpName}</div>
                          <div className="text-[10px] text-slate-400 tracking-tighter uppercase flex items-center gap-1 flex-wrap">
                            <span>{h.symbol}</span>
                            {h.tax_type && (
                              <span className={`px-1.5 py-0.5 rounded font-black ${h.tax_type.includes('NISA') ? 'bg-amber-50 text-amber-600' : h.tax_type === 'iDeCo' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>{h.tax_type}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="text-[12px] font-black">{fmtPrice(h, h.avgPriceJPY, h.avgPriceUSD)}</div>
                          <div className="text-[10px] text-slate-400">{Number(h.quantity).toLocaleString()}{h.asset_class === '投資信託' ? '口' : '株'}</div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="text-[12px] font-black">{fmtPrice(h, h.currentPriceJPY, h.currentPriceUSD)}</div>
                          <div className={`text-[10px] font-black ${h.changeRate != null ? (h.changeRate >= 0 ? 'text-emerald-500' : 'text-red-500') : 'text-slate-300'}`}>
                            {h.changeRate != null
                              ? `${h.changeRate >= 0 ? '+' : ''}${h.changeRate.toFixed(2)}%`
                              : '-'
                            }
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="text-[12px] font-black">{fmtPrice(h, h.marketValueJPY, h.marketValueUSD)}</div>
                          <div className={`text-[10px] ${h.profitLoss >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {fmtSigned(h, h.profitLoss, h.profitLossUSD)} ({h.profitRate.toFixed(1)}%)
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="text-[12px] font-black text-emerald-600">¥{Math.floor(h.annualDiv).toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400">{h.annualRate.toFixed(2)}% / 年</div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center items-center gap-1 flex-wrap">
                            {h.payMonths && h.payMonths !== ''
                              ? h.payMonths.split(',').map((m: string) => (
                                  <span key={m} className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-black">{m}</span>
                                ))
                              : <span className="text-slate-300 text-[10px]">-</span>
                            }
                            <button onClick={() => { setEditDivTarget(h); setEditDivMonths(h.div_months || h.payMonths || ''); }}
                              className="p-1 text-slate-300 hover:text-blue-500 transition-colors ml-0.5" title="配当月を編集">
                              <Edit3 size={11}/>
                            </button>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-[10px] line-clamp-1">{h.sector}</div>
                          <button onClick={() => toggleCyclical(h.id, h.cyclical)}
                            className={`text-[8px] px-1.5 py-0.5 rounded font-black transition-all ${h.cyclical === '景気敏感' ? 'bg-red-50 text-red-500' : h.cyclical === 'ディフェンシブ' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'}`}>
                            {h.cyclical}
                          </button>
                        </td>
                        <td className="p-3 text-slate-500 text-[11px]">{h.accountName}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => showStockDetail(h)}
                            className="p-2 bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white rounded-full transition-all shadow-sm">
                            <Info size={16}/>
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => openSellModal(h)}
                            className="p-2 bg-slate-100 text-slate-400 hover:bg-red-500 hover:text-white rounded-full transition-all shadow-sm">
                            <TrendingDown size={16}/>
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => openBuyModal(h)}
                            className="p-2 bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white rounded-full transition-all shadow-sm">
                            <Plus size={16}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* モバイル: カード表示 */}
              <div className="md:hidden space-y-3">
                {processedData.sortedHoldings.map((h: any) => (
                  <div key={h.id} className="bg-white rounded-[1.5rem] border shadow-sm p-4 space-y-3">
                    {/* 銘柄名 + アクションボタン */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm leading-tight line-clamp-2">{h.jpName && h.jpName !== h.symbol ? h.jpName : (h.name || h.jpName || h.symbol)}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-tight mt-0.5 flex items-center gap-1 flex-wrap"><span>{h.symbol}</span><span>·</span><span>{h.accountName}</span>{h.tax_type && (<span className={h.tax_type.includes("NISA") ? "bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[8px] font-black ml-0.5" : h.tax_type === "iDeCo" ? "bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[8px] font-black ml-0.5" : "bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[8px] font-black ml-0.5"}>{h.tax_type}</span>)}</div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => showStockDetail(h)}
                          className="p-2 bg-slate-100 text-slate-400 active:bg-blue-600 active:text-white rounded-full transition-all">
                          <Info size={15}/>
                        </button>
                        <button onClick={() => openBuyModal(h)}
                          className="p-2 bg-slate-100 text-slate-400 active:bg-blue-600 active:text-white rounded-full transition-all">
                          <Plus size={15}/>
                        </button>
                        <button onClick={() => openSellModal(h)}
                          className="p-2 bg-slate-100 text-slate-400 active:bg-red-500 active:text-white rounded-full transition-all">
                          <TrendingDown size={15}/>
                        </button>
                      </div>
                    </div>

                    {/* 数値グリッド 2×2 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 rounded-xl p-2.5">
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">評価額</div>
                        <div className="text-sm font-black">{fmtPrice(h, h.marketValueJPY, h.marketValueUSD)}</div>
                        <div className={`text-[10px] font-black ${h.profitLoss >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {h.profitLoss >= 0 ? '▲' : '▼'}{fmtSigned(h, Math.abs(h.profitLoss), Math.abs(h.profitLossUSD)).replace(/^[+-]/, '')} ({h.profitRate.toFixed(1)}%)
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2.5">
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">年間配当</div>
                        <div className="text-sm font-black text-emerald-600">¥{Math.floor(h.annualDiv).toLocaleString()}</div>
                        <div className="text-[10px] text-blue-600 font-black">{h.divYield.toFixed(2)}% · {h.annualRate.toFixed(2)}%/年</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2.5">
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">株価</div>
                        <div className="text-sm font-black">{fmtPrice(h, h.currentPriceJPY, h.currentPriceUSD)}</div>
                        <div className="text-[10px] text-slate-400">取得 {fmtPrice(h, h.avgPriceJPY, h.avgPriceUSD)}</div>
                        {h.changeRate != null && (
                          <div className={`text-[10px] font-black ${h.changeRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {h.changeRate >= 0 ? '+' : ''}{h.changeRate.toFixed(2)}%
                            {h.changeAmount != null && (
                              <span className="ml-1 font-normal opacity-75">
                                ({h.changeAmount >= 0 ? '+' : ''}{h.changeAmount.toFixed(1)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2.5">
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">保有数</div>
                        <div className="text-sm font-black">{Number(h.quantity).toLocaleString()}{h.asset_class === '投資信託' ? '口' : '株'}</div>
                        <div className="text-[10px] text-slate-400">{h.sector}</div>
                      </div>
                    </div>

                    {/* 配当月 + セクタバッジ */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[9px] text-slate-400 font-black mr-1">配当月</span>
                        {h.payMonths && h.payMonths !== ''
                          ? h.payMonths.split(',').map((m: string) => (
                              <span key={m} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-black">{m}月</span>
                            ))
                          : <span className="text-slate-300 text-[10px]">未設定</span>
                        }
                        <button onClick={() => { setEditDivTarget(h); setEditDivMonths(h.div_months || h.payMonths || ''); }}
                          className="p-1 text-slate-300 active:text-blue-500 transition-colors">
                          <Edit3 size={11}/>
                        </button>
                      </div>
                      <button onClick={() => toggleCyclical(h.id, h.cyclical)}
                        className={`text-[8px] px-2 py-1 rounded-full font-black transition-all ${h.cyclical === '景気敏感' ? 'bg-red-50 text-red-500' : h.cyclical === 'ディフェンシブ' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'}`}>
                        {h.cyclical}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}


        {/* ── 配当タブ ── */}
        {activeTab === 'div' && (
          <div className="space-y-6 animate-in fade-in">
            <MarketTabs active={divMarketFilter} onChange={setDivMarketFilter}/>
            <TaxTabs active={divTaxFilter} onChange={setDivTaxFilter}/>

            {/* 上段：年間配当 + 表示設定 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-emerald-600 text-white p-8 rounded-[2.5rem] shadow-xl flex flex-col justify-center leading-none tracking-tight">
                <p className="text-xs opacity-60 uppercase mb-1 tracking-widest">年間配当合計</p>
                <p className="text-5xl font-black">¥{Math.floor(processedData.divDataResult.totalDiv || 0).toLocaleString()}</p>
                <p className="text-[10px] mt-4 bg-white/20 px-3 py-1 rounded-full w-fit">
                  月平均: ¥{Math.floor(processedData.divDataResult.totalDiv / 12 || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm flex flex-col gap-4">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-black">表示設定</p>
                <div>
                  <p className="text-[10px] text-slate-500 font-black mb-1.5">金額表示</p>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl shadow-inner">
                    <button onClick={() => handleTaxToggle(false)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${!isTaxIncluded ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>税引き前</button>
                    <button onClick={() => handleTaxToggle(true)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${isTaxIncluded ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>税引き後</button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-black mb-1.5">月の基準</p>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl shadow-inner">
                    <button onClick={() => handleDivDateMode('pay')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${divDateMode === 'pay' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>支払月</button>
                    <button onClick={() => handleDivDateMode('ex')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${divDateMode === 'ex' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>確定月</button>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 text-[10px] text-slate-500 font-bold space-y-1.5 border border-slate-100">
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest font-black mb-2">適用税率（概算）</p>
                  <div className="flex justify-between items-center"><span>日本株（特定口座）</span><span className="text-slate-700 font-black">20.315%</span></div>
                  <div className="flex justify-between items-center"><span>米国株（特定口座）</span><span className="text-slate-700 font-black">28.2835%</span></div>
                  <div className="flex justify-between items-center"><span>米国株（NISA）</span><span className="text-amber-600 font-black">10%（現地源泉のみ）</span></div>
                  <div className="flex justify-between items-center"><span>日本株（NISA）</span><span className="text-emerald-600 font-black">非課税</span></div>
                </div>
              </div>
            </div>

            {/* 円グラフ3種 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: '銘柄別配当',  data: groupOthers(processedData.divDataResult.divPies.stock, parseFloat(divOtherThresholdPct) || 0) },
                { title: 'セクター配当', data: processedData.divDataResult.divPies.sector },
                { title: '景気影響配当', data: processedData.divDataResult.divPies.cyclical },
              ].map((chart, idx) => (
                <div key={idx} className={`${idx === mobileChartIndex ? 'block' : 'hidden'} md:block bg-white p-5 rounded-[2rem] border shadow-sm h-[420px]`}>
                  <h3 className="text-[10px] uppercase mb-2 tracking-widest text-center font-black flex items-center justify-center gap-1.5 flex-wrap">
                    <span>{chart.title}</span>
                    {idx === 0 && (
                      <span className="flex items-center gap-1 normal-case text-slate-400 font-bold">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={divOtherThresholdPct}
                          onChange={e => handleDivOtherThreshold(e.target.value)}
                          placeholder="0"
                          className="w-12 text-[10px] border border-slate-200 rounded px-1 py-0.5 text-center text-slate-600 focus:outline-none focus:border-blue-400"
                          title="この％未満の銘柄をその他にまとめる"
                        />
                        <span>%未満をその他へ</span>
                      </span>
                    )}
                  </h3>
                  <div className="h-[90%] w-full relative">
                    <DonutCenter label="配当合計" value={processedData.divDataResult.totalDiv}/>
                    {showCharts && chart.data.length > 0 ? (
                      <div className="absolute inset-0" style={{ zIndex: 10 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 30, bottom: 30, left: 30, right: 30 }}>
                            <Pie data={chart.data} innerRadius="55%" outerRadius="75%" paddingAngle={2} dataKey="value" label={renderPieLabel} labelLine style={{ fontSize: '10px' }}>
                              {chart.data.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>} wrapperStyle={{ zIndex: 9999 }}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs italic" style={{ zIndex: 10 }}>計算中...</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 月別配当棒グラフ（予想 vs 実績） */}
            <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
                  月別配当（{divDateMode === 'pay' ? '支払月' : '確定月'}基準）
                </h3>
                <div className="flex items-center gap-3">
                  {/* 凡例 */}
                  <div className="flex items-center gap-2 text-[9px] font-black text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block"/>予想
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block"/>実績
                  </div>
                  {selectedDivMonth !== null && (
                    <button onClick={() => setSelectedDivMonth(null)}
                      className="text-[10px] text-blue-500 font-black hover:text-blue-700 transition-colors">
                      ← 全月
                    </button>
                  )}
                </div>
              </div>
              <div className="h-56 w-full text-[10px]">
                {showCharts && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={processedData.divDataResult.monthlyDividends}
                      margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
                      barCategoryGap="25%"
                      barGap={2}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="month" tickFormatter={(m: any) => `${m}月`} axisLine={false} tickLine={false} tick={{ fontSize: 10 }}/>
                      <YAxis axisLine={false} tickLine={false} tickFormatter={(v: any) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v)} dx={-5}/>
                      <Tooltip
                        formatter={(v: any, name: string) => [`¥${Math.floor(v).toLocaleString()}`, name === 'amount' ? '予想' : '実績']}
                        labelFormatter={(l: any) => `${l}月`}
                        contentStyle={{ ...tooltipStyle, zIndex: 9999 }}
                      />
                      {/* 予想バー */}
                      <Bar
                        dataKey="amount"
                        name="amount"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(data: any) => {
                          const m = data?.month;
                          if (m != null) setSelectedDivMonth((prev: number | null) => prev === m ? null : m);
                        }}
                      >
                        {processedData.divDataResult.monthlyDividends.map((entry: any, i: number) => (
                          <Cell
                            key={i}
                            fill={entry.month === selectedDivMonth ? '#059669' : entry.amount > 0 ? '#34d399' : '#e2e8f0'}
                          />
                        ))}
                        <LabelList
                          dataKey="amount"
                          position="top"
                          style={{ fontSize: '8px', fill: '#94a3b8' }}
                          formatter={(v: any) => v > 0 ? `${Math.floor(v / 1000)}k` : ''}
                        />
                      </Bar>
                      {/* 実績バー */}
                      <Bar
                        dataKey="actual"
                        name="actual"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(data: any) => {
                          const m = data?.month;
                          if (m != null) setSelectedDivMonth((prev: number | null) => prev === m ? null : m);
                        }}
                      >
                        {processedData.divDataResult.monthlyDividends.map((entry: any, i: number) => (
                          <Cell
                            key={i}
                            fill={entry.actual > 0 ? '#3b82f6' : 'transparent'}
                          />
                        ))}
                        <LabelList
                          dataKey="actual"
                          position="top"
                          style={{ fontSize: '8px', fill: '#3b82f6' }}
                          formatter={(v: any) => v > 0 ? `${Math.floor(v / 1000)}k` : ''}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              {selectedDivMonth !== null && (
                <p className="text-center text-[10px] text-blue-500 font-black mt-2 animate-in fade-in">
                  {selectedDivMonth}月を選択中 ↓
                </p>
              )}
            </div>

            {/* 選択月の銘柄リスト */}
            {selectedDivMonth !== null && (() => {
              const monthData = processedData.divDataResult.monthlyDividends[selectedDivMonth - 1];
              const stocks: any[] = monthData?.stocks || [];
              return (
                <div className="bg-white rounded-[2rem] border border-blue-100 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200">
                  <div className="px-6 py-4 border-b bg-blue-50 flex items-center justify-between">
                    <div>
                      <h3 className="text-[11px] font-black text-blue-700 uppercase tracking-widest">
                        {selectedDivMonth}月 配当銘柄
                      </h3>
                      <p className="text-[10px] text-blue-500 mt-0.5">
                        合計: ¥{Math.floor(monthData?.amount || 0).toLocaleString()} / {stocks.length}銘柄
                      </p>
                    </div>
                    <button onClick={() => setSelectedDivMonth(null)} className="p-1.5 hover:bg-blue-100 rounded-full transition-colors">
                      <X size={14} className="text-blue-400"/>
                    </button>
                  </div>
                  {stocks.length === 0 ? (
                    <p className="p-8 text-center text-slate-300 text-xs italic">この月の配当銘柄はありません</p>
                  ) : (
                    <table className="w-full text-xs font-black">
                      <thead>
                        <tr className="text-[9px] uppercase text-slate-400 border-b bg-slate-50">
                          <th className="p-3 pl-6 text-left">銘柄</th>
                          <th className="p-3 text-right">予想配当額</th>
                          <th className="p-3 text-right">構成比</th>
                          <th className="p-3 text-right pr-6">口座</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {[...stocks]
                          .sort((a: any, b: any) => b.amount - a.amount)
                          .map((s: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 pl-6">
                                <div className="font-black text-slate-800">{s.name}</div>
                                <div className="text-[10px] text-slate-400">{s.symbol}</div>
                              </td>
                              <td className="p-3 text-right text-emerald-600 font-black">¥{Math.floor(s.amount).toLocaleString()}</td>
                              <td className="p-3 text-right text-slate-500">
                                {monthData.amount > 0 ? ((s.amount / monthData.amount) * 100).toFixed(1) : '0'}%
                              </td>
                              <td className="p-3 text-right text-slate-400 text-[11px] pr-6">{s.account}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── 売却履歴タブ ── */}
        {activeTab === 'sell' && (
          <div className="space-y-6 animate-in fade-in">
            {/* 期間フィルタ */}
            <div className="bg-white p-5 rounded-[2rem] border shadow-sm flex flex-col md:flex-row gap-4 items-center">
              <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-black flex-shrink-0">期間フィルタ</h3>
              <div className="flex items-center gap-3 text-sm font-black">
                <input type="date" value={sellDateFrom} onChange={e => setSellDateFrom(e.target.value)}
                  className="p-2 bg-slate-100 rounded-xl outline-none text-sm font-bold"/>
                <span className="text-slate-400">〜</span>
                <input type="date" value={sellDateTo} onChange={e => setSellDateTo(e.target.value)}
                  className="p-2 bg-slate-100 rounded-xl outline-none text-sm font-bold"/>
              </div>
            </div>

            {/* サマリーカード */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: '実現損益合計', value: `${sellSummary.totalGain >= 0 ? '+' : ''}¥${Math.floor(sellSummary.totalGain).toLocaleString()}`, color: sellSummary.totalGain >= 0 ? 'text-emerald-600' : 'text-red-500' },
                { label: '売却総額',     value: `¥${Math.floor(sellSummary.totalSold).toLocaleString()}`, color: 'text-slate-700' },
                { label: '取引件数',     value: `${sellSummary.total}件`,  color: 'text-slate-700' },
                { label: '勝率',         value: sellSummary.total > 0 ? `${Math.round(sellSummary.winCount / sellSummary.total * 100)}%` : '-', color: 'text-blue-600' },
              ].map((card, i) => (
                <div key={i} className="bg-white p-5 rounded-[1.5rem] border shadow-sm text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-black">{card.label}</p>
                  <p className={`text-lg font-black ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* 履歴テーブル */}
            <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
              <p className="md:hidden text-[10px] text-slate-400 px-5 pt-4 font-black">← 横スクロールで全項目を確認</p>
              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] text-xs font-black">
                <thead>
                  <tr className="bg-slate-50 text-[9px] uppercase border-b font-black">
                    <th className="p-3 pl-6">売却日</th>
                    <th className="p-3">銘柄</th>
                    <th className="p-3 text-right">売却単価</th>
                    <th className="p-3 text-right">取得単価</th>
                    <th className="p-3 text-right">数量</th>
                    <th className="p-3 text-right">売却総額</th>
                    <th className="p-3 text-right">実現損益</th>
                    <th className="p-3">口座</th>
                    <th className="p-3">課税区分</th>
                    <th className="p-3">メモ</th>
                    <th className="p-3 text-center">削除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredSellHistory.length === 0 ? (
                    <tr><td colSpan={11} className="p-10 text-center text-slate-300 italic">売却履歴がありません</td></tr>
                  ) : filteredSellHistory.map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors h-14">
                      <td className="p-3 pl-6 text-slate-500">{s.sell_date}</td>
                      <td className="p-3">
                        <div className="font-black">{s.name}</div>
                        <div className="text-[10px] text-slate-400">{s.symbol}</div>
                      </td>
                      <td className="p-3 text-right">¥{Math.floor(s.sell_price).toLocaleString()}</td>
                      <td className="p-3 text-right text-slate-500">¥{Math.floor(s.average_price).toLocaleString()}</td>
                      <td className="p-3 text-right">{Number(s.quantity).toLocaleString()}</td>
                      <td className="p-3 text-right">¥{Math.floor(s.sell_price * s.quantity).toLocaleString()}</td>
                      <td className={`p-3 text-right font-black ${(s.realized_gain || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {(s.realized_gain || 0) >= 0 ? '+' : ''}¥{Math.floor(s.realized_gain || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">{s.accounts?.name || '-'}</td>
                      <td className="p-3 text-slate-500 text-[10px]">{s.tax_type || '-'}</td>
                      <td className="p-3 text-slate-400 text-[11px] max-w-[120px] truncate">{s.memo || '-'}</td>
                      <td className="p-3 text-center">
                        <button onClick={async () => {
                          if (!confirm('この売却履歴を削除しますか？')) return;
                          await supabase.from('sell_history').delete().eq('id', s.id);
                          fetchSellHistory();
                        }} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 size={14}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>{/* overflow-x-auto */}
            </div>
          </div>
        )}

        {/* ── 設定タブ ── */}
        {/* ── 設定タブ ── */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in py-6 text-left">

            {/* ── 資産履歴 ── */}
            <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
              <div className="p-6 border-b bg-blue-50 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-black text-blue-800 flex items-center gap-2">
                    <Database size={18}/> 資産履歴
                  </h3>
                  <p className="text-[10px] text-blue-600 mt-0.5">
                    資産推移グラフ用のデータを手動登録します
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveCurrentToHistory}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[11px] font-black rounded-xl shadow active:scale-95 transition-all">
                    <RefreshCcw size={14}/> 今日の残高を保存
                  </button>
                  <button
                    onClick={() => { setShowHistoryForm(!showHistoryForm); setHistoryFormAccount('all'); setHistoryFormAmount(''); }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white text-[11px] font-black rounded-xl shadow active:scale-95 transition-all">
                    <Plus size={14}/> 手動登録
                  </button>
                </div>
              </div>

              {/* 手動登録フォーム */}
              {showHistoryForm && (
                <div className="p-5 border-b bg-slate-50 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">資産履歴を手動登録</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">日付</label>
                      <input type="date" value={historyFormDate}
                        onChange={e => setHistoryFormDate(e.target.value)}
                        className="w-full p-3 bg-white border rounded-xl outline-none text-sm font-bold focus:ring-2 focus:ring-blue-300"/>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">評価額合計（円）</label>
                      <input type="text" placeholder="例: 5,000,000"
                        value={historyFormAmount}
                        onChange={e => setHistoryFormAmount(e.target.value)}
                        className="w-full p-3 bg-white border rounded-xl outline-none text-sm font-bold focus:ring-2 focus:ring-blue-300"/>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">口座</label>
                      <select value={historyFormAccount}
                        onChange={e => setHistoryFormAccount(e.target.value)}
                        className="w-full p-3 bg-white border rounded-xl outline-none text-sm font-bold focus:ring-2 focus:ring-blue-300">
                        <option value="all">全口座合計</option>
                        {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowHistoryForm(false)}
                      className="px-4 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl active:scale-95">
                      キャンセル
                    </button>
                    <button onClick={handleAddHistory}
                      className="px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl shadow active:scale-95">
                      保存
                    </button>
                  </div>
                </div>
              )}

              {/* 履歴一覧 */}
              <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {historyList.length === 0 ? (
                  <p className="p-6 text-center text-slate-300 text-xs italic">履歴がありません</p>
                ) : (
                  // 日付ごとに集計して表示
                  Object.entries(
                    historyList.reduce((acc: any, item: any) => {
                      const d = item.recorded_date;
                      if (!acc[d]) acc[d] = { date: d, total: 0, items: [] };
                      acc[d].total += item.total_value_jpy;
                      acc[d].items.push(item);
                      return acc;
                    }, {})
                  )
                  .sort(([a], [b]) => b.localeCompare(a))
                  .slice(0, 30)
                  .map(([date, group]: any) => (
                    <div key={date} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                      <div>
                        <p className="text-sm font-black text-slate-700">{date}</p>
                        <p className="text-[10px] text-slate-400">
                          {group.items.length === 1
                            ? group.items[0].accounts?.name || '全口座'
                            : `${group.items.length}口座合計`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-black text-blue-600">
                          ¥{Math.floor(group.total).toLocaleString()}
                        </p>
                        <button
                          onClick={() => group.items.forEach((i: any) => handleDeleteHistory(i.id))}
                          className="p-1.5 text-slate-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── セキュリティ ── */}
            <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm space-y-4">
              <h3 className="text-base font-black flex items-center gap-2 text-slate-800">
                <Settings size={18}/> セキュリティ
              </h3>
              <form onSubmit={handlePasswordChange} className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">新パスワード（6文字以上）</label>
                  <input name="password" type="password" required
                    className="w-full p-4 bg-slate-100 rounded-2xl outline-none text-base font-black"
                    placeholder="••••••••"/>
                </div>
                <button type="submit"
                  className="w-full bg-slate-900 text-white font-black py-3.5 rounded-2xl active:scale-95 transition-all text-sm uppercase">
                  パスワード更新
                </button>
              </form>
            </div>

            {/* ── 口座管理 ── */}
            <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-black flex items-center gap-2 text-slate-800">
                  <Wallet size={18}/> 口座管理
                </h3>
                <button onClick={addAccount}
                  className="p-2 bg-blue-600 text-white rounded-full shadow-md active:scale-95">
                  <PlusCircle size={18}/>
                </button>
              </div>

              {/* 口座追加フォーム */}
              {showAddAccountForm && (
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">新規口座を追加</p>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">口座名 *</label>
                    <input value={newAccName} onChange={e => setNewAccName(e.target.value)}
                      placeholder="例: SBI証券 特定口座"
                      className="w-full bg-white p-3 rounded-xl border outline-none font-bold text-sm"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">ブローカー名</label>
                    <input value={newAccBroker} onChange={e => setNewAccBroker(e.target.value)}
                      placeholder="例: SBI証券 / 楽天証券 / マネックス"
                      className="w-full bg-white p-3 rounded-xl border outline-none font-bold text-sm"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">口座種別</label>
                    <select value={newAccType} onChange={e => setNewAccType(e.target.value)}
                      className="w-full bg-white p-3 rounded-xl border outline-none font-bold text-sm">
                      <option value="証券">証券</option>
                      <option value="その他（証券）">その他（証券）</option>
                      <option value="銀行">銀行</option>
                      <option value="仮想通貨">仮想通貨</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddAccount}
                      className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl text-sm active:scale-95">
                      追加する
                    </button>
                    <button onClick={() => { setShowAddAccountForm(false); setNewAccName(''); setNewAccBroker(''); setNewAccType('証券'); }}
                      className="px-4 bg-slate-200 text-slate-500 font-black py-3 rounded-xl text-sm">
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {accounts.map(acc => (
                  <div key={acc.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group">
                    {editingAccountId === acc.id ? (
                      <div className="flex flex-1 gap-2 text-xs">
                        <input value={newAccountName}
                          onChange={e => setNewAccountName(e.target.value)}
                          className="flex-1 bg-white p-2 rounded-xl border outline-none font-bold text-sm"/>
                        <button onClick={() => updateAccountName(acc.id)}
                          className="p-2 bg-emerald-500 text-white rounded-xl">
                          <Save size={16}/>
                        </button>
                        <button onClick={() => setEditingAccountId(null)}
                          className="p-2 bg-slate-200 text-slate-400 rounded-xl">
                          <X size={16}/>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-slate-700 font-black text-sm">{acc.name}</p>
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {acc.broker && <span className="text-[9px] bg-blue-50 text-blue-600 font-black px-2 py-0.5 rounded-full">{acc.broker}</span>}
                            <span className="text-[9px] bg-slate-100 text-slate-500 font-black px-2 py-0.5 rounded-full">{acc.type || '証券'}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingAccountId(acc.id); setNewAccountName(acc.name); }}
                            className="p-2 text-slate-300 hover:text-blue-600 transition-colors">
                            <Edit3 size={15}/>
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('口座を削除しますか？この口座の銘柄・履歴も削除されます。')) return;
                              await supabase.from('holdings').delete().eq('account_id', acc.id);
                              await supabase.from('asset_history').delete().eq('account_id', acc.id);
                              await supabase.from('accounts').delete().eq('id', acc.id);
                              fetchCachedData();
                              fetchHistory();
                            }}
                            className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 size={15}/>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── 実績配当 手動登録 ── */}
            <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-black flex items-center gap-2 text-slate-800">
                  <BarChart3 size={18}/> 実績配当
                </h3>
                <button onClick={() => setShowActualDivForm(v => !v)}
                  className="p-2 bg-blue-600 text-white rounded-full shadow-md active:scale-95">
                  <PlusCircle size={18}/>
                </button>
              </div>

              {/* 登録フォーム */}
              {showActualDivForm && (
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">実績配当を登録</p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">年</label>
                      <select value={actualDivYear} onChange={e => setActualDivYear(Number(e.target.value))}
                        className="w-full bg-white p-3 rounded-xl border outline-none font-bold text-sm">
                        {[0,1,2].map(i => {
                          const y = new Date().getFullYear() - i;
                          return <option key={y} value={y}>{y}年</option>;
                        })}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">月</label>
                      <select value={actualDivMonth} onChange={e => setActualDivMonth(Number(e.target.value))}
                        className="w-full bg-white p-3 rounded-xl border outline-none font-bold text-sm">
                        {Array.from({length:12},(_,i)=>i+1).map(m => (
                          <option key={m} value={m}>{m}月</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">受取額（円）*</label>
                    <input type="text" inputMode="numeric" value={actualDivAmount}
                      onChange={e => setActualDivAmount(e.target.value)}
                      placeholder="例: 12500"
                      className="w-full bg-white p-3 rounded-xl border outline-none font-bold text-sm"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1 font-black">メモ（任意）</label>
                    <input type="text" value={actualDivNote}
                      onChange={e => setActualDivNote(e.target.value)}
                      placeholder="例: SBI証券 特定口座"
                      className="w-full bg-white p-3 rounded-xl border outline-none font-bold text-sm"/>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddActualDiv}
                      className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl text-sm active:scale-95">
                      登録する
                    </button>
                    <button onClick={() => { setShowActualDivForm(false); setActualDivAmount(''); setActualDivNote(''); }}
                      className="px-4 bg-slate-200 text-slate-500 font-black py-3 rounded-xl text-sm">
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {/* 実績一覧 */}
              {actualDividends.length === 0 ? (
                <p className="text-center text-slate-300 text-xs py-4">実績データがありません</p>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {/* 当年データを月別に表示 */}
                  {(() => {
                    // pay_date から year/month を解析してグループ化
                    const grouped: Record<number, any[]> = {};
                    actualDividends.forEach(d => {
                      if (!d.pay_date) return;
                      const yr = new Date(d.pay_date + 'T00:00:00').getFullYear();
                      if (!grouped[yr]) grouped[yr] = [];
                      grouped[yr].push(d);
                    });
                    return Object.keys(grouped).map(Number).sort((a,b)=>b-a).map(yr => {
                      const yearData = grouped[yr];
                      const yearTotal = yearData.reduce((s: number, d: any) => s + (d.amount || 0), 0);
                      return (
                        <div key={yr}>
                          <div className="flex justify-between items-center px-1 py-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{yr}年</span>
                            <span className="text-[10px] font-black text-slate-600">合計 ¥{Math.floor(yearTotal).toLocaleString()}</span>
                          </div>
                          {yearData.sort((a: any, b: any) => a.pay_date.localeCompare(b.pay_date)).map((d: any) => {
                            const mo = new Date(d.pay_date + 'T00:00:00').getMonth() + 1;
                            return (
                              <div key={d.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl mb-1">
                                <div>
                                  <span className="text-xs font-black text-slate-700">{mo}月</span>
                                  {d.memo && <span className="text-[10px] text-slate-400 ml-2">{d.memo}</span>}
                                  {d.symbol && <span className="text-[10px] text-slate-300 ml-1">({d.symbol})</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-black text-blue-600">¥{Math.floor(d.amount || 0).toLocaleString()}</span>
                                  <button onClick={() => handleDeleteActualDiv(d.id)}
                                    className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                                    <Trash2 size={13}/>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>


            {/* ── ログアウト ── */}
            <div className="p-5 bg-slate-100 rounded-[2.5rem] text-center">
              <p className="text-[11px] text-slate-400 mb-3">ログイン中: {session?.user?.email}</p>
              <button onClick={() => supabase.auth.signOut()}
                className="w-full bg-white text-red-500 border border-red-100 font-black py-4 rounded-[1.5rem] active:scale-95 transition-all text-sm shadow-sm">
                ログアウト
              </button>
            </div>

          </div>
        )}

        {/* ── 銘柄追加タブ ── */}
        {activeTab === 'add' && (
          <div className="max-w-md mx-auto py-10 animate-in slide-in-from-bottom-8">
            {!selectedStock ? (
              <div className="bg-white p-8 rounded-[3.5rem] border shadow-2xl space-y-5">
                <h2 className="text-2xl font-black tracking-tighter uppercase leading-none text-center">銘柄追加</h2>

                {/* ── モード切替タブ ── */}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
                  <button
                    onClick={() => { setWaCodeInput(''); setSearchQuery(''); setSearchResults([]); }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${searchQuery !== '__fund__' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>
                    株式・ETF
                  </button>
                  <button
                    onClick={() => { setSearchQuery('__fund__'); setSearchResults([]); }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${searchQuery === '__fund__' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400'}`}>
                    投資信託
                  </button>
                </div>

                {/* ── 投資信託モード ── */}
                {searchQuery === '__fund__' ? (
                  <div className="space-y-4">
                    {/* WAコード入力 */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                          ① ウエルスアドバイザーコード
                        </p>
                        <a href="https://www.wealthadvisor.co.jp/detail_search" target="_blank"
                          className="text-[10px] text-amber-600 underline flex items-center gap-1">
                          <ExternalLink size={10}/> WA検索
                        </a>
                      </div>
                      <p className="text-[10px] text-amber-600 mb-2">
                        ファンドページURL末尾の数字<br/>
                        例）<code className="bg-amber-100 px-1 rounded font-mono">wealthadvisor.co.jp/snapshot/<strong>2018103105</strong></code>
                      </p>
                      <input
                        type="text"
                        placeholder="例: 2018103105"
                        className="w-full p-4 bg-white border border-amber-300 rounded-xl outline-none text-base font-bold focus:ring-2 focus:ring-amber-300"
                        value={waCodeInput}
                        onChange={e => setWaCodeInput(e.target.value.trim())}
                      />
                    </div>

                    {/* 投信協会コード入力 */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">
                        ② 投信協会コード（銘柄コード）
                      </p>
                      <p className="text-[10px] text-slate-400 mb-2">
                        8桁の英数字コード<br/>
                        例）オルカン: <code className="bg-slate-100 px-1 rounded font-mono">0331418A</code>
                      </p>
                      <input
                        type="text"
                        placeholder="例: 0331418A"
                        className="w-full p-4 bg-white border border-slate-200 rounded-xl outline-none text-base font-bold focus:ring-2 focus:ring-slate-300"
                        value={fundSymbolInput}
                        id="fund-symbol-input"
                        onChange={e => setFundSymbolInput(e.target.value.trim())}
                      />
                    </div>

                    {/* 検索ボタン */}
                    <button
                      onClick={async () => {
                        const fundSymbol = fundSymbolInput;
                        if (!fundSymbol && !waCodeInput) {
                          alert('少なくともどちらか一方のコードを入力してください');
                          return;
                        }
                        setLoading(true);
                        try {
                          // WAコードがあればfund APIから基準価額・分配金を取得
                          let fundData: any = null;
                          if (waCodeInput) {
                            const res = await fetch(`/api/fund?wa_code=${waCodeInput}`);
                            if (res.ok) fundData = await res.json();
                          }
                          const symbol = fundSymbol || fundData?.symbol || waCodeInput;
                          setSelectedStock({
                            symbol,
                            name:          fundData?.name || symbol,
                            jpName:        fundData?.name || symbol,
                            price:         fundData?.price || 10000,
                            date:          fundData?.date || null,
                            currency:      'JPY',
                            sector:        '投資信託',
                            cyclical:      '中立',
                            dividendYield: 0,
                            dividendRate:  fundData?.latestDividend?.totalAmount || 0,
                            dividendMonths: [],           // 投信は配当月なし
                            wa_code:       waCodeInput || null,
                            // 分配金履歴（WAから取得）
                            fundDividends: fundData?.dividends || [],
                            latestDividend: fundData?.latestDividend || null,
                            changeAmount:  fundData?.changeAmount || null,
                            changeRate:    fundData?.changeRate   || null,
                            aum:           fundData?.aum_million_jpy || null,
                          });
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50">
                      {loading ? '取得中...' : '基準価額を取得して登録へ進む'}
                    </button>
                  </div>

                ) : (
                  /* ── 株式・ETFモード ── */
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <a href="https://finance.yahoo.co.jp/" target="_blank"
                        className="text-[10px] text-blue-500 underline flex items-center gap-1">
                        <ExternalLink size={10}/> Yahoo Finance Japan でティッカーを確認
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="トヨタ、AAPL、VOO..."
                        className="w-full p-6 bg-slate-100 rounded-[2rem] outline-none font-black text-xl pr-16 shadow-inner focus:ring-4 focus:ring-blue-500/10 transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                      <div className="absolute right-6 top-6">
                        {isSearching
                          ? <RefreshCcw className="animate-spin text-blue-600" size={24}/>
                          : <Search className="text-slate-300" size={24}/>
                        }
                      </div>
                    </div>
                    <div className="space-y-3 text-xs">
                      {searchResults.map((s, idx) => (
                        <button
                          key={`${s.symbol}-${idx}`}
                          onClick={() => handleSelectStock(s)}
                          className="w-full p-5 text-left hover:bg-blue-600 hover:text-white bg-slate-50 rounded-[2rem] transition-all flex justify-between items-center border border-slate-100 shadow-sm">
                          <div className="flex-1 pr-2">
                            <div className="flex items-center gap-2">
                              <p className="font-black text-lg">{s.symbol}</p>
                              <span className="text-[8px] px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded uppercase tracking-widest">{s.typeDisp}</span>
                            </div>
                            <p className="text-[11px] opacity-70 line-clamp-1">{s.name}</p>
                          </div>
                          <ChevronRight size={20} className="opacity-30"/>
                        </button>
                      ))}
                      {searchQuery.length > 0 && searchQuery !== '__fund__' && searchResults.length === 0 && !isSearching && (
                        <div className="text-center py-10 space-y-4">
                          <p className="text-slate-300 italic">該当なし</p>
                          <button
                            onClick={handleManualAdd}
                            className="px-6 py-3 bg-slate-800 text-white rounded-full flex items-center gap-2 mx-auto active:scale-95 transition-all shadow-lg">
                            <Plus size={16}/> 手動で追加する
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            ) : (
              /* ── 銘柄確認・登録フォーム ── */
              <form onSubmit={handleAddStock} className="bg-white p-8 rounded-[3rem] border shadow-2xl space-y-5 text-left">
                {/* ヘッダー */}
                <div className="border-b pb-5 flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    <h2 className="text-lg tracking-tighter leading-tight font-black">{selectedStock.jpName || selectedStock.name}</h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{selectedStock.symbol}</p>
                    {selectedStock.wa_code && (
                      <p className="text-[10px] text-amber-600 font-bold mt-0.5">WAコード: {selectedStock.wa_code}</p>
                    )}
                  </div>
                  <button type="button"
                    onClick={() => { setSelectedStock(null); setWaCodeInput(''); setFundSymbolInput(''); setSearchQuery(''); setCustomDivMonths(''); }}
                    className="text-[10px] font-black text-slate-300 uppercase hover:text-blue-600 flex-shrink-0">
                    戻る
                  </button>
                </div>

                {/* 基準価額・分配金情報（投信のみ） */}
                {selectedStock.sector === '投資信託' && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">取得済み情報（ウエルスアドバイザー）</p>
                    <div className="grid grid-cols-2 gap-2 text-xs font-black">
                      <div>
                        <p className="text-[9px] text-slate-400">基準価額</p>
                        <p className="text-base text-slate-800">
                          ¥{selectedStock.price ? Number(selectedStock.price).toLocaleString() : '-'}
                          {selectedStock.date && <span className="text-[9px] text-slate-400 ml-1">{selectedStock.date}</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400">前日比</p>
                        <p className={`text-sm ${(selectedStock.changeRate || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {selectedStock.changeAmount != null
                            ? `${selectedStock.changeAmount >= 0 ? '+' : ''}${selectedStock.changeAmount}円 (${selectedStock.changeRate}%)`
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400">純資産総額</p>
                        <p className="text-sm text-slate-700">
                          {selectedStock.aum ? `${Number(selectedStock.aum).toLocaleString()}百万円` : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400">直近分配金</p>
                        <p className="text-sm text-emerald-600">
                          {selectedStock.latestDividend
                            ? `¥${selectedStock.latestDividend.totalAmount} (${selectedStock.latestDividend.year}年)`
                            : '0円（無分配）'}
                        </p>
                      </div>
                    </div>
                    {/* 分配金履歴テーブル */}
                    {selectedStock.fundDividends?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[9px] text-slate-400 font-black uppercase mb-1">分配金履歴（直近5年）</p>
                        <div className="flex gap-2 flex-wrap">
                          {selectedStock.fundDividends.map((d: any, i: number) => (
                            <span key={i} className="bg-white border border-amber-200 rounded-lg px-2 py-0.5 text-[9px] font-black text-slate-600">
                              {d.year}年: ¥{d.totalAmount}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 登録フォーム */}
                <div className="space-y-4 text-xs font-black">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest ml-2 mb-1 block leading-none">入庫口座</label>
                    <select name="accountId" className="w-full p-4 bg-slate-100 rounded-2xl outline-none font-bold text-sm">
                      {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest ml-2 mb-1 block leading-none">
                        {selectedStock.sector === '投資信託' ? '保有口数' : '保有数'}
                      </label>
                      <input name="quantity" type="number" step="any" required
                        className="w-full p-4 bg-slate-100 rounded-2xl outline-none"/>
                      {selectedStock.sector === '投資信託' && (
                        <p className="text-[9px] text-slate-400 ml-2 mt-1">例：10万口 → 100000</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest ml-2 mb-1 block leading-none">
                        {selectedStock.sector === '投資信託'
                          ? '取得時基準価額（1口あたり円）'
                          : `取得単価（${selectedStock.currency || 'JPY'}）`}
                      </label>
                      <input name="price" type="number" step="any" required
                        defaultValue={selectedStock.price}
                        className="w-full p-4 bg-slate-100 rounded-2xl outline-none"/>
                      {selectedStock.sector === '投資信託' && (
                        <p className="text-[9px] text-slate-400 ml-2 mt-1">現在値: ¥{selectedStock.price?.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  {/* 投信：評価額プレビュー */}
                  {selectedStock.sector === '投資信託' && selectedStock.price && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-700">
                      <p className="font-black">評価額の計算方法</p>
                      <p className="mt-0.5">評価額 ＝ 基準価額 × 保有口数 ÷ 10,000</p>
                      <p className="text-amber-500 mt-0.5">例）基準価額¥{selectedStock.price?.toLocaleString()} × 100,000口 ÷ 10,000 ＝ ¥{Math.floor(selectedStock.price * 100000 / 10000).toLocaleString()}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest ml-2 mb-1 block leading-none">課税区分</label>
                    <select name="taxType" className="w-full p-4 bg-slate-100 rounded-2xl outline-none font-bold text-sm">
                      <option value="特定口座">特定口座</option>
                      <option value="NISA(成長)">NISA(成長)</option>
                      <option value="NISA(つみたて)">NISA(つみたて)</option>
                      <option value="iDeCo">iDeCo</option>
                    </select>
                  </div>

                  {/* 日本株：支払月の手動入力 */}
                  {selectedStock.symbol?.endsWith('.T') && (
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">配当支払月（任意）</p>
                      <p className="text-[10px] text-blue-400 mb-2">
                        未入力の場合は6月・12月（一般的な日本株）を使用します。<br/>
                        カンマ区切りで入力 例）<code className="bg-blue-100 px-1 rounded">6,12</code>　毎月の場合：<code className="bg-blue-100 px-1 rounded">1,2,3,4,5,6,7,8,9,10,11,12</code>
                      </p>
                      <input
                        type="text"
                        placeholder="例: 6,12"
                        className="w-full p-3 bg-white border border-blue-200 rounded-xl outline-none text-sm font-bold focus:ring-2 focus:ring-blue-300"
                        value={customDivMonths}
                        onChange={e => setCustomDivMonths(e.target.value.trim())}
                      />
                    </div>
                  )}
                </div>

                <button type="submit"
                  className="w-full bg-blue-600 text-white font-black py-5 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all text-base uppercase">
                  保存する
                </button>
              </form>
            )}
          </div>
        )}

      </main>

      {/* ══════════════════════════════════════
          ナビゲーション（売却履歴タブ追加）
      ══════════════════════════════════════ */}
      <nav className="bg-white/80 backdrop-blur-2xl border-t flex justify-around items-center py-4 fixed bottom-0 left-0 right-0 z-40 font-black">
        {[
          { id: 'assets',   icon: Wallet,        label: '資産' },
          { id: 'div',      icon: BarChart3,      label: '配当' },
          { id: 'sell',     icon: History,        label: '売却' },
          { id: 'settings', icon: Settings,       label: '設定' },
        ].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-1.5 w-full transition-all ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <item.icon size={20} strokeWidth={activeTab === item.id ? 3 : 2}/>
            <span className="text-[9px] uppercase tracking-widest leading-none">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
