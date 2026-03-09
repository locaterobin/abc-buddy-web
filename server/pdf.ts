import type { Express, Request, Response } from "express";
import PDFDocument from "pdfkit";
import { getRecordByDogId } from "./db";

export function registerPdfRoute(app: Express) {
  // GET /api/record/:dogId/pdf?team=<teamId>
  app.get("/api/record/:dogId/pdf", async (req: Request, res: Response) => {
    const { dogId } = req.params;
    const teamId = (req.query.team as string) || "";

    if (!dogId || !teamId) {
      res.status(400).json({ error: "dogId and team query param are required" });
      return;
    }

    try {
      const record = await getRecordByDogId(dogId, teamId);
      if (!record) {
        res.status(404).json({ error: "Record not found" });
        return;
      }

      const doc = new PDFDocument({ size: "A4", margin: 36 });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="abc-record-${dogId}.pdf"`
      );
      doc.pipe(res);

      generatePdf(doc, record);

      doc.end();
    } catch (err: any) {
      console.error("[PDF] Error generating PDF:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });
}

function generatePdf(doc: InstanceType<typeof PDFDocument>, record: any) {
  const pageWidth = doc.page.width - 72; // account for margins
  const col = (n: number, total: number) => (pageWidth / total) * n;

  // ── Title ──────────────────────────────────────────────────────────────────
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Dog ABC individual case record", { align: "center" });

  doc.moveDown(0.6);

  // ── Helper functions ────────────────────────────────────────────────────────
  const CELL_H = 22;
  const LABEL_FONT_SIZE = 8;
  const VALUE_FONT_SIZE = 9;
  const GRAY = "#888888";
  const BLACK = "#000000";
  const BORDER = "#cccccc";

  function drawCell(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    opts: { bold?: boolean; labelOnly?: boolean } = {}
  ) {
    doc.rect(x, y, w, h).strokeColor(BORDER).stroke();
    if (opts.labelOnly) {
      doc
        .fontSize(VALUE_FONT_SIZE)
        .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(BLACK)
        .text(label, x + 4, y + (h - VALUE_FONT_SIZE) / 2, {
          width: w - 8,
          ellipsis: true,
        });
    } else {
      doc
        .fontSize(LABEL_FONT_SIZE)
        .font("Helvetica")
        .fillColor(GRAY)
        .text(label, x + 4, y + 3, { width: w - 8 });
      doc
        .fontSize(VALUE_FONT_SIZE)
        .font("Helvetica")
        .fillColor(BLACK)
        .text(value || "", x + 4, y + 12, { width: w - 8, ellipsis: true });
    }
  }

  function drawEmptyCell(x: number, y: number, w: number, h: number, label?: string) {
    doc.rect(x, y, w, h).strokeColor(BORDER).stroke();
    if (label) {
      doc
        .fontSize(LABEL_FONT_SIZE)
        .font("Helvetica")
        .fillColor(GRAY)
        .text(label, x + 4, y + 3, { width: w - 8 });
    }
  }

  // ── Format values ───────────────────────────────────────────────────────────
  const formattedDate = record.recordedAt
    ? new Date(record.recordedAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const location = record.areaName || "";
  const description = record.description || "";
  const notes = record.notes || "";

  // ── Row 1: Dog ID + Date ────────────────────────────────────────────────────
  let y = doc.y;
  const leftW = col(3, 6);
  const rightW = col(3, 6);
  const midW = col(2, 6);

  drawCell(36, y, leftW, CELL_H, "Dog ID", record.dogId || "");
  drawCell(36 + leftW, y, midW, CELL_H, "Date in", formattedDate);
  // empty right portion for Date in value overflow
  y += CELL_H;

  // ── Row 2: Notes + Catching team ───────────────────────────────────────────
  drawCell(36, y, leftW, CELL_H, "Notes", notes);
  drawCell(36 + leftW, y, midW, CELL_H, "Catching team", "");
  y += CELL_H;

  // ── Row 3: Location (full width) ───────────────────────────────────────────
  drawCell(36, y, pageWidth, CELL_H, "Location", location);
  y += CELL_H;

  // ── Row 4: Description (taller, full width) ────────────────────────────────
  const descH = Math.max(CELL_H, 14 + Math.ceil(description.length / 90) * 12);
  doc.rect(36, y, pageWidth, descH).strokeColor(BORDER).stroke();
  doc.fontSize(LABEL_FONT_SIZE).font("Helvetica").fillColor(GRAY).text("Description", 40, y + 3, { width: pageWidth - 8 });
  doc.fontSize(VALUE_FONT_SIZE).font("Helvetica").fillColor(BLACK).text(description, 40, y + 13, { width: pageWidth - 8 });
  y += descH;

  doc.moveDown(0.8);
  y = doc.y;

  // ── Surgery section ─────────────────────────────────────────────────────────
  const c1 = pageWidth / 3;
  const c2 = pageWidth / 3;
  const c3 = pageWidth / 3;

  // Row: Surgery number | Weight | Age
  drawCell(36, y, c1, CELL_H, "Surgery number", "");
  drawCell(36 + c1, y, c2, CELL_H, "Weight", "");
  drawCell(36 + c1 + c2, y, c3, CELL_H, "Age", "");
  y += CELL_H;

  // Row: Date of surgery | CRT | Gender
  drawCell(36, y, c1, CELL_H, "Date of surgery", "");
  drawCell(36 + c1, y, c2, CELL_H, "CRT", "");
  drawCell(36 + c1 + c2, y, c3, CELL_H, "Gender", "");
  y += CELL_H;

  // Row: Flank/Midline | Fluid rate | HR
  drawCell(36, y, c1, CELL_H, "Flank/Midline", "");
  drawCell(36 + c1, y, c2, CELL_H, "Fluid rate", "");
  drawCell(36 + c1 + c2, y, c3, CELL_H, "HR", "");
  y += CELL_H;

  // Row: Kennel no. | Temp | PR
  drawCell(36, y, c1, CELL_H, "Kennel no.", "");
  drawCell(36 + c1, y, c2, CELL_H, "Temp", "");
  drawCell(36 + c1 + c2, y, c3, CELL_H, "PR", "");
  y += CELL_H;

  // Row: (empty) | Dehydration % | MM
  drawEmptyCell(36, y, c1, CELL_H);
  drawCell(36 + c1, y, c2, CELL_H, "Dehydration %", "");
  drawCell(36 + c1 + c2, y, c3, CELL_H, "MM", "");
  y += CELL_H;

  // Row: Surgeon | Assistant | Anesthesiologist
  drawCell(36, y, c1, CELL_H, "Surgeon", "");
  drawCell(36 + c1, y, c2, CELL_H, "Assistant", "");
  drawCell(36 + c1 + c2, y, c3, CELL_H, "Anesthesiologist", "");
  y += CELL_H;

  doc.moveDown(0.8);
  y = doc.y;

  // ── Premedication section ───────────────────────────────────────────────────
  const medW = pageWidth / 2;
  const doseW = medW * 0.35;
  const timeW = medW * 0.3;
  const drugW = medW - doseW - timeW;

  // Header row
  doc.rect(36, y, medW, CELL_H).strokeColor(BORDER).fill("#f0f0f0").stroke();
  doc.fontSize(VALUE_FONT_SIZE).font("Helvetica-Bold").fillColor(BLACK)
    .text("Premedication", 40, y + (CELL_H - VALUE_FONT_SIZE) / 2, { width: medW - 8 });
  y += CELL_H;

  // Sub-header
  drawCell(36, y, drugW, CELL_H, "", "Sedative", { labelOnly: true });
  drawCell(36 + drugW, y, doseW, CELL_H, "", "Dose", { labelOnly: true });
  drawCell(36 + drugW + doseW, y, timeW, CELL_H, "", "Time", { labelOnly: true });
  y += CELL_H;

  // Xylazine
  drawCell(36, y, drugW, CELL_H, "", "Xylazine (0.1ml/kg) IM", { labelOnly: true });
  drawEmptyCell(36 + drugW, y, doseW, CELL_H);
  drawEmptyCell(36 + drugW + doseW, y, timeW, CELL_H);
  y += CELL_H;

  // Butorphanol
  drawCell(36, y, drugW, CELL_H, "", "Butorphanol (0.1ml/kg) IM", { labelOnly: true });
  drawEmptyCell(36 + drugW, y, doseW, CELL_H);
  drawEmptyCell(36 + drugW + doseW, y, timeW, CELL_H);
  y += CELL_H;

  doc.moveDown(0.8);
  y = doc.y;

  // ── Induction section ───────────────────────────────────────────────────────
  const ivW = pageWidth * 0.35;
  const ivDoseW = pageWidth * 0.12;
  const ivTimeW = pageWidth * 0.12;
  const scW = pageWidth * 0.25;
  const scDoseW = pageWidth * 0.08;
  const scTimeW = pageWidth - ivW - ivDoseW - ivTimeW - scW - scDoseW;

  // Header
  doc.rect(36, y, pageWidth, CELL_H).strokeColor(BORDER).fill("#f0f0f0").stroke();
  doc.fontSize(VALUE_FONT_SIZE).font("Helvetica-Bold").fillColor(BLACK)
    .text("Induction", 40, y + (CELL_H - VALUE_FONT_SIZE) / 2);
  y += CELL_H;

  // Sub-header
  drawCell(36, y, ivW, CELL_H, "", "Intravenous drugs", { labelOnly: true });
  drawCell(36 + ivW, y, ivDoseW, CELL_H, "", "Dose", { labelOnly: true });
  drawCell(36 + ivW + ivDoseW, y, ivTimeW, CELL_H, "", "Time", { labelOnly: true });
  drawCell(36 + ivW + ivDoseW + ivTimeW, y, scW, CELL_H, "", "Subcut drugs", { labelOnly: true });
  drawCell(36 + ivW + ivDoseW + ivTimeW + scW, y, scDoseW, CELL_H, "", "Dose", { labelOnly: true });
  drawCell(36 + ivW + ivDoseW + ivTimeW + scW + scDoseW, y, scTimeW, CELL_H, "", "Time", { labelOnly: true });
  y += CELL_H;

  const ivDrugs = [
    "Propofol (0.1ml/kg) - IV",
    "Diazepam (0.1ml/kg) - IV",
    "Tramadol (0.04ml/kg) -IV",
    "Amoxicillin (25mg/kg)-IV",
    "Lignocaine (0.05ml/kg)",
    "Ethamsylate / Texableed (0.1ml/kg) - IV",
  ];
  const scDrugs = [
    "Meloxicam (0.04ml/kg) - Subcut",
    "Ivermectin (0.025ml/kg) - Subcut",
    "",
    "",
    "Notes:",
    "",
  ];

  for (let i = 0; i < ivDrugs.length; i++) {
    const rowH = i === 5 ? CELL_H + 4 : CELL_H; // slightly taller for long drug name
    drawCell(36, y, ivW, rowH, "", ivDrugs[i], { labelOnly: true });
    drawEmptyCell(36 + ivW, y, ivDoseW, rowH);
    drawEmptyCell(36 + ivW + ivDoseW, y, ivTimeW, rowH);
    if (scDrugs[i]) {
      drawCell(36 + ivW + ivDoseW + ivTimeW, y, scW, rowH, "", scDrugs[i], { labelOnly: true });
    } else {
      drawEmptyCell(36 + ivW + ivDoseW + ivTimeW, y, scW, rowH);
    }
    drawEmptyCell(36 + ivW + ivDoseW + ivTimeW + scW, y, scDoseW, rowH);
    drawEmptyCell(36 + ivW + ivDoseW + ivTimeW + scW + scDoseW, y, scTimeW, rowH);
    y += rowH;
  }

  // Prep person + Handlers
  drawCell(36, y, ivW + ivDoseW + ivTimeW, CELL_H, "Prep person", "");
  drawCell(36 + ivW + ivDoseW + ivTimeW, y, scW + scDoseW + scTimeW, CELL_H, "Handlers", "");
  y += CELL_H;

  doc.moveDown(0.8);
  y = doc.y;

  // ── Maintenance section ─────────────────────────────────────────────────────
  doc.rect(36, y, pageWidth, CELL_H).strokeColor(BORDER).fill("#f0f0f0").stroke();
  doc.fontSize(VALUE_FONT_SIZE).font("Helvetica-Bold").fillColor(BLACK)
    .text("Maintenance Xylazine:Ketamine 1:2 IV / Propofol (0.1ml/kg)", 40, y + (CELL_H - VALUE_FONT_SIZE) / 2);
  y += CELL_H;

  // Top-up grid: 8 columns for time slots
  const slots = 8;
  const slotW = pageWidth / (slots + 1);
  drawCell(36, y, slotW, CELL_H, "", "Top-up in ml", { labelOnly: true });
  for (let i = 0; i < slots; i++) {
    drawEmptyCell(36 + slotW * (i + 1), y, slotW, CELL_H);
  }
  y += CELL_H;

  drawCell(36, y, slotW, CELL_H, "", "Time", { labelOnly: true });
  for (let i = 0; i < slots; i++) {
    drawEmptyCell(36 + slotW * (i + 1), y, slotW, CELL_H);
  }
  y += CELL_H;

  doc.moveDown(0.8);
  y = doc.y;

  // ── Surgery times ───────────────────────────────────────────────────────────
  const halfW = pageWidth / 2;
  drawCell(36, y, halfW, CELL_H, "Surgery Start Time", "");
  drawCell(36 + halfW, y, halfW, CELL_H, "Surgery End Time", "");
  y += CELL_H;

  // ── Footer ──────────────────────────────────────────────────────────────────
  doc.moveDown(1);
  doc
    .fontSize(7)
    .font("Helvetica")
    .fillColor(GRAY)
    .text(`Generated by ABC Buddy · ${new Date().toLocaleString("en-IN")}`, { align: "center" });
}
