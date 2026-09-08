const express = require('express');
const auth = require('../middleware/auth');
const authController = require('../controllers/auth.Controller');
const locController = require('../controllers/locations.Controller');
const qrCode = require('../controllers/qrCodes.controller');

const router = express.Router();

router.post("/login", authController.login);
router.post("/signup", authController.signUp);
router.get("/admins", auth, authController.getAllAdmins);
router.get("/profile", auth, authController.getProfile);


// Locations (Auto creates nodes and edges)
router.post("/locations", auth, locController.createLocation);
router.get("/locations", auth, locController.getAllLocationsByAdminID);
router.get("/locations/:id", auth, locController.getLocationById);
router.delete("/locations/:id",auth, locController.deleteLocation);
router.put("/location/:id", auth, locController.updateLocation);

// Nodes & Edges
router.get("/nodes", auth, locController.getAllNodes);
router.get("/edges", auth, locController.getAllEdges);

// Manual fix: Connect all existing nodes
router.post("/connect-all", auth, locController.connectAllNodes);
router.post("/create-missing-nodes", auth, locController.createMissingNodes);

// ============ QR CODE ROUTES ============
router.get('/qr/generate/:locId', auth, qrCode.generateQR);
router.get('/qr/generate-all', auth, qrCode.generateAllQRs);
router.get('/qr/data/:locId', auth, qrCode.getQRData);
router.get('/qr/regenerate/:locId', auth, qrCode.regenerateQR); 


module.exports = router;