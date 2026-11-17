const pageNames = {
  home: 'Home', inbox: 'Inbox', projects: 'Projects', documents: 'Documents',
  databases: 'Databases', calendar: 'Calendar', intelligence: 'AVEN Intelligence', settings: 'Settings'
};

const navItems = [...document.querySelectorAll('[data-page]')];
const breadcrumb = document.querySelector('#breadcrumb-page');
const greeting = document.querySelector('#greeting');
const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  if (!message) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function navigate(page) {
  if (!pageNames[page]) return;
  document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.page === page);
  });
  breadcrumb.textContent = pageNames[page];
  if (page === 'home') {
    greeting.textContent = `${getGreeting()}.`;
  } else {
    greeting.textContent = pageNames[page];
    showToast(`${pageNames[page]} will be built in its own section.`);
  }
  history.replaceState(null, '', `#${page}`);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatToday(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

const now = new Date();
document.querySelector('#today-label').textContent = formatToday(now);
document.querySelector('#welcome-date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase();
greeting.textContent = `${getGreeting()}.`;

navItems.forEach((item) => item.addEventListener('click', () => navigate(item.dataset.page)));
document.querySelectorAll('[data-toast]').forEach((item) => item.addEventListener('click', () => showToast(item.dataset.toast)));

const workspaceButton = document.querySelector('#workspace-button');
const workspaceMenu = document.querySelector('#workspace-menu');
workspaceButton.addEventListener('click', () => {
  const isOpen = workspaceButton.getAttribute('aria-expanded') === 'true';
  workspaceButton.setAttribute('aria-expanded', String(!isOpen));
  workspaceMenu.hidden = isOpen;
});

document.addEventListener('click', (event) => {
  if (!workspaceMenu.hidden && !workspaceMenu.contains(event.target) && !workspaceButton.contains(event.target)) {
    workspaceMenu.hidden = true;
    workspaceButton.setAttribute('aria-expanded', 'false');
  }
});

const quickDialog = document.querySelector('#quick-dialog');
document.querySelector('#quick-add').addEventListener('click', () => quickDialog.showModal());
quickDialog.querySelectorAll('[data-toast]').forEach((option) => option.addEventListener('click', () => showToast(option.dataset.toast)));

const initialPage = location.hash.slice(1);
if (pageNames[initialPage] && initialPage !== 'home') {
  document.querySelectorAll('.nav-item[data-page]').forEach((item) => item.classList.toggle('is-active', item.dataset.page === initialPage));
  breadcrumb.textContent = pageNames[initialPage];
  greeting.textContent = pageNames[initialPage];
}
