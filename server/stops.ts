import type { Express, Request, Response } from "express";
import { getStops } from "./db";

/**
 * GET /api/stops?staffId=S7,S6&date=20260407
 *
 * Returns all catch and release stops for the given staff IDs on the given date.
 * staffId: comma-separated list of staff IDs (e.g. "S7" or "S7,S6")
 * date: YYYYMMDD format (e.g. "20260407")
 *
 * Response: JSON array of Stop objects sorted by timestamp ascending.
 */
export function registerStopsRoute(app: Express) {
  app.get("/api/stops", async (req: Request, res: Response) => {
    try {
      const { staffId, date } = req.query as { staffId?: string; date?: string };

      if (!staffId || !date) {
        res.status(400).json({ error: "staffId and date query params are required" });
        return;
      }

      if (!/^\d{8}$/.test(date)) {
        res.status(400).json({ error: "date must be in YYYYMMDD format (e.g. 20260407)" });
        return;
      }

      const staffIds = staffId.split(",").map(s => s.trim()).filter(Boolean);
      if (staffIds.length === 0) {
        res.status(400).json({ error: "staffId must contain at least one ID" });
        return;
      }

      const stops = await getStops(staffIds, date);
      res.json(stops);
    } catch (err) {
      console.error("[/api/stops] Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
