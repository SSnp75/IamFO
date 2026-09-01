/**
 * Phase 0 frontend, embedded as string constants so the single Worker can serve
 * it with no filesystem access and no build step. Served by the gateway for
 * non-API GET routes. In a fuller build these would move to Cloudflare Pages.
 */

export const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IamFriendof — Volunteer Network</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <h1>IamFriendof</h1>
    <p class="tagline">A social network for volunteers</p>
    <nav id="nav"></nav>
  </header>

  <main>
    <section id="view-auth">
      <div class="cards">
        <div class="card">
          <h2>Create an account</h2>
          <form id="register-form">
            <label>First name <input name="firstName" required maxlength="50" /></label>
            <label>Last name <input name="lastName" required maxlength="50" /></label>
            <label>Email <input name="email" type="email" required /></label>
            <label>Country <input name="country" required value="United Kingdom" /></label>
            <label>Password <input name="password" type="password" required minlength="8" /></label>
            <label>A skill <input name="skill" value="First Aid" /></label>
            <button type="submit">Register</button>
          </form>
        </div>

        <div class="card">
          <h2>Log in</h2>
          <form id="login-form">
            <label>Email <input name="email" type="email" required /></label>
            <label>Password <input name="password" type="password" required /></label>
            <button type="submit">Log in</button>
          </form>
        </div>
      </div>
    </section>

    <section id="view-app" hidden>
      <div class="cards">
        <div class="card">
          <h2>My profile</h2>
          <div id="profile-box">Loading...</div>
          <form id="purpose-form">
            <label>Purpose statement
              <textarea name="purposeStatement" maxlength="500" rows="3"
                placeholder="Why do you volunteer?"></textarea>
            </label>
            <button type="submit">Save purpose</button>
          </form>
        </div>

        <div class="card">
          <h2>Create an event</h2>
          <form id="event-form">
            <label>Title <input name="title" required maxlength="120" value="Beach Cleanup" /></label>
            <label>Description <input name="description" required value="Help clean the shore" /></label>
            <label>Start <input name="startAt" type="datetime-local" required /></label>
            <label>End <input name="endAt" type="datetime-local" required /></label>
            <label>Interest area id <input name="interestId" type="number" value="1" /></label>
            <button type="submit">Create event</button>
          </form>
        </div>
      </div>

      <div class="card">
        <h2>Upcoming events</h2>
        <button id="refresh-events" type="button">Refresh</button>
        <ul id="events-list"><li>Loading...</li></ul>
      </div>
    </section>
  </main>

  <div id="toast" class="toast" hidden></div>
  <script src="/app.js"></script>
