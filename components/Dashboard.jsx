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
    { label: "Total Revenue", value: fmt(stats.totalRevenue), icon: DollarSign, color: "#0891b2" },
    { label: "Total Cost", value: fmt(stats.totalCost), icon: PiggyBank, color: "#d97706" },
    { label: "Total Profit", value: fmt(stats.totalProfit), icon: TrendingUp, color: "#16a34a" },
    { label: "Profit Margin", value: `${stats.profitMargin.toFixed(1)}%`, icon: Percent, color: "#6d28d9" },
    { label: "Most Profitable", value: stats.mostProfitable?.name || "-", icon: Trophy, color: "#16a34a" },
    { label: "Least Profitable", value: stats.leastProfitable?.name || "-", icon: TrendingDown, color: "#dc2626" },
  ];

  const revenueCostProfitData = {
    labels: ["Revenue", "Cost", "Profit"],
    datasets: [
      {
        label: "Amount (Rs)",
        data: [stats.totalRevenue, stats.totalCost, stats.totalProfit],
        backgroundColor: ["#0891b2", "#d97706", "#16a34a"],
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
        backgroundColor: "#6d28d9",
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
        backgroundColor: ["#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#7c3aed"],
      },
    ],
  };

  return (
    <div style={{ marginTop: "32px" }} className="fade-in">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px", color: "#1a1a2e" }}>
        Inventory Dashboard
      </h2>

      <div
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
            }}
          >
            <c.icon size={18} color={c.color} style={{ marginBottom: "8px" }} />
            <div style={{ fontSize: "12px", color: "#6b6b7a", marginBottom: "4px" }}>{c.label}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", wordBreak: "break-word" }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: "20px" }}>
        <ChartCard title="Revenue vs Cost vs Profit">
          <Bar data={revenueCostProfitData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </ChartCard>
        <ChartCard title="Top 5 Most Profitable Phones">
          <Bar data={top5Data} options={{ indexAxis: "y", responsive: true, plugins: { legend: { display: false } } }} />
        </ChartCard>
        <ChartCard title="Profit Distribution">
          <Doughnut data={distributionData} options={{ responsive: true }} />
        </ChartCard>
      </div>
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
      }}
    >
      <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "14px", color: "#1a1a2e" }}>{title}</h3>
      {children}
    </div>
  );
}