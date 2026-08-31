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

      console.log('[ModerationService] 🔍 Calling GPT-4o Vision for photo validation...');
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
              role: 'system',
              content: 'You are a strict automated real estate content filter for the KEYOH property platform. Your job is to verify whether uploaded photos are legitimate real estate property listing photos (room interiors, kitchen, living room, bedrooms, bathrooms, building exterior, garden/patio, or floorplans). You MUST REJECT (set isPropertyPhoto: false, safe: false) any screenshots of apps/mobile phones, memes, personal selfies, pictures of people/faces, pets/animals, random non-property objects, graphics, text documents, or non-real-estate photos. Always respond strictly in JSON: {"isPropertyPhoto": boolean, "safe": boolean, "reason": "brief reason if rejected"}.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this image. Is it a genuine property listing photo (real estate)? Respond strictly in JSON.',
                },
                { type: 'image_url', image_url: { url: formattedUrl, detail: 'low' } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        const contentStr = payload.choices?.[0]?.message?.content || '{}';
        const res = JSON.parse(contentStr);
        console.log('[ModerationService] 👁️ GPT-4o Vision response:', JSON.stringify(res));

        if (res.safe === false || res.isPropertyPhoto === false) {
          console.warn('[ModerationService] ❌ Image REJECTED by GPT Vision:', res.reason);
          return {
            flagged: true,
            isPropertyPhoto: false,
            reason: res.reason || 'Image is not a valid property photo. Please upload genuine property photos only.',
          };
        }
      } else {
        const errText = await response.text();
        console.error('[ModerationService] ❌ OpenAI API HTTP error:', response.status, errText);
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
