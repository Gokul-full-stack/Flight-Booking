import axios from 'axios';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import Flight from '../Models/Flight.js';
import nodemailer from 'nodemailer';
import Passenger from '../Models/PassengerDetails.js';
import Booking from '../Models/Booking.js';
import PDFDocument from "pdfkit";
import fs from "fs";

dotenv.config();

let cachedToken = null;
let tokenExpiry = null;
const BUFFER_TIME = 30000;
let isFetchingToken = false;

export const getAccessToken = async () => {
  if (cachedToken && tokenExpiry > Date.now() + BUFFER_TIME) {
    return cachedToken; // Use cached token if still valid
  }

  if (isFetchingToken) {
    while (isFetchingToken) {
      await delay(500); // Polling to wait for token fetch completion
    }
    return cachedToken; // Use the newly fetched token
  }

  try {
    isFetchingToken = true; // Mark fetching as in progress
    console.log('Fetching new access token...');

    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      'grant_type=client_credentials',
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: process.env.AMADEUS_API_KEY,
          password: process.env.AMADEUS_API_SECRET,
        },
      }
    );

    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + response.data.expires_in * 1000;

    console.log(`New token fetched. Expires at: ${new Date(tokenExpiry).toLocaleString()}`);
    return cachedToken;
  } catch (error) {
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'], 10) || 1;
      console.warn(`Rate limit exceeded. Retrying after ${retryAfter} seconds...`);
      await delay(retryAfter * 1000);
      return getAccessToken(); // Retry after delay
    }
    console.error('Error fetching access token:', error.response?.data || error.message);
    throw new Error('Failed to fetch access token');
  } finally {
    isFetchingToken = false; // Reset fetching flag
  }
};

// Helper function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const airlineCache = {};

const MAX_RETRY_ATTEMPTS = 3;

// Fetch multiple airline names in one request
const getAirlineNames = async (carrierCodes, token, attempt = 1) => {
  const uncachedCodes = carrierCodes.filter((code) => !airlineCache[code]);

  if (uncachedCodes.length === 0) {
    return carrierCodes.reduce((acc, code) => {
      acc[code] = airlineCache[code];
      return acc;
    }, {});
  }

  try {
    const response = await axios.get(
      'https://test.api.amadeus.com/v1/reference-data/airlines',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { airlineCodes: uncachedCodes.join(',') },
      }
    );

    response.data.data.forEach((airline) => {
      airlineCache[airline.iataCode] = airline.commonName || airline.businessName;
    });

    return carrierCodes.reduce((acc, code) => {
      acc[code] = airlineCache[code] || code;
      return acc;
    }, {});
  } catch (error) {
    if (error.response?.status === 429 && attempt <= MAX_RETRY_ATTEMPTS) {
      console.warn(`Rate limit exceeded, retrying in ${attempt} second(s)...`);
      const retryAfter = parseInt(error.response.headers['retry-after'], 10) || attempt;
      await delay(retryAfter * 1000);
      return getAirlineNames(carrierCodes, token, attempt + 1);
    }

    console.error('Error fetching airline names:', error.message);
    return carrierCodes.reduce((acc, code) => {
      acc[code] = code;
      return acc;
    }, {});
  }
};

// Format flight duration (e.g., PT10H30M -> 10h 30m)
const formatDuration = (duration) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?/);
  const hours = match[1] ? match[1].replace('H', 'h ') : '';
  const minutes = match[2] ? match[2].replace('M', 'm') : '';
  return `${hours}${minutes}`.trim();
};

