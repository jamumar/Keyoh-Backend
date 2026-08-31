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
              content: 'You are an automated real estate content filter for the KEYOH property platform. Your goal is to verify that photos are taken of a physical home, building, or property. ACCEPT all property photos, including room interiors, ceilings, walls, lighting/fixtures, floors, windows, doors, hallways, stairs, kitchens, bathrooms, bedrooms, living spaces, building exteriors, gardens, patios, garages, and floorplans. ONLY REJECT (set isPropertyPhoto: false, safe: false) if the photo is clearly NOT a physical home/building (such as mobile phone/app/game screenshots, internet memes, computer graphics, close-up selfies/portraits of people, ID cards, or text documents). Always respond strictly in JSON: {"isPropertyPhoto": boolean, "safe": boolean, "reason": "brief reason if rejected"}.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this photo. Is it a physical building/property interior/exterior/feature or an invalid non-property upload (screenshot/meme/selfie/graphic)? Respond strictly in JSON.',
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
async function checkImagesBatchSafety(imageUrls = []) {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { flagged: false, isPropertyPhoto: true };
  }

  try {
    const formattedImages = imageUrls.map(url => {
      const isDataUrl = url.startsWith('data:') || url.startsWith('http');
      const formattedUrl = isDataUrl ? url : `data:image/jpeg;base64,${url}`;
      return { type: 'image_url', image_url: { url: formattedUrl, detail: 'low' } };
    });

    console.log(`[ModerationService] 🔍 Calling GPT-4o Vision batch validation for ${imageUrls.length} photo(s) in a single request...`);
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
            content: 'You are an automated real estate content filter for the KEYOH property platform. Inspect ALL provided images. ACCEPT all real property photos (room interiors, ceilings, walls, lighting/fixtures, floors, windows, doors, hallways, stairs, kitchens, bathrooms, bedrooms, living spaces, building exteriors, gardens, patios, garages, and floorplans). ONLY REJECT (set isPropertyPhoto: false, safe: false) if ANY image is clearly NOT a physical home/building (such as mobile phone/app/game screenshots, internet memes, computer graphics, close-up selfies/portraits of people, ID cards, or text documents). Always respond strictly in JSON: {"isPropertyPhoto": boolean, "safe": boolean, "reason": "brief explanation if any image is rejected"}.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze these ${imageUrls.length} photos together for a real estate listing. Are they all legitimate physical building/property photos or are there invalid non-property uploads (screenshots/memes/selfies/graphics)? Respond strictly in JSON.`,
              },
              ...formattedImages,
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
      console.log('[ModerationService] 👁️ GPT-4o Vision batch response:', JSON.stringify(res));

      if (res.safe === false || res.isPropertyPhoto === false) {
        console.warn('[ModerationService] ❌ Batch Image REJECTED by GPT Vision:', res.reason);
        return {
          flagged: true,
          isPropertyPhoto: false,
          reason: res.reason || 'One or more images are not valid property photos. Please upload genuine property photos only.',
        };
      }
    } else {
      const errText = await response.text();
      console.error('[ModerationService] ❌ OpenAI API HTTP error:', response.status, errText);
    }
  } catch (e) {
    console.warn('[ModerationService] AI Image Vision batch scan error:', e.message);
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

module.exports = { checkContentSafety, checkImageSafety, checkImagesBatchSafety, checkVideoSafety };
