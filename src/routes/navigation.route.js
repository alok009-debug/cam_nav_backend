const express = require('express');
const { validateQR} = require('../controllers/qrCodes.controller')
const { getPublicLocations } = require('../controllers/locations.Controller');
const {getTextDirections}= require('../controllers/navigation.controller');
const {shortestPath} = require('../controllers/shortestPath.controller')
const router = express.Router();

// ============ PUBLIC ROUTES ============

// Get all locations (for dropdown)
router.get('/locations', getPublicLocations);

// Public: Get text directions (for testing)
router.get('/directions', getTextDirections);

router.post('/shortest-path', shortestPath);

// ✅ Validate QR code - This is what your frontend calls
router.post('/validate-qr', validateQR);

// Get path between two locations
router.get('/path', async (req, res) => {
  try {
    const { startId, endId } = req.query;
    
    if (!startId || !endId) {
      return res.status(400).json({ error: 'Start and end location IDs are required' });
    }

    const pool = require('../db/sql.db');
    
    const [startLoc] = await pool.query(
      'SELECT latitude, longitude FROM locations WHERE locId = ?',
      [startId]
    );
    const [endLoc] = await pool.query(
      'SELECT latitude, longitude FROM locations WHERE locId = ?',
      [endId]
    );

    if (startLoc.length === 0 || endLoc.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({
      start: startLoc[0],
      end: endLoc[0],
      message: 'Path found!'
    });

  } catch (error) {
    console.error('Error finding path:', error);
    res.status(500).json({ error: 'Failed to find path' });
  }
});

module.exports = router;