import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";

const SUPABASE_URL = "https://sfuroqxcljlkbthblqva.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmdXJvcXhjbGpsa2J0aGJscXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxOTE0MTQsImV4cCI6MjA4MDc2NzQxNH0.v1qrjQgkPg3hPjIVCsKg3unwM0lvPGXkw8DvVm8YlRI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
