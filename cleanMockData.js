require('dotenv').config();
const { sequelize } = require('./src/lib/db');
const { Users, Properties, Offers, Reports, UserBlocks, Saves, PropertyViews } = require('./src/models');
const { Op } = require('sequelize');

async function cleanMockData() {
  console.log('[cleanup] Starting database maintenance and mock data purge...');
  try {
    await sequelize.authenticate();

    const allowedEmails = ['umar@gmail.com', 'imran@gmail.com', 'imran@keyoh.co.uk', 'umar@keyoh.co.uk'];

    const mockUsers = await Users.findAll({
      where: {
        email: {
          [Op.notIn]: allowedEmails,
        },
        name: {
          [Op.notRegexp]: 'umar|imran',
        },
      },
    });

    const mockUserIds = mockUsers.map((u) => u.id);
    console.log(`[cleanup] Found ${mockUserIds.length} mock user record(s) to remove.`);

    if (mockUserIds.length > 0) {
      await Offers.destroy({ where: { [Op.or]: [{ buyer_id: mockUserIds }, { seller_id: mockUserIds }] } });
      await Reports.destroy({ where: { reporter_id: mockUserIds } });
      await UserBlocks.destroy({ where: { [Op.or]: [{ blocker_id: mockUserIds }, { blocked_user_id: mockUserIds }] } });
      await Saves.destroy({ where: { user_id: mockUserIds } });
      await PropertyViews.destroy({ where: { user_id: mockUserIds } });

      await Properties.destroy({
        where: {
          [Op.or]: [
            { agent_id: mockUserIds },
            { address: { [Op.like]: '%tets%' } },
            { address: { [Op.like]: '%14 Maple Close%' } },
            { address: { [Op.like]: '%22 Park Terrace%' } },
            { address: { [Op.like]: '%8 Riverside Way%' } },
            { address: { [Op.like]: '%45 St Johns Boulevard%' } },
          ],
        },
      });

      const validProps = await Properties.findAll({ attributes: ['id'] });
      const validPropIds = validProps.map(p => p.id);
      if (validPropIds.length > 0) {
        await PropertyViews.destroy({ where: { property_id: { [Op.notIn]: validPropIds } } });
        await Saves.destroy({ where: { property_id: { [Op.notIn]: validPropIds } } });
      } else {
        await PropertyViews.destroy({ truncate: true });
        await Saves.destroy({ truncate: true });
      }

      await Users.destroy({ where: { id: mockUserIds } });
      console.log('[cleanup] Mock accounts and associated properties purged.');
    } else {
      console.log('[cleanup] No mock data found. Database is clean.');
    }

    process.exit(0);
  } catch (err) {
    console.error('[cleanup] Purge operation failed:', err.message);
    process.exit(1);
  }
}

cleanMockData();