export const searchFlights = async (req, res) => {
  const { origin, destination, departureDate, passengers } = req.query;

  if (!origin || !destination || !departureDate || !passengers) {
    return res.status(400).json({
      error: "All parameters (origin, destination, departureDate, passengers) are required.",
    });
  }

  try {
    const token = await getAccessToken();
    const flightResponse = await axios.get(
      'https://test.api.amadeus.com/v2/shopping/flight-offers',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          originLocationCode: origin,
          destinationLocationCode: destination,
          departureDate,
          adults: passengers,
          currencyCode: 'INR',
        },
      }
    );

    const flightData = flightResponse.data.data;

    const uniqueAirlineCodes = [...new Set(flightData.map((flight) => flight.validatingAirlineCodes[0]))];
    const airlineMap = await getAirlineNames(uniqueAirlineCodes, token);

    const flights = flightData.map((flight) => {
      const segments = flight.itineraries[0].segments;
      const totalStops = segments.length - 1;
      const stopType = totalStops === 0 ? "Non-stop" : `${totalStops} stop(s)`;
      const duration = formatDuration(flight.itineraries[0].duration);

      return {
        departureCity: segments[0].departure.iataCode,
        arrivalCity: segments[segments.length - 1].arrival.iataCode,
        departureTime: segments[0].departure.at,
        arrivalTime: segments[segments.length - 1].arrival.at,
        price: flight.price.total,
        airlineName: airlineMap[flight.validatingAirlineCodes[0]],
        stopType,
        duration,
      };
    });

    res.status(200).json({
      message: `Flights available from ${origin} to ${destination} on ${departureDate}`,
      flights,
    });
  } catch (error) {
    console.error('Error fetching flight data:', error.message);
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }

};



//   try {
//     const { flight, passengerDetails } = req.body;

//     if (!flight || !Array.isArray(passengerDetails)) {
//       return res.status(400).json({ error: "Invalid booking payload" });
//     }

//     const authHeader = req.header('Authorization');
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       return res.status(401).json({ error: 'Authorization token is required' });
//     }

//     // const token = authHeader.replace('Bearer ', '');
//     const token = authHeader.split(" ")[1];
//     let user;
//     try {
//       user = jwt.verify(token, process.env.JWT_SECRET);
//       console.log("Decoded User from Token:", user);
//       if (!user.name || !user.email) {
//         return res.status(400).json({ error: "User details (name or email) missing in token." });
//       }
//     } catch (error) {
//       return res.status(401).json({ error: 'Invalid or expired token' });
//     }
//     console.log("User:", user);
//     console.log("Received Flight:", flight);

//     // Check if the flight already exists or save a new one
//     let storedFlight = await Flight.findOne({
//       airlineName: flight.airlineName,
//       departureCity: flight.departureCity,
//       arrivalCity: flight.arrivalCity,
//       departureTime: new Date(flight.departureTime),
//       arrivalTime: new Date(flight.arrivalTime),
//     });

//     if (!storedFlight) {
//       storedFlight = new Flight({
//         airlineName: flight.airlineName,
//         departureCity: flight.departureCity,
//         arrivalCity: flight.arrivalCity,
//         departureTime: new Date(flight.departureTime),
//         arrivalTime: new Date(flight.arrivalTime),
//         price: parseFloat(flight.price),
//         duration: flight.duration,
//         stopType: flight.stopType,
//       });
//       await storedFlight.save();
//     }

//     const passengerIds = [];
//     for (const passenger of passengerDetails) {
//       const newPassenger = new Passenger(passenger);
//       const savedPassenger = await newPassenger.save();
//       passengerIds.push(savedPassenger._id);
//     }
//     // Create Booking
//     const newBooking = new Booking({
//       flight: storedFlight._id,
//       passengers: passengerIds,
//       bookingId: `BOOKING-${Math.floor(Math.random() * 1000000)}`,
//     });

//     await newBooking.save();

//     // Create PDF with Passenger Details
//     const pdfPath = `./booking_${newBooking._id}.pdf`;
//     const doc = new PDFDocument();
//     doc.pipe(fs.createWriteStream(pdfPath));

