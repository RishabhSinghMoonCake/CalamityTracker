import express from 'express';
import axios from 'axios';

export default async function addressCoordinates(req, res)
{
  const api = process.env.GOOGLE_MAPS_API_KEY;
  const address = req.query.address;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${api}`;

  try {
    const response = await axios.get(url);
    const { results } = response.data;
    if (results.length > 0) {
      const { geometry } = results[0];
      res.json({
      lat: geometry.location.lat,
      lng: geometry.location.lng
      });
    } else {
      res.status(404).json({ error: 'Address not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function getAutocompleteSuggestions(req, res) {
  const api = process.env.GOOGLE_MAPS_API_KEY;
  const query = req.query.address;
  if(query.length < 3) {
    return res.status(400).json({ error: 'Query must be at least 3 characters long' });
  }
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${api}`;

  try {
    const response = await axios.get(url);
    const { predictions } = response.data;
    if(predictions.length === 0) {
      return res.status(404).json({ error: 'No suggestions found' });
    }
    res.json({predictions});
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}