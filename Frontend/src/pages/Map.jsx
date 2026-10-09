import { useEffect, useRef, useState, useCallback } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Map.css";

// Same-origin by default: Nginx (production) and Vite (development) proxy /api.
const API = import.meta.env.VITE_BACKEND_URL || "";

const CALAMITY_TYPES = [
  { id: "all", label: "All Calamities", icon: "🌐" },
  { id: "flood", label: "Flood", icon: "🌊" },
  { id: "wildfire", label: "Wildfire", icon: "🔥" },
  { id: "earthquake", label: "Earthquake", icon: "⚡" },
  { id: "landslide", label: "Landslide", icon: "🏔️" },
  { id: "storm", label: "Storm & Cyclone", icon: "🌪️" },
  { id: "tsunami", label: "Tsunami", icon: "🌊" },
  { id: "volcano", label: "Volcanic Eruption", icon: "🌋" },
  { id: "outbreak", label: "Outbreak", icon: "☣️" },
  { id: "accident", label: "Major Accident", icon: "💥" },
  { id: "conflict", label: "Armed Conflict", icon: "🛡️" },
  { id: "other", label: "Other Hazard", icon: "⚠️" }
];

const SEVERITIES = [
  { id: "low", label: "Low", color: "#06b6d4" },
  { id: "moderate", label: "Moderate", color: "#eab308" },
  { id: "high", label: "High", color: "#f97316" },
  { id: "critical", label: "Critical", color: "#ef4444" }
];

