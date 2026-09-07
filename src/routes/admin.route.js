const express = require('express');
const auth = require('../middleware/auth');
const authController = require('../controllers/auth.Controller');
const locController = require('../controllers/locations.Controller');
const qrCode = require('../controllers/qrCodes.controller');
const graphController = require('../controllers/graph.controller');
const nodeController = require('../controllers/node.controller');

const router = express.Router();

router.post("/login", authController.login);
router.post("/signup", authController.signUp);
router.get("/admins", auth, authController.getAllAdmins);
router.get("/profile", auth, authController.getProfile);


router.post("/locations", auth, locController.createLocation);
router.get("/locations", auth, locController.getAllLocationsByAdminID);
router.get("/locations/:id", auth, locController.getLocationById);
router.put("/location/:id", auth, locController.updateLocation);
router.delete("/locations/:id", auth, locController.deleteLocation);


// ============ GRAPH ROUTES ============
router.post('/generate-graph', auth, graphController.generateGraph);
router.post('/create-hub', auth, graphController.createHubAndConnect);
router.post('/smart-connect', auth, graphController.smartConnect);



// ============ QR CODE ROUTES ============
router.get('/qr/generate/:locId', auth, qrCode.generateQR);
router.get('/qr/generate-all', auth, qrCode.generateAllQRs);
router.get('/qr/data/:locId', auth, qrCode.getQRData);
router.get('/qr/regenerate/:locId', auth, qrCode.regenerateQR); 


// ============ NODE ROUTES ============
router.get('/nodes', auth, nodeController.getAllNodes);
router.get('/edges', auth, nodeController.getAllEdges);
router.post('/nodes', auth, nodeController.createNode);
router.post('/nodes/connect', auth, nodeController.connectNodes);

module.exports = router;