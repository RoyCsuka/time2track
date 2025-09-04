window.addEventListener('load', () => {
    // ===== DEBUG SWITCH =====
    const DEBUG = true;
    const dbg = (...args) => { if (DEBUG) console.log('[T2T]', ...args); };
    const grp = (label, fn) => { if (!DEBUG) return fn(); console.group(label); try { fn(); } finally { console.groupEnd(); } };
    const warn = (...args) => { if (DEBUG) console.warn('[T2T]', ...args); };

    const err = document.querySelector('#err');
    const out = document.querySelector('#out');

    // Vervang dit door jouw Vercel proxy URL
    const SHEETS_WEBAPP_URL = "https://time2track.vercel.app/api/proxy";

    // ===== Global error hooks =====
    window.addEventListener('error', (e) => { warn('window.onerror', e.message, e.filename, e.lineno, e.error); });
    window.addEventListener('unhandledrejection', (e) => { warn('unhandledrejection', e.reason); });

    // ===== Helpers: veilige pickers met fallbacks =====
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

    // ===== Init datum =====
    const dateInput = document.querySelector('#date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().slice(0, 10);
        dbg('Init date set:', dateInput.value);
    } else {
        warn('#date niet gevonden');
    }

    // ===== Instellingen opslaan/laden =====
    const saveBtn = document.querySelector('#saveSettings');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const settings = {
                home: (document.querySelector('#home') || {}).value || '',
                office1: (document.querySelector('#office1') || {}).value || '',
                office2: (document.querySelector('#office2') || {}).value || ''
            };
            localStorage.setItem('rit.settings', JSON.stringify(settings));
            grp('Instellingen opgeslagen', () => dbg(settings));
            showMsg("Instellingen opgeslagen");
        });
    }

    try {
        const saved = JSON.parse(localStorage.getItem('rit.settings'));
        grp('Instellingen laden', () => {
            dbg('raw localStorage', saved);
            if (saved) {
                if (saved.home && document.querySelector('#home')) document.querySelector('#home').value = saved.home;
                if (saved.office1 && document.querySelector('#office1')) document.querySelector('#office1').value = saved.office1;
                if (saved.office2 && document.querySelector('#office2')) document.querySelector('#office2').value = saved.office2;
            }
        });
    } catch (e) {
        warn('Instellingen parse fout', e);
    }

    // Autocomplete voor instellingen
    ['#home', '#office1', '#office2'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) attachAutocompleteToInput(el, `settings:${sel}`);
    });

    // ===== Eerste trip listeners + autocomplete =====
    const firstTrip = document.querySelector('#tripsContainer .trip');
    if (firstTrip) {
        attachModeListeners(firstTrip, 0);
        attachAutocompleteToTrip(firstTrip);
    } else {
        warn('Geen eerste .trip gevonden');
    }

    // ===== Rit toevoegen (let op: index op basis van aantal .trip secties) =====
    const addBtn = document.querySelector('#addTrip');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const container = document.querySelector('#tripsContainer');
            const addBtnRef = document.querySelector('#addTrip');
            if (!container) return warn('#tripsContainer niet gevonden');
            const index = container.querySelectorAll('.trip').length; // cruciaal: telt niet de knop mee
            const template = container.querySelector('.trip');
            if (!template) return warn('Geen .trip template');

            grp(`Rit klonen -> index ${index}`, () => {
                const clone = template.cloneNode(true);

                // ids/names aanpassen waar ze -0 bevatten
                clone.querySelectorAll('[id]').forEach(el => {
                    if (el.id.includes('-0')) {
                        const newId = el.id.replace('-0', '-' + index);
                        dbg('id:', el.id, '=>', newId);
                        el.id = newId;
                    } else {
                        dbg('id blijft:', el.id);
                    }
                });
                clone.querySelectorAll('[name]').forEach(el => {
                    if (el.name.includes('-0')) {
                        const newName = el.name.replace('-0', '-' + index);
                        dbg('name:', el.name, '=>', newName);
                        el.name = newName;
                    } else {
                        dbg('name blijft:', el.name);
                    }
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
                    r.checked = ridx === 0; // standaard "Naar klant"
                });

                // clientBlock tonen, commuteBlock verbergen
                const cb = clone.querySelector('.clientBlock');
                const wb = clone.querySelector('.commuteBlock');
                if (cb) cb.style.display = '';
                if (wb) wb.style.display = 'none';

                // Insert vóór de knop
                container.insertBefore(clone, addBtnRef);

                // listeners + autocomplete koppelen
                attachModeListeners(clone, index);
                attachAutocompleteToTrip(clone);

                dbg('Nieuwe trip toegevoegd met index', index);
            });
        });
    }

    // ===== Opslaan alle ritten =====
    const calcBtn = document.querySelector('#calc');
    if (calcBtn) {
        calcBtn.addEventListener('click', async () => {
            clearMsg();
            grp('Submit batch start', async () => {
                try {
                    const date = (document.querySelector('#date') || {}).value || '';
                    const clientName = (document.querySelector('#client') || {}).value?.trim?.() || '';
                    const hoursGlobal = parseFloat((document.querySelector('#hours') || {}).value || '0');
                    const breakMinGlobal = parseInt((document.querySelector('#breakMin') || {}).value || '0', 10);

                    dbg('Globals', { date, clientName, hoursGlobal, breakMinGlobal });

                    const tripsEls = document.querySelectorAll('#tripsContainer .trip');
                    if (!tripsEls.length) throw new Error("Geen ritten ingevoerd");

                    let saved = 0;

                    for (let idx = 0; idx < tripsEls.length; idx++) {
                        const tripEl = tripsEls[idx];

                        // mode-radio: probeer name="mode-<idx>", val anders terug op name="mode"
                        const modeRadio = pickCheckedRadio(tripEl, [`mode-${idx}`, 'mode'], 'mode');
                        const mode = modeRadio.value;
                        dbg(`Trip ${idx} mode:`, mode);

                        // Alleen op de eerste rij meesturen; anders leeg/null
                        const includeGlobals = (idx === 0);
                        const hours = includeGlobals ? hoursGlobal : null;
                        const breakMin = includeGlobals ? breakMinGlobal : null;
                        const clientForRow = includeGlobals ? clientName : null;

                        let record;

                        if (mode === 'client') {
                            const startEl = pick(tripEl, [`#start-${idx}`, '#start'], 'start');
                            const endEl   = pick(tripEl, [`#end-${idx}`, '#end'], 'end');
                            const retourEl = pick(tripEl, [`#roundtrip-${idx}`, '#clientRoundtrip'], 'retour (klant)');
                            const retour = !!retourEl.checked;

                            const start = startEl.dataset.address || startEl.value;
                            const end   = endEl.dataset.address || endEl.value;
                            if (!start || !end) throw new Error(`Vul begin en eind in (rit ${idx + 1})`);

                            grp(`Trip ${idx} afstand berekenen (klant)`, async () => {
                                dbg('Start/End', { start, end, retour });
                                const leg1 = await distanceMatrix({ query: start }, { query: end });
                                let meters = leg1.distance.value;
                                let seconds = leg1.duration.value;

                                dbg('Leg1', leg1, 'meters', meters, 'seconds', seconds);
                                if (retour) {
                                    meters *= 2;
                                    seconds *= 2;
                                    dbg('Retour verdubbeld => meters', meters, 'seconds', seconds);
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
                            });

                        } else {
                            const routeEl = pick(tripEl, [`#commuteRoute-${idx}`, '#commuteRoute'], 'commute route');
                            const retourEl = pick(tripEl, [`#commuteReverse-${idx}`, '#commuteReverse'], 'retour (woon-werk)');
                            const retour = !!retourEl.checked;

                            const homeEl = document.querySelector('#home');
                            const office1El = document.querySelector('#office1');
                            const office2El = document.querySelector('#office2');

                            const home = (homeEl?.dataset.address) || (homeEl?.value) || '';
                            const office1 = (office1El?.dataset.address) || (office1El?.value) || '';
                            const office2 = (office2El?.dataset.address) || (office2El?.value) || '';

                            const routeVal = routeEl.value || 'home-office1';
                            let from = home;
                            let to   = routeVal.endsWith('1') ? office1 : office2;

                            if (!from || !to) throw new Error("Thuis/kantoren niet correct ingevuld");

                            grp(`Trip ${idx} afstand berekenen (woon-werk)`, async () => {
                                dbg('Route', { routeVal, from, to, retour });
                                const leg = await distanceMatrix({ query: from }, { query: to });

                                let meters = leg.distance.value;
                                let seconds = leg.duration.value;

                                dbg('Leg', leg, 'meters', meters, 'seconds', seconds);
                                if (retour) {
                                    meters *= 2;
                                    seconds *= 2;
                                    dbg('Retour verdubbeld => meters', meters, 'seconds', seconds);
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
                            });
                        }

                        // Wacht tot record is opgebouwd (groepjes zijn sync gelopen)
                        if (!record) throw new Error(`Record niet opgebouwd (rit ${idx + 1})`);

                        grp(`Trip ${idx} → payload`, () => dbg(record));

                        // Verstuur
                        const res = await saveRecord(record);
                        dbg(`Trip ${idx} opgeslagen`, res);
                        saved++;
                    }

                    showMsg(`✔️ ${saved} ritten opgeslagen in Google Sheet`);
                } catch (e) {
                    showError(e.message);
                    warn('Submit error', e);
                }
            });
        });
    }

    // ===== Mode toggle per trip =====
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
                dbg(`Mode switch (${name}):`, mode);
            };
            radios.forEach(r => r.addEventListener('change', update));
            update();
            return true;
        };
        if (!attachFor(`mode-${idx}`)) attachFor('mode');
    }

    // ===== Autocomplete =====
    function attachAutocompleteToInput(inputEl, tag = 'trip') {
        if (!window.google || !google.maps || !google.maps.places) {
            warn('Google Maps Places niet geladen voor', tag, inputEl?.id);
            return;
        }
        const ac = new google.maps.places.Autocomplete(inputEl, {
            fields: ['place_id', 'formatted_address']
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (place && place.place_id) {
                inputEl.dataset.placeId = place.place_id;
                inputEl.dataset.address = place.formatted_address;
                dbg('Autocomplete gekozen', { tag, id: inputEl.id, place_id: place.place_id, address: place.formatted_address });
            } else {
                warn('Autocomplete place zonder place_id', { tag, id: inputEl.id, place });
            }
        });
    }
    function attachAutocompleteToTrip(tripEl) {
        tripEl.querySelectorAll('input[type="text"]').forEach(input => {
            attachAutocompleteToInput(input, `trip:${input.id}`);
        });
    }

    // ===== Distance Matrix =====
    function distanceMatrix(origin, destination) {
        return new Promise((resolve, reject) => {
            try {
                const svc = new google.maps.DistanceMatrixService();
                svc.getDistanceMatrix(
                    {
                        origins: [origin],
                        destinations: [destination],
                        travelMode: 'DRIVING',
                        unitSystem: google.maps.UnitSystem.METRIC
                    },
                    (r, s) => {
                        if (s !== 'OK') {
                            warn('DistanceMatrix status ≠ OK', s, r);
                            return reject(new Error(s));
                        }
                        const el = r?.rows?.[0]?.elements?.[0];
                        if (!el || el.status !== 'OK') {
                            warn('DistanceMatrix element status ≠ OK', el);
                            return reject(new Error("Geen route gevonden"));
                        }
                        resolve({ distance: el.distance, duration: el.duration });
                    }
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    // ===== POST record naar proxy (met logging) =====
    async function saveRecord(record) {
        grp('fetch → proxy', () => dbg('URL', SHEETS_WEBAPP_URL, 'BODY', record));
        const res = await fetch(SHEETS_WEBAPP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
        });
        const text = await res.text();
        grp('proxy response', () => dbg('status', res.status, 'text', text));
        if (!res.ok) throw new Error("Proxy error " + res.status + ' ' + text);
        // probeer JSON te parsen, zoniet geef tekst terug
        try { return JSON.parse(text); } catch { return { raw: text }; }
    }

    // ===== UI Helpers =====
    function showError(m) { if (err) err.textContent = m; }
    function clearMsg() { if (err) err.textContent = ''; if (out) out.textContent = ''; }
    function showMsg(m) { if (err) err.textContent = ''; if (out) out.textContent = m; }
});