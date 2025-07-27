import mongoose from "mongoose";

const disasterSchema = new mongoose.Schema({
  disaster_location: { type: String, required: true },
  article_link: { type: String, required: true },
  disaster_datetime: { type: Date, required: true },
  disaster_type: { type: String, required: true },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60*60 * 5 
  }
});


const Disaster = mongoose.model("Disaster", disasterSchema);

export default Disaster;
