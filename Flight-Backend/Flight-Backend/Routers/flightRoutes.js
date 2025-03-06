import express from 'express';
import {  bookFlight,      cancelBooking,      getBookingHistory,      getLocationSuggestions,  searchFlights } from '../Controllers/flightController.js';
import { authMiddleware } from '../Middleware/userMiddleware.js';

const router = express.Router();

router.get('/search',authMiddleware, searchFlights);
router.post('/book',authMiddleware, bookFlight);
router.get('/locations', getLocationSuggestions);
router.get('/history', authMiddleware ,getBookingHistory);
router.put("/cancel/:bookingId", cancelBooking);

export default router;