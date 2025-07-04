import express from "express";
import cors from "cors";
import { connectToDatabase } from "./mongoDB.js";
import Article from "./article.schema.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import slugify from "slugify";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Utility delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/api/article", async (req, res) => {
  try {
    await connectToDatabase();

    // Step 1: Fetch Trending Topics using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      timeout: 0,
    });

    const page = await browser.newPage();
    await page.goto("https://trends24.in/india/", {
      waitUntil: "domcontentloaded", // use domcontentloaded to reduce timeout risk
      timeout: 0, // no navigation timeout
    });

    const topics = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".trend-name")).map((el) =>
        el.textContent.trim()
      );
    });
    await browser.close();

    // Step 2: Generate and save article for each topic
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const generated = [];
    let cnt = 0;
    for (const topic of topics) {
      const exists = await Article.findOne({ title: topic });
      if (exists) continue;
      if (cnt === 5) {
        break;
      }
      const prompt = `Write a detailed SEO-friendly blog article on: "${topic}".
Structure it with:
- A title should be same as topic name which i am providing
- A slug (kebab-case)
- Meta title and description
- H1-H3 headings
- Suggested media links
- Rich content
- media should contain array of <a> tag with related websites link.

Return JSON like:
{
  "title": "",
  "slug": "",
  "meta": {
    "title": "",
    "description": ""
  },
  "content": "",
  "media": [""]
};`;

      try {
        const result = await model.generateContent(prompt);
        const rawText = await result.response.text(); // ✅ correct
        const text = rawText.trim();
        console.log(text);
        const jsonText = text.replace(/```json|```/g, "").trim();
        let articleData;
        try {
          articleData = JSON.parse(jsonText);
        } catch (err) {
          console.error(`❌ JSON parse failed on topic: ${topic}`, err.message);
          continue;
        }
        // Fallback in case Gemini misses the slug
        if (!articleData.slug) {
          articleData.slug = slugify(topic, { lower: true });
        }

        const newArticle = await Article.create(articleData);
        cnt++;
        generated.push(newArticle.slug);
        await delay(2000);
      } catch (err) {
        console.error(`Failed on topic: ${topic}`, err.message);
        continue;
      }
    }
    console.log("your feed has been refreshed reload");
    return res.status(200).json({ success: true, generated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
