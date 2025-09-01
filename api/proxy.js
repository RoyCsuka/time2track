export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        // Preflight
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        return res.status(200).end();
    }

    if (req.method === "POST") {
        try {
            const resp = await fetch("https://script.google.com/macros/s/AKfycbwyZLEhkb7vXBRv9M52_2WgJZnVFAIMUCNHModlhlu63P6pi4Gwkr_v3ie3sAMDa2ya/exec", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req.body)
            });

            const data = await resp.text();

            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            return res.status(200).send(data);
        } catch (err) {
            return res.status(500).json({ ok: false, error: err.message });
        }
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
}