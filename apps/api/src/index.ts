import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { parcelsRouter } from "./routes/parcels.js";
import { titlesRouter } from "./routes/titles.js";
import { surveysRouter } from "./routes/surveys.js";
import { geoaiRouter } from "./routes/geoai.js";
import { registerRouter } from "./routes/register.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();
const PORT = process.env.API_PORT ?? 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.API_CORS_ORIGIN ?? "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "lis-api",
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/parcels", parcelsRouter);
app.use("/api/titles", titlesRouter);
app.use("/api/surveys", surveysRouter);
app.use("/api/geoai", geoaiRouter);
app.use("/api/parcels/register", registerRouter);

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 LIS API running on http://localhost:${PORT}`);
});

export default app;
