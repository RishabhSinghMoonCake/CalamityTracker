import mongoose from "mongoose";

const incidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    status: {
      type: String,
      enum: ["candidate", "active", "resolved", "rejected"],
      default: "candidate",
      index: true
    },

    severity: {
      type: String,
      enum: ["unknown", "low", "moderate", "high", "critical"],
      default: "unknown",
      required: true
    },

    locationName: {
      type: String,
      required: true,
      trim: true
    },

    locationPrecision: {
      type: String,
      enum: ["city", "region", "country", "unknown"],
      default: "unknown",
      required: true
    },

    // GeoJSON format required by MongoDB geospatial queries.
    // Coordinates must always be [longitude, latitude].
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coordinates) =>
            coordinates.length === 2 &&
            coordinates[0] >= -180 &&
            coordinates[0] <= 180 &&
            coordinates[1] >= -90 &&
            coordinates[1] <= 90,
          message: "Location must contain [longitude, latitude]"
        }
      }
    },

    occurredAt: {
      type: Date,
      required: true
    },

    summary: {
      type: String,
      required: true,
      trim: true
    },

    confidenceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },

    evidenceArticles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RawArticle"
      }
    ],

    evidenceExtractions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AiExtraction"
      }
    ],

    firstReportedAt: {
      type: Date,
      default: Date.now
    },

    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

incidentSchema.index({ location: "2dsphere" });
incidentSchema.index({ status: 1, lastUpdatedAt: -1 });

export default mongoose.model("Incident", incidentSchema);