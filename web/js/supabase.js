import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const isConfigured = !SUPABASE_URL.includes('TUO-PROGETTO');

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export const BUCKET = 'documenti';

export const MAX_FILE_MB = 50;

// Carica un file nel bucket con un nome univoco e ne restituisce il percorso
export async function uploadToBucket(file) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Il file "${file.name}" supera i ${MAX_FILE_MB} MB`);
  const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

export function checkZip(file) {
  if (!/\.zip$/i.test(file.name)) throw new Error('Gli allegati vanno caricati come un unico file .zip');
}
