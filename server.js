// server.js
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

// We need raw body to verify the Paystack signature securely
app.use(express.json()); 

// --- YOUR SECRET KEYS (These will be hidden in environment variables) ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const CHALLONGE_API_KEY = process.env.CHALLONGE_API_KEY;
const CHALLONGE_USERNAME = process.env.CHALLONGE_USERNAME;

// The endpoint Paystack will send the Webhook to
app.post('/paystack-webhook', async (req, res) => {
    // 1. Verify the webhook is actually from Paystack
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
    
    if (hash == req.headers['x-paystack-signature']) {
        // 2. Check if the event is a successful payment
        const event = req.body;
        
        if (event.event === 'charge.success') {
            console.log('Payment successful! Processing player...');

            // 3. Extract Player Data from Paystack
            const playerEmail = event.data.customer.email;
            const amountPaid = event.data.amount; // Paystack handles amounts in kobo (multiply Naira by 100)
            
            // Note: To get the DLS Team Name, you must add a "Custom Field" to your Paystack Payment Page!
            // Let's assume the custom field is called "team_name"
            let teamName = playerEmail; // Default to email if no name is found
            if (event.data.metadata && event.data.metadata.custom_fields) {
                const nameField = event.data.metadata.custom_fields.find(field => field.display_name === "DLS Team Name");
                if (nameField) teamName = nameField.value;
            }

            // 4. Route to the correct Challonge Bracket based on the price paid
            let tournamentUrl = '';
            if (amountPaid === 10000) { // ₦100 (Academy)
                tournamentUrl = 'unclescaracademy1';
            } else if (amountPaid === 100000) { // ₦1,000 (Knockouts/eFootball)
                // You'd add more logic here to separate DLS vs eFootball based on the Paystack Page ID
                tournamentUrl = 'unclescar1'; 
            } else if (amountPaid === 200000) { // ₦2,000 (EA FC)
                tournamentUrl = 'unclescareafc1';
            }

            // 5. Push the player to Challonge via API
            if (tournamentUrl !== '') {
                try {
                    const challongeEndpoint = `https://api.challonge.com/v1/tournaments/${tournamentUrl}/participants.json`;
                    
                    await axios.post(challongeEndpoint, {
                        api_key: CHALLONGE_API_KEY,
                        participant: {
                            name: teamName,
                            email: playerEmail
                        }
                    });
                    console.log(`Successfully added ${teamName} to ${tournamentUrl}`);
                } catch (error) {
                    console.error('Failed to add to Challonge:', error.response ? error.response.data : error.message);
                }
            }
        }
        res.sendStatus(200); // Tell Paystack "We got it!"
    } else {
        // Signature didn't match, ignore it
        res.sendStatus(400); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Unclescar API Bridge is running on port ${PORT}`);
});
