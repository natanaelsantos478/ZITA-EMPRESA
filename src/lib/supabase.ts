/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fyearatapvhgyreifniq.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5ZWFyYXRhcHZoZ3lyZWlmbmlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzE3MjQsImV4cCI6MjA5MDQwNzcyNH0.lFY0cftG6SaIRQM_ZWI3WbMwiS27zcxAINvPpU1P6c4'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey)
