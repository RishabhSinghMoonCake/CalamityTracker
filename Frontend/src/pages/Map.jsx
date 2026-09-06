import React, { useRef, useEffect, useState } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import "@maptiler/sdk/dist/maptiler-sdk.css";
import './Map.css';
import axios from 'axios';
import {TrophySpin} from 'react-loading-indicators'
import {ToastContainer, toast} from 'react-toastify'

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }

    return null;
  } catch {
    return null;
  }
}

const Map = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  maptilersdk.config.apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
  const [userLoc, setUserLoc] = useState('');
  const [result, setResult] = useState(null);
  const [markers, setMarkers] = useState([])
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const userMarkerRef = useRef(null);

  function addMarker(lat, lng, markerColor="#FF0000", markerTitle="Marker", markerDescription="This is an interactive marker!") {
    if (!map.current) return null; 

    const marker = new maptilersdk.Marker({color: markerColor})
      .setLngLat([lng, lat])
      .addTo(map.current);

    const markerEl = marker.getElement();
    markerEl.classList.add('maptiler-marker');

    markerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      new maptilersdk.Popup()
        .setLngLat([lng, lat])
        .setHTML(`<h3>${escapeHtml(markerTitle)}</h3><p>${markerDescription}</p>`)
        .addTo(map.current);
    });
    return marker; 
  }

function getDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;

  const R = 6371; // Radius of Earth in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

async function findNearestDisaster(userLat, userLong) {
  let nearest = null;
  let minDistance = Infinity

  for (const marker of markers) {
    const dist = getDistance(userLat, userLong, marker.lat, marker.lng)
    if(dist < minDistance)
    {
      minDistance = dist
      nearest = marker
    }
  }

  if (nearest) {
    toast.info(`You are ${minDistance} km away from nearest disaster`)
    const lineGeoJSON = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [userLong, userLat],
          [nearest.lng, nearest.lat]
        ]
      }
    };

    if (map.current.getSource('line-connection')) {
      map.current.getSource('line-connection').setData(lineGeoJSON);
    } else {
      map.current.addSource('line-connection', {
        type: 'geojson',
        data: lineGeoJSON
      });

      map.current.addLayer({
        id: 'line-connection-layer',
        type: 'line',
        source: 'line-connection',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#49006bff',
          'line-width': 4
        }
      });
    }

  }
}


  async function fetchResults() {
  try {
    const response = await axios.get(
      `${backendUrl}/api/incidents`,
      {
        params: {
          status: "candidate,active"
        }
      }
    );

    const incidents = response.data?.data || [];

    setResult(incidents);

    const nextMarkers = [];

    for (const incident of incidents) {
      const coordinates = incident.location?.coordinates;

      if (
        !Array.isArray(coordinates) ||
        coordinates.length !== 2
      ) {
        continue;
      }

      const [lng, lat] = coordinates;

      const markerColor =
        incident.status === "active"
          ? "#FF5733"
          : "#F5C542";

      const source = incident.sources?.[0];

      const markerTitle =
        `${incident.type.toUpperCase()} — ${incident.status.toUpperCase()}`;
      const sourceUrl = safeExternalUrl(source?.canonicalUrl);
      const markerDescription = `
        <strong>Location:</strong> ${escapeHtml(incident.locationName)}<br/>
        <strong>Precision:</strong> ${escapeHtml(incident.locationPrecision)}<br/>
        <strong>Severity:</strong> ${escapeHtml(incident.severity)}<br/>
        <strong>Confidence:</strong> ${Math.round(
          incident.confidenceScore * 100
        )}%<br/>
        <strong>Summary:</strong> ${escapeHtml(incident.summary)}<br/>
        <strong>Sources:</strong> ${incident.evidenceCount}
        ${
          sourceUrl
            ? `<br/><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Read source</a>`
            : ""
        }
      `;

      addMarker(
        lat,
        lng,
        markerColor,
        markerTitle,
        markerDescription
      );

      nextMarkers.push({
        lat,
        lng,
        disaster_location: incident.locationName
      });
    }

    setMarkers(nextMarkers);
  } catch (error) {
    console.error("Failed to fetch incidents:", error);
    setResult([]);
  }
}

  useEffect(() => {
    if (map.current) return;
    
    map.current = new maptilersdk.Map({
      container: mapContainer.current,
      style: maptilersdk.MapStyle.LANDSCAPE,
      center: [78.9629,20.5937]
    });
    fetchResults();
  }, []);


  return (
    <div className="map-wrap">
      {
        !result?
        <div className="loading-screen">
          <div className="spin-loader">
            {
              <TrophySpin className='spin-loader' color="#ffe655ff" size="large" text="Fetching Live Disasters" textColor="#ff0000ff" />
            }
          </div>
          
        </div>
        :<></>
      }
      
      <div ref={mapContainer} className="map" />
    </div>
  );
}
export default Map