import mongoose from 'mongoose';

const passengerSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  gender: { type: String, required: true },
  countryCode: { type: String, required: true },
  mobileNo: { type: String, required: true },
  email: { type: String, required: true },
  requiresWheelchair: { type: Boolean, default: false },
});

const Passenger = mongoose.model('Passenger', passengerSchema);
export default Passenger;