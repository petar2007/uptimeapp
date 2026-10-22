const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://pomwrqrmvjxcnqeaaylk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function sendAlertEmail(recipientEmail, siteUrl, statusCode) {
  if (!resendApiKey || !recipientEmail) return;

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
        html: `<p>Your website <strong>${siteUrl}</strong> is unreachable. Status code: ${statusCode}</p>`
      })
    });
    if (res.ok) {
      console.log(`📧 Email alert successfully sent for ${siteUrl} to ${recipientEmail}`);
    } else {
      const errData = await res.json();
      console.error('❌ Failed to send email:', errData);
    }
  } catch (err) {
    console.error('❌ Error sending email alert:', err.message);
  }
}

async function runUptimeMonitor() {
  console.log('🚀 Starting global uptime monitoring engine...\n');

  const { data: sites, error: fetchError } = await supabase
    .from('sites')
    .select('id, url, user_id');

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

    if (!isUp && site.user_id) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(site.user_id);
        const ownerEmail = userData?.user?.email;
        if (ownerEmail) {
          await sendAlertEmail(ownerEmail, site.url, statusCode);
        }
      } catch (e) {
        console.error('Could not fetch user email:', e.message);
      }
    }

    await supabase.from('checks').insert([{ 
      site_id: site.id, 
      status: isUp ? 'UP' : 'DOWN', 
      response_time: responseTime 
    }]);
  }

  console.log('\n✨ Global uptime check completed successfully!');
}

runUptimeMonitor();