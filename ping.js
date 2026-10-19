const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pomwrqrmvjxcnqeaaylk.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Email notification function using Resend
async function sendAlertEmail(recipientEmail, siteUrl, statusCode) {
  if (!resendApiKey) {
    console.log('⚠️ Resend API key missing, skipping email alert.');
    return;
  }

  if (!recipientEmail) {
    console.log(`⚠️ No email found for site ${siteUrl}, skipping alert.`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Uptime Monitor <onboarding@resend.dev>',
        to: [recipientEmail],
        subject: `🚨 ALERT: Your site is DOWN! (${siteUrl})`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ea4335; border-radius: 8px;">
            <h2 style="color: #ea4335; margin-top: 0;">Service Downtime Detected</h2>
            <p>Hello,</p>
            <p>Our automated monitoring system detected that your website <strong>${siteUrl}</strong> is currently unreachable.</p>
            <hr style="border: 0; border-top: 1px solid #eee;" />
            <p><strong>HTTP Status Code:</strong> ${statusCode || 'No Response / Timeout'}</p>
            <p><strong>Timestamp:</strong> ${new Date().toUTCString()}</p>
            <hr style="border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #777;">You are receiving this automated message because this site is registered under your Uptime Monitor account.</p>
          </div>
        `
      })
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`📧 Email alert successfully sent for ${siteUrl} to ${recipientEmail}`);
    } else {
      console.error('❌ Failed to send email:', data);
    }
  } catch (err) {
    console.error('❌ Error sending email alert:', err.message);
  }
}

async function runUptimeMonitor() {
  console.log('🚀 Starting global uptime monitoring engine...\n');

  // Fetch sites and join with profiles table to get user email dynamically
  const { data: sites, error: fetchError } = await supabase
    .from('sites')
    .select(`
      id,
      url,
      user_id,
      profiles (
        email,
        plan
      )
    `);

  if (fetchError) {
    console.error('❌ Failed to fetch sites:', fetchError.message);
    return;
  }

  if (!sites || sites.length === 0) {
    console.log('⚠️ No target sites found in the database.');
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
    console.log(`🌐 Target: ${site.url} | Status: ${statusCode} | Latency: ${responseTime}ms | Up: ${isUp}`);

    // If site is down, extract owner email from joined profiles table and send alert
    if (!isUp) {
      const ownerEmail = site.profiles ? site.profiles.email : null;
      await sendAlertEmail(ownerEmail, site.url, statusCode);
    }

    const { error: insertError } = await supabase
      .from('uptime_logs')
      .insert([{ 
        url: site.url, 
        is_up: isUp, 
        status_code: statusCode, 
        response_time: responseTime 
      }]);

    if (insertError) {
      console.error(`   ❌ Failed to insert log for ${site.url}:`, insertError.message);
    }
  }

  console.log('\n✨ Global uptime check completed successfully!');
}

runUptimeMonitor();