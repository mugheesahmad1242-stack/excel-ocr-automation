import { useMemo } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { DollarSign, PiggyBank, TrendingUp, Percent, Trophy, TrendingDown } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

// Colors pulled from the site's existing palette (violet accent + existing red/dark tones)
// instead of unrelated colors, so the dashboard matches the rest of the app.
const THEME = {
  primary: "#6d28d9",
  primaryDark: "#4c1d95",
  primaryLight: "#a78bfa",
  primaryLighter: "#c4b5fd",
  dark: "#1a1a2e",
  danger: "#dc2626", // same red already used for error text in index.js
};

export default function Dashboard({ entries }) {
  const stats = useMemo(() => {
    const totalRevenue = entries.reduce((s, e) => s + (e.selling || 0), 0);
    const totalCost = entries.reduce((s, e) => s + (e.purchase || 0), 0);
    const totalProfit = entries.reduce((s, e) => s + (e.profit || 0), 0);
    const profitMargin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;

    const sorted = [...entries].sort((a, b) => (b.profit || 0) - (a.profit || 0));
    const mostProfitable = sorted[0];
    const leastProfitable = sorted[sorted.length - 1];
    const top5 = sorted.slice(0, 5);

    const buckets = [
      { label: "0-1k", min: 0, max: 1000 },
      { label: "1k-2.5k", min: 1000, max: 2500 },
      { label: "2.5k-5k", min: 2500, max: 5000 },
      { label: "5k-10k", min: 5000, max: 10000 },
      { label: "10k+", min: 10000, max: Infinity },
    ];
    const distribution = buckets.map((b) => ({
      label: b.label,
      count: entries.filter((e) => (e.profit || 0) >= b.min && (e.profit || 0) < b.max).length,
    }));

    return { totalRevenue, totalCost, totalProfit, profitMargin, mostProfitable, leastProfitable, top5, distribution };
  }, [entries]);

  const fmt = (n) => `Rs ${Number(n || 0).toLocaleString()}`;

  const cards = [
    { label: "Total Revenue", value: fmt(stats.totalRevenue), icon: DollarSign, color: THEME.primary },
    { label: "Total Cost", value: fmt(stats.totalCost), icon: PiggyBank, color: THEME.primaryDark },
    { label: "Total Profit", value: fmt(stats.totalProfit), icon: TrendingUp, color: THEME.primary },
    { label: "Profit Margin", value: `${stats.profitMargin.toFixed(1)}%`, icon: Percent, color: THEME.primaryLight },
    { label: "Most Profitable", value: stats.mostProfitable?.name || "-", icon: Trophy, color: THEME.primary },
    { label: "Least Profitable", value: stats.leastProfitable?.name || "-", icon: TrendingDown, color: THEME.danger },
  ];

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false, // let the chart fill its fixed-height wrapper instead of forcing a ratio that can overflow
    plugins: { legend: { display: false } },
  };

  const revenueCostProfitData = {
    labels: ["Revenue", "Cost", "Profit"],
    datasets: [
      {
        label: "Amount (Rs)",
        data: [stats.totalRevenue, stats.totalCost, stats.totalProfit],
        backgroundColor: [THEME.primary, THEME.primaryLighter, THEME.primaryDark],
        borderRadius: 8,
      },
    ],
  };

  const top5Data = {
    labels: stats.top5.map((e) => e.name),
    datasets: [
      {
        label: "Profit (Rs)",
        data: stats.top5.map((e) => e.profit),
        backgroundColor: THEME.primary,
        borderRadius: 8,
      },
    ],
  };

  const distributionData = {
    labels: stats.distribution.map((d) => d.label),
    datasets: [
      {
        label: "Number of phones",
        data: stats.distribution.map((d) => d.count),
        backgroundColor: ["#ede9fe", "#ddd6fe", THEME.primaryLighter, THEME.primaryLight, THEME.primary],
      },
    ],
  };

  return (
    <div style={{ marginTop: "32px", overflowX: "hidden", maxWidth: "100%" }} className="fade-in">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px", color: THEME.dark }}>
        Inventory Dashboard
      </h2>

      <div
        className="kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "28px",
        }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "16px",
              boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
              border: "1px solid #f0f0f4",
              minWidth: 0,
            }}
          >
            <c.icon size={18} color={c.color} style={{ marginBottom: "8px" }} />
            <div style={{ fontSize: "12px", color: "#6b6b7a", marginBottom: "4px" }}>{c.label}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: THEME.dark, wordBreak: "break-word" }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: "20px", minWidth: 0 }}>
        <ChartCard title="Revenue vs Cost vs Profit">
          <Bar data={revenueCostProfitData} options={chartOptions} />
        </ChartCard>
        <ChartCard title="Top 5 Most Profitable Phones">
          <Bar data={top5Data} options={{ ...chartOptions, indexAxis: "y" }} />
        </ChartCard>
        <ChartCard title="Profit Distribution">
          <Doughnut data={distributionData} options={chartOptions} />
        </ChartCard>
      </div>

      <style jsx>{`
        .chart-canvas-wrap {
          position: relative;
          width: 100%;
          height: 240px;
        }
        @media (max-width: 480px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "14px",
        padding: "20px",
        boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
        border: "1px solid #f0f0f4",
        minWidth: 0,
      }}
    >
      <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "14px", color: "#1a1a2e" }}>{title}</h3>
      <div className="chart-canvas-wrap">{children}</div>
    </div>
  );
}