//     doc.fontSize(20).text("Flight Booking Details", { align: "center" });
//     doc.moveDown();
//     doc.fontSize(14).text(`Booking ID: ${newBooking.bookingId}`);
//     doc.text(`Airline: ${flight.airlineName}`);
//     doc.text(`Route: ${flight.departureCity} to ${flight.arrivalCity}`);
//     doc.text(`Departure: ${new Date(flight.departureTime).toLocaleString()}`);
//     doc.text(`Arrival: ${new Date(flight.arrivalTime).toLocaleString()}`);
//     doc.text(`Price: ₹ ${flight.price}`);
//     doc.text(`Stops: ${flight.stopType}`);
//     doc.text(`Duration: ${flight.duration}`);
//     doc.moveDown();

//     doc.fontSize(18).text("Passenger Details:");
//     passengerDetails.forEach((passenger, index) => {
//       doc.moveDown();
//       doc.fontSize(14).text(`Passenger ${index + 1}:`);
//       doc.text(`Name: ${passenger.firstName} ${passenger.lastName}`);
//       doc.text(`Gender: ${passenger.gender}`);
//       doc.text(`Mobile: ${passenger.mobileNo}`);
//       doc.text(`Email: ${passenger.email}`);
//       if (passenger.requiresWheelchair) {
//         doc.text("Special Request: Wheelchair Required");
//       }
//     });

//     doc.end();

//     // Send Confirmation Email
//     const transporter = nodemailer.createTransport({
//       service: 'Gmail',
//       auth: {
//         user: process.env.PASS_MAIL,
//         pass: process.env.PASS_KEY,
//       },
//     });

   

//     const mailOptions = {
//       from: process.env.PASS_MAIL,
//       to: user.email,
//       // to: 'snehamathes2000@gmail.com',
//       subject: 'Flight Booking Confirmation',
//       text: `Dear ${user.name},\n\nYour flight booking is confirmed.\n\nBooking ID: ${newBooking.bookingId}\nStatus: Confirmed\n\nThank you for booking with us!\n\nBest Regards,\nFlight Booking Team`,
//       attachments: [
//         {
//           filename: `booking_${newBooking._id}.pdf`,
//           path: pdfPath,
//         },
//       ],
//     };

//     await transporter.sendMail(mailOptions);

