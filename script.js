window.addEventListener('load', () => {
    const err = document.querySelector('#err');
    const out = document.querySelector('#out');

    // Vervang dit door jouw Vercel proxy URL
    const SHEETS_WEBAPP_URL = "https://time2track.vercel.app/api/proxy";

    // Zet datum standaard op vandaag
    document.querySelector('#date').value = new Date().toISOString().slice(0, 10);

    // Instellingen opslaan
    document.querySelector('#saveSettings').addEventListener('click', () => {
        const settings = {
            home: document.querySelector('#home').value,
            office1: document.querySelector('#office1').value,
            office2: document.querySelector('#office2').value
        };
        localStorage.setItem('rit.settings', JSON.stringify(settings));
        showMsg("Instellingen opgeslagen");
    });

    // Instellingen laden
    try {
        const saved = JSON.parse(localStorage.getItem('rit.settings'));
        if (saved) {
            if (saved.home) document.querySelector('#home').value = saved.home;
            if (saved.office1) document.querySelector('#office1').value = saved.office1;
            if (saved.office2) document.querySelector('#office2').value = saved.office2;
        }
    } catch {}

    // Autocomplete koppelen aan instellingenvelden
    ['#home', '#office1', '#office2'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) attachAutocompleteToInput(el);
    });

    // Zorg dat eerste rit meteen listeners + autocomplete heeft
    attachModeListeners(document.querySelector('#tripsContainer .trip'), 0);
    attachAutocompleteToTrip(document.querySelector('#tripsContainer .trip'));

    // + rit toevoegen
    document.querySelector('#addTrip').addEventListener('click', () => {
        const container = document.querySelector('#tripsContainer');
        const index = container.children.length;
        const clone = container.children[0].cloneNode(true);

        // ids/names aanpassen
        clone.querySelectorAll('[id]').forEach(el => {
            el.id = el.id.replace('-0', '-' + index);
        });
        clone.querySelectorAll('[name]').forEach(el => {
            el.name = el.name.replace('-0', '-' + index);
        });

        // velden resetten
        clone.querySelectorAll('input[type="text"]').forEach(i => {
            i.value = '';
            i.dataset.placeId = '';
            i.dataset.address = '';
        });
        clone.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        clone.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
        clone.querySelectorAll('input[type="radio"]').forEach((r, ridx) => {
            r.checked = ridx === 0; // standaard naar "klant"
        });

        // default tonen clientBlock
        clone.querySelector('.clientBlock').style.display = '';
        clone.querySelector('.commuteBlock').style.display = 'none';

        container.appendChild(clone);

        // listeners + autocomplete koppelen
        attachModeListeners(clone, index);
        attachAutocompleteToTrip(clone);
    });

    // Opslaan knop
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
                    const startEl = tripEl.querySelector(`#start-${idx}`);
                    const endEl = tripEl.querySelector(`#end-${idx}`);
                    // ✅ checkbox
                    const retour = tripEl.querySelector(`#roundtrip-${idx}`).checked;

                    const start = startEl.dataset.address || startEl.value;
                    const end = endEl.dataset.address || endEl.value;

                    if (!start || !end) throw new Error("Vul begin en eind in (rit " + (idx + 1) + ")");

                    // Bereken afstand/tijd
                    const leg1 = await distanceMatrix({ query: start }, { query: end });
                    let meters = leg1.distance.value;
                    let seconds = leg1.duration.value;

                    if (retour) {
                        meters *= 2;
                        seconds *= 2;
                    }

                    record = {
                        date, hours, breakMin,
                        travelType: 'klant',
                        retour: retour ? 'ja' : 'nee',
                        origin_text: start,
                        destination_text: end,
                        km: (meters / 1000).toFixed(2),
                        mins: Math.round(seconds / 60)
                    };

                } else {
                    const route = tripEl.querySelector(`#commuteRoute-${idx}`).value;
                    // ✅ checkbox
                    const retour = tripEl.querySelector(`#commuteReverse-${idx}`).checked;

                    // Vaste kantoren uit instellingen (met autocomplete)
                    const home = document.querySelector('#home').dataset.address || document.querySelector('#home').value;
                    const office1 = document.querySelector('#office1').dataset.address || document.querySelector('#office1').value;
                    const office2 = document.querySelector('#office2').dataset.address || document.querySelector('#office2').value;

                    let from = home;
                    let to = route.endsWith('1') ? office1 : office2;

                    if (!from || !to) throw new Error("Thuis/kantoren niet correct ingevuld");

                    const leg = await distanceMatrix({ query: from }, { query: to });

                    let meters = leg.distance.value;
                    let seconds = leg.duration.value;

                    if (retour) {
                        meters *= 2;
                        seconds *= 2;
                    }

                    record = {
                        date, hours, breakMin,
                        travelType: 'woonwerk',
                        retour: retour ? 'ja' : 'nee',
                        origin_text: from,
                        destination_text: to,
                        km: (meters / 1000).toFixed(2),
                        mins: Math.round(seconds / 60)  // ✅ gebruikt verdubbelde seconds
                    };
                }

                await saveRecord(record);
                saved++;
            }

            showMsg(`✔️ ${saved} tracks & time opgeslagen!`);
        } catch (e) {
            showError(e.message);
        }
    });

    // Helpers

    function attachModeListeners(tripEl, idx) {
        const radios = tripEl.querySelectorAll(`input[name="mode-${idx}"]`);
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                const mode = tripEl.querySelector(`input[name="mode-${idx}"]:checked`).value;
                tripEl.querySelector('.clientBlock').style.display = mode === 'client' ? '' : 'none';
                tripEl.querySelector('.commuteBlock').style.display = mode === 'commute' ? '' : 'none';
            });
        });
    }

    function attachAutocompleteToInput(inputEl) {
        const ac = new google.maps.places.Autocomplete(inputEl, {
            fields: ['place_id', 'formatted_address']
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (place.place_id) {
                inputEl.dataset.placeId = place.place_id;
                inputEl.dataset.address = place.formatted_address;
            }
        });
    }

    function attachAutocompleteToTrip(tripEl) {
        tripEl.querySelectorAll('input[type="text"]').forEach(input => {
            attachAutocompleteToInput(input);
        });
    }

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

    async function saveRecord(record) {
        const res = await fetch(SHEETS_WEBAPP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
        });
        if (!res.ok) throw new Error("Proxy error " + res.status);
    }

    function showError(m) { err.textContent = m; }
    function clearMsg() { err.textContent = ''; out.textContent = ''; }
    function showMsg(m) { err.textContent = ''; out.textContent = m; }
});