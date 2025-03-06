import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  stripeSessionId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true, unique: true },
  bookingId: { type: String, required: true },
  amount: { type: Number, required: true },
  
  status: { type: String, enum: ["Pending", "Completed", "Failed"], default: "Pending" },
  passengerDetails: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now ,index: { expires: "1m" }},
});

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
