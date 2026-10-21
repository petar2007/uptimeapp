const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function testEmail() {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'UptimeMonitor <onboarding@resend.dev>',
        to: ['pmarinkovic1234@gmail.com'], // Stavi svoj email ovde
        subject: '🚨 Test Email sa BocydiumPulse',
        html: '<p>Ako vidiš ovu poruku, Resend i email notifikacije rade savršeno!</p>'
      })
    });

    const data = await response.json();
    console.log("Rezultat slanja:", data);
  } catch (err) {
    console.error("Greška pri slanju maila:", err);
  }
}

testEmail();