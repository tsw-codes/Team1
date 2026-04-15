import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const useMock = import.meta.env.VITE_USE_MOCK === 'true'

// Only create the client when not using mock data.
// This way teammates without Supabase credentials can still
// run the app in mock mode without errors.
export const supabase = useMock
  ? null
  : createClient(supabaseUrl, supabaseAnonKey)

export const USE_MOCK = useMock
