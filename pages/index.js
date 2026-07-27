
import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const STEPS = [
  "Uploading images…",
  "Reading text from images (OCR)…",
  "Structuring data with AI…",
  "Building your Excel file…",
];

export default function Home() {
  const [images, setImages] = useState([]);
  const [excel, setExcel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const stepTimer = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(stepTimer.current);
  }, []);

  const addImages = (fileList) => {
    const newFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    setImages((prev) => [...prev, ...newFiles]);
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addImages(e.dataTransfer.files);
  };

  const startFakeProgress = () => {
    setStepIndex(0);
    stepTimer.current = setInterval(() => {
      setStepIndex((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 1800);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (images.length === 0) {
      setError("Please add at least one image.");
      return;
    }

    const formData = new FormData();
    images.forEach((img) => formData.append("images", img));
    if (excel) formData.append("excel", excel);

    setLoading(true);
    startFakeProgress();

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
      a.download = "phone_inventory.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setImages([]);
      setExcel(null);
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(stepTimer.current);
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Phone Ledger → Excel</title>
      </Head>

      <div style={styles.page}>
        <div style={styles.card} className="fade-in">
          <div style={styles.badge}>AI-Powered</div>
          <h1 style={styles.title}>Phone Ledger → Excel</h1>
          <p style={styles.subtitle}>
            Upload photos of your handwritten phone ledger. We'll extract every entry —
            Name, IMEI, Purchase Price, Selling Price and Profit — straight into an Excel sheet.
          </p>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                ...styles.dropzone,
                borderColor: dragActive ? "#6d28d9" : "#e2e2ea",
                background: dragActive ? "#f5f3ff" : "#fafafc",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => addImages(e.target.files)}
                style={{ display: "none" }}
              />
              <p style={styles.dropzoneText}>
                <strong>Click to add photos</strong> or drag & drop them here
              </p>
              <p style={styles.dropzoneHint}>You can select multiple images at once</p>
            </div>

            {images.length > 0 && (
              <div style={styles.thumbGrid}>
                {images.map((img, i) => (
                  <div key={i} style={styles.thumb} className="fade-in">
                    <img
                      src={URL.createObjectURL(img)}
                      alt={img.name}
                      style={styles.thumbImg}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      style={styles.thumbRemove}
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label style={styles.label}>
              Existing Excel file (optional — leave empty to create a new one)
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setExcel(e.target.files[0])}
                style={styles.fileInput}
              />
            </label>

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? (
                <span style={styles.buttonLoading}>
                  <span className="spinner" />
                  {STEPS[stepIndex]}
                </span>
              ) : (
                `Extract & Download Excel${images.length ? ` (${images.length} image${images.length > 1 ? "s" : ""})` : ""}`
              )}
            </button>

            {loading && (
              <div style={styles.progressDots}>
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={i === stepIndex ? "pulse-dot" : ""}
                    style={{
                      ...styles.dot,
                      background: i <= stepIndex ? "#6d28d9" : "#e2e2ea",
                    }}
                  />
                ))}
              </div>
            )}
          </form>

          {error && <p style={styles.error} className="fade-in">{error}</p>}
        </div>
      </div>
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(160deg, #f4f4f8 0%, #ece9f7 100%)",
    padding: "24px",
  },
  card: {
    background: "#fff",
    padding: "40px",
    borderRadius: "20px",
    boxShadow: "0 20px 50px rgba(76, 29, 149, 0.08)",
    maxWidth: "520px",
    width: "100%",
  },
  badge: {
    display: "inline-block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#6d28d9",
    background: "#f5f3ff",
    padding: "4px 10px",
    borderRadius: "999px",
    marginBottom: "12px",
    letterSpacing: "0.02em",
  },
  title: { fontSize: "26px", fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" },
  subtitle: { fontSize: "14px", color: "#6b6b7a", marginBottom: "28px", lineHeight: 1.5 },
  dropzone: {
    border: "1.5px dashed #e2e2ea",
    borderRadius: "14px",
    padding: "28px 16px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  dropzoneText: { margin: 0, fontSize: "14px", color: "#1a1a2e" },
  dropzoneHint: { margin: "4px 0 0", fontSize: "12px", color: "#9999a8" },
  thumbGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
    gap: "10px",
    marginTop: "14px",
  },
  thumb: {
    position: "relative",
    borderRadius: "10px",
    overflow: "hidden",
    aspectRatio: "1 / 1",
    background: "#f0f0f4",
  },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  thumbRemove: {
    position: "absolute",
    top: "4px",
    right: "4px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: "13px",
    lineHeight: "20px",
    cursor: "pointer",
    padding: 0,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    fontSize: "13px",
    color: "#4b4b58",
    gap: "6px",
    marginTop: "22px",
  },
  fileInput: {
    padding: "8px",
    border: "1px solid #e2e2ea",
    borderRadius: "8px",
    fontSize: "13px",
    background: "#fafafc",
  },
  button: {
    marginTop: "24px",
    width: "100%",
    padding: "14px",
    background: "#6d28d9",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s ease",
  },
  buttonLoading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  progressDots: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    marginTop: "16px",
  },
  dot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    transition: "background 0.3s ease",
  },
  error: {
    color: "#dc2626",
    marginTop: "16px",
    fontSize: "13px",
    textAlign: "center",
  },
};