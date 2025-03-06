import express from 'express';
import cors from 'cors';
import bodyParser from "body-parser";
import dotenv from 'dotenv';
import flightRoutes from './Routers/flightRoutes.js'; // Import flight routes
import userRoutes from './Routers/userRoutes.js';
import connectDB from './Database/dbConfig.js';
import paymentRoutes from './Routers/paymentRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

connectDB();

// Use the flight routes
app.use('/api/flights', flightRoutes);

//Use the user routes
app.use('/api/users', userRoutes);

app.use('/api/payments', paymentRoutes);

app.get("/",(req,res)=>{
  res.send("Welcome to backend");
})

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running Successfully`);
});