import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const isConfigured = !SUPABASE_URL.includes('TUO-PROGETTO');

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export const BUCKET = 'documenti';
