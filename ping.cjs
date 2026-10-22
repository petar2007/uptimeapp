const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Osiguravamo ispravan URL i ključeve
const supabaseUrl = process.env.SUPABASE_URL || 'https://pomwrqrmvjxcnqeaaylk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Gmail SMTP konfiguracija
const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GMAIL_PASS;

console.log("KORISTIM URL:", supabaseUrl);
console.log("DA LI POSTOJI SUPABASE KLJUČ:", supabaseKey ? "DA" : "NE");
console.log("DA LI POSTOJI GMAIL PODEŠAVANJE:", (gmailUser && gmailPass) ? "DA" : "NE");

const supabase = createClient(supabaseUrl, supabaseKey);

// Transporter za slanje mejlova preko Gmail-a
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailUser,
    pass: gmailPass,
  },
});

async function sendAlertEmail(recipientEmail, siteUrl, statusCode) {
  if (!gmailUser || !gmailPass || !recipientEmail) {
    console.error('⚠️ Fali GMAIL_USER, GMAIL_PASS ili recipientEmail za slanje mejla.');
    return;
  }

  try {
    const mailOptions = {
      from: `"Uptime Monitor" <${gmailUser}>`,
      to: recipientEmail,
      subject: `🚨 ALERT: Tvoj sajt je PAO! (${siteUrl})`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #e53e3e;">🚨 Obaveštenje o padu sajta</h2>
          <p>Tvoj sajt <strong style="color: #2b6cb0;">${siteUrl}</strong> trenutno nije dostupan.</p>
          <p>Status kod: <strong>${statusCode || 'N/A (Timeout / Connection Error)'}</strong></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <small style="color: #718096;">Ovo je automatska poruka poslata sa tvog Uptime Monitora.</small>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Mejlovsko upozorenje uspešno poslato za ${siteUrl} na adresu ${recipientEmail} (ID: ${info.messageId})`);
  } catch (err) {
    console.error('❌ Greška pri slanju mejla preko Gmail-a:', err.message);
  }
}

async function runUptimeMonitor() {
  console.log('🚀 Pokrećem globalni uptime monitoring engine...\n');

  const { data: sites, error: fetchError } = await supabase
    .from('sites')
    .select('id, url, user_id');

  if (fetchError) {
    console.error('❌ Neuspešno preuzimanje sajtova:', fetchError.message);
    return;
  }

  if (!sites || sites.length === 0) {
    console.log('⚠️ Nema sajtova u bazi za proveru.');
    return;
  }

  for (const site of sites) {
    const startTime = Date.now();
    let isUp = false;
    let statusCode = 0;

    try {
      const response = await fetch(site.url);
      statusCode = response.status;
      isUp = response.ok;
    } catch (err) {
      isUp = false;
    }

    const responseTime = Date.now() - startTime;
    console.log(`🌐 Sajt: ${site.url} | Status: ${statusCode} | Latencija: ${responseTime}ms | Aktivan: ${isUp}`);

    if (!isUp && site.user_id) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(site.user_id);
        const ownerEmail = userData?.user?.email;
        if (ownerEmail) {
          await sendAlertEmail(ownerEmail, site.url, statusCode);
        }
      } catch (e) {
        console.error('Neuspešno preuzimanje mejla korisnika:', e.message);
      }
    }

    await supabase.from('checks').insert([{ 
      site_id: site.id, 
      status: isUp ? 'UP' : 'DOWN', 
      response_time: responseTime 
    }]);
  }

  console.log('\n✨ Provera svih sajtova je uspešno završena!');
}

runUptimeMonitor();