import express from "express";
import axios from "axios";

export default async function addressCoordinates(req, res) {
  const address = req.query.address;

  if (!address) {
    return res.status(400).json({
      error: "Address is required"
    });
  }

  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q: address,
          format: "json",
          limit: 1
        },
        headers: {
          "User-Agent": "CalamityTracker/1.0"
        }
      }
    );

    console.log("Nominatim response:", response.data);

    const results = response.data;

    if (!results.length) {
      return res.status(404).json({
        error: "Address not found"
      });
    }

    res.json({
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon)
    });

  } catch (error) {
    console.error("Nominatim error:", error.message);
    res.status(500).json({
      error: "Internal Server Error"
    });
  }
}

export async function getAutocompleteSuggestions(req, res) {
  const api = process.env.GOOGLE_MAPS_API_KEY;
  const query = req.query.address;

  if (query.length < 3) {
    return res.status(400).json({
      error: "Query must be at least 3 characters long"
    });
  }

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${api}`;

  try {
    const response = await axios.get(url);
    const { predictions } = response.data;

    if (predictions.length === 0) {
      return res.status(404).json({
        error: "No suggestions found"
      });
    }

    res.json({ predictions });

  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error"
    });
  }
}

export async function distanceBetween(req, res) {
  const { origin, destination } = req.query;

  if (!origin || !destination) {
    return res.json({
      error: "all fields are required"
    });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const url = "https://maps.googleapis.com/maps/api/distancematrix/json";

  try {
    const response = await axios.get(url, {
      params: {
        origins: origin,
        destinations: destination,
        key: apiKey
      }
    });

    const data = response.data;

    if (data.rows[0].elements[0]) {
      res.json({
        distance: data.rows[0].elements[0].distance.value
      });
    } else {
      res.json({
        error: "address error"
      });
    }

  } catch (error) {
    res.json({
      error: error.message
    });
  }
}