function escapeHtml(val) {
  return String(val ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function getReporterKey() {
  const storageKey = "calamitytracker:reporter-key";
  let saved = localStorage.getItem(storageKey);
  if (!saved) {
    saved = crypto.randomUUID();
    localStorage.setItem(storageKey, saved);
  }
  return saved;
}

const BLANK_REPORT = {
  type: "flood",
  severity: "moderate",
  description: "",
  newsUrl: "",
  coordinates: null,
  accuracy: null
};

export default function Map() {
  const container = useRef(null);
  const map = useRef(null);
  const incidentMarkers = useRef([]);
  const communityMarkers = useRef([]);
  const reportPinMarker = useRef(null);

  // Core Data
  const [incidents, setIncidents] = useState([]);
  const [communityReports, setCommunityReports] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  // UI Controls
  const [activeDrawerTab, setActiveDrawerTab] = useState("incidents"); // 'incidents' | 'community' | 'my_reports'
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState(BLANK_REPORT);
  const [isPickingLocation, setIsPickingLocation] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  // Fetch Incidents Feed
  const loadIncidents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/incidents?status=candidate,active&limit=200`);
      if (!res.ok) throw new Error("Incident feed unavailable");
      const json = await res.json();
      setIncidents(json.data || []);
    } catch (err) {
      console.warn("Failed to load incidents:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Public Community Reports
  const loadCommunityReports = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/reports?limit=100`);
      if (!res.ok) return;
      const json = await res.json();
      setCommunityReports(json.data || []);
    } catch (err) {
      console.warn("Failed to load community reports:", err.message);
    }
  }, []);

  // Fetch My Submissions
  const loadMyReports = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/reports/mine`, {
        headers: { "X-Reporter-Key": getReporterKey() }
      });
      if (!res.ok) return;
      const json = await res.json();
      setMyReports(json.data || []);
    } catch (err) {
      console.warn("Failed to load user reports:", err.message);
    }
  }, []);

  // Refresh All Data
  const refreshAll = useCallback(() => {
    loadIncidents();
    loadCommunityReports();
    loadMyReports();
  }, [loadIncidents, loadCommunityReports, loadMyReports]);

  // Initialize Map
  useEffect(() => {
    maptilersdk.config.apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
    map.current = new maptilersdk.Map({
      container: container.current,
      style: maptilersdk.MapStyle.DATAVIZ.DARK,
      geopolitics: "in",
      center: [78.9629, 20.5937],
      zoom: 3.8
    });

    map.current.addControl(new maptilersdk.NavigationControl(), "bottom-right");

    refreshAll();

    // Setup SSE Stream
    let stream;
    try {
      stream = new EventSource(`${API}/api/events/incidents`);

      stream.addEventListener("connected", () => {
        setSseConnected(true);
      });

      stream.addEventListener("incident.created", (e) => {
        refreshAll();
        try {
          const data = JSON.parse(e.data);
          toast.info(`🚨 New Disaster Candidate: ${data.payload?.type || "Incident"} detected`);
        } catch (error) {
          console.warn("Could not parse incident event", error);
        }
      });

      stream.addEventListener("incident.updated", () => {
        refreshAll();
      });

      stream.addEventListener("report.corroborating", () => {
        loadCommunityReports();
      });

      stream.addEventListener("report.corroborated", () => {
        loadCommunityReports();
        toast.success("Community report corroborated nearby!");
      });

      stream.onerror = () => {
        setSseConnected(false);
      };
    } catch (err) {
      console.warn("SSE Setup failed:", err);
    }

    return () => {
      stream?.close();
      map.current?.remove();
    };
  }, [refreshAll, loadCommunityReports]);

  // Click on Map to Select Location
  useEffect(() => {
    if (!map.current) return;

    const handleMapClick = (e) => {
      if (isPickingLocation || reportModalOpen) {
        const coordinates = [Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))];
        setReportForm((prev) => ({ ...prev, coordinates, accuracy: 25 }));
        setIsPickingLocation(false);
        toast.success(`Location set to [${coordinates[1]}°, ${coordinates[0]}°]`);

        // Update pin marker on map
        if (!reportPinMarker.current) {
          const el = document.createElement("div");
          el.className = "report-pin-marker";
          el.innerHTML = "📍";
          reportPinMarker.current = new maptilersdk.Marker({ element: el })
            .setLngLat(coordinates)
            .addTo(map.current);
        } else {
          reportPinMarker.current.setLngLat(coordinates);
        }
      }
    };

    map.current.on("click", handleMapClick);
    return () => map.current?.off("click", handleMapClick);
  }, [isPickingLocation, reportModalOpen]);

  // Render Incident Markers
  useEffect(() => {
    if (!map.current) return;
    incidentMarkers.current.forEach((m) => m.remove());
    incidentMarkers.current = [];

    const filtered = incidents.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterSeverity !== "all" && item.severity !== filterSeverity) return false;
      return true;
    });

    filtered.forEach((incident) => {
      const [lng, lat] = incident.location?.coordinates || [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

      const isActive = incident.status === "active";

      const markerEl = document.createElement("div");
      markerEl.className = `custom-incident-marker ${isActive ? "active" : "candidate"} ${incident.severity || "moderate"}`;
      markerEl.innerHTML = `<span class="marker-pulse"></span><span class="marker-core"></span>`;

      const sourceUrl = (() => {
        try {
          const s = incident.sources?.[0]?.canonicalUrl;
          const parsed = new URL(s);
          return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
        } catch {
          return null;
        }
      })();

      const popupHtml = `
        <div class="tracker-popup incident-theme">
          <div class="popup-header">
            <span class="badge ${incident.status}">${escapeHtml(incident.status.toUpperCase())}</span>
            <span class="badge severity ${incident.severity}">${escapeHtml(incident.severity.toUpperCase())}</span>
          </div>
          <h3 class="popup-title">${escapeHtml(incident.type?.toUpperCase())}</h3>
          <p class="popup-summary">${escapeHtml(incident.summary)}</p>
          <div class="popup-meta">
            <div>📍 <strong>${escapeHtml(incident.locationName || "Unknown")}</strong> (${escapeHtml(incident.locationPrecision)})</div>
            <div>🎯 Confidence: <strong>${Math.round((incident.confidenceScore || 0) * 100)}%</strong></div>
            <div>📊 Evidence: <strong>${incident.evidenceCount || 1} articles · ${incident.communityReportCount || 0} citizen reports</strong></div>
          </div>
          ${sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="popup-link">🔗 Read Source Article</a>` : ""}
        </div>
      `;

      const marker = new maptilersdk.Marker({ element: markerEl })
        .setLngLat([lng, lat])
        .setPopup(new maptilersdk.Popup({ offset: 18 }).setHTML(popupHtml))
        .addTo(map.current);

      incidentMarkers.current.push(marker);
    });
  }, [incidents, filterType, filterSeverity]);

  // Render Community Signal Markers
  useEffect(() => {
    if (!map.current) return;
    communityMarkers.current.forEach((m) => m.remove());
    communityMarkers.current = [];

    communityReports.forEach((report) => {
      const [lng, lat] = report.location?.coordinates || [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

      const markerEl = document.createElement("div");
      markerEl.className = "community-radar-marker";
      markerEl.innerHTML = `<span class="radar-ping"></span><span class="radar-icon">👥</span>`;

      const popupHtml = `
        <div class="tracker-popup community-theme">
          <div class="popup-header">
            <span class="badge community">CITIZEN SIGNAL</span>
            <span class="badge ${report.status}">${escapeHtml(report.status.replace(/_/g, " "))}</span>
          </div>
          <h3 class="popup-title">Community Alert: ${escapeHtml(report.type?.toUpperCase())}</h3>
          <p class="popup-summary">"${escapeHtml(report.description)}"</p>
          <div class="popup-meta">
            <div>⏱️ Occurred: ${new Date(report.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div>👥 Corroborations: <strong>${report.corroborationCount}</strong> (${report.confirmationsNeeded > 0 ? `${report.confirmationsNeeded} needed to promote` : "Corroborated!"})</div>
          </div>
        </div>
      `;

      const marker = new maptilersdk.Marker({ element: markerEl })
        .setLngLat([lng, lat])
        .setPopup(new maptilersdk.Popup({ offset: 18 }).setHTML(popupHtml))
        .addTo(map.current);

      communityMarkers.current.push(marker);
    });
  }, [communityReports]);

  // Fly to Coordinate on Map
  function flyToIncident(coords) {
    if (coords && map.current) {
      map.current.flyTo({ center: coords, zoom: 8.5, speed: 1.2 });
    }
  }

  // Get User GPS Location
  function useGpsLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    toast.info("Requesting approximate GPS coordinates...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const c = [Number(coords.longitude.toFixed(5)), Number(coords.latitude.toFixed(5))];
        setReportForm((prev) => ({ ...prev, coordinates: c, accuracy: Math.round(coords.accuracy) }));
        toast.success("GPS Location acquired!");
        if (map.current) {
          map.current.flyTo({ center: c, zoom: 10 });
        }
      },
      (err) => {
        toast.error(`Location access denied: ${err.message}. Click on map to place pin instead.`);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  // Submit Community Report
  async function handleReportSubmit(e) {
    e.preventDefault();
    if (!reportForm.coordinates) {
      toast.warn("Please pick a location on the map or use GPS first.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Reporter-Key": getReporterKey()
        },
        body: JSON.stringify({
          clientReportId: crypto.randomUUID(),
          type: reportForm.type,
          severity: reportForm.severity,
          description: reportForm.description,
          newsUrl: reportForm.newsUrl || undefined,
          location: { coordinates: reportForm.coordinates },
          locationAccuracyMeters: reportForm.accuracy,
          occurredAt: new Date().toISOString()
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || "Failed to submit report");

      if (payload.incidentId) {
        toast.success("🎯 Your report corroborated and promoted a live candidate incident!");
      } else if (payload.confirmationsNeeded) {
        toast.info(`Report saved! ${payload.confirmationsNeeded} independent nearby report(s) needed to promote.`);
      } else {
        toast.success("Citizen report logged successfully.");
      }

      setReportForm(BLANK_REPORT);
      setReportModalOpen(false);
      reportPinMarker.current?.remove();
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Corroborate Existing Report Action
  async function handleCorroborate(reportId) {
    try {
      if (!navigator.geolocation) throw new Error("Location is required to corroborate a report");
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000
      }));
      const res = await fetch(`${API}/api/reports/${reportId}/corroborate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Reporter-Key": getReporterKey()
        },
        body: JSON.stringify({
          comment: "Confirmed by community observer via live map.",
          location: { coordinates: [position.coords.longitude, position.coords.latitude] }
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not corroborate");

      if (json.promoted) {
        toast.success("🎉 Threshold reached! Incident promoted to candidate status!");
      } else {
        toast.success(`Corroborated! ${json.confirmationsNeeded} more endorsement(s) needed.`);
      }
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="tracker-root">
      {/* Map Canvas */}
      <div
        ref={container}
        className={`map-viewport ${isPickingLocation ? "cursor-crosshair" : ""}`}
      />

      {/* Modern Glassmorphic Top Bar */}
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

        {/* Filters & Actions */}
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

      {/* Floating Status & Legend Pill */}
      <div className="map-floating-legend">
        <span className="legend-item">
          <span className="dot active-dot" /> Verified Active ({incidents.filter((i) => i.status === "active").length})
        </span>
        <span className="legend-item">
          <span className="dot candidate-dot" /> AI Candidate ({incidents.filter((i) => i.status === "candidate").length})
        </span>
        <span className="legend-item">
          <span className="dot community-dot" /> Citizen Signal ({communityReports.length})
        </span>
      </div>

      {/* Sliding Intelligence Drawer */}
      {drawerOpen && (
        <aside className="intelligence-drawer">
          <div className="drawer-tab-bar">
            <button
              className={`drawer-tab ${activeDrawerTab === "incidents" ? "active" : ""}`}
              onClick={() => setActiveDrawerTab("incidents")}
            >
              Incidents ({incidents.length})
            </button>
            <button
              className={`drawer-tab ${activeDrawerTab === "community" ? "active" : ""}`}
              onClick={() => setActiveDrawerTab("community")}
            >
              Community Pulse ({communityReports.length})
            </button>
            <button
              className={`drawer-tab ${activeDrawerTab === "my_reports" ? "active" : ""}`}
              onClick={() => setActiveDrawerTab("my_reports")}
            >
              My Reports ({myReports.length})
            </button>
          </div>

          <div className="drawer-content">
            {/* Tab 1: Incidents Feed */}
            {activeDrawerTab === "incidents" && (
              <div className="card-list">
                {incidents.length === 0 ? (
                  <div className="empty-state">No incidents currently match your filter.</div>
                ) : (
                  incidents.map((incident) => (
                    <article
                      key={incident.id}
                      className="incident-feed-card"
                      onClick={() => flyToIncident(incident.location?.coordinates, incident)}
                    >
                      <div className="card-header">
                        <span className="calamity-type-badge">
                          {incident.type?.toUpperCase()}
                        </span>
                        <span className={`badge severity ${incident.severity}`}>
                          {incident.severity}
                        </span>
                      </div>
                      <p className="card-summary">{incident.summary}</p>
                      <div className="card-footer">
                        <span>📍 {incident.locationName || "Region"}</span>
                        <span>🎯 {Math.round((incident.confidenceScore || 0) * 100)}% conf</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}

            {/* Tab 2: Community Pulse */}
            {activeDrawerTab === "community" && (
              <div className="card-list">
                <p className="section-hint">
                  Citizen reports are private signals until corroborated by 3 nearby observers.
                </p>
                {communityReports.length === 0 ? (
                  <div className="empty-state">No pending community reports.</div>
                ) : (
                  communityReports.map((report) => (
                    <article key={report.id} className="community-feed-card">
                      <div className="card-header">
                        <span className="calamity-type-badge community">
                          👥 {report.type?.toUpperCase()}
                        </span>
                        <span className="corroboration-meter">
                          {report.corroborationCount}/3 Confirmed
                        </span>
                      </div>
                      <p className="card-description">"{report.description}"</p>
                      <div className="corroboration-progress">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.min((report.corroborationCount / 3) * 100, 100)}%`
                          }}
                        />
                      </div>
                      <div className="community-actions">
                        <button
                          className="btn-corroborate"
                          onClick={() => handleCorroborate(report.id)}
                        >
                          👍 I See This Too (Corroborate)
                        </button>
                        <button
                          className="btn-locate"
                          onClick={() => flyToIncident(report.location?.coordinates, null)}
                        >
                          View Area
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: My Submissions */}
            {activeDrawerTab === "my_reports" && (
              <div className="card-list">
                {myReports.length === 0 ? (
                  <div className="empty-state">
                    You haven't submitted any reports from this device yet.
                  </div>
                ) : (
                  myReports.map((myRep) => (
                    <article key={myRep.id} className="my-report-card">
                      <div className="card-header">
                        <strong>{myRep.type?.toUpperCase()}</strong>
                        <span className={`badge ${myRep.status}`}>
                          {myRep.status === "attached_to_incident" ? "Verified & Attached" : myRep.status}
                        </span>
                      </div>
                      <p className="card-summary">{myRep.description}</p>
                      <div className="card-footer">
                        <small>Submitted: {new Date(myRep.createdAt).toLocaleString()}</small>
                        <small>Corroborations: {myRep.corroborationCount}</small>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Citizen Report Modal */}
      {reportModalOpen && (
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
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <span>Synchronizing Disaster Intelligence Feed...</span>
        </div>
      )}
    </div>
  );
}
