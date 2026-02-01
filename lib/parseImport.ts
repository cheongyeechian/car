import * as XLSX from "xlsx";
import type { CarListing } from "./supabase";

const KNOWN_BRANDS: Record<string, string> = {
  toyota: "Toyota",
  honda: "Honda",
  mazda: "Mazda",
  bmw: "BMW",
  "mercedes-benz": "Mercedes-Benz",
  audi: "Audi",
  proton: "Proton",
  perodua: "Perodua",
  suzuki: "Suzuki",
  mini: "Mini",
  lexus: "Lexus",
  volkswagen: "Volkswagen",
  nissan: "Nissan",
  hyundai: "Hyundai",
  kia: "Kia",
  subaru: "Subaru",
  mitsubishi: "Mitsubishi",
  ford: "Ford",
  porsche: "Porsche",
  volvo: "Volvo",
  "land rover": "Land Rover",
  jaguar: "Jaguar",
  peugeot: "Peugeot",
  isuzu: "Isuzu",
  chery: "Chery",
  haval: "Haval",
  ora: "Ora",
  byd: "BYD",
  "rolls-royce": "Rolls-Royce",
  bentley: "Bentley",
  maserati: "Maserati",
  infiniti: "Infiniti",
  jeep: "Jeep",
  chevrolet: "Chevrolet",
  alfa: "Alfa Romeo",
  renault: "Renault",
  citroen: "Citroen",
  ssangyong: "SsangYong",
  fiat: "Fiat",
  daihatsu: "Daihatsu",
  smart: "Smart",
  tesla: "Tesla",
  mg: "MG",
  neta: "Neta",
  changan: "Changan",
  gac: "GAC",
  geely: "Geely",
  great: "Great Wall",
};

