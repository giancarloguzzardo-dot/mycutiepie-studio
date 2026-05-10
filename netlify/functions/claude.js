const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  console.log('Function called, method:', event.httpMethod);
  console.log('API key exists:', !!process.env.CLAUDE_API_KEY);
  console.log('API key length:', process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0);
  console.log('Body received:', event.body ? event.body.substring(0, 100) : 'empty');

  try {
    const body = JSON.parse(event.body || '{}');
    const { prompt, system } = body;
    const apiKey = process.env.CLAUDE_API_KEY;

    console.log('Prompt length:', prompt ? prompt.length : 0);
    console.log('API key starts with:', apiKey ? apiKey.substring(0, 10) : 'MISSING');

    if (!apiKey) {
      console.log('ERROR: No API key');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Claude API key not configured' }) };
    }

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: system || '',
      messages: [{ role: 'user', content: prompt }],
    });

    console.log('Calling Anthropic API...');

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 120000,
      }, (res) => {
        console.log('Anthropic response status:', res.statusCode);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', (e) => { console.log('Request error:', e.message); reject(e); });
      req.on('timeout', () => { console.log('Request timeout'); req.destroy(); reject(new Error('Timeout')); });
      req.write(payload);
      req.end();
    });

    console.log('Raw response length:', result.length);
    const data = JSON.parse(result);
    
    if (data.content && data.content[0] && data.content[0].text) {
      console.log('Success! Text length:', data.content[0].text.length);
      return { statusCode: 200, headers, body: JSON.stringify({ text: data.content[0].text }) };
    }
    
    console.log('Claude error:', JSON.stringify(data.error));
    return { statusCode: 500, headers, body: JSON.stringify({ error: data.error?.message || 'No content' }) };

  } catch (err) {
    console.log('Caught error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
