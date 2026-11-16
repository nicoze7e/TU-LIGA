// Configuración de la web de la liga. Estos datos son PÚBLICOS (no son contraseñas).
// Mientras supabaseUrl y supabaseKey estén vacíos, la web funciona en MODO DEMOSTRACIÓN con datos inventados.
// Para usar la liga real: pegá acá la URL del proyecto y la clave pública «anon» (Supabase → Project Settings → API).
// ⚠️ NUNCA pegues acá la clave «service_role»: esa es secreta.
window.LIGA_CONFIG = {
  supabaseUrl: 'https://czlfrjgvcndqoviuubwz.supabase.co',
  supabaseKey: 'sb_publishable_YjpVLjtcdFyTh44yE_IEQw_YH_KnaTu',
  ligaFija: '',                   // opcional: si lo completás (ej. 'mar-y-sierra'), la web entra directo a esa liga y no muestra la pantalla de elegir
  driveSyncUrl: '',               // enlace de la aplicación web del script de Drive (ver drive-proyecto/GUIA-DRIVE.md)
  driveHojaUrl: '',               // enlace de la hoja de cálculo de la liga en Drive
  nombreApp: 'TU LIGA'
};
