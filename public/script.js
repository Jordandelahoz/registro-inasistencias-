async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  if (!res.ok) {
    let msg = 'Error';
    try { const data = await res.json(); msg = data.error || JSON.stringify(data); } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// Elementos
const authSection = document.getElementById('authSection');
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');
const topbar = document.getElementById('topbar');
const userInfo = document.getElementById('userInfo');
const logoutBtn = document.getElementById('logoutBtn');

const alumnoView = document.getElementById('alumnoView');
const profeView = document.getElementById('profeView');

// Alumno form
const form = document.getElementById('inasistenciaForm');
const tablaMias = document.querySelector('#tablaMias tbody');

// Profe tabla
const tabla = document.querySelector('#tablaInasistencias tbody');
const btnEliminarTodo = document.getElementById('eliminarTodo');

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

async function cargarSesion() {
  const { user } = await api('/api/auth/me');
  if (user) {
    userInfo.textContent = `${user.nombre || ''} (${user.email}) – Rol: ${user.role}`;
    show(topbar);
    hide(authSection);
    if (user.role === 'alumno') {
      show(alumnoView);
      hide(profeView);
      await cargarMias();
    } else {
      show(profeView);
      hide(alumnoView);
      await cargarTodas();
    }
  } else {
    hide(topbar); show(authSection); hide(alumnoView); hide(profeView);
  }
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMsg.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    await cargarSesion();
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

logoutBtn?.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

// ===== ALUMNO =====
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const alumno_nombre = document.getElementById('nombre').value.trim();
  const grado = document.getElementById('grado').value.trim();
  const fecha = document.getElementById('fecha').value;
  const motivo = document.getElementById('motivo').value;
  const observacion = document.getElementById('observacion').value.trim();
  if (!alumno_nombre || !grado || !fecha || !observacion) {
    alert('Por favor completa todos los campos.');
    return;
  }
  try {
    await api('/api/inasistencias', { method: 'POST', body: JSON.stringify({ alumno_nombre, grado, fecha, motivo, observacion }) });
    form.reset();
    await cargarMias();
  } catch (err) { alert(err.message); }
});

async function cargarMias() {
  tablaMias.innerHTML = '';
  try {
    const data = await api('/api/inasistencias/mias');
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.alumno_nombre}</td>
        <td>${r.grado}</td>
        <td>${r.fecha}</td>
        <td>${r.motivo}</td>
        <td>${r.observacion}</td>
        <td>${new Date(r.created_at).toLocaleString()}</td>
      `;
      tablaMias.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// ===== PROFESOR =====
async function cargarTodas() {
  tabla.innerHTML = '';
  try {
    const data = await api('/api/inasistencias');
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${r.alumno_nombre}</td>
        <td>${r.grado}</td>
        <td>${r.fecha}</td>
        <td>${r.motivo}</td>
        <td>${r.observacion}</td>
        <td>${r.creado_por}</td>
        <td>${new Date(r.created_at).toLocaleString()}</td>
        <td><button class="eliminar-btn" data-id="${r.id}">Eliminar</button></td>
      `;
      tabla.appendChild(tr);
    });

    // eventos eliminar
    tabla.querySelectorAll('.eliminar-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm('¿Eliminar este registro?')) {
          await api(`/api/inasistencias/${id}`, { method: 'DELETE' });
          await cargarTodas();
        }
      });
    });
  } catch (err) {
    console.error(err);
  }
}

btnEliminarTodo?.addEventListener('click', async () => {
  if (confirm('¿Seguro que quieres eliminar TODAS las inasistencias?')) {
    await api('/api/inasistencias', { method: 'DELETE' });
    await cargarTodas();
  }
});

// Al cargar la página, revisar si hay sesión
cargarSesion();
