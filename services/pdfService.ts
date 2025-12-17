import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BillItem, BillType } from '../types';
import { numberToWords } from '../utils/numberToWords';

const FONT_URL = '/fonts/CustomFont.ttf';

// Helper to fetch and convert font to base64
const loadCustomFont = async (): Promise<string | null> => {
  try {
    const response = await fetch(FONT_URL);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // remove "data:font/ttf;base64," prefix
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Custom font not found or failed to load.", error);
    return null;
  }
};

export const generateBillPDF = async (
  billType: BillType,
  date: string,
  items: BillItem[]
) => {
  const doc = new jsPDF();
  
  // -- Load Font --
  const fontBase64 = await loadCustomFont();
  let fontName = "helvetica"; // Default fallback

  if (fontBase64) {
    fontName = "CustomFont";
    doc.addFileToVFS("CustomFont.ttf", fontBase64);
    // Register the same font for normal and bold to prevent errors, 
    // though it won't be true bold unless you load a bold ttf separately.
    doc.addFont("CustomFont.ttf", "CustomFont", "normal");
    doc.addFont("CustomFont.ttf", "CustomFont", "bold");
  }

  // -- Header --
  doc.setFont(fontName, "bold");
  doc.setFontSize(22);
  doc.text("TUSUKA TROUSERS LTD.", 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setFont(fontName, "normal"); // Reset to normal if needed, or keep bold for header
  doc.text("KONABARI,GAZIPUR", 105, 28, { align: "center" });

  // -- Bill Type & Date --
  doc.setFontSize(14);
  doc.setFont(fontName, "bold");
  // Simple underline simulation
  doc.text(billType, 14, 40);
  doc.setLineWidth(0.5);
  doc.line(14, 41, 14 + doc.getTextWidth(billType), 41);

  doc.setFontSize(10);
  doc.text(`DATE:   ${date}`, 195, 40, { align: "right" });

  // -- Table Data Preparation --
  const tableHead = [["SL/NO", "NAME", "CARD/NO", "DESIGNATION", "TAKA", "SIGNATURE", "REMARKS"]];
  const tableBody = items.map((item, index) => [
    index + 1,
    item.name,
    item.cardNo,
    item.designation,
    item.taka,
    "", // Signature is empty for manual signing
    item.remarks
  ]);

  const totalTaka = items.reduce((sum, item) => sum + item.taka, 0);

  // -- Table Generation --
  autoTable(doc, {
    startY: 45,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      font: fontName // Apply custom font to header
    },
    bodyStyles: {
      textColor: [0, 0, 0],
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      halign: 'center',
      minCellHeight: 10,
      font: fontName // Apply custom font to body
    },
    styles: {
      font: fontName, // Global table font
      fontSize: 10,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 15 }, // SL
      1: { cellWidth: 40 }, // Name
      2: { cellWidth: 15 }, // Card
      3: { cellWidth: 40 }, // Desig
      4: { cellWidth: 20 }, // Taka
      5: { cellWidth: 25 }, // Sig
      6: { cellWidth: 'auto' } // Remarks
    },
    // Add Total Row at bottom of table
    foot: [
        ["", "", "", "TOTAL=", totalTaka, "", ""]
    ],
    footStyles: {
       fillColor: [255, 255, 255],
       textColor: [0, 0, 0],
       lineWidth: 0.5,
       lineColor: [0, 0, 0],
       fontStyle: 'bold',
       halign: 'center',
       font: fontName
    },
    // Removed unused didParseCell
  });

  // @ts-ignore
  const finalY = doc.lastAutoTable.finalY;

  // -- Total In Words Box --
  doc.setFontSize(10);
  doc.setFont(fontName, "bold");
  
  // Grey background box
  doc.setFillColor(230, 230, 230);
  doc.rect(14, finalY + 1, 182, 8, 'F'); 
  doc.setDrawColor(0);
  doc.rect(14, finalY + 1, 182, 8, 'S'); // Border
  
  doc.text(`In words:  ${numberToWords(totalTaka)}`, 16, finalY + 6);

  // -- Signatures --
  const pageHeight = doc.internal.pageSize.height;
  const signatureY = pageHeight - 30;

  doc.setFontSize(9);
  doc.setFont(fontName, "bold");

  const sigLineLength = 40;
  
  // Prepared By
  doc.line(14, signatureY, 14 + sigLineLength, signatureY);
  doc.text("PREPARED BY", 14 + (sigLineLength/2), signatureY + 5, { align: "center" });

  // Store Incharge
  const centerX = 105;
  doc.line(centerX - 20, signatureY, centerX + 20, signatureY);
  doc.text("STORE INCHARGE", centerX, signatureY + 5, { align: "center" });

  // General Manager
  const rightX = 196;
  doc.line(rightX - sigLineLength, signatureY, rightX, signatureY);
  doc.text("GENAREL MANAGER", rightX - (sigLineLength/2), signatureY + 5, { align: "center" });

  // Save
  doc.save(`${billType.replace(/ /g, '_')}_${date}.pdf`);
};