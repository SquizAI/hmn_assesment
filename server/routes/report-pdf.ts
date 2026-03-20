// ============================================================
// PDF Report Generation — Server-side PDF for analysis results
// ============================================================

import { Router } from "express";
import PDFDocument from "pdfkit";
import { loadSessionFromDb } from "../supabase.js";

const router = Router();

// Color palette (matching the UI theme)
const COLORS = {
  bg: "#0a0a0f",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  accent: "#818cf8",
  purple: "#a78bfa",
  blue: "#60a5fa",
  emerald: "#34d399",
  amber: "#fbbf24",
  rose: "#f43f5e",
  border: "#1e293b",
};

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function drawHorizontalBar(doc: PDFKit.PDFDocument, x: number, y: number, width: number, value: number, maxValue: number, color: string) {
  const barHeight = 10;
  const fillWidth = (value / maxValue) * width;
  // Background
  doc.roundedRect(x, y, width, barHeight, 3).fill("#1e293b");
  // Fill
  if (fillWidth > 0) {
    doc.roundedRect(x, y, Math.max(fillWidth, 6), barHeight, 3).fill(color);
  }
}

function addPageHeader(doc: PDFKit.PDFDocument, name: string) {
  doc.rect(0, 0, doc.page.width, 50).fill("#0f172a");
  doc.fontSize(9).fillColor(COLORS.textDim).text(`${name ? `${name}'s` : ""} AI Readiness Report`, 40, 18, { align: "left" });
  doc.fontSize(9).fillColor(COLORS.textDim).text("HMN Cascade", 40, 18, { align: "right", width: doc.page.width - 80 });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number, name: string) {
  const bottomMargin = 60;
  if (doc.y + needed > doc.page.height - bottomMargin) {
    doc.addPage();
    addPageHeader(doc, name);
    doc.y = 70;
  }
}

router.get("/:sessionId", async (req, res) => {
  try {
    const session = await loadSessionFromDb(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const analysis = session.analysis;
    if (!analysis) {
      res.status(404).json({ error: "Analysis not available for this session" });
      return;
    }

    const name = session.participant?.name || "";
    const company = session.participant?.company || "";
    const completedDate = analysis.completedAt
      ? new Date(analysis.completedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Create PDF
    const doc = new PDFDocument({
      size: "letter",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: {
        Title: `AI Readiness Report - ${name || "Assessment"}`,
        Author: "HMN Cascade",
        Subject: "AI Readiness Analysis",
      },
    });

    // Stream to response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="HMN-Cascade-Report-${name.replace(/\s+/g, "-") || "Assessment"}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width - 80; // 40px margins each side

    // ===== COVER / HEADER SECTION =====
    doc.rect(0, 0, doc.page.width, 180).fill("#0f172a");

    // Brand
    doc.fontSize(10).fillColor(COLORS.accent).text("HMN CASCADE", 40, 40);
    doc.fontSize(8).fillColor(COLORS.textDim).text("AI Readiness Assessment", 40, 55);

    // Title
    doc.fontSize(24).fillColor(COLORS.text).text(
      `${name ? `${name}'s` : "Your"} AI Readiness Report`,
      40, 85, { width: pageWidth }
    );

    // Meta
    doc.fontSize(9).fillColor(COLORS.textMuted);
    const metaParts = [completedDate];
    if (company) metaParts.push(company);
    doc.text(metaParts.join("  |  "), 40, 130);

    // Score + Archetype hero
    doc.y = 200;

    // Overall score box
    const scoreBoxX = 40;
    const scoreBoxWidth = 150;
    doc.roundedRect(scoreBoxX, doc.y, scoreBoxWidth, 80, 8).fill("#1e293b");
    doc.fontSize(36).fillColor(COLORS.accent)
      .text(String(analysis.overallReadinessScore), scoreBoxX, doc.y + 12, { width: scoreBoxWidth, align: "center" });
    doc.fontSize(9).fillColor(COLORS.textDim)
      .text("Overall Score", scoreBoxX, doc.y + 52, { width: scoreBoxWidth, align: "center" });

    // Archetype box
    const archX = scoreBoxX + scoreBoxWidth + 20;
    const archWidth = pageWidth - scoreBoxWidth - 20;
    doc.roundedRect(archX, 200, archWidth, 80, 8).fill("#1e293b");
    doc.fontSize(14).fillColor(COLORS.text)
      .text(formatLabel(analysis.archetype), archX + 16, 216, { width: archWidth - 32 });
    doc.fontSize(8).fillColor(COLORS.textMuted)
      .text(analysis.archetypeDescription, archX + 16, 240, { width: archWidth - 32, lineGap: 2 });

    doc.y = 300;

    // ===== EXECUTIVE SUMMARY =====
    if (analysis.executiveSummary) {
      ensureSpace(doc, 100, name);
      doc.fontSize(13).fillColor(COLORS.text).text("Executive Summary", 40, doc.y);
      doc.moveDown(0.5);
      doc.roundedRect(40, doc.y, pageWidth, 2, 1).fill(COLORS.accent);
      doc.y += 12;
      doc.fontSize(9).fillColor(COLORS.textMuted).text(analysis.executiveSummary, 40, doc.y, {
        width: pageWidth, lineGap: 3,
      });
      doc.moveDown(1.5);
    }

    // ===== DIMENSION SCORES =====
    ensureSpace(doc, 200, name);
    doc.fontSize(13).fillColor(COLORS.text).text("Dimension Scores", 40, doc.y);
    doc.moveDown(0.5);
    doc.roundedRect(40, doc.y, pageWidth, 2, 1).fill(COLORS.accent);
    doc.y += 16;

    const dimColors = [COLORS.blue, COLORS.purple, COLORS.emerald, COLORS.amber, COLORS.accent, COLORS.rose, "#06b6d4", "#f97316"];

    if (Array.isArray(analysis.dimensionScores)) {
      for (let i = 0; i < analysis.dimensionScores.length; i++) {
        const ds = analysis.dimensionScores[i];
        ensureSpace(doc, 30, name);
        const rowY = doc.y;
        const labelWidth = 160;
        const barWidth = pageWidth - labelWidth - 60;

        doc.fontSize(9).fillColor(COLORS.textMuted).text(
          formatLabel(ds.dimension), 40, rowY + 1, { width: labelWidth }
        );

        drawHorizontalBar(doc, 40 + labelWidth, rowY, barWidth, ds.score, 100, dimColors[i % dimColors.length]);

        doc.fontSize(9).fillColor(COLORS.text).text(
          String(Math.round(ds.score)), 40 + labelWidth + barWidth + 10, rowY + 1
        );

        doc.y = rowY + 24;
      }
    }

    doc.moveDown(1);

    // ===== GAP ANALYSIS =====
    if (analysis.gaps.length > 0) {
      ensureSpace(doc, 80, name);
      doc.fontSize(13).fillColor(COLORS.text).text("Gap Analysis", 40, doc.y);
      doc.moveDown(0.5);
      doc.roundedRect(40, doc.y, pageWidth, 2, 1).fill(COLORS.amber);
      doc.y += 12;

      for (const gap of analysis.gaps) {
        ensureSpace(doc, 50, name);
        const gapY = doc.y;

        // Severity indicator
        const sevColor = gap.severity >= 7 ? COLORS.rose : gap.severity >= 4 ? COLORS.amber : COLORS.emerald;
        doc.circle(50, gapY + 6, 4).fill(sevColor);

        doc.fontSize(9).fillColor(COLORS.text).text(
          `${formatLabel(gap.dimension1)} vs ${formatLabel(gap.dimension2)}`,
          62, gapY, { width: pageWidth - 22 }
        );
        doc.fontSize(8).fillColor(COLORS.textDim).text(
          gap.description, 62, doc.y + 2, { width: pageWidth - 22, lineGap: 2 }
        );

        doc.moveDown(0.8);
      }
      doc.moveDown(0.5);
    }

    // ===== FLAGS =====
    const hasFlags = analysis.redFlags.length > 0 || analysis.greenLights.length > 0;
    if (hasFlags) {
      ensureSpace(doc, 80, name);
      doc.fontSize(13).fillColor(COLORS.text).text("Key Observations", 40, doc.y);
      doc.moveDown(0.5);
      doc.roundedRect(40, doc.y, pageWidth, 2, 1).fill(COLORS.purple);
      doc.y += 12;

      if (analysis.redFlags.length > 0) {
        doc.fontSize(10).fillColor(COLORS.rose).text("Areas of Concern", 40, doc.y);
        doc.moveDown(0.3);
        for (const flag of analysis.redFlags) {
          ensureSpace(doc, 25, name);
          doc.fontSize(8).fillColor(COLORS.textMuted)
            .text(`  •  ${flag.description}`, 44, doc.y, { width: pageWidth - 4, lineGap: 2 });
          doc.moveDown(0.3);
        }
        doc.moveDown(0.5);
      }

      if (analysis.greenLights.length > 0) {
        ensureSpace(doc, 25, name);
        doc.fontSize(10).fillColor(COLORS.emerald).text("Strengths Observed", 40, doc.y);
        doc.moveDown(0.3);
        for (const flag of analysis.greenLights) {
          ensureSpace(doc, 25, name);
          doc.fontSize(8).fillColor(COLORS.textMuted)
            .text(`  •  ${flag.description}`, 44, doc.y, { width: pageWidth - 4, lineGap: 2 });
          doc.moveDown(0.3);
        }
        doc.moveDown(0.5);
      }
    }

    // ===== SERVICE RECOMMENDATIONS =====
    if (analysis.serviceRecommendations.length > 0) {
      ensureSpace(doc, 80, name);
      doc.fontSize(13).fillColor(COLORS.text).text("Recommended Next Steps", 40, doc.y);
      doc.moveDown(0.5);
      doc.roundedRect(40, doc.y, pageWidth, 2, 1).fill(COLORS.emerald);
      doc.y += 12;

      for (const rec of analysis.serviceRecommendations) {
        ensureSpace(doc, 50, name);
        const recY = doc.y;

        // Tier badge
        const tierColor = rec.tier === 1 ? COLORS.emerald : rec.tier === 2 ? COLORS.amber : COLORS.textDim;
        doc.roundedRect(40, recY, 50, 16, 4).fill(tierColor);
        doc.fontSize(7).fillColor("#0f172a")
          .text(`Tier ${rec.tier}`, 40, recY + 4, { width: 50, align: "center" });

        // Urgency
        doc.fontSize(7).fillColor(COLORS.textDim)
          .text(formatLabel(rec.urgency), 96, recY + 4);

        doc.fontSize(9).fillColor(COLORS.text)
          .text(rec.service, 40, recY + 22, { width: pageWidth });
        doc.fontSize(8).fillColor(COLORS.textMuted)
          .text(rec.description, 40, doc.y + 2, { width: pageWidth, lineGap: 2 });

        doc.moveDown(0.8);
      }
      doc.moveDown(0.5);
    }

    // ===== DETAILED NARRATIVE =====
    if (analysis.detailedNarrative) {
      ensureSpace(doc, 80, name);
      doc.fontSize(13).fillColor(COLORS.text).text("Detailed Analysis", 40, doc.y);
      doc.moveDown(0.5);
      doc.roundedRect(40, doc.y, pageWidth, 2, 1).fill(COLORS.accent);
      doc.y += 12;
      doc.fontSize(8).fillColor(COLORS.textMuted).text(analysis.detailedNarrative, 40, doc.y, {
        width: pageWidth, lineGap: 3,
      });
      doc.moveDown(1);
    }

    // ===== FOOTER =====
    const footerY = doc.page.height - 30;
    doc.fontSize(7).fillColor(COLORS.textDim)
      .text("Generated by HMN Cascade  |  AI-Powered Assessment Platform  |  Confidential", 40, footerY, { width: pageWidth, align: "center" });

    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  }
});

export default router;
