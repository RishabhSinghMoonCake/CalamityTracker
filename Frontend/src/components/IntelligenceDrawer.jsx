import React from "react";

export default function IntelligenceDrawer({
  activeDrawerTab,
  setActiveDrawerTab,
  incidents,
  communityReports,
  myReports,
  flyToIncident,
  handleCorroborate
}) {
  return (
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
  );
}
