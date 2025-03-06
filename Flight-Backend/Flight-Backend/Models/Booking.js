import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Link to the user
  flight: { type: mongoose.Schema.Types.ObjectId, ref: 'Flight', required: true },
  passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Passenger' }], // Reference Passenger collection
  status: { type: String, default: 'Confirmed' },
  bookingId: { type: String, required: true },
  airlineName: { type: String, required: true },
  departureCity: { type: String, required: true },
  arrivalCity: { type: String, required: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  price: { type: Number, required: true },
  duration: { type: String, required: true },
  stopType: { type: String, required: true },
});

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;