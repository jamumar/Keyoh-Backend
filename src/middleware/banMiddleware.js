const Users = require('../models/users');

const BanMiddleware = async (req, res, next) => {
    if (!req.user || !req.user.id) {
        return next();
    }

    try {
        const user = await Users.findByPk(req.user.id, { attributes: ['id', 'banned_at', 'ban_reason'] });
        if (user && user.banned_at) {
            return res.status(403).json({
                success: false,
                message: `Account suspended: ${user.ban_reason || 'Violation of KEYOH community terms.'}`,
                banned_at: user.banned_at,
            });
        }
        next();
    } catch (err) {
        next(err);
    }
};

module.exports = BanMiddleware;
