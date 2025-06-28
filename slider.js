window.addEventListener('load', () => { // 'load' attend tout, y compris images
  const track = document.getElementById('carousel-track');

  const images = Array.from(track.children);
  images.forEach(img => {
    const clone = img.cloneNode(true);
    track.appendChild(clone);
  });

  const scrollWidth = track.scrollWidth / 2;
  let currentScroll = 0;
  const speed = 1;

  function animate() {
    currentScroll += speed;
    if (currentScroll >= scrollWidth) {
      currentScroll = 0;
    }
    track.scrollLeft = currentScroll;
    requestAnimationFrame(animate);
  }

  animate();
});
