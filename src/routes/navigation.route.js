const express = require('express');
const { validateQR} = require('../controllers/qrCodes.controller')
const { getPublicLocations, getAllLocations, getAllLocationsByAdminID } = require('../controllers/locations.Controller');
const {getTextDirections}= require('../controllers/navigation.controller');
const {shortestPath,getShortestPathKNN} = require('../controllers/shortestPath.controller');
const {getShortestPathAStar} = require('../controllers/shortestPathAStar.controller')
const router = express.Router();

// ============ PUBLIC ROUTES ============

// Get all locations (for dropdown)
router.get('/locations', getAllLocationsByAdminID);
router.get('/all-locations', getAllLocations);
router.get('/public-location', getPublicLocations)

// Public: Get text directions (for testing)
router.get('/directions', getTextDirections);

// router.post('/shortest-path', shortestPath);
router.post('/shortest-path', getShortestPathKNN);
router.post('/shortest-path-astar', getShortestPathAStar); 

router.post('/validate-qr', validateQR);


module.exports = router;