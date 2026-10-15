const logo=document.getElementById('logo');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let ready=false,timer=null,phase='wake',generation=0;
function staticMode(){return reduced.matches||document.getElementById('still').checked||document.hidden}
function render(){
 document.body.classList.toggle('static',staticMode());
 if(ready)return;
 const file=staticMode()?'logo-awake.png':phase==='wake'?'opening.gif':'loading-loop.gif';
 logo.src='../../motion/'+file+'?run='+generation;
 document.getElementById('status').textContent=phase==='wake'?'Opening preview…':'Waiting for demo readiness…';
}
function start(){
 clearTimeout(timer);ready=false;phase='wake';generation++;
 document.getElementById('startup').hidden=false;document.getElementById('complete').hidden=true;
 const token=generation;
 logo.onload=()=>{if(token!==generation||ready||phase!=='wake')return;clearTimeout(timer);timer=setTimeout(()=>{if(token!==generation||ready)return;phase='wait';logo.onload=null;render()},800)};
 logo.onerror=()=>{if(ready)return;clearTimeout(timer);logo.onload=null;logo.onerror=null;logo.src='../../motion/logo-awake.png';document.getElementById('status').textContent='Animation unavailable. Static preview.'};
 render();
}
function finish(){ready=true;generation++;clearTimeout(timer);logo.onload=null;logo.src='../../motion/logo-awake.png';document.getElementById('startup').hidden=true;document.getElementById('complete').hidden=false}
document.getElementById('replay').addEventListener('click',start);
document.getElementById('again').addEventListener('click',start);
document.getElementById('ready').addEventListener('click',finish);
document.getElementById('still').addEventListener('change',render);
reduced.addEventListener('change',render);
document.addEventListener('visibilitychange',render);
// Call finish() from actual application readiness in an integration, not from an artificial delay.
start();
