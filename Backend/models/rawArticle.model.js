import mongoose from "mongoose";

const rawArticleSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      trim: true
    },
    sourceArticleId: {
      type: String,
      trim: true
    },
    canonicalUrl:{
      type: String,
      required: true,
      trim : true,
      unique: true
    },
    title:{
      type:String,
      required: true,
      trim: true

    },
    description:{
      type: String,
      default:""
    },
    publishedAt:{
      type:Date,
      required:true
    },
    country:{
      type:String,
      default:"unknown",
      trim: true
    },
    rawPayload:{
      type:mongoose.Schema.Types.Mixed,
      required:true
    },
    status: {
      type: String,
      enum: ["pending", "processing", "processed", "failed", "skipped"],
      default: "pending",
      index: true
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0
    },

    lastError: {
      type: String,
      default: null
    },

    processedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("RawArticle", rawArticleSchema);
