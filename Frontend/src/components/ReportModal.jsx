import React from "react";
import { toast } from "react-toastify";
import { CALAMITY_TYPES, SEVERITIES } from "../utils/constants.js";

export default function ReportModal({
  setReportModalOpen,
  reportForm,
  setReportForm,
  handleReportSubmit,
  isPickingLocation,
  setIsPickingLocation,
  useGpsLocation,
  submitting
}) {
  return (
    <div className="modal-backdrop" onClick={() => setReportModalOpen(false)}>
      <div className="modal-container glass-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow-tag">COMMUNITY CITIZEN SIGNAL</span>
            <h2>Report a Disaster Event</h2>
          </div>
          <button
            className="btn-close-modal"
            onClick={() => setReportModalOpen(false)}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleReportSubmit} className="report-form">
          <div className="form-row-2">
            <label className="form-group">
              <span>Calamity Type</span>
              <select
                value={reportForm.type}
                onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}
              >
                {CALAMITY_TYPES.filter((t) => t.id !== "all").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span>Estimated Severity</span>
              <select
                value={reportForm.severity}
                onChange={(e) => setReportForm({ ...reportForm, severity: e.target.value })}
              >
                {SEVERITIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="form-group">
            <span>What are you directly observing? (10 - 1000 chars)</span>
            <textarea
              required
              minLength={10}
              maxLength={1000}
              placeholder="Describe rising water levels, smoke plumes, roadblocks, or damage without personal identifiable info..."
              value={reportForm.description}
              onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
            />
          </label>

          <label className="form-group">
            <span>Evidence Link / News URL (Optional)</span>
            <input
              type="url"
              placeholder="https://news.local/article"
              value={reportForm.newsUrl}
              onChange={(e) => setReportForm({ ...reportForm, newsUrl: e.target.value })}
              style={{
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
                padding: "10px 14px",
                color: "#fff",
                fontFamily: "var(--font-body)",
                fontSize: "0.88rem"
              }}
            />
          </label>

          <div className="location-picker-section">
            <span>Incident Pinpoint Location</span>
            <div className="location-btn-row">
              <button
                type="button"
                className={`btn-location-mode ${isPickingLocation ? "active" : ""}`}
                onClick={() => {
                  setIsPickingLocation(true);
                  toast.info("Click anywhere on the map to set the pinpoint coordinates.");
                }}
              >
                📍 {reportForm.coordinates ? "Pin Selected: Click to Change" : "Click on Map to Place Pin"}
              </button>

              <button
                type="button"
                className="btn-gps"
                onClick={useGpsLocation}
              >
                📡 Use My GPS Location
              </button>
            </div>

            {reportForm.coordinates && (
              <div className="coordinates-indicator">
                ✓ Coordinates: [{reportForm.coordinates[1]}°, {reportForm.coordinates[0]}°]
                {reportForm.accuracy && ` (±${reportForm.accuracy}m accuracy)`}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <p className="privacy-notice">
              🔒 Citizen exact locations are never published. Only aggregated cluster centroids are exposed to map viewers.
            </p>
            <div className="modal-btn-row">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || !reportForm.coordinates}
              >
                {submitting ? "Submitting Signal..." : "Submit Incident Report"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
