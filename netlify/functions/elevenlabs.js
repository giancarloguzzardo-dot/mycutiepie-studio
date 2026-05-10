// netlify/functions/elevenlabs.js
// Proxy ElevenLabs TTS per Netlify Functions
// Risolve EarlyDrop: usa fetch + risposta binaria diretta (no base64)

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const apiKey = process.env.ELEVEN_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'ELEVEN_API_KEY non configurata' }),
      };
    }

    const { text, voice_id, model_id, voice_settings } = JSON.parse(event.body || '{}');

    if (!text || typeof text !== 'string') {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Parametro "text" mancante o non valido' }),
      };
    }

    const vid = voice_id || 'pNInz6obpgDQGcFmaJgB';
    const model = model_id || 'eleven_turbo_v2_5'; // turbo è il più veloce, perfetto contro l'EarlyDrop
    const settings = voice_settings || { stability: 0.5, similarity_boost: 0.75 };

    // Endpoint /stream — inizia a inviare byte appena pronti, riduce il tempo totale
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream?output_format=mp3_44100_128`;

    // AbortController per non lasciare appesa la richiesta vicino al timeout Lambda
    const controller = new AbortController();
    const timeoutMs = 9_000; // piano Personal: timeout Lambda a 10s, lasciamo 1s di margine
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: settings,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return {
          statusCode: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Timeout: ElevenLabs non ha risposto in tempo',
            hint: 'Prova un testo più corto, voce più veloce, o passa a Supabase Edge Functions',
          }),
        };
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    // Controlla lo status HTTP — il bug grosso del codice precedente
    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs error', response.status, errorText);
      return {
        statusCode: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ElevenLabs API error',
          status: response.status,
          detail: errorText,
        }),
      };
    }

    // Leggiamo il body come ArrayBuffer (è già pronto perché /stream finisce velocemente)
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // Restituiamo l'audio come binario base64 — Netlify lo decodifica automaticamente
    // grazie a isBase64Encoded: true. Il client riceve direttamente audio/mpeg.
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
      body: audioBase64,
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal error' }),
    };
  }
};
