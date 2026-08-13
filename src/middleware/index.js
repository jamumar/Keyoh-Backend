const jwt = require("jsonwebtoken");
require('dotenv').config();

const SELLER_SECRET = process.env.SELLER_TOKEN_STRING || process.env.SELLER_TOKEM_STRING;

const CustomerMiddleware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({
        message: "Token not found",
        success: false,
    });

    jwt.verify(token, process.env.USER_TOKEN_STRING, (err, user) => {
        if (err || user?.role !== 'user') return res.status(401).json({
            message: "Unauthorized token",
            success: false,
        });
        req.user = user;
        next();
    });
};

const AgentMiddlware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({
        message: "Token not found",
        success: false,
    });

    jwt.verify(token, process.env.AGENT_TOKEN_STRING, (err, user) => {
        if (err || user?.role !== 'agent') return res.status(401).json({
            message: "Unauthorized token",
            success: false,
        });
        req.user = user;
        next();
    });
};

const SellerAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({
        message: "Token not found",
        success: false,
    });

    jwt.verify(token, SELLER_SECRET, (err, user) => {
        if (err || user?.role !== 'seller') return res.status(401).json({
            message: "Unauthorized token",
            success: false,
        });
        req.user = user;
        next();
    });
};

const SellerMiddlware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({
        message: "Token not found",
        success: false,
    });

    jwt.verify(token, SELLER_SECRET, async (err, user) => {
        if (!err && user?.role === 'seller') {
            req.user = user;
            return next();
        }

        if (process.env.ADMIN_TOKEN_STRING) {
            jwt.verify(token, process.env.ADMIN_TOKEN_STRING, (err2, admin) => {
                if (!err2 && admin?.role === 'admin') {
                    req.user = { ...admin, status: 'paid', isAdmin: true };
                    return next();
                }
                return res.status(401).json({
                    message: "Unauthorized token",
                    success: false,
                });
            });
        } else {
            return res.status(401).json({
                message: "Unauthorized token",
                success: false,
            });
        }
    });
};

const AdminMiddlware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({
        message: "Token not found",
        success: false,
    });

    jwt.verify(token, process.env.ADMIN_TOKEN_STRING, async (err, user) => {
        if (!err && user?.role === 'admin') {
            req.user = user;
            return next();
        }

        return res.status(401).json({
            message: "Unauthorized token",
            success: false,
        });
    });
};

const ChatAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Token not found",
            success: false,
        });
    }

    const tokenConfigs = [
        { secret: process.env.USER_TOKEN_STRING, roles: ['user'] },
        { secret: process.env.AGENT_TOKEN_STRING, roles: ['agent'] },
        { secret: SELLER_SECRET, roles: ['seller'] },
    ];

    for (const { secret, roles } of tokenConfigs) {
        if (!secret) continue;

        try {
            const user = jwt.verify(token, secret);
            if (roles.includes(user?.role)) {
                req.user = user;
                return next();
            }
        } catch (err) {
            // Try next token type
        }
    }

    return res.status(401).json({
        message: "Unauthorized token",
        success: false,
    });
};

const PropertyOwnerMiddleware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Token not found",
            success: false,
        });
    }

    const tokenConfigs = [
        SELLER_SECRET,
        process.env.AGENT_TOKEN_STRING,
        process.env.USER_TOKEN_STRING,
        process.env.ADMIN_TOKEN_STRING,
    ];

    for (const secret of tokenConfigs) {
        if (!secret) continue;

        try {
            const user = jwt.verify(token, secret);
            if (user && user.id) {
                req.user = user;
                return next();
            }
        } catch (err) {
            // Try next token type
        }
    }

    return res.status(401).json({
        message: "Unauthorized token",
        success: false,
    });
};

module.exports = {
    CustomerMiddleware,
    AgentMiddlware,
    SellerAuthMiddleware,
    SellerMiddlware,
    AdminMiddlware,
    ChatAuthMiddleware,
    PropertyOwnerMiddleware,
};
