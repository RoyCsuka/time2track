window.addEventListener('load', () => {
    const err = document.querySelector('#err');
    const out = document.querySelector('#out');
    const state = { places: {} };

    // 👉 Vervang dit door jouw Vercel deployment URL (dus jouwproject.vercel.app/api/proxy)
    const SHEETS_WEBAPP_URL = "https://time2track.vercel.app/api/proxy";

    // Zet datum standaard op vandaag
    document.querySelector('#date').value = new Date().toISOString().slice(0, 10);

    // Toggle klant/woon-werk blokken
    document.querySelectorAll('input[name="mode"]').forEach(radio =>
        radio.addEventListener('change', () => {
            const mode = getMode();
            document.querySelector('#clientBlock').style.display = mode === 'client' ? '' : 'none';
            document.querySelector('#commuteBlock').style.display = mode === 'commute' ? '' : 'none';
        })
    );

    function getMode() {
        return document.querySelector('input[name="mode"]:checked').value;
    }

    // Autocomplete helper
    function attachAutocomplete(selector, key) {
        const input = document.querySelector(selector);
        const ac = new google.maps.places.Autocomplete(input, {
            fields: ['place_id', 'formatted_address']
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (place.place_id) state.places[key] = place;
        });
    }

    // Activeer Autocomplete op alle adressenvelden
    attachAutocomplete('#start', 'start');
    attachAutocomplete('#end', 'end');
    attachAutocomplete('#home', 'home');
    attachAutocomplete('#office1', 'office1');
    attachAutocomplete('#office2', 'office2');

    // Opslaan van thuis/kantoren in localStorage
    document.querySelector('#saveSettings').addEventListener('click', () => {
        localStorage.setItem('rit.settings', JSON.stringify(state.places));
        showMsg("Instellingen opgeslagen");
    });

    // Bij load: instellingen terugzetten
    try {
        const saved = JSON.parse(localStorage.getItem('rit.settings'));
        if (saved) {
            state.places = saved;
            ['home', 'office1', 'office2'].forEach(k => {
                if (saved[k]) document.querySelector('#' + k).value = saved[k].formatted_address;
            });
        }
    } catch {}

    // Opslaan knop
    document.querySelector('#calc').addEventListener('click', async () => {
        clearMsg();
        try {
            const payload = await buildPayload();
            const dm = await distanceMatrix(payload.origin, payload.destination);
            const km = (dm.distance.value / 1000).toFixed(2);
            const mins = Math.round(dm.duration.value / 60);

            const record = { ...payload, km, mins };

            // Stuur naar proxy (Vercel), die naar Google Apps Script doorstuurt
            await saveRecord(record);

            showMsg("✔️ Opgeslagen (" + km + " km, " + mins + " min)");
        } catch (e) {
            showError(e.message);
        }
    });

    // Bouw JSON payload
    async function buildPayload() {
        const date = document.querySelector('#date').value;
        const hours = parseFloat(document.querySelector('#hours').value || '0');
        const breakMin = parseInt(document.querySelector('#breakMin').value || '0', 10);
        const mode = getMode();

        if (mode === 'client') {
            if (!state.places.start || !state.places.end) throw new Error("Kies begin en eind");
            return {
                travelType: 'klant',
                date,
                hours,
                breakMin,
                origin: { placeId: state.places.start.place_id },
                destination: { placeId: state.places.end.place_id },
                origin_text: state.places.start.formatted_address,
                destination_text: state.places.end.formatted_address
            };
        } else {
            const route = document.querySelector('#commuteRoute').value;
            const rev = document.querySelector('#commuteReverse').value === 'yes';
            let from = state.places.home;
            let to = route.endsWith('1') ? state.places.office1 : state.places.office2;

            if (rev) [from, to] = [to, from];
            if (!from || !to) throw new Error("Sla thuis/kantoren op");

            return {
                travelType: 'woonwerk',
                date,
                hours,
                breakMin,
                origin: { placeId: from.place_id },
                destination: { placeId: to.place_id },
                origin_text: from.formatted_address,
                destination_text: to.formatted_address
            };
        }
    }

    // Google Distance Matrix request
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
                    if (el.status !== 'OK') return reject(new Error("Geen route"));
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
