import { useState } from "react";

export default function Home() {
  const [image, setImage] = useState(null);
  const [excel, setExcel] = useState(null);
  const [columns, setColumns] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!image) {
      setError("Please select an image to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("image", image);
    if (excel) formData.append("excel", excel);
    if (columns) formData.append("columns", columns);

    setLoading(true);
    try {
      const res = await fetch("/api/process", { method: "POST", body: formData });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Something went wrong");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "updated_data.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Image → Excel Data Entry</h1>
        <p style={styles.subtitle}>
          Upload a photo (receipt, form, invoice) and get the extracted data
          automatically added to an Excel sheet.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            1. Image to extract data from (required)
            <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} style={styles.input} />
          </label>

          <label style={styles.label}>
            2. Existing Excel file (optional — skip to create a new one)
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setExcel(e.target.files[0])} style={styles.input} />
          </label>

          <label style={styles.label}>
            3. Column names (only needed if no Excel file uploaded)
            <input
              type="text"
              placeholder="e.g. Name, Date, Amount, Invoice No"
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
              style={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Processing..." : "Extract & Download Excel"}
          </button>
        </form>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", fontFamily: "Arial, sans-serif", padding: "20px" },
  card: { background: "#fff", padding: "32px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxWidth: "480px", width: "100%" },
  title: { fontSize: "24px", marginBottom: "8px" },
  subtitle: { fontSize: "14px", color: "#555", marginBottom: "24px" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  label: { display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" },
  input: { padding: "8px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "14px" },
  button: { padding: "12px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: "6px", fontSize: "16px", cursor: "pointer" },
  error: { color: "red", marginTop: "16px", fontSize: "14px" },
};