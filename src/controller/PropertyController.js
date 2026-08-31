const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Properties, PropertyType, TenureType, Users } = require('../models');
const { AgentMiddlware, PropertyOwnerMiddleware } = require('../middleware');
const { buildPropertyQueryOptions } = require('../services/propertyFilterService');
const { checkImageSafety } = require('../services/openaiModerationService');

// Get all properties
router.get('/', async (req, res) => {
    try {
        const { where, order, limit } = buildPropertyQueryOptions(req.query);

        const properties = await Properties.findAll({
            where,
            include: [
                {
                    model: PropertyType,
                    as: 'propertyType',
                    attributes: ['id', 'name', 'status']
                },
                {
                    model: TenureType,
                    as: 'tenureType',
                    attributes: ['id', 'name', 'status']
                },
                {
                    model: Users,
                    as: 'agentProperties',
                    attributes: ['id', 'name', 'email', 'phone', 'agency_name']
                }
            ],
            order,
            ...(limit ? { limit } : {}),
        });
        res.status(200).json({
            success: true,
            data: properties
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get('/seller-properties', PropertyOwnerMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'seller') {
            return res.status(403).json({
                success: false,
                message: 'Only sellers can access this endpoint',
            });
        }

        const property = await Properties.findAll({
            where: {
                agent_id: req.user.id,
            },
            order: [
                ['createdAt', 'DESC']
            ],
        });

        res.status(200).json({
            success: true,
            data: property
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get('/agent-properties', AgentMiddlware, async (req, res) => {
    console.log('agent', req.user)
    try {
        const property = await Properties.findAll({
            where: {
                agent_id: req.user.id
            },

            order: [
                ['createdAt', 'DESC']
            ],
        });
        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Property not found'
            });
        }
        res.status(200).json({
            success: true,
            data: property
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
// Get single property
router.get('/:id', async (req, res) => {
    try {
        const property = await Properties.findByPk(req.params.id, {
            include: [
                {
                    model: PropertyType,
                    as: 'propertyType',
                    attributes: ['id', 'name', 'status'],
                },
                {
                    model: TenureType,
                    as: 'tenureType',
                    attributes: ['id', 'name', 'status'],
                },
            ],
        });
        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Property not found'
            });
        }
        res.status(200).json({
            success: true,
            data: property
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});




const { uploadProperty } = require('../utils/upload');
const {
    uploadVideoFile,
    VIDEO_LIMITS,
    isStreamConfigured,
} = require('../services/cloudflareStreamService');
const { uploadImageFile, isImagesConfigured } = require('../services/cloudflareImagesService');

const MAX_IMAGES = 20;
const MAX_VIDEOS = 4;
const VIDEO_FIELD_MAP = {
    video_property_reel: 'property_reel',
    video_seller_intro: 'seller_intro',
    vertical_video: 'property_reel',
    video: 'property_reel',
    video_tour: 'property_reel',
};

const parseJsonField = (value, fallback) => {
    if (value == null || value === '') return fallback;
    if (Array.isArray(value)) return value;
    try {
        return JSON.parse(value);
    } catch (e) {
        console.log('Error parsing JSON field:', e);
        return fallback;
    }
};

const optionalUploadProperty = (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return next();
    }

    uploadProperty(req, res, (err) => {
        if (err) {
            return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
                success: false,
                message: err.code === 'LIMIT_FILE_SIZE'
                    ? 'File too large. Try fewer or smaller photos.'
                    : err.message,
            });
        }
        next();
    });
};

// Photos → Cloudflare Images. Videos → Cloudflare Stream.
router.post('/', PropertyOwnerMiddleware, uploadProperty, async (req, res) => {
    console.log('[property] 🚀 POST /property received');
    console.log('[property] req.user:', req.user?.id, req.user?.email, req.user?.role);
    console.log('[property] req.body:', JSON.stringify(req.body, null, 2));

    try {
        const ownerId = req.user.id;

        // Enforce 1-Active-Listing rule for Private Sellers
        if (req.user.role === 'seller') {
            const activeListing = await Properties.findOne({
                where: {
                    agent_id: ownerId,
                    status: { [Op.in]: ['available', 'under_offer'] }
                }
            });

            if (activeListing) {
                console.warn(`[property] ❌ Rejected: Seller #${ownerId} already has an active listing (#${activeListing.id})`);
                return res.status(400).json({
                    success: false,
                    message: 'Private sellers can only list 1 active property at a time. Once your current property completes sale or is withdrawn, you can list a new property.',
                    activeListingId: activeListing.id,
                });
            }
        }
        const {
            address,
            post_code,
            property_type_id,
            tenure_type_id,
            price,
            beds,
            baths,
            description,
            includes,
            existing_videos,
        } = req.body;

        let parsedIncludes = [];
        try {
            if (includes) {
                parsedIncludes = typeof includes === 'string' ? JSON.parse(includes) : includes;
            }
        } catch (e) {
            console.log("[property] Error parsing includes:", e.message);
        }

        const rawFiles = req.files || [];
        const imageFiles = Array.isArray(rawFiles)
            ? rawFiles.filter(f => f.fieldname === 'images' || (f.mimetype && f.mimetype.startsWith('image/')))
            : (rawFiles.images || []);

        console.log(`[property] Processing ${imageFiles.length} photo(s)...`);

        if (imageFiles.length > MAX_IMAGES) {
            console.warn(`[property] ❌ Rejected: Too many images (${imageFiles.length} > ${MAX_IMAGES})`);
            return res.status(400).json({
                success: false,
                message: `Maximum ${MAX_IMAGES} images allowed`,
            });
        }

        const imageUrls = [];
        const imageErrors = [];

        const path = require('path');
        const fs = require('fs');

        for (const file of imageFiles) {
            let uploadedUrl = null;

            // Attempt Cloudflare Images upload if configured
            if (isImagesConfigured()) {
                try {
                    console.log('[property] Uploading photo to Cloudflare Images...', file.originalname || 'photo');
                    const uploaded = await uploadImageFile(file);
                    uploadedUrl = uploaded?.url;
                    console.log('[property] ✓ Cloudflare photo uploaded:', uploadedUrl);
                } catch (error) {
                    console.warn('[property] ⚠️ Cloudflare Images upload failed:', error.message);
                }
            }

            // Fallback: Save photo locally to disk so listing creation never fails
            if (!uploadedUrl) {
                try {
                    const uploadDir = path.join(__dirname, '../../public/uploads');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    const ext = path.extname(file.originalname || file.name || '.jpg') || '.jpg';
                    const filename = `photo_${Date.now()}_${Math.round(Math.random() * 1E6)}${ext}`;
                    const filepath = path.join(uploadDir, filename);

                    let fileBuffer = file.buffer;
                    if (!fileBuffer && file.path && fs.existsSync(file.path)) {
                        fileBuffer = fs.readFileSync(file.path);
                    }

                    if (fileBuffer) {
                        fs.writeFileSync(filepath, fileBuffer);
                        const host = req.get('host') || '10.113.151.162:5000';
                        uploadedUrl = `${req.protocol || 'http'}://${host}/public/uploads/${filename}`;
                        console.log('[property] ✓ Photo saved locally as fallback:', uploadedUrl);
                    } else {
                        console.error('[property] Could not read photo data buffer:', file.originalname || file.name);
                    }
                } catch (fallbackErr) {
                    console.error('[property] ❌ Local photo save error:', fallbackErr.message);
                }
            }

            if (uploadedUrl) {
                imageUrls.push(uploadedUrl);
            }
        }

        // AI Image Verification via GPT-4o Vision if OPENAI_API_KEY is configured
        if (process.env.OPENAI_API_KEY && imageUrls.length > 0) {
            console.log(`[property] Running AI Vision check on ${imageUrls.length} image(s)...`);
            for (const imgUrl of imageUrls) {
                const scanResult = await checkImageSafety(imgUrl);
                if (scanResult.flagged) {
                    console.warn('[property] ❌ AI Moderation Flagged Image:', scanResult.reason);
                    return res.status(400).json({
                        success: false,
                        message: scanResult.reason || 'Only genuine property photos (rooms, exterior, garden, kitchen, bathroom, floorplans) are allowed.',
                    });
                }
            }
            console.log('[property] ✓ AI Vision scan passed for all photos');
        }

        // Videos → Cloudflare Stream
        let parsedVideos = [];
        try {
            if (existing_videos) {
                parsedVideos = typeof existing_videos === 'string' ? JSON.parse(existing_videos) : existing_videos;
            }
        } catch (e) {
            console.log('[property] Error parsing existing_videos:', e.message);
        }

        const videoErrors = [];
        const videoFiles = Array.isArray(rawFiles)
            ? rawFiles.filter(f => f.mimetype && f.mimetype.startsWith('video/'))
            : Object.keys(VIDEO_FIELD_MAP).map(fn => rawFiles[fn]?.[0]).filter(Boolean);

        console.log(`[property] Processing ${videoFiles.length} video(s)...`);

        for (const file of videoFiles) {
            const videoType = VIDEO_FIELD_MAP[file.fieldname] || 'property_reel';
            let uploadedVideo = null;

            if (isStreamConfigured()) {
                try {
                    console.log(`[property] Uploading ${videoType} to Cloudflare Stream...`, file.originalname || 'video.mp4');
                    uploadedVideo = await uploadVideoFile(file, videoType);
                    console.log(`[property] ✓ ${videoType} uploaded to Cloudflare Stream successfully`);
                } catch (error) {
                    console.warn(`[property] ⚠️ Cloudflare Stream video upload failed, saving locally:`, error.message);
                }
            }

            // Fallback: Save video locally to disk if Cloudflare Stream fails or is unconfigured
            if (!uploadedVideo) {
                try {
                    const uploadDir = path.join(__dirname, '../../public/uploads');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    const ext = path.extname(file.originalname || file.name || '.mp4') || '.mp4';
                    const filename = `video_${Date.now()}_${Math.round(Math.random() * 1E6)}${ext}`;
                    const filepath = path.join(uploadDir, filename);

                    let fileBuffer = file.buffer;
                    if (!fileBuffer && file.path && fs.existsSync(file.path)) {
                        fileBuffer = fs.readFileSync(file.path);
                    }

                    if (fileBuffer) {
                        fs.writeFileSync(filepath, fileBuffer);
                        const host = req.get('host') || '10.113.151.162:5000';
                        const localUrl = `${req.protocol || 'http'}://${host}/public/uploads/${filename}`;
                        uploadedVideo = {
                            type: videoType,
                            url: localUrl,
                            playbackUrl: localUrl,
                            streamId: `local_${Date.now()}`,
                        };
                        console.log('[property] ✓ Video saved locally as fallback:', localUrl);
                    } else {
                        console.error('[property] Could not read video data buffer:', file.originalname || file.name);
                    }
                } catch (fallbackErr) {
                    console.error('[property] ❌ Local video save error:', fallbackErr.message);
                }
            }

            if (uploadedVideo) {
                const withoutType = parsedVideos.filter((v) => v.type !== videoType);
                parsedVideos = [...withoutType, uploadedVideo];
            }
        }

        if (parsedVideos.length > MAX_VIDEOS) {
            return res.status(400).json({
                success: false,
                message: `Maximum ${MAX_VIDEOS} videos allowed`,
            });
        }

        const isAgent = req.user.role === 'agent';
        const initialModerationStatus = isAgent ? 'pending' : 'clean';

        console.log('[property] Saving property to database (moderation_status:', initialModerationStatus, ')');
        const newProperty = await Properties.create({
            address: address || 'Property Listing',
            post_code: post_code || 'SW1A 1AA',
            property_type_id: property_type_id || 1,
            tenure_type_id: tenure_type_id || 1,
            price: price || 0,
            beds: beds || 1,
            baths: baths || 1,
            description: description || '',
            includes: parsedIncludes,
            images: imageUrls,
            videos: parsedVideos,
            agent_id: ownerId,
            status: 'available',
            moderation_status: initialModerationStatus,
        });

        console.log('[property] 🎉 Property created successfully! ID:', newProperty.id);

        res.status(201).json({
            success: true,
            data: newProperty,
            imageErrors: imageErrors.length > 0 ? imageErrors : undefined,
            videoErrors: videoErrors.length > 0 ? videoErrors : undefined,
        });
    } catch (error) {
        console.error('[property] ❌ UNHANDLED EXCEPTION in POST /property:', error.stack || error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
});

// Edit property — accepts JSON (metadata + media URLs) or multipart (new photos)
router.put('/:id', PropertyOwnerMiddleware, optionalUploadProperty, async (req, res) => {
    try {
        const { id } = req.params;
        const ownerId = req.user.id;
        const property = await Properties.findByPk(id);

        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Property not found'
            });
        }

        if (property.agent_id !== ownerId) {
            return res.status(403).json({
                success: false,
                message: 'Not allowed to edit this property',
            });
        }

        const {
            address,
            post_code,
            property_type_id,
            tenure_type_id,
            price,
            beds,
            baths,
            description,
            includes,
            existing_images,
            existing_videos,
        } = req.body;

        const parsedIncludes = parseJsonField(includes, property.includes || []);
        const keptImageUrls = parseJsonField(
            existing_images,
            Array.isArray(property.images) ? [...property.images] : []
        );
        const keptVideos = parseJsonField(
            existing_videos,
            Array.isArray(property.videos) ? [...property.videos] : []
        );

        const imageFiles = req.files?.images || [];
        if (keptImageUrls.length + imageFiles.length > MAX_IMAGES) {
            return res.status(400).json({
                success: false,
                message: `Maximum ${MAX_IMAGES} images allowed`,
            });
        }

        const imageUrls = [...keptImageUrls];
        const imageErrors = [];

        for (const file of imageFiles) {
            try {
                const uploaded = await uploadImageFile(file);
                imageUrls.push(uploaded.url);
            } catch (error) {
                console.error('[property] Photo upload failed:', error.message);
                imageErrors.push({ message: error.message });
            }
        }

        const parsedVideos = [...keptVideos];
        const videoErrors = [];

        for (const [fieldName, videoType] of Object.entries(VIDEO_FIELD_MAP)) {
            const file = req.files?.[fieldName]?.[0];
            if (!file) continue;

            try {
                const uploaded = await uploadVideoFile(file, videoType);
                const withoutType = parsedVideos.filter((video) => video.type !== videoType);
                parsedVideos.length = 0;
                parsedVideos.push(...withoutType, uploaded);
            } catch (error) {
                console.error(`[property] ${videoType} upload failed:`, error.message);
                videoErrors.push({ type: videoType, message: error.message });
            }
        }

        if (parsedVideos.length > MAX_VIDEOS) {
            return res.status(400).json({
                success: false,
                message: `Maximum ${MAX_VIDEOS} videos allowed`,
            });
        }

        await property.update({
            address: address ?? property.address,
            post_code: post_code ?? property.post_code,
            property_type_id: property_type_id ?? property.property_type_id,
            tenure_type_id: tenure_type_id ?? property.tenure_type_id,
            price: price ?? property.price,
            beds: beds ?? property.beds,
            baths: baths ?? property.baths,
            description: description ?? property.description,
            includes: parsedIncludes,
            images: imageUrls,
            videos: parsedVideos,
        });

        res.status(200).json({
            success: true,
            data: property,
            imageErrors: imageErrors.length > 0 ? imageErrors : undefined,
            videoErrors: videoErrors.length > 0 ? videoErrors : undefined,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Delete property
router.delete('/:id', PropertyOwnerMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const ownerId = req.user.id;
        const property = await Properties.findByPk(id);

        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Property not found'
            });
        }

        if (property.agent_id !== ownerId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this property'
            });
        }

        await property.destroy();
        res.status(200).json({
            success: true,
            message: 'Property deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
