const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
router.get('/:table/:id/:field', mediaController.getMedia);
module.exports = router;
