import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pomwrqrmvjxcnqeaaylk.supabase.co';
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Supabase service key is missing in environment variables.' });
    }

    const _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    try {
        const { data: sites, error: sitesErr } = await _supabase
            .from('sites')
            .select('id, url, user_id');

        if (sitesErr || !sites || sites.length === 0) {
            return res.status(200).json({ message: 'No sites to check.' });
        }

        const now = new Date();
        const results = [];

        for (const site of sites) {
            const { data: lastCheckData } = await _supabase
                .from('checks')
                .select('checked_at')
                .eq('site_id', site.id)
                .order('checked_at', { ascending: false })
                .limit(1);

            let intervalMinutes = 5;
            
            if (lastCheckData && lastCheckData.length > 0) {
                const lastCheckedTime = new Date(lastCheckData[0].checked_at);
                const diffMinutes = (now - lastCheckedTime) / 1000 / 60;

                if (diffMinutes < intervalMinutes) {
                    continue; 
                }
            }

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

            await _supabase.from('checks').insert([{ 
                site_id: site.id, 
                status: status, 
                response_time: responseTime 
            }]);

            if (status === 'DOWN' && RESEND_API_KEY && site.user_id) {
                try {
                    const { data: userData } = await _supabase.auth.admin.getUserById(site.user_id);
                    const ownerEmail = userData?.user?.email;

                    if (ownerEmail) {
                        await fetch('https://api.resend.com/emails', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${RESEND_API_KEY}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                from: 'UptimeMonitor <onboarding@resend.dev>',
                                to: [ownerEmail],
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

        return res.status(200).json({ success: true, checkedCount: results.length, details: results });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}