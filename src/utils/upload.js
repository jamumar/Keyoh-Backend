const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter (optional, e.g., only images)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images and videos are allowed!'), false);
    }
};

const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

const uploadImages = multer({
    storage: storage,
    fileFilter: imageFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB per image
    }
});

const propertyFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
        return;
    }
    cb(new Error(`Invalid file type for field ${file.fieldname}`), false);
};

const uploadProperty = multer({
    storage: multer.memoryStorage(),
    fileFilter: propertyFileFilter,
    limits: {
        fileSize: 200 * 1024 * 1024,
    },
}).any();

module.exports = upload;
module.exports.uploadImages = uploadImages;
module.exports.uploadProperty = uploadProperty;
