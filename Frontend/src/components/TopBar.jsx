import React from "react";
import { CALAMITY_TYPES, SEVERITIES } from "../utils/constants.js";

export default function TopBar({
  sseConnected,
  filterType,
  setFilterType,
  filterSeverity,
  setFilterSeverity,
  setReportModalOpen,
  drawerOpen,
  setDrawerOpen
}) {
  return (
    <header className="tracker-topbar">
      <div className="brand-section">
        <div className="logo-badge">
          <span className="logo-flame">⚡</span>
        </div>
        <div>
          <div className="topbar-tagline">
            <span className={`live-pulse-dot ${sseConnected ? "online" : "connecting"}`} />
            {sseConnected ? "LIVE INTELLIGENCE STREAM" : "CONNECTING TO FEED..."}
          </div>
          <h1 className="brand-title">Calamity Tracker</h1>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="filter-chip-group">
          <select
            className="glass-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            {CALAMITY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>

          <select
            className="glass-select"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="all">All Severities</option>
            {SEVERITIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn-action btn-report"
          onClick={() => setReportModalOpen(true)}
        >
          📢 Flag Calamity
        </button>

        <button
          className={`btn-action btn-drawer-toggle ${drawerOpen ? "active" : ""}`}
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          {drawerOpen ? "Hide Panel ✕" : "Feed & Signals ☰"}
        </button>
      </div>
    </header>
  );
}
