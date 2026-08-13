const { Op } = require('sequelize');
const { sequelize } = require('../lib/db');

// PRIME > TRENDING > SEEN > unboosted (seller purchase tiers)
const BOOST_PRIORITY_ORDER = sequelize.literal(`
    CASE \`boost\`
        WHEN 'PRIME' THEN 1
        WHEN 'TRENDING' THEN 2
        WHEN 'SEEN' THEN 3
        ELSE 4
    END
`);

const BUDGET_RANGES = {
    'Under £150k': { [Op.lt]: 150000 },
    '£150k–£250k': { [Op.between]: [150000, 250000] },
    '£250k–£350k': { [Op.between]: [250000, 350000] },
    '£350k–£500k': { [Op.between]: [350000, 500000] },
    '£500k+': { [Op.gte]: 500000 },
};

function buildLocationSearchClause(query = {}) {
    const raw = String(
        query.search || query.q || query.location || query.postcode || query.area || '',
    ).trim();

    if (!raw) {
        return null;
    }

    const like = `%${raw}%`;
    const compact = raw.replace(/\s+/g, '');
    const clauses = [
        { address: { [Op.like]: like } },
        { post_code: { [Op.like]: like } },
    ];

    if (compact && compact.toLowerCase() !== raw.toLowerCase()) {
        clauses.push({ post_code: { [Op.like]: `%${compact}%` } });
    }

    return { [Op.or]: clauses };
}

function buildPropertyWhere(query = {}) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const where = {
        hidden_at: null,
        deleted_at: null,
        [Op.or]: [
            { status: { [Op.in]: ['available', 'under_offer'] } },
            {
                status: 'sold',
                [Op.or]: [
                    { sold_at: { [Op.gte]: thirtyDaysAgo } },
                    { updatedAt: { [Op.gte]: thirtyDaysAgo } },
                ],
            },
        ],
    };

    const { budget, bedrooms } = query;

    if (budget && BUDGET_RANGES[budget]) {
        where.price = BUDGET_RANGES[budget];
    }

    if (bedrooms) {
        if (bedrooms === '5+') {
            where.beds = { [Op.gte]: 5 };
        } else {
            const bedCount = parseInt(bedrooms, 10);
            if (!Number.isNaN(bedCount)) {
                where.beds = bedCount;
            }
        }
    }

    const locationClause = buildLocationSearchClause(query);
    if (locationClause) {
        Object.assign(where, locationClause);
    }

    return where;
}

function buildPropertyOrder() {
    return [
        [BOOST_PRIORITY_ORDER, 'ASC'],
        ['createdAt', 'DESC'],
    ];
}

function buildPropertyQueryOptions(query = {}) {
    const limit = parseInt(query.limit, 10);

    return {
        where: buildPropertyWhere(query),
        order: buildPropertyOrder(),
        limit: Number.isNaN(limit) ? undefined : limit,
    };
}

module.exports = {
    buildPropertyWhere,
    buildPropertyOrder,
    buildPropertyQueryOptions,
};
