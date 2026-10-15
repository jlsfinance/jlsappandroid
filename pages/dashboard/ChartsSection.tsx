import React from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

/* ─── Color palette matching the existing CRED-style theme ─── */
const COLORS = {
  indigo: '#6366f1',
  purple: '#a855f7',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  cyan: '#06b6d4',
  slate: '#64748b',
  pink: '#ec4899',
  teal: '#14b8a6',
  orange: '#f97316',
};

const GRADIENT_STOPS = [
  { offset: '0%', stopColor: '#6366f1', stopOpacity: 0.3 },
  { offset: '95%', stopColor: '#6366f1', stopOpacity: 0.02 },
];

/* ─── Custom Tooltip ─── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 backdrop-blur-xl">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-black" style={{ color: entry.color }}>
          {entry.name}: {entry.name?.includes('Cr') || entry.name?.includes('L') || entry.name?.includes('₹')
            ? `₹${Number(entry.value).toLocaleString('en-IN')}`
            : typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value}
        </p>
      ))}
    </div>
  );
};

/* ─── 1. Revenue Trend (Area Chart) ─── */
interface RevenueTrendProps {
  data: { month: string; revenue: number; expenses: number }[];
}
const RevenueTrendChart: React.FC<RevenueTrendProps> = ({ data }) => {
  if (!data.length) return <EmptyChart label="Revenue Trend" />;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Revenue Trend</h4>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: '#6366f1' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ─── 2. Expense Distribution (Bar Chart) ─── */
interface ExpenseDistProps {
  data: { category: string; amount: number; color: string }[];
}
const ExpenseDistChart: React.FC<ExpenseDistProps> = ({ data }) => {
  if (!data.length) return <EmptyChart label="Expense Distribution" />;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Expense Distribution</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
          <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={40}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-3">
        {data.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
            <span className="text-[10px] font-semibold text-slate-500">{entry.category}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── 3. Collections Status (Donut Chart) ─── */
interface CollectionStatusProps {
  data: { name: string; value: number; color: string }[];
  total: number;
}
const CollectionStatusChart: React.FC<CollectionStatusProps> = ({ data, total }) => {
  if (!data.length) return <EmptyChart label="Collections Status" />;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Collections Status</h4>
      <div className="flex items-center justify-center gap-6">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value" stroke="none">
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-black text-slate-900 dark:text-white">₹{(total / 100000).toFixed(1)}L</p>
          {data.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
              <span className="text-[10px] font-semibold text-slate-500">{entry.name}: {entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── 4. P&L Trend (Grouped Bar Chart) ─── */
interface PnLTrendProps {
  data: { month: string; income: number; expense: number }[];
}
const PnLTrendChart: React.FC<PnLTrendProps> = ({ data }) => {
  if (!data.length) return <EmptyChart label="P&L Trend" />;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">P&L Trend</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, fontWeight: 700 }}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
          <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ─── 5. Net Profit Margin (Line Chart) ─── */
interface ProfitMarginProps {
  data: { month: string; margin: number }[];
}
const ProfitMarginChart: React.FC<ProfitMarginProps> = ({ data }) => {
  if (!data.length) return <EmptyChart label="Net Profit Margin" />;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Net Profit Margin</h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(1)}%`} domain={[0, 'auto']} />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone" dataKey="margin" stroke="#a855f7" strokeWidth={2.5}
            dot={{ r: 4, fill: '#a855f7', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#a855f7' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ─── Empty State ─── */
const EmptyChart: React.FC<{ label: string }> = ({ label }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 border-dashed text-center">
    <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2">bar_chart</span>
    <p className="text-[11px] font-bold text-slate-400">{label}</p>
    <p className="text-[10px] text-slate-400 mt-1">Data will appear once transactions are recorded</p>
  </div>
);

/* ─── Main Charts Section ─── */
interface ChartsSectionProps {
  revenueTrend: { month: string; revenue: number; expenses: number }[];
  expenseDist: { category: string; amount: number; color: string }[];
  collectionStatus: { name: string; value: number; color: string }[];
  collectionTotal: number;
  pnlTrend: { month: string; income: number; expense: number }[];
  profitMargin: { month: string; margin: number }[];
}

const ChartsSection: React.FC<ChartsSectionProps> = ({
  revenueTrend, expenseDist, collectionStatus, collectionTotal,
  pnlTrend, profitMargin
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-1 rounded-full bg-indigo-600"></div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white">Analytics</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueTrendChart data={revenueTrend} />
        <ExpenseDistChart data={expenseDist} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CollectionStatusChart data={collectionStatus} total={collectionTotal} />
        <PnLTrendChart data={pnlTrend} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
        <ProfitMarginChart data={profitMargin} />
      </div>
    </div>
  );
};

export { ChartsSection, RevenueTrendChart, ExpenseDistChart, CollectionStatusChart, PnLTrendChart, ProfitMarginChart };
export type { RevenueTrendProps, ExpenseDistProps, CollectionStatusProps, PnLTrendProps, ProfitMarginProps };
export default ChartsSection;
