import mongoose from "mongoose";
import Disaster from "../models/data.model.js";
export async function getDisastersDB(req, res) {
  try {
    const Disaster = mongoose.model("Disaster");
    const disasters = await Disaster.find();
    res.status(200).json(disasters);
  } catch (error) {
    res.status(500).json({ message: "Error fetching disasters", error });
  }
}

export async function addDisasterDB(req, res) {
  const { disaster_datetime, disaster_location, article_link, disaster_type } = req.body;

  if (!disaster_location || !article_link || !disaster_datetime || !disaster_type) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const Disaster = mongoose.model("Disaster");
    const newDisaster = await Disaster.create({
      disaster_location,
      article_link,
      disaster_datetime: new Date(disaster_datetime),
      disaster_type
    });

    res.status(201).json({ message: "Disaster added successfully", data: newDisaster });
  } catch (error) {
    console.error("Error adding disaster:", error);
    res.status(500).json({ message: "Error adding disaster", error: error.message || error });
  }
}
