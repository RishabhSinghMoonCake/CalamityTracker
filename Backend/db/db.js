import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_KEY || "mongodb://127.0.0.1:27017/calamitytracker";
    await mongoose.connect(mongoUri);
    console.log("MongoDB connection established successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

export default connectDB;