// TU LIGA · Edge Function "cambiar-clave"
// Para qué: que el coordinador cambie la clave de una cuenta de su liga (o la dueña/el dueño, la de cualquiera) desde la web.
// Por qué es una función y no código de la web: cambiar la clave de OTRA cuenta exige la clave secreta (service_role),
// que nunca puede estar en la web. Acá vive en el servidor de Supabase (Supabase la inyecta sola; no la pegues en ningún lado).
// Cómo se despliega: Supabase → Edge Functions → Deploy a new function → nombre "cambiar-clave" → pegar este archivo → Deploy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const responder = (estado: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { usuario_id, clave_nueva } = await req.json();
    if (typeof usuario_id !== 'string' || typeof clave_nueva !== 'string') return responder(400, { error: 'Faltan datos.' });
    if (clave_nueva.length < 6) return responder(400, { error: 'La clave debe tener al menos 6 caracteres.' });

    const url = Deno.env.get('SUPABASE_URL')!;
    // 1) ¿Quién llama? Se verifica con su propia sesión.
    const quien = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await quien.auth.getUser();
    if (!user) return responder(401, { error: 'Iniciá sesión.' });

    // 2) ¿Puede cambiar esa cuenta? Solo el coordinador de la misma liga o el dueño.
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: yo } = await admin.from('perfiles').select('rol, liga_id, activo').eq('usuario_id', user.id).maybeSingle();
    const { data: objetivo } = await admin.from('perfiles').select('rol, liga_id').eq('usuario_id', usuario_id).maybeSingle();
    if (!yo?.activo || !objetivo) return responder(403, { error: 'No tenés permiso.' });
    const permitido = yo.rol === 'dueno' || (yo.rol === 'coordinador' && yo.liga_id === objetivo.liga_id && objetivo.rol !== 'dueno');
    if (!permitido) return responder(403, { error: 'No tenés permiso para cambiar esa cuenta.' });

    // 3) Cambiar la clave y cerrar la sesión que estuviera abierta con la clave vieja.
    const { error } = await admin.auth.admin.updateUserById(usuario_id, { password: clave_nueva });
    if (error) return responder(400, { error: error.message });
    await admin.from('sesiones_activas').delete().eq('usuario_id', usuario_id);
    return responder(200, { ok: true });
  } catch (e) {
    return responder(500, { error: 'Algo salió mal. Probá de nuevo.' });
  }
});
