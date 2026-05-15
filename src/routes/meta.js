const express = require("express");
const router = express.Router();

const ABOUT = {
  name: process.env.OWNER_NAME || "Your Name",
  email: process.env.OWNER_EMAIL || "you@example.com",
  "my features": {
    "AI summary + auto-tags":
      "POST /notes/{id}/summarize returns a 2-4 sentence Gemini-generated summary, " +
      "cached by SHA-256 hash so unchanged notes do not re-spend tokens. On note " +
      "creation (and on first real save) the server also asks Gemini for 3-5 topical " +
      "tags. I chose this because notes apps become unsearchable junk drawers fast - " +
      "automatic tagging and on-demand summaries keep the corpus navigable.",
  },
};

router.get("/about", (req, res) => res.json(ABOUT));
router.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

module.exports = router;
