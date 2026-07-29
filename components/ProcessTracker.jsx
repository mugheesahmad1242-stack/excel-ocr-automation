import { UploadCloud, ScanLine, ListChecks, Sparkles, FileSpreadsheet, Check } from "lucide-react";

const STEPS = [
  { key: "uploaded", label: "Images Uploaded", icon: UploadCloud },
  { key: "ocr", label: "OCR / Image Reading", icon: ScanLine },
  { key: "extracted", label: "Data Extracted", icon: ListChecks },
  { key: "gemini", label: "Gemini AI Processing", icon: Sparkles },
  { key: "excel", label: "Excel File Generated", icon: FileSpreadsheet },
];

// Maps the real app state to a status per step.
// "uploading"  -> only step 1 reflects real upload progress
// "processing" -> steps 2-4 activate together (backend runs these as one call today)
// "done"       -> all steps complete
// "error"      -> freeze wherever it stopped, no further pulsing
function getStatuses(stage) {
  switch (stage) {
    case "uploading":
      return ["active", "pending", "pending", "pending", "pending"];
    case "processing":
      return ["complete", "active", "active", "active", "pending"];
    case "done":
      return ["complete", "complete", "complete", "complete", "complete"];
    case "error":
      return ["complete", "active", "active", "active", "pending"];
    default:
      return ["pending", "pending", "pending", "pending", "pending"];
  }
}

export default function ProcessTracker({ stage, uploadProgress = 0 }) {
  if (stage === "idle") return null;

  const statuses = getStatuses(stage);
  const completeCount = statuses.filter((s) => s === "complete").length;
  const fillPercent = Math.min(100, (completeCount / (STEPS.length - 1)) * 100);
  const isError = stage === "error";

  return (
    <div className="tracker-card fade-in">
      <div className="track-line">
        <div className="track-line-fill" style={{ width: `${fillPercent}%` }} />
      </div>

      <div className="steps-row">
        {STEPS.map((step, i) => {
          const status = statuses[i];
          const Icon = step.icon;
          const showPulse = status === "active" && !isError;
          return (
            <div className="step-item" key={step.key}>
              <div className={`step-circle ${status} ${showPulse ? "pulse-dot" : ""}`}>
                {status === "complete" ? <Check size={15} /> : <Icon size={15} />}
              </div>
              <div className={`step-label ${status}`}>
                {step.label}
                {step.key === "uploaded" && status === "active" ? ` ${uploadProgress}%` : ""}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .tracker-card {
          position: relative;
          background: #fff;
          border-radius: 14px;
          padding: 22px 16px 16px;
          margin-top: 20px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
          border: 1px solid #f0f0f4;
          overflow: hidden;
        }
        .track-line {
          position: absolute;
          top: 39px;
          left: 40px;
          right: 40px;
          height: 3px;
          background: #e2e2ea;
          border-radius: 2px;
          z-index: 0;
        }
        .track-line-fill {
          height: 100%;
          background: #16a34a;
          border-radius: 2px;
          transition: width 0.4s ease;
        }
        .steps-row {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 10px;
        }
        .step-item {
          flex: 1 1 0;
          min-width: 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .step-circle {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
          background: #f0f0f4;
          color: #9999a8;
          border: 1px solid #e2e2ea;
        }
        .step-circle.active {
          background: #6d28d9;
          color: #fff;
          border-color: #6d28d9;
        }
        .step-circle.complete {
          background: #16a34a;
          color: #fff;
          border-color: #16a34a;
        }
        .step-label {
          font-size: 11px;
          line-height: 1.3;
          color: #9999a8;
          max-width: 90px;
        }
        .step-label.active {
          color: #6d28d9;
          font-weight: 600;
        }
        .step-label.complete {
          color: #1a1a2e;
          font-weight: 500;
        }

        @media (max-width: 420px) {
          .track-line {
            display: none;
          }
          .step-label {
            font-size: 10px;
            max-width: 62px;
          }
          .step-circle {
            width: 26px;
            height: 26px;
          }
        }
      `}</style>
    </div>
  );
}
