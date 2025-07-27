import React, { useRef, useEffect, useState, use } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import "@maptiler/sdk/dist/maptiler-sdk.css";
import './Map.css';
import axios from 'axios';


const Map = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  maptilersdk.config.apiKey = import.meta.env.VITE_TILE_MAPS_API_KEY;
  const [userLoc, setUserLoc] = useState('');
  const [result, setResult] = useState(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const userMarkerRef = useRef(null);

  async function addMarker(lat, lng, markerColor="#FF0000", markerTitle="Marker", markerDescription="This is an interactive marker!") {
    if (!map.current) return null; // Return null if map is not ready

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
    return marker; // Make sure to return the marker instance
  }

  async function handleSearch() {
    if (!userLoc || userLoc.length < 3) return;

    // Geocode user location and update map view
    try {
      const response = await fetch(`${backendUrl}/maps/get-coordinates?address=${userLoc}`);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch coordinates');
      }
      const data = await response.json();
      if (data) {
        const { lng, lat } = data;
        map.current.setCenter([lng, lat]);
        if(userMarkerRef.current) {
          userMarkerRef.current.remove(); // This should work if current is a marker instance
        }
        userMarkerRef.current = await addMarker(lat, lng, "#00FF00", "User Location", `You searched for: ${userLoc}`);
        setUserLoc(''); // Clear input after search
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
    } catch (err) {
      console.error(`Failed to geocode or add marker for: ${disaster_location}`, err);
    }
  }


  async function setData(dataStr) {
    try {
      // Remove markdown formatting like ```json\n and trailing ```
      console.log('datastr: ' , dataStr)
      const cleaned = dataStr
        .replace(/^```json\s*/, '')  // remove leading ```json\n
        .replace(/```$/, '')         // remove trailing ```
        .trim();                     // trim whitespace
      console.log('cleaned: ', cleaned)

      const parsed = JSON.parse(cleaned);
      console.log('parsed : ' , parsed)
      setResult(parsed); // Store parsed result if needed

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
        // axios returns the data directly
        const data = response.data;
        setData(data.data); // setResult to the actual object
        console.log('result :', data);
      }


      
    } catch (error) {
      console.error('Error fetching results:', error);
      setResult(null);
      
    }
  }

  useEffect(() => {
    if (map.current) return; // stops map from intializing more than once
    
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
          Loading...
        </div>
        :<></>
      }
      
      <div ref={mapContainer} className="map" />
      <div className="search-bar">
        <input  onChange={(e) => setUserLoc(e.target.value)} value={userLoc} type="text" placeholder='Enter Location' />
        <button onClick={handleSearch}>Search</button>
      </div>
    </div>
  );
}
export default Map