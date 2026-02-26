const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// The Webhook Endpoint
app.post('/paystack-webhook', async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

    // 1. Security Check: Did this actually come from Paystack?
    if (hash === req.headers['x-paystack-signature']) {
        const event = req.body;

        if (event.event === 'charge.success') {
            const data = event.data;
            const email = data.customer.email;
            const amount = data.amount; // Remember: Paystack sends this in kobo!

            // Extract the DLS Team Name from the custom fields we set up on Paystack
            let teamName = "Unknown Player"; 
            if (data.metadata && data.metadata.custom_fields) {
                const teamField = data.metadata.custom_fields.find(field => field.display_name === "DLS Team Name");
                if (teamField) {
                    teamName = teamField.value;
                }
            }

            console.log(`Payment successful! Processing player: ${teamName} (${email}) for amount: ${amount} kobo.`);

            // 2. The Engine Logic: Figure out which tournament they paid for
            let tournamentId = '';
            
            if (amount === 100000) { 
                // ₦1,000 Entry Fee -> Send to Academy
                tournamentId = 'unclescar_academy_01'; 
                
            } else if (amount === 150000) { 
                // ₦1,500 Entry Fee -> Send to Knockouts
                tournamentId = 'unclescar_knockouts_01'; 
                
            } else if (amount === 500000) { 
                // ₦5,000 Entry Fee -> Send to UPL Pro League
                tournamentId = 'unclescar_upl_01';
            }

            // 3. Send the player's name directly to Challonge
            if (tournamentId !== '') {
                try {
                    await axios.post(`https://api.challonge.com/v1/tournaments/${tournamentId}/participants.json`, {
                        api_key: process.env.CHALLONGE_API_KEY,
                        participant: {
                            name: teamName,
                            misc: email // Saves their email privately in Challonge just in case
                        }
                    });
                    console.log(`Successfully added ${teamName} to bracket: ${tournamentId}`);
                } catch (error) {
                    console.error("Failed to add player to Challonge:", error.response ? error.response.data : error.message);
                }
            } else {
                console.log("Payment received, but amount didn't match any active tournament fees.");
            }
        }
        res.status(200).send('Webhook received successfully');
    } else {
        // If a hacker tried to fake a payment, block it.
        console.log("WARNING: Invalid Paystack signature detected.");
        res.status(400).send('Invalid signature');
    }
});

// Keep the server awake
app.get('/', (req, res) => {
    res.send('Unclescar Studios API is Live and Running!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
