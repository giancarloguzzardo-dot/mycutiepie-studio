// supabase/functions/elevenlabs/index.ts
// Streaming pass-through proxy per ElevenLabs TTS
// Evita "EarlyDrop" non bufferizzando l'audio in memoria

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVEN_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVEN_API_KEY non configurata" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      text,
      voice_id,
      model_id = "eleven_multilingual_v2",
      voice_settings = { stability: 0.5, similarity_boost: 0.75 },
      output_format = "mp3_44100_128",
    } = body;

    if (!text || !voice_id) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: text, voice_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Endpoint STREAM (non quello standard) — è la chiave per evitare l'EarlyDrop
    const elevenUrl =
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream` +
      `?output_format=${output_format}`;

    // AbortController per non lasciare connessioni appese
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 110_000); // 110s, sotto il limite

    const elevenResponse = await fetch(elevenUrl, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id,
        voice_settings,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Se ElevenLabs risponde con errore, propaga il messaggio
    if (!elevenResponse.ok) {
      const errorText = await elevenResponse.text();
      console.error("ElevenLabs error:", elevenResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: "ElevenLabs API error",
          status: elevenResponse.status,
          detail: errorText,
        }),
        {
          status: elevenResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!elevenResponse.body) {
      return new Response(
        JSON.stringify({ error: "Risposta ElevenLabs senza body" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STREAMING PASS-THROUGH: non bufferizziamo nulla
    // Il body di ElevenLabs viene inoltrato byte-per-byte al client
    return new Response(elevenResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("Edge Function error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
