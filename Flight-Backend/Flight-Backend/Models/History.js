import mongoose from "mongoose";

const PassengerSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  gender: { type: String, required: true },
  countryCode: { type: String },
  mobileNo: { type: String, required: true },
  email: { type: String, required: true },
  requiresWheelchair: { type: Boolean, default: false },
  seat: { type: String, default: "Economy" },
  meal: { type: String, default: "Standard" },
});

const FlightSchema = new mongoose.Schema({
  departureCity: { type: String, required: true },
  arrivalCity: { type: String, required: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  price: { type: String, required: true },
  airlineName: { type: String, required: true },
  stopType: { type: String },
  duration: { type: String },
});

const BookingHistorySchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true },
  flight: { type: FlightSchema, required: true },
  passengerDetails: { type: [PassengerSchema], required: true },
  totalPrice: { type: String, required: true },
  bookingDate: { type: Date, default: Date.now },
});

export default mongoose.model("BookingHistory", BookingHistorySchema);