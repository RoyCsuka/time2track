window.addEventListener('load', () => {
    const qs = (sel) => document.querySelector(sel);
    const err = qs('#err'), out = qs('#out');
    const state = { places: {}, lastResult: null };

    // Datum standaard vandaag
    qs('#date').value = new Date().toISOString().slice(0,10);

    // Toggle client/commute
    document.querySelectorAll('input[name="mode"]').forEach(r =>
        r.addEventListener('change', () => {
            const mode = getMode();
            qs('#clientBlock').style.display = mode === 'client' ? '' : 'none';
            qs('#commuteBlock').style.display = mode === 'commute' ? '' : 'none';
        })
    );
    const getMode = () => document.querySelector('input[name="mode"]:checked').value;

    // Autocomplete init
    function attachAutocomplete(id,key){
        const ac = new google.maps.places.Autocomplete(qs(id), { fields:['place_id','formatted_address','geometry'] });
        ac.addListener('place_changed', ()=> {
            const place = ac.getPlace();
            if(place.place_id) state.places[key]=place;
        });
    }
    attachAutocomplete('#start','start');
    attachAutocomplete('#end','end');
    attachAutocomplete('#home','home');
    attachAutocomplete('#office1','office1');
    attachAutocomplete('#office2','office2');

    // Save settings
    qs('#saveSettings').addEventListener('click',()=>{
        localStorage.setItem('rit.settings',JSON.stringify(state.places));
        showMsg('Instellingen opgeslagen');
    });
    try {
        const saved = JSON.parse(localStorage.getItem('rit.settings'));
        if(saved) { state.places={...saved}; ['home','office1','office2'].forEach(k=>{ if(saved[k]) qs( '#'+k ).value=saved[k].formatted_address; }); }
    } catch{}

    // Bereken knop
    qs('#calc').addEventListener('click', async ()=>{
        clearMsg();
        try{
            const payload=await buildPayload();
            const dm=await distanceMatrix(payload.origin,payload.destination);
            const km=(dm.distance.value/1000).toFixed(2);
            const mins=Math.round(dm.duration.value/60);
            state.lastResult={...payload,km,mins};
            renderResult(state.lastResult);
        }catch(e){showError(e.message);}
    });

    qs('#downloadCsv').addEventListener('click',()=>{
        if(!state.lastResult) return showError('Eerst berekenen.');
        const r=state.lastResult;
        const csv=`datum,soort,van,naar,km,minuten,uren,pauze\nqs{r.date},qs{r.travelType},qs{r.origin_text},qs{r.destination_text},qs{r.km},qs{r.mins},qs{r.hours},qs{r.breakMin}`;
        const blob=new Blob([csv],{type:'text/csv'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=`rit_qs{r.date}.csv`;a.click();
    });

    async function buildPayload(){
        const date=qs('#date').value;
        const hours=parseFloat(qs('#hours').value||'0');
        const breakMin=parseInt(qs('#breakMin').value||'0',10);
        const mode=getMode();
        if(mode==='client'){
            if(!state.places.start||!state.places.end) throw new Error('Kies begin en eind');
            return {travelType:'klant',origin:{placeId:state.places.start.place_id},destination:{placeId:state.places.end.place_id},
                origin_text:state.places.start.formatted_address,destination_text:state.places.end.formatted_address,date,hours,breakMin};
        }else{
            const route=qs('#commuteRoute').value;
            const reverse=qs('#commuteReverse').value==='yes';
            let from=state.places.home,to=route.endsWith('1')?state.places.office1:state.places.office2;
            if(reverse)[from,to]=[to,from];
            if(!from||!to) throw new Error('Sla thuis/kantoren op');
            return {travelType:'woonwerk',origin:{placeId:from.place_id},destination:{placeId:to.place_id},
                origin_text:from.formatted_address,destination_text:to.formatted_address,date,hours,breakMin};
        }
    }

    function distanceMatrix(origin,destination){
        return new Promise((res,rej)=>{
            const svc=new google.maps.DistanceMatrixService();
            svc.getDistanceMatrix({origins:[origin],destinations:[destination],travelMode:'DRIVING',unitSystem:google.maps.UnitSystem.METRIC},
                (r,s)=>{ if(s!=='OK') return rej(new Error(s)); const el=r.rows[0].elements[0]; if(el.status!=='OK') return rej(new Error('Geen route')); res({distance:el.distance,duration:el.duration}); });
        });
    }

    function renderResult(r){
        out.innerHTML=`<div class="result">Afstand: qs{r.km} km • Reistijd: qs{r.mins} min</div>
    <div class="muted">Van: qs{r.origin_text}<br>Naar: qs{r.destination_text}</div>`;
    }
    function showError(m){err.textContent=m;}
    function clearMsg(){err.textContent='';out.innerHTML='';}
    function showMsg(m){out.innerHTML=m;}
});