const express = require("express");
const router = express.Router();

const ABOUT = {
  name: process.env.OWNER_NAME || "Your Name",
  email: process.env.OWNER_EMAIL || "you@example.com",
  "my features": {
    "AI summary + auto-tags":
      "When a note is created (and on first real save), the server calls an LLM to " +
      "suggest 3-5 topical tags and persists them. A POST /notes/{id}/summarize endpoint " +
      "returns a 2-4 sentence summary of the note, cached by a SHA-256 content hash so " +
      "re-running on an unchanged note is free. I chose this because note-taking apps " +
      "quickly become unsearchable junk drawers - automatic tagging and on-demand " +
      "summaries make the corpus actually navigable as it grows, and it fits the " +
      '"Engineering Intelligence" direction the team is heading in.',
  },
};

router.get("/about", (req, res) => res.json(ABOUT));
router.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

module.exports = router;
