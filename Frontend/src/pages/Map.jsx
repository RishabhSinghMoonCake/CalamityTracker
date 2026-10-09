import { useEffect, useRef, useState, useCallback } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Map.css";

import { API, getReporterKey, BLANK_REPORT, escapeHtml } from "../utils/constants.js";
import TopBar from "../components/TopBar.jsx";
import IntelligenceDrawer from "../components/IntelligenceDrawer.jsx";
import ReportModal from "../components/ReportModal.jsx";

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
  const [showUnverified, setShowUnverified] = useState(false);

  // UI Controls
  const [activeDrawerTab, setActiveDrawerTab] = useState("incidents");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState(BLANK_REPORT);
  const [isPickingLocation, setIsPickingLocation] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [submitting, setSubmitting] = useState(false);

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
      center: [78.9629, 20.5937],
      zoom: 3.8
    });

    map.current.on("style.load", () => {
      // Enforce the Indian geopolitical view (Survey of India compliance)
      // This absorbs LOC/LAC and Arunachal Pradesh into standard country borders
      if (map.current.getLayer("Country border")) {
        map.current.setFilter("Country border", [
          "all",
          ["==", "admin_level", 2],
          ["==", "maritime", 0],
          ["any", ["==", "disputed", 0], ["==", "claimed_by", "IN"]]
        ]);
      }
      if (map.current.getLayer("Disputed border")) {
        map.current.setLayoutProperty("Disputed border", "visibility", "none");
      }
    });

    map.current.addControl(new maptilersdk.NavigationControl(), "bottom-right");

    refreshAll();

    let stream;
    try {
      stream = new EventSource(`${API}/api/events/incidents`);

      stream.addEventListener("connected", () => setSseConnected(true));

      stream.addEventListener("incident.created", (e) => {
        refreshAll();
        try {
          const data = JSON.parse(e.data);
          toast.info(`🚨 New Disaster Candidate: ${data.payload?.type || "Incident"} detected`);
        } catch (error) {
          console.warn("Could not parse incident event", error);
        }
      });

      stream.addEventListener("incident.updated", () => refreshAll());
      stream.addEventListener("report.corroborating", () => loadCommunityReports());
      stream.addEventListener("report.corroborated", () => {
        loadCommunityReports();
        toast.success("Community report corroborated nearby!");
      });

      stream.onerror = () => setSseConnected(false);
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

        if (!reportPinMarker.current) {
          const el = document.createElement("div");
          el.className = "report-pin-marker";
          el.innerHTML = "📍";
          reportPinMarker.current = new maptilersdk.Marker({ element: el, anchor: "top-left" })
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

      const marker = new maptilersdk.Marker({ element: markerEl, anchor: "top-left" })
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
      // Verified/attached reports are natively drawn as Incidents on the main map.
      if (report.status === "attached_to_incident" || report.verifiedByAdmin) return;
      
      // If the user hasn't toggled unverified signals on, don't draw them!
      if (!showUnverified) return;

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

      const marker = new maptilersdk.Marker({ element: markerEl, anchor: "top-left" })
        .setLngLat([lng, lat])
        .setPopup(new maptilersdk.Popup({ offset: 18 }).setHTML(popupHtml))
        .addTo(map.current);

      communityMarkers.current.push(marker);
    });
  }, [communityReports, showUnverified]);

  function flyToIncident(coords, type) {
    if (coords && map.current) {
      map.current.flyTo({ center: coords, zoom: 8.5, speed: 1.2 });
      if (type === "unverified" && !showUnverified) {
        toast.info("Turn on 'Show Unverified Signals' toggle at the top to see the exact marker.");
      }
    }
  }

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
      <div
        ref={container}
        className={`map-viewport ${isPickingLocation ? "cursor-crosshair" : ""}`}
      />

      <TopBar
        sseConnected={sseConnected}
        filterType={filterType}
        setFilterType={setFilterType}
        filterSeverity={filterSeverity}
        setFilterSeverity={setFilterSeverity}
        setReportModalOpen={setReportModalOpen}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        showUnverified={showUnverified}
        setShowUnverified={setShowUnverified}
      />

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

      {drawerOpen && (
        <IntelligenceDrawer
          activeDrawerTab={activeDrawerTab}
          setActiveDrawerTab={setActiveDrawerTab}
          incidents={incidents}
          communityReports={communityReports}
          myReports={myReports}
          flyToIncident={flyToIncident}
          handleCorroborate={handleCorroborate}
        />
      )}

      {reportModalOpen && (
        <ReportModal
          setReportModalOpen={setReportModalOpen}
          reportForm={reportForm}
          setReportForm={setReportForm}
          handleReportSubmit={handleReportSubmit}
          isPickingLocation={isPickingLocation}
          setIsPickingLocation={setIsPickingLocation}
          useGpsLocation={useGpsLocation}
          submitting={submitting}
        />
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
