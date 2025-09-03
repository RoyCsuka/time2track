window.addEventListener('load', () => {
    const err = document.querySelector('#err');
    const out = document.querySelector('#out');

    // Vervang dit door jouw Vercel proxy URL
    const SHEETS_WEBAPP_URL = "https://time2track.vercel.app/api/proxy";

    // Helpers: veilige pickers met fallbacks
    function pick(tripEl, selectors, label) {
        for (const sel of selectors) {
            const el = tripEl.querySelector(sel);
            if (el) return el;
        }
        throw new Error(`Element niet gevonden (${label}): probeerde ${selectors.join(', ')}`);
    }
    function pickCheckedRadio(tripEl, names, label) {
        for (const name of names) {
            const el = tripEl.querySelector(`input[name="${name}"]:checked`);
            if (el) return el;
        }
        throw new Error(`Radio niet gevonden (${label}): name=${names.join(' of ')}`);
    }

    // Zet datum standaard op vandaag (als #date bestaat)
    const dateInput = document.querySelector('#date');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

    // Instellingen opslaan
    const saveBtn = document.querySelector('#saveSettings');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const settings = {
                home: (document.querySelector('#home') || {}).value || '',
                office1: (document.querySelector('#office1') || {}).value || '',
                office2: (document.querySelector('#office2') || {}).value || ''
            };
            localStorage.setItem('rit.settings', JSON.stringify(settings));
            showMsg("Instellingen opgeslagen");
        });
    }

    // Instellingen laden
    try {
        const saved = JSON.parse(localStorage.getItem('rit.settings'));
        if (saved) {
            if (saved.home && document.querySelector('#home')) document.querySelector('#home').value = saved.home;
            if (saved.office1 && document.querySelector('#office1')) document.querySelector('#office1').value = saved.office1;
            if (saved.office2 && document.querySelector('#office2')) document.querySelector('#office2').value = saved.office2;
        }
    } catch {}

    // Autocomplete koppelen aan instellingenvelden
    ['#home', '#office1', '#office2'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) attachAutocompleteToInput(el);
    });

    // Zorg dat de eerste trip listeners + autocomplete krijgt (als container bestaat)
    const firstTrip = document.querySelector('#tripsContainer .trip');
    if (firstTrip) {
        attachModeListeners(firstTrip, 0);
        attachAutocompleteToTrip(firstTrip);
    }

    // + rit toevoegen
    const addBtn = document.querySelector('#addTrip');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const container = document.querySelector('#tripsContainer');
            if (!container || !container.children.length) return;
            const index = container.children.length;
            const clone = container.children[0].cloneNode(true);

            // ids/names aanpassen waar mogelijk (alleen als ze -0 bevatten)
            clone.querySelectorAll('[id]').forEach(el => {
                if (el.id.includes('-0')) el.id = el.id.replace('-0', '-' + index);
            });
            clone.querySelectorAll('[name]').forEach(el => {
                if (el.name.includes('-0')) el.name = el.name.replace('-0', '-' + index);
            });

            // velden resetten
            clone.querySelectorAll('input[type="text"]').forEach(i => {
                i.value = '';
                i.dataset.placeId = '';
                i.dataset.address = '';
            });
            clone.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            clone.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
            // standaard 1e radio aan
            const radios = clone.querySelectorAll('input[type="radio"]');
            radios.forEach((r, ridx) => { r.checked = ridx === 0; });

            // default tonen clientBlock
            const cb = clone.querySelector('.clientBlock');
            const wb = clone.querySelector('.commuteBlock');
            if (cb) cb.style.display = '';
            if (wb) wb.style.display = 'none';

            container.appendChild(clone);

            // listeners + autocomplete koppelen
            attachModeListeners(clone, index);
            attachAutocompleteToTrip(clone);
        });
    }

    // Opslaan knop
    const calcBtn = document.querySelector('#calc');
    if (calcBtn) {
        calcBtn.addEventListener('click', async () => {
            clearMsg();
            try {
                const date = (document.querySelector('#date') || {}).value || '';
                const clientName = (document.querySelector('#client') || {}).value?.trim?.() || '';

                // globaal: uren/pauze alleen op 1e rij meesturen
                const hoursGlobal = parseFloat((document.querySelector('#hours') || {}).value || '0');
                const breakMinGlobal = parseInt((document.querySelector('#breakMin') || {}).value || '0', 10);

                const tripsEls = document.querySelectorAll('#tripsContainer .trip');
                if (!tripsEls.length) throw new Error("Geen ritten ingevoerd");

                let saved = 0;

                for (let idx = 0; idx < tripsEls.length; idx++) {
                    const tripEl = tripsEls[idx];

                    // mode-radio: probeer name="mode-<idx>", val anders terug op name="mode"
                    const modeRadio = pickCheckedRadio(tripEl, [`mode-${idx}`, 'mode'], 'mode');
                    const mode = modeRadio.value;

                    // Alleen op de eerste rij meesturen; anders leeg
                    const includeGlobals = (idx === 0);
                    const hours = includeGlobals ? hoursGlobal : null;
                    const breakMin = includeGlobals ? breakMinGlobal : null;
                    const clientForRow = includeGlobals ? clientName : null;

                    let record;

                    if (mode === 'client') {
                        // start/end: probeer met -idx, fallback zonder suffix
                        const startEl = pick(tripEl, [`#start-${idx}`, '#start'], 'start');
                        const endEl   = pick(tripEl, [`#end-${idx}`, '#end'], 'end');
                        // retour (checkbox): probeer #roundtrip-idx, fallback #clientRoundtrip
                        const retourEl = pick(tripEl, [`#roundtrip-${idx}`, '#clientRoundtrip'], 'retour (klant)');
                        const retour = !!retourEl.checked;

                        const start = startEl.dataset.address || startEl.value;
                        const end   = endEl.dataset.address || endEl.value;
                        if (!start || !end) throw new Error(`Vul begin en eind in (rit ${idx + 1})`);

                        // Bereken afstand/tijd
                        const leg1 = await distanceMatrix({ query: start }, { query: end });
                        let meters = leg1.distance.value;
                        let seconds = leg1.duration.value;

                        if (retour) {
                            meters *= 2;
                            seconds *= 2;
                        }

                        record = {
                            date,
                            hours,
                            breakMin,
                            client: clientForRow,
                            travelType: 'klant',
                            retour: retour ? 'ja' : 'nee',
                            origin_text: start,
                            destination_text: end,
                            km: (meters / 1000).toFixed(2),
                            mins: Math.round(seconds / 60)
                        };

                    } else {
                        // woon-werk: route en retour-checkbox
                        const routeEl = pick(tripEl, [`#commuteRoute-${idx}`, '#commuteRoute'], 'commute route');
                        const retourEl = pick(tripEl, [`#commuteReverse-${idx}`, '#commuteReverse'], 'retour (woon-werk)');
                        const retour = !!retourEl.checked;

                        // Instellingen
                        const home    = (document.querySelector('#home')    ?.dataset.address) || (document.querySelector('#home')    || {}).value || '';
                        const office1 = (document.querySelector('#office1') ?.dataset.address) || (document.querySelector('#office1') || {}).value || '';
                        const office2 = (document.querySelector('#office2') ?.dataset.address) || (document.querySelector('#office2') || {}).value || '';

                        const routeVal = routeEl.value || 'home-office1';
                        let from = home;
                        let to   = routeVal.endsWith('1') ? office1 : office2;

                        if (!from || !to) throw new Error("Thuis/kantoren niet correct ingevuld");

                        const leg = await distanceMatrix({ query: from }, { query: to });

                        let meters = leg.distance.value;
                        let seconds = leg.duration.value;

                        if (retour) {
                            meters *= 2;
                            seconds *= 2;
                        }

                        record = {
                            date,
                            hours,
                            breakMin,
                            client: clientForRow,
                            travelType: 'woonwerk',
                            retour: retour ? 'ja' : 'nee',
                            origin_text: from,
                            destination_text: to,
                            km: (meters / 1000).toFixed(2),
                            mins: Math.round(seconds / 60)
                        };
                    }

                    await saveRecord(record);
                    saved++;
                }

                showMsg(`✔️ ${saved} ritten opgeslagen in Google Sheet`);
            } catch (e) {
                showError(e.message);
                console.error(e);
            }
        });
    }

    // Toggle per trip (werkt met name="mode-<idx>" en valt terug op name="mode")
    function attachModeListeners(tripEl, idx) {
        const attachFor = (name) => {
            const radios = tripEl.querySelectorAll(`input[name="${name}"]`);
            if (!radios.length) return false;
            const update = () => {
                const checked = tripEl.querySelector(`input[name="${name}"]:checked`);
                const mode = checked ? checked.value : 'client';
                const cb = tripEl.querySelector('.clientBlock');
                const wb = tripEl.querySelector('.commuteBlock');
                if (cb) cb.style.display = (mode === 'client') ? '' : 'none';
                if (wb) wb.style.display = (mode === 'commute') ? '' : 'none';
            };
            radios.forEach(r => r.addEventListener('change', update));
            update();
            return true;
        };
        // eerst proberen met index, dan zonder
        if (!attachFor(`mode-${idx}`)) attachFor('mode');
    }

    // Autocomplete
    function attachAutocompleteToInput(inputEl) {
        if (!window.google || !google.maps || !google.maps.places) return;
        const ac = new google.maps.places.Autocomplete(inputEl, {
            fields: ['place_id', 'formatted_address']
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (place && place.place_id) {
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
                    if (!el || el.status !== 'OK') return reject(new Error("Geen route gevonden"));
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

    function showError(m) { err && (err.textContent = m); }
    function clearMsg() { if (err) err.textContent = ''; if (out) out.textContent = ''; }
    function showMsg(m) { if (err) err.textContent = ''; if (out) out.textContent = m; }
});
