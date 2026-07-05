import mongoose from "mongoose";

const disasterSchema = new mongoose.Schema({
  disaster_location: {
    type: String,
    required: true
  },
  article_link: {
    type: String,
    required: true
  },
  disaster_datetime: {
    type: Date,
    required: true
  },
  disaster_type: {
    type: String,
    required: true
  },
  lat: {
    type: Number,
    required: true
  },
  lng: {
    type: Number,
    required: true
  }
});

export default mongoose.model("Disaster", disasterSchema);