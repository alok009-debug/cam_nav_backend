const express = require('express');
const auth = require('../middleware/auth');
const authController = require('../controllers/auth.Controller');
const locController = require('../controllers/locations.Controller');
const qrCode = require('../controllers/qrCodes.controller');

const router = express();

router.post("/login", authController.login);
router.post("/signup", authController.signUp);
router.get("/admins", auth, authController.getAllAdmins);
router.get("/profile", auth, authController.getProfile);


router.post("/locations", auth, locController.createLocation);
router.get("/locations", auth, locController.getAllLocations);
router.get("/locations/:id", auth, locController.getLocationById);
router.put("/location/:id", auth, locController.updateLocation);
router.delete("/locations/:id", auth, locController.deleteLocation);



// ============ QR CODE ROUTES ============
router.get('/qr/generate/:locId', auth, qrCode.generateQR);
router.get('/qr/generate-all', auth, qrCode.generateAllQRs);
router.get('/qr/data/:locId', auth, qrCode.getQRData);

module.exports = router;