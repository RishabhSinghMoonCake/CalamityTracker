import React, { useRef, useEffect, useState } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import "@maptiler/sdk/dist/maptiler-sdk.css";
import './Map.css';
import axios from 'axios';
import {TrophySpin} from 'react-loading-indicators'
import {ToastContainer, toast} from 'react-toastify'

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
    console.log("Backend URL:", backendUrl);
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
        .setHTML(`<h3>${markerTitle}</h3><p>${markerDescription}</p>`)
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


  async function handleSearch() {
    if (!userLoc || userLoc.length < 3) return;

    try {
      const response = await fetch(`${backendUrl}/maps/get-coordinates?address=${userLoc}`);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch coordinates');
      }
      const data = await response.json();
      if (data) {
        const { lng, lat } = data;
        map.current.setCenter([lng, lat]);
        map.current.setZoom(3)
        if(userMarkerRef.current) {
          userMarkerRef.current.remove(); 
        }
        userMarkerRef.current = await addMarker(lat, lng, "#00FF00", "User Location", `You searched for: ${userLoc}`);
        findNearestDisaster(lat,lng)
        
        setUserLoc('');
      }
    } catch (error) {
      console.error('Error fetching coordinates:', error);
      
    }

  }


  async function setData(dataStr) {
    try {
      const cleaned = dataStr
        .replace(/^```json\s*/, '')  
        .replace(/```$/, '')         
        .trim();

      const parsed = JSON.parse(cleaned);
      setResult(parsed); 

      for (const item of parsed) {
        try{
          await axios.post(`${backendUrl}/api/add-calamity-db`, {
            disaster_datetime: item.disaster_datetime,
            disaster_location: item.disaster_location,
            article_link: item.article_link,
            disaster_type: item.disaster_type
          });
        
        } catch (err) {
          console.log("Failed to add disaster to DB:", err);
        }
        await geocodeAndAddDisasterMarker(item);
      }
    } catch (err) {
      console.error("Failed to parse disaster data:", err);
    }
  }


  async function fetchResults() {
    try {
      try {
        const res = await axios.get(
          "https://eonet.gsfc.nasa.gov/api/v3/events?days=20&status=open"
        );

        if (res.data) {
          for (const item of res.data.events) {
            const lat = item.geometry[0].coordinates[1];
            const lng = item.geometry[0].coordinates[0];
            const disaster_type =
              item.categories[0].id || item.categories[0].title;
            const article_link = item.sources[0].url;
            const disaster_location = "From NASA Open API";
            const disaster_datetime = item.geometry[0].date;

            await addMarker(
              lat,
              lng,
              "#fffb00",
              `${disaster_type.toUpperCase()} - ${new Date(
                disaster_datetime
              ).toLocaleString()}`,
              `<a href="${article_link}" target="_blank">Read more</a><br/>Location: ${disaster_location}`
            );

            setMarkers((m) => [...m, { lat, lng, disaster_location }]);
          }
        }
      } catch (err) {
        console.log("NASA API failed, continuing...");
      }

      const dbResponse = await axios.get(
        `${backendUrl}/api/get-calamities-db`
      );

      if (dbResponse.data && dbResponse.data.length > 0) {
        const disasters = dbResponse.data;
        setResult(disasters);

        for (const disaster of disasters) {
          await addMarker(
            disaster.lat,
            disaster.lng,
            "#FF5733",
            `${disaster.disaster_type.toUpperCase()} - ${new Date(disaster.disaster_datetime).toLocaleString()}`,
            `<a href="${disaster.article_link}" target="_blank">Read more</a><br/>Location: ${disaster.disaster_location}`
          );

          setMarkers((m) => [
            ...m,
            {
              lat: disaster.lat,
              lng: disaster.lng,
              disaster_location: disaster.disaster_location
            }
          ]);
        }
      } else {
        const response = await axios.get(`${backendUrl}/api/calamities`);
        const data = response.data;

        setData(data.data);
      }
    } catch (error) {
      console.error("Error fetching results:", error);
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