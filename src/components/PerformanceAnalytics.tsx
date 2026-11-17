import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, formatMoney } from '../lib/api';
import { StoreAnalytics } from '../types';

interface PerformanceAnalyticsProps {
  storeId: number;
  currency: string;
}

export function PerformanceAnalytics({ storeId, currency }: PerformanceAnalyticsProps) {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getStoreAnalytics(storeId, days);
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل تحليلات الأداء.');
    } finally {
      setLoading(false);
    }
  }, [storeId, days]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading && !analytics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-zinc-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-white border border-zinc-200 rounded-xl animate-pulse" />
          <div className="h-80 bg-white border border-zinc-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="p-6 bg-white border border-rose-200 rounded-xl text-sm text-rose-700">
        {error || 'تعذر تحميل البيانات.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Period Switcher */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900">تحليلات الأداء</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            تطور الزيارات اليومية وإجمالي المبيعات المحققة لمتجرك عبر واجهة المتجر المستقلة.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg self-start sm:self-auto">
          {[
            { val: 7 as const, label: 'آخر 7 أيام' },
            { val: 14 as const, label: 'آخر 14 يوماً' },
            { val: 30 as const, label: 'آخر 30 يوماً' },
          ].map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => setDays(opt.val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                days === opt.val
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-zinc-200 rounded-xl">
          <span className="text-xs text-zinc-500 block mb-1.5">إجمالي الزيارات ({days} يوم)</span>
          <span className="text-2xl font-bold font-mono-tabular text-zinc-900">
            {analytics.summary.totalVisits.toLocaleString('en-US')}
          </span>
        </div>
        <div className="p-5 bg-white border border-zinc-200 rounded-xl">
          <span className="text-xs text-zinc-500 block mb-1.5">إجمالي المبيعات ({days} يوم)</span>
          <span className="text-2xl font-bold font-mono-tabular text-pink-600">
            {formatMoney(analytics.summary.totalSales, currency)}
          </span>
        </div>
        <div className="p-5 bg-white border border-zinc-200 rounded-xl">
          <span className="text-xs text-zinc-500 block mb-1.5">متوسط الزيارات اليومية</span>
          <span className="text-2xl font-bold font-mono-tabular text-zinc-900">
            {analytics.summary.avgDailyVisits.toLocaleString('en-US')}
          </span>
        </div>
        <div className="p-5 bg-white border border-zinc-200 rounded-xl">
          <span className="text-xs text-zinc-500 block mb-1.5">معدل التحويل للطلبات</span>
          <span className="text-2xl font-bold font-mono-tabular text-emerald-700">
            {analytics.summary.conversionRate}%
          </span>
        </div>
      </div>

      {/* Recharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Visits Chart */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">عدد الزيارات اليومية</h3>
              <p className="text-xs text-zinc-500">زوار واجهة المتجر المستقلة يومياً</p>
            </div>
            <span className="text-xs font-mono-tabular text-zinc-500">زيارة / يوم</span>
          </div>

          <div className="h-[290px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={analytics.series}
                margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#111827" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#111827" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#71717A', fontSize: 11 }}
                  axisLine={{ stroke: '#E4E4E7' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#71717A', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as StoreAnalytics['series'][number];
                    return (
                      <div
                        dir="rtl"
                        className="bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm space-y-1"
                      >
                        <div className="font-mono-tabular text-zinc-500">{pt.date}</div>
                        <div className="font-semibold text-zinc-900">
                          الزيارات:{' '}
                          <span className="font-mono-tabular">{pt.visits}</span>
                        </div>
                        <div className="text-zinc-600">
                          الطلبات:{' '}
                          <span className="font-mono-tabular">{pt.orders}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="#111827"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#visitsGradient)"
                  activeDot={{ r: 4, fill: '#111827' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Sales Chart */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">إجمالي المبيعات اليومية</h3>
              <p className="text-xs text-zinc-500">قيمة الطلبات المؤكدة والجارية يومياً</p>
            </div>
            <span className="text-xs font-mono-tabular text-pink-600 font-semibold">
              {currency}
            </span>
          </div>

          <div className="h-[290px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.series}
                margin={{ top: 10, right: 12, left: -6, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#71717A', fontSize: 11 }}
                  axisLine={{ stroke: '#E4E4E7' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#71717A', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#F4F4F5' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as StoreAnalytics['series'][number];
                    return (
                      <div
                        dir="rtl"
                        className="bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm space-y-1"
                      >
                        <div className="font-mono-tabular text-zinc-500">{pt.date}</div>
                        <div className="font-semibold text-pink-600">
                          المبيعات:{' '}
                          <span className="font-mono-tabular">
                            {formatMoney(pt.sales, currency)}
                          </span>
                        </div>
                        <div className="text-zinc-600">
                          عدد الطلبات:{' '}
                          <span className="font-mono-tabular">{pt.orders}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="sales"
                  fill="#DB2777"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
