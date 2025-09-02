window.addEventListener('load', () => {
    const err = document.querySelector('#err');
    const out = document.querySelector('#out');

    // Vervang dit door jouw Vercel deployment URL
    const SHEETS_WEBAPP_URL = "https://time2track.vercel.app/api/proxy";

    // Zet datum standaard op vandaag
    document.querySelector('#date').value = new Date().toISOString().slice(0, 10);

    // + Rit toevoegen
    document.querySelector('#addTrip').addEventListener('click', () => {
        const container = document.querySelector('#tripsContainer');
        const index = container.children.length;
        const clone = container.children[0].cloneNode(true);

        // unieke ids/names maken
        clone.querySelectorAll('[id]').forEach(el => {
            el.id = el.id.replace('-0', '-' + index);
        });
        clone.querySelectorAll('[name]').forEach(el => {
            el.name = el.name.replace('-0', '-' + index);
        });

        // waarden resetten
        clone.querySelectorAll('input[type="text"]').forEach(i => i.value = '');
        clone.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
        clone.querySelectorAll('input[type="radio"]').forEach((r, ridx) => {
            r.checked = ridx === 0; // standaard eerste optie aan
        });

        container.appendChild(clone);
    });

    // Opslaan alle ritten
    document.querySelector('#calc').addEventListener('click', async () => {
        clearMsg();
        try {
            const date = document.querySelector('#date').value;
            const hours = parseFloat(document.querySelector('#hours').value || '0');
            const breakMin = parseInt(document.querySelector('#breakMin').value || '0', 10);

            const tripsEls = document.querySelectorAll('#tripsContainer .trip');
            if (tripsEls.length === 0) throw new Error("Geen ritten ingevoerd");

            let saved = 0;

            for (let idx = 0; idx < tripsEls.length; idx++) {
                const tripEl = tripsEls[idx];
                const mode = tripEl.querySelector(`input[name="mode-${idx}"]:checked`).value;

                let record;
                if (mode === 'client') {
                    const start = tripEl.querySelector(`#start-${idx}`).value;
                    const end = tripEl.querySelector(`#end-${idx}`).value;
                    const retour = tripEl.querySelector(`#roundtrip-${idx}`).value === 'yes';

                    if (!start || !end) throw new Error("Vul begin en eind in (rit " + (idx + 1) + ")");

                    // Distance Matrix call(s)
                    const leg1 = await distanceMatrix({ query: start }, { query: end });
                    let meters = leg1.distance.value;
                    let seconds = leg1.duration.value;
                    if (retour) {
                        const leg2 = await distanceMatrix({ query: end }, { query: start });
                        meters += leg2.distance.value;
                        seconds += leg2.duration.value;
                    }

                    record = {
                        date, hours, breakMin,
                        travelType: 'klant',
                        origin_text: start,
                        destination_text: end,
                        km: (meters / 1000).toFixed(2),
                        mins: Math.round(seconds / 60)
                    };

                } else {
                    const route = tripEl.querySelector(`#commuteRoute-${idx}`).value;
                    const rev = tripEl.querySelector(`#commuteReverse-${idx}`).value === 'yes';

                    // Stel hier je vaste kantoren in:
                    const home = document.querySelector('#home').value;
                    const office1 = "Livingstonehage 13, Emmeloord, Netherlands";
                    const office2 = "Recreatiepark De Voorst, Kraggenburg, Netherlands";

                    let from = home;
                    let to = route.endsWith('1') ? office1 : office2;
                    if (rev) [from, to] = [to, from];

                    if (!from || !to) throw new Error("Thuis/kantoren niet correct ingevuld");

                    const leg = await distanceMatrix({ query: from }, { query: to });

                    record = {
                        date, hours, breakMin,
                        travelType: 'woonwerk',
                        origin_text: from,
                        destination_text: to,
                        km: (leg.distance.value / 1000).toFixed(2),
                        mins: Math.round(leg.duration.value / 60)
                    };
                }

                await saveRecord(record);
                saved++;
            }

            showMsg(`✔️ ${saved} ritten opgeslagen in Google Sheet`);
        } catch (e) {
            showError(e.message);
        }
    });

    // Distance Matrix service
    function distanceMatrix(origin, destination) {
        return new Promise((resolve, reject) => {
            const svc = new google.maps.DistanceMatrixService();
            svc.getDistanceMatrix(
                {
                    origins: [origin],
                    destinations: [destination],
                    travelMode: 'DRIVING',
                    unitSystem: google.maps.UnitSystem.METRIC
                },
                (r, s) => {
                    if (s !== 'OK') return reject(new Error(s));
                    const el = r.rows[0].elements[0];
                    if (el.status !== 'OK') return reject(new Error("Geen route gevonden"));
                    resolve({ distance: el.distance, duration: el.duration });
                }
            );
        });
    }

    // POST record naar proxy
    async function saveRecord(record) {
        const res = await fetch(SHEETS_WEBAPP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
        });
        if (!res.ok) throw new Error("Proxy error " + res.status);
    }

    // Helpers
    function showError(m) { err.textContent = m; }
    function clearMsg() { err.textContent = ''; out.textContent = ''; }
    function showMsg(m) { err.textContent = ''; out.textContent = m; }
});