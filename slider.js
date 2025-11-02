document.addEventListener('DOMContentLoaded', function() {
  const darkModeToggle = document.querySelector('.dark-mode-toggle');
  const body = document.body;
  const icon = darkModeToggle.querySelector('.icon');
  const text = darkModeToggle.querySelector('.text');

  // Vérifie si le mode sombre est activé dans le localStorage
  if (localStorage.getItem('darkMode') === 'enabled') {
    body.classList.add('dark-mode');
    icon.textContent = '☀️';
    text.textContent = 'Mode jour';
  }

  // Écouteur d'événement pour le bouton
  darkModeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');

    if (body.classList.contains('dark-mode')) {
      icon.textContent = '☀️';
      text.textContent = 'Mode jour';
      localStorage.setItem('darkMode', 'enabled');
    } else {
      icon.textContent = '🌙';
      text.textContent = 'Mode nuit';
      localStorage.setItem('darkMode', 'disabled');
    }
  });
});