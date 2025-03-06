import express from "express";
import {  createCheckoutSession, handlePaymentSuccess } from "../Controllers/paymentController.js";

const router = express.Router();

// Route to create a PayPal payment order
router.post("/create", createCheckoutSession);

// Route to capture PayPal payment after approval
router.post("/confirm", handlePaymentSuccess);

export default router;