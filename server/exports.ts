import { Router, Express } from "express";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import archiver from "archiver";
import { getRecordsFiltered, getTeamDocxTemplateUrl } from "./db";

const router = Router();

// Shared filter params parser
function parseFilterParams(query: Record<string, any>) {
  return {
    teamIdentifier: (query.team as string) || "",
    search: (query.search as string) || undefined,
    dateFrom: (query.dateFrom as string) || undefined,
    dateTo: (query.dateTo as string) || undefined,
    releasedDateFrom: (query.releasedDateFrom as string) || undefined,
    releasedDateTo: (query.releasedDateTo as string) || undefined,
    status: ((query.status as string) || "all") as "all" | "active" | "released",
  };
}

function formatDate(ts: Date | string | number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts as string);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

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

// GET /api/export/json?team=&search=&dateFrom=&dateTo=&releasedDateFrom=&releasedDateTo=&status=
router.get("/export/json", async (req, res) => {
  const { teamIdentifier, ...opts } = parseFilterParams(req.query);
  if (!teamIdentifier) return res.status(400).json({ error: "team is required" });
  try {
    const records = await getRecordsFiltered(teamIdentifier, opts);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="abc-buddy-${teamIdentifier}-${date}.json"`);
    return res.send(JSON.stringify(records, null, 2));
  } catch (err) {
    console.error("[Export JSON] Error:", err);
    return res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/export/docx?team=&search=&dateFrom=&dateTo=&releasedDateFrom=&releasedDateTo=&status=
// Returns a single DOCX with each dog's form on a separate page (page break between sections)
router.get("/export/docx", async (req, res) => {
  const { teamIdentifier, ...opts } = parseFilterParams(req.query);
  if (!teamIdentifier) return res.status(400).json({ error: "team is required" });
  try {
    const records = await getRecordsFiltered(teamIdentifier, opts);
    if (records.length === 0) return res.status(404).json({ error: "No records found" });

    // Load template content once
    let templateContent: string;
    const customUrl = await getTeamDocxTemplateUrl(teamIdentifier);
    if (customUrl) {
      const resp = await fetch(customUrl);
      if (!resp.ok) throw new Error("Failed to fetch custom template");
      const buf = await resp.arrayBuffer();
      templateContent = Buffer.from(buf).toString("binary");
    } else {
      templateContent = fs.readFileSync(getTemplatePath(), "binary");
    }

    // Generate individual DOCX buffers for each record
    const buffers: Buffer[] = [];
    for (const record of records) {
      const zip = new PizZip(templateContent);
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
      buffers.push(doc.getZip().generate({ type: "nodebuffer" }));
    }

    // Merge all DOCX buffers by appending body XML with a page break between each
    // Strategy: extract word/document.xml from each, merge bodies, wrap in first file's shell
    const mergedZip = new PizZip(buffers[0]);
    const firstXml = mergedZip.file("word/document.xml")!.asText();

    // Extract body content (between <w:body> and </w:body>) from each subsequent doc
    const bodyContentParts: string[] = [];

    // Extract body from first doc (everything inside <w:body>...</w:body> except the final <w:sectPr>)
    const extractBody = (xml: string): string => {
      const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
      if (!bodyMatch) return "";
      // Remove the last <w:sectPr>...</w:sectPr> block (section properties at end of doc)
      return bodyMatch[1].replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/, "").trim();
    };

    const extractSectPr = (xml: string): string => {
      const match = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g);
      return match ? match[match.length - 1] : "";
    };

    // Page break XML to insert between docs
    const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

    let combinedBody = extractBody(firstXml);

    for (let i = 1; i < buffers.length; i++) {
      const zip2 = new PizZip(buffers[i]);
      const xml2 = zip2.file("word/document.xml")!.asText();
      const body2 = extractBody(xml2);
      combinedBody += pageBreak + body2;
    }

    // Reconstruct the final XML using the first doc's sectPr
    const sectPr = extractSectPr(firstXml);
    const newBody = `<w:body>${combinedBody}${sectPr}</w:body>`;
    const newXml = firstXml.replace(/<w:body>[\s\S]*<\/w:body>/, newBody);
    mergedZip.file("word/document.xml", newXml);

    const finalBuf = mergedZip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="abc-buddy-${teamIdentifier}-${date}.docx"`);
    res.setHeader("Content-Length", finalBuf.length);
    return res.send(finalBuf);
  } catch (err) {
    console.error("[Export DOCX] Error:", err);
    return res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/export/photos?team=&search=&dateFrom=&dateTo=&releasedDateFrom=&releasedDateTo=&status=
// Returns a ZIP of annotated catching photos for all filtered dogs
router.get("/export/photos", async (req, res) => {
  const { teamIdentifier, ...opts } = parseFilterParams(req.query);
  if (!teamIdentifier) return res.status(400).json({ error: "team is required" });
  try {
    const records = await getRecordsFiltered(teamIdentifier, opts);
    const withPhotos = records.filter((r) => r.imageUrl);
    if (withPhotos.length === 0) return res.status(404).json({ error: "No photos found" });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="abc-buddy-photos-${teamIdentifier}-${date}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => { throw err; });
    archive.pipe(res);

    // Fetch each photo and append to the archive
    for (const record of withPhotos) {
      try {
        const resp = await fetch(record.imageUrl!);
        if (!resp.ok) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        const ext = record.imageUrl!.split(".").pop()?.split("?")[0] || "jpg";
        archive.append(buf, { name: `${record.dogId}.${ext}` });
      } catch {
        // Skip photos that fail to fetch
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("[Export Photos] Error:", err);
    if (!res.headersSent) return res.status(500).json({ error: "Export failed" });
  }
});

export function registerExportsRoute(app: Express) {
  app.use("/api", router);
}
