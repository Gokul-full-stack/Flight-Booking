
import Stripe from "stripe";
import Payment from "../Models/Payment.js"; // Ensure the model path is correct

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
  const { bookingId, amount, currency = "inr", passengerDetails } = req.body;

  try {
    // Validate input
    if (!bookingId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid bookingId or amount" });
    }

    // Generate a unique orderId for this payment
    const orderId = `ORDER_${bookingId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    console.log(`Creating Stripe Checkout session for Booking ID: ${bookingId}, Amount: ${amount}, Order ID: ${orderId}`);

    // Create a Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Booking for ${bookingId}`,
              //description: `Passengers: ${passengerDetails?.length || 0}`,
            },
            unit_amount: Math.round(amount * 100), // Convert amount to smallest currency unit
          },
          quantity: 1,
        },
      ],
      mode: "payment", // Payment mode
      success_url: `${process.env.FRONTEND_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/failed??bookingId=${bookingId}&amount=${amount}`,
      metadata: {
        bookingId,
        orderId,
      },
    });

    // Save the session details to the database
    const payment = new Payment({
      stripeSessionId: session.id,
      orderId,
      bookingId,
      amount,
      currency,
      status: "Pending", // Default status
      passengerDetails,
    });

    await payment.save();

    console.log(`Stripe Checkout session created and saved: ${session.id}`);
    res.status(200).json({ success: true, url: session.url });
  } catch (error) {
    console.error(`Error creating checkout session: ${error.message}`);
    res.status(500).json({ success: false, message: "Error creating checkout session" });
  }
};

export const handlePaymentSuccess = async (req, res) => {
  const { sessionId } = req.body;

  try {
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    if (session.payment_status === "paid") {
      // Update payment status in the database
      const payment = await Payment.findOneAndUpdate(
        { stripeSessionId: session.id },
        { status: "Completed" },
        { new: true }
      );

      if (!payment) {
        return res.status(404).json({ success: false, message: "Payment not found in the database" });
      }

      console.log(`Payment completed for session: ${sessionId}`);
      res.status(200).json({
        success: true,
        message: "Payment confirmed successfully",
        bookingDetails: {
          orderId: payment.orderId,
          bookingId: payment.bookingId,
          amount: payment.amount,
         // currency: payment.currency,
          status: payment.status,
        },
      });
    } else {
      res.status(400).json({ success: false, message: "Payment not completed yet" });
    }
  } catch (error) {
    console.error(`Error handling payment success: ${error.message}`);
    res.status(500).json({ success: false, message: "Error handling payment success" });
  }
};