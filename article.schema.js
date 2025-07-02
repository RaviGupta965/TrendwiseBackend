import mongoose from "mongoose";

const ArticleSchema = new mongoose.Schema({
  title: String,
  slug: String,
  meta: {
    title: String,
    description: String,
  },
  content: String,
  media: [String],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Article || mongoose.model("Article", ArticleSchema);