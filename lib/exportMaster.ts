import * as XLSX from "xlsx";
import type { CarListing } from "./supabase";

export function exportToMasterFormat(listings: CarListing[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  // Split into bid and no-bid
  const bidListings = listings.filter((l) => l.has_bid);
  const noBidListings = listings.filter((l) => !l.has_bid);

  // ---- BId Sheet ----
  const bidHeaders = [
    "Import Date",
    "Time",
    "Listing ID",
    "Brand",
    "Model",
    "Variant",
    "Year",
    "Price (RM)",
    "Mileage (KM)",
    "Location",
    "Bid",
    "Bidder",
  ];

  const bidData = bidListings.map((l) => [
    l.import_date,
    l.import_time,
    l.listing_id,
    l.brand,
    l.model,
    l.variant,
    l.year,
    l.price,
    l.mileage,
    l.location,
    l.bid,
    l.bidder,
  ]);

  const bidSheet = XLSX.utils.aoa_to_sheet([bidHeaders, ...bidData]);

  // Set column widths
  bidSheet["!cols"] = [
    { wch: 12 }, // Import Date
    { wch: 8 },  // Time
    { wch: 10 }, // Listing ID
    { wch: 16 }, // Brand
    { wch: 30 }, // Model
    { wch: 12 }, // Variant
    { wch: 6 },  // Year
    { wch: 12 }, // Price
    { wch: 12 }, // Mileage
    { wch: 18 }, // Location
    { wch: 6 },  // Bid
    { wch: 8 },  // Bidder
  ];

  XLSX.utils.book_append_sheet(workbook, bidSheet, "BId");

  // ---- No Bid Sheet ----
  const noBidHeaders = [
    "Date",
    "Time",
    "Platform",
    "Listing ID",
    "Brand",
    "Model",
    "Variant",
    "Year",
    "Price (RM)",
    "Mileage (KM)",
    "Location",
    "Bid",
    "Bidder",
    "",
    "Seller Type",
    "Notes",
  ];

  const noBidData = noBidListings.map((l) => [
    l.import_date,
    l.import_time,
    "Carsome",
    l.listing_id,
    l.brand,
    l.model,
    l.variant,
    l.year,
    l.price,
    l.mileage,
    l.location,
    l.bid,
    l.bidder,
    "",
    "",
    "",
  ]);

  const noBidSheet = XLSX.utils.aoa_to_sheet([noBidHeaders, ...noBidData]);

  noBidSheet["!cols"] = [
    { wch: 12 }, // Date
    { wch: 8 },  // Time
    { wch: 10 }, // Platform
    { wch: 10 }, // Listing ID
    { wch: 16 }, // Brand
    { wch: 30 }, // Model
    { wch: 12 }, // Variant
    { wch: 6 },  // Year
    { wch: 12 }, // Price
    { wch: 12 }, // Mileage
    { wch: 18 }, // Location
    { wch: 6 },  // Bid
    { wch: 8 },  // Bidder
    { wch: 2 },  // empty
    { wch: 12 }, // Seller Type
    { wch: 20 }, // Notes
  ];

  XLSX.utils.book_append_sheet(workbook, noBidSheet, "No Bid");

  // Write to buffer
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return buffer;
}
