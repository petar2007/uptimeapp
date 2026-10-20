import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Provera tajnog ključa (opciono radi bezbednosti ili direktan poziv od Vercel Cron-a)
    const SUPABASE_URL = 'https://pomwrqrmvjxcnqeaaylk.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbXdycXJtdmp4Y25xZWFheWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMzM4MTgsImV4cCI6MjEwNzkwOTgxOH0.YLlPyAagO59cxPDQ69iP-7w9iPj6MX-3MM2sEgobV-A';
    
    const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    try {
        // 1. Povuci sve sajtove iz baze
        const { data: sites, error: sitesErr } = await _supabase.from('sites').select('*');

        if (sitesErr || !sites || sites.length === 0) {
            return res.status(200).json({ message: 'No sites to check.' });
        }

        const results = [];

        for (const site of sites) {
            const startTime = Date.now();
            let status = 'DOWN';
            let responseTime = 0;

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(site.url, { 
                    method: 'GET', 
                    signal: controller.signal 
                });
                
                clearTimeout(timeoutId);
                responseTime = Date.now() - startTime;
                status = response.ok || response.status < 500 ? 'UP' : 'DOWN';
            } catch (err) {
                responseTime = Date.now() - startTime;
                status = 'DOWN';
            }

            // 2. Zabeleži proveru u bazu
            await _supabase.from('checks').insert([{ 
                site_id: site.id, 
                status: status, 
                response_time: responseTime 
            }]);

            // 3. Ako je sajt pao i imamo Resend API ključ, pošalji e-mail korisniku
            if (status === 'DOWN' && RESEND_API_KEY) {
                // Dobijamo email vlasnika sajta iz Supabase auth-a ako je dostupno ili preko povezanog profila
                try {
                    const { data: userData } = await _supabase.auth.admin.getUserById(site.user_id).catch(() => ({ data: null }));
                    const userEmail = userData?.user?.email;

                    if (userEmail) {
                        await fetch('https://api.resend.com/emails', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${RESEND_API_KEY}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                from: 'UptimeMonitor <onboarding@resend.dev>',
                                to: [userEmail],
                                subject: `🚨 ALERT: ${site.url} is DOWN!`,
                                html: `<p>Your website <strong>${site.url}</strong> is currently unreachable.</p>`
                            })
                        });
                    }
                } catch (e) {
                    console.error("Cron email error:", e);
                }
            }

            results.push({ url: site.url, status, responseTime });
        }

        return res.status(200).json({ success: true, checked: results.length, details: results });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}