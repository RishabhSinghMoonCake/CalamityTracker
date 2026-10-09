export const API = import.meta.env.VITE_BACKEND_URL || "";

export const CALAMITY_TYPES = [
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

export const SEVERITIES = [
  { id: "low", label: "Low", color: "#06b6d4" },
  { id: "moderate", label: "Moderate", color: "#eab308" },
  { id: "high", label: "High", color: "#f97316" },
  { id: "critical", label: "Critical", color: "#ef4444" }
];

export function escapeHtml(val) {
  return String(val ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

export function getReporterKey() {
  const storageKey = "calamitytracker:reporter-key";
  let saved = localStorage.getItem(storageKey);
  if (!saved) {
    saved = crypto.randomUUID();
    localStorage.setItem(storageKey, saved);
  }
  return saved;
}

export const BLANK_REPORT = {
  type: "flood",
  severity: "moderate",
  description: "",
  newsUrl: "",
  coordinates: null,
  accuracy: null
};
