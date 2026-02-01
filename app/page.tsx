"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, type CarListing } from "@/lib/supabase";
import { parseImportFile } from "@/lib/parseImport";
import { exportToMasterFormat } from "@/lib/exportMaster";

export default function Home() {
  const [listings, setListings] = useState<CarListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [listingIdFilter, setListingIdFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [importDateFilter, setImportDateFilter] = useState("");
  const [bidFilter, setBidFilter] = useState<"" | "bid" | "nobid">("");

  // Total counts
  const [totalCount, setTotalCount] = useState(0);
  const [totalBidCount, setTotalBidCount] = useState(0);
  const [totalNoBidCount, setTotalNoBidCount] = useState(0);

  // Sort
  const [sortColumn, setSortColumn] = useState<"import_date" | "import_time" | "">("");
  const [sortAsc, setSortAsc] = useState(true);

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Unique values for dropdowns
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [importDates, setImportDates] = useState<string[]>([]);

  const fetchDropdownValues = useCallback(async () => {
    const { data: brandData } = await supabase
      .from("car_listings")
      .select("brand")
      .order("brand");
    if (brandData) {
      const unique = [...new Set(brandData.map((r) => r.brand))].sort();
      setBrands(unique);
    }

    const { data: dateData } = await supabase
      .from("car_listings")
      .select("import_date")
      .order("import_date", { ascending: false });
    if (dateData) {
      const unique = [...new Set(dateData.map((r) => r.import_date))];
      setImportDates(unique);
    }
  }, []);

  const fetchModelsForBrand = useCallback(async (brand: string) => {
    let query = supabase.from("car_listings").select("model").order("model");
    if (brand) {
      query = query.eq("brand", brand);
    }
    const { data } = await query;
    if (data) {
      const unique = [...new Set(data.map((r) => r.model))].sort();
      setModels(unique);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildFilteredQuery = useCallback(
    <T extends { eq: any; gte: any; lte: any }>(base: T): T => {
      let query = base;
      if (listingIdFilter) query = query.eq("listing_id", listingIdFilter);
      if (brandFilter) query = query.eq("brand", brandFilter);
      if (modelFilter) query = query.eq("model", modelFilter);
      if (yearMin) query = query.gte("year", parseInt(yearMin));
      if (yearMax) query = query.lte("year", parseInt(yearMax));
      if (priceMin) query = query.gte("price", parseInt(priceMin));
      if (priceMax) query = query.lte("price", parseInt(priceMax));
      if (importDateFilter) query = query.eq("import_date", importDateFilter);
      return query;
    },
    [listingIdFilter, brandFilter, modelFilter, yearMin, yearMax, priceMin, priceMax, importDateFilter]
  );

  const fetchCounts = useCallback(async () => {
    // Total count with current filters (excluding bid filter)
    const { count: total } = await buildFilteredQuery(
      supabase.from("car_listings").select("*", { count: "exact", head: true })
    );
    setTotalCount(total || 0);

    // Bid count
    const { count: bidC } = await buildFilteredQuery(
      supabase.from("car_listings").select("*", { count: "exact", head: true })
    ).eq("has_bid", true);
    setTotalBidCount(bidC || 0);

    // No bid count
    const { count: noBidC } = await buildFilteredQuery(
      supabase.from("car_listings").select("*", { count: "exact", head: true })
    ).eq("has_bid", false);
    setTotalNoBidCount(noBidC || 0);
  }, [buildFilteredQuery]);

  const handleSort = (column: "import_date" | "import_time") => {
    if (sortColumn === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(column);
      setSortAsc(true);
    }
    setPage(0);
  };

  const fetchListings = useCallback(async () => {
    setLoading(true);
    let query = buildFilteredQuery(
      supabase.from("car_listings").select("*")
    ).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // Apply bid filter
    if (bidFilter === "bid") query = query.eq("has_bid", true);
    if (bidFilter === "nobid") query = query.eq("has_bid", false);

    // Apply sort
    if (sortColumn) {
      query = query.order(sortColumn, { ascending: sortAsc });
      if (sortColumn === "import_date") {
        query = query.order("import_time", { ascending: sortAsc });
      }
    } else {
      query = query.order("brand").order("model").order("year", { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      setMessage(`Error fetching: ${error.message}`);
    } else {
      setListings(data || []);
    }
    setLoading(false);
  }, [
    page,
    sortColumn,
    sortAsc,
    bidFilter,
    buildFilteredQuery,
  ]);

  useEffect(() => {
    fetchDropdownValues();
  }, [fetchDropdownValues]);

  useEffect(() => {
    fetchModelsForBrand(brandFilter);
  }, [brandFilter, fetchModelsForBrand]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage("Parsing file...");

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseImportFile(buffer);

      if (parsed.length === 0) {
        setMessage("No items found in file. Make sure the file has 'Ended' rows.");
        setImporting(false);
        return;
      }

      // Duplicate file detection: hash the file content and check if already imported
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data: existingHash } = await supabase
        .from("import_logs")
        .select("id")
        .eq("file_hash", fileHash)
        .limit(1);

      if (existingHash && existingHash.length > 0) {
        setMessage("This exact file has already been imported. Import cancelled.");
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setMessage(`Uploading ${parsed.length} items...`);

      // Insert in batches of 100
      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < parsed.length; i += batchSize) {
        const batch = parsed.slice(i, i + batchSize);
        const { error } = await supabase.from("car_listings").insert(batch);
        if (error) {
          setMessage(`Error inserting batch: ${error.message}`);
          setImporting(false);
          return;
        }
        inserted += batch.length;
      }

      // Save file hash to prevent re-import
      await supabase.from("import_logs").insert({
        file_hash: fileHash,
        file_name: file.name,
        item_count: inserted,
      });

      setMessage(`Successfully imported ${inserted} items.`);
      fetchListings();
      fetchDropdownValues();
      fetchCounts();
    } catch (err) {
      setMessage(`Error parsing file: ${err instanceof Error ? err.message : err}`);
    }

    setImporting(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExport = async () => {
    setMessage("Fetching all filtered data for export...");

    // Fetch ALL matching records (no pagination)
    let query = buildFilteredQuery(
      supabase.from("car_listings").select("*")
    )
      .order("brand")
      .order("model")
      .order("year", { ascending: false });

    if (bidFilter === "bid") query = query.eq("has_bid", true);
    if (bidFilter === "nobid") query = query.eq("has_bid", false);

    const { data, error } = await query;
    if (error) {
      setMessage(`Export error: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      setMessage("No data to export.");
      return;
    }

    const buffer = exportToMasterFormat(data);
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Carsome_Bid_Price_Master_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${data.length} items.`);
  };

  const clearFilters = () => {
    setListingIdFilter("");
    setBrandFilter("");
    setModelFilter("");
    setYearMin("");
    setYearMax("");
    setPriceMin("");
    setPriceMax("");
    setImportDateFilter("");
    setBidFilter("");
    setSortColumn("");
    setSortAsc(true);
    setPage(0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            Carsome Bid Price Manager
          </h1>
          <div className="flex gap-3">
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition ${importing ? "bg-gray-300 text-gray-500" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {importing ? "Importing..." : "Import File"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImport}
                disabled={importing}
                className="hidden"
              />
            </label>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
            >
              Export Master File
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Status message */}
        {message && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            {message}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* Listing ID */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Listing ID
              </label>
              <input
                type="text"
                value={listingIdFilter}
                onChange={(e) => {
                  setListingIdFilter(e.target.value);
                  setPage(0);
                }}
                placeholder="e.g. 2098229"
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>

            {/* Brand */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Brand
              </label>
              <select
                value={brandFilter}
                onChange={(e) => {
                  setBrandFilter(e.target.value);
                  setModelFilter("");
                  setPage(0);
                }}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                <option value="">All</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Model
              </label>
              <select
                value={modelFilter}
                onChange={(e) => {
                  setModelFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                <option value="">All</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Range */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Year Min
              </label>
              <input
                type="number"
                value={yearMin}
                onChange={(e) => {
                  setYearMin(e.target.value);
                  setPage(0);
                }}
                placeholder="e.g. 2015"
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Year Max
              </label>
              <input
                type="number"
                value={yearMax}
                onChange={(e) => {
                  setYearMax(e.target.value);
                  setPage(0);
                }}
                placeholder="e.g. 2024"
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>

            {/* Price Range */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Price Min (RM)
              </label>
              <input
                type="number"
                value={priceMin}
                onChange={(e) => {
                  setPriceMin(e.target.value);
                  setPage(0);
                }}
                placeholder="e.g. 10000"
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Price Max (RM)
              </label>
              <input
                type="number"
                value={priceMax}
                onChange={(e) => {
                  setPriceMax(e.target.value);
                  setPage(0);
                }}
                placeholder="e.g. 100000"
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              />
            </div>

            {/* Import Date */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Import Date
              </label>
              <select
                value={importDateFilter}
                onChange={(e) => {
                  setImportDateFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                <option value="">All</option>
                {importDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary - clickable labels */}
        <div className="flex gap-4 mb-4 text-sm">
          <button
            onClick={() => { setBidFilter(""); setPage(0); }}
            className={`px-3 py-1 rounded-full border transition cursor-pointer ${
              bidFilter === ""
                ? "bg-blue-100 border-blue-400 text-blue-800 font-semibold"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Total: <strong>{totalCount}</strong>
          </button>
          <button
            onClick={() => { setBidFilter("bid"); setPage(0); }}
            className={`px-3 py-1 rounded-full border transition cursor-pointer ${
              bidFilter === "bid"
                ? "bg-green-200 border-green-500 text-green-900 font-semibold"
                : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
            }`}
          >
            With Bid: <strong>{totalBidCount}</strong>
          </button>
          <button
            onClick={() => { setBidFilter("nobid"); setPage(0); }}
            className={`px-3 py-1 rounded-full border transition cursor-pointer ${
              bidFilter === "nobid"
                ? "bg-red-200 border-red-500 text-red-900 font-semibold"
                : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
            }`}
          >
            No Bid: <strong>{totalNoBidCount}</strong>
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th
                    className="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("import_date")}
                  >
                    Import Date {sortColumn === "import_date" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("import_time")}
                  >
                    Time {sortColumn === "import_time" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Listing ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Brand
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Model
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Variant
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">
                    Year
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">
                    Price (RM)
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">
                    Mileage (KM)
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Location
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">
                    Bid
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">
                    Bidder
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : listings.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-gray-400">
                      No data found. Import a file to get started.
                    </td>
                  </tr>
                ) : (
                  listings.map((l, i) => (
                    <tr
                      key={l.id || i}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${
                        !l.has_bid ? "bg-red-50/30" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-600">{l.import_date}</td>
                      <td className="px-3 py-2 text-gray-600">{l.import_time}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">
                        {l.listing_id}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {l.brand}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{l.model}</td>
                      <td className="px-3 py-2 text-gray-600">{l.variant}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{l.year}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {l.price?.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {l.mileage?.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{l.location}</td>
                      <td className="px-3 py-2 text-right">
                        {l.has_bid ? (
                          <span className="text-green-700 font-medium">{l.bid}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.has_bid ? (
                          <span className="text-green-700">{l.bidder}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={listings.length < PAGE_SIZE}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}
