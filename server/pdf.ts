import { Router, Express } from "express";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { getRecordByDogId } from "./db";

const router = Router();

// Path to the DOCX template — bundled in server/templates/abc.docx
function getTemplatePath() {
  const candidates = [
    path.join(process.cwd(), "server", "templates", "abc.docx"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "templates", "abc.docx"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("abc.docx template not found");
}

function formatDate(ts: Date | string | number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts as string);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// GET /api/record/:dogId/docx?team=<teamId>
// Returns a filled DOCX file for the given dog record
router.get("/record/:dogId/docx", async (req, res) => {
  const { dogId } = req.params;
  const teamId = (req.query.team as string) || "";

  if (!dogId || !teamId) {
    return res.status(400).json({ error: "dogId and team are required" });
  }

  try {
    const record = await getRecordByDogId(dogId, teamId);
    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    // Fill the DOCX template
    const templatePath = getTemplatePath();
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
    });

    doc.render({
      "dog id": record.dogId || "",
      date: formatDate(record.recordedAt),
      location: record.areaName || "",
      description: record.description || "",
      notes: record.notes || "",
    });

    const filledBuf = doc.getZip().generate({ type: "nodebuffer" });

    const filename = `ABC-${dogId}.docx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", filledBuf.length);
    return res.send(filledBuf);

  } catch (err) {
    console.error("[DOCX] Error generating DOCX:", err);
    return res.status(500).json({ error: "Failed to generate form" });
  }
});

export function registerPdfRoute(app: Express) {
  app.use("/api", router);
}
