import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type CarListing = {
  id?: string;
  import_date: string;
  import_time: string;
  listing_id: string;
  brand: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  mileage: number;
  location: string;
  bid: number;
  bidder: number;
  has_bid: boolean;
  created_at?: string;
};
