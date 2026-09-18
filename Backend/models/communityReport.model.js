import mongoose from "mongoose";

const communityReportSchema = new mongoose.Schema(
  {
    clientReportId: { type: String, required: true, unique: true, trim: true },
    reporterHash: { type: String, required: true, index: true },
    type: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    severity: { type: String, enum: ["low", "moderate", "high", "critical"], required: true },
    location: {
      type: { type: String, enum: ["Point"], required: true },
      coordinates: {
        type: [Number], required: true,
        validate: {
          validator: (value) => Array.isArray(value) && value.length === 2 &&
            value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90,
          message: "Location must be [longitude, latitude]"
        }
      }
    },
    locationAccuracyMeters: { type: Number, min: 0, default: null },
    occurredAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "corroborating", "attached_to_incident", "rejected"],
      default: "pending",
      index: true
    },
    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: "Incident", default: null, index: true }
  },
  { timestamps: true }
);

communityReportSchema.index({ location: "2dsphere" });
communityReportSchema.index({ type: 1, status: 1, createdAt: -1 });

export default mongoose.model("CommunityReport", communityReportSchema);