</body>
</html>`;

export const STYLES_CSS = `:root { --bg:#0f172a; --panel:#1e293b; --accent:#38bdf8; --text:#e2e8f0; --muted:#94a3b8; --ok:#22c55e; --err:#ef4444; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--text); }
header { padding:1.5rem 2rem; background:linear-gradient(135deg,#0ea5e9,#1e40af); }
header h1 { margin:0; font-size:1.8rem; }
.tagline { margin:.25rem 0 .75rem; color:#dbeafe; }
nav a { color:#fff; margin-right:1rem; cursor:pointer; text-decoration:underline; }
main { max-width:1000px; margin:2rem auto; padding:0 1rem; }
.cards { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
@media (max-width:720px){ .cards{ grid-template-columns:1fr; } }
.card { background:var(--panel); border:1px solid #334155; border-radius:12px; padding:1.25rem; margin-bottom:1rem; }
.card h2 { margin-top:0; font-size:1.2rem; }
label { display:block; margin:.5rem 0; font-size:.9rem; color:var(--muted); }
input, textarea { width:100%; padding:.5rem; margin-top:.25rem; border-radius:8px; border:1px solid #475569; background:#0b1220; color:var(--text); }
button { background:var(--accent); color:#04263a; border:0; padding:.6rem 1rem; border-radius:8px; font-weight:600; cursor:pointer; margin-top:.5rem; }
button:hover { filter:brightness(1.08); }
ul { list-style:none; padding:0; }
li { padding:.6rem; border-bottom:1px solid #334155; }
.toast { position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%); padding:.75rem 1.25rem; border-radius:8px; color:#fff; }
.toast.ok { background:var(--ok); } .toast.err { background:var(--err); }`;

export const APP_JS = `(() => {
  const api = (path, opts = {}) => {
    const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
    const token = localStorage.getItem('token');
    if (token) headers['authorization'] = 'Bearer ' + token;
    return fetch(path, { ...opts, headers }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body.error && body.error.message) || ('HTTP ' + r.status));
      return body;
    });
  };

  const $ = (sel) => document.querySelector(sel);
  const toast = (msg, ok = true) => {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast ' + (ok ? 'ok' : 'err'); t.hidden = false;
    setTimeout(() => { t.hidden = true; }, 3500);
  };

  const state = { memberId: localStorage.getItem('memberId') || null };

  function render() {
    const loggedIn = !!localStorage.getItem('token');
    $('#view-auth').hidden = loggedIn;
    $('#view-app').hidden = !loggedIn;
    $('#nav').innerHTML = loggedIn ? '<a id="logout">Log out</a>' : '';
    if (loggedIn) {
      $('#logout').onclick = doLogout;
      loadProfile();
      loadEvents();
    }
  }

  async function doLogout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
    localStorage.clear(); state.memberId = null; toast('Logged out'); render();
  }

  $('#register-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/registrations', { method: 'POST', body: JSON.stringify({
        firstName: f.firstName.value, lastName: f.lastName.value, email: f.email.value,
        country: f.country.value, password: f.password.value,
        skills: [{ name: f.skill.value, isCustom: false }],
      })});
      toast('Registered! Check the server log for the verification token, then log in.');
    } catch (err) { toast(err.message, false); }
  };

  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({
        email: f.email.value, password: f.password.value })});
      localStorage.setItem('token', res.accessToken);
      // Decode memberId from the JWT payload (middle segment).
      const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
      localStorage.setItem('memberId', payload.sub); state.memberId = payload.sub;
      toast('Logged in'); render();
    } catch (err) { toast(err.message, false); }
  };

  async function loadProfile() {
    try {
      const p = await api('/members/' + state.memberId + '/profile');
      $('#profile-box').innerHTML =
        '<strong>' + (p.firstName || '') + ' ' + (p.lastName || '') + '</strong>' +
        '<br/>Private: ' + p.isPrivate +
        (p.purposeStatement ? '<br/>Purpose: ' + p.purposeStatement : '') +
        (p.skills ? '<br/>Skills: ' + p.skills.join(', ') : '');
    } catch (err) { $('#profile-box').textContent = err.message; }
  }

  $('#purpose-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/members/' + state.memberId + '/profile', { method: 'PUT',
        body: JSON.stringify({ purposeStatement: e.target.purposeStatement.value })});
      toast('Purpose saved'); loadProfile();
    } catch (err) { toast(err.message, false); }
  };

  $('#event-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/events', { method: 'POST', body: JSON.stringify({
        title: f.title.value, description: f.description.value,
        startAt: new Date(f.startAt.value).toISOString(),
        endAt: new Date(f.endAt.value).toISOString(),
        interestIds: [Number(f.interestId.value)],
      })});
      toast('Event created'); loadEvents();
    } catch (err) { toast(err.message, false); }
  };

  $('#refresh-events').onclick = loadEvents;

  async function loadEvents() {
    try {
      const res = await api('/search/events?q=cleanup');
      const list = $('#events-list');
      const rows = res.results || [];
      list.innerHTML = rows.length
        ? rows.map((ev) => '<li>' + (ev.title || ev.event_id) + '</li>').join('')
        : '<li>No events found (try creating one).</li>';
    } catch (err) { $('#events-list').innerHTML = '<li>' + err.message + '</li>'; }
  }

  render();
})();`;
