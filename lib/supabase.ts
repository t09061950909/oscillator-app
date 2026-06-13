import { createClient } from '@supabase/supabase-js'

// Lazy client creation to avoid build-time env errors
export function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Default export for client-side usage
export const supabase = {
  get client() { return getSupabaseClient() }
}
