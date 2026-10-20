export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, siteUrl, status } = req.body;

    if (!email || !siteUrl) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
        return res.status(500).json({ error: 'Resend API key is not configured' });
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'UptimeMonitor <onboarding@resend.dev>', // Podrazumevana Resend adresa za test
                to: [email],
                subject: `🚨 ALERT: Your website ${siteUrl} is DOWN!`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; background-color: #0f172a; color: #ffffff; border-radius: 10px;">
                        <h2 style="color: #ef4444; margin-top: 0;">🚨 Downtime Alert</h2>
                        <p>Your monitored website has gone down.</p>
                        <hr style="border-color: #334155;" />
                        <p><strong>Website:</strong> <a href="${siteUrl}" style="color: #3b82f6;">${siteUrl}</a></p>
                        <p><strong>Status:</strong> <span style="color: #ef4444; font-weight: bold;">DOWN</span></p>
                        <p><strong>Time:</strong> ${new Date().toUTCString()}</p>
                        <hr style="border-color: #334155;" />
                        <p style="font-size: 12px; color: #94a3b8;">UptimeMonitor - Automated System Alert</p>
                    </div>
                `
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(400).json({ error: data });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}