//     fs.unlink(pdfPath, (err) => {
//       if (err) console.error("Failed to delete PDF:", err);
//     });
//     res.status(200).json({
//       message: 'Booking confirmed and email sent',
//       bookingId: newBooking._id,
//     });

    
//   } catch (error) {
//     console.error("Email sending failed:", error.message);
//   res.status(500).json({ error: "Failed to send confirmation email" });
//   }
// };
export const bookFlight = async (req, res) => {
  try {
    const { flight, passengerDetails } = req.body;

    if (!flight || !Array.isArray(passengerDetails)) {
      return res.status(400).json({ error: "Invalid booking payload" });
    }

    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const token = authHeader.split(" ")[1];
    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
      if (!user.name || !user.email) {
        return res.status(400).json({ error: "User details missing in token." });
      }
    } catch (error) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Check if flight exists or save a new one
    let storedFlight = await Flight.findOne({
      airlineName: flight.airlineName,
      departureCity: flight.departureCity,
      arrivalCity: flight.arrivalCity,
      departureTime: new Date(flight.departureTime),
      arrivalTime: new Date(flight.arrivalTime),
    });

    if (!storedFlight) {
      storedFlight = new Flight({
        airlineName: flight.airlineName,
        departureCity: flight.departureCity,
        arrivalCity: flight.arrivalCity,
        departureTime: new Date(flight.departureTime),
        arrivalTime: new Date(flight.arrivalTime),
        price: parseFloat(flight.price),
        duration: flight.duration,
        stopType: flight.stopType,
      });
      await storedFlight.save();
    }

    // Save passengers
    const passengerIds = [];
    for (const passenger of passengerDetails) {
      const newPassenger = new Passenger(passenger);
      const savedPassenger = await newPassenger.save();
      passengerIds.push(savedPassenger._id);
    }

    // Create booking
    const newBooking = new Booking({
      user: user._id,
      flight: storedFlight._id,
      passengers: passengerIds,
      bookingId: `BOOKING-${Math.floor(Math.random() * 1000000)}`,
      airlineName: flight.airlineName,
        departureCity: flight.departureCity,
        arrivalCity: flight.arrivalCity,
        departureTime: new Date(flight.departureTime),
        arrivalTime: new Date(flight.arrivalTime),
        price: parseFloat(flight.price),
        duration: flight.duration,
        stopType: flight.stopType,
      status: "Confirmed",
    });

    await newBooking.save();

    // Generate PDF
    const pdfPath = `./booking_${newBooking._id}.pdf`;
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(20).text("Flight Booking Details", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Booking ID: ${newBooking.bookingId}`);
    doc.text(`Airline: ${flight.airlineName}`);
    doc.text(`Route: ${flight.departureCity} to ${flight.arrivalCity}`);
    doc.text(`Departure: ${new Date(flight.departureTime).toLocaleString()}`);
    doc.text(`Arrival: ${new Date(flight.arrivalTime).toLocaleString()}`);
    doc.text(`Price:  ${flight.price}`);
    doc.text(`Stops: ${flight.stopType}`);
    doc.text(`Duration: ${flight.duration}`);
    doc.moveDown();

    doc.fontSize(18).text("Passenger Details:");
    passengerDetails.forEach((passenger, index) => {
      doc.moveDown();
      doc.fontSize(14).text(`Passenger ${index + 1}:`);
      doc.text(`Name: ${passenger.firstName} ${passenger.lastName}`);
      doc.text(`Gender: ${passenger.gender}`);
      doc.text(`Mobile: ${passenger.mobileNo}`);
      doc.text(`Email: ${passenger.email}`);
      if (passenger.requiresWheelchair) {
        doc.text("Special Request: Wheelchair Required");
      }
    });

    doc.end();

    // Send Confirmation Email
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.PASS_MAIL,
        pass: process.env.PASS_KEY,
      },
    });

    const mailOptions = {
      from: process.env.PASS_MAIL,
      to: user.email,
      subject: "Flight Booking Confirmation",
      text: `Dear ${user.name},\n\nYour flight booking is confirmed.\n\nBooking ID: ${newBooking.bookingId}\nStatus: Confirmed\n\nThank you for booking with us!\n\nBest Regards,\nFlight Booking Team`,
      attachments: [
        {
          filename: `booking_${newBooking._id}.pdf`,
          path: pdfPath,
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    // Delete the PDF file after sending the email
    await fs.promises.unlink(pdfPath);

    // Respond with booking details
    res.status(200).json({
      message: "Booking confirmed and email sent",
      bookingId: newBooking.bookingId, // Use the correct booking ID here
      status: newBooking.status,
    });
  } catch (error) {
    console.error("Booking Error:", error.message);
    res.status(500).json({ error: "An error occurred while processing your booking." });
  }
};


export const getLocationSuggestions = async (req, res) => {
  const { keyword } = req.query;

  if (!keyword) {
    return res.status(400).json({ error: "Keyword is required" });
  }

  try {
    const token = await getAccessToken();
    const response = await axios.get("https://test.api.amadeus.com/v1/reference-data/locations", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        keyword,
        subType: "CITY,AIRPORT", // Fetch both city and airport codes
      },
    });
    console.log("Amadeus API Response:", response.data); // Log the full response
    const locations = response.data.data.map((location) => ({
      name: location.name,
      iataCode: location.iataCode,
    }));

    res.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error.message);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
};


export const getBookingHistory = async (req, res) => {
  try {
    const bookingHistory = await Booking.find(); // Optionally filter by user
    res.status(200).json(bookingHistory);
  } catch (error) {
    console.error("Error fetching booking history:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};


export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findOneAndUpdate(
      { bookingId },
      { status: "Cancelled" },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    res.status(200).json({ message: "Booking cancelled successfully.", booking });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};