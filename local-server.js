import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import handler from "./api/generate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;


// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// JSON body parsing
app.use(express.json());

// API route
app.post("/api/generate", (req, res) => handler(req, res));

app.listen(PORT, () => {
  console.log(`✅ Local server running at http://localhost:${PORT}`);
});
