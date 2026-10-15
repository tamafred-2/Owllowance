const owl = document.getElementById('owl');
const scene = document.getElementById('scene');
const status = document.getElementById('status');
const mode = document.getElementById('mode');
const still = document.getElementById('reduce');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let currentMode = 'day', active = null, timer = null, serial = 0, visible = true;
const durations = { 'day-tap': 2200, 'night-tap': 1500, income: 1700, expense: 1400 };
function resolvedMode() { return mode.value === 'auto' ? (new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'day' : 'night') : mode.value; }
function staticMode() { return still.checked || reduced.matches || document.hidden || !visible; }
function idle() {
  clearTimeout(timer); timer = null; serial++; active = null; owl.onload = null; owl.onerror = null;
  const asset = currentMode === 'day' ? 'day-sleep.png' : staticMode() ? 'night-awake.png' : 'night-idle.gif';
  if (!owl.src.endsWith(asset)) owl.src = '../../mascot/' + asset;
  document.getElementById('tap').setAttribute('aria-label', currentMode === 'day' ? 'Gently wake the sleeping owl' : 'Greet the awake owl');
  status.textContent = currentMode === 'day' ? 'Sleeping. Tap the owl gently.' : 'Awake and attentive. Tap to say hello.';
}
function updateMode() {
  const next = resolvedMode();
  if (next === currentMode) return;
  currentMode = next; scene.classList.toggle('night', next === 'night');
  const forest = document.getElementById('forest'); forest.src = '../../backgrounds/forest/' + (next === 'day' ? 'morning' : 'night') + '.png';
  forest.alt = 'Illustrated forest at ' + (next === 'day' ? 'daytime' : 'night'); idle();
}
function play(type) {
  if (document.hidden || !visible) return;
  const tap = type === 'tap';
  if (tap && active) return;
  const key = tap ? currentMode + '-tap' : type;
  if (!Object.prototype.hasOwnProperty.call(durations, key)) return;
  clearTimeout(timer); const token = ++serial; active = key;
  const file = staticMode() ? key + '-poster.png' : key + '.gif';
  owl.onload = () => {
    if (token !== serial) return;
    timer = setTimeout(() => { if (token === serial) idle(); }, staticMode() ? 1100 : durations[key]);
  };
  owl.onerror = () => { if (token === serial) { idle(); status.textContent = 'Reaction unavailable. Showing the idle owl.'; } };
  owl.src = '../../mascot/' + file + '?play=' + token;
  status.textContent = key === 'day-tap' ? 'Just one sleepy eye… then back to rest.' : key === 'night-tap' ? 'A curious look and a friendly wink.' : key === 'income' ? 'Money-added acknowledgment preview.' : 'Expense-saved acknowledgment preview.';
}
document.getElementById('tap').addEventListener('click', () => play('tap'));
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => play(button.dataset.action)));
mode.addEventListener('change', () => { updateMode(); idle(); });
still.addEventListener('change', idle); reduced.addEventListener('change', idle);
document.addEventListener('visibilitychange', () => { updateMode(); idle(); });
if ('IntersectionObserver' in window) new IntersectionObserver(entries => { const next = entries[0].isIntersecting; if (next !== visible) { visible = next; idle(); } }).observe(scene);
setInterval(() => { if (!document.hidden) updateMode(); }, 30000);
// Application integration contract: dispatch only AFTER a persisted income/expense commits.
// Pass no amounts, wallet names or private transaction contents to this animation layer.
document.addEventListener('owllowance:transaction-committed', event => {
  if (event.detail?.type === 'income' || event.detail?.type === 'expense') play(event.detail.type);
});
idle(); updateMode();
