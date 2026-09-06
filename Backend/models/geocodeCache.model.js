import mongoose from "mongoose";

const geocodeCacheSchema = new mongoose.Schema(
  {
    normalizedQuery: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },

    originalQuery: {
      type: String,
      required: true,
      trim: true
    },

    status: {
      type: String,
      enum: ["resolved", "not_found", "failed"],
      required: true,
      index: true
    },

    displayName: {
      type: String,
      default: null
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: null
      },

      coordinates: {
        type: [Number],
        default: null
      }
    },

    provider: {
      type: String,
      default: null
    },

    providerConfidence: {
      type: Number,
      default: null,
      min: 0,
      max: 1
    },

    lastError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

geocodeCacheSchema.index({ location: "2dsphere" });

export default mongoose.model("GeocodeCache", geocodeCacheSchema);