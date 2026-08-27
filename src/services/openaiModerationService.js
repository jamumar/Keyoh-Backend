require('dotenv').config();

const PROHIBITED_KEYWORDS = [
  'hate speech',
  'offensive content',
  'explicit illegal',
];

async function checkContentSafety(text) {
  if (!text || typeof text !== 'string') {
    return { flagged: false, categories: {} };
  }

  // 1. Check local keyword blocklist
  const lowerText = text.toLowerCase();
  for (const kw of PROHIBITED_KEYWORDS) {
    if (lowerText.includes(kw)) {
      return {
        flagged: true,
        reason: `Prohibited keyword match: ${kw}`,
      };
    }
  }

  // 2. If OPENAI_API_KEY set, check OpenAI Moderation Endpoint (free endpoint)
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({ input: text }),
      });

      if (response.ok) {
        const payload = await response.json();
        const results = payload?.results?.[0];
        if (results?.flagged) {
          return {
            flagged: true,
            categories: results.categories,
            reason: 'Automated AI moderation filter flagged content',
          };
        }
      }
    } catch (e) {
      console.warn('[ModerationService] OpenAI API check error:', e.message);
    }
  }

  return { flagged: false };
}

async function checkImageSafety(imageUrlOrBase64) {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey && imageUrlOrBase64) {
    try {
      const isDataUrl = imageUrlOrBase64.startsWith('data:') || imageUrlOrBase64.startsWith('http');
      const formattedUrl = isDataUrl ? imageUrlOrBase64 : `data:image/jpeg;base64,${imageUrlOrBase64}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this photo for a UK property app listing. Determine if it is a valid property photo (room interior, building exterior, garden, kitchen, bathroom, floorplan) or an invalid upload (such as a mobile app screenshot, meme, ID document, or non-property image). Respond in JSON format: {"safe": true/false, "isPropertyPhoto": true/false, "reason": "..."}',
                },
                { type: 'image_url', image_url: { url: formattedUrl } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        const res = JSON.parse(payload.choices[0].message.content);
        if (res.safe === false || res.isPropertyPhoto === false) {
          return {
            flagged: true,
            isPropertyPhoto: Boolean(res.isPropertyPhoto),
            reason: res.reason || 'Image is not a valid property photo (app screenshot or non-property image detected)',
          };
        }
      }
    } catch (e) {
      console.warn('[ModerationService] AI Image Vision scan error:', e.message);
    }
  }
  return { flagged: false, isPropertyPhoto: true };
}

async function checkVideoSafety(streamId, thumbnailUrl) {
  // If OPENAI_API_KEY set, perform GPT-4 Vision / OpenAI moderation scan on video thumbnail
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey && thumbnailUrl) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Is this real estate property video thumbnail safe and appropriate for a UK property app? Respond JSON: {"safe": true/false, "reason": "..."}' },
                { type: 'image_url', image_url: { url: thumbnailUrl } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        const res = JSON.parse(payload.choices[0].message.content);
        if (res.safe === false) {
          return { flagged: true, reason: res.reason || 'AI Vision scan flagged video content' };
        }
      }
    } catch (e) {
      console.warn('[ModerationService] AI Video scan error:', e.message);
    }
  }
  return { flagged: false };
}

module.exports = { checkContentSafety, checkImageSafety, checkVideoSafety };
