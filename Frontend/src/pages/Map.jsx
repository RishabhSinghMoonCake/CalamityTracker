import React, { useRef, useEffect, useState, use } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import "@maptiler/sdk/dist/maptiler-sdk.css";
import './Map.css';
import axios from 'axios';
import {TrophySpin} from 'react-loading-indicators'


const Map = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  maptilersdk.config.apiKey = import.meta.env.VITE_TILE_MAPS_API_KEY;
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

  async function geocodeAndAddDisasterMarker(disaster) {
    const { disaster_location, article_link, disaster_datetime, disaster_type } = disaster;
    try {
      const res = await axios.get(`${backendUrl}/maps/get-coordinates?address=${encodeURIComponent(disaster_location)}`);
      const { lat, lng } = res.data;

      await addMarker(
        lat,
        lng,
        "#FF5733",
        `${disaster_type.toUpperCase()} - ${new Date(disaster_datetime).toLocaleString()}`,
        `<a href="${article_link}" target="_blank">Read more</a><br/>Location: ${disaster_location}`
      );
      setMarkers((m)=>m=[...m, {lat,lng, disaster_location}])

    } catch (err) {
      console.error(`Failed to geocode or add marker for: ${disaster_location}`, err);
    }
  }


  async function setData(dataStr) {
    try {
      console.log('datastr: ' , dataStr)
      const cleaned = dataStr
        .replace(/^```json\s*/, '')  
        .replace(/```$/, '')         
        .trim();
      console.log('cleaned: ', cleaned)

      const parsed = JSON.parse(cleaned);
      console.log('parsed : ' , parsed)
      setResult(parsed); 

      for (const item of parsed) {
        console.log('item: ' ,item)
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
      const dbResponse = await axios.get(`${backendUrl}/api/get-calamities-db`);
      if(dbResponse.data && dbResponse.data.length > 0) 
      {
        const disasters = dbResponse.data;

        setResult(disasters)
        for (const disaster of disasters) {
          await geocodeAndAddDisasterMarker(disaster);
        } 
      }
      else
      {
        const response = await axios.get(`${backendUrl}/api/calamities`);
        const data = response.data;
        setData(data.data);
        console.log('result :', data);
      }


      
    } catch (error) {
      console.error('Error fetching results:', error);
      setResult(null);
      
    }
  }

  useEffect(() => {
    if (map.current) return;
    
    map.current = new maptilersdk.Map({
      container: mapContainer.current,
      style: maptilersdk.MapStyle.LANDSCAPE,
      center: [78.9629,20.5937]
    });
    console.log('fetching results');
    fetchResults();
  }, [result]);


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
      <div className="search-bar">
        <input  onChange={(e) => setUserLoc(e.target.value)} value={userLoc} type="text" placeholder='Enter city' />
        <button onClick={handleSearch}>Search</button>
      </div>
    </div>
  );
}
export default Map