const express = require('express');
const router = express.Router();
const { AgentMiddlware } = require('../middleware');
const { getDashboardStats } = require('../services/agentStatsService');
const {
    getPendingHandoversForAgent,
    getAcceptedHandoversForAgent,
    acceptHandover,
    declineHandover,
} = require('../services/handoverService');

router.get('/dashboard-stats', AgentMiddlware, async (req, res) => {
    try {
        const data = await getDashboardStats(req.user.id, req.user.email);

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

router.get('/handovers', AgentMiddlware, async (req, res) => {
    try {
        const handovers = await getPendingHandoversForAgent(req.user.email);

        res.status(200).json({
            success: true,
            data: { handovers },
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

router.get('/handovers/accepted', AgentMiddlware, async (req, res) => {
    try {
        const handovers = await getAcceptedHandoversForAgent(req.user.id);

        res.status(200).json({
            success: true,
            data: { handovers },
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

router.post('/handover/:id/accept', AgentMiddlware, async (req, res) => {
    try {
        const data = await acceptHandover({
            handoverId: req.params.id,
            agentId: req.user.id,
            agentEmail: req.user.email,
        });

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

router.post('/handover/:id/decline', AgentMiddlware, async (req, res) => {
    try {
        const handover = await declineHandover({
            handoverId: req.params.id,
            agentEmail: req.user.email,
        });

        res.status(200).json({
            success: true,
            data: { handover },
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
});

module.exports = router;
