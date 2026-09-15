const express = require('express');
const auth = require('../middleware/auth');
const authController = require('../controllers/auth.Controller');
const locController = require('../controllers/locations.Controller');
const shortestPath = require('../controllers/shortestPath.controller');
const smartConnect = require('../controllers/graph.controller');
const qrCode = require('../controllers/qrCodes.controller');

const router = express.Router();

router.post("/login", authController.login);
router.post("/signup", authController.signUp);
router.get("/admins", auth, authController.getAllAdmins);
router.get("/profile", auth, authController.getProfile);

// Locations 
router.post("/locations", auth, locController.createLocation);
router.get("/locations", auth, locController.getAllLocationsByAdminID);
router.get("/locations/:id", auth, locController.getLocationById);
router.delete("/locations/:id",auth, locController.deleteLocation);
router.put("/location/:id", auth, locController.updateLocation);

// Nodes & Edges
router.get("/nodes", auth, locController.getAllNodes);
router.get("/edges", auth, locController.getAllEdges);

// Connect all existing nodes
router.post("/connect-all", auth, locController.connectAllNodes);
router.post("/create-missing-nodes", auth, locController.createMissingNodes);
router.post("/smartconnect",smartConnect.smartConnect);

// ============ QR CODE ROUTES ============
router.get('/qr/generate/:locId', auth, qrCode.generateQR);
router.get('/qr/generate-all', auth, qrCode.generateAllQRs);
router.get('/qr/data/:locId', auth, qrCode.getQRData);
router.get('/qr/regenerate/:locId', auth, qrCode.regenerateQR); 

// ============Finding Shortest path============
router.post('/shortest-path', shortestPath.getShortestPathKNN);

module.exports = router;