function normalizeBrand(raw: string): string {
  const lower = raw.toLowerCase();
  return KNOWN_BRANDS[lower] || raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function titleCase(str: string): string {
  return str
    .split(" ")
    .map((w) => {
      if (w.length === 0) return w;
      // Keep uppercase abbreviations like "GT", "SE", etc.
      if (w === w.toUpperCase() && w.length <= 4) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function parseYearBrandModelVariant(raw: string): {
  year: number;
  brand: string;
  model: string;
  variant: string;
} {
  const trimmed = raw.trim();

  // Extract year (first 4-digit number)
  const yearMatch = trimmed.match(/^(\d{4})\s+/);
  if (!yearMatch) {
    return { year: 0, brand: "", model: trimmed, variant: "" };
  }
  const year = parseInt(yearMatch[1]);
  let rest = trimmed.slice(yearMatch[0].length);

  // Extract variant (last "X.X Auto" or "X.X Manual" pattern)
  const variantMatch = rest.match(/\s+(\d+\.?\d*\s+(?:Auto|Manual))\s*$/i);
  let variant = "";
  if (variantMatch) {
    variant = variantMatch[1];
    rest = rest.slice(0, rest.length - variantMatch[0].length);
  }

  // Extract brand (first word, handle hyphenated names like Mercedes-Benz)
  const brandMatch = rest.match(/^(\S+)\s*/);
  let brand = "";
  let model = rest;
  if (brandMatch) {
    brand = normalizeBrand(brandMatch[1]);
    model = rest.slice(brandMatch[0].length).trim();
  }

  // Clean up model - remove "no variant" text
  model = model.replace(/\bno variant\b/gi, "").trim();
  model = model.replace(/\s+/g, " ");

  // Title case the model
  model = titleCase(model);

  return { year, brand, model, variant };
}

function parseMileage(raw: string): number {
  if (typeof raw === "number") return raw;
  // Remove non-breaking spaces, commas, "km" text
  const cleaned = String(raw)
    .replace(/\u00a0/g, "")
    .replace(/,/g, "")
    .replace(/km/gi, "")
    .trim();
  return parseInt(cleaned) || 0;
}

function parseListingId(raw: string | number): string {
  // Take only the numeric part, ignore text like "High Risk"
  const str = String(raw).trim();
  const match = str.match(/(\d+)/);
  return match ? match[1] : str;
}

function parseLocation(raw: string): string {
  return String(raw).replace(/\u00a0/g, "").trim();
}

export function parseImportFile(data: ArrayBuffer): CarListing[] {
  const workbook = XLSX.read(data, { type: "array" });

  // Try to find the sheet with data - prefer sheets with "Paste Sample" or use first sheet
  let sheetName = workbook.SheetNames[0];
  // Look for sheets that have actual paste data (Paste Sample sheets with data)
  for (const name of workbook.SheetNames) {
    if (name.toLowerCase().includes("paste sample")) {
      const ws = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      if (range.e.r > 5) {
        sheetName = name;
        break;
      }
    }
  }

  // If first sheet (Sheet1) has "Ended" data in column A, use it
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const firstSheetRange = XLSX.utils.decode_range(firstSheet["!ref"] || "A1");
  let hasEndedInFirstSheet = false;
  for (let r = 0; r <= Math.min(firstSheetRange.e.r, 20); r++) {
    const cell = firstSheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell && String(cell.v).trim() === "Ended") {
      hasEndedInFirstSheet = true;
      break;
    }
  }
  if (hasEndedInFirstSheet) {
    sheetName = workbook.SheetNames[0];
  }

  const ws = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Try to read import date/time from first row (columns G and H)
  let importDate = new Date().toISOString().split("T")[0];
  let importTime = new Date().toTimeString().slice(0, 5);

  const dateCell = ws[XLSX.utils.encode_cell({ r: 0, c: 6 })]; // Column G
  const timeCell = ws[XLSX.utils.encode_cell({ r: 0, c: 7 })]; // Column H

  if (dateCell) {
    if (dateCell.t === "d" || dateCell.t === "n") {
      // Date type or number (Excel date serial)
      const d = XLSX.SSF.parse_date_code(typeof dateCell.v === "number" ? dateCell.v : 0);
      if (d) {
        importDate = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      }
    } else {
      const str = String(dateCell.v).trim();
      // Try to parse date string
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        importDate = parsed.toISOString().split("T")[0];
      }
    }
  }

  if (timeCell) {
    const str = String(timeCell.v).trim();
    // Handle formats like "1pm", "13:00", "03:15", etc.
    const pmMatch = str.match(/^(\d{1,2})\s*(am|pm)$/i);
    if (pmMatch) {
      let hour = parseInt(pmMatch[1]);
      if (pmMatch[2].toLowerCase() === "pm" && hour < 12) hour += 12;
      if (pmMatch[2].toLowerCase() === "am" && hour === 12) hour = 0;
      importTime = `${String(hour).padStart(2, "0")}:00`;
    } else if (str.includes(":")) {
      importTime = str;
    }
  }

  // Find all "Ended" rows and parse items
  const listings: CarListing[] = [];

  for (let r = 0; r <= range.e.r; r++) {
    const cellA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cellA || String(cellA.v).trim() !== "Ended") continue;

    // This row is "Ended" - next rows contain the item data
    const listingIdCell = ws[XLSX.utils.encode_cell({ r: r + 1, c: 0 })];
    const descCell = ws[XLSX.utils.encode_cell({ r: r + 2, c: 0 })];
    const mileageCell = ws[XLSX.utils.encode_cell({ r: r + 3, c: 0 })];
    const locationCell = ws[XLSX.utils.encode_cell({ r: r + 4, c: 0 })];
    const priceCell = ws[XLSX.utils.encode_cell({ r: r + 5, c: 0 })];
    // r+6 is "Click to Max Bid" - skip
    const bidCell = ws[XLSX.utils.encode_cell({ r: r + 7, c: 0 })];
    const bidderCell = ws[XLSX.utils.encode_cell({ r: r + 8, c: 0 })];

    if (!listingIdCell || !descCell) continue;

    const listingId = parseListingId(listingIdCell.v);
    const { year, brand, model, variant } = parseYearBrandModelVariant(
      String(descCell.v)
    );
    const mileage = mileageCell ? parseMileage(mileageCell.v) : 0;
    const location = locationCell ? parseLocation(String(locationCell.v)) : "";
    const price = priceCell ? Number(priceCell.v) || 0 : 0;

    let bid = 0;
    let bidder = 0;
    if (bidCell && String(bidCell.v).trim() !== "-") {
      bid = Number(bidCell.v) || 0;
    }
    if (bidderCell && String(bidderCell.v).trim() !== "-") {
      bidder = Number(bidderCell.v) || 0;
    }

    const hasBid = bid > 0;

    listings.push({
      import_date: importDate,
      import_time: importTime,
      listing_id: listingId,
      brand,
      model,
      variant,
      year,
      price,
      mileage,
      location,
      bid,
      bidder,
      has_bid: hasBid,
    });
  }

  return listings;
}
