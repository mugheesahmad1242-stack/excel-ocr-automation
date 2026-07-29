import ProcessTracker from "../components/ProcessTracker";
import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import {
  UploadCloud,
  X,
  FileSpreadsheet,
  Sparkles,
  ImagePlus,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import Dashboard from "../components/Dashboard";

const SAMPLE_PATHS = ["/samples/sample-1.jpg", "/samples/sample-2.jpg", "/samples/sample-3.jpg"];

function base64ToBlob(base64, mime) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mime });
}

export default function Home() {
  const [images, setImages] = useState([]);
  const [excel, setExcel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processStage, setProcessStage] = useState("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [entries, setEntries] = useState([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [fileReady, setFileReady] = useState(false); // controls Dashboard button enable/disable
  const fileInputRef = useRef(null);

  const addImages = (fileList) => {
    const newFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    setImages((prev) => [...prev, ...newFiles]);
  };

  const removeImage = (index) => setImages((prev) => prev.filter((_, i) => i !== index));

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addImages(e.dataTransfer.files);
  };

  const loadSampleImages = async () => {
    setError("");
    try {
      const sampleFiles = await Promise.all(
        SAMPLE_PATHS.map(async (path, i) => {
          const res = await fetch(path);
          if (!res.ok) throw new Error("missing sample file");
          const blob = await res.blob();
          return new File([blob], `sample-${i + 1}.jpg`, { type: blob.type || "image/jpeg" });
        })
      );
      setImages((prev) => [...prev, ...sampleFiles]);
    } catch {
      setError(
        "Couldn't load sample images. Make sure sample-1.jpg, sample-2.jpg, sample-3.jpg are in /public/samples/."
      );
    }
  };

  // Wraps the upload in XMLHttpRequest instead of fetch so we can listen to
  // real upload-progress events. fetch()'s promise doesn't resolve until the
  // ENTIRE response (including server-side OCR/AI/Excel work) is back, so the
  // tracker looked stuck on step 1 the whole time before. XHR lets us detect
  // the exact moment the upload finishes and move to "processing" right then.
  const uploadWithProgress = (formData) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/process");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.upload.onload = () => {
        setUploadProgress(100);
        setProcessStage("processing");
      };

      xhr.onload = () => {
        let json;
        try {
          json = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error("Invalid server response"));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json);
        } else {
          reject(new Error(json.error || "Something went wrong"));
        }
      };

      xhr.onerror = () => reject(new Error("Network error. Please try again."));

      xhr.send(formData);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setShowDashboard(false);
    setFileReady(false);

    if (images.length === 0) {
      setError("Please add at least one image.");
      return;
    }

    const formData = new FormData();
    images.forEach((img) => formData.append("images", img));
    if (excel) formData.append("excel", excel);

    setLoading(true);
    setProcessStage("uploading");
    setUploadProgress(0);

    try {
      const data = await uploadWithProgress(formData);

      const blob = base64ToBlob(
        data.fileBase64,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName || "phone_inventory.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setProcessStage("done");
      setEntries(data.entries || []);
      setFileReady(true); // file is generated & downloaded -> Dashboard button unlocks
      setImages([]);
      setExcel(null);
    } catch (err) {
      setError(err.message);
      setProcessStage("error");
    } finally {
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
          <div style={styles.badge}>
            <Sparkles size={13} /> AI-Powered
          </div>
          <h1 style={styles.title}>Phone Ledger → Excel</h1>
          <p style={styles.subtitle}>
            Upload photos of your handwritten phone ledger. We'll extract every entry — Name, IMEI,
            Purchase Price, Selling Price and Profit — straight into an Excel sheet.
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
              <UploadCloud size={26} color="#6d28d9" style={{ marginBottom: "8px" }} />
              <p style={styles.dropzoneText}>
                <strong>Click to add photos</strong> or drag & drop them here
              </p>
              <p style={styles.dropzoneHint}>You can select multiple images at once</p>
            </div>

            <button type="button" onClick={loadSampleImages} style={styles.sampleButton}>
              <ImagePlus size={15} /> Load Sample Images
            </button>

            {images.length > 0 && (
              <div style={styles.thumbGrid}>
                {images.map((img, i) => (
                  <div key={i} style={styles.thumb} className="fade-in">
                    <img src={URL.createObjectURL(img)} alt={img.name} style={styles.thumbImg} />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      style={styles.thumbRemove}
                      aria-label="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label style={styles.label}>
              <span style={styles.labelText}>
                <FileSpreadsheet size={14} /> Existing Excel file (optional)
              </span>
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
                  <Loader2 size={16} className="spin-icon" />
                  Processing...
                </span>
              ) : (
                `Extract & Download Excel${images.length ? ` (${images.length} image${images.length > 1 ? "s" : ""})` : ""}`
              )}
            </button>
          </form>

          {loading && <ProcessTracker stage={processStage} uploadProgress={uploadProgress} />}
          {error && <p style={styles.error} className="fade-in">{error}</p>}

          {entries.length > 0 && !showDashboard && (
            <button
              type="button"
              onClick={() => setShowDashboard(true)}
              disabled={!fileReady}
              style={{
                ...styles.dashboardButton,
                opacity: fileReady ? 1 : 0.5,
                cursor: fileReady ? "pointer" : "not-allowed",
              }}
            >
              <LayoutDashboard size={16} /> Create Dashboard
            </button>
          )}
        </div>

        {showDashboard && entries.length > 0 && (
          <div style={{ ...styles.card, marginTop: "20px", maxWidth: "760px" }}>
            <Dashboard entries={entries} />
          </div>
        )}
      </div>
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
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
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#6d28d9",
    background: "#f5f3ff",
    padding: "4px 10px",
    borderRadius: "999px",
    marginBottom: "12px",
  },
  title: { fontSize: "26px", fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" },
  subtitle: { fontSize: "14px", color: "#6b6b7a", marginBottom: "24px", lineHeight: 1.5 },
  dropzone: {
    border: "1.5px dashed #e2e2ea",
    borderRadius: "14px",
    padding: "24px 16px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  dropzoneText: { margin: 0, fontSize: "14px", color: "#1a1a2e" },
  dropzoneHint: { margin: "4px 0 0", fontSize: "12px", color: "#9999a8" },
  sampleButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    width: "100%",
    marginTop: "10px",
    padding: "10px",
    background: "#fafafc",
    border: "1px solid #e2e2ea",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 500,
    color: "#4b4b58",
    cursor: "pointer",
  },
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
  labelText: { display: "flex", alignItems: "center", gap: "6px" },
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
  },
  buttonLoading: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" },
  progressDots: { display: "flex", justifyContent: "center", gap: "8px", marginTop: "16px" },
  dot: { width: "7px", height: "7px", borderRadius: "50%", transition: "background 0.3s ease" },
  error: { color: "#dc2626", marginTop: "16px", fontSize: "13px", textAlign: "center" },
  dashboardButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    marginTop: "16px",
    padding: "12px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
};
