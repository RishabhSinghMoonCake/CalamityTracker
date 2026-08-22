import mongoose from "mongoose";

const extractedEventSchema = new mongoose.Schema(
  {
    isDisaster: {
      type: Boolean,
      required: true
    },

    disasterType: {
      type: String,
      default: null,
      trim: true
    },

    locationName: {
      type: String,
      default: null,
      trim: true
    },

    occurredAt: {
      type: Date,
      default: null
    },

    severity: {
      type: String,
      enum: ["low", "moderate", "high", "critical", null],
      default: null
    },

    summary: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    _id: false
  }
);

const aiExtractionSchema = new mongoose.Schema(
  {
    rawArticleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RawArticle",
      required: true,
      unique: true,
      index: true
    },

    model: {
      type: String,
      required: true
    },

    promptVersion: {
      type: String,
      required: true,
      default: "v1"
    },

    rawResponse: {
      type: String,
      required: true
    },

    result: {
      type: extractedEventSchema,
      required: true
    },

    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },

    status: {
      type: String,
      enum: ["success", "not_a_disaster", "invalid_output", "failed"],
      required: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("AiExtraction", aiExtractionSchema);