const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const { text, voice_id } = JSON.parse(event.body || '{}');
  const vid = voice_id || 'pNInz6obpgDQGcFmaJgB';
  const key = process.env.ELEVEN_API_KEY || '';
  const payload = JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } });
  const result = await new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.elevenlabs.io', path: `/v1/text-to-speech/${vid}`, method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  return { statusCode: 200, headers, body: JSON.stringify({ audio_base64: result.toString('base64') }) };
};
